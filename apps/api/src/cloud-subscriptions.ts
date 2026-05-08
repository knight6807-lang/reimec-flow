import path from "node:path";
import crypto from "node:crypto";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";

export type CloudSubscriptionStatus = "pending" | "trial" | "active" | "expired" | "suspended" | "cancelled";
export type CloudDevicePlatform = "macos" | "windows" | "linux" | "unknown";
export type AccountRequestStatus = "pending" | "approved" | "rejected";

export type CloudCompanyRecord = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  manualPaymentReference: string;
  subscriptionStatus: CloudSubscriptionStatus;
  planName: string;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  graceUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CloudDeviceRecord = {
  id: number;
  companyId: string;
  deviceId: string;
  deviceName: string;
  platform: CloudDevicePlatform;
  appVersion: string;
  isAllowed: boolean;
  lastSeenAt: string;
  createdAt: string;
};

export type AccountRequestRecord = {
  id: number;
  companyId: string | null;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  deviceId: string;
  deviceName: string;
  platform: CloudDevicePlatform;
  status: AccountRequestStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type CloudSubscriptionAuditLogRecord = {
  id: number;
  companyId: string;
  action: string;
  oldStatus: string | null;
  newStatus: string | null;
  oldEndDate: string | null;
  newEndDate: string | null;
  adminNote: string | null;
  createdAt: string;
};

export type CloudSubscriptionSnapshot = {
  company: CloudCompanyRecord | null;
  device: CloudDeviceRecord | null;
  status: CloudSubscriptionStatus;
  hasAccess: boolean;
  limitedAccess: boolean;
  daysRemaining: number;
  daysExpired: number;
  paymentReference: string | null;
  lastConnectedAt: string | null;
};

export type AdminDashboardCompanyRow = CloudCompanyRecord & {
  contactEmail: string;
  lastConnectedAt: string | null;
  daysRemaining: number;
  daysExpired: number;
  connectedDeviceCount: number;
  isAllowed: boolean;
};

function asNullableTrimmedString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asIsoOrNull(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeCompanyCode(input: string) {
  const compact = input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
  const firstWord = compact[0]?.slice(0, 6) ?? "";
  const fallback = compact.join("").slice(0, 6);
  const initials = compact.slice(0, 3).map((part) => part[0]).join("");
  return (firstWord || fallback || initials || "QXCO").slice(0, 8);
}

function normalizeStatus(value: unknown): CloudSubscriptionStatus {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["pending", "trial", "active", "expired", "suspended", "cancelled"].includes(candidate)
    ? (candidate as CloudSubscriptionStatus)
    : "pending";
}

function normalizePlatform(value: unknown): CloudDevicePlatform {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["macos", "windows", "linux"].includes(candidate) ? (candidate as CloudDevicePlatform) : "unknown";
}

function normalizeRequestStatus(value: unknown): AccountRequestStatus {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["pending", "approved", "rejected"].includes(candidate) ? (candidate as AccountRequestStatus) : "pending";
}

function addDaysIso(baseDate: Date, days: number) {
  const next = new Date(baseDate.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function addMonthsIso(baseDate: Date, months: number) {
  const next = new Date(baseDate.getTime());
  next.setUTCMonth(next.getUTCMonth() + Math.max(1, months));
  return next.toISOString();
}

function daysBetween(targetIso: string | null, from = new Date()) {
  if (!targetIso) return 0;
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.ceil((target.getTime() - from.getTime()) / 86_400_000);
}

export class CloudSubscriptionService {
  constructor(private readonly db: DatabaseSync) {}

  private rowToCompany(row: Record<string, unknown>): CloudCompanyRecord {
    return {
      id: String(row.id ?? ""),
      companyName: String(row.companyName ?? ""),
      contactName: String(row.contactName ?? ""),
      email: String(row.email ?? ""),
      phone: String(row.phone ?? ""),
      manualPaymentReference: String(row.manualPaymentReference ?? ""),
      subscriptionStatus: normalizeStatus(row.subscriptionStatus),
      planName: String(row.planName ?? "Monthly"),
      subscriptionStartDate: asIsoOrNull(row.subscriptionStartDate),
      subscriptionEndDate: asIsoOrNull(row.subscriptionEndDate),
      graceUntil: asIsoOrNull(row.graceUntil),
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? "")
    };
  }

  private rowToDevice(row: Record<string, unknown>): CloudDeviceRecord {
    return {
      id: Number(row.id ?? 0),
      companyId: String(row.companyId ?? ""),
      deviceId: String(row.deviceId ?? ""),
      deviceName: String(row.deviceName ?? ""),
      platform: normalizePlatform(row.platform),
      appVersion: String(row.appVersion ?? ""),
      isAllowed: Boolean(row.isAllowed),
      lastSeenAt: String(row.lastSeenAt ?? ""),
      createdAt: String(row.createdAt ?? "")
    };
  }

  private rowToAccountRequest(row: Record<string, unknown>): AccountRequestRecord {
    return {
      id: Number(row.id ?? 0),
      companyId: asNullableTrimmedString(row.companyId),
      companyName: String(row.companyName ?? ""),
      contactName: String(row.contactName ?? ""),
      email: String(row.email ?? ""),
      phone: String(row.phone ?? ""),
      deviceId: String(row.deviceId ?? ""),
      deviceName: String(row.deviceName ?? ""),
      platform: normalizePlatform(row.platform),
      status: normalizeRequestStatus(row.status),
      createdAt: String(row.createdAt ?? ""),
      reviewedAt: asIsoOrNull(row.reviewedAt),
      reviewedBy: asNullableTrimmedString(row.reviewedBy)
    };
  }

  private nextPaymentReference(companyName: string) {
    const year = new Date().getFullYear();
    const seqRow = this.db.prepare(`SELECT COUNT(*) as total FROM companies`).get() as { total?: number } | undefined;
    const seq = Math.max(1, Number(seqRow?.total ?? 0) + 1);
    return `QX-${normalizeCompanyCode(companyName)}-${year}-${String(seq).padStart(4, "0")}`;
  }

  private logAudit(
    companyId: string,
    action: string,
    oldStatus: string | null,
    newStatus: string | null,
    oldEndDate: string | null,
    newEndDate: string | null,
    adminNote?: string | null
  ) {
    this.db
      .prepare(
        `INSERT INTO subscription_audit_log
         (companyId, action, oldStatus, newStatus, oldEndDate, newEndDate, adminNote, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(companyId, action, oldStatus, newStatus, oldEndDate, newEndDate, adminNote ?? null, new Date().toISOString());
  }

  private ensureCompanyFromRequest(input: {
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
  }) {
    const existingByEmail = this.db
      .prepare(`SELECT * FROM companies WHERE lower(email) = lower(?) LIMIT 1`)
      .get(input.email.trim()) as Record<string, unknown> | undefined;
    if (existingByEmail) return this.rowToCompany(existingByEmail);
    const now = new Date().toISOString();
    const company: CloudCompanyRecord = {
      id: `company-${crypto.randomUUID()}`,
      companyName: input.companyName.trim() || "Qouter X Company",
      contactName: input.contactName.trim() || input.companyName.trim() || "",
      email: input.email.trim(),
      phone: input.phone.trim(),
      manualPaymentReference: this.nextPaymentReference(input.companyName),
      subscriptionStatus: "pending",
      planName: "Monthly",
      subscriptionStartDate: null,
      subscriptionEndDate: null,
      graceUntil: null,
      createdAt: now,
      updatedAt: now
    };
    this.db
      .prepare(
        `INSERT INTO companies
         (id, companyName, contactName, email, phone, manualPaymentReference, subscriptionStatus, planName,
          subscriptionStartDate, subscriptionEndDate, graceUntil, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        company.id,
        company.companyName,
        company.contactName,
        company.email,
        company.phone,
        company.manualPaymentReference,
        company.subscriptionStatus,
        company.planName,
        company.subscriptionStartDate,
        company.subscriptionEndDate,
        company.graceUntil,
        company.createdAt,
        company.updatedAt
      );
    this.logAudit(company.id, "account_request_created", null, "pending", null, null, null);
    return company;
  }

  getCompany(companyId: string) {
    const row = this.db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId) as Record<string, unknown> | undefined;
    return row ? this.rowToCompany(row) : null;
  }

  listCompanies() {
    const rows = this.db.prepare(`SELECT * FROM companies ORDER BY companyName COLLATE NOCASE ASC`).all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToCompany(row));
  }

  listDevices(companyId?: string) {
    const rows = companyId
      ? this.db.prepare(`SELECT * FROM devices WHERE companyId = ? ORDER BY lastSeenAt DESC`).all(companyId)
      : this.db.prepare(`SELECT * FROM devices ORDER BY lastSeenAt DESC`).all();
    return (rows as Record<string, unknown>[]).map((row) => this.rowToDevice(row));
  }

  listAccountRequests(status?: AccountRequestStatus) {
    const rows = status
      ? this.db.prepare(`SELECT * FROM account_requests WHERE status = ? ORDER BY createdAt DESC`).all(status)
      : this.db.prepare(`SELECT * FROM account_requests ORDER BY createdAt DESC`).all();
    return (rows as Record<string, unknown>[]).map((row) => this.rowToAccountRequest(row));
  }

  createAccountRequest(input: {
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    deviceId: string;
    deviceName: string;
    platform: CloudDevicePlatform;
  }) {
    const company = this.ensureCompanyFromRequest(input);
    const existingPending = this.db
      .prepare(`SELECT * FROM account_requests WHERE deviceId = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`)
      .get(input.deviceId) as Record<string, unknown> | undefined;
    if (existingPending) {
      return {
        request: this.rowToAccountRequest(existingPending),
        company
      };
    }
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO account_requests
         (companyId, companyName, contactName, email, phone, deviceId, deviceName, platform, status, createdAt, reviewedAt, reviewedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL)`
      )
      .run(
        company.id,
        input.companyName.trim(),
        input.contactName.trim(),
        input.email.trim(),
        input.phone.trim(),
        input.deviceId.trim(),
        input.deviceName.trim(),
        input.platform,
        createdAt
      );
    this.registerDevice({
      companyId: company.id,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      platform: input.platform,
      appVersion: "",
      isAllowed: false
    });
    const request = this.db.prepare(`SELECT * FROM account_requests WHERE id = ?`).get(Number(result.lastInsertRowid)) as Record<string, unknown>;
    return { request: this.rowToAccountRequest(request), company };
  }

  registerDevice(input: {
    companyId: string;
    deviceId: string;
    deviceName: string;
    platform: CloudDevicePlatform;
    appVersion: string;
    isAllowed?: boolean;
  }) {
    const now = new Date().toISOString();
    const company = this.getCompany(input.companyId);
    const allowed = input.isAllowed ?? Boolean(company && (company.subscriptionStatus === "active" || company.subscriptionStatus === "trial"));
    this.db
      .prepare(
        `INSERT INTO devices (companyId, deviceId, deviceName, platform, appVersion, isAllowed, lastSeenAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(deviceId) DO UPDATE SET
           companyId = excluded.companyId,
           deviceName = excluded.deviceName,
           platform = excluded.platform,
           appVersion = excluded.appVersion,
           isAllowed = excluded.isAllowed,
           lastSeenAt = excluded.lastSeenAt`
      )
      .run(input.companyId, input.deviceId, input.deviceName, input.platform, input.appVersion, allowed ? 1 : 0, now, now);
    return this.db.prepare(`SELECT * FROM devices WHERE deviceId = ?`).get(input.deviceId) as Record<string, unknown>;
  }

  heartbeat(input: {
    deviceId: string;
    deviceName?: string;
    companyId?: string | null;
    platform?: CloudDevicePlatform;
    appVersion?: string;
  }) {
    const existing = this.db.prepare(`SELECT * FROM devices WHERE deviceId = ?`).get(input.deviceId) as Record<string, unknown> | undefined;
    if (!existing) {
      if (!input.companyId) return null;
      const inserted = this.registerDevice({
        companyId: input.companyId,
        deviceId: input.deviceId,
        deviceName: input.deviceName?.trim() || input.deviceId,
        platform: input.platform ?? "unknown",
        appVersion: input.appVersion?.trim() || "",
        isAllowed: false
      });
      return this.rowToDevice(inserted);
    }
    const row = this.rowToDevice(existing);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE devices
         SET deviceName = ?, platform = ?, appVersion = ?, companyId = COALESCE(?, companyId), lastSeenAt = ?
         WHERE deviceId = ?`
      )
      .run(
        input.deviceName?.trim() || row.deviceName,
        input.platform ?? row.platform,
        input.appVersion?.trim() || row.appVersion,
        input.companyId ?? null,
        now,
        input.deviceId
      );
    return this.getDevice(input.deviceId);
  }

  getDevice(deviceId: string) {
    const row = this.db.prepare(`SELECT * FROM devices WHERE deviceId = ?`).get(deviceId) as Record<string, unknown> | undefined;
    return row ? this.rowToDevice(row) : null;
  }

  getSubscriptionStatusByDevice(deviceId: string): CloudSubscriptionSnapshot {
    const device = this.getDevice(deviceId);
    const company = device ? this.getCompany(device.companyId) : null;
    if (!company) {
      return {
        company: null,
        device,
        status: "pending",
        hasAccess: false,
        limitedAccess: false,
        daysRemaining: 0,
        daysExpired: 0,
        paymentReference: null,
        lastConnectedAt: device?.lastSeenAt ?? null
      };
    }
    const now = new Date();
    let status = company.subscriptionStatus;
    let hasAccess = false;
    let limitedAccess = false;
    if (status === "active" || status === "trial") {
      if (!company.subscriptionEndDate || new Date(company.subscriptionEndDate).getTime() >= now.getTime()) {
        hasAccess = true;
      } else if (company.graceUntil && new Date(company.graceUntil).getTime() >= now.getTime()) {
        status = "expired";
        hasAccess = true;
        limitedAccess = true;
      } else {
        status = "expired";
      }
    } else if (status === "expired") {
      limitedAccess = Boolean(company.graceUntil && new Date(company.graceUntil).getTime() >= now.getTime());
      hasAccess = limitedAccess;
    }
    return {
      company,
      device,
      status,
      hasAccess,
      limitedAccess,
      daysRemaining: Math.max(0, daysBetween(company.subscriptionEndDate, now)),
      daysExpired:
        company.subscriptionEndDate && new Date(company.subscriptionEndDate).getTime() < now.getTime()
          ? Math.abs(Math.min(0, daysBetween(company.subscriptionEndDate, now)))
          : 0,
      paymentReference: company.manualPaymentReference,
      lastConnectedAt: device?.lastSeenAt ?? null
    };
  }

  approveAccountRequest(requestId: number, reviewedBy: string, months = 1) {
    const requestRow = this.db.prepare(`SELECT * FROM account_requests WHERE id = ?`).get(requestId) as Record<string, unknown> | undefined;
    if (!requestRow) return null;
    const request = this.rowToAccountRequest(requestRow);
    const companyId = request.companyId ?? this.ensureCompanyFromRequest(request).id;
    const current = this.getCompany(companyId);
    if (!current) return null;
    const startDate = new Date();
    const endDate = addMonthsIso(startDate, months);
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE companies
         SET subscriptionStatus = 'active',
             planName = ?,
             subscriptionStartDate = ?,
             subscriptionEndDate = ?,
             graceUntil = NULL,
             updatedAt = ?
         WHERE id = ?`
      )
      .run(months === 12 ? "Yearly" : months === 3 ? "Quarterly" : "Monthly", startDate.toISOString(), endDate, updatedAt, companyId);
    this.db
      .prepare(`UPDATE devices SET isAllowed = 1 WHERE companyId = ?`)
      .run(companyId);
    this.db
      .prepare(`UPDATE account_requests SET status = 'approved', reviewedAt = ?, reviewedBy = ?, companyId = ? WHERE id = ?`)
      .run(updatedAt, reviewedBy, companyId, requestId);
    this.logAudit(companyId, "account_request_approved", current.subscriptionStatus, "active", current.subscriptionEndDate, endDate, reviewedBy);
    return {
      request: this.listAccountRequests().find((entry) => entry.id === requestId) ?? null,
      snapshot: this.getSubscriptionStatusByDevice(request.deviceId)
    };
  }

  rejectAccountRequest(requestId: number, reviewedBy: string) {
    const request = this.listAccountRequests().find((entry) => entry.id === requestId);
    if (!request) return null;
    const reviewedAt = new Date().toISOString();
    this.db
      .prepare(`UPDATE account_requests SET status = 'rejected', reviewedAt = ?, reviewedBy = ? WHERE id = ?`)
      .run(reviewedAt, reviewedBy, requestId);
    if (request.companyId) {
      this.db.prepare(`UPDATE devices SET isAllowed = 0 WHERE companyId = ?`).run(request.companyId);
      this.logAudit(request.companyId, "account_request_rejected", "pending", "pending", null, null, reviewedBy);
    }
    return this.listAccountRequests().find((entry) => entry.id === requestId) ?? null;
  }

  startSubscriptionCycle(companyId: string, months: number, adminNote?: string | null) {
    const company = this.getCompany(companyId);
    if (!company) return null;
    const startDate = new Date();
    const endDate = addMonthsIso(startDate, months);
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE companies
         SET subscriptionStatus = 'active',
             planName = ?,
             subscriptionStartDate = ?,
             subscriptionEndDate = ?,
             graceUntil = NULL,
             updatedAt = ?
         WHERE id = ?`
      )
      .run(months === 12 ? "Yearly" : months === 3 ? "Quarterly" : "Monthly", startDate.toISOString(), endDate, updatedAt, companyId);
    this.db.prepare(`UPDATE devices SET isAllowed = 1 WHERE companyId = ?`).run(companyId);
    this.logAudit(companyId, "start_subscription_cycle", company.subscriptionStatus, "active", company.subscriptionEndDate, endDate, adminNote ?? null);
    return this.getCompany(companyId);
  }

  renewCompany(companyId: string, months: number, adminNote?: string | null) {
    const company = this.getCompany(companyId);
    if (!company) return null;
    const now = new Date();
    const base = company.subscriptionEndDate && new Date(company.subscriptionEndDate).getTime() > now.getTime()
      ? new Date(company.subscriptionEndDate)
      : now;
    const newEndDate = addMonthsIso(base, months);
    this.db
      .prepare(
        `UPDATE companies
         SET subscriptionStatus = 'active',
             planName = ?,
             subscriptionStartDate = COALESCE(subscriptionStartDate, ?),
             subscriptionEndDate = ?,
             graceUntil = NULL,
             updatedAt = ?
         WHERE id = ?`
      )
      .run(months === 12 ? "Yearly" : months === 3 ? "Quarterly" : "Monthly", now.toISOString(), newEndDate, new Date().toISOString(), companyId);
    this.db.prepare(`UPDATE devices SET isAllowed = 1 WHERE companyId = ?`).run(companyId);
    this.logAudit(companyId, `renew_${months}_months`, company.subscriptionStatus, "active", company.subscriptionEndDate, newEndDate, adminNote ?? null);
    return this.getCompany(companyId);
  }

  setCompanyStatus(companyId: string, nextStatus: CloudSubscriptionStatus, adminNote?: string | null) {
    const company = this.getCompany(companyId);
    if (!company) return null;
    const updatedAt = new Date().toISOString();
    const nextEndDate =
      nextStatus === "cancelled" || nextStatus === "expired" ? updatedAt : company.subscriptionEndDate;
    const graceUntil = nextStatus === "expired" ? addDaysIso(new Date(), 3) : null;
    this.db
      .prepare(
        `UPDATE companies
         SET subscriptionStatus = ?, subscriptionEndDate = ?, graceUntil = ?, updatedAt = ?
         WHERE id = ?`
      )
      .run(nextStatus, nextEndDate, graceUntil, updatedAt, companyId);
    this.db.prepare(`UPDATE devices SET isAllowed = ? WHERE companyId = ?`).run(nextStatus === "active" || nextStatus === "trial" ? 1 : 0, companyId);
    this.logAudit(companyId, `status_${nextStatus}`, company.subscriptionStatus, nextStatus, company.subscriptionEndDate, nextEndDate, adminNote ?? null);
    return this.getCompany(companyId);
  }

  unlockCompany(companyId: string, adminNote?: string | null) {
    return this.setCompanyStatus(companyId, "active", adminNote);
  }

  listAuditLog(companyId: string) {
    return this.db.prepare(`SELECT * FROM subscription_audit_log WHERE companyId = ? ORDER BY id DESC LIMIT 100`).all(companyId) as CloudSubscriptionAuditLogRecord[];
  }

  getAdminDashboard() {
    const companies = this.listCompanies().map((company) => {
      const devices = this.listDevices(company.id);
      const snapshot = devices.length ? this.getSubscriptionStatusByDevice(devices[0].deviceId) : this.getSubscriptionStatusByDevice("");
      return {
        ...company,
        contactEmail: company.email,
        lastConnectedAt: devices[0]?.lastSeenAt ?? null,
        daysRemaining: snapshot.company?.id === company.id ? snapshot.daysRemaining : 0,
        daysExpired: snapshot.company?.id === company.id ? snapshot.daysExpired : 0,
        connectedDeviceCount: devices.length,
        isAllowed: devices.some((device) => device.isAllowed)
      } satisfies AdminDashboardCompanyRow;
    });
    const pendingRequests = this.listAccountRequests("pending");
    const devices = this.listDevices();
    return {
      companies,
      pendingAccountRequests: pendingRequests,
      pendingCount: pendingRequests.length,
      activeSubscriptions: companies.filter((company) => company.subscriptionStatus === "active" || company.subscriptionStatus === "trial").length,
      expiredAccounts: companies.filter((company) => company.subscriptionStatus === "expired").length,
      connectedDevices: devices.length,
      expiringSoon: companies.filter((company) => company.daysRemaining > 0 && company.daysRemaining <= 7).length,
      devices
    };
  }

  getConnectedUsers() {
    return this.listDevices().map((device) => {
      const company = this.getCompany(device.companyId);
      const snapshot = this.getSubscriptionStatusByDevice(device.deviceId);
      return {
        companyId: company?.id ?? null,
        companyName: company?.companyName ?? "Unknown company",
        userName: company?.contactName ?? "",
        email: company?.email ?? "",
        deviceName: device.deviceName,
        deviceId: device.deviceId,
        status: snapshot.status,
        daysRemaining: snapshot.daysRemaining,
        daysExpired: snapshot.daysExpired,
        lastConnectedAt: device.lastSeenAt,
        paymentReference: company?.manualPaymentReference ?? null
      };
    });
  }

  getNotifications() {
    return this.listAccountRequests("pending").map((request) => ({
      id: `request-${request.id}`,
      type: "account_request",
      title: "New Qouter X account request",
      message: `New account request from ${request.companyName} / ${request.contactName || request.email || request.deviceName}`,
      createdAt: request.createdAt,
      request
    }));
  }
}

export function openCloudSubscriptionDatabase(rootDir = process.cwd()) {
  const dbPath = path.join(rootDir, "qouterx-cloud-subscriptions.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      companyName TEXT NOT NULL,
      contactName TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      manualPaymentReference TEXT NOT NULL UNIQUE,
      subscriptionStatus TEXT NOT NULL DEFAULT 'pending',
      planName TEXT NOT NULL DEFAULT 'Monthly',
      subscriptionStartDate TEXT,
      subscriptionEndDate TEXT,
      graceUntil TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId TEXT NOT NULL,
      deviceId TEXT NOT NULL UNIQUE,
      deviceName TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'unknown',
      appVersion TEXT NOT NULL DEFAULT '',
      isAllowed INTEGER NOT NULL DEFAULT 0,
      lastSeenAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId TEXT,
      companyName TEXT NOT NULL,
      contactName TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      deviceId TEXT NOT NULL,
      deviceName TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      reviewedAt TEXT,
      reviewedBy TEXT
    );
    CREATE TABLE IF NOT EXISTS subscription_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId TEXT NOT NULL,
      action TEXT NOT NULL,
      oldStatus TEXT,
      newStatus TEXT,
      oldEndDate TEXT,
      newEndDate TEXT,
      adminNote TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId TEXT,
      deviceId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
  return new CloudSubscriptionService(db);
}
