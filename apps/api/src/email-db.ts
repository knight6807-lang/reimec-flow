import fs from "node:fs";
import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { GraphMessageInput, StoredEmailAttachment, StoredEmailMessage, EmailDetectedType } from "./email-types.js";

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function parseJsonArray(input: unknown): string[] {
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const value = JSON.parse(input);
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function openEmailDatabase(rootDir: string) {
  ensureDir(rootDir);
  const dbPath = path.join(rootDir, "qouterx-email.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS email_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      companyName TEXT,
      phone TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(workspaceId, email)
    );

    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      graphMessageId TEXT NOT NULL UNIQUE,
      folder TEXT NOT NULL,
      subject TEXT NOT NULL,
      senderName TEXT NOT NULL,
      senderEmail TEXT NOT NULL,
      receivedAt TEXT NOT NULL,
      sentAt TEXT,
      bodyPreview TEXT NOT NULL,
      bodyHtml TEXT,
      bodyText TEXT,
      hasAttachments INTEGER NOT NULL DEFAULT 0,
      isRead INTEGER NOT NULL DEFAULT 0,
      importance TEXT,
      detectedType TEXT NOT NULL DEFAULT 'unknown',
      detectionConfidence INTEGER NOT NULL DEFAULT 0,
      detectionReasonsJson TEXT NOT NULL DEFAULT '[]',
      extractedPoNumber TEXT,
      extractedQuoteReference TEXT,
      extractedMaterial TEXT,
      extractedThicknessMm REAL,
      extractedQuantity REAL,
      customerId INTEGER,
      quoteId TEXT,
      purchaseOrderId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(customerId) REFERENCES email_customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS email_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emailId INTEGER NOT NULL,
      graphAttachmentId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      contentType TEXT NOT NULL,
      sizeBytes INTEGER NOT NULL DEFAULT 0,
      localPath TEXT,
      attachmentType TEXT NOT NULL DEFAULT 'unknown',
      importedToDxfReader INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      UNIQUE(emailId, graphAttachmentId),
      FOREIGN KEY(emailId) REFERENCES emails(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_detection_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emailId INTEGER NOT NULL,
      originalDetectedType TEXT NOT NULL,
      correctedType TEXT NOT NULL,
      reason TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(emailId) REFERENCES emails(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_sync_state (
      workspaceId TEXT NOT NULL,
      folder TEXT NOT NULL,
      lastSyncedAt TEXT NOT NULL,
      PRIMARY KEY(workspaceId, folder)
    );

    CREATE INDEX IF NOT EXISTS idx_emails_workspace_folder_received ON emails(workspaceId, folder, receivedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_emails_workspace_detectedType ON emails(workspaceId, detectedType, receivedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_email_attachments_emailId ON email_attachments(emailId);
  `);
  return db;
}

function rowToAttachment(row: Record<string, unknown>): StoredEmailAttachment {
  return {
    id: Number(row.id),
    emailId: Number(row.emailId),
    graphAttachmentId: String(row.graphAttachmentId ?? ""),
    fileName: String(row.fileName ?? ""),
    contentType: String(row.contentType ?? ""),
    sizeBytes: Number(row.sizeBytes ?? 0),
    localPath: row.localPath ? String(row.localPath) : null,
    attachmentType: String(row.attachmentType ?? "unknown") as StoredEmailAttachment["attachmentType"],
    importedToDxfReader: Boolean(row.importedToDxfReader),
    createdAt: String(row.createdAt ?? "")
  };
}

function rowToMessage(
  row: Record<string, unknown>,
  attachments: StoredEmailAttachment[]
): StoredEmailMessage {
  return {
    id: Number(row.id),
    graphMessageId: String(row.graphMessageId ?? ""),
    folder: String(row.folder ?? ""),
    subject: String(row.subject ?? ""),
    senderName: String(row.senderName ?? ""),
    senderEmail: String(row.senderEmail ?? ""),
    receivedAt: String(row.receivedAt ?? ""),
    sentAt: row.sentAt ? String(row.sentAt) : null,
    bodyPreview: String(row.bodyPreview ?? ""),
    bodyHtml: row.bodyHtml ? String(row.bodyHtml) : null,
    bodyText: row.bodyText ? String(row.bodyText) : null,
    hasAttachments: Boolean(row.hasAttachments),
    isRead: Boolean(row.isRead),
    importance: row.importance ? String(row.importance) : null,
    detectedType: String(row.detectedType ?? "unknown") as EmailDetectedType,
    detectionConfidence: Number(row.detectionConfidence ?? 0),
    detectionReasons: parseJsonArray(row.detectionReasonsJson),
    extractedPoNumber: row.extractedPoNumber ? String(row.extractedPoNumber) : null,
    extractedQuoteReference: row.extractedQuoteReference ? String(row.extractedQuoteReference) : null,
    extractedMaterial: row.extractedMaterial ? String(row.extractedMaterial) : null,
    extractedThicknessMm:
      typeof row.extractedThicknessMm === "number" ? Number(row.extractedThicknessMm) : row.extractedThicknessMm ? Number(row.extractedThicknessMm) : null,
    extractedQuantity:
      typeof row.extractedQuantity === "number" ? Number(row.extractedQuantity) : row.extractedQuantity ? Number(row.extractedQuantity) : null,
    customerId: row.customerId ? Number(row.customerId) : null,
    quoteId: row.quoteId ? String(row.quoteId) : null,
    purchaseOrderId: row.purchaseOrderId ? String(row.purchaseOrderId) : null,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
    attachments
  };
}

export function getOrCreateEmailCustomer(db: DatabaseSync, workspaceId: string, input: { name: string; email: string }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO email_customers (workspaceId, name, email, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspaceId, email) DO UPDATE SET
      name = excluded.name,
      updatedAt = excluded.updatedAt
  `).run(workspaceId, input.name || input.email, input.email, now, now);
  const row = db.prepare(`SELECT id, name, email FROM email_customers WHERE workspaceId = ? AND email = ?`).get(workspaceId, input.email) as Record<string, unknown> | undefined;
  return row ? { id: Number(row.id), name: String(row.name ?? ""), email: String(row.email ?? "") } : null;
}

export function upsertSyncedMessages(db: DatabaseSync, workspaceId: string, messages: GraphMessageInput[]) {
  const insertEmail = db.prepare(`
    INSERT INTO emails (
      workspaceId, graphMessageId, folder, subject, senderName, senderEmail, receivedAt, sentAt, bodyPreview, bodyHtml, bodyText,
      hasAttachments, isRead, importance, detectedType, detectionConfidence, detectionReasonsJson, extractedPoNumber,
      extractedQuoteReference, extractedMaterial, extractedThicknessMm, extractedQuantity, customerId, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(graphMessageId) DO UPDATE SET
      folder = excluded.folder,
      subject = excluded.subject,
      senderName = excluded.senderName,
      senderEmail = excluded.senderEmail,
      receivedAt = excluded.receivedAt,
      sentAt = excluded.sentAt,
      bodyPreview = excluded.bodyPreview,
      bodyHtml = excluded.bodyHtml,
      bodyText = excluded.bodyText,
      hasAttachments = excluded.hasAttachments,
      isRead = excluded.isRead,
      importance = excluded.importance,
      detectedType = excluded.detectedType,
      detectionConfidence = excluded.detectionConfidence,
      detectionReasonsJson = excluded.detectionReasonsJson,
      extractedPoNumber = excluded.extractedPoNumber,
      extractedQuoteReference = excluded.extractedQuoteReference,
      extractedMaterial = excluded.extractedMaterial,
      extractedThicknessMm = excluded.extractedThicknessMm,
      extractedQuantity = excluded.extractedQuantity,
      customerId = excluded.customerId,
      updatedAt = excluded.updatedAt
  `);
  const selectEmailId = db.prepare(`SELECT id FROM emails WHERE graphMessageId = ?`);
  const insertAttachment = db.prepare(`
    INSERT INTO email_attachments (
      emailId, graphAttachmentId, fileName, contentType, sizeBytes, attachmentType, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(emailId, graphAttachmentId) DO UPDATE SET
      fileName = excluded.fileName,
      contentType = excluded.contentType,
      sizeBytes = excluded.sizeBytes,
      attachmentType = excluded.attachmentType
  `);
  const markSync = db.prepare(`
    INSERT INTO email_sync_state (workspaceId, folder, lastSyncedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(workspaceId, folder) DO UPDATE SET lastSyncedAt = excluded.lastSyncedAt
  `);

  db.exec("BEGIN");
  try {
    const syncedFolders = new Set<string>();
    for (const message of messages) {
      const now = new Date().toISOString();
      const customer = message.senderEmail
        ? getOrCreateEmailCustomer(db, workspaceId, {
            name: message.senderName || message.senderEmail,
            email: message.senderEmail
          })
        : null;
      insertEmail.run(
        workspaceId,
        message.graphMessageId,
        message.folder,
        message.subject,
        message.senderName,
        message.senderEmail,
        message.receivedAt,
        message.sentAt ?? null,
        message.bodyPreview,
        message.bodyHtml ?? null,
        message.bodyText ?? null,
        message.hasAttachments ? 1 : 0,
        message.isRead ? 1 : 0,
        message.importance ?? null,
        message.detection.detectedType,
        message.detection.detectionConfidence,
        JSON.stringify(message.detection.detectionReasons),
        message.detection.extractedPoNumber ?? null,
        message.detection.extractedQuoteReference ?? null,
        message.detection.extractedMaterial ?? null,
        message.detection.extractedThicknessMm ?? null,
        message.detection.extractedQuantity ?? null,
        customer?.id ?? null,
        now,
        now
      );
      const row = selectEmailId.get(message.graphMessageId) as Record<string, unknown> | undefined;
      const emailId = Number(row?.id ?? 0);
      for (const attachment of message.attachments) {
        insertAttachment.run(
          emailId,
          attachment.graphAttachmentId,
          attachment.fileName,
          attachment.contentType,
          attachment.sizeBytes,
          attachment.attachmentType,
          now
        );
      }
      syncedFolders.add(message.folder);
    }
    const syncedAt = new Date().toISOString();
    for (const folder of syncedFolders) {
      markSync.run(workspaceId, folder, syncedAt);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listStoredEmails(
  db: DatabaseSync,
  workspaceId: string,
  options: {
    folder?: string;
    filter?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const clauses = [`workspaceId = ?`];
  const params: Array<string | number> = [workspaceId];

  if (options.folder && options.folder !== "all") {
    clauses.push(`folder = ?`);
    params.push(options.folder);
  }

  if (options.filter === "unread") clauses.push(`isRead = 0`);
  if (options.filter === "has_attachments") clauses.push(`hasAttachments = 1`);
  if (options.filter === "quote_requests") clauses.push(`detectedType = 'quote_request'`);
  if (options.filter === "purchase_orders") clauses.push(`detectedType = 'purchase_order'`);
  if (options.filter === "needs_review") clauses.push(`detectedType = 'needs_review'`);
  if (options.filter === "dxf_attached") {
    clauses.push(`EXISTS (SELECT 1 FROM email_attachments a WHERE a.emailId = emails.id AND a.attachmentType = 'dxf')`);
  }
  if (options.filter === "not_imported_yet") {
    clauses.push(`EXISTS (SELECT 1 FROM email_attachments a WHERE a.emailId = emails.id AND a.importedToDxfReader = 0)`);
  }

  if (options.search?.trim()) {
    const query = `%${options.search.trim().toLowerCase()}%`;
    clauses.push(`(
      lower(subject) LIKE ?
      OR lower(senderName) LIKE ?
      OR lower(senderEmail) LIKE ?
      OR lower(bodyPreview) LIKE ?
      OR lower(COALESCE(bodyText, '')) LIKE ?
      OR lower(COALESCE(extractedPoNumber, '')) LIKE ?
      OR lower(COALESCE(extractedQuoteReference, '')) LIKE ?
      OR EXISTS (
        SELECT 1 FROM email_attachments a
        WHERE a.emailId = emails.id AND lower(a.fileName) LIKE ?
      )
    )`);
    params.push(query, query, query, query, query, query, query, query);
  }

  const pageSize = Math.max(1, Math.min(200, options.pageSize ?? 50));
  const page = Math.max(1, options.page ?? 1);
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);

  const rows = db.prepare(`
    SELECT *
    FROM emails
    WHERE ${clauses.join(" AND ")}
    ORDER BY datetime(receivedAt) DESC
    LIMIT ? OFFSET ?
  `).all(...params) as Array<Record<string, unknown>>;

  const attachmentStmt = db.prepare(`SELECT * FROM email_attachments WHERE emailId = ? ORDER BY id ASC`);
  return rows.map((row) =>
    rowToMessage(row, (attachmentStmt.all(Number(row.id)) as Array<Record<string, unknown>>).map(rowToAttachment))
  );
}

export function getStoredEmail(db: DatabaseSync, workspaceId: string, emailId: number) {
  const row = db.prepare(`SELECT * FROM emails WHERE id = ? AND workspaceId = ?`).get(emailId, workspaceId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const attachments = (db.prepare(`SELECT * FROM email_attachments WHERE emailId = ? ORDER BY id ASC`).all(emailId) as Array<Record<string, unknown>>).map(rowToAttachment);
  return rowToMessage(row, attachments);
}

export function getAttachmentById(db: DatabaseSync, workspaceId: string, attachmentId: number) {
  const row = db.prepare(`
    SELECT a.*, e.workspaceId
    FROM email_attachments a
    INNER JOIN emails e ON e.id = a.emailId
    WHERE a.id = ? AND e.workspaceId = ?
  `).get(attachmentId, workspaceId) as Record<string, unknown> | undefined;
  return row ? rowToAttachment(row) : null;
}

export function updateAttachmentDownloadState(
  db: DatabaseSync,
  workspaceId: string,
  attachmentId: number,
  input: { localPath?: string | null; importedToDxfReader?: boolean }
) {
  const attachment = getAttachmentById(db, workspaceId, attachmentId);
  if (!attachment) return null;
  db.prepare(`
    UPDATE email_attachments
    SET localPath = COALESCE(?, localPath),
        importedToDxfReader = CASE WHEN ? IS NULL THEN importedToDxfReader ELSE ? END
    WHERE id = ?
  `).run(input.localPath ?? null, input.importedToDxfReader == null ? null : (input.importedToDxfReader ? 1 : 0), input.importedToDxfReader == null ? null : (input.importedToDxfReader ? 1 : 0), attachmentId);
  return getAttachmentById(db, workspaceId, attachmentId);
}

export function updateStoredEmailDetection(
  db: DatabaseSync,
  workspaceId: string,
  emailId: number,
  input: {
    correctedType: EmailDetectedType;
    reason?: string | null;
  }
) {
  const existing = db.prepare(`SELECT detectedType FROM emails WHERE id = ? AND workspaceId = ?`).get(emailId, workspaceId) as Record<string, unknown> | undefined;
  if (!existing) return null;
  db.prepare(`UPDATE emails SET detectedType = ?, updatedAt = ? WHERE id = ? AND workspaceId = ?`).run(input.correctedType, new Date().toISOString(), emailId, workspaceId);
  db.prepare(`
    INSERT INTO email_detection_feedback (emailId, originalDetectedType, correctedType, reason, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(emailId, String(existing.detectedType ?? "unknown"), input.correctedType, input.reason ?? null, new Date().toISOString());
  return getStoredEmail(db, workspaceId, emailId);
}

export function linkStoredEmail(
  db: DatabaseSync,
  workspaceId: string,
  emailId: number,
  input: { quoteId?: string | null; purchaseOrderId?: string | null; customerId?: number | null }
) {
  db.prepare(`
    UPDATE emails
    SET quoteId = COALESCE(?, quoteId),
        purchaseOrderId = COALESCE(?, purchaseOrderId),
        customerId = COALESCE(?, customerId),
        updatedAt = ?
    WHERE id = ? AND workspaceId = ?
  `).run(input.quoteId ?? null, input.purchaseOrderId ?? null, input.customerId ?? null, new Date().toISOString(), emailId, workspaceId);
  return getStoredEmail(db, workspaceId, emailId);
}

export function listSyncFolders(db: DatabaseSync, workspaceId: string) {
  return db.prepare(`SELECT folder, lastSyncedAt FROM email_sync_state WHERE workspaceId = ? ORDER BY folder ASC`).all(workspaceId) as Array<{ folder: string; lastSyncedAt: string }>;
}
