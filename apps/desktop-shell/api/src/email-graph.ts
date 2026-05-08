import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { classifyEmailContent, detectAttachmentType } from "./email-detection.js";
import { getAttachmentById, getStoredEmail, linkStoredEmail, updateAttachmentDownloadState, upsertSyncedMessages } from "./email-db.js";
import type { GraphMessageInput, StoredEmailMessage } from "./email-types.js";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const LOGIN_BASE_URL = "https://login.microsoftonline.com";
const GRAPH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "User.Read",
  "Mail.Read",
  "Mail.ReadWrite"
];

export function getGraphConfig() {
  return {
    clientId: process.env.MICROSOFT_CLIENT_ID?.trim() ?? "",
    tenantId: process.env.MICROSOFT_TENANT_ID?.trim() ?? "common",
    scopes: GRAPH_SCOPES
  };
}

function requireGraphConfig() {
  const config = getGraphConfig();
  if (!config.clientId) {
    throw new Error("MICROSOFT_CLIENT_ID is not configured");
  }
  return config;
}

async function postForm(url: string, values: Record<string, string>) {
  const body = new URLSearchParams(values);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const errorMessage =
      (typeof data?.error_description === "string" && data.error_description) ||
      (typeof data?.error === "string" && data.error) ||
      `Graph OAuth request failed (${response.status})`;
    throw new Error(errorMessage);
  }
  return data ?? {};
}

async function graphGet<T>(accessToken: string, url: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  const data = (await response.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!response.ok) {
    const details = (data as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(details || `Graph request failed (${response.status})`);
  }
  return data as T;
}

function extractTextFromHtml(html?: string | null) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFolderUrl(folder: string, top: number) {
  if (folder === "sent" || folder === "sentitems") {
    return `${GRAPH_BASE_URL}/me/mailFolders/sentitems/messages?$top=${top}&$orderby=receivedDateTime desc&$expand=attachments`;
  }
  if (folder === "drafts") {
    return `${GRAPH_BASE_URL}/me/mailFolders/drafts/messages?$top=${top}&$orderby=receivedDateTime desc&$expand=attachments`;
  }
  return `${GRAPH_BASE_URL}/me/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$expand=attachments`;
}

export async function startGraphDeviceCodeFlow() {
  const config = requireGraphConfig();
  const url = `${LOGIN_BASE_URL}/${config.tenantId}/oauth2/v2.0/devicecode`;
  const data = await postForm(url, {
    client_id: config.clientId,
    scope: config.scopes.join(" ")
  });
  return {
    deviceCode: String(data.device_code ?? ""),
    userCode: String(data.user_code ?? ""),
    verificationUri: String(data.verification_uri ?? ""),
    expiresIn: Number(data.expires_in ?? 0),
    interval: Number(data.interval ?? 5),
    message: String(data.message ?? "")
  };
}

export async function pollGraphDeviceCode(deviceCode: string) {
  const config = requireGraphConfig();
  const url = `${LOGIN_BASE_URL}/${config.tenantId}/oauth2/v2.0/token`;
  return await postForm(url, {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: config.clientId,
    device_code: deviceCode
  });
}

export async function refreshGraphAccessToken(refreshToken: string) {
  const config = requireGraphConfig();
  const url = `${LOGIN_BASE_URL}/${config.tenantId}/oauth2/v2.0/token`;
  return await postForm(url, {
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: refreshToken,
    scope: config.scopes.join(" ")
  });
}

export async function listGraphFolders(accessToken: string) {
  const result = await graphGet<{ value: Array<{ id: string; displayName: string; totalItemCount?: number; unreadItemCount?: number }> }>(
    accessToken,
    `${GRAPH_BASE_URL}/me/mailFolders?$top=50`
  );
  const defaults = [
    { id: "inbox", displayName: "Inbox", totalItemCount: 0, unreadItemCount: 0 },
    { id: "sentitems", displayName: "Sent", totalItemCount: 0, unreadItemCount: 0 },
    { id: "drafts", displayName: "Drafts", totalItemCount: 0, unreadItemCount: 0 }
  ];
  const merged = new Map<string, { id: string; displayName: string; totalItemCount?: number; unreadItemCount?: number }>();
  for (const folder of defaults) merged.set(folder.id.toLowerCase(), folder);
  for (const folder of result.value ?? []) merged.set(folder.id.toLowerCase(), folder);
  return Array.from(merged.values());
}

function mapGraphMessageToStoredInput(message: Record<string, unknown>, folder: string, knownCustomer: boolean): GraphMessageInput {
  const subject = String(message.subject ?? "").trim();
  const fromEmail = String((message.from as { emailAddress?: { address?: string } } | undefined)?.emailAddress?.address ?? "").trim();
  const fromName = String((message.from as { emailAddress?: { name?: string } } | undefined)?.emailAddress?.name ?? fromEmail).trim();
  const bodyPreview = String(message.bodyPreview ?? "").trim();
  const bodyHtml = String((message.body as { content?: string } | undefined)?.content ?? "");
  const bodyText = extractTextFromHtml(bodyHtml) || bodyPreview;
  const attachmentsRaw = Array.isArray(message.attachments) ? message.attachments : [];
  const attachments = attachmentsRaw.map((entry) => {
    const attachment = entry as Record<string, unknown>;
    const fileName = String(attachment.name ?? "attachment").trim();
    const contentType = String(attachment.contentType ?? "application/octet-stream").trim();
    return {
      graphAttachmentId: String(attachment.id ?? `${fileName}-${attachment.size ?? 0}`),
      fileName,
      contentType,
      sizeBytes: Number(attachment.size ?? 0),
      attachmentType: detectAttachmentType(fileName, contentType)
    };
  });
  const detection = classifyEmailContent({
    subject,
    bodyText,
    senderEmail: fromEmail,
    knownCustomer,
    attachmentNames: attachments.map((entry) => entry.fileName),
    attachmentTypes: attachments.map((entry) => entry.attachmentType)
  });
  return {
    graphMessageId: String(message.id ?? ""),
    folder,
    subject,
    senderName: fromName,
    senderEmail: fromEmail,
    receivedAt: String(message.receivedDateTime ?? message.sentDateTime ?? new Date().toISOString()),
    sentAt: message.sentDateTime ? String(message.sentDateTime) : null,
    bodyPreview,
    bodyHtml,
    bodyText,
    hasAttachments: Boolean(message.hasAttachments),
    isRead: Boolean(message.isRead),
    importance: message.importance ? String(message.importance) : null,
    detection,
    attachments
  };
}

export async function syncGraphMessagesForWorkspace(input: {
  db: DatabaseSync;
  workspaceId: string;
  accessToken: string;
  folder: string;
  knownCustomerEmails?: string[];
  top?: number;
}) {
  const folder = input.folder.toLowerCase();
  const top = Math.max(10, Math.min(200, input.top ?? 50));
  const knownCustomers = new Set((input.knownCustomerEmails ?? []).map((email) => email.trim().toLowerCase()));
  const result = await graphGet<{ value: Array<Record<string, unknown>> }>(input.accessToken, buildFolderUrl(folder, top));
  const mapped = (result.value ?? []).map((message) =>
    mapGraphMessageToStoredInput(
      message,
      folder === "sentitems" ? "sent" : folder,
      knownCustomers.has(String((message.from as { emailAddress?: { address?: string } } | undefined)?.emailAddress?.address ?? "").trim().toLowerCase())
    )
  );
  upsertSyncedMessages(input.db, input.workspaceId, mapped);
  return mapped.length;
}

export async function downloadGraphAttachment(input: {
  db: DatabaseSync;
  workspaceId: string;
  accessToken: string;
  attachmentId: number;
  storageRoot: string;
}) {
  const attachment = getAttachmentById(input.db, input.workspaceId, input.attachmentId);
  if (!attachment) {
    throw new Error("Attachment not found");
  }
  const email = getStoredEmail(input.db, input.workspaceId, attachment.emailId);
  if (!email) {
    throw new Error("Parent email not found");
  }
  const response = await graphGet<{ contentBytes?: string; name?: string; contentType?: string }>(
    input.accessToken,
    `${GRAPH_BASE_URL}/me/messages/${encodeURIComponent(email.graphMessageId)}/attachments/${encodeURIComponent(attachment.graphAttachmentId)}`
  );
  const base64 = String(response.contentBytes ?? "").trim();
  if (!base64) {
    throw new Error("Attachment content was empty");
  }
  const folder = path.join(input.storageRoot, "attachments", input.workspaceId, String(email.id));
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  const fileName = response.name?.trim() || attachment.fileName;
  const filePath = path.join(folder, fileName);
  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
  const updated = updateAttachmentDownloadState(input.db, input.workspaceId, attachment.id, {
    localPath: filePath
  });
  return {
    attachment: updated ?? attachment,
    base64,
    name: fileName,
    contentType: response.contentType?.trim() || attachment.contentType,
    localPath: filePath
  };
}

export function markGraphAttachmentImported(input: {
  db: DatabaseSync;
  workspaceId: string;
  attachmentId: number;
}) {
  return updateAttachmentDownloadState(input.db, input.workspaceId, input.attachmentId, {
    importedToDxfReader: true
  });
}

export function createQuoteDraftFromEmail(input: {
  db: DatabaseSync;
  workspaceId: string;
  emailId: number;
  quoteId: string;
}) {
  return linkStoredEmail(input.db, input.workspaceId, input.emailId, {
    quoteId: input.quoteId
  });
}

export function linkPurchaseOrderToJob(input: {
  db: DatabaseSync;
  workspaceId: string;
  emailId: number;
  purchaseOrderId: string;
  quoteId?: string | null;
}) {
  return linkStoredEmail(input.db, input.workspaceId, input.emailId, {
    purchaseOrderId: input.purchaseOrderId,
    quoteId: input.quoteId ?? null
  });
}

export function findBestQuoteMatch(email: StoredEmailMessage, quotes: Array<{ id: string; quoteNumber: string; title: string; customerName?: string }>) {
  const emailText = `${email.subject}\n${email.bodyText ?? email.bodyPreview}`.toLowerCase();
  const byQuoteRef = email.extractedQuoteReference
    ? quotes.find((quote) => quote.quoteNumber.toLowerCase() === email.extractedQuoteReference?.toLowerCase())
    : undefined;
  if (byQuoteRef) return byQuoteRef;
  const bySubject = quotes.find((quote) =>
    emailText.includes((quote.quoteNumber || "").toLowerCase()) ||
    emailText.includes((quote.title || "").toLowerCase())
  );
  return bySubject ?? null;
}
