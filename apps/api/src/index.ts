import "dotenv/config";
import crypto from "node:crypto";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { Worker } from "node:worker_threads";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import Stripe from "stripe";
import multer from "multer";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import nodemailer from "nodemailer";
import { Potrace, trace as tracePotrace } from "potrace";
import svgPathParser from "svg-path-parser";
import heicConvert from "heic-convert";
import { openEmailDatabase, listStoredEmails, getStoredEmail, listSyncFolders, updateStoredEmailDetection } from "./email-db.js";
import { startGraphDeviceCodeFlow, pollGraphDeviceCode, refreshGraphAccessToken, listGraphFolders, syncGraphMessagesForWorkspace, downloadGraphAttachment, markGraphAttachmentImported, createQuoteDraftFromEmail, linkPurchaseOrderToJob, findBestQuoteMatch, getGraphConfig } from "./email-graph.js";
import { classifyEmailContent } from "./email-detection.js";
import type { EmailDetectedType } from "./email-types.js";
import { analyzeAndUpsertPartDna, decodeDxfBuffer, listPartHistory, listPartLibrary, openPartDnaDatabase, recordQuotedPartHistory, updatePartActualCutTime, updatePartNotes } from "./part-dna.js";
import {
  buildSmartQueueSnapshot,
  completeQueueGroup,
  createPlaceholderSmartQueueServices,
  createRecommendedQueueGroups,
  deleteSmartJob,
  getSmartJob,
  listQueueGroups,
  listSmartJobs,
  mapSmartStatusToLegacy,
  openSmartJobQueueDatabase,
  replaceQueueGroups,
  reorderJobsWithManualOverride,
  startQueueGroup,
  syncWorkspaceJobsToSmartQueue,
  updateQueueGroup,
  updateSmartJobStatus,
  upsertSmartJob,
  type SmartJobPriority,
  type SmartJobRecord,
  type SmartJobStatus,
  type SmartQueueServices
} from "./smart-job-queue.js";
import {
  addOffcut,
  addStockSheet,
  buildQuoteStockSuggestion,
  createOffcutFromJob,
  deleteOffcut,
  deleteStockSheet,
  getAvailableOffcuts,
  getAvailableStock,
  getLowStockWarnings,
  getStockSnapshot,
  listStockMovements,
  openStockMaterialDatabase,
  releaseStockReservation,
  reserveStockForJob,
  markStockUsed,
  updateOffcut,
  updateStockSheet
} from "./stock-material.js";
import {
  openCloudSyncDatabase,
  type CloudDeviceRole,
  type CloudEventType
} from "./cloud-sync.js";
import {
  openCloudSubscriptionDatabase,
  type CloudDevicePlatform,
  type CloudSubscriptionStatus
} from "./cloud-subscriptions.js";
import {
  canCompanyViewBilling,
  canManageManualSubscriptions,
  ensureManualProofDirectory,
  getSubscriptionRole,
  openManualSubscriptionDatabase,
  type ManualSubscriptionRole,
  type ManualSubscriptionStatus
} from "./manual-subscriptions.js";
import {
  openBrainCoreDatabase,
  type BrainEventType,
  type BrainRecommendationStatus
} from "./brain-core.js";
import { openBrainPartDnaDatabase, PartDnaBrainService } from "./brain-part-dna.js";
import { ManufacturingMemoryService, openManufacturingMemoryDatabase } from "./manufacturing-memory.js";
import { ProfitIntelligenceService, openProfitIntelligenceDatabase } from "./profit-intelligence.js";
import { OffcutIntelligenceService, openOffcutIntelligenceDatabase } from "./offcut-intelligence.js";
import { MaterialPredictionService, openMaterialPredictionDatabase } from "./material-prediction.js";
import { PurchasingIntelligenceService, openPurchasingIntelligenceDatabase } from "./purchasing-intelligence.js";
import { ProductionQueueBrainService, openProductionQueueBrainDatabase } from "./production-queue-brain.js";
import { LeadTimeIntelligenceService, openLeadTimeIntelligenceDatabase } from "./lead-time-intelligence.js";
import { SheetOptimizerService, openSheetOptimizerDatabase } from "./sheet-optimizer.js";
import { DxfErrorDetectionService, openDxfErrorDetectionDatabase } from "./dxf-error-detection.js";
import { NestingIntelligenceService, openNestingIntelligenceDatabase, type NestingPartCandidate } from "./nesting-intelligence.js";
import { CypNestProgramService, extractDxfGeometry, NestingEngineService, openNestingEngineDatabase, type CypNestProgramInput, type NestPart, type NestResult, type SheetSource } from "./QouterXNestingEngine.js";
import { NestingWorkspaceService, openNestingWorkspaceDatabase } from "./nesting-workspace.js";
import { ProductionAssistantService } from "./production-assistant.js";
import { QouterXBrainOrchestrator, type BrainModuleName, type BrainRunMode } from "./qouterx-brain-orchestrator.js";
import { BrainOrchestrator as EventBrainOrchestrator } from "./brain/core/BrainOrchestrator.js";
import { BrainScheduler } from "./brain/core/BrainScheduler.js";
import type { BrainRunMode as EventBrainRunMode, BrainModule } from "./brain/core/types.js";
import { partDnaModule } from "./brain/modules/partDna/index.js";
import { manufacturingMemoryModule } from "./brain/modules/manufacturingMemory/index.js";
import { profitModule } from "./brain/modules/profit/index.js";
import { materialPredictionModule } from "./brain/modules/materialPrediction/index.js";
import { productionQueueModule } from "./brain/modules/productionQueue/index.js";
import { leadTimeModule } from "./brain/modules/leadTime/index.js";
import { offcutsModule } from "./brain/modules/offcuts/index.js";
import { sheetOptimizerModule } from "./brain/modules/sheetOptimizer/index.js";
import { nestingModule } from "./brain/modules/nesting/index.js";
import { dxfErrorsModule } from "./brain/modules/dxfErrors/index.js";
import { purchasingModule } from "./brain/modules/purchasing/index.js";
import { assistantModule } from "./brain/modules/assistant/index.js";
import {
  addMembership,
  createSession,
  findWorkspaceByCustomer,
  getAllSessions,
  getWorkspace,
  getSession,
  getUserByEmail,
  getUserById,
  getUserWorkspaces,
  getAllWorkspaces,
  getWorkspaceMembers,
  getMembershipRole,
  hasMembership,
  updateWorkspaceServers,
  updateWorkspaceJobs,
  updateWorkspaceQuotes,
  updateWorkspaceCustomers,
  updateWorkspaceWorkers,
  updateWorkspaceFiles,
  updateWorkspaceLedger,
  updateWorkspaceSyncState,
  upsertUser,
  upsertWorkspace,
  type ChannelRecord,
  type CustomerRecord,
  type PaymentRecord,
  type FileRecord,
  type JobRecord,
  type LedgerEntry,
  type MembershipRecord,
  type QuoteRecord,
  type QuoteSections,
  type RoleRecord,
  type ServerRecord,
  type SessionRecord,
  type SyncState,
  type UserRecord,
  type WorkspaceRecord,
  type WorkerRecord
} from "./store.js";

function deriveApiPublicUrl(appUrlRaw: string, port: number) {
  try {
    const url = new URL(appUrlRaw);
    const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!isLocalHost) {
      url.port = String(port);
      return url.origin;
    }
  } catch {
    // fallback below
  }
  return `http://localhost:${port}`;
}

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://localhost:5174";
const APP_URL = process.env.APP_URL ?? CLIENT_ORIGIN.split(",")[0]?.trim() ?? "http://localhost:5173";
const API_PUBLIC_URL = process.env.API_PUBLIC_URL ?? deriveApiPublicUrl(APP_URL, PORT);
const HOST = process.env.HOST?.trim() || "0.0.0.0";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";
const APP_OWNER_EMAIL = (process.env.APP_OWNER_EMAIL ?? "knight6807@gmail.com").trim().toLowerCase();
const APP_OWNER_PASSWORD = process.env.APP_OWNER_PASSWORD?.trim() || null;
const PAYMENT_LINK_TEMPLATE = process.env.PAYMENT_LINK_TEMPLATE?.trim() ?? "";
const PAYMENT_BANK_NAME = process.env.PAYMENT_BANK_NAME?.trim() ?? "";
const PAYMENT_ACCOUNT_NAME = process.env.PAYMENT_ACCOUNT_NAME?.trim() ?? "";
const PAYMENT_ACCOUNT_NUMBER = process.env.PAYMENT_ACCOUNT_NUMBER?.trim() ?? "";
const PAYMENT_BRANCH_CODE = process.env.PAYMENT_BRANCH_CODE?.trim() ?? "";
const PAYMENT_ACCOUNT_TYPE = process.env.PAYMENT_ACCOUNT_TYPE?.trim() ?? "";
const PAYMENT_REFERENCE_PREFIX = process.env.PAYMENT_REFERENCE_PREFIX?.trim() ?? "INV";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 120_000);
const KEEP_ALIVE_TIMEOUT_MS = Number(process.env.KEEP_ALIVE_TIMEOUT_MS ?? 65_000);
const HEADERS_TIMEOUT_MS = Number(process.env.HEADERS_TIMEOUT_MS ?? 70_000);
const MAX_INBOX_HISTORY_FETCH = Math.max(100, Math.min(5000, Number(process.env.MAX_INBOX_HISTORY_FETCH ?? 800)));
const MAX_INBOX_SNIPPET_CHARS = Math.max(120, Math.min(2000, Number(process.env.MAX_INBOX_SNIPPET_CHARS ?? 500)));
const INBOX_CACHE_TTL_MS = Math.max(1_000, Math.min(120_000, Number(process.env.INBOX_CACHE_TTL_MS ?? 15_000)));
const MAX_IMAGE_OUTLINE_BYTES = Math.max(
  1_000_000,
  Math.min(120_000_000, Number(process.env.MAX_IMAGE_OUTLINE_BYTES ?? 30_000_000))
);
const IMAGE_OUTLINE_ATTEMPT_TIMEOUT_MS = Math.max(
  5_000,
  Math.min(180_000, Number(process.env.IMAGE_OUTLINE_ATTEMPT_TIMEOUT_MS ?? 45_000))
);
const DATA_ROOT = process.env.QOUTERX_DATA_DIR?.trim()
  ? path.resolve(process.env.QOUTERX_DATA_DIR.trim())
  : process.cwd();
const CLOUD_API_URL = process.env.QOUTERX_CLOUD_URL?.trim().replace(/\/+$/, "") || "";
const ENABLE_FILE_ACTIVITY_WATCHER = process.env.ENABLE_FILE_ACTIVITY_WATCHER !== "0";
const APP_VERSION = process.env.APP_VERSION?.trim() || "1.0.0";

let emailDbSingleton: ReturnType<typeof openEmailDatabase> | null = null;
let partDnaDbSingleton: ReturnType<typeof openPartDnaDatabase> | null = null;
let smartJobQueueDbSingleton: ReturnType<typeof openSmartJobQueueDatabase> | null = null;
let stockMaterialDbSingleton: ReturnType<typeof openStockMaterialDatabase> | null = null;
let cloudSyncDbSingleton: ReturnType<typeof openCloudSyncDatabase> | null = null;
let cloudSubscriptionDbSingleton: ReturnType<typeof openCloudSubscriptionDatabase> | null = null;
let manualSubscriptionDbSingleton: ReturnType<typeof openManualSubscriptionDatabase> | null = null;
let brainCoreDbSingleton: ReturnType<typeof openBrainCoreDatabase> | null = null;
let brainPartDnaDbSingleton: ReturnType<typeof openBrainPartDnaDatabase> | null = null;
let manufacturingMemoryDbSingleton: ReturnType<typeof openManufacturingMemoryDatabase> | null = null;
let profitIntelligenceDbSingleton: ReturnType<typeof openProfitIntelligenceDatabase> | null = null;
let offcutIntelligenceDbSingleton: ReturnType<typeof openOffcutIntelligenceDatabase> | null = null;
let materialPredictionDbSingleton: ReturnType<typeof openMaterialPredictionDatabase> | null = null;
let purchasingIntelligenceDbSingleton: ReturnType<typeof openPurchasingIntelligenceDatabase> | null = null;
let productionQueueBrainDbSingleton: ReturnType<typeof openProductionQueueBrainDatabase> | null = null;
let leadTimeIntelligenceDbSingleton: ReturnType<typeof openLeadTimeIntelligenceDatabase> | null = null;
let sheetOptimizerDbSingleton: ReturnType<typeof openSheetOptimizerDatabase> | null = null;
let dxfErrorDetectionDbSingleton: ReturnType<typeof openDxfErrorDetectionDatabase> | null = null;
let nestingIntelligenceDbSingleton: ReturnType<typeof openNestingIntelligenceDatabase> | null = null;
let nestingEngineDbSingleton: ReturnType<typeof openNestingEngineDatabase> | null = null;
let nestingWorkspaceDbSingleton: ReturnType<typeof openNestingWorkspaceDatabase> | null = null;
let eventBrainOrchestratorSingleton: EventBrainOrchestrator | null = null;
let eventBrainSchedulerSingleton: BrainScheduler | null = null;

const allowedOrigins = CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
const corsOriginMatcher = (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
  if (!origin || origin === "null" || origin.startsWith("file://")) {
    callback(null, true);
    return;
  }
  callback(null, allowedOrigins.includes(origin));
};
const execFileAsync = promisify(execFile);

const storageUpload = multer({ storage: multer.memoryStorage() });
const imageOutlineUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_OUTLINE_BYTES }
});

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20"
});

let sharpModulePromise: Promise<typeof import("sharp")> | null = null;
async function loadSharp() {
  if (!sharpModulePromise) {
    sharpModulePromise = import("sharp");
  }
  const mod = await sharpModulePromise;
  return mod.default;
}

let imapFlowModulePromise: Promise<typeof import("imapflow")> | null = null;
async function loadImapFlow() {
  if (!imapFlowModulePromise) {
    imapFlowModulePromise = import("imapflow");
  }
  const mod = await imapFlowModulePromise;
  return mod.ImapFlow;
}

const app = express();
app.use(cors({ origin: corsOriginMatcher }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "qouter-x-api",
    version: APP_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.post("/api/billing/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!STRIPE_WEBHOOK_SECRET) {
    res.status(500).send("Stripe webhook secret not configured");
    return;
  }

  const signature = req.headers["stripe-signature"] as string | undefined;
  if (!signature) {
    res.status(400).send("Missing Stripe signature");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    res.status(400).send(`Webhook error: ${(err as Error).message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const ws = getWorkspaceForStripeCustomer(session.customer?.toString(), session.metadata?.workspaceId ?? null);
    if (ws) {
      updateWorkspaceBillingState(ws, {
        stripeCustomerId: session.customer?.toString(),
        stripeSubscriptionId: session.subscription?.toString(),
        subscriptionStatus: "active",
        clearManualAccess: true,
        paymentRecordedAt: new Date().toISOString()
      });
    }
  }

  if (event.type.startsWith("customer.subscription")) {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer?.toString();
    const ws = getWorkspaceForStripeCustomer(customerId, subscription.metadata?.workspaceId ?? null);
    if (ws) {
      updateWorkspaceBillingState(ws, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        currentPeriodEnd: subscription.current_period_end ?? null,
        clearManualAccess: subscription.status === "active" || subscription.status === "trialing",
        paymentRecordedAt:
          subscription.status === "active" || subscription.status === "trialing" ? new Date().toISOString() : undefined
      });
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const ws = getWorkspaceForStripeCustomer(invoice.customer?.toString(), getStripeInvoiceWorkspaceId(invoice));
    if (ws) {
      updateWorkspaceBillingState(ws, {
        stripeCustomerId: invoice.customer?.toString(),
        stripeSubscriptionId: typeof invoice.subscription === "string" ? invoice.subscription : ws.stripeSubscriptionId,
        subscriptionStatus: "active",
        currentPeriodEnd: getInvoicePeriodEnd(invoice) ?? ws.currentPeriodEnd ?? null,
        clearManualAccess: true,
        paymentRecordedAt: new Date().toISOString()
      });
    }
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const ws = getWorkspaceForStripeCustomer(invoice.customer?.toString(), getStripeInvoiceWorkspaceId(invoice));
    if (ws) {
      updateWorkspaceBillingState(ws, {
        stripeCustomerId: invoice.customer?.toString(),
        stripeSubscriptionId: typeof invoice.subscription === "string" ? invoice.subscription : ws.stripeSubscriptionId,
        subscriptionStatus: "past_due",
        currentPeriodEnd: getInvoicePeriodEnd(invoice) ?? ws.currentPeriodEnd ?? null
      });
    }
  }

  res.json({ received: true });
});

app.use(express.json({ limit: "25mb" }));

type AuthedRequest = express.Request & { userId?: string };
type EmailSettingsRecord = NonNullable<WorkspaceRecord["emailSettings"]>;
type SupportMessageRecord = NonNullable<WorkspaceRecord["supportMessages"]>[number];
const APP_ACCESS_FEATURES = [
  "chat",
  "jobs",
  "part_dna",
  "quotes",
  "email",
  "tank",
  "documents",
  "customers",
  "image_dxf",
  "ai_assistant",
  "files",
  "qr"
] as const;
type AppAccessFeature = (typeof APP_ACCESS_FEATURES)[number];

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

function parseAccessFeatures(input: unknown): AppAccessFeature[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<AppAccessFeature>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    if ((APP_ACCESS_FEATURES as readonly string[]).includes(value)) {
      allowed.add(value as AppAccessFeature);
    }
  }
  return [...allowed];
}

function getWorkspaceAccessControl(ws: WorkspaceRecord) {
  if (!ws.accessControl) {
    ws.accessControl = { activationCodes: [], deviceAccess: [] };
  }
  ws.accessControl.activationCodes = Array.isArray(ws.accessControl.activationCodes)
    ? ws.accessControl.activationCodes
    : [];
  ws.accessControl.deviceAccess = Array.isArray(ws.accessControl.deviceAccess) ? ws.accessControl.deviceAccess : [];
  return ws.accessControl;
}

function createActivationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const groups = [4, 4, 4];
  const parts = groups.map((size) => {
    let value = "";
    for (let i = 0; i < size; i += 1) {
      value += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    return value;
  });
  return parts.join("-");
}

function authRequired(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: "invalid session" });
    return;
  }
  req.userId = session.userId;
  next();
}

function mainAdminRequired(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  if (!req.userId || !isAppOwner(req.userId)) {
    res.status(403).json({ error: "main admin access required" });
    return;
  }
  next();
}

function resolveAuthorizedWorkspaceId(userId: string, requestedWorkspaceId?: string) {
  if (requestedWorkspaceId && hasMembership(userId, requestedWorkspaceId)) return requestedWorkspaceId;
  const fallback = getUserWorkspaces(userId)[0];
  return fallback?.id;
}

function nowUnixSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toUnixSeconds(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor(time / 1000);
}

function getWorkspaceSubscriptionCompany(ws: WorkspaceRecord, userId?: string) {
  const user = userId ? getUserById(userId) : undefined;
  return getManualSubscriptionDb().ensureCompany({
    id: ws.id,
    companyName: ws.companyProfile?.name?.trim() || ws.name,
    contactName: user?.name?.trim() || ws.companyProfile?.name?.trim() || ws.name,
    email: user?.email?.trim() || ws.companyProfile?.email?.trim() || "",
    phone: ws.companyProfile?.phone?.trim() || "",
    planName: "Qouter X Standard"
  });
}

function getWorkspaceSubscriptionSnapshot(ws: WorkspaceRecord, userId?: string) {
  const company = getWorkspaceSubscriptionCompany(ws, userId);
  return getManualSubscriptionDb().getSubscriptionSnapshot(company.id);
}

function getManualSubscriptionRoleForUser(userId: string | undefined, workspaceId: string) {
  const membershipRole = userId ? getMembershipRole(userId, workspaceId) : undefined;
  return getSubscriptionRole({
    isMainAdmin: isAppOwner(userId),
    membershipRole: membershipRole ?? null
  });
}

function getEffectiveBillingPeriodEnd(ws: WorkspaceRecord) {
  const snapshot = getWorkspaceSubscriptionSnapshot(ws);
  return toUnixSeconds(snapshot?.company.subscriptionEndDate ?? null);
}

function getUserBillingPeriodEnd(user?: UserRecord) {
  if (!user) return null;
  return Number.isFinite(user.manualAccountPaidUntil ?? 0) && (user.manualAccountPaidUntil ?? 0) > 0
    ? (user.manualAccountPaidUntil ?? null)
    : null;
}

function userHasManualBillingAccess(user?: UserRecord) {
  if (!user || user.ownerLocked) return false;
  return (user.manualAccountPaidUntil ?? 0) > nowUnixSeconds();
}

function userHasBillingAccess(userId?: string) {
  if (!userId) return false;
  if (isAppOwner(userId)) return true;
  const user = getUserById(userId);
  if (!user || user.ownerLocked) return false;
  if (userHasManualBillingAccess(user)) return true;
  const workspaces = getUserWorkspaces(userId);
  return workspaces.some((ws) => workspaceHasBillingAccess(ws, userId));
}

function getWorkspaceBillingStatus(ws: WorkspaceRecord, userId?: string) {
  if (isAppOwner(userId)) return "owner";
  const user = userId ? getUserById(userId) : undefined;
  if (user?.ownerLocked) return "locked";
  if (userHasManualBillingAccess(user)) return "manual";
  const snapshot = getWorkspaceSubscriptionSnapshot(ws, userId);
  return snapshot?.status ?? ws.subscriptionStatus ?? null;
}

function workspaceHasActiveSubscription(ws: WorkspaceRecord) {
  const snapshot = getWorkspaceSubscriptionSnapshot(ws);
  return Boolean(snapshot?.hasAccess);
}

function isAppOwner(userId?: string) {
  if (!userId) return false;
  const user = getUserById(userId);
  return user?.email.trim().toLowerCase() === APP_OWNER_EMAIL;
}

function workspaceHasBillingAccess(ws: WorkspaceRecord, userId?: string) {
  if (isAppOwner(userId)) return true;
  const user = userId ? getUserById(userId) : undefined;
  if (user?.ownerLocked) return false;
  if (userHasManualBillingAccess(user)) return true;
  const snapshot = getWorkspaceSubscriptionSnapshot(ws, userId);
  return Boolean(snapshot?.hasAccess) && !snapshot?.limitedAccess;
}

function getBillingBlockedWorkspace(userId?: string) {
  if (!userId || userHasBillingAccess(userId)) return null;
  const workspaces = getUserWorkspaces(userId);
  if (workspaces.length === 0) return null;
  return workspaces[0] ?? null;
}

function sendBillingRequired(res: express.Response, ws: WorkspaceRecord) {
  const snapshot = getWorkspaceSubscriptionSnapshot(ws);
  res.status(402).json({
    error: "subscription required",
    billing: {
      status: snapshot?.status ?? getWorkspaceBillingStatus(ws),
      currentPeriodEnd: getEffectiveBillingPeriodEnd(ws),
      hasAccess: false,
      limitedAccess: snapshot?.limitedAccess ?? false,
      graceUntil: snapshot?.company.graceUntil ?? null,
      paymentReference: snapshot?.company.manualPaymentReference ?? null
    }
  });
}

function syncWorkspaceMemberBillingAccess(companyId: string, input: { active: boolean; paidUntil?: string | null }) {
  const workspace = getWorkspace(companyId);
  const members = getWorkspaceMembers(workspace.id);
  const paidUntilSeconds = toUnixSeconds(input.paidUntil);
  members.forEach(({ user }) => {
    if (input.active) {
      user.ownerLocked = false;
      if (paidUntilSeconds) {
        user.manualAccountPaidUntil = paidUntilSeconds;
      }
    } else {
      user.ownerLocked = true;
      user.manualAccountPaidUntil = null;
    }
    upsertUser(user);
  });
}

function buildWorkspaceSubscriptionStatus(ws: WorkspaceRecord, userId: string | undefined, deviceId: string, deviceName: string) {
  const snapshot = getWorkspaceSubscriptionSnapshot(ws, userId);
  const hasAccess = workspaceHasBillingAccess(ws, userId);
  if (snapshot?.company) {
    getManualSubscriptionDb().markDeviceSeen({
      companyId: snapshot.company.id,
      deviceId,
      deviceName,
      isAllowed: hasAccess
    });
  }
  return {
    status: snapshot?.status ?? getWorkspaceBillingStatus(ws, userId),
    hasAccess,
    limitedAccess: hasAccess ? false : (snapshot?.limitedAccess ?? false),
    daysRemaining: snapshot?.expiresInDays ?? 0,
    daysExpired: snapshot?.expiredDays ?? 0,
    paymentReference: snapshot?.company.manualPaymentReference ?? null,
    lastConnectedAt: new Date().toISOString(),
    company: snapshot?.company ?? null
  };
}

function updateWorkspaceBillingState(
  ws: WorkspaceRecord,
  input: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    subscriptionStatus?: string | null;
    currentPeriodEnd?: number | null;
    clearManualAccess?: boolean;
    paymentRecordedAt?: string;
  }
) {
  if (input.stripeCustomerId) ws.stripeCustomerId = input.stripeCustomerId;
  if (input.stripeSubscriptionId) ws.stripeSubscriptionId = input.stripeSubscriptionId;
  if (typeof input.subscriptionStatus === "string") ws.subscriptionStatus = input.subscriptionStatus;
  if (input.currentPeriodEnd !== undefined) ws.currentPeriodEnd = input.currentPeriodEnd;
  if (input.clearManualAccess) {
    ws.manualBillingPaidUntil = null;
  }
  if (input.paymentRecordedAt) {
    ws.lastBillingPaymentAt = input.paymentRecordedAt;
  }
  upsertWorkspace(ws);
}

function getInvoicePeriodEnd(invoice: Stripe.Invoice) {
  const lineEnds = invoice.lines?.data
    ?.map((line) => line.period?.end ?? 0)
    .filter((value) => Number.isFinite(value) && value > 0) ?? [];
  return lineEnds.length ? Math.max(...lineEnds) : null;
}

function getWorkspaceForStripeCustomer(customerId?: string | null, workspaceId?: string | null) {
  if (customerId) {
    const byCustomer = findWorkspaceByCustomer(customerId);
    if (byCustomer) return byCustomer;
  }
  if (workspaceId) {
    return getWorkspace(workspaceId);
  }
  return null;
}

function getStripeInvoiceWorkspaceId(invoice: Stripe.Invoice) {
  const invoiceLike = invoice as Stripe.Invoice & {
    parent?: {
      subscription_details?: {
        metadata?: {
          workspaceId?: string;
        };
      };
    };
  };
  return invoiceLike.parent?.subscription_details?.metadata?.workspaceId ?? null;
}

function getLocalBillingUser(email: string, password: string) {
  const user =
    email.trim().toLowerCase() === APP_OWNER_EMAIL
      ? ensureAppOwnerBootstrap(email, password)
      : getUserByEmail(email);
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return user;
}

function getOwnerLoginFailureMessage(email: string, password: string) {
  if (email.trim().toLowerCase() !== APP_OWNER_EMAIL) return "invalid credentials";
  if (!APP_OWNER_PASSWORD) {
    return "Owner password is not configured on Render. Set APP_OWNER_PASSWORD on qouterx-api and redeploy.";
  }
  if (password !== APP_OWNER_PASSWORD) {
    return "Owner password does not match APP_OWNER_PASSWORD on Render.";
  }
  return "invalid owner credentials";
}

function ensureAppOwnerBootstrap(email: string, password: string) {
  if (email.trim().toLowerCase() !== APP_OWNER_EMAIL) return getUserByEmail(email);
  let user = getUserByEmail(email);
  const passwordMatchesOwnerEnv = Boolean(APP_OWNER_PASSWORD && password === APP_OWNER_PASSWORD);
  if (!user) {
    user = {
      id: `user-${crypto.randomUUID()}`,
      email: email.trim(),
      name: "Qouter X Owner",
      accountRef: undefined,
      manualAccountPaidUntil: null,
      ownerLocked: false,
      passwordHash: hashPassword(password),
      provider: "local",
      createdAt: new Date().toISOString()
    };
    upsertUser(user);
  } else if (!user.passwordHash || passwordMatchesOwnerEnv) {
    user.passwordHash = hashPassword(password);
    user.ownerLocked = false;
    if (!user.provider) user.provider = "local";
    upsertUser(user);
  }
  ensureUserAccountRef(user);
  const existingWorkspaces = getUserWorkspaces(user.id);
  if (existingWorkspaces.length === 0) {
    const workspaceId = `workspace-${crypto.randomUUID()}`;
    const workspace = getWorkspace(workspaceId);
    workspace.name = workspace.name && workspace.name !== workspace.id ? workspace.name : "Qouter X Owner";
    workspace.ownerUserId = user.id;
    upsertWorkspace(workspace);
    addMembership({ userId: user.id, workspaceId, role: "owner" });
    getWorkspaceSubscriptionCompany(workspace, user.id);
  } else {
    existingWorkspaces.forEach((workspace) => {
      if (workspace.ownerUserId !== user!.id) {
        workspace.ownerUserId = user!.id;
        upsertWorkspace(workspace);
      }
      getWorkspaceSubscriptionCompany(workspace, user!.id);
    });
  }
  return user;
}

function getUserBillingWorkspace(userId: string) {
  const blockedWorkspace = getBillingBlockedWorkspace(userId);
  if (blockedWorkspace) return blockedWorkspace;
  const workspaces = getUserWorkspaces(userId);
  return workspaces[0] ?? null;
}

async function createStripeCheckoutSession(input: {
  workspace: WorkspaceRecord;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    customer_email: input.customerEmail,
    success_url: input.successUrl ?? `${CLIENT_ORIGIN}/?checkout=success`,
    cancel_url: input.cancelUrl ?? `${CLIENT_ORIGIN}/?checkout=cancel`,
    metadata: { workspaceId: input.workspace.id }
  });
}

function sanitizeName(value: string) {
  return value.replace(/[^a-z0-9-_.\\s]/gi, "").trim().replace(/\\s+/g, " ");
}

function stringOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildUserReference(user: UserRecord) {
  const source = user.email.toUpperCase();
  const compact = source.replace(/[^A-Z0-9]/g, "");
  const suffix = compact.slice(-8).padStart(8, "0");
  return `QX-${suffix}`;
}

function ensureUserAccountRef(user: UserRecord) {
  if (!user.accountRef) {
    user.accountRef = buildUserReference(user);
    upsertUser(user);
  }
  return user.accountRef;
}

function normalizeHexColor(value?: string) {
  if (!value) return undefined;
  const raw = value.trim().replace("#", "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw
      .split("")
      .map((ch) => `${ch}${ch}`)
      .join("")
      .toLowerCase();
    return `#${expanded}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }
  return undefined;
}

function mixHexColor(baseHex: string, targetHex: string, ratio: number) {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  const parse = (hex: string) => ({
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  });
  const base = parse(baseHex);
  const target = parse(targetHex);
  const blend = (from: number, to: number) => Math.round(from + (to - from) * safeRatio);
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(blend(base.r, target.r))}${toHex(blend(base.g, target.g))}${toHex(blend(base.b, target.b))}`;
}

function buildInvoicePaymentReference(quote: QuoteRecord) {
  const base = sanitizeName(quote.quoteNumber || "").replace(/\s+/g, "-").toUpperCase();
  const prefix = sanitizeName(PAYMENT_REFERENCE_PREFIX).replace(/\s+/g, "-").toUpperCase() || "INV";
  return `${prefix}-${base || quote.id.toUpperCase()}`;
}

function buildInvoicePaymentUrl(reference: string, amount: number) {
  if (!PAYMENT_LINK_TEMPLATE) return "";
  const formattedAmount = Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
  return PAYMENT_LINK_TEMPLATE
    .replace(/\{reference\}/g, reference)
    .replace(/\{referenceEncoded\}/g, encodeURIComponent(reference))
    .replace(/\{amount\}/g, formattedAmount)
    .replace(/\{amountEncoded\}/g, encodeURIComponent(formattedAmount))
    .replace(/\{currency\}/g, "ZAR");
}

function parseCompanyDetails(input: unknown) {
  if (!input || typeof input !== "object") return undefined;
  const source = input as Record<string, unknown>;
  const parsed = {
    email: typeof source.email === "string" ? source.email.trim() : undefined,
    phone: typeof source.phone === "string" ? source.phone.trim() : undefined,
    address: typeof source.address === "string" ? source.address.trim() : undefined,
    vatNumber: typeof source.vatNumber === "string" ? source.vatNumber.trim() : undefined,
    registrationNumber:
      typeof source.registrationNumber === "string" ? source.registrationNumber.trim() : undefined,
    accentColor: normalizeHexColor(typeof source.accentColor === "string" ? source.accentColor : undefined)
  };
  return Object.values(parsed).some((value) => Boolean(value)) ? parsed : undefined;
}

function parseEmailSettings(input: unknown, fallback?: EmailSettingsRecord): EmailSettingsRecord {
  const source = (input && typeof input === "object" ? (input as Record<string, unknown>) : {}) ?? {};
  const smtpPortRaw = Number(source.smtpPort);
  const imapPortRaw = Number(source.imapPort);
  const autoNotifyRaw =
    typeof source.autoNotifyJobDone === "boolean"
      ? source.autoNotifyJobDone
      : (fallback?.autoNotifyJobDone ?? true);
  return {
    smtpHost: typeof source.smtpHost === "string" ? source.smtpHost.trim() : (fallback?.smtpHost ?? ""),
    smtpPort: Number.isFinite(smtpPortRaw) && smtpPortRaw > 0 ? Math.floor(smtpPortRaw) : (fallback?.smtpPort ?? 587),
    smtpSecure: typeof source.smtpSecure === "boolean" ? source.smtpSecure : (fallback?.smtpSecure ?? false),
    smtpUser: typeof source.smtpUser === "string" ? source.smtpUser.trim() : (fallback?.smtpUser ?? ""),
    smtpPass: typeof source.smtpPass === "string" ? source.smtpPass : (fallback?.smtpPass ?? ""),
    imapHost: typeof source.imapHost === "string" ? source.imapHost.trim() : (fallback?.imapHost ?? ""),
    imapPort: Number.isFinite(imapPortRaw) && imapPortRaw > 0 ? Math.floor(imapPortRaw) : (fallback?.imapPort ?? 993),
    imapSecure: typeof source.imapSecure === "boolean" ? source.imapSecure : (fallback?.imapSecure ?? true),
    imapUser: typeof source.imapUser === "string" ? source.imapUser.trim() : (fallback?.imapUser ?? ""),
    imapPass: typeof source.imapPass === "string" ? source.imapPass : (fallback?.imapPass ?? ""),
    fromName: typeof source.fromName === "string" ? source.fromName.trim() : (fallback?.fromName ?? ""),
    fromEmail: typeof source.fromEmail === "string" ? source.fromEmail.trim() : (fallback?.fromEmail ?? ""),
    autoNotifyJobDone: Boolean(autoNotifyRaw)
  };
}

function deriveImapHostFromSmtpHost(smtpHost: string) {
  const host = smtpHost.trim();
  if (!host) return "";
  if (host.startsWith("smtp.")) return `imap.${host.slice("smtp.".length)}`;
  return host;
}

function getEffectiveEmailSettings(ws: WorkspaceRecord): EmailSettingsRecord {
  const settings = parseEmailSettings(ws.emailSettings ?? {}, ws.emailSettings ?? undefined);
  const fallbackImapHost = deriveImapHostFromSmtpHost(settings.smtpHost || process.env.REIMEC_SMTP_HOST || "");
  return {
    smtpHost: settings.smtpHost || process.env.REIMEC_SMTP_HOST || "",
    smtpPort: settings.smtpPort || Number(process.env.REIMEC_SMTP_PORT ?? 587),
    smtpSecure:
      typeof settings.smtpSecure === "boolean"
        ? settings.smtpSecure
        : String(process.env.REIMEC_SMTP_SECURE ?? "false").toLowerCase() === "true",
    smtpUser: settings.smtpUser || process.env.REIMEC_SMTP_USER || "",
    smtpPass: settings.smtpPass || process.env.REIMEC_SMTP_PASS || "",
    imapHost: settings.imapHost || process.env.REIMEC_IMAP_HOST || fallbackImapHost,
    imapPort: settings.imapPort || Number(process.env.REIMEC_IMAP_PORT ?? 993),
    imapSecure:
      typeof settings.imapSecure === "boolean"
        ? settings.imapSecure
        : String(process.env.REIMEC_IMAP_SECURE ?? "true").toLowerCase() === "true",
    imapUser: settings.imapUser || process.env.REIMEC_IMAP_USER || settings.smtpUser || "",
    imapPass: settings.imapPass || process.env.REIMEC_IMAP_PASS || settings.smtpPass || "",
    fromName: settings.fromName || ws.companyProfile?.name || "Qouterx",
    fromEmail: settings.fromEmail || ws.companyProfile?.email || process.env.REIMEC_FROM_EMAIL || "",
    autoNotifyJobDone: settings.autoNotifyJobDone ?? true
  };
}

async function sendJobDoneEmail(workspaceId: string, job: JobRecord) {
  const ws = getWorkspace(workspaceId);
  const settings = getEffectiveEmailSettings(ws);
  if (!settings.autoNotifyJobDone) return;
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass || !settings.fromEmail) return;
  const customer = ws.customers.find(
    (entry) => entry.name.trim().toLowerCase() === (job.customerName ?? "").trim().toLowerCase()
  );
  const quote = job.quoteNumber
    ? ws.quotes.find((entry) => entry.quoteNumber.trim().toLowerCase() === job.quoteNumber?.trim().toLowerCase())
    : undefined;
  const recipient = customer?.email?.trim() || quote?.customerDetails?.email?.trim();
  if (!recipient) return;

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass
    }
  });

  const companyName = ws.companyProfile?.name?.trim() || settings.fromName || "Qouterx";
  const customerName = job.customerName?.trim() || "Customer";
  const subject = `Job Completed: ${job.jobNumber} ${job.title}`;
  const checkedByLine = job.checkedBy ? `Checked by: ${job.checkedBy}` : "";
  const checkedAtLine = job.checkedAt ? `Completed at: ${new Date(job.checkedAt).toLocaleString("en-ZA")}` : "";
  const bodyText = [
    `Dear ${customerName},`,
    "",
    `This is to confirm that your job has been completed successfully.`,
    "",
    `Job Number: ${job.jobNumber}`,
    `Job Title: ${job.title}`,
    job.quoteNumber ? `Quote: ${job.quoteNumber}` : "",
    checkedByLine,
    checkedAtLine,
    "",
    "Please let us know if you would like delivery/collection arrangements confirmed.",
    "",
    `Kind regards,`,
    companyName
  ]
    .filter(Boolean)
    .join("\n");
  const bodyHtml = [
    `<p>Dear ${customerName},</p>`,
    "<p>This is to confirm that your job has been completed successfully.</p>",
    "<ul>",
    `<li><strong>Job Number:</strong> ${job.jobNumber}</li>`,
    `<li><strong>Job Title:</strong> ${job.title}</li>`,
    job.quoteNumber ? `<li><strong>Quote:</strong> ${job.quoteNumber}</li>` : "",
    checkedByLine ? `<li>${checkedByLine}</li>` : "",
    checkedAtLine ? `<li>${checkedAtLine}</li>` : "",
    "</ul>",
    "<p>Please let us know if you would like delivery/collection arrangements confirmed.</p>",
    `<p>Kind regards,<br/>${companyName}</p>`
  ]
    .filter(Boolean)
    .join("");

  await transporter.sendMail({
    from: `"${settings.fromName || companyName}" <${settings.fromEmail}>`,
    to: recipient,
    subject,
    text: bodyText,
    html: bodyHtml
  });
}

function normalizeDocToken(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function detectDocumentKeywords(source: string) {
  const hasQuoteKeyword =
    /\b(?:quote|quotes|quotation|quotations|qoute|qoutes|rfq|request\s+for\s+quote)\b/i.test(source);
  const hasPurchaseOrderKeyword =
    /\b(?:purchase[\s-]*orders?|purchace[\s-]*orders?)\b/i.test(source);
  return { hasQuoteKeyword, hasPurchaseOrderKeyword };
}

function detectQuoteAndPurchaseOrder(ws: WorkspaceRecord, source: string) {
  const keywords = detectDocumentKeywords(source);
  const quoteTokenPatterns = [
    /\b(?:RFQ|QUOTE|QUOTATION)\s*(?:#|NO\.?|NUMBER)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{1,})\b/gi,
    /\b(AVN\d{2,})\b/gi,
    /\b(Q(?:UOTE)?[-\s]?\d+(?:[-/]\d+){0,2})\b/gi
  ];
  const poTokenPatterns = [
    /\b(?:PO|P\/O)\s*(?:#|NO\.?|NUMBER)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{1,})\b/gi,
    /\bPURCHASE\s+ORDER\s*(?:#|NO\.?|NUMBER)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{1,})\b/gi
  ];

  const quoteCandidates = new Set<string>();
  const poCandidates = new Set<string>();

  if (keywords.hasQuoteKeyword) {
    for (const pattern of quoteTokenPatterns) {
      for (const match of source.matchAll(pattern)) {
        const value = (match[1] ?? match[0] ?? "").trim();
        if (value) quoteCandidates.add(value);
      }
    }
  }
  if (keywords.hasPurchaseOrderKeyword) {
    for (const pattern of poTokenPatterns) {
      for (const match of source.matchAll(pattern)) {
        const value = (match[1] ?? match[0] ?? "").trim();
        if (value) poCandidates.add(value);
      }
    }
  }

  const quoteByNormalized = new Map<string, QuoteRecord>();
  ws.quotes.forEach((quote) => {
    quoteByNormalized.set(normalizeDocToken(quote.quoteNumber), quote);
  });

  let matchedQuote: QuoteRecord | undefined;
  if (keywords.hasQuoteKeyword) {
    for (const candidate of quoteCandidates) {
      const normalized = normalizeDocToken(candidate);
      const exact = quoteByNormalized.get(normalized);
      if (exact) {
        matchedQuote = exact;
        break;
      }
      const partial = ws.quotes.find((quote) => normalizeDocToken(quote.quoteNumber).includes(normalized));
      if (partial) {
        matchedQuote = partial;
        break;
      }
    }
  }

  return {
    hasQuoteKeyword: keywords.hasQuoteKeyword,
    hasPurchaseOrderKeyword: keywords.hasPurchaseOrderKeyword,
    quoteCandidates: Array.from(quoteCandidates),
    purchaseOrderCandidates: Array.from(poCandidates),
    matchedQuote
  };
}

function decodeQuotedPrintable(input: string) {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([A-Fa-f0-9]{2})/g, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function decodeTransferEncodedBody(body: string, transferEncoding: string) {
  const normalized = transferEncoding.trim().toLowerCase();
  if (normalized === "quoted-printable") {
    return decodeQuotedPrintable(body);
  }
  if (normalized === "base64") {
    try {
      const compact = body.replace(/\s+/g, "");
      return Buffer.from(compact, "base64").toString("utf8");
    } catch {
      return body;
    }
  }
  return body;
}

function stripHtmlTags(input: string) {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function looksLikeEncodedAttachmentNoise(input: string) {
  const compact = input.replace(/\s+/g, "");
  if (compact.length < 120) return false;
  const base64Chars = (compact.match(/[A-Za-z0-9+/=]/g) ?? []).length;
  const ratio = compact.length ? base64Chars / compact.length : 0;
  return ratio > 0.94;
}

function extractBestMimeBody(source: string) {
  const normalized = source.replace(/\r/g, "");
  const unfoldHeaders = (value: string) => value.replace(/\n[ \t]+/g, " ");

  const extractMimePart = (headers: string, body: string): { plain: string; html: string } => {
    const unfoldedHeaders = unfoldHeaders(headers);
    const contentTypeHeader = (unfoldedHeaders.match(/Content-Type:\s*([^\n]+)/i)?.[1] ?? "").trim();
    const contentType = (contentTypeHeader.split(";")[0] ?? "").trim().toLowerCase();
    const disposition = (unfoldedHeaders.match(/Content-Disposition:\s*([^\n;]+)/i)?.[1] ?? "").trim().toLowerCase();
    const transferEncoding = (unfoldedHeaders.match(/Content-Transfer-Encoding:\s*([^\n]+)/i)?.[1] ?? "").trim().toLowerCase();
    const boundaryMatch = contentTypeHeader.match(/boundary="?([^"\n;]+)"?/i);
    const boundary = boundaryMatch?.[1]?.trim();

    if (disposition === "attachment" || disposition === "inline") {
      return { plain: "", html: "" };
    }

    if (contentType.startsWith("multipart/") && boundary) {
      const parts = body.split(`--${boundary}`);
      let plainCandidate = "";
      let htmlCandidate = "";
      for (const rawPart of parts) {
        const part = rawPart.trim();
        if (!part || part === "--") continue;
        const partHeaderEnd = part.indexOf("\n\n");
        const partHeaders = partHeaderEnd >= 0 ? part.slice(0, partHeaderEnd) : "";
        const partBody = partHeaderEnd >= 0 ? part.slice(partHeaderEnd + 2) : part;
        const nested = extractMimePart(partHeaders, partBody);
        if (!plainCandidate && nested.plain) plainCandidate = nested.plain;
        if (!htmlCandidate && nested.html) htmlCandidate = nested.html;
      }
      return { plain: plainCandidate.trim(), html: htmlCandidate.trim() };
    }

    const decodedBody = decodeTransferEncodedBody(body, transferEncoding);

    const cleanedBody = decodedBody.trim();
    if (looksLikeEncodedAttachmentNoise(cleanedBody)) {
      return { plain: "", html: "" };
    }

    if (contentType.startsWith("text/plain") || !contentType) {
      return { plain: cleanedBody, html: "" };
    }
    if (contentType.startsWith("text/html")) {
      return { plain: "", html: stripHtmlTags(cleanedBody).trim() };
    }
    return { plain: "", html: "" };
  };

  const headerEnd = normalized.indexOf("\n\n");
  const headers = headerEnd >= 0 ? unfoldHeaders(normalized.slice(0, headerEnd)) : "";
  const fullBody = headerEnd >= 0 ? normalized.slice(headerEnd + 2) : normalized;
  const extracted = extractMimePart(headers, fullBody);
  return (extracted.plain || extracted.html || "").trim();
}

function summarizeEmailSource(source: string) {
  const bestBody = extractBestMimeBody(source);
  const compact = bestBody
    .replace(/^--[^\n]+$/gm, "")
    .replace(/^Content-[^\n]+$/gim, "")
    .replace(/^\s*boundary\s*=\s*["']?[^"'\n]+["']?\s*;?\s*$/gim, "")
    .replace(/^\s*type\s*=\s*["']?[^"'\n]+["']?\s*;?\s*$/gim, "")
    .replace(/^\s*\[cid:[^\]]+\]\s*$/gim, "")
    .replace(/\bcid:[^\s>\]]+/gim, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return compact.length > MAX_INBOX_SNIPPET_CHARS ? `${compact.slice(0, MAX_INBOX_SNIPPET_CHARS)}...` : compact;
}

function extractInboxAttachments(bodyStructure: unknown) {
  const attachments: Array<{ part: string; name: string; contentType: string; sizeBytes?: number }> = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const part = node as Record<string, unknown>;
    const partId = typeof part.part === "string" ? part.part : "";
    const disposition = typeof part.disposition === "string" ? part.disposition.toLowerCase() : "";
    const dispositionParameters =
      part.dispositionParameters && typeof part.dispositionParameters === "object"
        ? (part.dispositionParameters as Record<string, unknown>)
        : undefined;
    const parameters =
      part.parameters && typeof part.parameters === "object"
        ? (part.parameters as Record<string, unknown>)
        : undefined;
    const filename = typeof part.filename === "string"
      ? part.filename
      : (typeof dispositionParameters?.filename === "string"
          ? dispositionParameters.filename
          : (typeof parameters?.name === "string" ? parameters.name : undefined));
    const contentType =
      typeof part.type === "string" && part.type.includes("/")
        ? part.type
        : (typeof part.type === "string" && typeof part.subtype === "string"
            ? `${part.type}/${part.subtype}`
            : "application/octet-stream");
    const normalizedContentType = contentType.toLowerCase();
    const sizeRaw = Number(part.size);
    const sizeBytes = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.floor(sizeRaw) : undefined;
    const isMultipart = normalizedContentType.startsWith("multipart/");
    const isDisplayBody = normalizedContentType.startsWith("text/plain") || normalizedContentType.startsWith("text/html");
    const isKnownFileType =
      normalizedContentType.includes("application/pdf") ||
      normalizedContentType.includes("image/png") ||
      normalizedContentType.includes("image/jpeg") ||
      normalizedContentType.includes("image/jpg") ||
      normalizedContentType.includes("image/gif") ||
      normalizedContentType.includes("image/webp") ||
      normalizedContentType.includes("dxf");
    const isGenericBinary = normalizedContentType.includes("octet-stream");
    const shouldInclude =
      Boolean(filename) ||
      ((disposition === "attachment" || disposition === "inline") && !isMultipart && !isDisplayBody && (isKnownFileType || isGenericBinary));
    if (shouldInclude && partId) {
      attachments.push({
        part: partId,
        name: filename?.trim() || "attachment",
        contentType,
        sizeBytes
      });
    }
    const childNodes = Array.isArray(part.childNodes) ? part.childNodes : [];
    const parts = Array.isArray(part.parts) ? part.parts : [];
    [...childNodes, ...parts].forEach((child) => walk(child));
  };
  walk(bodyStructure);
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = `${attachment.part}:${attachment.name}:${attachment.contentType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findPreferredBodyPart(bodyStructure: unknown): { part: string; contentType: string } | null {
  let plainCandidate: { part: string; contentType: string } | null = null;
  let htmlCandidate: { part: string; contentType: string } | null = null;

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const part = node as Record<string, unknown>;
    const partId = typeof part.part === "string" ? part.part : "";
    const rawType = typeof part.type === "string" ? part.type.toLowerCase() : "";
    const subtype = typeof part.subtype === "string" ? part.subtype.toLowerCase() : "";
    const disposition = typeof part.disposition === "string" ? part.disposition.toLowerCase() : "";
    const contentType = rawType.includes("/") ? rawType : (rawType && subtype ? `${rawType}/${subtype}` : "");

    const childNodes = Array.isArray(part.childNodes) ? part.childNodes : [];
    const parts = Array.isArray(part.parts) ? part.parts : [];
    for (const child of [...childNodes, ...parts]) {
      walk(child);
    }

    if (!partId || disposition === "attachment") return;
    if (contentType === "text/plain" && !plainCandidate) {
      plainCandidate = { part: partId, contentType };
      return;
    }
    if (contentType === "text/html" && !htmlCandidate) {
      htmlCandidate = { part: partId, contentType };
    }
  };

  walk(bodyStructure);
  return plainCandidate ?? htmlCandidate ?? null;
}

async function downloadInboxTextPart(
  client: {
    download: (uid: number, partId: string, options: { uid: true }) => Promise<{
      content?: AsyncIterable<Uint8Array | Buffer>;
      meta?: { contentType?: string };
    } | null>;
  },
  uid: number,
  partId: string,
  contentType?: string
) {
  const download = await client.download(uid, partId, { uid: true });
  if (!download || !download.content) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of download.content) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const fileBuffer = Buffer.concat(chunks);
  const rawText = fileBuffer.toString("utf8");
  const normalizedType = (contentType || download.meta?.contentType || "").toLowerCase();
  if (normalizedType.startsWith("text/html")) {
    return stripHtmlTags(rawText).trim();
  }
  return rawText.trim();
}

async function listInboxEmails(ws: WorkspaceRecord, limit = 50, includeAll = false) {
  const settings = getEffectiveEmailSettings(ws);
  if (!settings.imapHost || !settings.imapUser || !settings.imapPass) {
    throw new Error("IMAP is not configured");
  }
  const ImapFlow = await loadImapFlow();
  const client = new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort ?? 993,
    secure: settings.imapSecure,
    logger: false,
    auth: {
      user: settings.imapUser,
      pass: settings.imapPass
    }
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    const mailbox = client.mailbox;
    const total = mailbox && typeof mailbox === "object" ? mailbox.exists || 0 : 0;
    if (total <= 0) return [] as Array<Record<string, unknown>>;
    const boundedLimit = Math.max(1, Math.min(500, limit));
    const requestedWindow = includeAll ? Math.max(boundedLimit, MAX_INBOX_HISTORY_FETCH) : boundedLimit;
    const fetchCount = Math.max(1, Math.min(total, requestedWindow));
    const start = Math.max(1, total - fetchCount + 1);
    const range = `${start}:${total}`;
    const items: Array<{
      uid: number;
      subject: string;
      from: string;
      date: string;
      snippet: string;
      attachments: Array<{ part: string; name: string; contentType: string; sizeBytes?: number }>;
    }> = [];

    // Full-history mode avoids downloading BODY[] for every message to keep API memory/CPU stable.
    const fetchQuery = includeAll
      ? {
          uid: true,
          envelope: true,
          internalDate: true
        }
      : {
          uid: true,
          envelope: true,
          internalDate: true,
          bodyStructure: true
        };

    for await (const message of client.fetch(range, fetchQuery)) {
      const from = message.envelope?.from?.[0];
      const fromText = from
        ? `${from.name ?? ""}${from.address ? ` <${from.address}>` : ""}`.trim()
        : "Unknown";
      const sourceText = "";
      items.push({
        uid: message.uid ?? 0,
        subject: message.envelope?.subject?.trim() || "(no subject)",
        from: fromText,
        date: new Date(message.internalDate ?? new Date()).toISOString(),
        snippet: sourceText ? summarizeEmailSource(sourceText) : (message.envelope?.subject?.trim() || ""),
        attachments: includeAll ? [] : extractInboxAttachments(message.bodyStructure)
      });
    }
    const sorted = items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted.slice(0, fetchCount);
  } catch (error) {
    const imapError = error as {
      authenticationFailed?: boolean;
      responseText?: string;
      message?: string;
    };
    if (imapError?.authenticationFailed) {
      throw new Error(`IMAP authentication failed: ${imapError.responseText ?? "Incorrect login or password"}`);
    }
    throw new Error(imapError?.responseText || imapError?.message || "Unable to read inbox");
  } finally {
    await client.logout().catch(() => undefined);
  }
}

const inboxCache = new Map<string, { expiresAt: number; messages: Array<Record<string, unknown>> }>();
const inboxInFlight = new Map<string, Promise<Array<Record<string, unknown>>>>();

async function listInboxEmailsCached(ws: WorkspaceRecord, limit = 50, includeAll = false) {
  const key = `${ws.id}:${includeAll ? "all" : "recent"}:${Math.max(1, Math.min(500, limit))}`;
  const now = Date.now();
  const cached = inboxCache.get(key);
  if (cached && cached.expiresAt > now) return cached.messages;
  const existing = inboxInFlight.get(key);
  if (existing) return existing;
  const request = listInboxEmails(ws, limit, includeAll)
    .then((messages) => {
      inboxCache.set(key, { messages, expiresAt: Date.now() + INBOX_CACHE_TTL_MS });
      inboxInFlight.delete(key);
      return messages;
    })
    .catch((error) => {
      inboxInFlight.delete(key);
      throw error;
    });
  inboxInFlight.set(key, request);
  return request;
}

async function getInboxMessage(ws: WorkspaceRecord, uid: number) {
  const settings = getEffectiveEmailSettings(ws);
  if (!settings.imapHost || !settings.imapUser || !settings.imapPass) {
    throw new Error("IMAP is not configured");
  }
  const ImapFlow = await loadImapFlow();
  const client = new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort ?? 993,
    secure: settings.imapSecure,
    logger: false,
    auth: {
      user: settings.imapUser,
      pass: settings.imapPass
    }
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    let message = await client.fetchOne(
      uid,
      {
        uid: true,
        envelope: true,
        internalDate: true,
        source: true,
        bodyStructure: true
      },
      { uid: true }
    );
    if (!message) {
      for await (const entry of client.fetch(`${uid}:${uid}`, {
        uid: true,
        envelope: true,
        internalDate: true,
        source: true,
        bodyStructure: true
      }, { uid: true })) {
        message = entry;
        break;
      }
    }
    if (!message) {
      throw new Error("Email not found");
    }
    const from = message.envelope?.from?.[0];
    const fromText = from
      ? `${from.name ?? ""}${from.address ? ` <${from.address}>` : ""}`.trim()
      : "Unknown";
    const sourceText =
      typeof message.source === "string"
        ? message.source
        : Buffer.isBuffer(message.source)
          ? message.source.toString("utf8")
          : "";
    const preferredBodyPart = findPreferredBodyPart(message.bodyStructure);
    const extractedBody = preferredBodyPart
      ? await downloadInboxTextPart(client, uid, preferredBodyPart.part, preferredBodyPart.contentType)
      : "";
    const finalBody = extractedBody || (sourceText ? extractBestMimeBody(sourceText) : "");
    return {
      uid: message.uid ?? uid,
      subject: message.envelope?.subject?.trim() || "(no subject)",
      from: fromText,
      date: new Date(message.internalDate ?? new Date()).toISOString(),
      body: finalBody,
      snippet: finalBody ? summarizeEmailSource(finalBody) : (sourceText ? summarizeEmailSource(sourceText) : (message.envelope?.subject?.trim() || "")),
      attachments: extractInboxAttachments(message.bodyStructure)
    };
  } catch (error) {
    const imapError = error as {
      authenticationFailed?: boolean;
      responseText?: string;
      message?: string;
    };
    if (imapError?.authenticationFailed) {
      throw new Error(`IMAP authentication failed: ${imapError.responseText ?? "Incorrect login or password"}`);
    }
    throw new Error(imapError?.responseText || imapError?.message || "Unable to read email");
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function getInboxAttachment(ws: WorkspaceRecord, uid: number, partId: string) {
  const settings = getEffectiveEmailSettings(ws);
  if (!settings.imapHost || !settings.imapUser || !settings.imapPass) {
    throw new Error("IMAP is not configured");
  }
  const ImapFlow = await loadImapFlow();
  const client = new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort ?? 993,
    secure: settings.imapSecure,
    logger: false,
    auth: {
      user: settings.imapUser,
      pass: settings.imapPass
    }
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    const download = await client.download(uid, partId, { uid: true });
    if (!download || !download.content) {
      throw new Error("Attachment content is unavailable for this message part");
    }
    const chunks: Buffer[] = [];
    for await (const chunk of download.content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(chunks);
    const contentType = download.meta?.contentType || "application/octet-stream";
    const filename = download.meta?.filename || "attachment";
    return {
      name: filename,
      contentType,
      sizeBytes: fileBuffer.byteLength,
      base64: fileBuffer.toString("base64")
    };
  } catch (error) {
    const imapError = error as {
      authenticationFailed?: boolean;
      responseText?: string;
      message?: string;
    };
    if (imapError?.authenticationFailed) {
      throw new Error(`IMAP authentication failed: ${imapError.responseText ?? "Incorrect login or password"}`);
    }
    throw new Error(imapError?.responseText || imapError?.message || "Unable to fetch attachment");
  } finally {
    await client.logout().catch(() => undefined);
  }
}

function parseCustomerDetails(input: unknown) {
  if (!input || typeof input !== "object") return undefined;
  const source = input as Record<string, unknown>;
  const parsed = {
    contactName: typeof source.contactName === "string" ? source.contactName.trim() : undefined,
    email: typeof source.email === "string" ? source.email.trim() : undefined,
    phone: typeof source.phone === "string" ? source.phone.trim() : undefined,
    address: typeof source.address === "string" ? source.address.trim() : undefined
  };
  return Object.values(parsed).some((value) => Boolean(value)) ? parsed : undefined;
}

function detectOneDriveRoot() {
  const envRoot = process.env.ONE_DRIVE_ROOT;
  if (envRoot && fs.existsSync(envRoot)) return envRoot;
  const home = os.homedir();
  const localCandidate = path.join(home, "OneDrive");
  if (fs.existsSync(localCandidate)) return localCandidate;
  const cloudStorage = path.join(home, "Library", "CloudStorage");
  if (fs.existsSync(cloudStorage)) {
    const entries = fs.readdirSync(cloudStorage);
    const oneDrive = entries.find((entry) => entry.toLowerCase().startsWith("onedrive"));
    if (oneDrive) return path.join(cloudStorage, oneDrive);
  }
  return localCandidate;
}

function getJobnestRoot() {
  const root = process.env.JOBNEST_ROOT;
  if (root && fs.existsSync(root)) return root;
  const oneDrive = detectOneDriveRoot();
  return path.join(oneDrive, "Jobnest");
}

function getSupportMessages(ws: WorkspaceRecord) {
  return ws.supportMessages ?? [];
}

function saveSupportMessages(workspaceId: string, messages: SupportMessageRecord[]) {
  const ws = getWorkspace(workspaceId);
  upsertWorkspace({ ...ws, supportMessages: messages });
}

function mapSupportThread(workspace: WorkspaceRecord, userId: string, messages: SupportMessageRecord[]) {
  const user = getUserById(userId);
  const sorted = messages.slice().sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const last = sorted[sorted.length - 1];
  return {
    threadKey: `${workspace.id}:${userId}`,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    userId,
    userEmail: user?.email ?? sorted[0]?.userEmail ?? "unknown",
    userName: user?.name ?? sorted[0]?.userName,
    lastMessageAt: last?.createdAt ?? null,
    unreadCount: sorted.filter((message) => !message.fromOwner).length,
    messages: sorted
  };
}

function getSystemDataRoot() {
  const root = path.join(DATA_ROOT, "system");
  ensureDir(root);
  return root;
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function getCustomerFolder(customerName: string) {
  const root = getJobnestRoot();
  const customersRoot = path.join(root, "Customers");
  ensureDir(customersRoot);
  const safeName = sanitizeName(customerName) || "Customer";
  const customerFolder = path.join(customersRoot, safeName);
  ensureDir(customerFolder);
  return customerFolder;
}

function getJobsRoot() {
  const root = getJobnestRoot();
  const jobsRoot = path.join(root, "Jobs", "Active");
  ensureDir(jobsRoot);
  return jobsRoot;
}

function getCompletedJobsRoot() {
  const root = getJobnestRoot();
  const jobsRoot = path.join(root, "Jobs", "Completed");
  ensureDir(jobsRoot);
  return jobsRoot;
}

function getSafeCustomerKey(customerName?: string) {
  return sanitizeName(customerName || "Unassigned Customer") || "Unassigned Customer";
}

function getEmailModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Email");
  ensureDir(root);
  return root;
}

function getEmailDb() {
  if (!emailDbSingleton) {
    emailDbSingleton = openEmailDatabase(getEmailModuleRoot());
  }
  return emailDbSingleton;
}

function getPartDnaModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Part DNA");
  ensureDir(root);
  return root;
}

function getPartDnaArtifactRoot() {
  const root = path.join(os.homedir(), "Desktop", "Qouterx Part DNA");
  ensureDir(root);
  return root;
}

function getPartDnaDb() {
  if (!partDnaDbSingleton) {
    partDnaDbSingleton = openPartDnaDatabase(getPartDnaModuleRoot());
  }
  return partDnaDbSingleton;
}

function getSmartJobQueueModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Smart Job Queue");
  ensureDir(root);
  return root;
}

function getSmartJobQueueDb() {
  if (!smartJobQueueDbSingleton) {
    smartJobQueueDbSingleton = openSmartJobQueueDatabase(getSmartJobQueueModuleRoot());
  }
  return smartJobQueueDbSingleton;
}

function getStockMaterialModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Stock Material");
  ensureDir(root);
  return root;
}

function getStockMaterialDb() {
  if (!stockMaterialDbSingleton) {
    stockMaterialDbSingleton = openStockMaterialDatabase(getStockMaterialModuleRoot());
  }
  return stockMaterialDbSingleton;
}

function getCloudSyncModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Cloud Sync");
  ensureDir(root);
  return root;
}

function getCloudSyncDb() {
  if (!cloudSyncDbSingleton) {
    cloudSyncDbSingleton = openCloudSyncDatabase(getCloudSyncModuleRoot());
  }
  return cloudSyncDbSingleton;
}

function getManualSubscriptionModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Manual Subscriptions");
  ensureDir(root);
  return root;
}

function getCloudSubscriptionModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Cloud Subscriptions");
  ensureDir(root);
  return root;
}

function getManualSubscriptionDb() {
  if (!manualSubscriptionDbSingleton) {
    manualSubscriptionDbSingleton = openManualSubscriptionDatabase(getManualSubscriptionModuleRoot());
  }
  return manualSubscriptionDbSingleton;
}

function getCloudSubscriptionDb() {
  if (!cloudSubscriptionDbSingleton) {
    cloudSubscriptionDbSingleton = openCloudSubscriptionDatabase(getCloudSubscriptionModuleRoot());
  }
  return cloudSubscriptionDbSingleton;
}

function getBrainCoreModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Brain Core");
  ensureDir(root);
  return root;
}

function getBrainCoreDb() {
  if (!brainCoreDbSingleton) {
    brainCoreDbSingleton = openBrainCoreDatabase(getBrainCoreModuleRoot());
  }
  return brainCoreDbSingleton;
}

function getBrainPartDnaModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Brain Part DNA");
  ensureDir(root);
  return root;
}

function getBrainPartDnaDb() {
  if (!brainPartDnaDbSingleton) {
    brainPartDnaDbSingleton = openBrainPartDnaDatabase(getBrainPartDnaModuleRoot());
  }
  return brainPartDnaDbSingleton;
}

function getPartDnaBrainService() {
  return new PartDnaBrainService(getBrainPartDnaDb(), getPartDnaDb(), getBrainCoreDb());
}

function getManufacturingMemoryModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Manufacturing Memory");
  ensureDir(root);
  return root;
}

function getManufacturingMemoryDb() {
  if (!manufacturingMemoryDbSingleton) {
    manufacturingMemoryDbSingleton = openManufacturingMemoryDatabase(getManufacturingMemoryModuleRoot());
  }
  return manufacturingMemoryDbSingleton;
}

function getManufacturingMemoryService() {
  return new ManufacturingMemoryService(getManufacturingMemoryDb(), getBrainCoreDb());
}

function getProfitIntelligenceModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Profit Intelligence");
  ensureDir(root);
  return root;
}

function getProfitIntelligenceDb() {
  if (!profitIntelligenceDbSingleton) {
    profitIntelligenceDbSingleton = openProfitIntelligenceDatabase(getProfitIntelligenceModuleRoot());
  }
  return profitIntelligenceDbSingleton;
}

function getProfitIntelligenceService() {
  return new ProfitIntelligenceService(getProfitIntelligenceDb(), getBrainCoreDb(), getManufacturingMemoryService());
}

function getOffcutIntelligenceModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Offcut Intelligence");
  ensureDir(root);
  return root;
}

function getOffcutIntelligenceDb() {
  if (!offcutIntelligenceDbSingleton) {
    offcutIntelligenceDbSingleton = openOffcutIntelligenceDatabase(getOffcutIntelligenceModuleRoot());
  }
  return offcutIntelligenceDbSingleton;
}

function getOffcutIntelligenceService() {
  return new OffcutIntelligenceService(getOffcutIntelligenceDb(), getStockMaterialDb(), getBrainCoreDb());
}

function getMaterialPredictionModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Material Prediction");
  ensureDir(root);
  return root;
}

function getMaterialPredictionDb() {
  if (!materialPredictionDbSingleton) {
    materialPredictionDbSingleton = openMaterialPredictionDatabase(getMaterialPredictionModuleRoot());
  }
  return materialPredictionDbSingleton;
}

function getMaterialPredictionService() {
  return new MaterialPredictionService(getMaterialPredictionDb(), getBrainCoreDb(), getManufacturingMemoryService());
}

function getPurchasingIntelligenceModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Purchasing Intelligence");
  ensureDir(root);
  return root;
}

function getPurchasingIntelligenceDb() {
  if (!purchasingIntelligenceDbSingleton) {
    purchasingIntelligenceDbSingleton = openPurchasingIntelligenceDatabase(getPurchasingIntelligenceModuleRoot());
  }
  return purchasingIntelligenceDbSingleton;
}

function getPurchasingIntelligenceService() {
  return new PurchasingIntelligenceService(getPurchasingIntelligenceDb(), getBrainCoreDb(), getMaterialPredictionService());
}

function getProductionQueueBrainModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Production Queue Brain");
  ensureDir(root);
  return root;
}

function getProductionQueueBrainDb() {
  if (!productionQueueBrainDbSingleton) {
    productionQueueBrainDbSingleton = openProductionQueueBrainDatabase(getProductionQueueBrainModuleRoot());
  }
  return productionQueueBrainDbSingleton;
}

function getProductionQueueBrainService() {
  return new ProductionQueueBrainService(getProductionQueueBrainDb(), getBrainCoreDb(), getMaterialPredictionService());
}

function getLeadTimeIntelligenceModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Lead Time Intelligence");
  ensureDir(root);
  return root;
}

function getLeadTimeIntelligenceDb() {
  if (!leadTimeIntelligenceDbSingleton) {
    leadTimeIntelligenceDbSingleton = openLeadTimeIntelligenceDatabase(getLeadTimeIntelligenceModuleRoot());
  }
  return leadTimeIntelligenceDbSingleton;
}

function getLeadTimeIntelligenceService() {
  return new LeadTimeIntelligenceService(
    getLeadTimeIntelligenceDb(),
    getBrainCoreDb(),
    getProductionQueueBrainService(),
    getManufacturingMemoryService(),
    getPartDnaDb()
  );
}

function getSheetOptimizerModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Sheet Optimizer");
  ensureDir(root);
  return root;
}

function getSheetOptimizerDb() {
  if (!sheetOptimizerDbSingleton) {
    sheetOptimizerDbSingleton = openSheetOptimizerDatabase(getSheetOptimizerModuleRoot());
  }
  return sheetOptimizerDbSingleton;
}

function getSheetOptimizerService() {
  return new SheetOptimizerService(getSheetOptimizerDb(), getStockMaterialDb(), getBrainCoreDb(), getMaterialPredictionService());
}

function getDxfErrorDetectionModuleRoot() {
  const root = path.join(getSystemDataRoot(), "DXF Error Detection");
  ensureDir(root);
  return root;
}

function getDxfErrorDetectionDb() {
  if (!dxfErrorDetectionDbSingleton) {
    dxfErrorDetectionDbSingleton = openDxfErrorDetectionDatabase(getDxfErrorDetectionModuleRoot());
  }
  return dxfErrorDetectionDbSingleton;
}

function getDxfErrorDetectionService() {
  return new DxfErrorDetectionService(getDxfErrorDetectionDb(), getBrainCoreDb());
}

function getNestingIntelligenceModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Nesting Intelligence");
  ensureDir(root);
  return root;
}

function getNestingIntelligenceDb() {
  if (!nestingIntelligenceDbSingleton) {
    nestingIntelligenceDbSingleton = openNestingIntelligenceDatabase(getNestingIntelligenceModuleRoot());
  }
  return nestingIntelligenceDbSingleton;
}

function getNestingIntelligenceService() {
  return new NestingIntelligenceService(getNestingIntelligenceDb(), getBrainCoreDb(), getSheetOptimizerService());
}

function getNestingEngineModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Advanced Nesting Engine");
  ensureDir(root);
  return root;
}

function getNestingEngineDb() {
  if (!nestingEngineDbSingleton) {
    nestingEngineDbSingleton = openNestingEngineDatabase(getNestingEngineModuleRoot());
  }
  return nestingEngineDbSingleton;
}

function getNestingEngineService() {
  return new NestingEngineService(getNestingEngineDb(), path.join(getNestingEngineModuleRoot(), "exports"), getBrainCoreDb());
}

function getNestingExportRoot() {
  const root = path.join(process.env.QOUTERX_USER_DATA_DIR?.trim() || DATA_ROOT, "exports", "nesting");
  ensureDir(root);
  return root;
}

function getNestingWorkspaceModuleRoot() {
  const root = path.join(getSystemDataRoot(), "Nesting Workspace");
  ensureDir(root);
  return root;
}

function getNestingWorkspaceDb() {
  if (!nestingWorkspaceDbSingleton) {
    nestingWorkspaceDbSingleton = openNestingWorkspaceDatabase(getNestingWorkspaceModuleRoot());
  }
  return nestingWorkspaceDbSingleton;
}

function getNestingWorkspaceService() {
  return new NestingWorkspaceService(
    getNestingWorkspaceDb(),
    getStockMaterialDb(),
    path.join(getSystemDataRoot(), "exports", "nesting"),
    getBrainCoreDb()
  );
}

function getProductionAssistantService() {
  return new ProductionAssistantService(
    getProductionQueueBrainService(),
    getMaterialPredictionService(),
    getProfitIntelligenceService(),
    getOffcutIntelligenceService(),
    getDxfErrorDetectionService()
  );
}

function getQouterXBrainOrchestrator() {
  return new QouterXBrainOrchestrator({
    brainCore: getBrainCoreDb(),
    partDna: getPartDnaBrainService(),
    dxfErrors: getDxfErrorDetectionService(),
    offcuts: getOffcutIntelligenceService(),
    sheetOptimizer: getSheetOptimizerService(),
    profit: getProfitIntelligenceService(),
    materialPrediction: getMaterialPredictionService(),
    purchasing: getPurchasingIntelligenceService(),
    queue: getProductionQueueBrainService(),
    leadTime: getLeadTimeIntelligenceService(),
    manufacturingMemory: getManufacturingMemoryService(),
    nesting: getNestingIntelligenceService(),
    cloudSync: getCloudSyncDb(),
    manualSubscriptions: getManualSubscriptionDb()
  });
}

function getEventBrainModules(): BrainModule[] {
  return [
    partDnaModule,
    manufacturingMemoryModule,
    profitModule,
    materialPredictionModule,
    productionQueueModule,
    leadTimeModule,
    offcutsModule,
    sheetOptimizerModule,
    nestingModule,
    dxfErrorsModule,
    purchasingModule,
    assistantModule
  ];
}

function getEventBrainOrchestrator() {
  if (!eventBrainOrchestratorSingleton) {
    const brain = getBrainCoreDb();
    eventBrainOrchestratorSingleton = new EventBrainOrchestrator(
      brain.eventBus,
      getEventBrainModules(),
      brain.cache,
      brain.taskService
    );
  }
  return eventBrainOrchestratorSingleton;
}

function buildSyntheticSmartQueueJobFromQuote(workspaceId: string, quote: QuoteRecord): SmartJobRecord | null {
  const parts = Object.values(quote.sections ?? {}).flatMap((section) => section.parts ?? []);
  if (!parts.length) return null;
  const material = parts.find((part) => typeof part.material === "string" && part.material.trim())?.material?.trim() || "Unknown Material";
  const thickness =
    parts.find((part) => Number.isFinite(Number(part.thicknessMm)) && Number(part.thicknessMm) > 0)?.thicknessMm ?? null;
  const cutLength = parts.reduce((sum, part) => sum + (Number(part.cutLengthMm) || 0) * Math.max(1, Number(part.quantity) || 1), 0);
  const pierceCount = parts.reduce((sum, part) => sum + (Number(part.pierceCount) || 0) * Math.max(1, Number(part.quantity) || 1), 0);
  const estimatedCutTimeMinutes = Math.max(1, Math.round(cutLength / 900 + pierceCount * 0.12));
  const partDnaId =
    parts.find((part) => Number.isFinite(Number(part.partDnaId)) && Number(part.partDnaId) > 0)?.partDnaId ?? null;
  const totalAreaSqm = parts.reduce(
    (sum, part) => sum + ((Number(part.lengthMm) || 0) * (Number(part.widthMm) || 0) * Math.max(1, Number(part.quantity) || 1)) / 1_000_000,
    0
  );
  const estimatedSetupTimeMinutes = Math.max(8, Math.min(30, 8 + parts.length * 2));
  return {
    id: -Number(String(Date.parse(quote.createdAt) || Date.now()).slice(-8)),
    workspaceId,
    legacyJobId: null,
    customerName: quote.customerName ?? null,
    customerId: null,
    jobNumber: quote.quoteNumber,
    quoteId: quote.id,
    title: quote.title || `${quote.quoteNumber} lead-time estimate`,
    status: quote.status === "accepted" ? "ready" : "pending",
    priority: quote.status === "accepted" ? "urgent" : "normal",
    dueDate: null,
    material,
    thickness,
    sheetSize: totalAreaSqm > 5 ? "3000x1500" : "2500x1250",
    estimatedCutTimeMinutes,
    estimatedSetupTimeMinutes,
    estimatedPierceCount: pierceCount,
    estimatedCutLength: cutLength,
    dxfFilePath: parts.some((part) => part.dxfName || part.geometryHash || part.partDnaId) ? quote.quoteDxfPath ?? `quote:${quote.id}` : null,
    partDnaId,
    manualSortOrder: null,
    actualCutTimeMinutes: null,
    manuallyMarkedReady: quote.status === "accepted",
    createdAt: quote.createdAt,
    updatedAt: quote.createdAt
  };
}

function calculateProfitForWorkspaceJob(workspaceId: string, legacyJobId: string) {
  const ws = getWorkspace(workspaceId);
  const legacyJob = ws.jobs.find((entry) => entry.id === legacyJobId);
  if (!legacyJob) return null;
  const quote = legacyJob.quoteNumber ? ws.quotes.find((entry) => entry.quoteNumber === legacyJob.quoteNumber) : undefined;
  const customer = legacyJob.customerName
    ? ws.customers.find((entry) => entry.name.trim().toLowerCase() === legacyJob.customerName?.trim().toLowerCase())
    : undefined;
  const queueJob = buildSmartQueueSnapshot(getSmartJobQueueDb(), workspaceId, buildSmartQueueServicesForWorkspace(workspaceId)).jobs.find(
    (entry) => entry.legacyJobId === legacyJob.id
  );
  const dxfParts = legacyJob.jobDxfParts ?? [];
  const cutLengthMm = dxfParts.reduce((sum, part) => sum + (Number(part.cutLengthMm) || 0) * Math.max(1, Number(part.quantity) || 1), 0);
  const totalAreaSqm = dxfParts.reduce(
    (sum, part) => sum + ((Number(part.widthMm) || 0) * (Number(part.heightMm) || 0) * Math.max(1, Number(part.quantity) || 1)) / 1_000_000,
    0
  );
  const material = dxfParts.find((part) => typeof part.material === "string" && part.material.trim())?.material ?? "Unknown Material";
  const thickness =
    dxfParts.find((part) => typeof part.thicknessMm === "number" && Number.isFinite(part.thicknessMm))?.thicknessMm ?? queueJob?.thickness ?? null;
  const partDnaId =
    dxfParts.find((part) => typeof part.partDnaId === "number" && Number.isFinite(part.partDnaId))?.partDnaId ?? queueJob?.partDnaId ?? null;
  const revenue =
    typeof legacyJob.price === "number" && Number.isFinite(legacyJob.price)
      ? legacyJob.price
      : typeof quote?.total === "number" && Number.isFinite(quote.total)
        ? quote.total
        : null;
  return getProfitIntelligenceService().calculateForJob({
    workspaceId,
    jobId: legacyJob.id,
    quoteId: quote?.id ?? null,
    customerId: customer?.id ?? legacyJob.customerName ?? null,
    partDnaId,
    material,
    thickness,
    revenue,
    jobPrice: legacyJob.price ?? null,
    jobCost: legacyJob.cost ?? null,
    estimatedCutTimeMinutes: queueJob?.estimatedCutTimeMinutes ?? null,
    actualCutTimeMinutes: queueJob?.actualCutTimeMinutes ?? null,
    estimatedSetupTimeMinutes: queueJob?.estimatedSetupTimeMinutes ?? null,
    cutLengthMm,
    pierceCount: dxfParts.reduce((sum, part) => sum + (Number(part.pierceCount) || 0) * Math.max(1, Number(part.quantity) || 1), 0),
    totalAreaSqm
  });
}

function getRequestedWorkspaceId(req: express.Request) {
  const fromQuery = typeof req.query?.workspaceId === "string" ? req.query.workspaceId.trim() : "";
  const fromBody = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  return fromQuery || fromBody || "";
}

function recordBrainEvent(input: {
  workspaceId: string;
  eventType: BrainEventType;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  links?: Array<{
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    linkType: string;
  }>;
}) {
  try {
    const event = getBrainCoreDb().eventService.recordEvent({
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: {
        workspaceId: input.workspaceId,
        ...input.payload
      },
      links: input.links
    });
    const timer = setTimeout(() => {
      try {
        getManufacturingMemoryService().ingestEvent(event);
      } catch (error) {
        console.error("[manufacturing-memory] ingest failed:", error instanceof Error ? error.message : error);
      }
      getEventBrainOrchestrator().processPendingEvents(10).catch((error: unknown) => {
        console.error("[brain] outbox processing failed:", error instanceof Error ? error.message : error);
      });
    }, 0);
    timer.unref?.();
    return event;
  } catch (error) {
    console.error("[brain] event record failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

function sanitizeCloudPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeCloudPayload(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const sensitiveKeys = ["password", "pass", "secret", "token", "smtpPass", "imapPass", "refreshToken", "accessToken"];
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
      if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))) {
        return [];
      }
      return [[key, sanitizeCloudPayload(entry)]];
    })
  );
}

function normalizeCloudPlatform(value: unknown): CloudDevicePlatform {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (candidate === "macos" || candidate === "windows" || candidate === "linux") return candidate as CloudDevicePlatform;
  if (candidate === "darwin" || candidate === "mac") return "macos";
  if (candidate === "win32") return "windows";
  return "unknown";
}

async function cloudApiFetchJson(pathname: string, input: { method?: string; body?: Record<string, unknown> }) {
  const url = `${CLOUD_API_URL}${pathname}`;
  const response = await fetch(url, {
    method: input.method ?? "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `Cloud API request failed (${response.status})`);
  }
  return data;
}

async function createCloudAccountRequest(input: {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  deviceId: string;
  deviceName: string;
  platform: CloudDevicePlatform;
}) {
  if (CLOUD_API_URL) {
    return cloudApiFetchJson("/api/account-requests", { method: "POST", body: input });
  }
  return getCloudSubscriptionDb().createAccountRequest(input);
}

async function sendCloudHeartbeat(input: {
  companyId?: string | null;
  deviceId: string;
  deviceName: string;
  platform: CloudDevicePlatform;
  appVersion: string;
}) {
  if (CLOUD_API_URL) {
    return cloudApiFetchJson("/api/devices/heartbeat", { method: "POST", body: input });
  }
  return getCloudSubscriptionDb().heartbeat(input);
}

async function registerCloudDevice(input: {
  companyId: string;
  deviceId: string;
  deviceName: string;
  platform: CloudDevicePlatform;
  appVersion: string;
}) {
  if (CLOUD_API_URL) {
    return cloudApiFetchJson("/api/devices/register", { method: "POST", body: input });
  }
  return getCloudSubscriptionDb().registerDevice(input);
}

async function fetchCloudSubscriptionStatus(deviceId: string) {
  if (CLOUD_API_URL) {
    const url = `${CLOUD_API_URL}/api/subscriptions/status?deviceId=${encodeURIComponent(deviceId)}`;
    const response = await fetch(url);
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : "Failed to fetch cloud subscription status.");
    }
    return data;
  }
  return getCloudSubscriptionDb().getSubscriptionStatusByDevice(deviceId);
}

async function syncLocalSubscriptionSnapshot(input: {
  workspaceId: string;
  deviceId: string;
  deviceName: string;
  platform: CloudDevicePlatform;
}) {
  const snapshot = await fetchCloudSubscriptionStatus(input.deviceId);
  const company = snapshot && typeof snapshot === "object" && "company" in snapshot
    ? (snapshot as {
        company?: {
          id: string;
          companyName: string;
          contactName: string;
          email: string;
          phone: string;
          manualPaymentReference: string;
          subscriptionStatus: string;
          planName: string;
          subscriptionStartDate: string | null;
          subscriptionEndDate: string | null;
          graceUntil: string | null;
        } | null;
        device?: { isAllowed?: boolean } | null;
      }).company
    : null;
  if (company) {
    getManualSubscriptionDb().applyExternalSnapshot({
      companyId: company.id,
      companyName: company.companyName,
      contactName: company.contactName,
      email: company.email,
      phone: company.phone,
      manualPaymentReference: company.manualPaymentReference,
      subscriptionStatus: (
        ["pending", "trial", "active", "expired", "suspended", "cancelled"].includes(company.subscriptionStatus)
          ? company.subscriptionStatus
          : "pending"
      ) as ManualSubscriptionStatus,
      planName: company.planName,
      subscriptionStartDate: company.subscriptionStartDate,
      subscriptionEndDate: company.subscriptionEndDate,
      graceUntil: company.graceUntil
    });
    getManualSubscriptionDb().markDeviceSeen({
      companyId: company.id,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      isAllowed: Boolean(
        (snapshot as { device?: { isAllowed?: boolean } | null }).device?.isAllowed ??
        (snapshot as { hasAccess?: boolean }).hasAccess
      )
    });
    await registerCloudDevice({
      companyId: company.id,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      platform: input.platform,
      appVersion: APP_VERSION
    });
  }
  return snapshot;
}

function buildSmartQueueServicesForWorkspace(workspaceId: string): SmartQueueServices {
  const ws = getWorkspace(workspaceId);
  return {
    ...createPlaceholderSmartQueueServices(),
    dxfService: {
      hasValidDxf: (job) => {
        if (job.dxfFilePath && fs.existsSync(job.dxfFilePath)) return true;
        const legacy = ws.jobs.find((entry) => entry.id === job.legacyJobId);
        return Boolean(legacy?.jobDxfParts?.length);
      },
      getDxfStats: (job) => {
        const legacy = ws.jobs.find((entry) => entry.id === job.legacyJobId);
        const parts = legacy?.jobDxfParts ?? [];
        if (!parts.length) return null;
        return {
          estimatedPierceCount: parts.reduce((sum, part) => sum + part.pierceCount * part.quantity, 0),
          estimatedCutLength: parts.reduce((sum, part) => sum + part.cutLengthMm * part.quantity, 0),
          estimatedCutTimeMinutes: Math.max(
            1,
            Math.round(parts.reduce((sum, part) => sum + part.cutLengthMm * part.quantity, 0) / 900)
          ),
          sheetSize: `${Math.round(parts.reduce((max, part) => Math.max(max, part.widthMm), 0))}x${Math.round(
            parts.reduce((max, part) => Math.max(max, part.heightMm), 0)
          )}`
        };
      }
    },
    quoteService: {
      getApprovedQuote: (quoteId) => {
        const quote = ws.quotes.find((entry) => entry.id === quoteId && entry.status === "accepted");
        return quote ? { id: quote.id } : null;
      }
    },
    partDnaService: {
      getPartById: (id) => {
        const payload = listPartHistory(getPartDnaDb(), workspaceId, id);
        return payload.part ? { id: payload.part.id, partCode: payload.part.partCode } : null;
      },
      updateActualCutTime: (partDnaId, jobId, actualMinutes) => {
        updatePartActualCutTime(getPartDnaDb(), workspaceId, partDnaId, {
          jobId,
          actualMinutes
        });
      }
    }
  };
}

function syncWorkspaceSmartQueue(workspaceId: string) {
  const ws = getWorkspace(workspaceId);
  syncWorkspaceJobsToSmartQueue(getSmartJobQueueDb(), workspaceId, {
    jobs: ws.jobs,
    quotes: ws.quotes.map((quote) => ({ id: quote.id, quoteNumber: quote.quoteNumber, status: quote.status })),
    customers: ws.customers.map((customer) => ({ id: customer.id, name: customer.name }))
  });
}

function buildNestingCandidatesForWorkspace(workspaceId: string, queueJobs: SmartJobRecord[]): NestingPartCandidate[] {
  const ws = getWorkspace(workspaceId);
  const legacyJobsById = new Map(ws.jobs.map((job) => [job.id, job]));
  const candidates: NestingPartCandidate[] = [];
  for (const job of queueJobs) {
    if (!job.legacyJobId) continue;
    const legacyJob = legacyJobsById.get(job.legacyJobId);
    const parts = legacyJob?.jobDxfParts ?? [];
    for (const part of parts) {
      const material = part.material?.trim() || job.material.trim();
      const thickness = Number(part.thicknessMm ?? job.thickness ?? 0);
      const width = Number(part.widthMm ?? 0);
      const height = Number(part.heightMm ?? 0);
      if (!material || !Number.isFinite(thickness) || thickness <= 0) continue;
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) continue;
      candidates.push({
        jobId: job.id,
        quoteId: job.quoteId ?? null,
        partDnaId: part.partDnaId ?? job.partDnaId ?? null,
        quantity: Math.max(1, Number(part.quantity) || 1),
        width,
        height,
        cutLength: Math.max(0, Number(part.cutLengthMm) || 0),
        pierceCount: Math.max(0, Number(part.pierceCount) || 0),
        material,
        thickness
      });
    }
  }
  return candidates;
}

function buildBrainRunContext(workspaceId: string) {
  syncWorkspaceSmartQueue(workspaceId);
  const ws = getWorkspace(workspaceId);
  const services = buildSmartQueueServicesForWorkspace(workspaceId);
  const queueSnapshot = buildSmartQueueSnapshot(getSmartJobQueueDb(), workspaceId, services);
  const stockSnapshot = getStockSnapshot(getStockMaterialDb());
  const nestingParts = buildNestingCandidatesForWorkspace(workspaceId, queueSnapshot.jobs);
  return { ws, services, queueSnapshot, stockSnapshot, nestingParts };
}

function buildDefaultOffcutRequestForJob(job: SmartJobRecord) {
  const widthGuess = typeof job.sheetSize === "string" && job.sheetSize.includes("x")
    ? Number(job.sheetSize.split("x")[0]) || 0
    : 0;
  const heightGuess = typeof job.sheetSize === "string" && job.sheetSize.includes("x")
    ? Number(job.sheetSize.split("x")[1]) || 0
    : 0;
  if (!job.material.trim() || !Number.isFinite(Number(job.thickness)) || Number(job.thickness) <= 0 || widthGuess <= 0 || heightGuess <= 0) {
    return null;
  }
  return {
    material: job.material,
    thickness: Number(job.thickness),
    requiredWidth: widthGuess,
    requiredHeight: heightGuess,
    jobId: String(job.id),
    partDnaId: job.partDnaId ?? null,
    entityLabel: job.title
  };
}

function buildDefaultSheetRequestForQuote(quote: QuoteRecord) {
  const parts = Object.values(quote.sections ?? {}).flatMap((section) => section.parts ?? []);
  const material = parts.find((part) => typeof part.material === "string" && part.material.trim())?.material?.trim() || "";
  const thickness = Number(parts.find((part) => Number.isFinite(Number(part.thicknessMm)) && Number(part.thicknessMm) > 0)?.thicknessMm ?? 0);
  const requiredWidth = Math.max(...parts.map((part) => Number(part.widthMm) || 0), 0);
  const requiredHeight = Math.max(...parts.map((part) => Number(part.heightMm) || 0), 0);
  if (!material || thickness <= 0 || requiredWidth <= 0 || requiredHeight <= 0) return null;
  return {
    material,
    thickness,
    requiredWidth,
    requiredHeight,
    quoteId: quote.id
  };
}

function runBrainFromEvent(input: {
  workspaceId: string;
  eventType: BrainEventType;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
}) {
  const eventType = input.eventType;
  if (!["dxf_imported", "quote_created", "quote_accepted", "job_created", "job_started", "job_completed", "purchase_order_detected"].includes(eventType)) {
    return;
  }
  try {
    const context = buildBrainRunContext(input.workspaceId);
    const orchestrator = getQouterXBrainOrchestrator();
    const queueJob = input.entityType === "job"
      ? context.queueSnapshot.jobs.find((entry) => entry.legacyJobId === input.entityId || String(entry.id) === input.entityId)
      : null;
    const quote = input.entityType === "quote" ? context.ws.quotes.find((entry) => entry.id === input.entityId) : null;
    orchestrator.run({
      workspaceId: input.workspaceId,
      mode: "quick",
      triggerEventType: eventType,
      jobs: context.queueSnapshot.jobs,
      quotes: context.ws.quotes,
      stockSnapshot: context.stockSnapshot,
      services: context.services,
      nestingParts: context.nestingParts,
      leadTimeTargetJobId: queueJob?.id ?? null,
      offcutRequest: queueJob ? buildDefaultOffcutRequestForJob(queueJob) : null,
      sheetRequest: quote ? buildDefaultSheetRequestForQuote(quote) : null
    });
    if (eventType === "job_completed" && input.entityType === "job") {
      calculateProfitForWorkspaceJob(input.workspaceId, input.entityId);
      orchestrator.run({
        workspaceId: input.workspaceId,
        mode: "module-specific",
        modules: ["manufacturing_memory", "materials", "purchasing"],
        jobs: context.queueSnapshot.jobs,
        quotes: context.ws.quotes,
        stockSnapshot: context.stockSnapshot,
        services: context.services,
        nestingParts: context.nestingParts
      });
    }
  } catch (error) {
    console.error("[brain-orchestrator] event run failed:", error instanceof Error ? error.message : error);
  }
}

function applySmartJobToLegacyWorkspace(workspaceId: string, smartJob: SmartJobRecord) {
  if (!smartJob.legacyJobId) return;
  const ws = getWorkspace(workspaceId);
  const currentJob = ws.jobs.find((job) => job.id === smartJob.legacyJobId);
  if (!currentJob) return;
  const legacyStatus = mapSmartStatusToLegacy(smartJob.status);
  let nextJob: JobRecord = {
    ...currentJob,
    title: smartJob.title,
    status: legacyStatus,
    customerName: smartJob.customerName ?? currentJob.customerName
  };
  if (legacyStatus === "done" && currentJob.status !== "done") {
    nextJob = finalizeCompletedJob(nextJob, ws.jobs);
  } else if (legacyStatus !== "done" && currentJob.status === "done") {
    nextJob = reopenJobAsIncomplete(nextJob);
  }
  updateWorkspaceJobs(
    workspaceId,
    ws.jobs.map((job) => (job.id === smartJob.legacyJobId ? nextJob : job))
  );
}

function getGraphAccessTokenFromRequest(req: express.Request) {
  const token = typeof req.headers["x-ms-access-token"] === "string" ? req.headers["x-ms-access-token"].trim() : "";
  if (!token) {
    throw new Error("Microsoft access token missing");
  }
  return token;
}

function formatSenderDisplay(name?: string, email?: string) {
  const safeName = name?.trim() ?? "";
  const safeEmail = email?.trim() ?? "";
  if (safeName && safeEmail) return `${safeName} <${safeEmail}>`;
  return safeEmail || safeName || "Unknown";
}

function mapStoredEmailToInboxMessage(email: ReturnType<typeof getStoredEmail> extends infer T ? T : never) {
  if (!email) return null;
  return {
    uid: email.id,
    id: email.id,
    graphMessageId: email.graphMessageId,
    folder: email.folder,
    subject: email.subject,
    from: formatSenderDisplay(email.senderName, email.senderEmail),
    senderName: email.senderName,
    senderEmail: email.senderEmail,
    date: email.receivedAt,
    snippet: email.bodyPreview,
    body: email.bodyText ?? email.bodyPreview,
    bodyHtml: email.bodyHtml ?? undefined,
    hasAttachments: email.hasAttachments,
    isRead: email.isRead,
    importance: email.importance ?? undefined,
    detectedType: email.detectedType,
    detectionConfidence: email.detectionConfidence,
    detectionReasons: email.detectionReasons,
    extractedPoNumber: email.extractedPoNumber ?? undefined,
    extractedQuoteReference: email.extractedQuoteReference ?? undefined,
    extractedMaterial: email.extractedMaterial ?? undefined,
    extractedThicknessMm: email.extractedThicknessMm ?? undefined,
    extractedQuantity: email.extractedQuantity ?? undefined,
    customerId: email.customerId ?? undefined,
    quoteId: email.quoteId ?? undefined,
    purchaseOrderId: email.purchaseOrderId ?? undefined,
    attachments: email.attachments.map((attachment) => ({
      id: attachment.id,
      graphAttachmentId: attachment.graphAttachmentId,
      part: String(attachment.id),
      name: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      localPath: attachment.localPath ?? undefined,
      attachmentType: attachment.attachmentType,
      importedToDxfReader: attachment.importedToDxfReader
    }))
  };
}

function getActiveJobFolder(jobNumber: string, customerName?: string) {
  const folder = path.join(getJobsRoot(), getSafeCustomerKey(customerName), sanitizeName(jobNumber) || jobNumber);
  ensureDir(folder);
  return folder;
}

function getCompletedJobFolder(jobNumber: string, customerName?: string) {
  const folder = path.join(getCompletedJobsRoot(), getSafeCustomerKey(customerName), sanitizeName(jobNumber) || jobNumber);
  ensureDir(path.dirname(folder));
  return folder;
}

function getCustomerJobFolder(customerName: string, status: "active" | "completed", jobNumber: string, create = true) {
  const base = getCustomerFolder(customerName);
  const statusFolder = status === "active" ? "Active" : "Completed";
  const folder = path.join(base, statusFolder, sanitizeName(jobNumber) || jobNumber);
  if (create) ensureDir(folder);
  return folder;
}

function ensureUniquePath(desiredPath: string) {
  if (!fs.existsSync(desiredPath)) return desiredPath;
  let count = 2;
  while (true) {
    const candidate = `${desiredPath} (${count})`;
    if (!fs.existsSync(candidate)) return candidate;
    count += 1;
  }
}

function copyFileSafe(sourcePath: string, targetPath: string) {
  if (!sourcePath || !targetPath) return;
  if (!fs.existsSync(sourcePath)) return;
  if (path.resolve(sourcePath) === path.resolve(targetPath)) return;
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function moveDirectoryContents(sourceDir: string, targetDir: string) {
  if (!fs.existsSync(sourceDir)) return;
  ensureDir(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      moveDirectoryContents(sourcePath, targetPath);
      if (fs.existsSync(sourcePath) && fs.readdirSync(sourcePath).length === 0) {
        fs.rmdirSync(sourcePath);
      }
      continue;
    }
    if (!fs.existsSync(targetPath)) {
      fs.renameSync(sourcePath, targetPath);
      continue;
    }
    const parsed = path.parse(entry.name);
    let duplicateIndex = 2;
    let candidate = path.join(targetDir, `${parsed.name} (${duplicateIndex})${parsed.ext}`);
    while (fs.existsSync(candidate)) {
      duplicateIndex += 1;
      candidate = path.join(targetDir, `${parsed.name} (${duplicateIndex})${parsed.ext}`);
    }
    fs.renameSync(sourcePath, candidate);
  }
  if (fs.existsSync(sourceDir) && fs.readdirSync(sourceDir).length === 0) {
    fs.rmdirSync(sourceDir);
  }
}

function writeLinkPointer(linkPath: string, targetPath: string) {
  ensureDir(path.dirname(linkPath));
  if (fs.existsSync(linkPath)) return;
  try {
    fs.symlinkSync(targetPath, linkPath);
  } catch {
    fs.writeFileSync(linkPath, `Main completed job folder:\n${targetPath}\n`, "utf8");
  }
}

function resolveRepeatMainFolder(job: JobRecord, wsJobs: JobRecord[]) {
  if (!job.repeatOfJobId) return undefined;
  const sourceJob = wsJobs.find((entry) => entry.id === job.repeatOfJobId);
  if (!sourceJob) return undefined;
  if (sourceJob.status === "done" && sourceJob.jobFolder && fs.existsSync(sourceJob.jobFolder)) {
    return sourceJob.jobFolder;
  }
  const guessed = getCompletedJobFolder(sourceJob.jobNumber, sourceJob.customerName ?? job.customerName);
  return fs.existsSync(guessed) ? guessed : undefined;
}

function copyJobCardToCustomerFolder(job: JobRecord) {
  if (!job.customerName || !job.jobCardPath || !fs.existsSync(job.jobCardPath)) return;
  const statusFolder = job.status === "done" ? "completed" : "active";
  const customerJobFolder = getCustomerJobFolder(job.customerName, statusFolder, job.jobNumber);
  copyFileSafe(job.jobCardPath, path.join(customerJobFolder, path.basename(job.jobCardPath)));
}

function writeStartJobLinks(job: JobRecord) {
  if (!job.jobFolder || !fs.existsSync(job.jobFolder)) return;
  const startUrl = `${API_PUBLIC_URL}/api/scan/start?token=${encodeURIComponent(job.qrToken)}`;
  const urlShortcut = `[InternetShortcut]\nURL=${startUrl}\n`;
  const txtShortcut = `Open this link to set job in progress:\n${startUrl}\n`;
  fs.writeFileSync(path.join(job.jobFolder, "START_JOB.url"), urlShortcut, "utf8");
  fs.writeFileSync(path.join(job.jobFolder, "START_JOB_LINK.txt"), txtShortcut, "utf8");
  if (job.customerName) {
    const customerActiveFolder = getCustomerJobFolder(job.customerName, "active", job.jobNumber);
    fs.writeFileSync(path.join(customerActiveFolder, "START_JOB.url"), urlShortcut, "utf8");
    fs.writeFileSync(path.join(customerActiveFolder, "START_JOB_LINK.txt"), txtShortcut, "utf8");
  }
}

function markJobInProgressByToken(token: string, source: string) {
  const found = findJobByToken(token);
  if (!found) return { ok: false as const, error: "job not found" };
  const ws = getWorkspace(found.workspaceId);
  let changed = false;
  let updatedJob: JobRecord | undefined;
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const jobs = ws.jobs.map((job) => {
    if (job.id !== found.job.id) return job;
    if (job.status === "done") {
      updatedJob = job;
      return job;
    }
    if (job.status !== "in_progress") changed = true;
    updatedJob = {
      ...job,
      status: "in_progress",
      lastFileOpenedAt: nowIso,
      lastFileActivityAtMs: nowMs
    };
    return updatedJob;
  });
  if (changed) {
    updateWorkspaceJobs(found.workspaceId, jobs);
    io.to("general").emit("system", `Job moved to in process (${source}).`);
  }
  return { ok: true as const, job: updatedJob };
}

function finalizeCompletedJob(job: JobRecord, wsJobs: JobRecord[]) {
  let nextJob = { ...job, status: "done" as const };
  const previousJobFolder = nextJob.jobFolder;
  const previousCardPath = nextJob.jobCardPath;

  if (previousJobFolder && fs.existsSync(previousJobFolder)) {
    const targetFolder = getCompletedJobFolder(nextJob.jobNumber, nextJob.customerName);
    if (path.resolve(previousJobFolder) !== path.resolve(targetFolder)) {
      moveDirectoryContents(previousJobFolder, targetFolder);
    }
    nextJob.jobFolder = targetFolder;
  }

  if (nextJob.customerName) {
    const customerActive = getCustomerJobFolder(nextJob.customerName, "active", nextJob.jobNumber, false);
    const customerCompleted = getCustomerJobFolder(nextJob.customerName, "completed", nextJob.jobNumber, false);
    if (fs.existsSync(customerActive)) {
      moveDirectoryContents(customerActive, customerCompleted);
    } else {
      ensureDir(customerCompleted);
    }
  }

  if (previousCardPath) {
    const cardName = path.basename(previousCardPath);
    if (nextJob.jobFolder) {
      const completedCard = path.join(nextJob.jobFolder, cardName);
      if (!fs.existsSync(completedCard) && fs.existsSync(previousCardPath)) {
        copyFileSafe(previousCardPath, completedCard);
      }
      nextJob.jobCardPath = completedCard;
    }
    copyJobCardToCustomerFolder(nextJob);
  }

  if (previousJobFolder && nextJob.jobFolder && job.fileLinks?.length) {
    nextJob.fileLinks = job.fileLinks.map((file) => ({
      ...file,
      linkPath: file.linkPath.startsWith(previousJobFolder)
        ? path.join(nextJob.jobFolder!, path.relative(previousJobFolder, file.linkPath))
        : file.linkPath
    }));
  }

  const repeatMain = resolveRepeatMainFolder(nextJob, wsJobs);
  if (repeatMain && nextJob.jobFolder && fs.existsSync(repeatMain) && path.resolve(repeatMain) !== path.resolve(nextJob.jobFolder)) {
    writeLinkPointer(path.join(nextJob.jobFolder, "Main Completed Job"), repeatMain);
  }

  return nextJob;
}

function reopenJobAsIncomplete(job: JobRecord) {
  let nextJob: JobRecord = { ...job, status: "incomplete" };
  const previousFolder = nextJob.jobFolder;

  const activeFolder = getActiveJobFolder(nextJob.jobNumber, nextJob.customerName);
  if (previousFolder && fs.existsSync(previousFolder) && path.resolve(previousFolder) !== path.resolve(activeFolder)) {
    moveDirectoryContents(previousFolder, activeFolder);
  } else {
    ensureDir(activeFolder);
  }
  nextJob.jobFolder = activeFolder;

  if (nextJob.customerName) {
    const customerCompleted = getCustomerJobFolder(nextJob.customerName, "completed", nextJob.jobNumber, false);
    const customerActive = getCustomerJobFolder(nextJob.customerName, "active", nextJob.jobNumber, false);
    if (fs.existsSync(customerCompleted)) {
      moveDirectoryContents(customerCompleted, customerActive);
    } else {
      ensureDir(customerActive);
    }
  }

  if (nextJob.jobCardPath) {
    const cardName = path.basename(nextJob.jobCardPath);
    const nextCardPath = path.join(activeFolder, cardName);
    if (fs.existsSync(nextJob.jobCardPath) && path.resolve(nextJob.jobCardPath) !== path.resolve(nextCardPath)) {
      copyFileSafe(nextJob.jobCardPath, nextCardPath);
    }
    nextJob.jobCardPath = nextCardPath;
  } else {
    nextJob.jobCardPath = path.join(activeFolder, `${nextJob.jobNumber}.pdf`);
  }

  if (job.fileLinks?.length) {
    nextJob.fileLinks = job.fileLinks.map((file) => {
      const sourcePath = fs.existsSync(file.linkPath) ? file.linkPath : file.originalPath;
      const nextFilePath = path.join(activeFolder, file.fileName);
      if (sourcePath && fs.existsSync(sourcePath)) {
        copyFileSafe(sourcePath, nextFilePath);
      }
      const nextOriginalPath = nextJob.customerName
        ? path.join(getCustomerJobFolder(nextJob.customerName, "active", nextJob.jobNumber), file.fileName)
        : file.originalPath;
      if (nextOriginalPath && fs.existsSync(nextFilePath)) {
        copyFileSafe(nextFilePath, nextOriginalPath);
      }
      return {
        ...file,
        linkPath: nextFilePath,
        originalPath: nextOriginalPath
      };
    });
  }

  copyJobCardToCustomerFolder(nextJob);
  writeStartJobLinks(nextJob);
  return nextJob;
}

function getQuotesRoot() {
  const candidates = [
    process.env.REIMEC_QUOTES_ROOT,
    path.join(os.homedir(), "Desktop", "Qouter X Quotes"),
    path.resolve(DATA_ROOT, "data", "quotes")
  ].filter((value): value is string => Boolean(value && value.trim()));

  for (const candidate of candidates) {
    try {
      ensureDir(candidate);
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch {
      // try next writable location
    }
  }
  throw new Error("No writable quotes folder available");
}

function getInvoicesRoot() {
  const candidates = [
    process.env.REIMEC_INVOICES_ROOT,
    path.join(os.homedir(), "Desktop", "Qouter X Invoices"),
    path.resolve(DATA_ROOT, "data", "invoices")
  ].filter((value): value is string => Boolean(value && value.trim()));

  for (const candidate of candidates) {
    try {
      ensureDir(candidate);
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch {
      // try next writable location
    }
  }
  throw new Error("No writable invoices folder available");
}

function getCustomerQuotesFolder(customerName?: string) {
  const quotesRoot = getQuotesRoot();
  const safeCustomer = sanitizeName(customerName || "Unassigned Customer") || "Unassigned Customer";
  const folder = path.join(quotesRoot, safeCustomer);
  ensureDir(folder);
  return folder;
}

function getCustomerInvoicesFolder(customerName?: string) {
  const invoicesRoot = getInvoicesRoot();
  const safeCustomer = sanitizeName(customerName || "Unassigned Customer") || "Unassigned Customer";
  const folder = path.join(invoicesRoot, safeCustomer);
  ensureDir(folder);
  return folder;
}

function getQuotePdfPathForCustomer(quote: QuoteRecord) {
  const fileName = `${sanitizeName(quote.quoteNumber) || quote.quoteNumber}.pdf`;
  return path.join(getCustomerQuotesFolder(quote.customerName), fileName);
}

function getInvoicePdfPathForCustomer(quote: QuoteRecord) {
  const baseName = sanitizeName(quote.quoteNumber) || quote.quoteNumber;
  return path.join(getCustomerInvoicesFolder(quote.customerName), `${baseName}-Invoice.pdf`);
}

async function migrateWorkspaceQuoteFiles(workspaceId: string) {
  const ws = getWorkspace(workspaceId);
  let changed = false;
  const nextQuotes: QuoteRecord[] = [];

  for (const quote of ws.quotes) {
    const targetPath = getQuotePdfPathForCustomer(quote);
    const currentPath = quote.quotePdfPath;
    const invoiceTargetPath = getInvoicePdfPathForCustomer(quote);
    const currentInvoicePath = quote.invoicePdfPath;
    let nextQuote = quote;
    if (currentPath !== targetPath) {
      try {
        ensureDir(path.dirname(targetPath));
        if (currentPath && fs.existsSync(currentPath) && currentPath !== targetPath) {
          if (fs.existsSync(targetPath)) {
            try {
              fs.unlinkSync(currentPath);
            } catch {
              // ignore cleanup failure
            }
          } else {
            fs.renameSync(currentPath, targetPath);
          }
        } else if (!fs.existsSync(targetPath)) {
          await writeQuotePdf(quote, targetPath, { documentType: "quote" });
        }
      } catch {
        // leave quote unchanged if migration fails for this record
      }
      nextQuote = { ...nextQuote, quotePdfPath: targetPath };
      changed = true;
    } else if (!currentPath || !fs.existsSync(currentPath)) {
      try {
        ensureDir(path.dirname(targetPath));
        await writeQuotePdf(quote, targetPath, { documentType: "quote" });
        nextQuote = { ...nextQuote, quotePdfPath: targetPath };
        changed = true;
      } catch {
        // keep existing record if regeneration fails
      }
    }

    if (quote.status === "accepted") {
      try {
        ensureDir(path.dirname(invoiceTargetPath));
        if (currentInvoicePath && fs.existsSync(currentInvoicePath) && currentInvoicePath !== invoiceTargetPath) {
          if (fs.existsSync(invoiceTargetPath)) {
            try {
              fs.unlinkSync(currentInvoicePath);
            } catch {
              // ignore cleanup failure
            }
          } else {
            fs.renameSync(currentInvoicePath, invoiceTargetPath);
          }
          nextQuote = { ...nextQuote, invoicePdfPath: invoiceTargetPath };
          changed = true;
        } else if (currentInvoicePath !== invoiceTargetPath || !fs.existsSync(invoiceTargetPath)) {
          await writeQuotePdf(quote, invoiceTargetPath, { documentType: "invoice" });
          nextQuote = { ...nextQuote, invoicePdfPath: invoiceTargetPath };
          changed = true;
        }
      } catch {
        // keep existing invoice record if migration fails
      }
    }
    nextQuotes.push(nextQuote);
  }

  if (changed) {
    updateWorkspaceQuotes(workspaceId, nextQuotes);
    return nextQuotes;
  }
  return ws.quotes;
}

function getNextJobNumber(workspaceId: string) {
  const ws = getWorkspace(workspaceId);
  const year = new Date().getFullYear();
  const prefix = `JOB-${year}-`;
  const existing = ws.jobs
    .map((job) => job.jobNumber)
    .filter((num) => num?.startsWith(prefix))
    .map((num) => Number(num.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  const next = (existing.length ? Math.max(...existing) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function getNextQuoteNumber(workspaceId: string) {
  const ws = getWorkspace(workspaceId);
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;
  const existing = ws.quotes
    .map((quote) => quote.quoteNumber)
    .filter((num) => num?.startsWith(prefix))
    .map((num) => Number(num.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  const seed = ws.quoteSeed && ws.quoteSeed > 0 ? ws.quoteSeed - 1 : 0;
  const next = Math.max(seed, existing.length ? Math.max(...existing) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

const MATERIAL_DENSITY_KG_M3: Record<string, number> = {
  "mild steel": 7850,
  aluminium: 2700,
  "stainless steel": 8000,
  galvanise: 7850,
  "3cr12": 7700
};
const JOB_DXF_THICKNESS_OPTIONS = [0.9, 1.2, 1.5, 1.6, 2, 3, 4, 4.5, 6, 8, 10, 12, 15, 20, 25, 30];

function normalizeJobDxfThickness(value?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return JOB_DXF_THICKNESS_OPTIONS[0];
  return JOB_DXF_THICKNESS_OPTIONS.reduce((closest, option) =>
    Math.abs(option - numeric) < Math.abs(closest - numeric) ? option : closest
  );
}

function resolveMaterialDensity(material?: string) {
  if (!material) return 7850;
  return MATERIAL_DENSITY_KG_M3[material.trim().toLowerCase()] ?? 7850;
}

function calculatePartWeightKg(widthMm: number, heightMm: number, thicknessMm: number, material?: string) {
  const density = resolveMaterialDensity(material);
  const volumeM3 = (Math.max(0, widthMm) * Math.max(0, heightMm) * Math.max(0, thicknessMm)) / 1_000_000_000;
  return volumeM3 * density;
}

function formatRand(value?: number | null) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value ?? 0);
}

function parseIncomingJobDxfPart(part: unknown) {
  const source = part as Record<string, unknown>;
  const sourceSegments = Array.isArray(source.sourceSegments)
    ? source.sourceSegments.map(parseIncomingJobDxfSegment).filter((segment): segment is NonNullable<ReturnType<typeof parseIncomingJobDxfSegment>> => Boolean(segment))
    : [];
  const sourceBounds = parseIncomingJobDxfBounds(source.sourceBounds);
  return {
    id:
      typeof source.id === "string" && source.id.trim()
        ? source.id.trim()
        : `job-dxf-${crypto.randomUUID()}`,
    name: typeof source.name === "string" ? source.name.trim() : "Part",
    partCode: typeof source.partCode === "string" && source.partCode.trim() ? source.partCode.trim() : undefined,
    partDnaId: Number.isFinite(Number(source.partDnaId)) ? Number(source.partDnaId) : undefined,
    geometryHash: typeof source.geometryHash === "string" && source.geometryHash.trim() ? source.geometryHash.trim() : undefined,
    softHash: typeof source.softHash === "string" && source.softHash.trim() ? source.softHash.trim() : undefined,
    layer: typeof source.layer === "string" ? source.layer.trim() : "0",
    material: typeof source.material === "string" && source.material.trim() ? source.material.trim() : "Mild Steel",
    thicknessMm: normalizeJobDxfThickness(Number(source.thicknessMm)),
    quantity: Math.max(0, Math.round(Number(source.quantity) || 0)),
    widthMm: Math.max(0, Math.round(Number(source.widthMm) || 0)),
    heightMm: Math.max(0, Math.round(Number(source.heightMm) || 0)),
    cutLengthMm: Math.max(0, Math.round(Number(source.cutLengthMm) || 0)),
    pierceCount: Math.max(0, Math.round(Number(source.pierceCount) || 0)),
    segmentCount: Math.max(0, Math.round(Number(source.segmentCount) || 0)),
    thumbnailDataUrl:
      typeof source.thumbnailDataUrl === "string" ? source.thumbnailDataUrl : undefined,
    printDataUrl: typeof source.printDataUrl === "string" ? source.printDataUrl : undefined,
    sourceSegments: sourceSegments.length ? sourceSegments : undefined,
    sourceBounds: sourceBounds ?? undefined
  };
}

type XYPoint = { x: number; y: number };

function parseIncomingJobDxfSegment(segment: unknown) {
  const source = segment as Record<string, unknown>;
  const x1 = Number(source.x1);
  const y1 = Number(source.y1);
  const x2 = Number(source.x2);
  const y2 = Number(source.y2);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return {
    x1,
    y1,
    x2,
    y2,
    layer: typeof source.layer === "string" && source.layer.trim() ? source.layer.trim() : "0",
    entityId: typeof source.entityId === "string" && source.entityId.trim() ? source.entityId.trim() : `segment-${crypto.randomUUID()}`
  };
}

function parseIncomingJobDxfBounds(bounds: unknown) {
  const source = bounds as Record<string, unknown>;
  const minX = Number(source?.minX);
  const minY = Number(source?.minY);
  const maxX = Number(source?.maxX);
  const maxY = Number(source?.maxY);
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function isolateLargestDarkComponent(binaryPng: Buffer) {
  const sharp = await loadSharp();
  const decoded = await sharp(binaryPng).raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width ?? 0;
  const height = decoded.info.height ?? 0;
  const channels = decoded.info.channels ?? 1;
  const pixelCount = width * height;
  if (width <= 0 || height <= 0 || channels <= 0 || pixelCount <= 0) return binaryPng;
  // Keep memory bounded for large images.
  if (pixelCount > 8_000_000) return binaryPng;

  const src = decoded.data;
  const dark = new Uint8Array(pixelCount);
  let darkCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * channels;
    const value = src[base];
    if (value < 128) {
      dark[i] = 1;
      darkCount += 1;
    }
  }
  if (darkCount < Math.max(150, Math.floor(pixelCount * 0.0008))) return binaryPng;

  const labels = new Int32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let label = 0;
  const components: Array<{
    id: number;
    area: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    sumX: number;
    sumY: number;
    touchesBorder: boolean;
  }> = [];
  for (let i = 0; i < pixelCount; i += 1) {
    if (!dark[i] || labels[i] !== 0) continue;
    label += 1;
    let qHead = 0;
    let qTail = 0;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let touchesBorder = false;
    labels[i] = label;
    queue[qTail++] = i;
    while (qHead < qTail) {
      const idx = queue[qHead++];
      area += 1;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesBorder = true;
      }
      const visit = (next: number) => {
        if (!dark[next] || labels[next] !== 0) return;
        labels[next] = label;
        queue[qTail++] = next;
      };
      if (x > 0) visit(idx - 1);
      if (x < width - 1) visit(idx + 1);
      if (y > 0) visit(idx - width);
      if (y < height - 1) visit(idx + width);
    }
    if (area >= Math.max(100, Math.floor(pixelCount * 0.00006))) {
      components.push({ id: label, area, minX, minY, maxX, maxY, sumX, sumY, touchesBorder });
    }
  }
  if (!components.length) return binaryPng;

  const imageDiag = Math.hypot(width, height);
  const edgeMargin = Math.max(6, Math.round(Math.min(width, height) * 0.04));
  let best = components[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  const candidateSets = [
    components.filter(
      (component) =>
        component.minX > edgeMargin &&
        component.minY > edgeMargin &&
        component.maxX < width - 1 - edgeMargin &&
        component.maxY < height - 1 - edgeMargin
    ),
    components.filter((component) => !component.touchesBorder),
    components
  ];
  const rankedComponents = candidateSets.find((set) => set.length > 0) ?? components;
  for (const component of rankedComponents) {
    const boxW = component.maxX - component.minX + 1;
    const boxH = component.maxY - component.minY + 1;
    const boxArea = Math.max(1, boxW * boxH);
    const fillRatio = component.area / boxArea;
    const aspect = Math.max(boxW / Math.max(1, boxH), boxH / Math.max(1, boxW));
    const cx = component.sumX / component.area;
    const cy = component.sumY / component.area;
    const centerDx = cx - width / 2;
    const centerDy = cy - height / 2;
    const centerDistNorm = Math.min(1, Math.hypot(centerDx, centerDy) / Math.max(1, imageDiag * 0.5));

    // Reject obvious static streaks/noise islands before scoring.
    if (fillRatio < 0.02) continue;
    if (aspect > 14) continue;

    let score = component.area;
    // Prefer compact/filled parts over scratch lines.
    score *= clampNumber(fillRatio, 0.08, 1);
    // Penalize extreme long thin streaks.
    if (aspect > 8) score *= 0.3;
    else if (aspect > 4) score *= 0.65;
    // Prefer inner components not touching border.
    if (component.touchesBorder) score *= 0.15;
    // Prefer bigger components once inside-zone filtering is active.
    score *= clampNumber(component.area / Math.max(1, pixelCount * 0.015), 0.5, 3);
    // Slight center preference.
    score *= 1 - centerDistNorm * 0.45;

    if (score > bestScore) {
      best = component;
      bestScore = score;
    }
  }
  if (!Number.isFinite(bestScore)) {
    best = rankedComponents.reduce((largest, current) => (current.area > largest.area ? current : largest), rankedComponents[0]);
  }

  const out = Buffer.allocUnsafe(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    out[i] = labels[i] === best.id ? 0 : 255;
  }
  return sharp(out, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function detectMainObjectBoundsFromColor(pngBuffer: Buffer) {
  const sharp = await loadSharp();
  const decoded = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width ?? 0;
  const height = decoded.info.height ?? 0;
  const channels = decoded.info.channels ?? 3;
  const pixelCount = width * height;
  if (width <= 0 || height <= 0 || channels < 3 || pixelCount <= 0) return undefined;
  if (pixelCount > 9_000_000) return undefined;

  const src = decoded.data;
  const mask = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * channels;
    const r = src[offset] / 255;
    const g = src[offset + 1] / 255;
    const b = src[offset + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const sat = max <= 0 ? 0 : delta / max;
    const val = max;
    // Target low-saturation "metal/object" regions and ignore very dark/bright highlights.
    if (sat < 0.34 && val > 0.14 && val < 0.92) {
      mask[i] = 1;
    }
  }

  const labels = new Int32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let label = 0;
  const components: Array<{ id: number; area: number; minX: number; minY: number; maxX: number; maxY: number; sumX: number; sumY: number }> = [];
  for (let i = 0; i < pixelCount; i += 1) {
    if (!mask[i] || labels[i] !== 0) continue;
    label += 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let qHead = 0;
    let qTail = 0;
    labels[i] = label;
    queue[qTail++] = i;
    while (qHead < qTail) {
      const idx = queue[qHead++];
      area += 1;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;
      const visit = (next: number) => {
        if (!mask[next] || labels[next] !== 0) return;
        labels[next] = label;
        queue[qTail++] = next;
      };
      if (x > 0) visit(idx - 1);
      if (x < width - 1) visit(idx + 1);
      if (y > 0) visit(idx - width);
      if (y < height - 1) visit(idx + width);
    }
    if (area >= Math.max(500, Math.floor(pixelCount * 0.004))) {
      components.push({ id: label, area, minX, minY, maxX, maxY, sumX, sumY });
    }
  }
  if (!components.length) return undefined;

  const diag = Math.hypot(width, height);
  let best = components[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const component of components) {
    const boxW = component.maxX - component.minX + 1;
    const boxH = component.maxY - component.minY + 1;
    const boxArea = Math.max(1, boxW * boxH);
    const fillRatio = component.area / boxArea;
    const aspect = Math.max(boxW / Math.max(1, boxH), boxH / Math.max(1, boxW));
    const cx = component.sumX / component.area;
    const cy = component.sumY / component.area;
    const centerDist = Math.hypot(cx - width / 2, cy - height / 2) / Math.max(1, diag * 0.5);
    let score = component.area;
    if (aspect > 1.2 && aspect < 8) score *= 1.35;
    if (fillRatio < 0.18) score *= 0.55;
    score *= 1 - Math.min(0.8, centerDist * 0.6);
    if (score > bestScore) {
      best = component;
      bestScore = score;
    }
  }

  const padX = Math.max(8, Math.round((best.maxX - best.minX + 1) * 0.05));
  const padY = Math.max(8, Math.round((best.maxY - best.minY + 1) * 0.05));
  const left = Math.max(0, best.minX - padX);
  const top = Math.max(0, best.minY - padY);
  const right = Math.min(width - 1, best.maxX + padX);
  const bottom = Math.min(height - 1, best.maxY + padY);
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  if (cropWidth < 40 || cropHeight < 40) return undefined;
  return { left, top, width: cropWidth, height: cropHeight };
}

async function buildOrangeCutoutMaskPng(pngBuffer: Buffer) {
  const sharp = await loadSharp();
  const decoded = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width ?? 0;
  const height = decoded.info.height ?? 0;
  const channels = decoded.info.channels ?? 3;
  const pixelCount = width * height;
  if (width <= 0 || height <= 0 || channels < 3 || pixelCount <= 0) return undefined;
  if (pixelCount > 9_000_000) return undefined;

  const src = decoded.data;
  const mask = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * channels;
    const r = src[offset] / 255;
    const g = src[offset + 1] / 255;
    const b = src[offset + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const sat = max <= 0 ? 0 : delta / max;
    const val = max;
    let hue = 0;
    if (delta > 0) {
      if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      else if (max === g) hue = ((b - r) / delta + 2) / 6;
      else hue = ((r - g) / delta + 4) / 6;
    }
    // Orange-red cutout backing.
    const isWarmOrange = hue >= 0.02 && hue <= 0.14;
    if (isWarmOrange && sat >= 0.38 && val >= 0.24) {
      mask[i] = 1;
    }
  }

  const labels = new Int32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let label = 0;
  const components: Array<{
    id: number;
    area: number;
    touchesBorder: boolean;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cx: number;
    cy: number;
  }> = [];
  for (let i = 0; i < pixelCount; i += 1) {
    if (!mask[i] || labels[i] !== 0) continue;
    label += 1;
    let area = 0;
    let touchesBorder = false;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let qHead = 0;
    let qTail = 0;
    labels[i] = label;
    queue[qTail++] = i;
    while (qHead < qTail) {
      const idx = queue[qHead++];
      area += 1;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      const visit = (next: number) => {
        if (!mask[next] || labels[next] !== 0) return;
        labels[next] = label;
        queue[qTail++] = next;
      };
      if (x > 0) visit(idx - 1);
      if (x < width - 1) visit(idx + 1);
      if (y > 0) visit(idx - width);
      if (y < height - 1) visit(idx + width);
    }
    components.push({
      id: label,
      area,
      touchesBorder,
      minX,
      minY,
      maxX,
      maxY,
      cx: area > 0 ? sumX / area : 0,
      cy: area > 0 ? sumY / area : 0
    });
  }

  const largestArea = components.reduce((max, component) => Math.max(max, component.area), 0);
  const minArea = Math.max(120, Math.floor(pixelCount * 0.00007), Math.floor(largestArea * 0.008));
  const baseCandidates = components
    .filter((component) => !component.touchesBorder && component.area >= minArea)
    .sort((a, b) => b.area - a.area)
    .slice(0, 220);
  const keep = new Set<number>();
  if (!baseCandidates.length) return undefined;

  const xValues = baseCandidates.map((component) => component.cx);
  const yValues = baseCandidates.map((component) => component.cy);
  const spreadX = Math.max(...xValues) - Math.min(...xValues);
  const spreadY = Math.max(...yValues) - Math.min(...yValues);
  const useXAxis = spreadY > spreadX; // vertical layout -> cluster by x (columns)
  const axisValues = baseCandidates.map((component) => (useXAxis ? component.cx : component.cy));
  const weights = baseCandidates.map((component) => component.area);
  const weightedMean =
    axisValues.reduce((sum, value, index) => sum + value * weights[index], 0) /
    Math.max(1, weights.reduce((sum, value) => sum + value, 0));
  let centerA = Math.min(...axisValues);
  let centerB = Math.max(...axisValues);
  for (let i = 0; i < 8; i += 1) {
    let sumA = 0;
    let wA = 0;
    let sumB = 0;
    let wB = 0;
    for (let j = 0; j < axisValues.length; j += 1) {
      const value = axisValues[j];
      const weight = weights[j];
      const distA = Math.abs(value - centerA);
      const distB = Math.abs(value - centerB);
      if (distA <= distB) {
        sumA += value * weight;
        wA += weight;
      } else {
        sumB += value * weight;
        wB += weight;
      }
    }
    if (wA > 0) centerA = sumA / wA;
    if (wB > 0) centerB = sumB / wB;
  }
  const axisSize = useXAxis ? width : height;
  const tolerance = Math.max(18, Math.round(axisSize * 0.065));
  for (let j = 0; j < baseCandidates.length; j += 1) {
    const component = baseCandidates[j];
    const value = useXAxis ? component.cx : component.cy;
    const distA = Math.abs(value - centerA);
    const distB = Math.abs(value - centerB);
    const closeToBand = distA <= tolerance || distB <= tolerance;
    const veryLarge = component.area >= largestArea * 0.22;
    if (closeToBand || veryLarge) keep.add(component.id);
  }
  // Guarantee largest major shapes are kept.
  baseCandidates.slice(0, 12).forEach((component) => keep.add(component.id));
  if (!keep.size) return undefined;

  let keptArea = 0;
  const out = Buffer.allocUnsafe(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const selected = keep.has(labels[i]);
    if (selected) keptArea += 1;
    out[i] = selected ? 0 : 255;
  }
  if (keptArea < Math.max(300, Math.floor(pixelCount * 0.0015))) return undefined;

  // Smooth tiny jaggies so vector tracing follows curves instead of pixel steps.
  const binary = await sharp(out, { raw: { width, height, channels: 1 } })
    .dilate(1)
    .erode(1)
    .blur(0.9)
    .median(3)
    .threshold(170, { grayscale: true })
    .png()
    .toBuffer();
  return binary;
}

async function buildNeutralBrightCutoutMaskPng(pngBuffer: Buffer) {
  const sharp = await loadSharp();
  const decoded = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width ?? 0;
  const height = decoded.info.height ?? 0;
  const channels = decoded.info.channels ?? 3;
  const pixelCount = width * height;
  if (width <= 0 || height <= 0 || channels < 3 || pixelCount <= 0) return undefined;
  if (pixelCount > 9_000_000) return undefined;

  const src = decoded.data;
  const gray = new Uint8Array(pixelCount);
  const mask = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * channels;
    const r8 = src[offset];
    const g8 = src[offset + 1];
    const b8 = src[offset + 2];
    const r = r8 / 255;
    const g = g8 / 255;
    const b = b8 / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const sat = max <= 0 ? 0 : delta / max;
    const val = max;
    gray[i] = Math.round(0.299 * r8 + 0.587 * g8 + 0.114 * b8);
    // Neutral bright cutouts (light inserts), ignore colorful/wood backgrounds.
    if (val >= 0.54 && sat <= 0.24) {
      mask[i] = 1;
    }
  }

  // Add adaptive contrast mask: bright regions that are locally lighter than surrounding plate.
  const localMeanRaw = await sharp(gray, { raw: { width, height, channels: 1 } })
    .blur(7)
    .raw()
    .toBuffer();
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * channels;
    const r8 = src[offset];
    const g8 = src[offset + 1];
    const b8 = src[offset + 2];
    const max8 = Math.max(r8, g8, b8);
    const min8 = Math.min(r8, g8, b8);
    const sat = max8 <= 0 ? 0 : (max8 - min8) / max8;
    const localMean = localMeanRaw[i];
    // Keep only neutral mid/bright raised areas; this rejects most specular shine streaks.
    if (sat <= 0.28 && gray[i] >= 110 && gray[i] <= 232 && gray[i] >= localMean + 24) {
      mask[i] = 1;
    }
  }

  const labels = new Int32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let label = 0;
  const components: Array<{
    id: number;
    area: number;
    touchesBorder: boolean;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cx: number;
    cy: number;
  }> = [];
  for (let i = 0; i < pixelCount; i += 1) {
    if (!mask[i] || labels[i] !== 0) continue;
    label += 1;
    let area = 0;
    let touchesBorder = false;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let qHead = 0;
    let qTail = 0;
    labels[i] = label;
    queue[qTail++] = i;
    while (qHead < qTail) {
      const idx = queue[qHead++];
      area += 1;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      const visit = (next: number) => {
        if (!mask[next] || labels[next] !== 0) return;
        labels[next] = label;
        queue[qTail++] = next;
      };
      if (x > 0) visit(idx - 1);
      if (x < width - 1) visit(idx + 1);
      if (y > 0) visit(idx - width);
      if (y < height - 1) visit(idx + width);
    }
    components.push({
      id: label,
      area,
      touchesBorder,
      minX,
      minY,
      maxX,
      maxY,
      cx: area > 0 ? sumX / area : 0,
      cy: area > 0 ? sumY / area : 0
    });
  }

  const largestArea = components.reduce((max, component) => Math.max(max, component.area), 0);
  const minArea = Math.max(24, Math.floor(pixelCount * 0.000012), Math.floor(largestArea * 0.0006));
  const baseCandidates = components
    .filter((component) => !component.touchesBorder && component.area >= minArea)
    .sort((a, b) => b.area - a.area);
  if (!baseCandidates.length) return undefined;

  const keep = new Set<number>();
  const xValues = baseCandidates.map((component) => component.cx);
  const yValues = baseCandidates.map((component) => component.cy);
  const spreadX = Math.max(...xValues) - Math.min(...xValues);
  const spreadY = Math.max(...yValues) - Math.min(...yValues);
  const useXAxis = spreadY > spreadX; // vertical layout -> cluster by x (columns)
  const axisValues = baseCandidates.map((component) => (useXAxis ? component.cx : component.cy));
  const axisWeights = baseCandidates.map((component) => component.area);

  let centers = [Math.min(...axisValues), (Math.min(...axisValues) + Math.max(...axisValues)) / 2, Math.max(...axisValues)];
  for (let iter = 0; iter < 9; iter += 1) {
    const nextSums = [0, 0, 0];
    const nextWeights = [0, 0, 0];
    for (let i = 0; i < axisValues.length; i += 1) {
      const value = axisValues[i];
      const weight = axisWeights[i];
      let bestIndex = 0;
      let bestDistance = Math.abs(value - centers[0]);
      for (let j = 1; j < centers.length; j += 1) {
        const distance = Math.abs(value - centers[j]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = j;
        }
      }
      nextSums[bestIndex] += value * weight;
      nextWeights[bestIndex] += weight;
    }
    for (let j = 0; j < centers.length; j += 1) {
      if (nextWeights[j] > 0) centers[j] = nextSums[j] / nextWeights[j];
    }
  }

  const clusterWeight = [0, 0, 0];
  for (let i = 0; i < axisValues.length; i += 1) {
    const value = axisValues[i];
    const weight = axisWeights[i];
    let bestIndex = 0;
    let bestDistance = Math.abs(value - centers[0]);
    for (let j = 1; j < centers.length; j += 1) {
      const distance = Math.abs(value - centers[j]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = j;
      }
    }
    clusterWeight[bestIndex] += weight;
  }
  const prioritizedCenters = [0, 1, 2]
    .sort((a, b) => clusterWeight[b] - clusterWeight[a])
    .slice(0, 2)
    .map((index) => centers[index]);
  const axisSize = useXAxis ? width : height;
  const tolerance = Math.max(20, Math.round(axisSize * 0.095));

  const maxKeepCount = 1200;
  for (const component of baseCandidates) {
    if (keep.size >= maxKeepCount) break;
    const boxW = Math.max(1, component.maxX - component.minX + 1);
    const boxH = Math.max(1, component.maxY - component.minY + 1);
    const fill = component.area / (boxW * boxH);
    const aspect = Math.max(boxW / boxH, boxH / boxW);
    if (fill < 0.08) continue;
    if (aspect > 22) continue;
    const axisValue = useXAxis ? component.cx : component.cy;
    const distanceToBand = Math.min(...prioritizedCenters.map((center) => Math.abs(axisValue - center)));
    const nearBand = distanceToBand <= tolerance;
    const veryLarge = component.area >= largestArea * 0.18;
    if (nearBand || veryLarge) {
      keep.add(component.id);
    }
  }
  if (!keep.size) return undefined;

  let keptArea = 0;
  const out = Buffer.allocUnsafe(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const selected = keep.has(labels[i]);
    if (selected) keptArea += 1;
    out[i] = selected ? 0 : 255;
  }
  if (keptArea < Math.max(260, Math.floor(pixelCount * 0.001))) return undefined;

  const binary = await sharp(out, { raw: { width, height, channels: 1 } })
    .dilate(1)
    .dilate(1)
    .erode(1)
    .erode(1)
    .blur(1.0)
    .median(3)
    .threshold(170, { grayscale: true })
    .png()
    .toBuffer();
  return binary;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function parseSvgPathDataList(svg: string) {
  const paths: string[] = [];
  const regex = /<path\b[^>]*\sd="([^"]+)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(svg))) {
    const data = match[1]?.trim();
    if (data) paths.push(data);
  }
  return paths;
}

function pointDistance(a: XYPoint, b: XYPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cubicPoint(t: number, p0: XYPoint, p1: XYPoint, p2: XYPoint, p3: XYPoint): XYPoint {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
  };
}

function quadPoint(t: number, p0: XYPoint, p1: XYPoint, p2: XYPoint): XYPoint {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return {
    x: uu * p0.x + 2 * u * t * p1.x + tt * p2.x,
    y: uu * p0.y + 2 * u * t * p1.y + tt * p2.y
  };
}

function pathDataToPolylineGroups(pathData: string, curveSteps: number) {
  const parseSVG = (svgPathParser as unknown as { parseSVG: (path: string) => unknown[] }).parseSVG;
  const makeAbsolute = (svgPathParser as unknown as { makeAbsolute: (commands: unknown[]) => unknown[] }).makeAbsolute;
  const rawCommands = parseSVG(pathData);
  const commands = makeAbsolute(rawCommands) as Array<Record<string, number | string>>;
  const groups: XYPoint[][] = [];
  let current: XYPoint[] = [];
  let currentPos: XYPoint = { x: 0, y: 0 };
  let subPathStart: XYPoint = { x: 0, y: 0 };
  let prevCubicControl: XYPoint | null = null;
  let prevQuadControl: XYPoint | null = null;

  const pushPoint = (pt: XYPoint) => {
    const last = current[current.length - 1];
    if (!last || pointDistance(last, pt) > 0.0001) current.push(pt);
  };

  const closeCurrent = () => {
    if (current.length >= 2) groups.push(current);
    current = [];
    prevCubicControl = null;
    prevQuadControl = null;
  };

  for (const command of commands) {
    const code = String(command.code ?? "").toUpperCase();
    if (code === "M") {
      closeCurrent();
      const nextPoint = { x: Number(command.x ?? 0), y: Number(command.y ?? 0) };
      currentPos = nextPoint;
      subPathStart = nextPoint;
      pushPoint(nextPoint);
    } else if (code === "L") {
      const nextPoint = { x: Number(command.x ?? 0), y: Number(command.y ?? 0) };
      pushPoint(nextPoint);
      currentPos = nextPoint;
      prevCubicControl = null;
      prevQuadControl = null;
    } else if (code === "H") {
      const nextPoint = { x: Number(command.x ?? 0), y: currentPos.y };
      pushPoint(nextPoint);
      currentPos = nextPoint;
      prevCubicControl = null;
      prevQuadControl = null;
    } else if (code === "V") {
      const nextPoint = { x: currentPos.x, y: Number(command.y ?? 0) };
      pushPoint(nextPoint);
      currentPos = nextPoint;
      prevCubicControl = null;
      prevQuadControl = null;
    } else if (code === "C") {
      const p0 = currentPos;
      const p1 = { x: Number(command.x1 ?? p0.x), y: Number(command.y1 ?? p0.y) };
      const p2 = { x: Number(command.x2 ?? p0.x), y: Number(command.y2 ?? p0.y) };
      const p3 = { x: Number(command.x ?? p0.x), y: Number(command.y ?? p0.y) };
      for (let step = 1; step <= curveSteps; step += 1) {
        pushPoint(cubicPoint(step / curveSteps, p0, p1, p2, p3));
      }
      currentPos = p3;
      prevCubicControl = p2;
      prevQuadControl = null;
    } else if (code === "S") {
      const p0 = currentPos;
      const reflected = prevCubicControl ? { x: p0.x * 2 - prevCubicControl.x, y: p0.y * 2 - prevCubicControl.y } : p0;
      const p2 = { x: Number(command.x2 ?? p0.x), y: Number(command.y2 ?? p0.y) };
      const p3 = { x: Number(command.x ?? p0.x), y: Number(command.y ?? p0.y) };
      for (let step = 1; step <= curveSteps; step += 1) {
        pushPoint(cubicPoint(step / curveSteps, p0, reflected, p2, p3));
      }
      currentPos = p3;
      prevCubicControl = p2;
      prevQuadControl = null;
    } else if (code === "Q") {
      const p0 = currentPos;
      const p1 = { x: Number(command.x1 ?? p0.x), y: Number(command.y1 ?? p0.y) };
      const p2 = { x: Number(command.x ?? p0.x), y: Number(command.y ?? p0.y) };
      for (let step = 1; step <= curveSteps; step += 1) {
        pushPoint(quadPoint(step / curveSteps, p0, p1, p2));
      }
      currentPos = p2;
      prevQuadControl = p1;
      prevCubicControl = null;
    } else if (code === "T") {
      const p0 = currentPos;
      const reflected = prevQuadControl ? { x: p0.x * 2 - prevQuadControl.x, y: p0.y * 2 - prevQuadControl.y } : p0;
      const p2 = { x: Number(command.x ?? p0.x), y: Number(command.y ?? p0.y) };
      for (let step = 1; step <= curveSteps; step += 1) {
        pushPoint(quadPoint(step / curveSteps, p0, reflected, p2));
      }
      currentPos = p2;
      prevQuadControl = reflected;
      prevCubicControl = null;
    } else if (code === "Z") {
      pushPoint(subPathStart);
      currentPos = subPathStart;
      closeCurrent();
    }
  }

  if (current.length >= 2) groups.push(current);
  return groups;
}

function cleanPolylineGroups(groups: XYPoint[][]) {
  if (!groups.length) return groups;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const group of groups) {
    for (const p of group) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const minBoxArea = width * height * 0.000035;
  const minSegmentCount = 6;
  const edgeMarginX = width * 0.01;
  const edgeMarginY = height * 0.01;

  const filtered = groups.filter((group) => {
    if (group.length < minSegmentCount) return false;
    let gx1 = Number.POSITIVE_INFINITY;
    let gy1 = Number.POSITIVE_INFINITY;
    let gx2 = Number.NEGATIVE_INFINITY;
    let gy2 = Number.NEGATIVE_INFINITY;
    for (const p of group) {
      if (p.x < gx1) gx1 = p.x;
      if (p.y < gy1) gy1 = p.y;
      if (p.x > gx2) gx2 = p.x;
      if (p.y > gy2) gy2 = p.y;
    }
    const gW = Math.max(0, gx2 - gx1);
    const gH = Math.max(0, gy2 - gy1);
    const gArea = gW * gH;
    if (gArea < minBoxArea) return false;
    const touchesOuterEdge =
      gx1 <= minX + edgeMarginX ||
      gy1 <= minY + edgeMarginY ||
      gx2 >= maxX - edgeMarginX ||
      gy2 >= maxY - edgeMarginY;
    if (touchesOuterEdge && gArea < minBoxArea * 5) return false;
    return true;
  });

  return filtered.length ? filtered : groups;
}

function createPlateBorderGroup(width: number, height: number, inset = 1): XYPoint[] | null {
  const w = Math.max(0, width - 1);
  const h = Math.max(0, height - 1);
  if (w < 20 || h < 20) return null;
  const i = Math.max(0, Math.min(inset, Math.floor(Math.min(w, h) / 6)));
  const x1 = i;
  const y1 = i;
  const x2 = Math.max(i, w - i);
  const y2 = Math.max(i, h - i);
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
    { x: x1, y: y1 }
  ];
}

function smoothContourGroup(group: XYPoint[], options?: { preserveShape?: boolean }) {
  if (group.length < 8) return group;
  const closed = pointDistance(group[0], group[group.length - 1]) < 0.8;
  const base = closed ? group.slice(0, -1) : group.slice();
  const n = base.length;
  if (n < 6) return group;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of base) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const boxArea = Math.max(1, (maxX - minX) * (maxY - minY));
  const iterations = n > 120 ? 2 : 1;
  const lambda = options?.preserveShape ? 0.12 : 0.18;

  let work = base;
  for (let iter = 0; iter < iterations; iter += 1) {
    const next: XYPoint[] = new Array(n);
    for (let i = 0; i < n; i += 1) {
      if (!closed && (i === 0 || i === n - 1)) {
        next[i] = work[i];
        continue;
      }
      const prev = work[(i - 1 + n) % n];
      const curr = work[i];
      const after = work[(i + 1) % n];
      next[i] = {
        x: curr.x + lambda * (prev.x + after.x - 2 * curr.x),
        y: curr.y + lambda * (prev.y + after.y - 2 * curr.y)
      };
    }
    work = next;
  }

  // Remove tiny jitter-only steps while preserving detailed letters.
  const minStep = boxArea < 1500 ? 0.06 : 0.12;
  const cleaned: XYPoint[] = [];
  for (let i = 0; i < work.length; i += 1) {
    const point = work[i];
    const prev = cleaned[cleaned.length - 1];
    if (!prev || pointDistance(prev, point) >= minStep) {
      cleaned.push(point);
    }
  }
  if (closed) {
    if (cleaned.length >= 3) cleaned.push(cleaned[0]);
    else return group;
  }
  return cleaned.length >= 2 ? cleaned : group;
}

function simplifyPolylineOpen(points: XYPoint[], epsilon: number): XYPoint[] {
  if (points.length <= 2 || epsilon <= 0) return points.slice();
  const perpendicularDistance = (point: XYPoint, start: XYPoint, end: XYPoint) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 1e-9) return pointDistance(point, start);
    const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
    const px = start.x + t * dx;
    const py = start.y + t * dy;
    return Math.hypot(point.x - px, point.y - py);
  };

  const recurse = (startIndex: number, endIndex: number, keep: boolean[]) => {
    if (endIndex <= startIndex + 1) return;
    const start = points[startIndex];
    const end = points[endIndex];
    let maxDistance = -1;
    let maxIndex = -1;
    for (let i = startIndex + 1; i < endIndex; i += 1) {
      const distance = perpendicularDistance(points[i], start, end);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    if (maxIndex >= 0 && maxDistance > epsilon) {
      keep[maxIndex] = true;
      recurse(startIndex, maxIndex, keep);
      recurse(maxIndex, endIndex, keep);
    }
  };

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  recurse(0, points.length - 1, keep);
  const simplified: XYPoint[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (keep[i]) simplified.push(points[i]);
  }
  return simplified.length >= 2 ? simplified : points.slice();
}

function simplifyContourGroup(group: XYPoint[], epsilon: number) {
  if (group.length < 5 || epsilon <= 0) return group;
  const closed = pointDistance(group[0], group[group.length - 1]) < 0.8;
  if (!closed) return simplifyPolylineOpen(group, epsilon);
  const base = group.slice(0, -1);
  if (base.length < 4) return group;
  const rotated = base.concat(base[0]);
  const simplified = simplifyPolylineOpen(rotated, epsilon);
  if (simplified.length < 4) return group;
  const deduped = simplified.slice(0, -1);
  return deduped.length >= 3 ? deduped.concat(deduped[0]) : group;
}

function axisSnapContourGroup(
  group: XYPoint[],
  options?: {
    axisDelta?: number;
    minRunPoints?: number;
  }
) {
  if (group.length < 6) return group;
  const closed = pointDistance(group[0], group[group.length - 1]) < 0.8;
  const base = closed ? group.slice(0, -1) : group.slice();
  if (base.length < 5) return group;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of base) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const axisDelta = clampNumber(Number(options?.axisDelta ?? Math.max(0.65, Math.min(width, height) * 0.0022)), 0.4, 2.2);
  const minRunPoints = Math.max(3, Math.round(Number(options?.minRunPoints ?? 4)));

  const classifySegment = (a: XYPoint, b: XYPoint) => {
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dy <= axisDelta && dx >= axisDelta * 1.2) return "H" as const;
    if (dx <= axisDelta && dy >= axisDelta * 1.2) return "V" as const;
    return "" as const;
  };

  const work = base.map((point) => ({ x: point.x, y: point.y }));
  const segmentCount = closed ? base.length : base.length - 1;
  let index = 0;
  while (index < segmentCount) {
    const nextIndex = (value: number) => (closed ? (value + base.length) % base.length : value);
    const segStart = nextIndex(index);
    const segEnd = nextIndex(index + 1);
    const kind = classifySegment(work[segStart], work[segEnd]);
    if (!kind) {
      index += 1;
      continue;
    }
    let endIndex = index + 1;
    while (endIndex < segmentCount) {
      const s = nextIndex(endIndex);
      const e = nextIndex(endIndex + 1);
      if (classifySegment(work[s], work[e]) !== kind) break;
      endIndex += 1;
    }
    const runLengthSegments = endIndex - index;
    if (runLengthSegments + 1 >= minRunPoints) {
      const runIndices: number[] = [];
      for (let i = index; i <= endIndex; i += 1) {
        runIndices.push(nextIndex(i));
      }
      runIndices.push(nextIndex(endIndex + 1));
      if (kind === "H") {
        const ys = runIndices.map((i) => work[i].y).sort((a, b) => a - b);
        const targetY = ys[Math.floor(ys.length / 2)];
        for (const i of runIndices) work[i].y = targetY;
      } else {
        const xs = runIndices.map((i) => work[i].x).sort((a, b) => a - b);
        const targetX = xs[Math.floor(xs.length / 2)];
        for (const i of runIndices) work[i].x = targetX;
      }
    }
    index = endIndex + 1;
  }

  if (closed) return work.concat({ ...work[0] });
  return work;
}

function refineContourGroup(group: XYPoint[], options?: { preserveShape?: boolean }) {
  if (group.length < 8) return group;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of group) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const boxArea = Math.max(1, (maxX - minX) * (maxY - minY));
  const firstSmooth = smoothContourGroup(group, options);
  const firstSimplify = simplifyContourGroup(firstSmooth, boxArea > 15000 ? 1.05 : boxArea > 4000 ? 0.8 : 0.55);
  const snapped = axisSnapContourGroup(firstSimplify);
  const finalSmooth = smoothContourGroup(snapped, options);
  const finalSimplify = simplifyContourGroup(finalSmooth, boxArea > 15000 ? 0.65 : boxArea > 4000 ? 0.48 : 0.35);
  return finalSimplify.length >= 2 ? finalSimplify : group;
}

function polylineGroupsToDxf(
  groups: XYPoint[][],
  options?: { mmPerPixel?: number; layer?: string; flipY?: boolean; decimals?: number }
) {
  const mmPerPixel = Math.max(0.0001, Number(options?.mmPerPixel ?? 1));
  const layer = options?.layer?.trim() || "OUTLINE";
  const flipY = options?.flipY !== false;
  const decimals = Math.max(2, Math.min(8, Math.round(Number(options?.decimals ?? 4))));
  let minX = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let pointCount = 0;
  for (const group of groups) {
    for (const point of group) {
      pointCount += 1;
      if (point.x < minX) minX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }
  if (pointCount === 0 || !Number.isFinite(minX) || !Number.isFinite(maxY)) return "";
  const fmt = (value: number) => value.toFixed(decimals);
  const mapPoint = (point: XYPoint) => {
    const mappedX = (point.x - minX) * mmPerPixel;
    const mappedY = flipY ? (maxY - point.y) * mmPerPixel : point.y * mmPerPixel;
    return { x: mappedX, y: mappedY };
  };

  let dxf = "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";
  for (const group of groups) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length - 1; i += 1) {
      const p1 = mapPoint(group[i]);
      const p2 = mapPoint(group[i + 1]);
      dxf +=
        `0\nLINE\n8\n${layer}\n10\n${fmt(p1.x)}\n20\n${fmt(p1.y)}\n30\n0\n11\n${fmt(p2.x)}\n21\n${fmt(p2.y)}\n31\n0\n`;
    }
  }
  dxf += "0\nENDSEC\n0\nEOF\n";
  return dxf;
}

async function traceImageOutlineToDxf(
  imageBuffer: Buffer,
  options?: {
    threshold?: number;
    maxEdgePx?: number;
    turdSize?: number;
    alphaMax?: number;
    optTolerance?: number;
    curveSteps?: number;
    mmPerPixel?: number;
    layer?: string;
    sourceName?: string;
    mimeType?: string;
    includePlateBorder?: boolean;
  }
) {
  const threshold = clampNumber(Math.round(Number(options?.threshold ?? 170)), 0, 255);
  const maxEdgePx = clampNumber(Math.round(Number(options?.maxEdgePx ?? 3000)), 256, 8000);
  const turdSize = clampNumber(Math.round(Number(options?.turdSize ?? 2)), 1, 100);
  const alphaMax = clampNumber(Number(options?.alphaMax ?? 1), 0, 2);
  // Keep tolerance above a floor so outputs are smooth and not pixel-stair stepped.
  const optTolerance = clampNumber(Number(options?.optTolerance ?? 0.35), 0.2, 2);
  const curveSteps = clampNumber(Math.round(Number(options?.curveSteps ?? 42)), 8, 200);
  const mmPerPixel = clampNumber(Number(options?.mmPerPixel ?? 1), 0.01, 100);
  const layer = options?.layer?.trim() || "OUTLINE";
  const includePlateBorder = options?.includePlateBorder !== false;

  const heicHint = `${options?.sourceName ?? ""} ${options?.mimeType ?? ""}`.toLowerCase();
  const isHeicHint = /heic|heif/.test(heicHint);
  const looksLikeHeicBuffer = (input: Buffer) => {
    if (input.length < 32) return false;
    // HEIF/HEIC files are ISO-BMFF and usually contain "ftyp....heic/heif" near byte 4.
    const signature = input.subarray(0, 64).toString("latin1").toLowerCase();
    return signature.includes("ftypheic") || signature.includes("ftypheif") || signature.includes("ftypmif1");
  };
  const treatAsHeic = isHeicHint || looksLikeHeicBuffer(imageBuffer);
  const toBuffer = (value: unknown) => {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (value instanceof ArrayBuffer) return Buffer.from(value);
    if (value && typeof value === "object" && "buffer" in (value as Record<string, unknown>)) {
      const nested = (value as { buffer?: unknown }).buffer;
      if (Buffer.isBuffer(nested)) return nested;
      if (nested instanceof Uint8Array) return Buffer.from(nested);
      if (nested instanceof ArrayBuffer) return Buffer.from(nested);
    }
    throw new Error("heic conversion did not return binary image data");
  };
  const convertHeicToJpegViaSips = async (input: Buffer) => {
    if (process.platform !== "darwin") {
      throw new Error("sips fallback only available on macOS");
    }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reimec-heic-"));
    const sourcePath = path.join(tempDir, "source.heic");
    const outputPath = path.join(tempDir, "converted.jpg");
    try {
      await fs.promises.writeFile(sourcePath, input);
      await execFileAsync("sips", ["-s", "format", "jpeg", sourcePath, "--out", outputPath]);
      return await fs.promises.readFile(outputPath);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // no-op
      }
    }
  };
  const convertHeicToJpeg = async (input: Buffer) => {
    try {
      const converted = await heicConvert({
        buffer: input,
        format: "JPEG",
        quality: 0.95
      });
      return toBuffer(converted);
    } catch (error) {
      try {
        return await convertHeicToJpegViaSips(input);
      } catch (fallbackError) {
        const primaryDetails = error instanceof Error ? error.message : String(error ?? "unknown heic-convert error");
        const fallbackDetails =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError ?? "unknown sips fallback error");
        throw new Error(`heic conversion failed (${primaryDetails}); sips fallback failed (${fallbackDetails})`);
      }
    }
  };
  const isDecodeError = (error: unknown) => {
    const details = error instanceof Error ? error.message : String(error ?? "");
    return /heic|heif|unsupported|decode|bad seek|input buffer contains unsupported image format/i.test(details);
  };
  const preprocessToPng = async (input: Buffer) => {
    const sharp = await loadSharp();
    let colorPipeline = sharp(input).rotate();
    const meta = await colorPipeline.metadata();
    const width = Number(meta.width ?? 0);
    const height = Number(meta.height ?? 0);
    if (width <= 0 || height <= 0) {
      throw new Error("invalid image");
    }
    const longestEdge = Math.max(width, height);
    if (longestEdge > maxEdgePx) {
      const scale = maxEdgePx / longestEdge;
      colorPipeline = colorPipeline.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        kernel: sharp.kernel.lanczos3
      });
    }
    const colorPng = await colorPipeline.png().toBuffer();
    const cropBounds = await detectMainObjectBoundsFromColor(colorPng);
    let pipeline = sharp(colorPng);
    if (cropBounds) {
      pipeline = pipeline.extract(cropBounds);
    }
    const focusedColorPng = await pipeline.png().toBuffer();
    const orangeMask = await buildOrangeCutoutMaskPng(focusedColorPng);
    if (orangeMask) {
      return orangeMask;
    }
    const neutralBrightMask = await buildNeutralBrightCutoutMaskPng(focusedColorPng);
    if (neutralBrightMask) {
      return neutralBrightMask;
    }
    const binary = await sharp(focusedColorPng)
      .grayscale()
      .normalise()
      .blur(1.2)
      .median(3)
      .threshold(threshold, { grayscale: true })
      .png()
      .toBuffer();
    return isolateLargestDarkComponent(binary);
  };

  let preparedBuffer: Buffer;
  if (treatAsHeic) {
    const jpegBuffer = await convertHeicToJpeg(imageBuffer);
    preparedBuffer = await preprocessToPng(jpegBuffer);
  } else {
    try {
      preparedBuffer = await preprocessToPng(imageBuffer);
    } catch (error) {
      if (!isDecodeError(error) || !looksLikeHeicBuffer(imageBuffer)) {
        throw error;
      }
      const jpegBuffer = await convertHeicToJpeg(imageBuffer);
      preparedBuffer = await preprocessToPng(jpegBuffer);
    }
  }

  const svg = await new Promise<string>((resolve, reject) => {
    tracePotrace(
      preparedBuffer,
      {
        turdSize,
        alphaMax,
        optCurve: true,
        optTolerance,
        threshold,
        turnPolicy: Potrace.TURNPOLICY_MAJORITY,
        blackOnWhite: true,
        color: "black",
        background: "white"
      },
      (error, svgValue) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(svgValue ?? "");
      }
    );
  });

  const pathList = parseSvgPathDataList(svg);
  const maxPaths = 3000;
  const maxGroups = 15000;
  const maxSegments = 400000;
  const groups: XYPoint[][] = [];
  let segmentCountBudget = maxSegments;
  for (const pathData of pathList.slice(0, maxPaths)) {
    let parsedGroups: XYPoint[][] = [];
    try {
      parsedGroups = pathDataToPolylineGroups(pathData, curveSteps);
    } catch {
      // Skip malformed paths and continue.
      continue;
    }
    for (const group of parsedGroups) {
      if (group.length < 2) continue;
      groups.push(group);
      segmentCountBudget -= Math.max(0, group.length - 1);
      if (groups.length >= maxGroups || segmentCountBudget <= 0) break;
    }
    if (groups.length >= maxGroups || segmentCountBudget <= 0) break;
  }
  const cleanedGroups = cleanPolylineGroups(groups);
  if (includePlateBorder) {
    const preparedMeta = await sharp(preparedBuffer).metadata();
    const borderGroup = createPlateBorderGroup(Number(preparedMeta.width ?? 0), Number(preparedMeta.height ?? 0), 1);
    if (borderGroup) {
      cleanedGroups.unshift(borderGroup);
    }
  }
  const smoothedGroups = cleanedGroups.map((group, index) => {
    const isBorder = includePlateBorder && index === 0;
    return isBorder ? group : refineContourGroup(group, { preserveShape: true });
  });

  const dxf = polylineGroupsToDxf(smoothedGroups, { mmPerPixel, layer, flipY: true, decimals: 4 });
  if (!dxf.trim()) {
    throw new Error("no outline detected");
  }

  return {
    dxf,
    stats: {
      pathCount: pathList.length,
      polylineCount: smoothedGroups.length,
      segmentCount: smoothedGroups.reduce((sum, group) => sum + Math.max(0, group.length - 1), 0),
      threshold,
      curveSteps
    }
  };
}

async function traceImageOutlineToDxfResilient(
  imageBuffer: Buffer,
  options?: {
    threshold?: number;
    maxEdgePx?: number;
    turdSize?: number;
    alphaMax?: number;
    optTolerance?: number;
    curveSteps?: number;
    mmPerPixel?: number;
    layer?: string;
    sourceName?: string;
    mimeType?: string;
  }
) {
  const baseMaxEdge = Math.round(Number(options?.maxEdgePx ?? 3000));
  const baseCurveSteps = Math.round(Number(options?.curveSteps ?? 42));
  const baseThreshold = Math.round(Number(options?.threshold ?? 170));
  const profiles = [
    {
      ...options,
      maxEdgePx: clampNumber(baseMaxEdge, 800, 6000),
      curveSteps: clampNumber(baseCurveSteps, 12, 140),
      threshold: clampNumber(baseThreshold, 0, 255),
      turdSize: clampNumber(Number(options?.turdSize ?? 0), 0, 20),
      optTolerance: clampNumber(Math.max(Number(options?.optTolerance ?? 0.42), 0.35), 0.2, 0.9)
    },
    {
      ...options,
      maxEdgePx: clampNumber(Math.min(baseMaxEdge, 2600), 700, 4000),
      curveSteps: clampNumber(Math.min(baseCurveSteps, 40), 10, 80),
      threshold: clampNumber(baseThreshold, 0, 255),
      turdSize: clampNumber(Math.max(Number(options?.turdSize ?? 0), 2), 0, 30),
      optTolerance: clampNumber(Math.max(Number(options?.optTolerance ?? 0.42), 0.5), 0.2, 1.2)
    },
    {
      ...options,
      maxEdgePx: clampNumber(Math.min(baseMaxEdge, 1600), 512, 2500),
      curveSteps: clampNumber(Math.min(baseCurveSteps, 24), 8, 40),
      threshold: clampNumber(baseThreshold, 0, 255),
      turdSize: clampNumber(Math.max(Number(options?.turdSize ?? 0), 6), 0, 60),
      alphaMax: clampNumber(Math.min(Number(options?.alphaMax ?? 1), 0.95), 0.1, 1.2),
      optTolerance: clampNumber(Math.max(Number(options?.optTolerance ?? 0.42), 0.75), 0.35, 1.6)
    }
  ];

  const errors: string[] = [];
  for (let i = 0; i < profiles.length; i += 1) {
    try {
      return await withTimeout(
        traceImageOutlineToDxf(imageBuffer, profiles[i]),
        IMAGE_OUTLINE_ATTEMPT_TIMEOUT_MS,
        `image outline conversion attempt ${i + 1}`
      );
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error ?? "unknown error");
      errors.push(`attempt ${i + 1}: ${details}`);
    }
  }
  throw new Error(errors.join(" | "));
}

async function writeJobCard(
  workspace: WorkspaceRecord,
  job: JobRecord,
  outputPath: string,
  options?: { includePricing?: boolean; includeDriverSignoff?: boolean; copyLabel?: string }
) {
  ensureDir(path.dirname(outputPath));
  const quote = workspace.quotes.find((entry) => entry.quoteNumber === job.quoteNumber);
  const companyProfile = workspace.companyProfile ?? {};
  const accent = normalizeHexColor(companyProfile.accentColor ?? quote?.companyDetails?.accentColor) ?? "#0f172a";
  const accentSoft = mixHexColor(accent, "#ffffff", 0.78);
  const accentMid = mixHexColor(accent, "#ffffff", 0.45);
  const textPrimary = mixHexColor(accent, "#000000", 0.75);
  const logoDataUrl = companyProfile.logoDataUrl ?? quote?.logoDataUrl;
  const companyName = companyProfile.name?.trim() || quote?.companyName?.trim() || "Job Card";
  const includePricing = options?.includePricing ?? false;
  const includeDriverSignoff = options?.includeDriverSignoff ?? false;
  const copyLabel = options?.copyLabel?.trim();
  const documentHeading = includeDriverSignoff ? "Delivery Note" : "Production Job Card";

  const doc = new PDFDocument({ margin: 42, size: "A4" });
  const outputStream = fs.createWriteStream(outputPath);
  const writeComplete = new Promise<void>((resolve, reject) => {
    outputStream.once("finish", () => resolve());
    outputStream.once("error", (error) => reject(error));
    doc.once("error", (error) => reject(error));
  });
  doc.pipe(outputStream);

  const left = 42;
  const right = 553;
  const line = (y: number) => {
    doc
      .save()
      .moveTo(left, y)
      .lineTo(right, y)
      .lineWidth(0.7)
      .strokeColor(accentSoft)
      .stroke()
      .restore();
  };

  doc.save().rect(left, 34, right - left, 5).fill(accent).restore();
  if (logoDataUrl?.startsWith("data:image/")) {
    const base64 = logoDataUrl.split(",")[1];
    if (base64) {
      try {
        doc.image(Buffer.from(base64, "base64"), left, 40, { width: 100, height: 100, fit: [100, 100] });
      } catch {
        // ignore logo decode errors
      }
    }
  }

  const companyFontSize = companyName.length > 28 ? 20 : 24;
  const headingY = 40;
  const headingLabelY = headingY + 34;
  const copyLabelY = headingLabelY + 18;
  const metaStartY = copyLabel ? copyLabelY + 18 : headingLabelY + 20;
  const dividerY = metaStartY + 42;

  doc.font("Helvetica-Bold").fillColor(accent).fontSize(companyFontSize).text(companyName, 150, headingY, {
    align: "right",
    width: 403
  });
  doc.font("Helvetica-Bold").fillColor(accentMid).fontSize(15).text(documentHeading, 150, headingLabelY, {
    align: "right",
    width: 403
  });
  if (copyLabel) {
    doc.font("Helvetica-Bold").fillColor(accent).fontSize(12).text(copyLabel, 150, copyLabelY, { align: "right", width: 403 });
  }
  doc.font("Helvetica-Bold").fillColor(textPrimary).fontSize(13).text(`Job #: ${job.jobNumber}`, 150, metaStartY, {
    align: "right",
    width: 403
  });
  doc
    .font("Helvetica-Bold")
    .fillColor(textPrimary)
    .fontSize(13)
    .text(`Date: ${new Date(job.createdAt).toLocaleDateString("en-ZA")}`, 150, metaStartY + 20, {
      align: "right",
      width: 403
    });
  doc.font("Helvetica");
  line(dividerY);

  let y = dividerY + 12;
  const details = [
    `Title: ${job.title}`,
    `Customer: ${job.customerName ?? "-"}`,
    job.quoteNumber ? `Quote: ${job.quoteNumber}` : undefined,
    `Assigned To: ${job.assignedTo ?? "-"}`,
    `Status: ${job.status.toUpperCase()}`,
    `QR Token: ${job.qrToken}`
  ].filter((entry): entry is string => Boolean(entry));
  details.forEach((entry) => {
    doc.fillColor(textPrimary).fontSize(10).text(entry, left, y, { width: 330 });
    y += 14;
  });

  if (includePricing) {
    doc.fillColor(textPrimary).fontSize(10).text(`Sell Price: ${formatRand(job.price ?? 0)}`, left, y, { width: 330 });
    y += 14;
    if (Number.isFinite(job.cost)) {
      doc.fillColor(textPrimary).fontSize(10).text(`Cost: ${formatRand(job.cost ?? 0)}`, left, y, { width: 330 });
      y += 14;
    }
  }

  const scanUrl = `${API_PUBLIC_URL}/scan?token=${job.qrToken}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: "M", margin: 1, width: 180 });
    doc.image(qrDataUrl, 395, 142, { fit: [150, 150] });
    doc.fontSize(8).fillColor(accentMid).text("Scan to open quantity check", 395, 300, { width: 150, align: "center" });
  } catch {
    doc.fontSize(9).fillColor(textPrimary).text(`Scan URL: ${scanUrl}`, 330, 220, { width: 220 });
  }
  doc.fillColor("#000000");

  if (job.repeatCount && job.repeatCount > 1) {
    doc.fillColor(textPrimary).fontSize(10).text(`Repeat: Yes (${job.repeatCount} times)`, left, y, { width: 330 });
    y += 14;
    if (job.lastRepeatPrice) {
      doc.fillColor(textPrimary).fontSize(10).text(`Last Charge: ${job.lastRepeatPrice}`, left, y, { width: 330 });
      y += 14;
    }
  }

  y = Math.max(y + 8, 320);
  line(y);
  y += 12;

  if ((job.fileLinks?.length ?? 0) > 0) {
    doc.fillColor(accent).fontSize(12).text("Imported Files", left, y);
    y += 16;
    for (const [index, file] of (job.fileLinks ?? []).entries()) {
      doc.fillColor(textPrimary).fontSize(9).text(`${index + 1}. ${file.fileName}`, left, y, { width: 510 });
      y += 12;
    }
    y += 8;
  }

  const dxfParts = job.jobDxfParts ?? [];
  const partsWithWeight = dxfParts.map((part) => {
    const thicknessMm = normalizeJobDxfThickness(part.thicknessMm);
    const material = part.material?.trim() || "Mild Steel";
    const unitWeightKg = calculatePartWeightKg(part.widthMm, part.heightMm, thicknessMm, material);
    const totalWeightKg = unitWeightKg * Math.max(0, Math.round(part.quantity || 0));
    return { ...part, thicknessMm, material, totalWeightKg };
  });
  const totalPartsWeightKg = partsWithWeight.reduce((sum, part) => sum + part.totalWeightKg, 0);

  if (partsWithWeight.length > 0) {
    doc.fillColor(accent).fontSize(13).text("DXF Parts", left, y);
    y += 20;
    partsWithWeight.forEach((part, index) => {
      if (y > 720) {
        doc.addPage();
        y = 48;
      }
      const thumbX = 40;
      const thumbY = y;
      const thumbSize = 62;
      if (part.thumbnailDataUrl?.startsWith("data:image/")) {
        const base64 = part.thumbnailDataUrl.split(",")[1];
        if (base64) {
          try {
            doc.image(Buffer.from(base64, "base64"), thumbX, thumbY, { fit: [thumbSize, thumbSize] });
          } catch {
            // ignore thumbnail decode errors
          }
        }
      } else {
        doc
          .save()
          .rect(thumbX, thumbY, thumbSize, thumbSize)
          .lineWidth(0.6)
          .strokeColor("#cbd5e1")
          .stroke()
          .restore();
      }
      const textX = thumbX + thumbSize + 8;
      doc.fillColor(textPrimary).fontSize(12).text(`${index + 1}. ${part.name}`, textX, thumbY, { width: 440 });
      doc
        .fillColor(textPrimary)
        .fontSize(10)
        .text(
          `Code: ${part.partCode ?? "-"} · Size: ${part.widthMm} x ${part.heightMm} mm · Material: ${part.material} · Thickness: ${part.thicknessMm} mm`,
          textX,
          thumbY + 18,
          { width: 440 }
        );
      doc
        .fillColor(textPrimary)
        .fontSize(10)
        .text(
          `Qty: ${Math.max(0, Math.round(part.quantity || 0))} · Cut: ${part.cutLengthMm} mm · Pierce: ${part.pierceCount} · Weight: ${part.totalWeightKg.toFixed(2)} kg`,
          textX,
          doc.y + 2,
          { width: 440 }
        );
      y = Math.max(doc.y, thumbY + thumbSize) + 10;
      doc
        .save()
        .moveTo(left, y - 4)
        .lineTo(right, y - 4)
        .lineWidth(0.5)
        .strokeColor(accentSoft)
        .stroke()
        .restore();
    });
    y += 8;
    doc.fillColor(accent).fontSize(12).text(`Total Parts Weight: ${totalPartsWeightKg.toFixed(2)} kg`, left, y, { width: 510 });
    y += 16;
  }

  if (includeDriverSignoff) {
    const signY = Math.max(y + 6, 690);
    line(signY - 8);
    doc.fillColor(textPrimary).fontSize(10).text("Driver Signature: ________________________________", left, signY, {
      width: 320
    });
    doc.fillColor(textPrimary).fontSize(10).text("Date: ____ / ____ / ______", 360, signY, {
      width: 190,
      align: "right"
    });
    y = signY + 18;
  }

  doc.fillColor(textPrimary).fontSize(9).text(`Created: ${job.createdAt}`, left, y + 6, { width: 510 });
  doc.end();
  await writeComplete;
}

async function writeShortageNotePdf(
  job: JobRecord,
  checkedTotalQty: number | undefined,
  shortages: Array<{ id: string; name: string; expected: number; checked: number; shortBy: number; thumbnailDataUrl?: string }>,
  outputPath: string
) {
  ensureDir(path.dirname(outputPath));
  const doc = new PDFDocument({ margin: 40 });
  const outputStream = fs.createWriteStream(outputPath);
  const writeComplete = new Promise<void>((resolve, reject) => {
    outputStream.once("finish", () => resolve());
    outputStream.once("error", (error) => reject(error));
    doc.once("error", (error) => reject(error));
  });
  doc.pipe(outputStream);

  doc.fontSize(20).text("Shortage Note", { underline: true });
  doc.moveDown(0.6);
  doc.fontSize(12).text(`Job Number: ${job.jobNumber}`);
  doc.text(`Title: ${job.title}`);
  doc.text(`Customer: ${job.customerName ?? "-"}`);
  doc.text(`Checked On: ${new Date().toLocaleString("en-ZA")}`);
  const scanUrl = `${API_PUBLIC_URL}/scan?token=${encodeURIComponent(job.qrToken)}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: "M", margin: 1, width: 170 });
    doc.image(qrDataUrl, 390, 52, { fit: [150, 150] });
    doc.fontSize(8).fillColor("#475569").text("Scan to re-check parts", 390, 208, { width: 150, align: "center" });
    doc.fillColor("#000000");
  } catch {
    doc.fontSize(9).text(`Re-check URL: ${scanUrl}`);
  }
  if (Number.isFinite(job.quantityExpected)) {
    const expectedTotal = Number(job.quantityExpected);
    const checkedValue = Number.isFinite(checkedTotalQty) ? Number(checkedTotalQty) : 0;
    const shortTotal = Math.max(0, expectedTotal - checkedValue);
    doc.text(`Overall Qty: expected ${expectedTotal}, checked ${checkedValue}, short ${shortTotal}`);
  }

  doc.moveDown(0.8);
  doc.fontSize(13).text("Parts Short");
  doc.moveDown(0.3);

  if (shortages.length === 0) {
    doc.fontSize(10).text("No part shortages detected.");
  } else {
    shortages.forEach((item, index) => {
      if (doc.y > 730) doc.addPage();
      const rowY = doc.y;
      const thumbX = 40;
      const thumbSize = 36;
      if (item.thumbnailDataUrl?.startsWith("data:image/")) {
        const base64 = item.thumbnailDataUrl.split(",")[1];
        if (base64) {
          try {
            doc.image(Buffer.from(base64, "base64"), thumbX, rowY, { fit: [thumbSize, thumbSize] });
          } catch {
            // ignore thumbnail decode errors
          }
        }
      } else {
        doc
          .save()
          .rect(thumbX, rowY, thumbSize, thumbSize)
          .lineWidth(0.6)
          .strokeColor("#cbd5e1")
          .stroke()
          .restore();
      }
      const textX = thumbX + thumbSize + 8;
      doc.fontSize(10).text(`${index + 1}. ${item.name}`, textX, rowY, { width: 470 });
      doc
        .fontSize(9)
        .text(`Expected: ${item.expected}  Checked: ${item.checked}  Short: ${item.shortBy}`, { indent: 12 });
      doc.y = Math.max(doc.y, rowY + thumbSize) + 4;
    });
  }

  doc.moveDown(0.8);
  doc.fontSize(9).fillColor("#475569").text("Generated by Qouterx - shortage check record.");
  doc.end();
  await writeComplete;
}

async function writeQuotePdf(
  quote: QuoteRecord,
  outputPath: string,
  options?: { documentType?: "quote" | "invoice" }
) {
  const documentType = options?.documentType === "invoice" ? "invoice" : "quote";
  const isInvoice = documentType === "invoice";
  const paymentReference = buildInvoicePaymentReference(quote);
  const paymentAmount = Number.isFinite(quote.total) ? Number(quote.total) : 0;
  const paymentUrl = isInvoice ? buildInvoicePaymentUrl(paymentReference, paymentAmount) : "";
  ensureDir(path.dirname(outputPath));
  const doc = new PDFDocument({ margin: 42, size: "A4" });
  const outputStream = fs.createWriteStream(outputPath);
  const writeComplete = new Promise<void>((resolve, reject) => {
    outputStream.once("finish", () => resolve());
    outputStream.once("error", (error) => reject(error));
    doc.once("error", (error) => reject(error));
  });
  doc.pipe(outputStream);

  const accent = normalizeHexColor(quote.companyDetails?.accentColor) ?? "#0f172a";
  const accentSoft = mixHexColor(accent, "#ffffff", 0.78);
  const accentMid = mixHexColor(accent, "#ffffff", 0.45);
  const textPrimary = mixHexColor(accent, "#000000", 0.75);

  const left = 42;
  const right = 553;
  const line = (y: number) => {
    doc
      .save()
      .moveTo(left, y)
      .lineTo(right, y)
      .lineWidth(0.7)
      .strokeColor(accentSoft)
      .stroke()
      .restore();
  };
  doc.save().rect(left, 34, right - left, 5).fill(accent).restore();

  if (quote.logoDataUrl?.startsWith("data:image/")) {
    const base64 = quote.logoDataUrl.split(",")[1];
    if (base64) {
      try {
        const buffer = Buffer.from(base64, "base64");
        doc.image(buffer, left, 40, { width: 100, height: 100, fit: [100, 100] });
      } catch {
        // ignore logo errors
      }
    }
  }

  const subtitleY = 72;
  const subtitleFontSize = isInvoice ? 16 : 10;
  const metaY = isInvoice ? 98 : 92;
  const dateY = isInvoice ? 116 : 108;
  doc.fillColor(accent).fontSize(24).text(quote.companyName ?? "Quote", 150, 42, { align: "right", width: 403 });
  doc.font("Helvetica-Bold").fillColor(accentMid).fontSize(subtitleFontSize).text(isInvoice ? "Invoice" : "Professional Quotation", 150, subtitleY, {
    align: "right",
    width: 403
  });
  doc.font("Helvetica").fillColor(textPrimary).fontSize(11).text(`Quote #: ${quote.quoteNumber}`, 150, metaY, { align: "right", width: 403 });
  doc.fillColor(textPrimary).fontSize(11).text(`Date: ${new Date(quote.createdAt).toLocaleDateString("en-ZA")}`, 150, dateY, {
    align: "right",
    width: 403
  });
  line(130);

  const customerLines = [
    `Customer: ${quote.customerName ?? "-"}`,
    quote.customerDetails?.contactName ? `Contact: ${quote.customerDetails.contactName}` : undefined,
    quote.customerDetails?.email ? `Email: ${quote.customerDetails.email}` : undefined,
    quote.customerDetails?.phone ? `Phone: ${quote.customerDetails.phone}` : undefined,
    quote.customerDetails?.address ? `Address: ${quote.customerDetails.address}` : undefined,
    `Quote Title: ${quote.title}`,
    `Status: ${quote.status.toUpperCase()}`,
    isInvoice ? `Payment Ref: ${paymentReference}` : undefined
  ].filter((line): line is string => Boolean(line && line.trim()));

  const companyLines = [
    quote.companyDetails?.email ? `Email: ${quote.companyDetails.email}` : undefined,
    quote.companyDetails?.phone ? `Phone: ${quote.companyDetails.phone}` : undefined,
    quote.companyDetails?.address ? `Address: ${quote.companyDetails.address}` : undefined,
    quote.companyDetails?.vatNumber ? `VAT: ${quote.companyDetails.vatNumber}` : undefined,
    quote.companyDetails?.registrationNumber ? `Reg: ${quote.companyDetails.registrationNumber}` : undefined
  ].filter((line): line is string => Boolean(line && line.trim()));

  let companyY = 142;
  doc.fillColor(accent).fontSize(11).text("Company Details", left, companyY);
  companyY += 14;
  if (companyLines.length === 0) {
    doc.fillColor(accentMid).fontSize(9).text("No company details provided.", left, companyY, { width: 255 });
    companyY += 12;
  } else {
    companyLines.forEach((lineText) => {
      doc.fillColor(textPrimary).fontSize(9).text(lineText, left, companyY, { width: 255 });
      companyY += 12;
    });
  }

  let customerY = 142;
  doc.fillColor(accent).fontSize(11).text("Customer Details", 312, customerY, { width: 238, align: "right" });
  customerY += 14;
  customerLines.forEach((lineText) => {
    doc.fillColor(textPrimary).fontSize(9).text(lineText, 312, customerY, { width: 238, align: "right" });
    customerY += 12;
  });

  const sectionY = Math.max(customerY, companyY) + 14;
  doc.fillColor(accent).fontSize(12).text("Section Summary", left, sectionY);
  line(sectionY + 16);

  const sections = [
    ["Laser Cutting", quote.sections.laserCutting],
    ["Punching", quote.sections.punching],
    ["Fabrication", quote.sections.fabrication],
    ["Laser Welding", quote.sections.laserWelding],
    ["Tank Manufacturing", quote.sections.tankManufacturing],
    ["Bending", quote.sections.bending],
    ["Rolling", quote.sections.rolling]
  ] as const;
  const activeSections = sections.filter(([_label, section]) => {
    const hasAmount = (section.amount ?? 0) > 0;
    const hasDescription = Boolean(section.description?.trim());
    const hasParts = (section.parts?.length ?? 0) > 0;
    return hasAmount || hasDescription || hasParts;
  });

  let y = sectionY + 24;
  if (activeSections.length === 0) {
    doc.fillColor(accentMid).fontSize(9).text("No calculator sections with values.", left, y);
    y += 18;
  }
  activeSections.forEach(([label, section]) => {
    const description = section.description?.trim() || "-";
    const descriptionHeight = doc.heightOfString(description, { width: 280 });
    const sectionRowHeight = Math.max(14, descriptionHeight);
    doc.fillColor(accent).fontSize(10).text(label, left, y, { width: 110 });
    doc.fillColor(textPrimary).fontSize(9).text(description, left + 120, y, { width: 280 });
    doc.fillColor(accent).fontSize(10).text(formatRand(section.amount), 440, y, { width: 110, align: "right" });
    y += sectionRowHeight + 6;
  });

  y += 8;
  line(y);
  y += 8;

  const parts = quote.sections.laserCutting?.parts ?? [];
  if (parts.length > 0) {
    const partColX = left + 42;
    const partColWidth = 108;
    const sizeColX = 190;
    const sizeColWidth = 48;
    const thicknessColX = 242;
    const thicknessColWidth = 40;
    const materialColX = 290;
    const materialColWidth = 80;
    const qtyColX = 374;
    const qtyColWidth = 22;
    const weightColX = 404;
    const weightColWidth = 38;
    const unitColX = 448;
    const unitColWidth = 48;
    const lineTotalColX = 504;
    const lineTotalColWidth = 49;

    const drawPartsHeader = () => {
      doc.fillColor(accent).fontSize(12).text("Laser Cutting Parts", left, y);
      y += 16;
      line(y - 3);
      doc.fillColor(accentMid).fontSize(6.5);
      doc.text("Part", partColX, y, { width: partColWidth });
      doc.text("Size (mm)", sizeColX, y, { width: sizeColWidth });
      doc.text("Thickness", thicknessColX, y, { width: thicknessColWidth, align: "center" });
      doc.text("Material", materialColX, y, { width: materialColWidth });
      doc.text("Qty", qtyColX, y, { width: qtyColWidth, align: "right" });
      doc.text("kg", weightColX, y, { width: weightColWidth, align: "right" });
      doc.text("Unit", unitColX, y, { width: unitColWidth, align: "right" });
      doc.text("Line Total", lineTotalColX, y, { width: lineTotalColWidth, align: "right" });
      y += 11;
      line(y - 2);
      y += 4;
    };

    drawPartsHeader();
    parts.forEach((part) => {
      const thumbX = left;
      const thumbY = y;
      const thumbSize = 34;
      doc
        .save()
        .rect(thumbX, thumbY, thumbSize, thumbSize)
        .lineWidth(0.7)
        .strokeColor(accentSoft)
        .stroke()
        .restore();
      if (part.thumbnailDataUrl?.startsWith("data:image/")) {
        const base64 = part.thumbnailDataUrl.split(",")[1];
        if (base64) {
          try {
            doc.image(Buffer.from(base64, "base64"), thumbX + 1, thumbY + 1, { fit: [thumbSize - 2, thumbSize - 2] });
          } catch {
            // ignore thumbnail decode errors
          }
        }
      }

      const lengthMm = Math.max(0, Math.round(Number(part.lengthMm) || 0));
      const widthMm = Math.max(0, Math.round(Number(part.widthMm) || 0));
      const thicknessMm = normalizeJobDxfThickness(Number((part as { thicknessMm?: unknown }).thicknessMm));
      const material = typeof part.material === "string" && part.material.trim() ? part.material.trim() : "Mild Steel";
      const partCode = typeof (part as { partCode?: unknown }).partCode === "string" ? String((part as { partCode?: unknown }).partCode).trim() : "";
      const name = `${part.name}${part.dxfName ? ` (${part.dxfName})` : ""}`;
      const spec = `${lengthMm}x${widthMm}`;
      const process = `${partCode ? `${partCode} • ` : ""}Cut ${Math.round(part.cutLengthMm || 0)}mm • Pierce ${Math.round(part.pierceCount || 0)} • Bend ${Math.round(
        part.bendCount || 0
      )}`;
      const qtyValue = Math.max(0, Math.round(part.quantity || 0));
      const partWeightRaw = (part as { weightKg?: unknown }).weightKg;
      const partWeight =
        typeof partWeightRaw === "number" && Number.isFinite(partWeightRaw)
          ? partWeightRaw
          : calculatePartWeightKg(lengthMm, widthMm, thicknessMm, material);

      doc.fontSize(9);
      const nameHeight = doc.heightOfString(name, { width: partColWidth, align: "left" });
      const processLine = `${process} • Qty ${qtyValue}`;
      doc.fontSize(8);
      const processHeight = doc.heightOfString(processLine, { width: partColWidth, align: "left" });
      const materialHeight = doc.heightOfString(material, { width: materialColWidth, align: "left" });
      const rowHeight = Math.max(44, Math.ceil(Math.max(nameHeight + processHeight + 14, materialHeight + 10)));
      if (y + rowHeight > 748) {
        doc.addPage();
        y = 48;
        drawPartsHeader();
      }

      doc.fillColor(accent).fontSize(8.5).text(name, partColX, y + 1, { width: partColWidth });
      doc.fillColor(accentMid).fontSize(8).text(processLine, partColX, y + 5 + nameHeight, { width: partColWidth });
      doc.fillColor(textPrimary).fontSize(8).text(spec, sizeColX, y + 1, { width: sizeColWidth });
      doc.fillColor(textPrimary).fontSize(8).text(`${thicknessMm}mm`, thicknessColX, y + 1, {
        width: thicknessColWidth,
        align: "center"
      });
      doc.fillColor(textPrimary).fontSize(7).text(material, materialColX, y + 1, { width: materialColWidth });
      doc.fillColor(textPrimary).fontSize(8).text(String(qtyValue), qtyColX, y + 1, { width: qtyColWidth, align: "right" });
      doc.fillColor(textPrimary).fontSize(7.5).text(partWeight !== null ? `${partWeight.toFixed(2)}kg` : "-", weightColX, y + 1, {
        width: weightColWidth,
        align: "right"
      });
      doc.fillColor(accent).fontSize(7.5).text(formatRand(part.unitPrice), unitColX, y + 1, { width: unitColWidth, align: "right" });
      doc.fillColor(accent).fontSize(7.5).text(formatRand(part.lineTotal), lineTotalColX, y + 1, { width: lineTotalColWidth, align: "right" });
      y += rowHeight;
    });
  }

  y += 6;
  line(y);
  y += 10;
  doc
    .fillColor(textPrimary)
    .fontSize(9)
    .text("Terms: Payment due within 30 days. Material remains supplier property until paid in full.", left, y, {
      width: 511
    });
  y += 16;
  if (isInvoice) {
    const paymentLines = [
      paymentUrl ? "Scan the QR or open the payment link below." : "Use the payment reference below when making payment.",
      `Reference: ${paymentReference}`,
      PAYMENT_BANK_NAME ? `Bank: ${PAYMENT_BANK_NAME}` : undefined,
      PAYMENT_ACCOUNT_NAME ? `Account Name: ${PAYMENT_ACCOUNT_NAME}` : undefined,
      PAYMENT_ACCOUNT_NUMBER ? `Account No: ${PAYMENT_ACCOUNT_NUMBER}` : undefined,
      PAYMENT_BRANCH_CODE ? `Branch Code: ${PAYMENT_BRANCH_CODE}` : undefined,
      PAYMENT_ACCOUNT_TYPE ? `Account Type: ${PAYMENT_ACCOUNT_TYPE}` : undefined
    ].filter((lineText): lineText is string => Boolean(lineText && lineText.trim()));
    const textWidth = paymentUrl ? 320 : 511;
    doc.fillColor(accent).fontSize(11).text("Payment Details", left, y, { width: textWidth });
    let paymentY = y + 14;
    paymentLines.forEach((lineText) => {
      doc.fillColor(textPrimary).fontSize(9).text(lineText, left, paymentY, { width: textWidth });
      paymentY += 12;
    });
    if (paymentUrl) {
      const clippedUrl = paymentUrl.length > 88 ? `${paymentUrl.slice(0, 85)}...` : paymentUrl;
      doc.fillColor(accentMid).fontSize(8).text(clippedUrl, left, paymentY + 2, { width: textWidth });
      try {
        const qrDataUrl = await QRCode.toDataURL(paymentUrl, { errorCorrectionLevel: "M", margin: 1, width: 140 });
        doc.image(qrDataUrl, 402, y - 2, { fit: [136, 136] });
      } catch {
        // ignore payment QR errors
      }
      paymentY += 24;
    }
    y = Math.max(paymentY + 6, y + (paymentUrl ? 146 : 78));
  }
  doc
    .fillColor(textPrimary)
    .fontSize(9)
    .text("Prepared by: Qouterx Quote System", left, y, { width: 260 });
  doc.fillColor(textPrimary).fontSize(9).text("Accepted by: ____________________", 320, y, {
    width: 230,
    align: "right"
  });

  y = Math.max(y + 10, 680);
  line(y);
  y += 10;

  const sectionList = [
    quote.sections.laserCutting,
    quote.sections.punching,
    quote.sections.fabrication,
    quote.sections.laserWelding,
    quote.sections.tankManufacturing,
    quote.sections.bending,
    quote.sections.rolling
  ];
  const quoteTotal = Number.isFinite(quote.total) ? Number(quote.total) : 0;
  const knownVat = sectionList.reduce((sum, section) => sum + (section?.totals?.vat ?? 0), 0);
  const vatRate = Number(quote.sections.laserCutting?.vatRate ?? 0);
  const quoteVat =
    knownVat > 0
      ? knownVat
      : vatRate > 0
        ? quoteTotal - quoteTotal / (1 + vatRate / 100)
        : 0;
  const quoteSubTotal = Math.max(0, quoteTotal - quoteVat);

  doc.fillColor(accent).fontSize(11).text(`Sub Total: ${formatRand(quoteSubTotal)}`, 360, y, {
    width: 190,
    align: "right"
  });
  y += 16;
  doc
    .fillColor(accent)
    .fontSize(11)
    .text(`VAT (${vatRate.toFixed(2)}%): ${formatRand(quoteVat)}`, 360, y, { width: 190, align: "right" });
  y += 16;
  doc.fillColor(accent).fontSize(13).text(`Grand Total: ${formatRand(quoteTotal)}`, 360, y + 2, {
    width: 190,
    align: "right"
  });

  doc.end();
  await writeComplete;
}

function writeQuoteDxf(quote: QuoteRecord, outputPath: string) {
  ensureDir(path.dirname(outputPath));
  const parts = quote.sections.laserCutting?.parts ?? [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const rowLimit = 3000;
  const gap = 20;
  let dxf = "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";

  const addLine = (x1: number, y1: number, x2: number, y2: number, layer = "0") => {
    dxf += `0\nLINE\n8\n${layer}\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0\n`;
  };
  const addText = (tx: number, ty: number, text: string) => {
    dxf += `0\nTEXT\n8\nANNOTATION\n10\n${tx}\n20\n${ty}\n30\n0\n40\n12\n1\n${text}\n`;
  };

  parts.forEach((part, index) => {
    const w = Math.max(1, part.lengthMm || 1);
    const h = Math.max(1, part.widthMm || 1);
    if (x + w > rowLimit) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    rowHeight = Math.max(rowHeight, h);

    const x1 = x;
    const y1 = y;
    const x2 = x + w;
    const y2 = y + h;

    addLine(x1, y1, x2, y1, "PARTS");
    addLine(x2, y1, x2, y2, "PARTS");
    addLine(x2, y2, x1, y2, "PARTS");
    addLine(x1, y2, x1, y1, "PARTS");
    addText(x1, y2 + 10, `${index + 1}. ${part.name} QTY:${part.quantity}`);

    x += w + gap;
  });

  dxf += "0\nENDSEC\n0\nEOF\n";
  fs.writeFileSync(outputPath, dxf, "utf8");
}


function workspaceAccessRequired(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const userId = req.userId as string;
  const workspaceId = req.params.workspaceId;
  if (!workspaceId || !hasMembership(userId, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}

function workspaceSubscriptionRequired(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const workspaceId = req.params.workspaceId;
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  if (!workspaceHasBillingAccess(ws, req.userId)) {
    sendBillingRequired(res, ws);
    return;
  }
  next();
}

app.post("/api/auth/register", (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
  const workspaceName = typeof req.body?.workspaceName === "string" ? req.body.workspaceName.trim() : "Company";
  if (!email || !password) {
    res.status(400).json({ error: "email and password required" });
    return;
  }
  if (getUserByEmail(email)) {
    res.status(400).json({ error: "email already exists" });
    return;
  }
  const user: UserRecord = {
    id: `user-${crypto.randomUUID()}`,
    email,
    name,
    accountRef: undefined,
    manualAccountPaidUntil: null,
    ownerLocked: false,
    passwordHash: hashPassword(password),
    provider: "local",
    createdAt: new Date().toISOString()
  };
  upsertUser(user);
  ensureUserAccountRef(user);

  const workspaceId = `workspace-${crypto.randomUUID()}`;
  const workspace = getWorkspace(workspaceId);
  workspace.name = workspaceName || workspace.name;
  workspace.ownerUserId = user.id;
  upsertWorkspace(workspace);
  getWorkspaceSubscriptionCompany(workspace, user.id);

  const membership: MembershipRecord = { userId: user.id, workspaceId, role: "owner" };
  addMembership(membership);

  const token = crypto.randomBytes(24).toString("hex");
  const session: SessionRecord = { token, userId: user.id, createdAt: new Date().toISOString() };
  createSession(session);

  res.json({ token, user: { id: user.id, email: user.email, name: user.name, accountRef: user.accountRef }, workspaces: [workspace] });
});

app.post("/api/auth/login", (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    res.status(400).json({ error: "email and password required" });
    return;
  }
  const user = ensureAppOwnerBootstrap(email, password);
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: getOwnerLoginFailureMessage(email, password) });
    return;
  }
  ensureUserAccountRef(user);
  const token = crypto.randomBytes(24).toString("hex");
  const session: SessionRecord = { token, userId: user.id, createdAt: new Date().toISOString() };
  createSession(session);
  const workspaces = getUserWorkspaces(user.id);
  workspaces.forEach((workspace) => {
    getWorkspaceSubscriptionCompany(workspace, user.id);
  });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, accountRef: user.accountRef }, workspaces });
});

app.get("/api/auth/me", authRequired, (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const user = getUserById(userId);
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  const workspaces = getUserWorkspaces(userId);
  workspaces.forEach((workspace) => {
    getWorkspaceSubscriptionCompany(workspace, userId);
  });
  ensureUserAccountRef(user);
  res.json({ user: { id: user.id, email: user.email, name: user.name, accountRef: user.accountRef }, workspaces });
});

app.post("/api/auth/verify-password", authRequired, (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password) {
    res.status(400).json({ error: "password required" });
    return;
  }
  const user = getUserById(userId);
  if (!user?.passwordHash) {
    res.status(400).json({ error: "local password not available for this account" });
    return;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "invalid password" });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/email/oauth/config", authRequired, (_req, res) => {
  res.json({ ok: true, config: getGraphConfig() });
});

app.post("/api/email/oauth/device-code/start", authRequired, async (_req, res) => {
  try {
    const flow = await startGraphDeviceCodeFlow();
    res.json({ ok: true, flow });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to start Microsoft sign-in." });
  }
});

app.post("/api/email/oauth/device-code/poll", authRequired, async (req, res) => {
  const deviceCode = typeof req.body?.deviceCode === "string" ? req.body.deviceCode.trim() : "";
  if (!deviceCode) {
    res.status(400).json({ error: "deviceCode required" });
    return;
  }
  try {
    const tokens = await pollGraphDeviceCode(deviceCode);
    res.json({ ok: true, tokens });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to complete Microsoft sign-in." });
  }
});

app.post("/api/email/oauth/refresh", authRequired, async (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken.trim() : "";
  if (!refreshToken) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }
  try {
    const tokens = await refreshGraphAccessToken(refreshToken);
    res.json({ ok: true, tokens });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to refresh Microsoft token." });
  }
});

app.get("/api/email/folders", authRequired, async (req: AuthedRequest, res) => {
  const workspaceId = typeof req.query?.workspaceId === "string" ? req.query.workspaceId.trim() : "";
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const accessToken = getGraphAccessTokenFromRequest(req);
    const graphFolders = await listGraphFolders(accessToken);
    const syncState = listSyncFolders(getEmailDb(), workspaceId);
    res.json({
      ok: true,
      folders: [
        ...graphFolders,
        { id: "quote_requests", displayName: "Quote Requests" },
        { id: "purchase_orders", displayName: "Purchase Orders" },
        { id: "attachments", displayName: "Attachments" },
        { id: "customers", displayName: "Customers" }
      ],
      syncState
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to load folders." });
  }
});

app.post("/api/email/sync", authRequired, async (req: AuthedRequest, res) => {
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const ws = getWorkspace(workspaceId);
    const folder = typeof req.body?.folder === "string" ? req.body.folder.trim().toLowerCase() : "inbox";
    const accessToken = getGraphAccessTokenFromRequest(req);
    const synced = await syncGraphMessagesForWorkspace({
      db: getEmailDb(),
      workspaceId,
      accessToken,
      folder,
      knownCustomerEmails: ws.customers.map((customer) => customer.email ?? "").filter(Boolean),
      top: Number(req.body?.top) || 80
    });
    res.json({ ok: true, synced });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to sync messages." });
  }
});

app.get("/api/email/messages", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = typeof req.query?.workspaceId === "string" ? req.query.workspaceId.trim() : "";
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const folder = typeof req.query?.folder === "string" ? req.query.folder.trim() : "all";
  const filter = typeof req.query?.filter === "string" ? req.query.filter.trim() : "";
  const search = typeof req.query?.search === "string" ? req.query.search.trim() : "";
  const page = Number(req.query?.page) || 1;
  const messages = listStoredEmails(getEmailDb(), workspaceId, { folder, filter, search, page, pageSize: 80 });
  res.json({ ok: true, messages: messages.map((message) => mapStoredEmailToInboxMessage(message)) });
});

app.get("/api/email/messages/:id", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = typeof req.query?.workspaceId === "string" ? req.query.workspaceId.trim() : "";
  const emailId = Number(req.params.id);
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (!Number.isFinite(emailId) || emailId <= 0) {
    res.status(400).json({ error: "valid email id required" });
    return;
  }
  const message = getStoredEmail(getEmailDb(), workspaceId, emailId);
  if (!message) {
    res.status(404).json({ error: "email not found" });
    return;
  }
  res.json({ ok: true, message: mapStoredEmailToInboxMessage(message) });
});

app.post("/api/email/messages/:id/classify", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  const emailId = Number(req.params.id);
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const email = getStoredEmail(getEmailDb(), workspaceId, emailId);
  if (!email) {
    res.status(404).json({ error: "email not found" });
    return;
  }
  const detection = classifyEmailContent({
    subject: email.subject,
    bodyText: email.bodyText ?? email.bodyPreview,
    senderEmail: email.senderEmail,
    attachmentNames: email.attachments.map((attachment) => attachment.fileName),
    attachmentTypes: email.attachments.map((attachment) => attachment.attachmentType)
  });
  const updated = updateStoredEmailDetection(getEmailDb(), workspaceId, emailId, {
    correctedType: detection.detectedType
  });
  res.json({ ok: true, detection, message: updated ? mapStoredEmailToInboxMessage(updated) : null });
});

app.patch("/api/email/messages/:id/detection", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  const emailId = Number(req.params.id);
  const correctedType = typeof req.body?.correctedType === "string" ? (req.body.correctedType.trim() as EmailDetectedType) : "";
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (!correctedType) {
    res.status(400).json({ error: "correctedType required" });
    return;
  }
  const updated = updateStoredEmailDetection(getEmailDb(), workspaceId, emailId, {
    correctedType,
    reason: typeof req.body?.reason === "string" ? req.body.reason.trim() : null
  });
  if (!updated) {
    res.status(404).json({ error: "email not found" });
    return;
  }
  res.json({ ok: true, message: mapStoredEmailToInboxMessage(updated) });
});

app.get("/api/email/messages/:id/attachments", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = typeof req.query?.workspaceId === "string" ? req.query.workspaceId.trim() : "";
  const emailId = Number(req.params.id);
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const message = getStoredEmail(getEmailDb(), workspaceId, emailId);
  if (!message) {
    res.status(404).json({ error: "email not found" });
    return;
  }
  res.json({
    ok: true,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      graphAttachmentId: attachment.graphAttachmentId,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      localPath: attachment.localPath,
      attachmentType: attachment.attachmentType,
      importedToDxfReader: attachment.importedToDxfReader
    }))
  });
});

app.post("/api/email/attachments/:id/download", authRequired, async (req: AuthedRequest, res) => {
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  const attachmentId = Number(req.params.id);
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const accessToken = getGraphAccessTokenFromRequest(req);
    const download = await downloadGraphAttachment({
      db: getEmailDb(),
      workspaceId,
      accessToken,
      attachmentId,
      storageRoot: getEmailModuleRoot()
    });
    res.json({ ok: true, attachment: download.attachment, payload: download });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to download attachment." });
  }
});

app.post("/api/email/attachments/:id/import-dxf", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  const attachmentId = Number(req.params.id);
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const attachment = markGraphAttachmentImported({ db: getEmailDb(), workspaceId, attachmentId });
  if (!attachment) {
    res.status(404).json({ error: "attachment not found" });
    return;
  }
  res.json({ ok: true, attachment });
});

app.post("/api/email/messages/:id/create-quote", authRequired, async (req: AuthedRequest, res) => {
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  const emailId = Number(req.params.id);
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const email = getStoredEmail(getEmailDb(), workspaceId, emailId);
  if (!email) {
    res.status(404).json({ error: "email not found" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const quoteNumber = getNextQuoteNumber(workspaceId);
  const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim() : (email.subject || "Email Quote");
  const customerName =
    ws.customers.find((customer) => customer.email?.trim().toLowerCase() === email.senderEmail.trim().toLowerCase())?.name ??
    email.senderName ??
    email.senderEmail;
  const customer = ws.customers.find((entry) => entry.name.trim().toLowerCase() === customerName.trim().toLowerCase());
  const sections: QuoteSections = {
    laserCutting: {
      description: `Auto-created from email ${email.graphMessageId}`,
      parts: [],
      amount: 0
    },
    punching: {},
    fabrication: {},
    laserWelding: {},
    tankManufacturing: {},
    bending: {},
    rolling: {}
  };
  const profile = ws.companyProfile ?? {};
  const quote: QuoteRecord = {
    id: `quote-${crypto.randomUUID()}`,
    quoteNumber,
    title,
    status: "draft",
    customerName,
    companyName: profile.name,
    logoDataUrl: profile.logoDataUrl,
    companyDetails: {
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      vatNumber: profile.vatNumber,
      registrationNumber: profile.registrationNumber,
      accentColor: normalizeHexColor(profile.accentColor)
    },
    customerDetails: {
      contactName: customerName,
      email: email.senderEmail,
      address: customer?.address ?? customer?.notes ?? ""
    },
    sections,
    total: 0,
    createdAt: new Date().toISOString()
  };
  const quotePdfPath = path.join(getQuotesRoot(), `${quote.quoteNumber}.pdf`);
  quote.quotePdfPath = quotePdfPath;
  await writeQuotePdf(quote, quotePdfPath, { documentType: "quote" });
  updateWorkspaceQuotes(workspaceId, [quote, ...ws.quotes]);
  createQuoteDraftFromEmail({ db: getEmailDb(), workspaceId, emailId, quoteId: quote.id });
  res.json({ ok: true, quote });
});

app.post("/api/email/messages/:id/create-job-from-po", authRequired, async (req: AuthedRequest, res) => {
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  const emailId = Number(req.params.id);
  if (!workspaceId || !hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const email = getStoredEmail(getEmailDb(), workspaceId, emailId);
  if (!email) {
    res.status(404).json({ error: "email not found" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const matchedQuote = findBestQuoteMatch(
    email,
    ws.quotes.map((quote) => ({ id: quote.id, quoteNumber: quote.quoteNumber, title: quote.title, customerName: quote.customerName }))
  );
  const jobNumber = getNextJobNumber(workspaceId);
  const customerName =
    matchedQuote?.customerName ??
    ws.customers.find((customer) => customer.email?.trim().toLowerCase() === email.senderEmail.trim().toLowerCase())?.name ??
    email.senderName ??
    email.senderEmail;
  const jobFolder = getActiveJobFolder(jobNumber, customerName);
  const customerFolder = customerName ? getCustomerFolder(customerName) : undefined;
  const jobCardPath = path.join(jobFolder, `${jobNumber}.pdf`);
  const job: JobRecord = {
    id: `job-${crypto.randomUUID()}`,
    jobNumber,
    qrToken: `qt_${crypto.randomBytes(10).toString("hex")}`,
    title: email.subject || "PO Job",
    status: "open",
    customerName,
    quoteNumber: matchedQuote?.quoteNumber,
    customerFolder,
    jobFolder,
    fileLinks: [],
    jobDxfParts: [],
    jobCardPath,
    createdAt: new Date().toISOString()
  };
  updateWorkspaceJobs(workspaceId, [job, ...ws.jobs]);
  linkPurchaseOrderToJob({
    db: getEmailDb(),
    workspaceId,
    emailId,
    purchaseOrderId: job.id,
    quoteId: matchedQuote?.id ?? null
  });
  res.json({ ok: true, job, matchedQuote });
});

app.get("/api/storage/info", (_req, res) => {
  const oneDriveRoot = detectOneDriveRoot();
  const jobnestRoot = getJobnestRoot();
  res.json({ oneDriveRoot, jobnestRoot });
});

app.get("/api/scan/job", (req, res) => {
  const token = typeof req.query?.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }
  const found = findJobByToken(token);
  if (!found) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  const job = found.job;
  const ws = getWorkspace(found.workspaceId);
  const expectedQuantity = resolveExpectedQuantity(job);
  res.json({
    job: {
      id: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      status: job.status,
      customerName: job.customerName,
      quoteNumber: job.quoteNumber,
      assignedTo: job.assignedTo,
      quantityExpected: expectedQuantity,
      quantityChecked: job.quantityChecked,
      checkedBy: job.checkedBy,
      checkedAt: job.checkedAt,
      createdAt: job.createdAt,
      fileLinks: (job.fileLinks ?? []).map((file) => ({ fileName: file.fileName })),
      jobDxfParts: (job.jobDxfParts ?? []).map((part) => ({
        id: part.id,
        name: part.name,
        layer: part.layer,
        material: part.material,
        thicknessMm: part.thicknessMm,
        quantity: part.quantity,
        widthMm: part.widthMm,
        heightMm: part.heightMm,
        cutLengthMm: part.cutLengthMm,
        pierceCount: part.pierceCount,
        thumbnailDataUrl: part.thumbnailDataUrl
      }))
    },
    employees: (ws.workers ?? [])
      .map((worker) => worker.name?.trim())
      .filter((name): name is string => Boolean(name)),
    shortageNoteUrl: job.shortageNotePath ? `/api/scan/shortage-note?token=${encodeURIComponent(token)}` : undefined
  });
});

app.get("/api/scan/shortage-note", (req, res) => {
  const token = typeof req.query?.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }
  const found = findJobByToken(token);
  if (!found?.job?.shortageNotePath || !fs.existsSync(found.job.shortageNotePath)) {
    res.status(404).json({ error: "shortage note not found" });
    return;
  }
  res.sendFile(found.job.shortageNotePath);
});

app.get("/api/scan/jobcard", async (req, res) => {
  const token = typeof req.query?.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }
  const found = findJobByToken(token);
  if (!found) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  const ws = getWorkspace(found.workspaceId);
  const job = ws.jobs.find((entry) => entry.id === found.job.id);
  if (!job?.jobCardPath) {
    res.status(404).json({ error: "job card not found" });
    return;
  }
  try {
    await writeJobCard(ws, job, job.jobCardPath);
    copyJobCardToCustomerFolder(job);
  } catch (error) {
    res.status(500).json({ error: "failed to render job card", details: error instanceof Error ? error.message : "unknown error" });
    return;
  }
  res.sendFile(job.jobCardPath);
});

app.get("/scan", (req, res) => {
  const token = typeof req.query?.token === "string" ? req.query.token : "";
  const safeTokenJson = JSON.stringify(token);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Job Scan</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #1e1f22; color: #fff; }
    .wrap { max-width: 920px; margin: 24px auto; background: #232428; border: 1px solid #31343b; border-radius: 12px; padding: 16px; }
    .panel { background: #1b1c1f; border: 1px solid #343842; border-radius: 10px; padding: 12px; margin-top: 12px; }
    input, select, button { border-radius: 8px; border: 1px solid #444; padding: 10px; }
    input, select { background: #111; color: #fff; width: 100%; box-sizing: border-box; }
    button { background: #5865f2; color: #fff; cursor: pointer; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
    .parts { display: grid; gap: 8px; margin-top: 10px; }
    .part { display: grid; grid-template-columns: 1fr 120px 120px; gap: 8px; align-items: center; background: #232428; border: 1px solid #2d3340; border-radius: 8px; padding: 8px; }
    .muted { opacity: 0.72; font-size: 12px; }
    .ok { color: #22c55e; }
    .bad { color: #fb7185; }
  </style>
</head>
<body>
  <div class="wrap">
    <h2 style="margin:0 0 10px 0">Job Card Scan</h2>
    <div class="muted">Open from QR, verify quantities, then complete.</div>
    <div class="row" style="margin-top:12px">
      <input id="token" placeholder="QR token" />
      <button id="loadBtn">Load Job</button>
    </div>
    <div id="status" class="muted" style="margin-top:10px"></div>
    <div id="job" class="panel" style="display:none"></div>
    <div id="partsPanel" class="panel" style="display:none">
      <div style="font-weight:700">Part Quantity Check</div>
      <div style="margin-top:10px">
        <input id="overallQty" placeholder="Overall checked quantity" />
      </div>
      <div style="margin-top:8px">
        <select id="checkedBy">
          <option value="">Select employee who checked</option>
        </select>
      </div>
      <div id="parts" class="parts"></div>
      <button id="doneBtn" style="width:100%; margin-top:10px">Done (Complete Quantity Check)</button>
      <button id="shortBtn" style="display:none; width:100%; margin-top:8px; background:#450a0a; border-color:#7f1d1d">Open Shortage Note PDF</button>
    </div>
  </div>
  <script>
    const tokenInput = document.getElementById("token");
    const loadBtn = document.getElementById("loadBtn");
    const statusEl = document.getElementById("status");
    const jobEl = document.getElementById("job");
    const partsPanel = document.getElementById("partsPanel");
    const partsEl = document.getElementById("parts");
    const overallQtyEl = document.getElementById("overallQty");
    const checkedByEl = document.getElementById("checkedBy");
    const doneBtn = document.getElementById("doneBtn");
    const shortBtn = document.getElementById("shortBtn");
    let currentJob = null;

    function setStatus(text, ok) {
      statusEl.textContent = text || "";
      statusEl.className = "muted " + (ok === true ? "ok" : ok === false ? "bad" : "");
    }

    function esc(text) {
      return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    async function loadJob() {
      const token = (tokenInput.value || "").trim();
      if (!token) { setStatus("Enter QR token.", false); return; }
      setStatus("Loading job...", null);
      try {
        await fetch("/api/scan/start?token=" + encodeURIComponent(token)).catch(() => null);
        const res = await fetch("/api/scan/job?token=" + encodeURIComponent(token));
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setStatus(data.error || "Failed to load job.", false); return; }
        currentJob = data.job;
        jobEl.style.display = "block";
        partsPanel.style.display = "block";
        const files = (currentJob.fileLinks || []).map((f) => f.fileName).join(", ") || "No files";
        jobEl.innerHTML =
          "<div style='font-size:18px;font-weight:700'>" + currentJob.jobNumber + "</div>" +
          "<div>" + (currentJob.title || "") + "</div>" +
          "<div class='muted'>Customer: " + (currentJob.customerName || "-") + " | Status: " + (currentJob.status || "-") + "</div>" +
          "<div class='muted'>Files: " + files + "</div>";
        overallQtyEl.value = Number.isFinite(Number(currentJob.quantityExpected)) ? String(Math.round(Number(currentJob.quantityExpected))) : "";
        const employees = Array.isArray(data.employees) ? data.employees : [];
        checkedByEl.innerHTML = "<option value=''>Select employee who checked</option>" +
          employees.map((name) => "<option value='" + esc(name) + "'>" + esc(name) + "</option>").join("");
        if (currentJob.checkedBy) {
          checkedByEl.value = currentJob.checkedBy;
        }
        partsEl.innerHTML = "";
        (currentJob.jobDxfParts || []).forEach((p) => {
          const row = document.createElement("div");
          row.className = "part";
          const thumbHtml = p.thumbnailDataUrl
            ? "<img src='" + p.thumbnailDataUrl + "' style='width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #334155;background:#0b1220' />"
            : "<div style='width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:1px solid #334155;background:#0b1220;font-size:10px;opacity:0.7'>No DXF</div>";
          row.innerHTML =
            "<div style='display:flex;gap:8px;align-items:center'>" + thumbHtml + "<div><div style='font-weight:700'>" + p.name + "</div><div class='muted'>" + p.widthMm + " x " + p.heightMm + " mm</div></div></div>" +
            "<div class='muted'>Expected: " + p.quantity + "</div>" +
            "<input data-part-id='" + p.id + "' value='" + p.quantity + "' placeholder='Checked qty' />";
          partsEl.appendChild(row);
        });
        if (data.shortageNoteUrl) {
          shortBtn.style.display = "block";
          shortBtn.onclick = () => window.open(data.shortageNoteUrl, "_blank");
        } else {
          shortBtn.style.display = "none";
          shortBtn.onclick = null;
        }
        setStatus("Loaded " + currentJob.jobNumber + ".", true);
      } catch (e) {
        setStatus("Server stopped responding.", false);
      }
    }

    async function submitDone() {
      const token = (tokenInput.value || "").trim();
      if (!token || !currentJob) { setStatus("Load a job first.", false); return; }
      const quantity = Number(overallQtyEl.value || 0);
      const checkedBy = (checkedByEl.value || "").trim();
      if (!checkedBy) {
        setStatus("Select employee who checked this job.", false);
        return;
      }
      const partQuantities = Array.from(partsEl.querySelectorAll("input[data-part-id]")).map((input) => ({
        id: input.getAttribute("data-part-id"),
        quantity: Math.max(0, Math.round(Number(input.value || 0)))
      }));
      setStatus("Submitting quantity check...", null);
      try {
        const res = await fetch("/api/scan/quantity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, quantity, checkedBy, partQuantities })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setStatus((data.error || "Quantity check failed.") + (data.details ? ": " + data.details : ""), false); return; }
        if (data.status === "done") {
          const checkedAtText = data.checkedAt ? new Date(data.checkedAt).toLocaleString("en-ZA") : new Date().toLocaleString("en-ZA");
          const checkedByText = data.checkedBy || checkedBy;
          setStatus("Done. Job moved to completed.", true);
          shortBtn.style.display = "none";
          const printNow = window.confirm("Done quantity check by " + checkedByText + " at " + checkedAtText + ". Open print view now?");
          if (printNow) {
            window.open((data.jobCardUrl || ("/api/scan/jobcard?token=" + encodeURIComponent(token))), "_blank");
          }
        } else {
          setStatus("Incomplete: shortage note generated.", false);
          if (data.shortageNoteUrl) {
            shortBtn.style.display = "block";
            shortBtn.onclick = () => window.open(data.shortageNoteUrl, "_blank");
          }
        }
        await loadJob();
      } catch (e) {
        setStatus("Server stopped responding.", false);
      }
    }

    tokenInput.value = ${safeTokenJson};
    loadBtn.onclick = loadJob;
    doneBtn.onclick = submitDone;
    if (tokenInput.value) loadJob();
  </script>
</body>
</html>`;
  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
});

app.get("/api/scan/start", (req, res) => {
  const token = typeof req.query?.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).send("token required");
    return;
  }
  const result = markJobInProgressByToken(token, "start link");
  if (!result.ok) {
    res.status(404).send("job not found");
    return;
  }
  const job = result.job;
  res
    .status(200)
    .setHeader("Content-Type", "text/html; charset=utf-8")
    .send(
      `<html><body style="font-family:Arial,sans-serif;padding:24px;background:#111;color:#fff"><h2>Job In Progress</h2><p>${job?.jobNumber ?? ""} ${job?.title ?? ""}</p><p>Status set to in progress.</p></body></html>`
    );
});

app.post("/api/scan/quantity", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const quantity =
    typeof req.body?.quantity === "number" && Number.isFinite(req.body.quantity) ? req.body.quantity : undefined;
  const checkedBy = typeof req.body?.checkedBy === "string" ? req.body.checkedBy.trim() : "";
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }
  if (!checkedBy) {
    res.status(400).json({ error: "checkedBy required" });
    return;
  }
  const found = findJobByToken(token);
  if (!found) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  const ws = getWorkspace(found.workspaceId);
  const inputParts = Array.isArray(req.body?.partQuantities)
    ? (req.body.partQuantities as unknown[])
        .map((entry) => {
          const row = entry as Record<string, unknown>;
          return {
            id: typeof row.id === "string" ? row.id.trim() : "",
            name: typeof row.name === "string" ? row.name.trim() : "",
            quantity: Math.max(0, Math.round(Number(row.quantity) || 0))
          };
        })
        .filter((entry) => entry.id || entry.name)
    : [];
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  inputParts.forEach((entry) => {
    if (entry.id) byId.set(entry.id, entry.quantity);
    if (entry.name) byName.set(entry.name.toLowerCase(), entry.quantity);
  });

  let updatedJob: JobRecord | undefined;
  let shortages: Array<{ id: string; name: string; expected: number; checked: number; shortBy: number; thumbnailDataUrl?: string }> = [];
  const jobs: JobRecord[] = [];

  for (const job of ws.jobs) {
    if (job.id !== found.job.id) {
      jobs.push(job);
      continue;
    }
    const expectedParts = job.jobDxfParts ?? [];
    shortages = expectedParts
      .map((part) => {
        const checkedQty = byId.get(part.id) ?? byName.get(part.name.toLowerCase()) ?? 0;
        const expectedQty = Math.max(0, Math.round(part.quantity || 0));
        const shortBy = Math.max(0, expectedQty - checkedQty);
        return {
          id: part.id,
          name: part.name,
          expected: expectedQty,
          checked: checkedQty,
          shortBy,
          thumbnailDataUrl: part.thumbnailDataUrl
        };
      })
      .filter((entry) => entry.shortBy > 0);

    const expectedTotal = resolveExpectedQuantity(job);
    const checkedTotalFromParts = inputParts.reduce((sum, entry) => sum + Math.max(0, Math.round(entry.quantity || 0)), 0);
    const checkedTotal =
      Number.isFinite(quantity) && Number(quantity) > 0
        ? quantity
        : (checkedTotalFromParts > 0 ? checkedTotalFromParts : undefined);
    const totalShortBy =
      expectedTotal !== undefined ? Math.max(0, Math.round(expectedTotal) - Math.round(checkedTotal ?? 0)) : 0;
    const totalMatches = expectedTotal === undefined ? true : Math.round(checkedTotal ?? 0) === Math.round(expectedTotal);
    const partsMatch = shortages.length === 0;
    const isDone = totalMatches && partsMatch;
    const shortagesForReport =
      shortages.length > 0
        ? shortages
        : totalShortBy > 0
          ? [
              {
                id: "overall",
                name: "Overall quantity",
                expected: Math.round(expectedTotal ?? 0),
                checked: Math.round(checkedTotal ?? 0),
                shortBy: totalShortBy
              }
            ]
          : [];

    if (isDone) {
      const checkedAt = new Date().toISOString();
      const doneJob = finalizeCompletedJob(
        { ...job, quantityChecked: checkedTotal, status: "done", shortageNotePath: undefined, checkedBy, checkedAt },
        ws.jobs
      );
      updatedJob = doneJob;
      jobs.push(doneJob);
      io.to("general").emit("system", `✅ Job completed: ${doneJob.jobNumber} ${doneJob.title}`);
      continue;
    }

    let nextJob: JobRecord = {
      ...job,
      quantityChecked: checkedTotal ?? job.quantityChecked,
      status: "incomplete"
    };
    if (job.status === "done") {
      nextJob = reopenJobAsIncomplete(nextJob);
    }
    try {
      const targetFolder = nextJob.jobFolder ?? getActiveJobFolder(nextJob.jobNumber, nextJob.customerName);
      ensureDir(targetFolder);
      const noteName = `${sanitizeName(nextJob.jobNumber) || nextJob.jobNumber}-shortage-note.pdf`;
      const notePath = path.join(targetFolder, noteName);
      await writeShortageNotePdf(nextJob, checkedTotal, shortagesForReport, notePath);
      nextJob.shortageNotePath = notePath;
      copyJobCardToCustomerFolder(nextJob);
      if (nextJob.customerName) {
        const customerJobFolder = getCustomerJobFolder(nextJob.customerName, "active", nextJob.jobNumber);
        copyFileSafe(notePath, path.join(customerJobFolder, noteName));
      }
      shortages = shortagesForReport;
    } catch (error) {
      res.status(500).json({
        error: "failed to generate shortage note",
        details: error instanceof Error ? error.message : "unknown error"
      });
      return;
    }
    updatedJob = nextJob;
    jobs.push(nextJob);
  }

  updateWorkspaceJobs(found.workspaceId, jobs);
  if (updatedJob?.status === "done") {
    void sendJobDoneEmail(found.workspaceId, updatedJob).catch((error) => {
      console.error("[email] job done notification failed:", error instanceof Error ? error.message : error);
    });
  }
  res.json({
    ok: true,
    status: updatedJob?.status,
    jobNumber: updatedJob?.jobNumber,
    checkedBy: updatedJob?.checkedBy,
    checkedAt: updatedJob?.checkedAt,
    jobCardUrl: `/api/scan/jobcard?token=${encodeURIComponent(token)}`,
    shortages,
    shortageNoteUrl: updatedJob?.shortageNotePath ? `/api/scan/shortage-note?token=${encodeURIComponent(token)}` : undefined
  });
});

function listDirectories(root: string) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: path.join(root, entry.name) }));
}

function findJobByToken(token: string) {
  const workspaces = getAllWorkspaces();
  for (const workspace of workspaces) {
    const job = workspace.jobs.find((entry) => entry.qrToken === token);
    if (job) return { workspaceId: workspace.id, job };
  }
  return undefined;
}

function resolveExpectedQuantity(job: JobRecord) {
  if (typeof job.quantityExpected === "number" && Number.isFinite(job.quantityExpected)) {
    return Math.max(0, Math.round(job.quantityExpected));
  }
  const partTotal = (job.jobDxfParts ?? []).reduce((sum, part) => {
    const qty = Number.isFinite(part.quantity) ? Math.max(0, Math.round(part.quantity)) : 0;
    return sum + qty;
  }, 0);
  return partTotal > 0 ? partTotal : undefined;
}

function getJobLatestFileActivityMs(job: JobRecord) {
  const links = job.fileLinks ?? [];
  if (!links.length) return undefined;
  const maxFilesToInspect = 20;
  let latest = 0;
  for (const file of links.slice(0, maxFilesToInspect)) {
    const candidates = [file.linkPath, file.originalPath].filter((value): value is string => Boolean(value));
    for (const candidate of candidates) {
      try {
        if (!fs.existsSync(candidate)) continue;
        const stats = fs.statSync(candidate);
        latest = Math.max(latest, stats.atimeMs || 0, stats.mtimeMs || 0, stats.ctimeMs || 0);
        break;
      } catch {
        // ignore unreadable paths
      }
    }
  }
  return latest > 0 ? latest : undefined;
}

function applyFileActivityTransitions(workspaceId: string, jobs: JobRecord[]) {
  let changed = false;
  const nextJobs = jobs.map((job) => {
    if (job.status === "done" || !job.fileLinks?.length) return job;
    const latest = getJobLatestFileActivityMs(job);
    if (!latest) return job;

    const cursor = typeof job.lastFileActivityAtMs === "number" ? job.lastFileActivityAtMs : undefined;
    if (cursor === undefined) {
      changed = true;
      return { ...job, lastFileActivityAtMs: latest };
    }

    if (latest <= cursor + 1000) return job;
    changed = true;
    return {
      ...job,
      status: job.status !== "done" && job.status !== "in_progress" ? "in_progress" : job.status,
      lastFileActivityAtMs: latest,
      lastFileOpenedAt: new Date(latest).toISOString()
    };
  });

  if (changed) {
    updateWorkspaceJobs(workspaceId, nextJobs);
  }
  return changed ? nextJobs : jobs;
}

function markJobInProgressFromFilePath(changedPath: string) {
  const absoluteChangedPath = path.resolve(changedPath);
  const workspaces = getAllWorkspaces();
  for (const workspace of workspaces) {
    let changed = false;
    const nowMs = Date.now();
    const nextJobs = workspace.jobs.map((job) => {
      if (job.status === "done" || job.status === "in_progress") return job;
      if (!job.fileLinks?.length) return job;
      const isMatch = job.fileLinks.some((file) => {
        const candidates = [file.linkPath, file.originalPath].filter((value): value is string => Boolean(value));
        return candidates.some((candidate) => {
          const absoluteCandidate = path.resolve(candidate);
          return absoluteChangedPath === absoluteCandidate || absoluteChangedPath.startsWith(`${absoluteCandidate}${path.sep}`);
        });
      });
      if (!isMatch) return job;
      changed = true;
      return {
        ...job,
        status: "in_progress" as const,
        lastFileActivityAtMs: nowMs,
        lastFileOpenedAt: new Date(nowMs).toISOString()
      };
    });
    if (changed) {
      updateWorkspaceJobs(workspace.id, nextJobs);
      io.to("general").emit("system", "Job moved to in process from file activity.");
    }
  }
}

function setupFileActivityWatcher() {
  if (!ENABLE_FILE_ACTIVITY_WATCHER) {
    console.log("File activity watcher disabled by configuration.");
    return;
  }
  const root = getJobnestRoot();
  if (!fs.existsSync(root)) return;
  const debounceByPath = new Map<string, ReturnType<typeof setTimeout>>();
  try {
    const watcher = fs.watch(root, { recursive: true }, (_eventType, rawFileName) => {
      if (!rawFileName) return;
      const fileName = rawFileName.toString();
      if (!fileName) return;
      const fullPath = path.join(root, fileName);
      if (debounceByPath.has(fullPath)) {
        clearTimeout(debounceByPath.get(fullPath)!);
      }
      const timer = setTimeout(() => {
        debounceByPath.delete(fullPath);
        markJobInProgressFromFilePath(fullPath);
      }, 600);
      debounceByPath.set(fullPath, timer);
    });
    watcher.on("error", (error) => {
      console.warn("File activity watcher stopped:", error instanceof Error ? error.message : "unknown error");
      try {
        watcher.close();
      } catch {
        // ignore close errors
      }
    });
    console.log("File activity watcher active:", root);
  } catch (error) {
    console.warn("File activity watcher unavailable:", error instanceof Error ? error.message : "unknown error");
  }
}

function backfillStartLinks() {
  try {
    const workspaces = getAllWorkspaces();
    for (const workspace of workspaces) {
      for (const job of workspace.jobs) {
        if (job.status === "done") continue;
        writeStartJobLinks(job);
      }
    }
  } catch {
    // ignore startup backfill issues
  }
}

app.get("/api/workspaces/:workspaceId/storage/overview", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  const jobnestRoot = getJobnestRoot();
  const customersRoot = path.join(jobnestRoot, "Customers");
  const jobsActiveRoot = path.join(jobnestRoot, "Jobs", "Active");
  const jobsCompletedRoot = path.join(jobnestRoot, "Jobs", "Completed");

  const customers = listDirectories(customersRoot);
  const jobsActive = listDirectories(jobsActiveRoot);
  const jobsCompleted = listDirectories(jobsCompletedRoot);

  res.json({
    jobnestRoot,
    customersRoot,
    jobsActiveRoot,
    jobsCompletedRoot,
    customers,
    jobsActive,
    jobsCompleted,
    jobCount: ws.jobs.length
  });
});

app.get("/api/workspaces/:workspaceId/users", (req: AuthedRequest, res) => {
  const { workspaceId } = req.params;
  if (!isAppOwner(req.userId)) {
    res.status(403).json({ error: "app owner required" });
    return;
  }
  const sessions = getAllSessions();
  const members = getWorkspaceMembers(workspaceId).map((entry) => ({
    ...(() => {
      const userSessions = sessions.filter((session) => session.userId === entry.user.id);
      const latestSession = userSessions
        .slice()
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
      return {
        sessionCount: userSessions.length,
        lastSessionAt: latestSession?.createdAt ?? null
      };
    })(),
    id: entry.user.id,
    email: entry.user.email,
    name: entry.user.name,
    role: entry.role,
    userRef: ensureUserAccountRef(entry.user),
    isLoggedIn: sessions.some((session) => session.userId === entry.user.id),
    manualPaidUntil: getUserBillingPeriodEnd(entry.user),
    ownerLocked: entry.user.ownerLocked === true,
    subscriptionState:
      entry.user.ownerLocked === true
        ? "locked"
        : getUserBillingPeriodEnd(entry.user) && (getUserBillingPeriodEnd(entry.user) ?? 0) * 1000 > Date.now()
          ? "active"
          : "inactive"
  }));
  res.json({ users: members });
});

app.post("/api/workspaces/:workspaceId/users/:targetUserId/billing-access", authRequired, (req: AuthedRequest, res) => {
  const { workspaceId, targetUserId } = req.params;
  if (!isAppOwner(req.userId)) {
    res.status(403).json({ error: "app owner required" });
    return;
  }
  if (!hasMembership(targetUserId, workspaceId)) {
    res.status(404).json({ error: "user not in workspace" });
    return;
  }
  const user = getUserById(targetUserId);
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }

  const mode = typeof req.body?.mode === "string" ? req.body.mode : "unlock";
  if (mode === "lock") {
    user.ownerLocked = true;
    user.manualAccountPaidUntil = null;
  } else {
    const daysRaw = Number(req.body?.days);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(365, Math.floor(daysRaw)) : 30;
    const base = Math.max(nowUnixSeconds(), user.manualAccountPaidUntil ?? 0);
    user.manualAccountPaidUntil = base + days * 24 * 60 * 60;
    user.ownerLocked = false;
  }
  ensureUserAccountRef(user);
  upsertUser(user);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      userRef: user.accountRef,
      manualPaidUntil: getUserBillingPeriodEnd(user),
      ownerLocked: user.ownerLocked === true
    }
  });
});

app.post("/api/workspaces/:workspaceId/users", (req: AuthedRequest, res) => {
  const { workspaceId } = req.params;
  const role = getMembershipRole(req.userId as string, workspaceId);
  if (role !== "owner") {
    res.status(403).json({ error: "owner required" });
    return;
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
  const newRole =
    req.body?.role === "admin" || req.body?.role === "member" ? (req.body.role as "admin" | "member") : "member";
  if (!email || !password) {
    res.status(400).json({ error: "email and password required" });
    return;
  }
  if (getUserByEmail(email)) {
    res.status(400).json({ error: "email already exists" });
    return;
  }
  const user: UserRecord = {
    id: `user-${crypto.randomUUID()}`,
    email,
    name,
    passwordHash: hashPassword(password),
    provider: "local",
    createdAt: new Date().toISOString()
  };
  upsertUser(user);
  addMembership({ userId: user.id, workspaceId, role: newRole });
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: newRole } });
});

app.post("/api/part-dna/analyze", authRequired, storageUpload.single("file"), (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const requestedWorkspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  const workspaceId = resolveAuthorizedWorkspaceId(userId, requestedWorkspaceId);
  if (!workspaceId) {
    res.status(400).json({ error: "workspace not found for current user" });
    return;
  }
  if (!req.file?.buffer?.length) {
    res.status(400).json({ error: "DXF file is required" });
    return;
  }
  try {
    const rawDxf = decodeDxfBuffer(req.file.buffer);
    const result = analyzeAndUpsertPartDna(getPartDnaDb(), {
      workspaceId,
      rawDxf,
      fileName: typeof req.body?.fileName === "string" && req.body.fileName.trim() ? req.body.fileName.trim() : req.file.originalname || "part.dxf",
      partName: typeof req.body?.partName === "string" ? req.body.partName.trim() : undefined,
      material: typeof req.body?.material === "string" ? req.body.material.trim() : undefined,
      thickness: Number.isFinite(Number(req.body?.thickness)) ? Number(req.body?.thickness) : undefined,
      quoteId: typeof req.body?.quoteId === "string" && req.body.quoteId.trim() ? req.body.quoteId.trim() : null,
      quotedPrice: Number.isFinite(Number(req.body?.quotedPrice)) ? Number(req.body?.quotedPrice) : null,
      customerName: typeof req.body?.customerName === "string" ? req.body.customerName.trim() : undefined,
      artifactRoot: getPartDnaArtifactRoot()
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: "failed to analyze part dna",
      details: error instanceof Error ? error.message : "unknown error"
    });
  }
});

app.post("/api/brain/part-dna/analyze", authRequired, storageUpload.single("file"), (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const requestedWorkspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  const workspaceId = resolveAuthorizedWorkspaceId(userId, requestedWorkspaceId);
  if (!workspaceId) {
    res.status(400).json({ error: "workspace not found for current user" });
    return;
  }
  if (!req.file?.buffer?.length) {
    res.status(400).json({ error: "DXF file is required" });
    return;
  }
  try {
    const rawDxf = decodeDxfBuffer(req.file.buffer);
    const result = getPartDnaBrainService().analyzeDxf({
      workspaceId,
      rawDxf,
      fileName: typeof req.body?.fileName === "string" && req.body.fileName.trim() ? req.body.fileName.trim() : req.file.originalname || "part.dxf",
      partName: typeof req.body?.partName === "string" ? req.body.partName.trim() : undefined,
      material: typeof req.body?.material === "string" ? req.body.material.trim() : undefined,
      thickness: Number.isFinite(Number(req.body?.thickness)) ? Number(req.body?.thickness) : undefined,
      quoteId: typeof req.body?.quoteId === "string" && req.body.quoteId.trim() ? req.body.quoteId.trim() : null,
      quotedPrice: Number.isFinite(Number(req.body?.quotedPrice)) ? Number(req.body?.quotedPrice) : null,
      customerId: typeof req.body?.customerId === "string" && req.body.customerId.trim() ? req.body.customerId.trim() : null,
      customerName: typeof req.body?.customerName === "string" ? req.body.customerName.trim() : undefined,
      entityType: typeof req.body?.entityType === "string" && req.body.entityType.trim() ? req.body.entityType.trim() : "dxf",
      entityId:
        typeof req.body?.entityId === "string" && req.body.entityId.trim()
          ? req.body.entityId.trim()
          : typeof req.body?.quoteId === "string" && req.body.quoteId.trim()
            ? req.body.quoteId.trim()
            : req.file.originalname || "part.dxf",
      actualCutTimeMinutes: Number.isFinite(Number(req.body?.actualCutTimeMinutes)) ? Number(req.body?.actualCutTimeMinutes) : null,
      operatorNotes: typeof req.body?.operatorNotes === "string" && req.body.operatorNotes.trim() ? req.body.operatorNotes.trim() : null,
      artifactRoot: getPartDnaArtifactRoot()
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: "failed to analyze brain part dna",
      details: error instanceof Error ? error.message : "unknown error"
    });
  }
});

app.get("/api/brain/part-dna/:id/history", authRequired, (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const requestedWorkspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId.trim() : "";
  const workspaceId = resolveAuthorizedWorkspaceId(userId, requestedWorkspaceId);
  const partDnaId = Number(req.params.id);
  if (!workspaceId) {
    res.status(400).json({ error: "workspace not found for current user" });
    return;
  }
  if (!Number.isFinite(partDnaId) || partDnaId <= 0) {
    res.status(400).json({ error: "valid part dna id required" });
    return;
  }
  const payload = getPartDnaBrainService().listHistory(workspaceId, partDnaId);
  if (!payload.part) {
    res.status(404).json({ error: "part dna not found" });
    return;
  }
  res.json(payload);
});

app.get("/api/brain/part-dna/search-similar", authRequired, (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const requestedWorkspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId.trim() : "";
  const workspaceId = resolveAuthorizedWorkspaceId(userId, requestedWorkspaceId);
  if (!workspaceId) {
    res.status(400).json({ error: "workspace not found for current user" });
    return;
  }
  const partDnaId = Number.isFinite(Number(req.query.partDnaId)) ? Number(req.query.partDnaId) : null;
  const geometryHash = typeof req.query.geometryHash === "string" ? req.query.geometryHash.trim() : "";
  const softHash = typeof req.query.softHash === "string" ? req.query.softHash.trim() : "";
  if (!partDnaId && !geometryHash && !softHash) {
    res.status(400).json({ error: "partDnaId, geometryHash, or softHash is required" });
    return;
  }
  const matches = getPartDnaBrainService().listSimilarParts({
    workspaceId,
    partDnaId,
    geometryHash,
    softHash,
    limit: Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 5
  });
  res.json({ matches });
});

app.get("/api/part-dna/library", authRequired, (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const requestedWorkspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId.trim() : "";
  const workspaceId = resolveAuthorizedWorkspaceId(userId, requestedWorkspaceId);
  if (!workspaceId) {
    res.status(400).json({ error: "workspace not found for current user" });
    return;
  }
  const parts = listPartLibrary(getPartDnaDb(), workspaceId, getPartDnaArtifactRoot());
  res.json({ parts });
});

app.get("/api/parts/:id/history", authRequired, (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const partId = Number(req.params.id);
  if (!Number.isFinite(partId) || partId <= 0) {
    res.status(400).json({ error: "valid part id required" });
    return;
  }
  const requestedWorkspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId.trim() : "";
  const workspaceId = resolveAuthorizedWorkspaceId(userId, requestedWorkspaceId);
  if (!workspaceId) {
    res.status(400).json({ error: "workspace not found for current user" });
    return;
  }
  const payload = listPartHistory(getPartDnaDb(), workspaceId, partId);
  if (!payload.part) {
    res.status(404).json({ error: "part not found" });
    return;
  }
  res.json(payload);
});

app.patch("/api/parts/:id/notes", authRequired, (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const partId = Number(req.params.id);
  if (!Number.isFinite(partId) || partId <= 0) {
    res.status(400).json({ error: "valid part id required" });
    return;
  }
  const requestedWorkspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  const workspaceId = resolveAuthorizedWorkspaceId(userId, requestedWorkspaceId);
  if (!workspaceId) {
    res.status(400).json({ error: "workspace not found for current user" });
    return;
  }
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
  const part = updatePartNotes(getPartDnaDb(), workspaceId, partId, notes);
  if (!part) {
    res.status(404).json({ error: "part not found" });
    return;
  }
  res.json({ part });
});

app.use("/api/workspaces", authRequired);
app.use("/api/workspaces/:workspaceId", workspaceAccessRequired);
app.use("/api/workspaces/:workspaceId", workspaceSubscriptionRequired);
app.use("/api/billing/status", authRequired);
app.use("/api/billing/checkout", authRequired);
app.use("/api/billing/portal", authRequired);

app.get("/api/workspaces/:workspaceId/access/device", (req: AuthedRequest, res) => {
  const { workspaceId } = req.params;
  const deviceId = typeof req.query?.deviceId === "string" ? req.query.deviceId.trim() : "";
  if (!deviceId) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const accessControl = getWorkspaceAccessControl(ws);
  const record = accessControl.deviceAccess?.find((entry) => entry.deviceId === deviceId);
  res.json({
    restricted: Boolean(record),
    allowedFeatures: record?.allowedFeatures ?? [],
    updatedAt: record?.updatedAt ?? null
  });
});

app.post("/api/workspaces/:workspaceId/access-codes", (req: AuthedRequest, res) => {
  const { workspaceId } = req.params;
  const userId = req.userId as string;
  if (!isAppOwner(userId)) {
    res.status(403).json({ error: "app owner required" });
    return;
  }
  const role = getMembershipRole(userId, workspaceId);
  if (role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "owner or admin required" });
    return;
  }
  const allowedFeatures = parseAccessFeatures(req.body?.allowedFeatures);
  if (!allowedFeatures.length) {
    res.status(400).json({ error: "select at least one allowed feature" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const accessControl = getWorkspaceAccessControl(ws);
  let code = createActivationCode();
  const maxAttempts = 12;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (!accessControl.activationCodes?.some((entry) => entry.code === code)) {
      break;
    }
    code = createActivationCode();
  }
  accessControl.activationCodes?.unshift({
    code,
    allowedFeatures,
    createdAt: new Date().toISOString(),
    createdByUserId: userId
  });
  ws.accessControl = accessControl;
  upsertWorkspace(ws);
  res.json({ ok: true, code, allowedFeatures });
});

app.post("/api/workspaces/:workspaceId/access-codes/redeem", (req: AuthedRequest, res) => {
  const { workspaceId } = req.params;
  const userId = req.userId as string;
  const codeInput = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
  if (!codeInput || !deviceId) {
    res.status(400).json({ error: "code and deviceId required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const accessControl = getWorkspaceAccessControl(ws);
  const activationCode = accessControl.activationCodes?.find((entry) => entry.code === codeInput);
  if (!activationCode) {
    res.status(404).json({ error: "invalid code" });
    return;
  }
  if (activationCode.usedAt) {
    res.status(400).json({ error: "code already used" });
    return;
  }
  const now = new Date().toISOString();
  activationCode.usedAt = now;
  activationCode.usedByUserId = userId;
  activationCode.usedByDeviceId = deviceId;

  const existingIndex = accessControl.deviceAccess?.findIndex((entry) => entry.deviceId === deviceId) ?? -1;
  const deviceAccessRecord = {
    deviceId,
    allowedFeatures: activationCode.allowedFeatures,
    updatedAt: now,
    assignedByUserId: activationCode.createdByUserId,
    sourceCode: activationCode.code
  };
  if (existingIndex >= 0 && accessControl.deviceAccess) {
    accessControl.deviceAccess[existingIndex] = deviceAccessRecord;
  } else {
    accessControl.deviceAccess?.unshift(deviceAccessRecord);
  }

  ws.accessControl = accessControl;
  upsertWorkspace(ws);
  res.json({ ok: true, allowedFeatures: activationCode.allowedFeatures, restricted: true });
});

app.post(
  "/api/workspaces/:workspaceId/tools/image-outline-dxf",
  imageOutlineUpload.single("image"),
  async (req, res) => {
    const { workspaceId } = req.params;
    getWorkspace(workspaceId);
    const imageFile = req.file as Express.Multer.File | undefined;
    if (!imageFile?.buffer?.length) {
      res.status(400).json({ error: "image file required (multipart field: image)" });
      return;
    }

    const downloadRaw = typeof req.query?.download === "string" ? req.query.download.trim().toLowerCase() : "";
    const download = downloadRaw === "1" || downloadRaw === "true" || downloadRaw === "yes";
    const threshold = Number(req.body?.threshold);
    const maxEdgePx = Number(req.body?.maxEdgePx);
    const turdSize = Number(req.body?.turdSize);
    const alphaMax = Number(req.body?.alphaMax);
    const optTolerance = Number(req.body?.optTolerance);
    const curveSteps = Number(req.body?.curveSteps);
    const mmPerPixel = Number(req.body?.mmPerPixel);
    const layer = typeof req.body?.layer === "string" ? req.body.layer : undefined;
    const baseNameRaw =
      (typeof req.body?.fileName === "string" && req.body.fileName.trim()) ||
      imageFile.originalname.replace(/\.[a-z0-9]+$/i, "");
    const safeBaseName = sanitizeName(baseNameRaw) || `image-outline-${Date.now()}`;

    try {
      const traced = await traceImageOutlineToDxfResilient(imageFile.buffer, {
        threshold: Number.isFinite(threshold) ? threshold : undefined,
        maxEdgePx: Number.isFinite(maxEdgePx) ? maxEdgePx : undefined,
        turdSize: Number.isFinite(turdSize) ? turdSize : undefined,
        alphaMax: Number.isFinite(alphaMax) ? alphaMax : undefined,
        optTolerance: Number.isFinite(optTolerance) ? optTolerance : undefined,
        curveSteps: Number.isFinite(curveSteps) ? curveSteps : undefined,
        mmPerPixel: Number.isFinite(mmPerPixel) ? mmPerPixel : undefined,
        layer,
        sourceName: imageFile.originalname,
        mimeType: imageFile.mimetype
      });
      const fileName = `${safeBaseName}.dxf`;
      if (download) {
        res.setHeader("Content-Type", "application/dxf");
        res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
        res.send(traced.dxf);
        return;
      }
      res.json({
        fileName,
        dxfBase64: Buffer.from(traced.dxf, "utf8").toString("base64"),
        stats: traced.stats
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : "unknown error";
      const isDecodeIssue =
        /heic|heif|unsupported|decode|input buffer contains unsupported image format/i.test(details);
      const isSizeIssue = /file too large|limit_file_size|too large/i.test(details);
      res.status(422).json({
        error: "failed to convert image to dxf",
        details: isSizeIssue
          ? `${details}. Max upload size is ${Math.round(MAX_IMAGE_OUTLINE_BYTES / 1_000_000)}MB.`
          : isDecodeIssue
            ? `${details}. Try PNG/JPG, or ensure HEIC support is available and the file is fully downloaded locally.`
            : details
      });
    }
  }
);

app.get("/api/workspaces/:workspaceId/servers", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  res.json({ servers: ws.servers });
});

app.post("/api/workspaces/:workspaceId/servers", (req, res) => {
  const { workspaceId } = req.params;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const newServer: ServerRecord = {
    id: `server-${crypto.randomUUID()}`,
    name,
    channels: [{ id: `channel-${crypto.randomUUID()}`, name: "general" }],
    roles: [{ id: `role-${crypto.randomUUID()}`, name: "Owner", color: "#fbbf24" }]
  };
  const servers = [...ws.servers, newServer];
  updateWorkspaceServers(workspaceId, servers);
  res.json({ server: newServer });
});

app.post("/api/workspaces/:workspaceId/servers/:serverId/channels", (req, res) => {
  const { workspaceId, serverId } = req.params;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const servers = ws.servers.map((server) => {
    if (server.id !== serverId) return server;
    const channel: ChannelRecord = { id: `channel-${crypto.randomUUID()}`, name };
    return { ...server, channels: [...server.channels, channel] };
  });
  updateWorkspaceServers(workspaceId, servers);
  res.json({ ok: true });
});

app.post("/api/workspaces/:workspaceId/servers/:serverId/roles", (req, res) => {
  const { workspaceId, serverId } = req.params;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const color = typeof req.body?.color === "string" ? req.body.color.trim() : undefined;
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const servers = ws.servers.map((server) => {
    if (server.id !== serverId) return server;
    const role: RoleRecord = { id: `role-${crypto.randomUUID()}`, name, color };
    return { ...server, roles: [...server.roles, role] };
  });
  updateWorkspaceServers(workspaceId, servers);
  res.json({ ok: true });
});

app.get("/api/workspaces/:workspaceId/jobs", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  const jobs = applyFileActivityTransitions(workspaceId, ws.jobs);
  res.json({ jobs });
});

app.get("/api/workspaces/:workspaceId/jobs/:jobId", (req, res) => {
  const { workspaceId, jobId } = req.params;
  const ws = getWorkspace(workspaceId);
  const jobs = applyFileActivityTransitions(workspaceId, ws.jobs);
  const job = jobs.find((entry) => entry.id === jobId);
  if (!job) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  res.json({ job });
});

app.post("/api/workspaces/:workspaceId/jobs/regenerate-cards", async (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  const failures: Array<{ jobId: string; jobNumber: string; error: string }> = [];
  const regenerated: string[] = [];

  const jobs: JobRecord[] = [];
  for (const job of ws.jobs) {
    const nextJob = { ...job };
    try {
      if (!nextJob.jobFolder) {
        nextJob.jobFolder =
          nextJob.status === "done"
            ? getCompletedJobFolder(nextJob.jobNumber, nextJob.customerName)
            : getActiveJobFolder(nextJob.jobNumber, nextJob.customerName);
      }
      ensureDir(nextJob.jobFolder);
      if (!nextJob.jobCardPath) {
        nextJob.jobCardPath = path.join(nextJob.jobFolder, `${nextJob.jobNumber}.pdf`);
      }
      await writeJobCard(ws, nextJob, nextJob.jobCardPath);
      copyJobCardToCustomerFolder(nextJob);
      if (nextJob.status !== "done") {
        writeStartJobLinks(nextJob);
      }
      regenerated.push(nextJob.jobNumber);
    } catch (error) {
      failures.push({
        jobId: nextJob.id,
        jobNumber: nextJob.jobNumber,
        error: error instanceof Error ? error.message : "unknown error"
      });
    }
    jobs.push(nextJob);
  }

  updateWorkspaceJobs(workspaceId, jobs);
  res.json({
    ok: failures.length === 0,
    regeneratedCount: regenerated.length,
    failedCount: failures.length,
    regenerated,
    failures
  });
});

app.post("/api/workspaces/:workspaceId/jobs", async (req, res) => {
  const { workspaceId } = req.params;
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const jobNumber = getNextJobNumber(workspaceId);
  const customerName = typeof req.body?.customerName === "string" ? req.body.customerName.trim() : undefined;
  const assignedTo = typeof req.body?.assignedTo === "string" ? req.body.assignedTo.trim() : undefined;
  const quantityExpected = typeof req.body?.quantityExpected === "number" ? req.body.quantityExpected : undefined;
  const incomingFileNames = Array.isArray(req.body?.fileNames)
    ? (req.body.fileNames as string[]).map((name) => name.trim()).filter(Boolean)
    : [];
  const incomingJobDxfParts = Array.isArray(req.body?.jobDxfParts)
    ? req.body.jobDxfParts.map(parseIncomingJobDxfPart).filter((part: { name: string }) => part.name.length > 0)
    : [];

  let repeatCount = 1;
  let repeatOfJobId: string | undefined;
  let lastRepeatPrice: number | undefined;
  if (customerName && incomingFileNames.length > 0) {
    const matches = ws.jobs.filter((job) => {
      if (job.customerName !== customerName) return false;
      const jobFiles = job.fileLinks?.map((file) => file.fileName) ?? [];
      return jobFiles.some((name) => incomingFileNames.includes(name));
    });
    if (matches.length > 0) {
      repeatCount = matches.length + 1;
      repeatOfJobId = matches[0].id;
      lastRepeatPrice = matches[0].price;
    }
  }

  if (customerName) {
    const exists = ws.customers.find((c) => c.name.toLowerCase() === customerName.toLowerCase());
    if (!exists) {
      const customer: CustomerRecord = {
        id: `customer-${crypto.randomUUID()}`,
        name: customerName,
        createdAt: new Date().toISOString()
      };
      ws.customers = [customer, ...ws.customers];
      updateWorkspaceCustomers(workspaceId, ws.customers);
    }
  }

  const jobFolder = getActiveJobFolder(jobNumber, customerName);
  const customerFolder = customerName ? getCustomerFolder(customerName) : undefined;
  if (customerName) {
    ensureDir(getCustomerJobFolder(customerName, "active", jobNumber));
  }
  const jobCardPath = path.join(jobFolder, `${jobNumber}.pdf`);
  const qrToken = `qt_${crypto.randomBytes(10).toString("hex")}`;

  const job: JobRecord = {
    id: `job-${crypto.randomUUID()}`,
    jobNumber,
    qrToken,
    title,
    status: "open",
    customerName,
    quoteNumber: typeof req.body?.quoteNumber === "string" ? req.body.quoteNumber.trim() : undefined,
    customerFolder,
    jobFolder,
    assignedTo,
    price: typeof req.body?.price === "number" ? req.body.price : undefined,
    cost: typeof req.body?.cost === "number" ? req.body.cost : undefined,
    quantityExpected,
    repeatCount,
    repeatOfJobId,
    lastRepeatPrice,
    fileLinks: [],
    jobDxfParts: incomingJobDxfParts,
    jobCardPath,
    createdAt: new Date().toISOString()
  };
  try {
    await writeJobCard(ws, job, jobCardPath);
    copyJobCardToCustomerFolder(job);
    writeStartJobLinks(job);
    const repeatMain = resolveRepeatMainFolder(job, ws.jobs);
    if (repeatMain && fs.existsSync(repeatMain) && job.jobFolder) {
      writeLinkPointer(path.join(job.jobFolder, "Main Completed Job"), repeatMain);
    }
  } catch (error) {
    res.status(500).json({ error: "failed to create job card", details: error instanceof Error ? error.message : "unknown error" });
    return;
  }
  const jobs = [job, ...ws.jobs];
  updateWorkspaceJobs(workspaceId, jobs);
  const linkedQuote = job.quoteNumber ? ws.quotes.find((entry) => entry.quoteNumber === job.quoteNumber) : undefined;
  recordBrainEvent({
    workspaceId,
    eventType: "job_created",
    entityType: "job",
    entityId: job.id,
    payload: {
      jobNumber: job.jobNumber,
      title: job.title,
      customerName: job.customerName ?? null,
      quoteNumber: job.quoteNumber ?? null
    },
    links: linkedQuote?.id
      ? [{
          sourceType: "job",
          sourceId: job.id,
          targetType: "quote",
          targetId: linkedQuote.id,
          linkType: "created_from"
        }]
      : undefined
  });
  res.json({ job });
});

app.patch("/api/workspaces/:workspaceId/jobs/:jobId", async (req, res) => {
  const { workspaceId, jobId } = req.params;
  const ws = getWorkspace(workspaceId);
  const previousJob = ws.jobs.find((entry) => entry.id === jobId);
  let updatedJob: JobRecord | undefined;
  const jobs = ws.jobs.map((job) => {
    if (job.id !== jobId) return job;
    updatedJob = {
      ...job,
      title: typeof req.body?.title === "string" ? req.body.title.trim() : job.title,
      status: typeof req.body?.status === "string" ? (req.body.status as JobRecord["status"]) : job.status,
      customerName:
        typeof req.body?.customerName === "string" ? req.body.customerName.trim() : job.customerName,
      assignedTo: typeof req.body?.assignedTo === "string" ? req.body.assignedTo.trim() : job.assignedTo,
      price: typeof req.body?.price === "number" ? req.body.price : job.price,
      cost: typeof req.body?.cost === "number" ? req.body.cost : job.cost,
      quantityExpected:
        typeof req.body?.quantityExpected === "number" ? req.body.quantityExpected : job.quantityExpected,
      jobDxfParts: Array.isArray(req.body?.jobDxfParts)
        ? req.body.jobDxfParts.map(parseIncomingJobDxfPart).filter((part: { name: string }) => part.name.length > 0)
        : job.jobDxfParts
    };
    return updatedJob;
  });
  updateWorkspaceJobs(workspaceId, jobs);
  if (updatedJob?.jobCardPath) {
    try {
      await writeJobCard(ws, updatedJob, updatedJob.jobCardPath);
    } catch (error) {
      res.status(500).json({ error: "failed to update job card", details: error instanceof Error ? error.message : "unknown error" });
      return;
    }
  }
  if (updatedJob?.status === "done" && previousJob?.status !== "done") {
    const finalized = finalizeCompletedJob(updatedJob, jobs);
    const finalJobs = jobs.map((entry) => (entry.id === finalized.id ? finalized : entry));
    updateWorkspaceJobs(workspaceId, finalJobs);
    updatedJob = finalized;
    void sendJobDoneEmail(workspaceId, updatedJob).catch((error) => {
      console.error("[email] job done notification failed:", error instanceof Error ? error.message : error);
    });
  }
  res.json({ ok: true });
});

app.post(
  "/api/workspaces/:workspaceId/jobs/:jobId/files",
  storageUpload.array("files"),
  async (req, res) => {
    const { workspaceId, jobId } = req.params;
    const ws = getWorkspace(workspaceId);
    const job = ws.jobs.find((entry) => entry.id === jobId);
    if (!job) {
      res.status(404).json({ error: "job not found" });
      return;
    }
    if (!job.customerName) {
      res.status(400).json({ error: "customer required" });
      return;
    }
    const customerFolder = job.customerFolder ?? getCustomerFolder(job.customerName);
    const customerJobFolder = getCustomerJobFolder(job.customerName, job.status === "done" ? "completed" : "active", job.jobNumber);
    const jobFolder = job.jobFolder ?? getActiveJobFolder(job.jobNumber, job.customerName);
    ensureDir(customerFolder);
    ensureDir(customerJobFolder);
    ensureDir(jobFolder);

    const fileLinks = job.fileLinks ?? [];
    const files = (req.files as Express.Multer.File[]) ?? [];
    for (const file of files) {
      const safeName = sanitizeName(file.originalname) || `file-${crypto.randomUUID()}`;
      const targetPath = path.join(customerJobFolder, safeName);
      if (!fs.existsSync(targetPath)) fs.writeFileSync(targetPath, file.buffer);

      const linkPath = path.join(jobFolder, safeName);
      if (!fs.existsSync(linkPath)) fs.writeFileSync(linkPath, file.buffer);

      const existingIndex = fileLinks.findIndex((entry) => entry.fileName === safeName);
      const nextLink = { fileName: safeName, originalPath: targetPath, linkPath };
      if (existingIndex >= 0) fileLinks[existingIndex] = nextLink;
      else fileLinks.push(nextLink);
    }

    const updatedJob = { ...job, fileLinks, customerFolder, jobFolder };
    try {
      if (updatedJob.jobCardPath) {
        await writeJobCard(ws, updatedJob, updatedJob.jobCardPath);
      }
      copyJobCardToCustomerFolder(updatedJob);
    } catch (error) {
      res.status(500).json({
        error: "failed to update job card after upload",
        details: error instanceof Error ? error.message : "unknown error"
      });
      return;
    }

    const jobs = ws.jobs.map((entry) => (entry.id === jobId ? updatedJob : entry));
    updateWorkspaceJobs(workspaceId, jobs);
    res.json({ ok: true });
  }
);

app.post("/api/workspaces/:workspaceId/jobs/:jobId/quantity-check", (req, res) => {
  const { workspaceId, jobId } = req.params;
  const quantityChecked = typeof req.body?.quantity === "number" ? req.body.quantity : NaN;
  const ws = getWorkspace(workspaceId);
  let updatedJob: JobRecord | undefined;
  const jobs = ws.jobs.map((job) => {
    if (job.id !== jobId) return job;
    const ok = Number.isFinite(job.quantityExpected) && job.quantityExpected === quantityChecked;
    const next = {
      ...job,
      quantityChecked,
      status: ok ? "done" : "incomplete"
    };
    updatedJob = next.status === "done" ? finalizeCompletedJob(next, ws.jobs) : next;
    return updatedJob;
  });
  updateWorkspaceJobs(workspaceId, jobs);
  if (updatedJob?.status !== "done" && updatedJob) {
    copyJobCardToCustomerFolder(updatedJob);
  }
  if (updatedJob?.status === "done") {
    io.to(req.body?.roomId ?? "general").emit(
      "system",
      `✅ Job completed: ${updatedJob?.jobNumber} ${updatedJob?.title}`
    );
    recordBrainEvent({
      workspaceId,
      eventType: "job_completed",
      entityType: "job",
      entityId: updatedJob.id,
      payload: {
        jobNumber: updatedJob.jobNumber,
        title: updatedJob.title,
        customerName: updatedJob.customerName ?? null
      }
    });
    try {
      calculateProfitForWorkspaceJob(workspaceId, updatedJob.id);
    } catch (error) {
      console.error("[profit] auto-calc failed:", error instanceof Error ? error.message : error);
    }
    void sendJobDoneEmail(workspaceId, updatedJob).catch((error) => {
      console.error("[email] job done notification failed:", error instanceof Error ? error.message : error);
    });
  }
  res.json({ ok: true, status: updatedJob?.status });
});

app.get("/api/workspaces/:workspaceId/jobs/:jobId/jobcard", async (req, res) => {
  const { workspaceId, jobId } = req.params;
  const ws = getWorkspace(workspaceId);
  const job = ws.jobs.find((entry) => entry.id === jobId);
  if (!job?.jobCardPath) {
    res.status(404).json({ error: "job card not found" });
    return;
  }
  try {
    const includePricingRaw = typeof req.query?.includePricing === "string" ? req.query.includePricing.trim().toLowerCase() : "";
    const includeDriverSignoffRaw =
      typeof req.query?.includeDriverSignoff === "string" ? req.query.includeDriverSignoff.trim().toLowerCase() : "";
    const includePricing = includePricingRaw === "1" || includePricingRaw === "true" || includePricingRaw === "yes";
    const includeDriverSignoff =
      includeDriverSignoffRaw === "1" || includeDriverSignoffRaw === "true" || includeDriverSignoffRaw === "yes";
    const copyLabel = typeof req.query?.copyLabel === "string" ? req.query.copyLabel.trim() : undefined;
    const hasVariant = includePricing || includeDriverSignoff || Boolean(copyLabel);
    if (hasVariant) {
      const tempRoot = path.join(os.tmpdir(), "reimec-flow", "jobcards");
      ensureDir(tempRoot);
      const variantName = `${sanitizeName(job.jobNumber) || job.jobNumber}-${includePricing ? "priced" : "driver"}-${Date.now()}.pdf`;
      const variantPath = path.join(tempRoot, variantName);
      await writeJobCard(ws, job, variantPath, { includePricing, includeDriverSignoff, copyLabel });
      res.sendFile(variantPath);
      return;
    }
    await writeJobCard(ws, job, job.jobCardPath, { includePricing, includeDriverSignoff, copyLabel });
    copyJobCardToCustomerFolder(job);
  } catch (error) {
    res.status(500).json({ error: "failed to render job card", details: error instanceof Error ? error.message : "unknown error" });
    return;
  }
  res.sendFile(job.jobCardPath);
});

app.get("/api/workspaces/:workspaceId/jobs/:jobId/files/:fileName", (req, res) => {
  const { workspaceId, jobId, fileName } = req.params;
  const ws = getWorkspace(workspaceId);
  const job = ws.jobs.find((entry) => entry.id === jobId);
  const file = job?.fileLinks?.find((entry) => entry.fileName === fileName);
  const pathToSend = file
    ? (fs.existsSync(file.linkPath) ? file.linkPath : (fs.existsSync(file.originalPath) ? file.originalPath : undefined))
    : undefined;
  if (!pathToSend) {
    res.status(404).json({ error: "file not found" });
    return;
  }
  res.sendFile(pathToSend);
});

app.post("/api/workspaces/:workspaceId/jobs/:jobId/complete", (req, res) => {
  const { workspaceId, jobId } = req.params;
  const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : "general";
  const ws = getWorkspace(workspaceId);
  let completedJob: JobRecord | undefined;
  const jobs = ws.jobs.map((job) => {
    if (job.id !== jobId) return job;
    completedJob = finalizeCompletedJob({ ...job, status: "done" }, ws.jobs);
    return completedJob;
  });
  updateWorkspaceJobs(workspaceId, jobs);
  if (completedJob) {
    io.to(roomId).emit("system", `✅ Job completed: ${completedJob.jobNumber} ${completedJob.title}`);
    recordBrainEvent({
      workspaceId,
      eventType: "job_completed",
      entityType: "job",
      entityId: completedJob.id,
      payload: {
        jobNumber: completedJob.jobNumber,
        title: completedJob.title,
        customerName: completedJob.customerName ?? null
      }
    });
    try {
      calculateProfitForWorkspaceJob(workspaceId, completedJob.id);
    } catch (error) {
      console.error("[profit] auto-calc failed:", error instanceof Error ? error.message : error);
    }
    void sendJobDoneEmail(workspaceId, completedJob).catch((error) => {
      console.error("[email] job done notification failed:", error instanceof Error ? error.message : error);
    });
  }
  res.json({ ok: true });
});

app.get("/api/jobs", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  syncWorkspaceSmartQueue(workspaceId);
  const snapshot = buildSmartQueueSnapshot(getSmartJobQueueDb(), workspaceId, buildSmartQueueServicesForWorkspace(workspaceId));
  res.json({ jobs: snapshot.jobs });
});

app.post("/api/jobs", async (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
  }

  const ws = getWorkspace(workspaceId);
  const jobNumber = typeof req.body?.jobNumber === "string" && req.body.jobNumber.trim()
    ? req.body.jobNumber.trim()
    : getNextJobNumber(workspaceId);
  const customerName = typeof req.body?.customerName === "string" ? req.body.customerName.trim() : undefined;
  const quoteId = typeof req.body?.quoteId === "string" ? req.body.quoteId.trim() : undefined;
  const quote = quoteId ? ws.quotes.find((entry) => entry.id === quoteId) : undefined;
  const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate.trim() : undefined;
  const material = typeof req.body?.material === "string" ? req.body.material.trim() : "";
  const thickness = typeof req.body?.thickness === "number" && Number.isFinite(req.body.thickness) ? req.body.thickness : null;
  const sheetSize = typeof req.body?.sheetSize === "string" ? req.body.sheetSize.trim() : null;
  const estimatedCutTimeMinutes =
    typeof req.body?.estimatedCutTimeMinutes === "number" && Number.isFinite(req.body.estimatedCutTimeMinutes)
      ? req.body.estimatedCutTimeMinutes
      : 0;
  const estimatedSetupTimeMinutes =
    typeof req.body?.estimatedSetupTimeMinutes === "number" && Number.isFinite(req.body.estimatedSetupTimeMinutes)
      ? req.body.estimatedSetupTimeMinutes
      : 0;
  const estimatedPierceCount =
    typeof req.body?.estimatedPierceCount === "number" && Number.isFinite(req.body.estimatedPierceCount)
      ? req.body.estimatedPierceCount
      : 0;
  const estimatedCutLength =
    typeof req.body?.estimatedCutLength === "number" && Number.isFinite(req.body.estimatedCutLength)
      ? req.body.estimatedCutLength
      : 0;
  const dxfFilePath = typeof req.body?.dxfFilePath === "string" ? req.body.dxfFilePath.trim() : null;
  const partDnaId = typeof req.body?.partDnaId === "number" && Number.isFinite(req.body.partDnaId) ? req.body.partDnaId : null;
  const priority = req.body?.priority === "low" || req.body?.priority === "urgent" ? req.body.priority : "normal";
  const manuallyMarkedReady = req.body?.manuallyMarkedReady === true;
  const incomingJobDxfParts = Array.isArray(req.body?.jobDxfParts)
    ? req.body.jobDxfParts.map(parseIncomingJobDxfPart).filter((part: { name: string }) => part.name.length > 0)
    : [];

  const jobFolder = getActiveJobFolder(jobNumber, customerName);
  const customerFolder = customerName ? getCustomerFolder(customerName) : undefined;
  const jobCardPath = path.join(jobFolder, `${jobNumber}.pdf`);
  const legacyJob: JobRecord = {
    id: `job-${crypto.randomUUID()}`,
    jobNumber,
    qrToken: `qt_${crypto.randomBytes(10).toString("hex")}`,
    title,
    status: "open",
    customerName,
    quoteNumber: quote?.quoteNumber,
    customerFolder,
    jobFolder,
    fileLinks: [],
    jobDxfParts: incomingJobDxfParts,
    jobCardPath,
    createdAt: new Date().toISOString()
  };

  try {
    await writeJobCard(ws, legacyJob, jobCardPath);
    copyJobCardToCustomerFolder(legacyJob);
    writeStartJobLinks(legacyJob);
  } catch (error) {
    res.status(500).json({ error: "failed to create job card", details: error instanceof Error ? error.message : "unknown error" });
    return;
  }

  updateWorkspaceJobs(workspaceId, [legacyJob, ...ws.jobs]);
  const smartJob = upsertSmartJob(getSmartJobQueueDb(), workspaceId, {
    legacyJobId: legacyJob.id,
    customerName: customerName ?? null,
    customerId:
      ws.customers.find((entry) => entry.name.trim().toLowerCase() === (customerName ?? "").trim().toLowerCase())?.id ?? null,
    jobNumber,
    quoteId: quote?.id ?? null,
    title,
    status: "pending",
    priority: priority as SmartJobPriority,
    dueDate,
    material,
    thickness,
    sheetSize,
    estimatedCutTimeMinutes,
    estimatedSetupTimeMinutes,
    estimatedPierceCount,
    estimatedCutLength,
    dxfFilePath,
    partDnaId,
    manuallyMarkedReady
  });

  const services = buildSmartQueueServicesForWorkspace(workspaceId);
  const normalized = smartJob ? updateSmartJobStatus(getSmartJobQueueDb(), workspaceId, smartJob.id, smartJob.status) : null;
  const snapshot = buildSmartQueueSnapshot(getSmartJobQueueDb(), workspaceId, services);
  res.json({ job: normalized ?? smartJob, jobs: snapshot.jobs });
});

app.patch("/api/jobs/:id", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const id = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(id)) {
    res.status(400).json({ error: "workspaceId and numeric id required" });
    return;
  }
  syncWorkspaceSmartQueue(workspaceId);
  const existing = getSmartJob(getSmartJobQueueDb(), workspaceId, id);
  if (!existing) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  const updated = upsertSmartJob(getSmartJobQueueDb(), workspaceId, {
    ...existing,
    jobNumber: existing.jobNumber,
    title: typeof req.body?.title === "string" ? req.body.title.trim() : existing.title,
    customerName: typeof req.body?.customerName === "string" ? req.body.customerName.trim() : existing.customerName,
    priority: req.body?.priority === "low" || req.body?.priority === "urgent" || req.body?.priority === "normal"
      ? req.body.priority
      : existing.priority,
    status: req.body?.status === "pending" || req.body?.status === "ready" || req.body?.status === "cutting" || req.body?.status === "paused" || req.body?.status === "completed" || req.body?.status === "cancelled"
      ? req.body.status
      : existing.status,
    dueDate: typeof req.body?.dueDate === "string" ? req.body.dueDate.trim() : existing.dueDate,
    material: typeof req.body?.material === "string" ? req.body.material.trim() : existing.material,
    thickness: typeof req.body?.thickness === "number" && Number.isFinite(req.body.thickness) ? req.body.thickness : existing.thickness,
    sheetSize: typeof req.body?.sheetSize === "string" ? req.body.sheetSize.trim() : existing.sheetSize,
    estimatedCutTimeMinutes:
      typeof req.body?.estimatedCutTimeMinutes === "number" && Number.isFinite(req.body.estimatedCutTimeMinutes)
        ? req.body.estimatedCutTimeMinutes
        : existing.estimatedCutTimeMinutes,
    estimatedSetupTimeMinutes:
      typeof req.body?.estimatedSetupTimeMinutes === "number" && Number.isFinite(req.body.estimatedSetupTimeMinutes)
        ? req.body.estimatedSetupTimeMinutes
        : existing.estimatedSetupTimeMinutes,
    estimatedPierceCount:
      typeof req.body?.estimatedPierceCount === "number" && Number.isFinite(req.body.estimatedPierceCount)
        ? req.body.estimatedPierceCount
        : existing.estimatedPierceCount,
    estimatedCutLength:
      typeof req.body?.estimatedCutLength === "number" && Number.isFinite(req.body.estimatedCutLength)
        ? req.body.estimatedCutLength
        : existing.estimatedCutLength,
    dxfFilePath: typeof req.body?.dxfFilePath === "string" ? req.body.dxfFilePath.trim() : existing.dxfFilePath,
    partDnaId: typeof req.body?.partDnaId === "number" && Number.isFinite(req.body.partDnaId) ? req.body.partDnaId : existing.partDnaId,
    manualSortOrder:
      typeof req.body?.manualSortOrder === "number" && Number.isFinite(req.body.manualSortOrder)
        ? req.body.manualSortOrder
        : existing.manualSortOrder,
    manuallyMarkedReady: req.body?.manuallyMarkedReady === undefined ? existing.manuallyMarkedReady : Boolean(req.body.manuallyMarkedReady)
  });
  if (!updated) {
    res.status(500).json({ error: "failed to update smart job" });
    return;
  }
  applySmartJobToLegacyWorkspace(workspaceId, updated);
  res.json({ job: updated });
});

app.delete("/api/jobs/:id", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const id = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(id)) {
    res.status(400).json({ error: "workspaceId and numeric id required" });
    return;
  }
  const existing = getSmartJob(getSmartJobQueueDb(), workspaceId, id);
  if (existing?.legacyJobId) {
    const ws = getWorkspace(workspaceId);
    updateWorkspaceJobs(workspaceId, ws.jobs.filter((job) => job.id !== existing.legacyJobId));
  }
  deleteSmartJob(getSmartJobQueueDb(), workspaceId, id);
  res.json({ ok: true });
});

app.post("/api/jobs/:id/start", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const id = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(id)) {
    res.status(400).json({ error: "workspaceId and numeric id required" });
    return;
  }
  const updated = updateSmartJobStatus(getSmartJobQueueDb(), workspaceId, id, "cutting");
  if (!updated) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  applySmartJobToLegacyWorkspace(workspaceId, updated);
  res.json({ job: updated });
});

app.post("/api/jobs/:id/pause", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const id = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(id)) {
    res.status(400).json({ error: "workspaceId and numeric id required" });
    return;
  }
  const updated = updateSmartJobStatus(getSmartJobQueueDb(), workspaceId, id, "paused");
  if (!updated) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  applySmartJobToLegacyWorkspace(workspaceId, updated);
  res.json({ job: updated });
});

app.post("/api/jobs/:id/complete", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const id = Number(req.params.id);
  const actualMinutes =
    typeof req.body?.actualMinutes === "number" && Number.isFinite(req.body.actualMinutes) ? req.body.actualMinutes : undefined;
  if (!workspaceId || !Number.isFinite(id)) {
    res.status(400).json({ error: "workspaceId and numeric id required" });
    return;
  }
  const updated = updateSmartJobStatus(getSmartJobQueueDb(), workspaceId, id, "completed", actualMinutes);
  if (!updated) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  if (updated.partDnaId && typeof actualMinutes === "number") {
    buildSmartQueueServicesForWorkspace(workspaceId).partDnaService.updateActualCutTime(updated.partDnaId, updated.id, actualMinutes);
  }
  applySmartJobToLegacyWorkspace(workspaceId, updated);
  res.json({ job: updated });
});

app.get("/api/job-queue", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  syncWorkspaceSmartQueue(workspaceId);
  const snapshot = buildSmartQueueSnapshot(getSmartJobQueueDb(), workspaceId, buildSmartQueueServicesForWorkspace(workspaceId));
  res.json(snapshot);
});

app.get("/api/job-queue/recommendations", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  syncWorkspaceSmartQueue(workspaceId);
  const snapshot = buildSmartQueueSnapshot(getSmartJobQueueDb(), workspaceId, buildSmartQueueServicesForWorkspace(workspaceId));
  res.json({ recommendations: snapshot.recommendations });
});

app.post("/api/job-queue/groups", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  syncWorkspaceSmartQueue(workspaceId);
  const services = buildSmartQueueServicesForWorkspace(workspaceId);
  const allJobs = listSmartJobs(getSmartJobQueueDb(), workspaceId);
  const recommendedGroups = createRecommendedQueueGroups(allJobs, services);
  replaceQueueGroups(getSmartJobQueueDb(), workspaceId, recommendedGroups);
  const groups = listQueueGroups(getSmartJobQueueDb(), workspaceId);
  res.json({ groups });
});

app.patch("/api/job-queue/groups/:id", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const groupId = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(groupId)) {
    res.status(400).json({ error: "workspaceId and numeric group id required" });
    return;
  }
  if (Array.isArray(req.body?.orderedJobIds)) {
    reorderJobsWithManualOverride(getSmartJobQueueDb(), workspaceId, req.body.orderedJobIds.map((value: unknown) => Number(value)).filter(Number.isFinite));
  }
  const updated = updateQueueGroup(getSmartJobQueueDb(), workspaceId, groupId, {
    groupName: typeof req.body?.groupName === "string" ? req.body.groupName.trim() : undefined,
    status: req.body?.status === "planned" || req.body?.status === "active" || req.body?.status === "completed" ? req.body.status : undefined,
    jobIds: Array.isArray(req.body?.jobIds) ? req.body.jobIds.map((value: unknown) => Number(value)).filter(Number.isFinite) : undefined
  });
  if (!updated) {
    res.status(404).json({ error: "group not found" });
    return;
  }
  res.json({ group: updated });
});

app.post("/api/job-queue/groups/:id/start", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const groupId = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(groupId)) {
    res.status(400).json({ error: "workspaceId and numeric group id required" });
    return;
  }
  const updated = startQueueGroup(getSmartJobQueueDb(), workspaceId, groupId);
  if (!updated) {
    res.status(404).json({ error: "group not found" });
    return;
  }
  const firstJob = updated.jobs.find((job) => job.status === "cutting");
  if (firstJob) applySmartJobToLegacyWorkspace(workspaceId, firstJob);
  res.json({ group: updated });
});

app.post("/api/job-queue/groups/:id/complete", (req, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const groupId = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(groupId)) {
    res.status(400).json({ error: "workspaceId and numeric group id required" });
    return;
  }
  const updated = completeQueueGroup(getSmartJobQueueDb(), workspaceId, groupId);
  if (!updated) {
    res.status(404).json({ error: "group not found" });
    return;
  }
  res.json({ group: updated });
});

app.get("/api/stock", (_req, res) => {
  const snapshot = getStockSnapshot(getStockMaterialDb());
  res.json(snapshot);
});

app.post("/api/stock/sheets", (req, res) => {
  try {
    const sheet = addStockSheet(getStockMaterialDb(), {
      material: String(req.body?.material ?? "").trim(),
      thickness: Number(req.body?.thickness),
      width: Number(req.body?.width),
      height: Number(req.body?.height),
      quantity: Number(req.body?.quantity),
      supplier: stringOrNull(req.body?.supplier),
      costPerSheet: typeof req.body?.costPerSheet === "number" ? req.body.costPerSheet : null,
      costPerKg: typeof req.body?.costPerKg === "number" ? req.body.costPerKg : null,
      location: stringOrNull(req.body?.location),
      status:
        req.body?.status === "reserved" || req.body?.status === "used" || req.body?.status === "scrapped"
          ? req.body.status
          : "available"
    });
    res.json({ sheet });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to add stock sheet." });
  }
});

app.patch("/api/stock/sheets/:id", (req, res) => {
  try {
    const sheet = updateStockSheet(getStockMaterialDb(), Number(req.params.id), req.body ?? {});
    if (!sheet) {
      res.status(404).json({ error: "sheet not found" });
      return;
    }
    res.json({ sheet });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update stock sheet." });
  }
});

app.delete("/api/stock/sheets/:id", (req, res) => {
  try {
    deleteStockSheet(getStockMaterialDb(), Number(req.params.id), req.query?.force === "1" || req.query?.force === "true");
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete stock sheet." });
  }
});

app.get("/api/stock/offcuts", (req, res) => {
  const material = typeof req.query?.material === "string" ? req.query.material.trim() : undefined;
  const thickness = typeof req.query?.thickness === "string" && req.query.thickness.trim() ? Number(req.query.thickness) : undefined;
  const minimumWidth = typeof req.query?.minimumWidth === "string" && req.query.minimumWidth.trim() ? Number(req.query.minimumWidth) : undefined;
  const minimumHeight = typeof req.query?.minimumHeight === "string" && req.query.minimumHeight.trim() ? Number(req.query.minimumHeight) : undefined;
  const offcuts = getAvailableOffcuts(getStockMaterialDb(), { material, thickness, minimumWidth, minimumHeight });
  res.json({ offcuts });
});

app.post("/api/stock/offcuts", (req, res) => {
  try {
    const offcut = addOffcut(getStockMaterialDb(), {
      parentSheetId: typeof req.body?.parentSheetId === "number" ? req.body.parentSheetId : null,
      material: String(req.body?.material ?? "").trim(),
      thickness: Number(req.body?.thickness),
      width: Number(req.body?.width),
      height: Number(req.body?.height),
      shapeData: stringOrNull(req.body?.shapeData),
      location: stringOrNull(req.body?.location),
      status:
        req.body?.status === "reserved" || req.body?.status === "used" || req.body?.status === "scrapped"
          ? req.body.status
          : "available"
    });
    res.json({ offcut });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to add offcut." });
  }
});

app.patch("/api/stock/offcuts/:id", (req, res) => {
  try {
    const offcut = updateOffcut(getStockMaterialDb(), Number(req.params.id), req.body ?? {});
    if (!offcut) {
      res.status(404).json({ error: "offcut not found" });
      return;
    }
    res.json({ offcut });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update offcut." });
  }
});

app.delete("/api/stock/offcuts/:id", (req, res) => {
  try {
    deleteOffcut(getStockMaterialDb(), Number(req.params.id), req.query?.force === "1" || req.query?.force === "true");
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete offcut." });
  }
});

app.get("/api/stock/movements", (_req, res) => {
  res.json({ movements: listStockMovements(getStockMaterialDb()) });
});

app.get("/api/stock/search", (req, res) => {
  try {
    const material = typeof req.query?.material === "string" ? req.query.material.trim() : "";
    const thickness = Number(req.query?.thickness);
    const width = Number(req.query?.width);
    const height = Number(req.query?.height);
    const suggestion = buildQuoteStockSuggestion(getStockMaterialDb(), {
      material,
      thickness,
      requiredWidth: width,
      requiredHeight: height
    });
    res.json({ suggestion });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to search stock." });
  }
});

app.post("/api/stock/reserve", (req, res) => {
  try {
    const jobId = String(req.body?.jobId ?? "").trim();
    const material = String(req.body?.material ?? "").trim();
    const thickness = Number(req.body?.thickness);
    const reservation = reserveStockForJob(
      getStockMaterialDb(),
      jobId,
      material,
      thickness,
      Number(req.body?.requiredWidth),
      Number(req.body?.requiredHeight)
    );
    const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
    if (workspaceId && jobId) {
      recordBrainEvent({
        workspaceId,
        eventType: "material_reserved",
        entityType: "job",
        entityId: jobId,
        payload: {
          material,
          thickness,
          reservation
        }
      });
    }
    res.json({ reservation });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to reserve stock." });
  }
});

app.post("/api/stock/release", (req, res) => {
  try {
    releaseStockReservation(getStockMaterialDb(), String(req.body?.jobId ?? "").trim());
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to release stock." });
  }
});

app.post("/api/stock/use", (req, res) => {
  try {
    const jobId = String(req.body?.jobId ?? "").trim();
    markStockUsed(getStockMaterialDb(), jobId);
    const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
    if (workspaceId && jobId) {
      recordBrainEvent({
        workspaceId,
        eventType: "material_used",
        entityType: "job",
        entityId: jobId,
        payload: {}
      });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to mark stock used." });
  }
});

app.post("/api/stock/create-offcut", (req, res) => {
  try {
    const jobId = String(req.body?.jobId ?? "").trim();
    const offcut = createOffcutFromJob(
      getStockMaterialDb(),
      jobId,
      typeof req.body?.parentSheetId === "number" ? req.body.parentSheetId : null,
      Number(req.body?.width),
      Number(req.body?.height),
      stringOrNull(req.body?.shapeData)
    );
    const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
    if (workspaceId && jobId && offcut) {
      recordBrainEvent({
        workspaceId,
        eventType: "offcut_created",
        entityType: "job",
        entityId: jobId,
        payload: {
          offcutId: offcut.id,
          width: offcut.width,
          height: offcut.height,
          material: offcut.material,
          thickness: offcut.thickness
        }
      });
    }
    res.json({ offcut });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create offcut." });
  }
});

app.get("/api/stock/low-stock-warnings", (_req, res) => {
  res.json({ warnings: getLowStockWarnings(getStockMaterialDb()) });
});

app.post("/api/account-requests", (req, res) => {
  try {
    const companyName = typeof req.body?.companyName === "string" ? req.body.companyName.trim() : "";
    const contactName = typeof req.body?.contactName === "string" ? req.body.contactName.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
    const deviceName = typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : deviceId;
    if (!companyName || !email || !deviceId) {
      res.status(400).json({ error: "companyName, email and deviceId are required" });
      return;
    }
    const result = getCloudSubscriptionDb().createAccountRequest({
      companyName,
      contactName,
      email,
      phone,
      deviceId,
      deviceName,
      platform: normalizeCloudPlatform(req.body?.platform)
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create account request." });
  }
});

app.get("/api/admin/account-requests", authRequired, mainAdminRequired, (_req: AuthedRequest, res) => {
  res.json({ requests: getCloudSubscriptionDb().listAccountRequests() });
});

app.post("/api/admin/account-requests/:id/approve", authRequired, mainAdminRequired, (req: AuthedRequest, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isFinite(requestId)) {
    res.status(400).json({ error: "numeric request id required" });
    return;
  }
  const months = typeof req.body?.months === "number" && Number.isFinite(req.body.months) ? req.body.months : 1;
  const approved = getCloudSubscriptionDb().approveAccountRequest(requestId, getUserById(req.userId!)?.email ?? "main_admin", months);
  if (!approved) {
    res.status(404).json({ error: "account request not found" });
    return;
  }
  res.json({ ok: true, ...approved });
});

app.post("/api/admin/account-requests/:id/reject", authRequired, mainAdminRequired, (req: AuthedRequest, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isFinite(requestId)) {
    res.status(400).json({ error: "numeric request id required" });
    return;
  }
  const request = getCloudSubscriptionDb().rejectAccountRequest(requestId, getUserById(req.userId!)?.email ?? "main_admin");
  if (!request) {
    res.status(404).json({ error: "account request not found" });
    return;
  }
  res.json({ ok: true, request });
});

app.post("/api/devices/register", (req, res) => {
  try {
    const companyId = typeof req.body?.companyId === "string" ? req.body.companyId.trim() : "";
    const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
    if (!companyId || !deviceId) {
      res.status(400).json({ error: "companyId and deviceId are required" });
      return;
    }
    const device = getCloudSubscriptionDb().registerDevice({
      companyId,
      deviceId,
      deviceName: typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : deviceId,
      platform: normalizeCloudPlatform(req.body?.platform),
      appVersion: typeof req.body?.appVersion === "string" ? req.body.appVersion.trim() : ""
    });
    res.json({ ok: true, device });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to register device." });
  }
});

app.post("/api/devices/heartbeat", (req, res) => {
  try {
    const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
    if (!deviceId) {
      res.status(400).json({ error: "deviceId is required" });
      return;
    }
    const device = getCloudSubscriptionDb().heartbeat({
      deviceId,
      deviceName: typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : undefined,
      companyId: typeof req.body?.companyId === "string" ? req.body.companyId.trim() : null,
      platform: normalizeCloudPlatform(req.body?.platform),
      appVersion: typeof req.body?.appVersion === "string" ? req.body.appVersion.trim() : ""
    });
    res.json({ ok: true, device });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update device heartbeat." });
  }
});

app.get("/api/admin/devices", authRequired, mainAdminRequired, (_req: AuthedRequest, res) => {
  res.json({ devices: getCloudSubscriptionDb().listDevices() });
});

app.get("/api/subscriptions/status", (req, res) => {
  const deviceId = typeof req.query?.deviceId === "string" ? req.query.deviceId.trim() : "";
  if (!deviceId) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }
  res.json(getCloudSubscriptionDb().getSubscriptionStatusByDevice(deviceId));
});

app.post("/api/admin/companies/:id/unlock", authRequired, mainAdminRequired, (req: AuthedRequest, res) => {
  const company = getCloudSubscriptionDb().unlockCompany(req.params.id, stringOrNull(req.body?.adminNote) ?? getUserById(req.userId!)?.email ?? null);
  if (company) {
    res.json({ ok: true, company });
    return;
  }
  const snapshot = getManualSubscriptionDb().updateCompanyStatus(req.params.id, "active", stringOrNull(req.body?.adminNote) ?? getUserById(req.userId!)?.email ?? null);
  if (!snapshot) {
    res.status(404).json({ error: "company not found" });
    return;
  }
  syncWorkspaceMemberBillingAccess(snapshot.company.id, { active: true, paidUntil: snapshot.company.subscriptionEndDate });
  res.json({ ok: true, company: snapshot.company });
});

app.post("/api/admin/companies/:id/start-cycle", authRequired, mainAdminRequired, (req: AuthedRequest, res) => {
  const months = typeof req.body?.months === "number" && Number.isFinite(req.body.months) ? req.body.months : 1;
  const company = getCloudSubscriptionDb().startSubscriptionCycle(req.params.id, months, stringOrNull(req.body?.adminNote));
  if (company) {
    res.json({ ok: true, company });
    return;
  }
  const snapshot = getManualSubscriptionDb().renewCompany(req.params.id, months, stringOrNull(req.body?.adminNote));
  if (!snapshot) {
    res.status(404).json({ error: "company not found" });
    return;
  }
  syncWorkspaceMemberBillingAccess(snapshot.company.id, { active: true, paidUntil: snapshot.company.subscriptionEndDate });
  res.json({ ok: true, company: snapshot.company });
});

app.post("/api/admin/companies/:id/renew", authRequired, mainAdminRequired, (req: AuthedRequest, res) => {
  const months = typeof req.body?.months === "number" && Number.isFinite(req.body.months) ? req.body.months : 1;
  const company = getCloudSubscriptionDb().renewCompany(req.params.id, months, stringOrNull(req.body?.adminNote));
  if (company) {
    res.json({ ok: true, company });
    return;
  }
  const snapshot = getManualSubscriptionDb().renewCompany(req.params.id, months, stringOrNull(req.body?.adminNote));
  if (!snapshot) {
    res.status(404).json({ error: "company not found" });
    return;
  }
  syncWorkspaceMemberBillingAccess(snapshot.company.id, { active: true, paidUntil: snapshot.company.subscriptionEndDate });
  res.json({ ok: true, company: snapshot.company });
});

app.post("/api/admin/companies/:id/suspend", authRequired, mainAdminRequired, (req: AuthedRequest, res) => {
  const company = getCloudSubscriptionDb().setCompanyStatus(req.params.id, "suspended", stringOrNull(req.body?.adminNote));
  if (company) {
    res.json({ ok: true, company });
    return;
  }
  const snapshot = getManualSubscriptionDb().updateCompanyStatus(req.params.id, "suspended", stringOrNull(req.body?.adminNote));
  if (!snapshot) {
    res.status(404).json({ error: "company not found" });
    return;
  }
  syncWorkspaceMemberBillingAccess(snapshot.company.id, { active: false });
  res.json({ ok: true, company: snapshot.company });
});

app.post("/api/admin/companies/:id/cancel", authRequired, mainAdminRequired, (req: AuthedRequest, res) => {
  const company = getCloudSubscriptionDb().setCompanyStatus(req.params.id, "cancelled", stringOrNull(req.body?.adminNote));
  if (company) {
    res.json({ ok: true, company });
    return;
  }
  const snapshot = getManualSubscriptionDb().updateCompanyStatus(req.params.id, "cancelled", stringOrNull(req.body?.adminNote));
  if (!snapshot) {
    res.status(404).json({ error: "company not found" });
    return;
  }
  syncWorkspaceMemberBillingAccess(snapshot.company.id, { active: false });
  res.json({ ok: true, company: snapshot.company });
});

app.get("/api/admin/subscription-dashboard", authRequired, mainAdminRequired, (_req: AuthedRequest, res) => {
  res.json({ dashboard: getCloudSubscriptionDb().getAdminDashboard() });
});

app.get("/api/admin/connected-users", authRequired, mainAdminRequired, (_req: AuthedRequest, res) => {
  res.json({ users: getCloudSubscriptionDb().getConnectedUsers() });
});

app.get("/api/admin/notifications", authRequired, mainAdminRequired, (_req: AuthedRequest, res) => {
  res.json({ notifications: getCloudSubscriptionDb().getNotifications() });
});

app.post("/api/local/account/create-request", authRequired, async (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req);
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    if (isAppOwner(req.userId)) {
      res.json({ ok: true, skipped: true, reason: "app_owner" });
      return;
    }
    const ws = getWorkspace(workspaceId);
    const user = req.userId ? getUserById(req.userId) : undefined;
    const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
    if (!deviceId) {
      res.status(400).json({ error: "deviceId required" });
      return;
    }
    const result = await createCloudAccountRequest({
      companyName: typeof req.body?.companyName === "string" ? req.body.companyName.trim() : ws.companyProfile?.name?.trim() || ws.name,
      contactName: typeof req.body?.contactName === "string" ? req.body.contactName.trim() : user?.name?.trim() || "",
      email: typeof req.body?.email === "string" ? req.body.email.trim() : user?.email?.trim() || "",
      phone: typeof req.body?.phone === "string" ? req.body.phone.trim() : ws.companyProfile?.phone?.trim() || "",
      deviceId,
      deviceName: typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : os.hostname(),
      platform: normalizeCloudPlatform(req.body?.platform ?? process.platform)
    });
    const company = (result as { company?: Record<string, unknown> }).company as Record<string, unknown> | undefined;
    if (company?.id) {
      getManualSubscriptionDb().applyExternalSnapshot({
        companyId: String(company.id),
        companyName: String(company.companyName ?? ws.name),
        contactName: String(company.contactName ?? user?.name ?? ""),
        email: String(company.email ?? user?.email ?? ""),
        phone: String(company.phone ?? ws.companyProfile?.phone ?? ""),
        manualPaymentReference: typeof company.manualPaymentReference === "string" ? company.manualPaymentReference : null,
        subscriptionStatus: "pending",
        planName: typeof company.planName === "string" ? company.planName : "Monthly"
      });
      getManualSubscriptionDb().markDeviceSeen({
        companyId: String(company.id),
        deviceId,
        deviceName: typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : os.hostname(),
        isAllowed: false
      });
      void getCloudSyncDb().pushEvent({
        eventType: "app_started",
        payload: sanitizeCloudPayload({
          kind: "account_request_created",
          workspaceId,
          deviceId,
          companyId: String(company.id)
        }) as Record<string, unknown>
      });
    }
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create local account request." });
  }
});

app.get("/api/local/subscription/status", authRequired, async (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req);
    const deviceId = typeof req.query?.deviceId === "string" ? req.query.deviceId.trim() : typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
    const deviceName = typeof req.query?.deviceName === "string" ? req.query.deviceName.trim() : os.hostname();
    if (!workspaceId || !deviceId) {
      res.status(400).json({ error: "workspaceId and deviceId required" });
      return;
    }
    if (isAppOwner(req.userId)) {
      const ws = getWorkspace(workspaceId);
      const company = getWorkspaceSubscriptionCompany(ws, req.userId);
      getManualSubscriptionDb().markDeviceSeen({
        companyId: company.id,
        deviceId,
        deviceName,
        isAllowed: true
      });
      res.json({
        status: "active",
        hasAccess: true,
        limitedAccess: false,
        daysRemaining: 3650,
        daysExpired: 0,
        paymentReference: company.manualPaymentReference,
        lastConnectedAt: new Date().toISOString(),
        company
      });
      return;
    }
    const ws = getWorkspace(workspaceId);
    res.json(buildWorkspaceSubscriptionStatus(ws, req.userId, deviceId, deviceName));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to get local subscription status." });
  }
});

app.post("/api/local/subscription/sync-now", authRequired, async (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req);
    const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
    const deviceName = typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : os.hostname();
    if (!workspaceId || !deviceId) {
      res.status(400).json({ error: "workspaceId and deviceId required" });
      return;
    }
    if (isAppOwner(req.userId)) {
      const ws = getWorkspace(workspaceId);
      const company = getWorkspaceSubscriptionCompany(ws, req.userId);
      getManualSubscriptionDb().markDeviceSeen({
        companyId: company.id,
        deviceId,
        deviceName,
        isAllowed: true
      });
      res.json({
        ok: true,
        status: {
          status: "active",
          hasAccess: true,
          limitedAccess: false,
          daysRemaining: 3650,
          daysExpired: 0,
          paymentReference: company.manualPaymentReference,
          lastConnectedAt: new Date().toISOString(),
          company
        }
      });
      return;
    }
    const ws = getWorkspace(workspaceId);
    const snapshot = buildWorkspaceSubscriptionStatus(ws, req.userId, deviceId, deviceName);
    const result = await getCloudSyncDb().syncPendingEvents();
    res.json({ ok: true, snapshot, sync: result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to sync local subscription." });
  }
});

app.post("/api/local/device/heartbeat", authRequired, async (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req);
    const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
    const deviceName = typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : os.hostname();
    if (!workspaceId || !deviceId) {
      res.status(400).json({ error: "workspaceId and deviceId required" });
      return;
    }
    const localCompany = getWorkspaceSubscriptionCompany(getWorkspace(workspaceId), req.userId);
    const device = await sendCloudHeartbeat({
      companyId: localCompany.id,
      deviceId,
      deviceName,
      platform: normalizeCloudPlatform(req.body?.platform ?? process.platform),
      appVersion: typeof req.body?.appVersion === "string" ? req.body.appVersion.trim() : APP_VERSION
    });
    getManualSubscriptionDb().markDeviceSeen({
      companyId: localCompany.id,
      deviceId,
      deviceName,
      isAllowed: true
    });
    res.json({ ok: true, device });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to send local device heartbeat." });
  }
});

app.post("/api/brain/events", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const entityType = typeof req.body?.entityType === "string" ? req.body.entityType.trim() : "";
  const entityId = typeof req.body?.entityId === "string" ? req.body.entityId.trim() : "";
  const eventType = req.body?.eventType as BrainEventType;
  if (!entityType || !entityId || typeof eventType !== "string") {
    res.status(400).json({ error: "eventType, entityType, and entityId are required" });
    return;
  }
  try {
    const event = getBrainCoreDb().eventService.recordEvent({
      eventType,
      entityType,
      entityId,
      payload: (req.body?.payload && typeof req.body.payload === "object" && !Array.isArray(req.body.payload))
        ? { workspaceId, ...(req.body.payload as Record<string, unknown>) }
        : { workspaceId },
      links: Array.isArray(req.body?.links) ? req.body.links : undefined
    });
    res.status(201).json({ event });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to write brain event." });
  }
});

app.get("/api/brain/events", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const events = getBrainCoreDb().eventService.listEvents({
    workspaceId,
    eventType: typeof req.query?.eventType === "string" ? (req.query.eventType as BrainEventType) : undefined,
    entityType: typeof req.query?.entityType === "string" ? req.query.entityType.trim() : undefined,
    entityId: typeof req.query?.entityId === "string" ? req.query.entityId.trim() : undefined,
    limit: Number(req.query?.limit) || 100
  });
  res.json({ events });
});

app.get("/api/brain/recommendations", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const recommendations = getBrainCoreDb().recommendationService.listRecommendations({
    workspaceId,
    status: typeof req.query?.status === "string" ? (req.query.status as BrainRecommendationStatus | "all") : "all",
    moduleName: typeof req.query?.moduleName === "string" ? req.query.moduleName.trim() : undefined,
    limit: Number(req.query?.limit) || 100
  });
  res.json({ recommendations });
});

app.get("/api/brain/dashboard", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const context = buildBrainRunContext(workspaceId);
  const dashboard = getQouterXBrainOrchestrator().buildDashboard({
    workspaceId,
    jobs: context.queueSnapshot.jobs,
    stockSnapshot: context.stockSnapshot,
    syncHealth: getQouterXBrainOrchestrator().buildSyncHealth()
  });
  res.json({ dashboard });
});

app.get("/api/brain/tasks/:id", authRequired, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "numeric task id required" });
    return;
  }
  const task = getBrainCoreDb().taskService.get(id);
  if (!task) {
    res.status(404).json({ error: "task not found" });
    return;
  }
  res.json({ task });
});

app.get("/api/brain/outbox", authRequired, (req: AuthedRequest, res) => {
  res.json({
    stats: getBrainCoreDb().eventBus.stats(),
    pending: getBrainCoreDb().eventBus.listPending(Number(req.query?.limit) || 25)
  });
});

app.post("/api/brain/run", authRequired, async (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const modeInput = typeof req.body?.mode === "string" ? req.body.mode.trim() : "quick";
  const eventMode = (["quick", "full", "module", "entity"].includes(modeInput) ? modeInput : "quick") as EventBrainRunMode;
  const mode = (modeInput === "full" ? "full" : modeInput === "module" || modeInput === "module-specific" ? "module-specific" : "quick") as BrainRunMode;
  const requestedModules = Array.isArray(req.body?.modules)
    ? req.body.modules
        .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
        .filter((value: string) =>
          ["part_dna", "dxf_errors", "offcuts", "sheet_optimizer", "profit", "materials", "purchasing", "queue", "lead_time", "manufacturing_memory", "nesting"].includes(value)
        ) as BrainModuleName[]
    : undefined;
  try {
    const eventResultPromise = getEventBrainOrchestrator().run({
      mode: eventMode,
      moduleName: typeof req.body?.moduleName === "string" ? req.body.moduleName.trim() : requestedModules?.[0] ?? null,
      entityType: typeof req.body?.entityType === "string" ? req.body.entityType.trim() : null,
      entityId: typeof req.body?.entityId === "string" ? req.body.entityId.trim() : null,
      workspaceId
    });
    const context = buildBrainRunContext(workspaceId);
    const leadTimeTargetJobId = Number.isFinite(Number(req.body?.leadTimeTargetJobId)) ? Number(req.body.leadTimeTargetJobId) : null;
    const result = getQouterXBrainOrchestrator().run({
      workspaceId,
      mode,
      modules: requestedModules,
      triggerEventType: typeof req.body?.triggerEventType === "string" ? req.body.triggerEventType.trim() : null,
      jobs: context.queueSnapshot.jobs,
      quotes: context.ws.quotes,
      stockSnapshot: context.stockSnapshot,
      services: context.services,
      nestingParts: context.nestingParts,
      leadTimeTargetJobId,
      dxfInput:
        typeof req.body?.rawDxf === "string" && req.body.rawDxf.trim()
          ? {
              fileId: typeof req.body?.fileId === "string" && req.body.fileId.trim() ? req.body.fileId.trim() : `brain-${Date.now()}`,
              rawDxf: req.body.rawDxf,
              fileName: typeof req.body?.fileName === "string" ? req.body.fileName.trim() : undefined,
              partName: typeof req.body?.partName === "string" ? req.body.partName.trim() : null,
              material: typeof req.body?.material === "string" ? req.body.material.trim() : null,
              thickness: Number.isFinite(Number(req.body?.thickness)) ? Number(req.body.thickness) : null,
              customerId: typeof req.body?.customerId === "string" ? req.body.customerId.trim() : null,
              customerName: typeof req.body?.customerName === "string" ? req.body.customerName.trim() : null,
              quoteId: typeof req.body?.quoteId === "string" ? req.body.quoteId.trim() : null,
              quotedPrice: Number.isFinite(Number(req.body?.quotedPrice)) ? Number(req.body.quotedPrice) : null,
              entityType: typeof req.body?.entityType === "string" ? req.body.entityType.trim() : null,
              entityId: typeof req.body?.entityId === "string" ? req.body.entityId.trim() : null
            }
          : null,
      offcutRequest:
        typeof req.body?.offcutRequest === "object" && req.body.offcutRequest
          ? {
              material: String(req.body.offcutRequest.material ?? "").trim(),
              thickness: Number(req.body.offcutRequest.thickness),
              requiredWidth: Number(req.body.offcutRequest.requiredWidth),
              requiredHeight: Number(req.body.offcutRequest.requiredHeight),
              jobId: typeof req.body.offcutRequest.jobId === "string" ? req.body.offcutRequest.jobId.trim() : null,
              quoteId: typeof req.body.offcutRequest.quoteId === "string" ? req.body.offcutRequest.quoteId.trim() : null,
              partDnaId: Number.isFinite(Number(req.body.offcutRequest.partDnaId)) ? Number(req.body.offcutRequest.partDnaId) : null,
              entityLabel: typeof req.body.offcutRequest.entityLabel === "string" ? req.body.offcutRequest.entityLabel.trim() : null
            }
          : null,
      sheetRequest:
        typeof req.body?.sheetRequest === "object" && req.body.sheetRequest
          ? {
              material: String(req.body.sheetRequest.material ?? "").trim(),
              thickness: Number(req.body.sheetRequest.thickness),
              requiredWidth: Number(req.body.sheetRequest.requiredWidth),
              requiredHeight: Number(req.body.sheetRequest.requiredHeight),
              jobId: typeof req.body.sheetRequest.jobId === "string" ? req.body.sheetRequest.jobId.trim() : null,
              quoteId: typeof req.body.sheetRequest.quoteId === "string" ? req.body.sheetRequest.quoteId.trim() : null
            }
          : null
    });
    const dashboard = getQouterXBrainOrchestrator().buildDashboard({
      workspaceId,
      jobs: context.queueSnapshot.jobs,
      stockSnapshot: context.stockSnapshot,
      syncHealth: getQouterXBrainOrchestrator().buildSyncHealth()
    });
    const eventResult = await eventResultPromise;
    res.json({ result, eventResult, taskId: eventResult.taskId, dashboard });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to run brain orchestrator." });
  }
});

app.post("/api/brain/offcuts/find-match", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  try {
    const result = getOffcutIntelligenceService().findMatch({
      workspaceId,
      material: typeof req.body?.material === "string" ? req.body.material.trim() : "",
      thickness: Number(req.body?.thickness),
      requiredWidth: Number(req.body?.requiredWidth),
      requiredHeight: Number(req.body?.requiredHeight),
      jobId: typeof req.body?.jobId === "string" ? req.body.jobId.trim() : null,
      quoteId: typeof req.body?.quoteId === "string" ? req.body.quoteId.trim() : null,
      partDnaId: Number.isFinite(Number(req.body?.partDnaId)) ? Number(req.body.partDnaId) : null,
      entityLabel: typeof req.body?.entityLabel === "string" ? req.body.entityLabel.trim() : null
    });
    res.json({ result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to find offcut match." });
  }
});

app.get("/api/brain/offcuts/recommendations", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const recommendations = getOffcutIntelligenceService().listRecommendations(
    workspaceId,
    Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 50
  );
  res.json({ recommendations });
});

app.post("/api/brain/offcuts/:id/use", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  try {
    const result = getOffcutIntelligenceService().useSuggestedOffcut({
      workspaceId,
      offcutId: Number(req.params.id),
      action: req.body?.action === "use" ? "use" : "reserve",
      jobId: typeof req.body?.jobId === "string" ? req.body.jobId.trim() : null,
      quoteId: typeof req.body?.quoteId === "string" ? req.body.quoteId.trim() : null,
      partDnaId: Number.isFinite(Number(req.body?.partDnaId)) ? Number(req.body.partDnaId) : null,
      requiredWidth: Number.isFinite(Number(req.body?.requiredWidth)) ? Number(req.body.requiredWidth) : null,
      requiredHeight: Number.isFinite(Number(req.body?.requiredHeight)) ? Number(req.body.requiredHeight) : null
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to use suggested offcut." });
  }
});

app.get("/api/brain/memory", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const memories = getManufacturingMemoryService().listMemories({
    workspaceId,
    memoryType: typeof req.query.memoryType === "string" ? req.query.memoryType.trim() : undefined,
    entityType: typeof req.query.entityType === "string" ? req.query.entityType.trim() : undefined,
    limit: Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 100
  });
  res.json({ memories });
});

app.get("/api/brain/patterns", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const patterns = getManufacturingMemoryService().listPatterns({
    workspaceId,
    patternType: typeof req.query.patternType === "string" ? req.query.patternType.trim() : undefined,
    limit: Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 100
  });
  res.json({ patterns });
});

app.post("/api/brain/memory/rebuild", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const rebuilt = getManufacturingMemoryService().rebuildFromBrainEvents(workspaceId);
  res.json({ ok: true, ...rebuilt });
});

app.get("/api/brain/profit/summary", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  res.json(getProfitIntelligenceService().getSummary());
});

app.get("/api/brain/profit/records", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId.trim() : undefined;
  const records = getProfitIntelligenceService().listRecords({
    customerId,
    limit: Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 100
  });
  res.json({ records });
});

app.get("/api/brain/profit/insights", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const insights = getProfitIntelligenceService().listInsights(
    Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 100
  ).filter((entry) => {
    try {
      const payload = JSON.parse(entry.payloadJson) as Record<string, unknown>;
      return String(payload.workspaceId ?? "") === workspaceId;
    } catch {
      return false;
    }
  });
  res.json({ insights });
});

app.post("/api/brain/profit/calculate/:jobId", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const jobId = req.params.jobId;
  if (!workspaceId || !jobId) {
    res.status(400).json({ error: "workspaceId and jobId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }

  const ws = getWorkspace(workspaceId);
  const legacyJob = ws.jobs.find((entry) => entry.id === jobId);
  if (!legacyJob) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  const result = calculateProfitForWorkspaceJob(workspaceId, legacyJob.id);
  res.json(result);
});

app.get("/api/brain/materials/forecast", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const forecastPeriodDays = Number.isFinite(Number(req.query.days)) ? Number(req.query.days) : undefined;
  const forecasts = getMaterialPredictionService().listForecasts({
    workspaceId,
    forecastPeriodDays,
    limit: Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 200
  });
  res.json({ forecasts });
});

app.get("/api/brain/materials/shortages", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const shortages = getMaterialPredictionService().getShortages({
    workspaceId,
    stockSnapshot: getStockSnapshot(getStockMaterialDb()),
    forecastPeriodDays: Number.isFinite(Number(req.query.days)) ? Number(req.query.days) : undefined
  });
  res.json({ shortages });
});

app.post("/api/brain/materials/rebuild-forecast", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const result = getMaterialPredictionService().rebuildForecast({
    workspaceId,
    jobs: ws.jobs,
    quotes: ws.quotes,
    stockSnapshot: getStockSnapshot(getStockMaterialDb()),
    forecastPeriodsDays: Array.isArray(req.body?.forecastPeriodsDays)
      ? req.body.forecastPeriodsDays.map((entry: unknown) => Number(entry)).filter((entry: number) => Number.isFinite(entry) && entry > 0)
      : undefined
  });
  res.json({ ok: true, ...result });
});

app.get("/api/brain/purchasing/recommendations", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const stockSnapshot = getStockSnapshot(getStockMaterialDb());
  getPurchasingIntelligenceService().syncRecommendations({ workspaceId, stockSnapshot });
  const recommendations = getPurchasingIntelligenceService().listRecommendations({
    workspaceId,
    status: typeof req.query.status === "string" ? (req.query.status as "open" | "ordered" | "dismissed" | "all") : "open",
    limit: Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 100
  });
  res.json({ recommendations });
});

app.post("/api/brain/purchasing/recommendations/:id/mark-ordered", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  try {
    const recommendation = getPurchasingIntelligenceService().markOrdered(workspaceId, Number(req.params.id));
    res.json({ ok: true, recommendation });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to mark purchase ordered." });
  }
});

app.post("/api/brain/purchasing/recommendations/:id/dismiss", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  try {
    const recommendation = getPurchasingIntelligenceService().dismiss(workspaceId, Number(req.params.id));
    res.json({ ok: true, recommendation });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to dismiss purchase recommendation." });
  }
});

app.post("/api/brain/queue/plan", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  syncWorkspaceSmartQueue(workspaceId);
  const jobs = listSmartJobs(getSmartJobQueueDb(), workspaceId);
  const result = getProductionQueueBrainService().createPlan({
    workspaceId,
    jobs,
    stockSnapshot: getStockSnapshot(getStockMaterialDb()),
    services: buildSmartQueueServicesForWorkspace(workspaceId),
    title: typeof req.body?.title === "string" ? req.body.title.trim() : undefined
  });
  res.json(result);
});

app.get("/api/brain/queue/current", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  syncWorkspaceSmartQueue(workspaceId);
  const jobs = listSmartJobs(getSmartJobQueueDb(), workspaceId);
  const scores = getProductionQueueBrainService().scoreJobs({
    workspaceId,
    jobs,
    stockSnapshot: getStockSnapshot(getStockMaterialDb()),
    services: buildSmartQueueServicesForWorkspace(workspaceId)
  });
  const plan = getProductionQueueBrainService().getCurrentPlan(workspaceId);
  res.json({ plan, scores });
});

app.post("/api/brain/queue/plans/:id/start", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const planId = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(planId)) {
    res.status(400).json({ error: "workspaceId and numeric plan id required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const plan = getProductionQueueBrainService().startPlan(workspaceId, planId);
  if (!plan) {
    res.status(404).json({ error: "plan not found" });
    return;
  }
  res.json({ plan });
});

app.post("/api/brain/queue/plans/:id/complete", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const planId = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(planId)) {
    res.status(400).json({ error: "workspaceId and numeric plan id required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const plan = getProductionQueueBrainService().completePlan(workspaceId, planId);
  if (!plan) {
    res.status(404).json({ error: "plan not found" });
    return;
  }
  res.json({ plan });
});

app.post("/api/brain/lead-time/predict", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  syncWorkspaceSmartQueue(workspaceId);
  const ws = getWorkspace(workspaceId);
  const queueSnapshot = buildSmartQueueSnapshot(getSmartJobQueueDb(), workspaceId, buildSmartQueueServicesForWorkspace(workspaceId));
  const workerCount = Math.max(1, ws.workers.filter((worker) => worker.active !== false).length || 1);

  let target = Number.isFinite(Number(req.body?.jobId))
    ? queueSnapshot.jobs.find((job) => job.id === Number(req.body.jobId)) ?? null
    : null;
  let quoteId: string | null = null;
  if (!target && typeof req.body?.quoteId === "string" && req.body.quoteId.trim()) {
    const quote = ws.quotes.find((entry) => entry.id === req.body.quoteId.trim()) ?? null;
    if (quote) {
      target = buildSyntheticSmartQueueJobFromQuote(workspaceId, quote);
      quoteId = quote.id;
    }
  }

  if (!target) {
    res.status(404).json({ error: "job or quote not found" });
    return;
  }

  const prediction = getLeadTimeIntelligenceService().predict({
    workspaceId,
    target,
    jobs: queueSnapshot.jobs,
    stockSnapshot: getStockSnapshot(getStockMaterialDb()),
    workerCount,
    quoteId
  });
  res.json({ prediction });
});

app.get("/api/brain/lead-time/:jobId", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const jobId = Number(req.params.jobId);
  if (!workspaceId || !Number.isFinite(jobId)) {
    res.status(400).json({ error: "workspaceId and numeric jobId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const prediction = getLeadTimeIntelligenceService().getLatestForJob(workspaceId, jobId);
  if (!prediction) {
    res.status(404).json({ error: "prediction not found" });
    return;
  }
  res.json({ prediction });
});

app.post("/api/brain/sheets/optimize", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  try {
    const result = getSheetOptimizerService().optimize({
      workspaceId,
      material: typeof req.body?.material === "string" ? req.body.material.trim() : "",
      thickness: Number(req.body?.thickness),
      requiredWidth: Number(req.body?.requiredWidth),
      requiredHeight: Number(req.body?.requiredHeight),
      jobId: typeof req.body?.jobId === "string" ? req.body.jobId.trim() : null,
      quoteId: typeof req.body?.quoteId === "string" ? req.body.quoteId.trim() : null
    });
    res.json({ result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to optimize sheet source." });
  }
});

app.get("/api/brain/sheets/results/:id", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const resultId = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(resultId)) {
    res.status(400).json({ error: "workspaceId and numeric result id required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const result = getSheetOptimizerService().getResult(workspaceId, resultId);
  if (!result) {
    res.status(404).json({ error: "result not found" });
    return;
  }
  res.json({ result });
});

app.post("/api/brain/nesting/recommend", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  syncWorkspaceSmartQueue(workspaceId);
  const services = buildSmartQueueServicesForWorkspace(workspaceId);
  const jobs = listSmartJobs(getSmartJobQueueDb(), workspaceId);
  const scoredJobs = getProductionQueueBrainService().scoreJobs({
    workspaceId,
    jobs,
    stockSnapshot: getStockSnapshot(getStockMaterialDb()),
    services
  });
  const parts = buildNestingCandidatesForWorkspace(workspaceId, scoredJobs);
  if (!parts.length) {
    res.status(400).json({ error: "No DXF parts found on queued jobs for nesting." });
    return;
  }
  const result = getNestingIntelligenceService().recommend({
    workspaceId,
    jobs: scoredJobs,
    parts,
    stockSnapshot: getStockSnapshot(getStockMaterialDb())
  });
  res.json(result);
});

app.get("/api/brain/nesting/plans", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  res.json({ plans: getNestingIntelligenceService().listPlans(workspaceId) });
});

app.post("/api/brain/nesting/plans/:id/approve", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const planId = Number(req.params.id);
  if (!workspaceId || !Number.isFinite(planId)) {
    res.status(400).json({ error: "workspaceId and numeric plan id required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const plan = getNestingIntelligenceService().approvePlan(workspaceId, planId);
  if (!plan) {
    res.status(404).json({ error: "plan not found" });
    return;
  }
  res.json({ plan });
});

app.post("/api/nesting/workspaces", authRequired, (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req);
    if (workspaceId && !hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    res.json({ workspace: getNestingWorkspaceService().createWorkspace({ ...(req.body ?? {}), workspaceId: workspaceId || null }) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create nesting workspace." });
  }
});

app.get("/api/nesting/workspaces", authRequired, (req: AuthedRequest, res) => {
  try {
    const workspaceId = typeof req.query?.workspaceId === "string" ? req.query.workspaceId.trim() : "";
    if (workspaceId && !hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    res.json({ workspaces: getNestingWorkspaceService().listWorkspaces(workspaceId || null) });
  } catch (error) {
    console.error("[nesting-workspace] list failed:", error instanceof Error ? error.message : error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to load nesting workspaces." });
  }
});

app.get("/api/nesting/workspaces/:id", authRequired, (req: AuthedRequest, res) => {
  const workspace = getNestingWorkspaceService().getWorkspace(Number(req.params.id));
  if (!workspace) {
    res.status(404).json({ error: "nesting workspace not found" });
    return;
  }
  if (workspace.workspaceId && !hasMembership(req.userId as string, workspace.workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  res.json({ workspace });
});

app.patch("/api/nesting/workspaces/:id", authRequired, (req: AuthedRequest, res) => {
  try {
    const current = getNestingWorkspaceService().getWorkspace(Number(req.params.id));
    if (current?.workspaceId && !hasMembership(req.userId as string, current.workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    res.json({ workspace: getNestingWorkspaceService().updateWorkspace(Number(req.params.id), req.body ?? {}) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update nesting workspace." });
  }
});

app.post("/api/nesting/workspaces/:id/parts", authRequired, (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const current = getNestingWorkspaceService().getWorkspace(id);
    if (!current) {
      res.status(404).json({ error: "nesting workspace not found" });
      return;
    }
    if (current.workspaceId && !hasMembership(req.userId as string, current.workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    const part = getNestingWorkspaceService().addPart(id, req.body ?? {});
    res.json({ part, workspace: getNestingWorkspaceService().getWorkspace(id) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to add nesting part." });
  }
});

app.post("/api/nesting/geometry-preview", authRequired, (req: AuthedRequest, res) => {
  try {
    const rawDxf = typeof req.body?.rawDxf === "string" ? req.body.rawDxf : "";
    if (!rawDxf.trim()) {
      res.status(400).json({ error: "rawDxf is required" });
      return;
    }
    const geometry = extractDxfGeometry(rawDxf, Number(req.body?.width ?? 100), Number(req.body?.height ?? 100));
    res.json({
      geometry: {
        width: geometry.width,
        height: geometry.height,
        outerContour: geometry.outerContour,
        holes: geometry.holes,
        simplifiedPolygon: geometry.simplifiedPolygon,
        segments: geometry.segments.slice(0, 600),
        originalEntities: geometry.originalEntities,
        preview: geometry.simplifiedPolygon
      }
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to parse DXF geometry." });
  }
});

app.patch("/api/nesting/workspaces/:id/parts/:partId", authRequired, (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const current = getNestingWorkspaceService().getWorkspace(id);
    if (!current) {
      res.status(404).json({ error: "nesting workspace not found" });
      return;
    }
    if (current.workspaceId && !hasMembership(req.userId as string, current.workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    const part = getNestingWorkspaceService().updatePart(id, Number(req.params.partId), req.body ?? {});
    res.json({ part, workspace: getNestingWorkspaceService().getWorkspace(id) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update nesting part." });
  }
});

app.delete("/api/nesting/workspaces/:id/parts/:partId", authRequired, (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const current = getNestingWorkspaceService().getWorkspace(id);
    if (!current) {
      res.status(404).json({ error: "nesting workspace not found" });
      return;
    }
    if (current.workspaceId && !hasMembership(req.userId as string, current.workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    getNestingWorkspaceService().deletePart(id, Number(req.params.partId));
    res.json({ ok: true, workspace: getNestingWorkspaceService().getWorkspace(id) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to delete nesting part." });
  }
});

app.post("/api/nesting/workspaces/:id/auto-nest", authRequired, async (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const current = getNestingWorkspaceService().getWorkspace(id);
    if (!current) {
      res.status(404).json({ error: "nesting workspace not found" });
      return;
    }
    if (current.workspaceId && !hasMembership(req.userId as string, current.workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    res.json(await getNestingWorkspaceService().autoNestInWorker(id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to auto nest workspace." });
  }
});

app.patch("/api/nesting/workspaces/:id/placements", authRequired, (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const current = getNestingWorkspaceService().getWorkspace(id);
    if (!current) {
      res.status(404).json({ error: "nesting workspace not found" });
      return;
    }
    if (current.workspaceId && !hasMembership(req.userId as string, current.workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    res.json(getNestingWorkspaceService().savePlacements(id, Array.isArray(req.body?.placements) ? req.body.placements : []));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to save nesting placements." });
  }
});

app.post("/api/nesting/workspaces/:id/export-dxf", authRequired, (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const current = getNestingWorkspaceService().getWorkspace(id);
    if (!current) {
      res.status(404).json({ error: "nesting workspace not found" });
      return;
    }
    if (current.workspaceId && !hasMembership(req.userId as string, current.workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    res.json(getNestingWorkspaceService().exportDxf(id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to export nesting DXF." });
  }
});

app.get("/api/nesting/offcuts", authRequired, (req: AuthedRequest, res) => {
  try {
    const material = typeof req.query?.material === "string" ? req.query.material.trim() : undefined;
    const thickness = typeof req.query?.thickness === "string" && req.query.thickness.trim() ? Number(req.query.thickness) : undefined;
    res.json({ offcuts: getNestingWorkspaceService().listOffcuts({ material, thickness, status: "all" }) });
  } catch (error) {
    console.error("[nesting-workspace] offcut list failed:", error instanceof Error ? error.message : error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to load nesting offcuts." });
  }
});

app.post("/api/nesting/offcuts", authRequired, (req: AuthedRequest, res) => {
  try {
    res.json({ offcut: getNestingWorkspaceService().createOffcut(req.body ?? {}) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create nesting offcut." });
  }
});

app.post("/api/nesting/offcuts/recommend", authRequired, (req: AuthedRequest, res) => {
  try {
    const workspaceId = Number(req.body?.workspaceId);
    res.json(getNestingWorkspaceService().recommendOffcuts({
      workspaceId: Number.isFinite(workspaceId) && workspaceId > 0 ? workspaceId : null,
      material: String(req.body?.material ?? "").trim(),
      thickness: Number(req.body?.thickness),
      requiredWidth: Number(req.body?.requiredWidth),
      requiredHeight: Number(req.body?.requiredHeight),
      requiredArea: Number(req.body?.requiredArea)
    }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to recommend offcuts." });
  }
});

app.get("/api/nesting/history", authRequired, (req: AuthedRequest, res) => {
  try {
    const workspaceId = typeof req.query?.workspaceId === "string" ? req.query.workspaceId.trim() : "";
    if (workspaceId && !hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    res.json({ history: getNestingWorkspaceService().history(workspaceId || null) });
  } catch (error) {
    console.error("[nesting-workspace] history failed:", error instanceof Error ? error.message : error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to load nesting history." });
  }
});

app.post("/api/nesting/workspaces/:id/create-offcuts", authRequired, (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const current = getNestingWorkspaceService().getWorkspace(id);
    if (!current) {
      res.status(404).json({ error: "nesting workspace not found" });
      return;
    }
    if (current.workspaceId && !hasMembership(req.userId as string, current.workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    res.json({ offcuts: getNestingWorkspaceService().createSuggestedOffcuts(id) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create nesting offcuts." });
  }
});

app.post("/api/nesting/create", authRequired, (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req) || (typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "");
    if (workspaceId && !hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    const plan = getNestingEngineService().create({ ...(req.body ?? {}), workspaceId });
    res.json({ job: plan, plan });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create nesting job." });
  }
});

app.post("/api/nesting/program/run", authRequired, (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req) || (typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "");
    if (workspaceId && !hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    const input = { ...(req.body ?? {}), workspaceId } as CypNestProgramInput;
    const result = new CypNestProgramService().run(input);
    if (workspaceId) {
      recordBrainEvent({
        workspaceId,
        eventType: "nesting_completed",
        entityType: "nesting_program",
        entityId: result.report.strategyName,
        payload: {
          source: "recovered-cypnest-symbols",
          strategyName: result.report.strategyName,
          usagePercent: result.plan.usagePercent,
          wastePercent: result.plan.wastePercent,
          partsComplete: result.report.partsComplete,
          totalParts: result.report.totalParts
        }
      });
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to run nesting program." });
  }
});

function runNestingInWorker(input: { parts: NestPart[]; sheet: SheetSource; customerName: string; nestName: string; maxOptimizationMs: number; angleStepDegrees?: number }) {
  return new Promise<NestResult>((resolve, reject) => {
    const worker = new Worker(new URL("./nesting-run-worker.js", import.meta.url), { workerData: input });
    const timeout = setTimeout(() => {
      worker.terminate().catch(() => undefined);
      reject(new Error("Nesting worker timed out"));
    }, Math.max(1_000, input.maxOptimizationMs + 5_000));
    worker.once("message", (message: { result?: NestResult; error?: string }) => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(message.error));
      else if (message.result) resolve(message.result);
      else reject(new Error("Nesting worker returned no result"));
    });
    worker.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.once("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Nesting worker exited with code ${code}`));
    });
  });
}

app.post("/api/nesting/run", authRequired, async (req: AuthedRequest, res) => {
  try {
    const body = req.body ?? {};
    const workspaceId = getRequestedWorkspaceId(req);
    const sheet: SheetSource = {
      id: typeof body.sheet?.id === "string" ? body.sheet.id : undefined,
      type: body.sheet?.type === "offcut" ? "offcut" : "sheet",
      width: Number(body.sheet?.width ?? body.sheetWidth),
      height: Number(body.sheet?.height ?? body.sheetHeight),
      border: Math.max(0, Number(body.sheet?.border ?? body.border ?? 0)),
      spacing: Math.max(0, Number(body.sheet?.spacing ?? body.spacing ?? 0)),
      kerf: Math.max(0, Number(body.sheet?.kerf ?? body.kerf ?? 0))
    };
    if (!Number.isFinite(sheet.width) || sheet.width <= 0 || !Number.isFinite(sheet.height) || sheet.height <= 0) {
      res.status(400).json({ error: "sheet width and height are required" });
      return;
    }
    const rawParts = Array.isArray(body.parts) ? body.parts : [];
    const parts: NestPart[] = rawParts.length
      ? rawParts.map((part: Record<string, unknown>, index: number) => ({
          id: typeof part.id === "string" ? part.id : `part-${index + 1}`,
          name: typeof part.name === "string" ? part.name : `Part ${index + 1}`,
          quantity: Math.max(1, Math.round(Number(part.quantity) || 1)),
          allowRotation: part.allowRotation === false ? false : true,
          polygon: Array.isArray(part.polygon)
            ? part.polygon.map((point: Record<string, unknown>) => ({ x: Number(point.x), y: Number(point.y) }))
            : [
                { x: 0, y: 0 },
                { x: Number(part.width ?? 300), y: 0 },
                { x: Number(part.width ?? 300), y: Number(part.height ?? 200) },
                { x: 0, y: Number(part.height ?? 200) }
              ]
        }))
      : [
          {
            id: "part-a",
            name: "300x200 Plate",
            quantity: 4,
            polygon: [
              { x: 0, y: 0 },
              { x: 300, y: 0 },
              { x: 300, y: 200 },
              { x: 0, y: 200 }
            ]
          },
          {
            id: "part-b",
            name: "600x120 Strip",
            quantity: 2,
            polygon: [
              { x: 0, y: 0 },
              { x: 600, y: 0 },
              { x: 600, y: 120 },
              { x: 0, y: 120 }
            ]
          }
        ];
    const result = await runNestingInWorker({
      parts,
      sheet,
      customerName: typeof body.customerName === "string" ? body.customerName : "Customer",
      nestName: typeof body.nestName === "string" ? body.nestName : "Nest",
      maxOptimizationMs: Number(body.maxOptimizationMs) || 10000,
      angleStepDegrees: Number(body.angleStepDegrees) || undefined
    });
    if ((result.heatScore ?? 0) >= 45 || result.warnings.some((warning) => /heat|warp|burn|thin web/i.test(warning))) {
      try {
        getBrainCoreDb().eventService.recordEvent({
          eventType: "nesting_heat_warning",
          entityType: "nesting_studio",
          entityId: workspaceId ?? "local",
          payload: {
            heatScore: result.heatScore,
            heatZones: result.heatZones,
            warnings: result.warnings.filter((warning) => /heat|warp|burn|thin web/i.test(warning))
          }
        });
      } catch {
        // Heat warnings should not block nesting output.
      }
    }
    res.json({ result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to run nesting." });
  }
});

app.post("/api/nesting/export", authRequired, (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req);
    if (workspaceId && !hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    const customerName = sanitizeName(String(req.body?.customerName ?? "Customer")) || "Customer";
    const nestName = sanitizeName(String(req.body?.nestName ?? "Nest")) || "Nest";
    const dxf = typeof req.body?.dxf === "string" && req.body.dxf.trim() ? req.body.dxf : "";
    if (!dxf) {
      res.status(400).json({ error: "dxf is required" });
      return;
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const folder = path.join(getNestingExportRoot(), customerName);
    ensureDir(folder);
    const exportFileName = `${customerName}_${nestName}_${stamp}.dxf`;
    const exportPath = path.join(folder, exportFileName);
    fs.writeFileSync(exportPath, dxf, "utf8");
    if (workspaceId) {
      recordBrainEvent({
        workspaceId,
        eventType: "nesting_exported",
        entityType: "nesting_studio",
        entityId: exportFileName,
        payload: { customerName, nestName, exportPath }
      });
    }
    res.json({ exportPath, exportFileName, exportFolder: folder });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to export nesting DXF." });
  }
});

app.post("/api/nesting/studio/save", authRequired, (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req) || (typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "");
    if (workspaceId && !hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    const db = getNestingEngineDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS nesting_studio_manual_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspaceId TEXT,
        customerName TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        usagePercent REAL NOT NULL,
        wastePercent REAL NOT NULL,
        warningsJson TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_nesting_studio_manual_workspace ON nesting_studio_manual_results(workspaceId, updatedAt DESC);
    `);
    const result = req.body?.result;
    if (!result || !Array.isArray(result.placements)) {
      res.status(400).json({ error: "result with placements is required" });
      return;
    }
    const selectedOffcutId = Number(req.body?.selectedOffcutId);
    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO nesting_studio_manual_results
       (workspaceId, customerName, payloadJson, usagePercent, wastePercent, warningsJson, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      workspaceId || null,
      String(req.body?.customerName ?? "Customer"),
      JSON.stringify(result),
      Number(result.usagePercent) || 0,
      Number(result.wastePercent) || 0,
      JSON.stringify(Array.isArray(result.warnings) ? result.warnings : []),
      now,
      now
    );
    if (workspaceId && Number.isFinite(selectedOffcutId) && selectedOffcutId > 0) {
      recordBrainEvent({
        workspaceId,
        eventType: "offcut_selected",
        entityType: "nesting_offcut",
        entityId: String(selectedOffcutId),
        payload: { source: "nesting_studio", customerName: String(req.body?.customerName ?? "Customer") }
      });
    }
    res.json({ ok: true, id: Number(insert.lastInsertRowid) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to save manual nesting placements." });
  }
});

app.post("/api/nesting/studio/offcut-event", authRequired, (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req);
    if (!workspaceId) {
      res.json({ ok: true });
      return;
    }
    if (!hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    const eventType = req.body?.eventType === "offcut_selected" ? "offcut_selected" : "offcut_recommended";
    const offcutId = Number(req.body?.offcutId);
    if (!Number.isFinite(offcutId) || offcutId <= 0) {
      res.status(400).json({ error: "offcutId required" });
      return;
    }
    recordBrainEvent({
      workspaceId,
      eventType,
      entityType: "nesting_offcut",
      entityId: String(offcutId),
      payload: {
        source: "nesting_studio",
        wastePercent: Number(req.body?.wastePercent) || 0,
        estimatedSaving: Number(req.body?.estimatedSaving) || 0,
        rotatedFit: Boolean(req.body?.rotatedFit)
      }
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to record offcut event." });
  }
});

app.post("/api/nesting/studio/create-leftover-offcut", authRequired, (req: AuthedRequest, res) => {
  try {
    const workspaceId = getRequestedWorkspaceId(req);
    if (workspaceId && !hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "membership required" });
      return;
    }
    const width = Number(req.body?.width);
    const height = Number(req.body?.height);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      res.status(400).json({ error: "valid leftover width and height required" });
      return;
    }
    const offcut = getNestingWorkspaceService().createOffcut({
      sourceWorkspaceId: null,
      sourceJobId: typeof req.body?.sourceJobId === "string" ? req.body.sourceJobId : "nesting-studio",
      sourceCustomerId: typeof req.body?.sourceCustomerId === "string" ? req.body.sourceCustomerId : null,
      material: String(req.body?.material ?? "Mild Steel"),
      thickness: Number(req.body?.thickness) || 1,
      width,
      height,
      shapeJson: typeof req.body?.shapeJson === "string" ? req.body.shapeJson : null,
      previewJson: typeof req.body?.previewJson === "string" ? req.body.previewJson : null,
      location: typeof req.body?.location === "string" ? req.body.location : "Nesting Studio leftovers",
      status: "available"
    });
    if (workspaceId && offcut) {
      recordBrainEvent({
        workspaceId,
        eventType: "offcut_created",
        entityType: "nesting_offcut",
        entityId: String(offcut.id),
        payload: {
          source: "nesting_studio",
          material: offcut.material,
          thickness: offcut.thickness,
          width: offcut.width,
          height: offcut.height
        }
      });
    }
    res.json({ offcut });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create leftover offcut." });
  }
});

app.post("/api/nesting/:id/optimize", authRequired, (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "numeric nesting id required" });
      return;
    }
    const plan = getNestingEngineService().optimize(id);
    res.json({ plan });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to optimize nesting job." });
  }
});

app.get("/api/nesting/:id", authRequired, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "numeric nesting id required" });
    return;
  }
  const plan = getNestingEngineService().get(id);
  if (!plan) {
    res.status(404).json({ error: "nesting job not found" });
    return;
  }
  res.json({ plan });
});

app.post("/api/nesting/:id/export-dxf", authRequired, (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "numeric nesting id required" });
      return;
    }
    const plan = getNestingEngineService().exportDxf(id);
    res.json({ plan, dxfExportPath: plan.dxfExportPath });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to export nested DXF." });
  }
});

app.patch("/api/nesting/:id/settings", authRequired, (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "numeric nesting id required" });
      return;
    }
    const plan = getNestingEngineService().updateSettings(id, req.body ?? {});
    res.json({ plan });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update nesting settings." });
  }
});

app.get("/api/nesting/:id/warnings", authRequired, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "numeric nesting id required" });
    return;
  }
  res.json({ warnings: getNestingEngineService().getWarnings(id) });
});

app.post("/api/brain/assistant/ask", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  syncWorkspaceSmartQueue(workspaceId);
  const ws = getWorkspace(workspaceId);
  const services = buildSmartQueueServicesForWorkspace(workspaceId);
  const queueSnapshot = buildSmartQueueSnapshot(getSmartJobQueueDb(), workspaceId, services);
  const stockSnapshot = getStockSnapshot(getStockMaterialDb());
  const response = getProductionAssistantService().ask({
    workspaceId,
    question,
    queueSnapshot,
    stockSnapshot,
    currentPlan: getProductionQueueBrainService().getCurrentPlan(workspaceId),
    shortages: getMaterialPredictionService().getShortages({ workspaceId, stockSnapshot }),
    profitService: getProfitIntelligenceService(),
    offcutService: getOffcutIntelligenceService(),
    dxfErrorService: getDxfErrorDetectionService(),
    customers: ws.customers,
    quotes: ws.quotes
  });
  res.json(response);
});

app.post("/api/brain/dxf/check", authRequired, storageUpload.single("file"), (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  try {
    const rawDxf =
      req.file?.buffer
        ? decodeDxfBuffer(req.file.buffer)
        : typeof req.body?.rawDxf === "string"
        ? req.body.rawDxf
        : "";
    const dxfFileId =
      (req.file?.originalname?.trim() || (typeof req.body?.dxfFileId === "string" ? req.body.dxfFileId.trim() : "")) ||
      `dxf-${Date.now()}.dxf`;
    const result = getDxfErrorDetectionService().checkDxf({
      workspaceId,
      dxfFileId,
      rawDxf,
      partDnaId: Number.isFinite(Number(req.body?.partDnaId)) ? Number(req.body.partDnaId) : null,
      thickness: Number.isFinite(Number(req.body?.thickness)) ? Number(req.body.thickness) : null
    });
    res.json({ result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to check DXF." });
  }
});

app.get("/api/brain/dxf/:id/errors", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  const dxfFileId = decodeURIComponent(String(req.params.id ?? "")).trim();
  if (!workspaceId || !dxfFileId) {
    res.status(400).json({ error: "workspaceId and dxf file id required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "membership required" });
    return;
  }
  const result = getDxfErrorDetectionService().listReports(workspaceId, dxfFileId);
  res.json({ result });
});

app.patch("/api/brain/recommendations/:id", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = getRequestedWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const id = Number(req.params.id);
  const status = typeof req.body?.status === "string" ? (req.body.status as BrainRecommendationStatus) : "open";
  if (!Number.isFinite(id) || (status !== "accepted" && status !== "dismissed" && status !== "open")) {
    res.status(400).json({ error: "valid recommendation id and status required" });
    return;
  }
  const visibleRecommendation = getBrainCoreDb()
    .recommendationService
    .listRecommendations({ workspaceId, status: "all", limit: 500 })
    .find((entry) => entry.id === id);
  if (!visibleRecommendation) {
    res.status(404).json({ error: "recommendation not found" });
    return;
  }
  const recommendation = getBrainCoreDb().recommendationService.updateRecommendation(id, status);
  if (!recommendation) {
    res.status(404).json({ error: "recommendation not found" });
    return;
  }
  res.json({ recommendation });
});

app.get("/api/cloud/settings", (_req, res) => {
  res.json({ settings: getCloudSyncDb().getSettings() });
});

app.post("/api/cloud/settings", (req, res) => {
  const roleInput = typeof req.body?.role === "string" ? req.body.role.trim() : "";
  const role = (["admin", "operator", "sales", "viewer"].includes(roleInput) ? roleInput : "operator") as CloudDeviceRole;
  const settings = getCloudSyncDb().saveSettings({
    enabled: Boolean(req.body?.enabled),
    companyId: typeof req.body?.companyId === "string" ? req.body.companyId : "",
    deviceName: typeof req.body?.deviceName === "string" ? req.body.deviceName : os.hostname(),
    role,
    adminMode: Boolean(req.body?.adminMode)
  });
  res.json({ ok: true, settings });
});

app.post("/api/cloud/register-device", async (req, res) => {
  const roleInput = typeof req.body?.role === "string" ? req.body.role.trim() : "";
  const role = (["admin", "operator", "sales", "viewer"].includes(roleInput) ? roleInput : "operator") as CloudDeviceRole;
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
  const deviceName = typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : os.hostname();
  if (!deviceId) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }
  await getCloudSyncDb().registerDevice({
    deviceId,
    deviceName,
    userName: typeof req.body?.userName === "string" ? req.body.userName.trim() : "",
    role
  });
  res.json({ ok: true });
});

app.post("/api/cloud/heartbeat", async (req, res) => {
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
  if (!deviceId) {
    res.status(400).json({ error: "deviceId required" });
    return;
  }
  const roleInput = typeof req.body?.role === "string" ? req.body.role.trim() : "";
  const role = (["admin", "operator", "sales", "viewer"].includes(roleInput) ? roleInput : "operator") as CloudDeviceRole;
  await getCloudSyncDb().sendHeartbeat(
    deviceId,
    typeof req.body?.userName === "string" ? req.body.userName.trim() : "",
    role
  );
  res.json({ ok: true });
});

app.get("/api/cloud/events", (_req, res) => {
  res.json({ events: getCloudSyncDb().listEvents(100) });
});

app.post("/api/cloud/events", (req, res) => {
  const eventTypeInput = typeof req.body?.eventType === "string" ? req.body.eventType.trim() : "";
  const allowedEventTypes: CloudEventType[] = [
    "app_started",
    "quote_created",
    "job_created",
    "job_started",
    "job_completed",
    "dxf_imported",
    "part_dna_detected",
    "purchase_order_detected",
    "email_quote_request_detected",
    "stock_reserved",
    "stock_used",
    "subscription_status_checked",
    "payment_proof_uploaded",
    "payment_confirmed",
    "subscription_renewed",
    "subscription_expired",
    "account_suspended",
    "error_report"
  ];
  if (!allowedEventTypes.includes(eventTypeInput as CloudEventType)) {
    res.status(400).json({ error: "Unsupported eventType" });
    return;
  }
  const sanitizedPayload =
    req.body?.payload && typeof req.body.payload === "object"
      ? (sanitizeCloudPayload(JSON.parse(JSON.stringify(req.body.payload))) as Record<string, unknown>)
      : {};
  const id = getCloudSyncDb().pushEvent({
    eventType: eventTypeInput as CloudEventType,
    payload: sanitizedPayload
  });
  res.status(201).json({ ok: true, id });
});

app.post("/api/cloud/sync-now", async (_req, res) => {
  const result = await getCloudSyncDb().syncPendingEvents();
  res.json({ ok: true, ...result });
});

app.get("/api/cloud/dashboard", (_req, res) => {
  res.json({ dashboard: getCloudSyncDb().getCompanyDashboard() });
});

app.get("/api/workspaces/:workspaceId/quotes", async (req, res) => {
  const { workspaceId } = req.params;
  const quotes = await migrateWorkspaceQuoteFiles(workspaceId);
  res.json({ quotes });
});

app.get("/api/workspaces/:workspaceId/company-profile", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  res.json({
    companyProfile: ws.companyProfile ?? {}
  });
});

app.put("/api/workspaces/:workspaceId/company-profile", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  ws.companyProfile = {
    name: typeof req.body?.name === "string" ? req.body.name.trim() : ws.companyProfile?.name,
    logoDataUrl: typeof req.body?.logoDataUrl === "string" ? req.body.logoDataUrl : ws.companyProfile?.logoDataUrl,
    accentColor:
      normalizeHexColor(typeof req.body?.accentColor === "string" ? req.body.accentColor : undefined) ??
      ws.companyProfile?.accentColor,
    email: typeof req.body?.email === "string" ? req.body.email.trim() : ws.companyProfile?.email,
    phone: typeof req.body?.phone === "string" ? req.body.phone.trim() : ws.companyProfile?.phone,
    address: typeof req.body?.address === "string" ? req.body.address.trim() : ws.companyProfile?.address,
    vatNumber: typeof req.body?.vatNumber === "string" ? req.body.vatNumber.trim() : ws.companyProfile?.vatNumber,
    registrationNumber:
      typeof req.body?.registrationNumber === "string"
        ? req.body.registrationNumber.trim()
        : ws.companyProfile?.registrationNumber
  };
  upsertWorkspace(ws);
  res.json({ ok: true, companyProfile: ws.companyProfile });
});

app.get("/api/workspaces/:workspaceId/email/settings", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  const settings = getEffectiveEmailSettings(ws);
  res.json({ emailSettings: settings });
});

app.put("/api/workspaces/:workspaceId/email/settings", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  const current = parseEmailSettings(ws.emailSettings ?? {}, ws.emailSettings ?? undefined);
  const incoming = parseEmailSettings(req.body, current);
  if (!incoming.smtpHost || !incoming.smtpUser || !incoming.fromEmail) {
    res.status(400).json({ error: "smtpHost, smtpUser and fromEmail are required" });
    return;
  }
  if (!incoming.smtpPass) {
    incoming.smtpPass = current.smtpPass ?? "";
  }
  if (!incoming.imapPass) {
    incoming.imapPass = current.imapPass ?? incoming.smtpPass ?? "";
  }
  if (!incoming.smtpPass) {
    res.status(400).json({ error: "smtpPass is required" });
    return;
  }
  ws.emailSettings = incoming;
  upsertWorkspace(ws);
  res.json({ ok: true, emailSettings: getEffectiveEmailSettings(ws) });
});

app.post("/api/workspaces/:workspaceId/email/test-imap", async (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  try {
    const messages = await listInboxEmails(ws, 10, false);
    res.json({
      ok: true,
      messageCount: messages.length,
      latestSubject: typeof messages[0]?.subject === "string" ? messages[0].subject : null
    });
  } catch (error) {
    res.status(400).json({
      error: "failed to connect to inbox",
      details: error instanceof Error ? error.message : "unknown error"
    });
  }
});

app.post("/api/workspaces/:workspaceId/email/detect", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  const fromEmail = typeof req.body?.fromEmail === "string" ? req.body.fromEmail.trim() : "";
  const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const source = [subject, body].filter(Boolean).join("\n");
  if (!source) {
    res.status(400).json({ error: "subject or body is required" });
    return;
  }

  const customerByEmail = fromEmail
    ? ws.customers.find((entry) => entry.email?.trim().toLowerCase() === fromEmail.toLowerCase())
    : undefined;
  const detection = detectQuoteAndPurchaseOrder(ws, source);
  const tags: string[] = [];
  if (detection.hasQuoteKeyword) tags.push("quote");
  if (detection.hasPurchaseOrderKeyword) tags.push("purchase_order");
  if (customerByEmail) tags.push("customer");

  res.json({
    ok: true,
    detection: {
      fromEmail,
      customer: customerByEmail
        ? {
            id: customerByEmail.id,
            name: customerByEmail.name,
            email: customerByEmail.email
          }
        : undefined,
      quote: detection.matchedQuote
        ? {
            id: detection.matchedQuote.id,
            quoteNumber: detection.matchedQuote.quoteNumber,
            title: detection.matchedQuote.title,
            customerName: detection.matchedQuote.customerName
          }
        : undefined,
      quoteCandidates: detection.quoteCandidates,
      purchaseOrderCandidates: detection.purchaseOrderCandidates,
      tags
    }
  });
});

app.get("/api/workspaces/:workspaceId/email/inbox", async (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  const includeAllRaw = typeof req.query?.all === "string" ? req.query.all.trim().toLowerCase() : "";
  const includeAll = includeAllRaw === "1" || includeAllRaw === "true" || includeAllRaw === "yes";
  const limit = Math.max(1, Math.min(500, Number(req.query?.limit) || 80));
  try {
    const messages = await listInboxEmailsCached(ws, limit, includeAll);
    res.json({ ok: true, messages });
  } catch (error) {
    res.status(400).json({
      error: "failed to fetch inbox",
      details: error instanceof Error ? error.message : "unknown error"
    });
  }
});

app.get("/api/workspaces/:workspaceId/email/inbox/:uid/attachment", async (req, res) => {
  const { workspaceId, uid: uidRaw } = req.params;
  const ws = getWorkspace(workspaceId);
  const uid = Number(uidRaw);
  const partId = typeof req.query?.part === "string" ? req.query.part.trim() : "";
  if (!Number.isFinite(uid) || uid <= 0 || !partId) {
    res.status(400).json({ error: "uid and part are required" });
    return;
  }
  try {
    const attachment = await getInboxAttachment(ws, Math.floor(uid), partId);
    res.json({ ok: true, attachment });
  } catch (error) {
    res.status(400).json({
      error: "failed to fetch attachment",
      details: error instanceof Error ? error.message : "unknown error"
    });
  }
});

app.get("/api/workspaces/:workspaceId/email/inbox/:uid", async (req, res) => {
  const { workspaceId, uid: uidRaw } = req.params;
  const ws = getWorkspace(workspaceId);
  const uid = Number(uidRaw);
  if (!Number.isFinite(uid) || uid <= 0) {
    res.status(400).json({ error: "valid uid is required" });
    return;
  }
  try {
    const message = await getInboxMessage(ws, Math.floor(uid));
    res.json({ ok: true, message });
  } catch (error) {
    res.status(400).json({
      error: "failed to fetch email",
      details: error instanceof Error ? error.message : "unknown error"
    });
  }
});

app.post("/api/workspaces/:workspaceId/email/send", async (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  const settings = getEffectiveEmailSettings(ws);
  const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
  const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const html = typeof req.body?.html === "string" ? req.body.html.trim() : "";
  if (!to || !subject || !body) {
    res.status(400).json({ error: "to, subject and body are required" });
    return;
  }
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass || !settings.fromEmail) {
    res.status(400).json({ error: "SMTP settings are incomplete" });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass
      }
    });
    await transporter.sendMail({
      from: `"${settings.fromName || ws.companyProfile?.name || "Qouterx"}" <${settings.fromEmail}>`,
      to,
      subject,
      text: body,
      html:
        html ||
        `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${body
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</pre>`
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({
      error: "failed to send email",
      details: error instanceof Error ? error.message : "unknown error"
    });
  }
});

app.post("/api/workspaces/:workspaceId/quotes/seed", (req, res) => {
  const { workspaceId } = req.params;
  const seed = typeof req.body?.seed === "number" ? req.body.seed : NaN;
  if (!Number.isFinite(seed) || seed <= 0) {
    res.status(400).json({ error: "seed must be a positive number" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  ws.quoteSeed = seed;
  upsertWorkspace(ws);
  res.json({ ok: true, quoteSeed: seed });
});

app.post("/api/workspaces/:workspaceId/quotes", async (req, res) => {
  const { workspaceId } = req.params;
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const quoteNumber = getNextQuoteNumber(workspaceId);
  const sections: QuoteSections = req.body?.sections ?? {
    laserCutting: {},
    punching: {},
    fabrication: {},
    laserWelding: {},
    tankManufacturing: {},
    bending: {},
    rolling: {}
  };
  const total =
    (sections.laserCutting?.amount ?? 0) +
    (sections.punching?.amount ?? 0) +
    (sections.fabrication?.amount ?? 0) +
    (sections.laserWelding?.amount ?? 0) +
    (sections.tankManufacturing?.amount ?? 0) +
    (sections.bending?.amount ?? 0) +
    (sections.rolling?.amount ?? 0);
  const customerName = typeof req.body?.customerName === "string" ? req.body.customerName.trim() : undefined;
  if (customerName) {
    const exists = ws.customers.find((c) => c.name.toLowerCase() === customerName.toLowerCase());
    if (!exists) {
      const customer: CustomerRecord = {
        id: `customer-${crypto.randomUUID()}`,
        name: customerName,
        createdAt: new Date().toISOString()
      };
      ws.customers = [customer, ...ws.customers];
      updateWorkspaceCustomers(workspaceId, ws.customers);
    }
  }
  const profile = ws.companyProfile ?? {};
  const companyDetailsFromBody = parseCompanyDetails(req.body?.companyDetails);
  const quote: QuoteRecord = {
    id: `quote-${crypto.randomUUID()}`,
    quoteNumber,
    title,
    status: "draft",
    customerName,
    companyName:
      typeof req.body?.companyName === "string" && req.body.companyName.trim()
        ? req.body.companyName.trim()
        : profile.name,
    logoDataUrl:
      typeof req.body?.logoDataUrl === "string" && req.body.logoDataUrl.trim()
        ? req.body.logoDataUrl
        : profile.logoDataUrl,
    companyDetails: {
      email: companyDetailsFromBody?.email ?? profile.email,
      phone: companyDetailsFromBody?.phone ?? profile.phone,
      address: companyDetailsFromBody?.address ?? profile.address,
      vatNumber: companyDetailsFromBody?.vatNumber ?? profile.vatNumber,
      registrationNumber: companyDetailsFromBody?.registrationNumber ?? profile.registrationNumber,
      accentColor: companyDetailsFromBody?.accentColor ?? normalizeHexColor(profile.accentColor)
    },
    customerDetails: parseCustomerDetails(req.body?.customerDetails),
    sections,
    total,
    createdAt: new Date().toISOString()
  };
  try {
    const quotePdfPath = getQuotePdfPathForCustomer(quote);
    quote.quotePdfPath = quotePdfPath;
    await writeQuotePdf(quote, quotePdfPath, { documentType: "quote" });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create quote files",
      details: error instanceof Error ? error.message : "unknown error"
    });
    return;
  }
  const quotes = [quote, ...ws.quotes];
  updateWorkspaceQuotes(workspaceId, quotes);
  recordBrainEvent({
    workspaceId,
    eventType: "quote_created",
    entityType: "quote",
    entityId: quote.id,
    payload: {
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      customerName: quote.customerName ?? null,
      total: quote.total ?? 0
    },
    links: customerName
      ? [{
          sourceType: "quote",
          sourceId: quote.id,
          targetType: "customer",
          targetId: customerName,
          linkType: "quoted_for"
        }]
      : undefined
  });
  try {
    const sectionEntries = [
      quote.sections.laserCutting,
      quote.sections.punching,
      quote.sections.fabrication,
      quote.sections.laserWelding,
      quote.sections.tankManufacturing,
      quote.sections.bending,
      quote.sections.rolling
    ];
    for (const section of sectionEntries) {
      for (const rawPart of section?.parts ?? []) {
        const part = rawPart as Record<string, unknown>;
        recordQuotedPartHistory(getPartDnaDb(), {
          workspaceId,
          partCode: typeof part.partCode === "string" ? part.partCode : null,
          geometryHash: typeof part.geometryHash === "string" ? part.geometryHash : null,
          quoteId: quote.id,
          fileName:
            typeof part.dxfName === "string" && part.dxfName.trim()
              ? part.dxfName.trim()
              : typeof part.name === "string" && part.name.trim()
                ? part.name.trim()
                : `${quote.quoteNumber}.dxf`,
          customerName: quote.customerName?.trim() || null,
          quotedPrice: Number.isFinite(Number(part.unitPrice)) ? Number(part.unitPrice) : null,
          partName: typeof part.name === "string" ? part.name.trim() : null,
          material: typeof part.material === "string" ? part.material.trim() : null,
          thickness: Number.isFinite(Number(part.thicknessMm)) ? Number(part.thicknessMm) : null
        });
        getPartDnaBrainService().recordHistory({
          workspaceId,
          partCode: typeof part.partCode === "string" ? part.partCode : null,
          geometryHash: typeof part.geometryHash === "string" ? part.geometryHash : null,
          entityType: "quote",
          entityId: quote.id,
          customerId: customerName || null,
          customerName: quote.customerName?.trim() || null,
          quotedPrice: Number.isFinite(Number(part.unitPrice)) ? Number(part.unitPrice) : null,
          material: typeof part.material === "string" ? part.material.trim() : null,
          thickness: Number.isFinite(Number(part.thicknessMm)) ? Number(part.thicknessMm) : null
        });
      }
    }
  } catch {
    // Quote creation should still succeed if Part DNA history cannot be written.
  }
  res.json({ quote });
});

app.patch("/api/workspaces/:workspaceId/quotes/:quoteId", async (req, res) => {
  const { workspaceId, quoteId } = req.params;
  const ws = getWorkspace(workspaceId);
  const previousQuote = ws.quotes.find((quote) => quote.id === quoteId);
  let updated: QuoteRecord | undefined;
  const quotes = ws.quotes.map((quote) => {
    if (quote.id !== quoteId) return quote;
    updated = {
      ...quote,
      title: typeof req.body?.title === "string" ? req.body.title.trim() : quote.title,
      status: typeof req.body?.status === "string" ? (req.body.status as QuoteRecord["status"]) : quote.status,
      customerName:
        typeof req.body?.customerName === "string" ? req.body.customerName.trim() : quote.customerName,
      companyName:
        typeof req.body?.companyName === "string" ? req.body.companyName.trim() : quote.companyName,
      logoDataUrl: typeof req.body?.logoDataUrl === "string" ? req.body.logoDataUrl : quote.logoDataUrl,
      companyDetails:
        parseCompanyDetails(req.body?.companyDetails) ?? quote.companyDetails,
      customerDetails:
        parseCustomerDetails(req.body?.customerDetails) ?? quote.customerDetails,
      sections: req.body?.sections ?? quote.sections,
      total:
        req.body?.sections
          ? (req.body.sections.laserCutting?.amount ?? 0) +
            (req.body.sections.punching?.amount ?? 0) +
            (req.body.sections.fabrication?.amount ?? 0) +
            (req.body.sections.laserWelding?.amount ?? 0) +
            (req.body.sections.tankManufacturing?.amount ?? 0) +
            (req.body.sections.bending?.amount ?? 0) +
            (req.body.sections.rolling?.amount ?? 0)
          : quote.total
    };
    return updated;
  });
  try {
    if (updated) {
      const quotePdfPath = getQuotePdfPathForCustomer(updated);
      updated.quotePdfPath = quotePdfPath;
      await writeQuotePdf(updated, quotePdfPath, { documentType: "quote" });
    }
  } catch (error) {
    res.status(500).json({
      error: "Failed to update quote files",
      details: error instanceof Error ? error.message : "unknown error"
    });
    return;
  }
  updateWorkspaceQuotes(
    workspaceId,
    quotes.map((quote) => (updated && quote.id === updated.id ? { ...updated } : quote))
  );
  if (updated && updated.status === "accepted" && previousQuote?.status !== "accepted") {
    recordBrainEvent({
      workspaceId,
      eventType: "quote_accepted",
      entityType: "quote",
      entityId: updated.id,
      payload: {
        quoteNumber: updated.quoteNumber,
        title: updated.title,
        customerName: updated.customerName ?? null,
        total: updated.total ?? 0
      }
    });
  }
  res.json({ ok: true });
});

app.get("/api/workspaces/:workspaceId/quotes/:quoteId/pdf", async (req, res) => {
  const { workspaceId, quoteId } = req.params;
  const ws = getWorkspace(workspaceId);
  const quote = ws.quotes.find((entry) => entry.id === quoteId);
  const documentTypeRaw = typeof req.query?.documentType === "string" ? req.query.documentType.trim().toLowerCase() : "";
  const documentType = documentTypeRaw === "invoice" ? "invoice" : "quote";
  if (documentType === "invoice") {
    if (!quote) {
      res.status(404).json({ error: "quote not found" });
      return;
    }
    const invoicePath = getInvoicePdfPathForCustomer(quote);
    try {
      await writeQuotePdf(quote, invoicePath, { documentType: "invoice" });
      if (quote.invoicePdfPath !== invoicePath) {
        updateWorkspaceQuotes(
          workspaceId,
          ws.quotes.map((entry) => (entry.id === quoteId ? { ...entry, invoicePdfPath: invoicePath } : entry))
        );
      }
      if (!fs.existsSync(invoicePath)) {
        res.status(404).json({ error: "invoice pdf not found" });
        return;
      }
      res.sendFile(invoicePath);
      return;
    } catch (error) {
      res.status(500).json({
        error: "Failed to generate invoice pdf",
        details: error instanceof Error ? error.message : "unknown error"
      });
      return;
    }
  }
  if (!quote) {
    res.status(404).json({ error: "quote not found" });
    return;
  }
  const quotePdfPath = getQuotePdfPathForCustomer(quote);
  try {
    await writeQuotePdf(quote, quotePdfPath, { documentType: "quote" });
    if (quote.quotePdfPath !== quotePdfPath) {
      updateWorkspaceQuotes(
        workspaceId,
        ws.quotes.map((entry) => (entry.id === quoteId ? { ...entry, quotePdfPath } : entry))
      );
    }
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate quote pdf",
      details: error instanceof Error ? error.message : "unknown error"
    });
    return;
  }
  if (!fs.existsSync(quotePdfPath)) {
    res.status(404).json({ error: "quote pdf not found" });
    return;
  }
  res.sendFile(quotePdfPath);
});

app.get("/api/workspaces/:workspaceId/quotes/:quoteId/pdf/download", async (req, res) => {
  const { workspaceId, quoteId } = req.params;
  const ws = getWorkspace(workspaceId);
  const quote = ws.quotes.find((entry) => entry.id === quoteId);
  const documentTypeRaw = typeof req.query?.documentType === "string" ? req.query.documentType.trim().toLowerCase() : "";
  const documentType = documentTypeRaw === "invoice" ? "invoice" : "quote";
  if (documentType === "invoice") {
    if (!quote) {
      res.status(404).json({ error: "quote not found" });
      return;
    }
    const invoicePath = getInvoicePdfPathForCustomer(quote);
    try {
      await writeQuotePdf(quote, invoicePath, { documentType: "invoice" });
      if (quote.invoicePdfPath !== invoicePath) {
        updateWorkspaceQuotes(
          workspaceId,
          ws.quotes.map((entry) => (entry.id === quoteId ? { ...entry, invoicePdfPath: invoicePath } : entry))
        );
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=\"${quote.quoteNumber}-Invoice.pdf\"`);
      if (!fs.existsSync(invoicePath)) {
        res.status(404).json({ error: "invoice pdf not found" });
        return;
      }
      res.sendFile(invoicePath);
      return;
    } catch (error) {
      res.status(500).json({
        error: "Failed to generate invoice pdf",
        details: error instanceof Error ? error.message : "unknown error"
      });
      return;
    }
  }
  if (!quote) {
    res.status(404).json({ error: "quote not found" });
    return;
  }
  const quotePdfPath = getQuotePdfPathForCustomer(quote);
  try {
    await writeQuotePdf(quote, quotePdfPath, { documentType: "quote" });
    if (quote.quotePdfPath !== quotePdfPath) {
      updateWorkspaceQuotes(
        workspaceId,
        ws.quotes.map((entry) => (entry.id === quoteId ? { ...entry, quotePdfPath } : entry))
      );
    }
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate quote pdf",
      details: error instanceof Error ? error.message : "unknown error"
    });
    return;
  }
  if (!fs.existsSync(quotePdfPath)) {
    res.status(404).json({ error: "quote pdf not found" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=\"${quote.quoteNumber}.pdf\"`);
  res.sendFile(quotePdfPath);
});

app.get("/api/workspaces/:workspaceId/quotes/:quoteId/dxf", (req, res) => {
  const { workspaceId, quoteId } = req.params;
  const ws = getWorkspace(workspaceId);
  const quote = ws.quotes.find((entry) => entry.id === quoteId);
  if (!quote) {
    res.status(404).json({ error: "quote not found" });
    return;
  }
  const dxfPath = quote.quoteDxfPath ?? path.join(getQuotesRoot(), `${quote.quoteNumber}.dxf`);
  if (!quote.quoteDxfPath || quote.quoteDxfPath !== dxfPath) {
    quote.quoteDxfPath = dxfPath;
    updateWorkspaceQuotes(workspaceId, ws.quotes);
  }
  if (!fs.existsSync(dxfPath)) {
    writeQuoteDxf(quote, dxfPath);
  }
  if (!fs.existsSync(dxfPath)) {
    res.status(404).json({ error: "quote dxf not found" });
    return;
  }
  res.setHeader("Content-Type", "application/dxf");
  res.setHeader("Content-Disposition", `attachment; filename=\"${quote.quoteNumber}.dxf\"`);
  res.sendFile(dxfPath);
});

app.get("/api/workspaces/:workspaceId/customers", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  res.json({ customers: ws.customers });
});

app.post("/api/workspaces/:workspaceId/customers", (req, res) => {
  const { workspaceId } = req.params;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const customer: CustomerRecord = {
    id: `customer-${crypto.randomUUID()}`,
    name,
    email: typeof req.body?.email === "string" ? req.body.email.trim() : undefined,
    phone: typeof req.body?.phone === "string" ? req.body.phone.trim() : undefined,
    address: typeof req.body?.address === "string" ? req.body.address.trim() : undefined,
    notes: typeof req.body?.notes === "string" ? req.body.notes.trim() : undefined,
    createdAt: new Date().toISOString()
  };
  const customers = [customer, ...ws.customers];
  updateWorkspaceCustomers(workspaceId, customers);
  res.json({ customer });
});

app.patch("/api/workspaces/:workspaceId/customers/:customerId", (req, res) => {
  const { workspaceId, customerId } = req.params;
  const ws = getWorkspace(workspaceId);
  const customers = ws.customers.map((customer) => {
    if (customer.id !== customerId) return customer;
    return {
      ...customer,
      name: typeof req.body?.name === "string" ? req.body.name.trim() : customer.name,
      email: typeof req.body?.email === "string" ? req.body.email.trim() : customer.email,
      phone: typeof req.body?.phone === "string" ? req.body.phone.trim() : customer.phone,
      address: typeof req.body?.address === "string" ? req.body.address.trim() : customer.address,
      notes: typeof req.body?.notes === "string" ? req.body.notes.trim() : customer.notes
    };
  });
  updateWorkspaceCustomers(workspaceId, customers);
  res.json({ ok: true });
});

app.post("/api/workspaces/:workspaceId/customers/:customerId/payments", (req, res) => {
  const { workspaceId, customerId } = req.params;
  const amount = typeof req.body?.amount === "number" ? req.body.amount : NaN;
  if (!Number.isFinite(amount)) {
    res.status(400).json({ error: "amount required" });
    return;
  }
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : undefined;
  const ws = getWorkspace(workspaceId);
  const customers = ws.customers.map((customer) => {
    if (customer.id !== customerId) return customer;
    const payments = customer.payments ?? [];
    const payment: PaymentRecord = {
      id: `payment-${crypto.randomUUID()}`,
      amount,
      note,
      createdAt: new Date().toISOString()
    };
    return { ...customer, payments: [payment, ...payments] };
  });
  updateWorkspaceCustomers(workspaceId, customers);
  res.json({ ok: true });
});

app.get("/api/workspaces/:workspaceId/customers/summary", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  const summaries = ws.customers.map((customer) => {
    const jobs = ws.jobs.filter((job) => job.customerName === customer.name);
    const acceptedQuotes = ws.quotes.filter((quote) => quote.customerName === customer.name && quote.status === "accepted");
    const acceptedQuoteNumbers = new Set(acceptedQuotes.map((quote) => quote.quoteNumber));
    const billedFromAcceptedQuotes = acceptedQuotes.reduce((sum, quote) => sum + (quote.total ?? 0), 0);
    const billedFromOtherJobs = jobs
      .filter((job) => !job.quoteNumber || !acceptedQuoteNumbers.has(job.quoteNumber))
      .reduce((sum, job) => sum + (job.price ?? 0), 0);
    const billed = billedFromAcceptedQuotes + billedFromOtherJobs;
    const paid = (customer.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
    return {
      id: customer.id,
      name: customer.name,
      billed,
      paid,
      balance: billed - paid,
      jobCount: jobs.length
    };
  });
  res.json({ customers: summaries });
});

app.get("/api/workspaces/:workspaceId/workers", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  res.json({ workers: ws.workers });
});

app.post("/api/workspaces/:workspaceId/workers", (req, res) => {
  const { workspaceId } = req.params;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const worker: WorkerRecord = {
    id: `worker-${crypto.randomUUID()}`,
    name,
    email: typeof req.body?.email === "string" ? req.body.email.trim() : undefined,
    roleIds: Array.isArray(req.body?.roleIds) ? req.body.roleIds : [],
    active: req.body?.active !== false,
    createdAt: new Date().toISOString()
  };
  const workers = [worker, ...ws.workers];
  updateWorkspaceWorkers(workspaceId, workers);
  res.json({ worker });
});

app.patch("/api/workspaces/:workspaceId/workers/:workerId", (req, res) => {
  const { workspaceId, workerId } = req.params;
  const ws = getWorkspace(workspaceId);
  const workers = ws.workers.map((worker) => {
    if (worker.id !== workerId) return worker;
    return {
      ...worker,
      name: typeof req.body?.name === "string" ? req.body.name.trim() : worker.name,
      email: typeof req.body?.email === "string" ? req.body.email.trim() : worker.email,
      roleIds: Array.isArray(req.body?.roleIds) ? req.body.roleIds : worker.roleIds,
      active: typeof req.body?.active === "boolean" ? req.body.active : worker.active
    };
  });
  updateWorkspaceWorkers(workspaceId, workers);
  res.json({ ok: true });
});

app.get("/api/workspaces/:workspaceId/files", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  res.json({ files: ws.files });
});

app.post("/api/workspaces/:workspaceId/files", (req, res) => {
  const { workspaceId } = req.params;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const file: FileRecord = {
    id: `file-${crypto.randomUUID()}`,
    name,
    path: typeof req.body?.path === "string" ? req.body.path.trim() : undefined,
    size: typeof req.body?.size === "number" ? req.body.size : undefined,
    uploadedBy: typeof req.body?.uploadedBy === "string" ? req.body.uploadedBy.trim() : undefined,
    createdAt: new Date().toISOString()
  };
  const files = [file, ...ws.files];
  updateWorkspaceFiles(workspaceId, files);
  res.json({ file });
});

app.get("/api/workspaces/:workspaceId/sync/status", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  res.json({ syncState: ws.syncState });
});

app.post("/api/workspaces/:workspaceId/sync/local", (req, res) => {
  const { workspaceId } = req.params;
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId : "unknown-device";
  const incoming = Array.isArray(req.body?.files) ? (req.body.files as FileRecord[]) : [];
  const ws = getWorkspace(workspaceId);
  const merged = [...incoming, ...ws.files];
  updateWorkspaceFiles(workspaceId, merged);
  const syncState: SyncState = { lastSyncAt: new Date().toISOString(), lastDeviceId: deviceId };
  updateWorkspaceSyncState(workspaceId, syncState);
  res.json({ ok: true, syncState });
});

app.get("/api/workspaces/:workspaceId/ledger", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  res.json({ ledger: ws.ledger });
});

app.post("/api/workspaces/:workspaceId/ledger", (req, res) => {
  const { workspaceId } = req.params;
  const type = req.body?.type === "expense" ? "expense" : "income";
  const amount = typeof req.body?.amount === "number" ? req.body.amount : NaN;
  if (!Number.isFinite(amount)) {
    res.status(400).json({ error: "amount required" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const entry: LedgerEntry = {
    id: `ledger-${crypto.randomUUID()}`,
    type,
    amount,
    category: typeof req.body?.category === "string" ? req.body.category.trim() : undefined,
    description: typeof req.body?.description === "string" ? req.body.description.trim() : undefined,
    createdAt: new Date().toISOString()
  };
  const ledger = [entry, ...ws.ledger];
  updateWorkspaceLedger(workspaceId, ledger);
  res.json({ entry });
});

app.get("/api/workspaces/:workspaceId/reports/summary", (req, res) => {
  const { workspaceId } = req.params;
  const ws = getWorkspace(workspaceId);
  const income = ws.ledger.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const expense = ws.ledger.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
  const profit = income - expense;
  res.json({ income, expense, profit });
});

app.get("/api/billing/status", (req: AuthedRequest, res) => {
  const workspaceId = req.query.workspaceId;
  const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId.trim() : "";
  const deviceName = typeof req.query.deviceName === "string" ? req.query.deviceName.trim() : os.hostname();
  if (typeof workspaceId !== "string") {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const ws = getWorkspace(workspaceId);
  const fallback = () => {
    const snapshot = getWorkspaceSubscriptionSnapshot(ws, req.userId);
    const hasBillingAccess = workspaceHasBillingAccess(ws, req.userId);
    res.json({
      status: snapshot?.status ?? getWorkspaceBillingStatus(ws, req.userId),
      currentPeriodEnd: getEffectiveBillingPeriodEnd(ws),
      hasAccess: hasBillingAccess,
      limitedAccess: hasBillingAccess ? false : (snapshot?.limitedAccess ?? false),
      graceUntil: snapshot?.company.graceUntil ?? null,
      paymentReference: snapshot?.company.manualPaymentReference ?? null,
      companyId: snapshot?.company.id ?? ws.id
    });
  };
  if (!deviceId) {
    fallback();
    return;
  }
  void syncLocalSubscriptionSnapshot({
    workspaceId,
    deviceId,
    deviceName,
    platform: normalizeCloudPlatform(req.query.platform ?? process.platform)
  }).then((snapshot) => {
    const company = (snapshot as { company?: Record<string, unknown> | null }).company;
    const hasBillingAccess = workspaceHasBillingAccess(ws, req.userId);
    res.json({
      status: (snapshot as { status?: string }).status ?? "pending",
      currentPeriodEnd: toUnixSeconds(typeof company?.subscriptionEndDate === "string" ? company.subscriptionEndDate : null),
      hasAccess: hasBillingAccess,
      limitedAccess: hasBillingAccess ? false : Boolean((snapshot as { limitedAccess?: boolean }).limitedAccess),
      graceUntil: typeof company?.graceUntil === "string" ? company.graceUntil : null,
      paymentReference: typeof company?.manualPaymentReference === "string" ? company.manualPaymentReference : null,
      companyId: typeof company?.id === "string" ? company.id : ws.id
    });
  }).catch(() => {
    fallback();
  });
});

app.get("/api/billing/company", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId.trim() : "";
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const role = getManualSubscriptionRoleForUser(req.userId as string, workspaceId);
  if (!canCompanyViewBilling(role)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const snapshot = getWorkspaceSubscriptionSnapshot(ws, req.userId);
  const companyId = snapshot?.company.id ?? ws.id;
  const payments = getManualSubscriptionDb().listManualPayments(companyId).slice(0, 25);
  const devices = getCloudSubscriptionDb().listDevices(companyId);
  res.json({
    company: snapshot?.company ?? null,
    status: snapshot?.status ?? null,
    hasAccess: Boolean(snapshot?.hasAccess) && !snapshot?.limitedAccess,
    limitedAccess: snapshot?.limitedAccess ?? false,
    currentPeriodEnd: toUnixSeconds(snapshot?.company.subscriptionEndDate ?? null),
    graceUntil: snapshot?.company.graceUntil ?? null,
    paymentReference: snapshot?.company.manualPaymentReference ?? null,
    role,
    payments,
    devices
  });
});

app.post("/api/billing/device-heartbeat", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
  const deviceName = typeof req.body?.deviceName === "string" ? req.body.deviceName.trim() : deviceId;
  if (!workspaceId || !deviceId) {
    res.status(400).json({ error: "workspaceId and deviceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const company = getWorkspaceSubscriptionCompany(ws, req.userId);
  void sendCloudHeartbeat({
    companyId: company.id,
    deviceId,
    deviceName,
    platform: normalizeCloudPlatform(req.body?.platform ?? process.platform),
    appVersion: typeof req.body?.appVersion === "string" ? req.body.appVersion.trim() : APP_VERSION
  }).catch(() => null);
  getManualSubscriptionDb().markDeviceSeen({
    companyId: company.id,
    deviceId,
    deviceName,
    isAllowed: true
  });
  res.json({ ok: true, companyId: company.id });
});

app.post("/api/billing/payment-proof", authRequired, storageUpload.single("proof"), (req: AuthedRequest, res) => {
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!hasMembership(req.userId as string, workspaceId)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const role = getManualSubscriptionRoleForUser(req.userId as string, workspaceId);
  if (!canCompanyViewBilling(role)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const ws = getWorkspace(workspaceId);
  const snapshot = getWorkspaceSubscriptionSnapshot(ws, req.userId);
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: "amount required" });
    return;
  }
  let proofFilePath: string | null = null;
  if (req.file) {
    const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);
    if (!allowedTypes.has(req.file.mimetype)) {
      res.status(400).json({ error: "Proof must be PDF, PNG, or JPG." });
      return;
    }
    const proofDir = ensureManualProofDirectory(getManualSubscriptionModuleRoot(), workspaceId);
    const safeName = sanitizeName(req.file.originalname || "proof") || "proof";
    const fileName = `${Date.now()}-${safeName}`;
    proofFilePath = path.join(proofDir, fileName);
    fs.writeFileSync(proofFilePath, req.file.buffer);
  }
  const payment = getManualSubscriptionDb().createManualPayment({
    companyId: workspaceId,
    paymentReference: snapshot?.company.manualPaymentReference ?? "",
    amount,
    paymentDate: typeof req.body?.paymentDate === "string" ? req.body.paymentDate : new Date().toISOString(),
    paymentMethod: typeof req.body?.paymentMethod === "string" ? req.body.paymentMethod : "eft",
    proofFilePath,
    notes: typeof req.body?.notes === "string" ? req.body.notes : null
  });
  void getCloudSyncDb().pushEvent({
    eventType: "payment_proof_uploaded",
    payload: {
      companyId: workspaceId,
      paymentId: payment?.id ?? null,
      paymentReference: payment?.paymentReference ?? snapshot?.company.manualPaymentReference ?? null,
      amount
    }
  });
  res.status(201).json({ ok: true, payment });
});

app.get("/api/billing/admin/dashboard", authRequired, (req: AuthedRequest, res) => {
  if (!isAppOwner(req.userId)) {
    res.status(403).json({ error: "main admin required" });
    return;
  }
  const cloud = getCloudSubscriptionDb().getAdminDashboard();
  const manual = getManualSubscriptionDb().getAdminDashboard();
  res.json({
    dashboard: {
      companies: manual.companies,
      activeAccounts: manual.activeAccounts,
      expiredAccounts: manual.expiredAccounts,
      expiringSoon: manual.expiringSoon,
      suspendedAccounts: manual.suspendedAccounts,
      pendingPaymentProofs: manual.pendingPaymentProofs,
      devices: cloud.devices
    },
    pendingRequests: cloud.pendingAccountRequests,
    notifications: getCloudSubscriptionDb().getNotifications()
  });
});

app.get("/api/billing/admin/companies/:companyId/payments", authRequired, (req: AuthedRequest, res) => {
  if (!isAppOwner(req.userId)) {
    res.status(403).json({ error: "main admin required" });
    return;
  }
  const companyId = req.params.companyId;
  res.json({
    payments: getManualSubscriptionDb().listManualPayments(companyId),
    auditLog: getManualSubscriptionDb().listAuditLog(companyId),
    company: getManualSubscriptionDb().getCompany(companyId)
  });
});

app.post("/api/billing/admin/companies/:companyId/renew", authRequired, (req: AuthedRequest, res) => {
  const companyId = req.params.companyId;
  const role: ManualSubscriptionRole = getSubscriptionRole({
    isMainAdmin: isAppOwner(req.userId),
    membershipRole: null
  });
  if (!canManageManualSubscriptions(role)) {
    res.status(403).json({ error: "main admin required" });
    return;
  }
  const monthsRaw = Number(req.body?.months);
  const months = Number.isFinite(monthsRaw) && monthsRaw > 0 ? Math.min(12, Math.floor(monthsRaw)) : 1;
  const snapshot = getManualSubscriptionDb().renewCompany(
    companyId,
    months,
    typeof req.body?.adminNote === "string" ? req.body.adminNote : null
  );
  if (!snapshot) {
    res.status(404).json({ error: "company not found" });
    return;
  }
  syncWorkspaceMemberBillingAccess(snapshot.company.id, { active: true, paidUntil: snapshot.company.subscriptionEndDate });
  void getCloudSyncDb().pushEvent({
    eventType: "subscription_renewed",
    payload: {
      companyId,
      months,
      status: snapshot.company.subscriptionStatus,
      subscriptionEndDate: snapshot.company.subscriptionEndDate
    }
  });
  res.json({ ok: true, company: snapshot.company });
});

app.post("/api/billing/admin/companies/:companyId/status", authRequired, (req: AuthedRequest, res) => {
  if (!isAppOwner(req.userId)) {
    res.status(403).json({ error: "main admin required" });
    return;
  }
  const companyId = req.params.companyId;
  const nextStatus = typeof req.body?.status === "string" ? req.body.status.trim().toLowerCase() : "";
  if (!["active", "expired", "suspended", "cancelled", "trial", "pending"].includes(nextStatus)) {
    res.status(400).json({ error: "invalid status" });
    return;
  }
  const snapshot = getManualSubscriptionDb().updateCompanyStatus(
    companyId,
    nextStatus as ManualSubscriptionStatus,
    typeof req.body?.adminNote === "string" ? req.body.adminNote : null
  );
  if (!snapshot) {
    res.status(404).json({ error: "company not found" });
    return;
  }
  syncWorkspaceMemberBillingAccess(snapshot.company.id, {
    active: nextStatus === "active" || nextStatus === "trial",
    paidUntil: snapshot.company.subscriptionEndDate
  });
  const eventType: CloudEventType =
    nextStatus === "suspended"
      ? "account_suspended"
      : nextStatus === "expired"
        ? "subscription_expired"
        : "subscription_renewed";
  void getCloudSyncDb().pushEvent({
    eventType,
    payload: {
      companyId,
      status: snapshot.company.subscriptionStatus,
      subscriptionEndDate: snapshot.company.subscriptionEndDate
    }
  });
  res.json({ ok: true, company: snapshot.company });
});

app.patch("/api/billing/admin/companies/:companyId/note", authRequired, (req: AuthedRequest, res) => {
  if (!isAppOwner(req.userId)) {
    res.status(403).json({ error: "main admin required" });
    return;
  }
  const company = getManualSubscriptionDb().updateCompanyNote(
    req.params.companyId,
    typeof req.body?.note === "string" ? req.body.note : null
  );
  if (!company) {
    res.status(404).json({ error: "company not found" });
    return;
  }
  res.json({ ok: true, company });
});

app.post("/api/billing/admin/payments/:paymentId/confirm", authRequired, (req: AuthedRequest, res) => {
  if (!isAppOwner(req.userId)) {
    res.status(403).json({ error: "main admin required" });
    return;
  }
  const paymentId = Number(req.params.paymentId);
  if (!Number.isFinite(paymentId)) {
    res.status(400).json({ error: "invalid payment id" });
    return;
  }
  const payment = getManualSubscriptionDb().confirmManualPayment(
    paymentId,
    typeof req.body?.adminNote === "string" ? req.body.adminNote : null
  );
  if (!payment) {
    res.status(404).json({ error: "payment not found" });
    return;
  }
  void getCloudSyncDb().pushEvent({
    eventType: "payment_confirmed",
    payload: {
      companyId: payment.companyId,
      paymentId: payment.id,
      paymentReference: payment.paymentReference,
      amount: payment.amount
    }
  });
  res.json({ ok: true, payment });
});

app.post("/api/billing/checkout", async (req: AuthedRequest, res) => {
  try {
    const { workspaceId, customerEmail, successUrl, cancelUrl } = req.body as {
      workspaceId?: string;
      customerEmail?: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    if (!hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
      res.status(500).json({ error: "Stripe not configured" });
      return;
    }

    const ws = getWorkspace(workspaceId);
    const session = await createStripeCheckoutSession({
      workspace: ws,
      customerEmail,
      successUrl,
      cancelUrl
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Billing checkout failed:", error);
    res.status(500).json({ error: "billing checkout failed" });
  }
});

app.post("/api/billing/prelogin-checkout", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const customerEmail = typeof req.body?.customerEmail === "string" ? req.body.customerEmail.trim() : email;
    const successUrl = typeof req.body?.successUrl === "string" ? req.body.successUrl : undefined;
    const cancelUrl = typeof req.body?.cancelUrl === "string" ? req.body.cancelUrl : undefined;

    if (!email || !password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
      res.status(500).json({ error: "Stripe not configured" });
      return;
    }

    const user = getLocalBillingUser(email, password);
    if (!user) {
      res.status(401).json({ error: "invalid credentials" });
      return;
    }

    const workspace = getUserBillingWorkspace(user.id);
    if (!workspace) {
      res.status(404).json({ error: "workspace not found" });
      return;
    }

    const session = await createStripeCheckoutSession({
      workspace,
      customerEmail,
      successUrl,
      cancelUrl
    });
    res.json({ url: session.url, workspaceId: workspace.id });
  } catch (error) {
    console.error("Prelogin billing checkout failed:", error);
    res.status(500).json({ error: "billing checkout failed" });
  }
});

app.post("/api/billing/portal", async (req: AuthedRequest, res) => {
  try {
    const { workspaceId, returnUrl } = req.body as {
      workspaceId?: string;
      returnUrl?: string;
    };

    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    if (!hasMembership(req.userId as string, workspaceId)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const ws = getWorkspace(workspaceId);
    if (!ws.stripeCustomerId) {
      res.status(400).json({ error: "No Stripe customer on file" });
      return;
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: ws.stripeCustomerId,
      return_url: returnUrl ?? CLIENT_ORIGIN
    });

    res.json({ url: portal.url });
  } catch (error) {
    console.error("Billing portal failed:", error);
    res.status(500).json({ error: "billing portal failed" });
  }
});

app.post("/api/billing/prelogin-portal", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const returnUrl = typeof req.body?.returnUrl === "string" ? req.body.returnUrl : undefined;

    if (!email || !password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }

    const user = getLocalBillingUser(email, password);
    if (!user) {
      res.status(401).json({ error: "invalid credentials" });
      return;
    }

    const workspace = getUserBillingWorkspace(user.id);
    if (!workspace) {
      res.status(404).json({ error: "workspace not found" });
      return;
    }
    if (!workspace.stripeCustomerId) {
      res.status(400).json({ error: "No Stripe customer on file. Start checkout first." });
      return;
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: returnUrl ?? CLIENT_ORIGIN
    });

    res.json({ url: portal.url, workspaceId: workspace.id });
  } catch (error) {
    console.error("Prelogin billing portal failed:", error);
    res.status(500).json({ error: "billing portal failed" });
  }
});

app.post("/api/billing/manual-payment", authRequired, (req: AuthedRequest, res) => {
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId : "";
  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  const role = getMembershipRole(req.userId as string, workspaceId);
  if (!isAppOwner(req.userId) && role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "owner or admin required" });
    return;
  }

  const daysRaw = Number(req.body?.days);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(365, Math.floor(daysRaw)) : 30;
  const ws = getWorkspace(workspaceId);
  const base = Math.max(nowUnixSeconds(), ws.manualBillingPaidUntil ?? 0, ws.currentPeriodEnd ?? 0);
  ws.manualBillingPaidUntil = base + days * 24 * 60 * 60;
  ws.lastBillingPaymentAt = new Date().toISOString();
  upsertWorkspace(ws);

  res.json({
    status: getWorkspaceBillingStatus(ws, req.userId),
    currentPeriodEnd: getEffectiveBillingPeriodEnd(ws),
    hasAccess: workspaceHasBillingAccess(ws, req.userId)
  });
});

app.get("/api/support/threads", authRequired, (req: AuthedRequest, res) => {
  const requestedWorkspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
  const requesterId = req.userId as string;
  const owner = isAppOwner(requesterId);

  if (!owner && !requestedWorkspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!owner && !hasMembership(requesterId, requestedWorkspaceId)) {
    res.status(403).json({ error: "workspace access required" });
    return;
  }

  const workspaces = owner ? getAllWorkspaces() : [getWorkspace(requestedWorkspaceId)];
  const threads = workspaces.flatMap((workspace) => {
    const messages = getSupportMessages(workspace).filter((message) =>
      owner ? true : message.userId === requesterId
    );
    const grouped = new Map<string, SupportMessageRecord[]>();
    for (const message of messages) {
      if (!grouped.has(message.userId)) grouped.set(message.userId, []);
      grouped.get(message.userId)!.push(message);
    }
    return Array.from(grouped.entries()).map(([userId, threadMessages]) =>
      mapSupportThread(workspace, userId, threadMessages)
    );
  });

  threads.sort((left, right) => {
    const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
    const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
    return rightTime - leftTime;
  });
  res.json({ threads });
});

app.post("/api/support/messages", authRequired, (req: AuthedRequest, res) => {
  const requesterId = req.userId as string;
  const requester = getUserById(requesterId);
  const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId : "";
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const owner = isAppOwner(requesterId);
  const targetUserId = owner && typeof req.body?.threadUserId === "string" ? req.body.threadUserId : requesterId;

  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId required" });
    return;
  }
  if (!text) {
    res.status(400).json({ error: "message required" });
    return;
  }
  if (!owner && !hasMembership(requesterId, workspaceId)) {
    res.status(403).json({ error: "workspace access required" });
    return;
  }
  if (owner && !targetUserId) {
    res.status(400).json({ error: "threadUserId required" });
    return;
  }

  const workspace = getWorkspace(workspaceId);
  const targetUser = getUserById(targetUserId);
  const message: SupportMessageRecord = {
    id: `support-${crypto.randomUUID()}`,
    workspaceId,
    userId: targetUserId,
    userEmail: targetUser?.email ?? requester?.email ?? "unknown",
    userName: targetUser?.name ?? requester?.name,
    text,
    fromOwner: owner,
    createdAt: new Date().toISOString()
  };
  saveSupportMessages(workspaceId, [...getSupportMessages(workspace), message]);
  io.emit("support:message", { workspaceId, userId: targetUserId, message });
  res.json({ message });
});

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!err) {
    next();
    return;
  }
  const payload = err as { type?: string; status?: number; message?: string };
  if (payload.type === "entity.too.large" || payload.status === 413) {
    res.status(413).json({ error: "Upload too large", details: "Please use a smaller logo image." });
    return;
  }
  if (payload.status && payload.status >= 400 && payload.status < 500) {
    res.status(payload.status).json({ error: payload.message ?? "Request error" });
    return;
  }
  console.error("API error", err);
  res.status(500).json({ error: "server error" });
});

const server = http.createServer(app);
server.requestTimeout = REQUEST_TIMEOUT_MS;
server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
server.headersTimeout = HEADERS_TIMEOUT_MS;
server.maxHeadersCount = 2000;
const io = new Server(server, {
  cors: { origin: corsOriginMatcher }
});

type ChatMsg = { roomId: string; text: string; user: string };

io.on("connection", (socket) => {
  socket.on("join", (roomId: string) => {
    socket.join(roomId);
    socket.emit("system", `Joined #${roomId}`);
  });

  socket.on("message", (msg: ChatMsg) => {
    io.to(msg.roomId).emit("message", msg);
  });
});

function runScheduledBrainSync(kind: "hourly" | "daily") {
  for (const workspace of getAllWorkspaces()) {
    try {
      const context = buildBrainRunContext(workspace.id);
      const orchestrator = getQouterXBrainOrchestrator();
      if (kind === "daily") {
        orchestrator.run({
          workspaceId: workspace.id,
          mode: "module-specific",
          modules: ["materials", "purchasing"],
          jobs: context.queueSnapshot.jobs,
          quotes: context.ws.quotes,
          stockSnapshot: context.stockSnapshot,
          services: context.services,
          nestingParts: context.nestingParts
        });
      } else {
        orchestrator.run({
          workspaceId: workspace.id,
          mode: "quick",
          jobs: context.queueSnapshot.jobs,
          quotes: context.ws.quotes,
          stockSnapshot: context.stockSnapshot,
          services: context.services,
          nestingParts: context.nestingParts
        });
      }
    } catch (error) {
      console.error(`[brain-orchestrator] ${kind} sync failed for workspace ${workspace.id}:`, error instanceof Error ? error.message : error);
    }
  }
}

function setupBrainSchedulers() {
  if (eventBrainSchedulerSingleton) return;
  eventBrainSchedulerSingleton = new BrainScheduler();
  eventBrainSchedulerSingleton.schedule("process-pending-events", 60 * 1000, async () => {
    await getEventBrainOrchestrator().processPendingEvents(50);
  });
  eventBrainSchedulerSingleton.schedule("cloud-sync-events", 5 * 60 * 1000, async () => {
    if (!getCloudSyncDb().getSettings().enabled) return;
    for (const workspace of getAllWorkspaces()) {
      recordBrainEvent({
        workspaceId: workspace.id,
        eventType: "subscription_updated",
        entityType: "workspace",
        entityId: workspace.id,
        payload: { scheduler: "cloud-sync-events" }
      });
    }
  });
  eventBrainSchedulerSingleton.schedule("hourly-queue-lead-time", 60 * 60 * 1000, async () => {
    runScheduledBrainSync("hourly");
  });
  eventBrainSchedulerSingleton.schedule("daily-material-purchasing", 24 * 60 * 60 * 1000, async () => {
    runScheduledBrainSync("daily");
  });
}

backfillStartLinks();
setupFileActivityWatcher();
setupBrainSchedulers();

server.on("error", (error) => {
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`API port ${PORT} is already in use. Another Qouter X API process is already running; not starting a duplicate server.`);
    process.exit(0);
  }
  console.error("HTTP server error:", error);
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down API server...`);
  io.close();
  server.close((error) => {
    if (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
      return;
    }
    process.exit(0);
  });
  setTimeout(() => {
    console.error("Forcing shutdown after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

server.listen(PORT, HOST, () => {
  if (API_PUBLIC_URL.includes("localhost") || API_PUBLIC_URL.includes("127.0.0.1")) {
    console.warn(`API_PUBLIC_URL is local (${API_PUBLIC_URL}). Set API_PUBLIC_URL for cross-device START_JOB links.`);
  }
  console.log(`API listening on ${HOST}:${PORT}`);
});
