import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";

export type ManualSubscriptionStatus = "pending" | "trial" | "active" | "expired" | "suspended" | "cancelled";
export type ManualSubscriptionRole = "main_admin" | "company_admin" | "operator";

export type CompanyRecord = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  manualPaymentReference: string;
  subscriptionStatus: ManualSubscriptionStatus;
  planName: string;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  graceUntil: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanyDeviceRecord = {
  id: number;
  companyId: string;
  deviceId: string;
  deviceName: string;
  lastSeenAt: string;
  isAllowed: boolean;
  createdAt: string;
};

export type ManualPaymentRecord = {
  id: number;
  companyId: string;
  paymentReference: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  proofFilePath: string | null;
  notes: string | null;
  confirmedByAdmin: boolean;
  confirmedAt: string | null;
  createdAt: string;
};

export type SubscriptionAuditLogRecord = {
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

export type SubscriptionSnapshot = {
  company: CompanyRecord;
  status: ManualSubscriptionStatus;
  hasAccess: boolean;
  limitedAccess: boolean;
  expiresInDays: number;
  expiredDays: number;
  graceDaysRemaining: number;
};

type CompanyInput = {
  id: string;
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  planName?: string;
  notes?: string | null;
};

type DeviceInput = {
  companyId: string;
  deviceId: string;
  deviceName?: string;
  isAllowed?: boolean;
};

type PaymentInput = {
  companyId: string;
  paymentReference: string;
  amount: number;
  paymentDate?: string;
  paymentMethod?: string;
  proofFilePath?: string | null;
  notes?: string | null;
};

const DEFAULT_GRACE_DAYS = 3;
const DEFAULT_TRIAL_DAYS = 14;

function addDaysIso(baseDate: Date, days: number) {
  const next = new Date(baseDate.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function daysBetween(targetIso: string | null, from = new Date()) {
  if (!targetIso) return 0;
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.ceil((target.getTime() - from.getTime()) / 86_400_000);
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

function normalizeStatus(value: unknown): ManualSubscriptionStatus {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["pending", "trial", "active", "expired", "suspended", "cancelled"].includes(candidate)
    ? (candidate as ManualSubscriptionStatus)
    : "pending";
}

export function getSubscriptionRole(input: {
  isMainAdmin: boolean;
  membershipRole?: string | null;
}): ManualSubscriptionRole {
  if (input.isMainAdmin) return "main_admin";
  if (input.membershipRole === "owner" || input.membershipRole === "admin") return "company_admin";
  return "operator";
}

export function canManageManualSubscriptions(role: ManualSubscriptionRole) {
  return role === "main_admin";
}

export function canCompanyViewBilling(role: ManualSubscriptionRole) {
  return role === "main_admin" || role === "company_admin" || role === "operator";
}

export class ManualSubscriptionService {
  constructor(private readonly db: DatabaseSync) {}

  private rowToCompany(row: Record<string, unknown>): CompanyRecord {
    return {
      id: String(row.id ?? ""),
      companyName: String(row.companyName ?? ""),
      contactName: String(row.contactName ?? ""),
      email: String(row.email ?? ""),
      phone: String(row.phone ?? ""),
      manualPaymentReference: String(row.manualPaymentReference ?? ""),
      subscriptionStatus: normalizeStatus(row.subscriptionStatus),
      planName: String(row.planName ?? "Qouter X Standard"),
      subscriptionStartDate: asIsoOrNull(row.subscriptionStartDate),
      subscriptionEndDate: asIsoOrNull(row.subscriptionEndDate),
      graceUntil: asIsoOrNull(row.graceUntil),
      notes: asNullableTrimmedString(row.notes),
      createdAt: String(row.createdAt ?? new Date().toISOString()),
      updatedAt: String(row.updatedAt ?? new Date().toISOString())
    };
  }

  private nextPaymentReference(companyName: string) {
    const year = new Date().getFullYear();
    const seqRow = this.db.prepare(`SELECT COUNT(*) as total FROM companies`).get() as { total?: number } | undefined;
    const seq = Math.max(1, Number(seqRow?.total ?? 0) + 1);
    return `QX-${normalizeCompanyCode(companyName)}-${year}-${String(seq).padStart(4, "0")}`;
  }

  private rowToManualPayment(row: Record<string, unknown>): ManualPaymentRecord {
    return {
      id: Number(row.id ?? 0),
      companyId: String(row.companyId ?? ""),
      paymentReference: String(row.paymentReference ?? ""),
      amount: Number(row.amount ?? 0),
      paymentDate: String(row.paymentDate ?? ""),
      paymentMethod: String(row.paymentMethod ?? "eft"),
      proofFilePath: asNullableTrimmedString(row.proofFilePath),
      notes: asNullableTrimmedString(row.notes),
      confirmedByAdmin: Boolean(row.confirmedByAdmin),
      confirmedAt: asIsoOrNull(row.confirmedAt),
      createdAt: String(row.createdAt ?? "")
    };
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
      .run(
        companyId,
        action,
        oldStatus,
        newStatus,
        oldEndDate,
        newEndDate,
        adminNote ?? null,
        new Date().toISOString()
      );
  }

  ensureCompany(input: CompanyInput) {
    const existing = this.getCompany(input.id);
    if (existing) {
      const updated: CompanyRecord = {
        ...existing,
        companyName: input.companyName.trim() || existing.companyName,
        contactName: input.contactName?.trim() || existing.contactName,
        email: input.email?.trim() || existing.email,
        phone: input.phone?.trim() || existing.phone,
        planName: input.planName?.trim() || existing.planName,
        notes: input.notes === undefined ? existing.notes : asNullableTrimmedString(input.notes),
        updatedAt: new Date().toISOString()
      };
      this.db
        .prepare(
          `UPDATE companies
           SET companyName = ?, contactName = ?, email = ?, phone = ?, planName = ?, notes = ?, updatedAt = ?
           WHERE id = ?`
        )
        .run(
          updated.companyName,
          updated.contactName,
          updated.email,
          updated.phone,
          updated.planName,
          updated.notes,
          updated.updatedAt,
          updated.id
        );
      return updated;
    }

    const createdAt = new Date().toISOString();
    const company: CompanyRecord = {
      id: input.id,
      companyName: input.companyName.trim() || input.id,
      contactName: input.contactName?.trim() || "",
      email: input.email?.trim() || "",
      phone: input.phone?.trim() || "",
      manualPaymentReference: this.nextPaymentReference(input.companyName || input.id),
      subscriptionStatus: "pending",
      planName: input.planName?.trim() || "Qouter X Standard",
      subscriptionStartDate: null,
      subscriptionEndDate: null,
      graceUntil: null,
      notes: asNullableTrimmedString(input.notes),
      createdAt,
      updatedAt: createdAt
    };
    this.db
      .prepare(
        `INSERT INTO companies
         (id, companyName, contactName, email, phone, manualPaymentReference, subscriptionStatus, planName,
          subscriptionStartDate, subscriptionEndDate, graceUntil, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        company.notes,
        company.createdAt,
        company.updatedAt
      );
    this.logAudit(company.id, "company_created", null, company.subscriptionStatus, null, company.subscriptionEndDate, company.notes);
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

  getSubscriptionSnapshot(companyId: string): SubscriptionSnapshot | null {
    const company = this.getCompany(companyId);
    if (!company) return null;
    const now = new Date();
    const end = company.subscriptionEndDate ? new Date(company.subscriptionEndDate) : null;
    const computedGraceUntil = company.graceUntil
      ? new Date(company.graceUntil)
      : end
        ? new Date(new Date(end).getTime() + DEFAULT_GRACE_DAYS * 86_400_000)
        : null;

    let status = company.subscriptionStatus;
    let hasAccess = false;
    let limitedAccess = false;

    if (status === "pending" || status === "suspended" || status === "cancelled") {
      hasAccess = false;
    } else if (!end || end.getTime() >= now.getTime()) {
      status = status === "expired" ? "active" : status;
      hasAccess = true;
    } else if (computedGraceUntil && computedGraceUntil.getTime() >= now.getTime()) {
      status = "expired";
      hasAccess = true;
      limitedAccess = true;
    } else {
      status = "expired";
      hasAccess = false;
    }

    if (
      status !== company.subscriptionStatus ||
      (computedGraceUntil?.toISOString() ?? null) !== (company.graceUntil ?? null)
    ) {
      this.db
        .prepare(`UPDATE companies SET subscriptionStatus = ?, graceUntil = ?, updatedAt = ? WHERE id = ?`)
        .run(status, computedGraceUntil?.toISOString() ?? null, new Date().toISOString(), company.id);
      company.subscriptionStatus = status;
      company.graceUntil = computedGraceUntil?.toISOString() ?? null;
    }

    return {
      company,
      status,
      hasAccess,
      limitedAccess,
      expiresInDays: Math.max(0, daysBetween(company.subscriptionEndDate, now)),
      expiredDays: company.subscriptionEndDate && new Date(company.subscriptionEndDate).getTime() < now.getTime()
        ? Math.abs(Math.min(0, daysBetween(company.subscriptionEndDate, now)))
        : 0,
      graceDaysRemaining: computedGraceUntil ? Math.max(0, daysBetween(computedGraceUntil.toISOString(), now)) : 0
    };
  }

  applyExternalSnapshot(input: {
    companyId: string;
    companyName?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    manualPaymentReference?: string | null;
    subscriptionStatus: ManualSubscriptionStatus;
    planName?: string;
    subscriptionStartDate?: string | null;
    subscriptionEndDate?: string | null;
    graceUntil?: string | null;
    notes?: string | null;
  }) {
    const existing = this.getCompany(input.companyId);
    const now = new Date().toISOString();
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO companies
           (id, companyName, contactName, email, phone, manualPaymentReference, subscriptionStatus, planName,
            subscriptionStartDate, subscriptionEndDate, graceUntil, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.companyId,
          input.companyName?.trim() || input.companyId,
          input.contactName?.trim() || "",
          input.email?.trim() || "",
          input.phone?.trim() || "",
          input.manualPaymentReference?.trim() || this.nextPaymentReference(input.companyName || input.companyId),
          input.subscriptionStatus,
          input.planName?.trim() || "Qouter X Standard",
          asIsoOrNull(input.subscriptionStartDate),
          asIsoOrNull(input.subscriptionEndDate),
          asIsoOrNull(input.graceUntil),
          asNullableTrimmedString(input.notes),
          now,
          now
        );
      return this.getCompany(input.companyId);
    }
    this.db
      .prepare(
        `UPDATE companies
         SET companyName = ?, contactName = ?, email = ?, phone = ?, manualPaymentReference = ?, subscriptionStatus = ?,
             planName = ?, subscriptionStartDate = ?, subscriptionEndDate = ?, graceUntil = ?, notes = ?, updatedAt = ?
         WHERE id = ?`
      )
      .run(
        input.companyName?.trim() || existing.companyName,
        input.contactName?.trim() || existing.contactName,
        input.email?.trim() || existing.email,
        input.phone?.trim() || existing.phone,
        input.manualPaymentReference?.trim() || existing.manualPaymentReference,
        input.subscriptionStatus,
        input.planName?.trim() || existing.planName,
        asIsoOrNull(input.subscriptionStartDate) ?? existing.subscriptionStartDate,
        asIsoOrNull(input.subscriptionEndDate) ?? existing.subscriptionEndDate,
        asIsoOrNull(input.graceUntil) ?? existing.graceUntil,
        asNullableTrimmedString(input.notes) ?? existing.notes,
        now,
        input.companyId
      );
    return this.getCompany(input.companyId);
  }

  markDeviceSeen(input: DeviceInput) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO devices (companyId, deviceId, deviceName, lastSeenAt, isAllowed, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(deviceId) DO UPDATE SET
           companyId = excluded.companyId,
           deviceName = excluded.deviceName,
           lastSeenAt = excluded.lastSeenAt,
           isAllowed = excluded.isAllowed`
      )
      .run(
        input.companyId,
        input.deviceId,
        input.deviceName?.trim() || os.hostname(),
        now,
        input.isAllowed === false ? 0 : 1,
        now
      );
  }

  listDevices(companyId?: string) {
    const rows = companyId
      ? this.db.prepare(`SELECT * FROM devices WHERE companyId = ? ORDER BY lastSeenAt DESC`).all(companyId)
      : this.db.prepare(`SELECT * FROM devices ORDER BY lastSeenAt DESC`).all();
    return rows as CompanyDeviceRecord[];
  }

  createManualPayment(input: PaymentInput) {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO manual_payments
         (companyId, paymentReference, amount, paymentDate, paymentMethod, proofFilePath, notes, confirmedByAdmin, confirmedAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`
      )
      .run(
        input.companyId,
        input.paymentReference,
        Number.isFinite(input.amount) ? input.amount : 0,
        input.paymentDate ? new Date(input.paymentDate).toISOString() : createdAt,
        input.paymentMethod?.trim() || "eft",
        input.proofFilePath ?? null,
        asNullableTrimmedString(input.notes),
        createdAt
      );
    return this.getManualPayment(Number(result.lastInsertRowid));
  }

  getManualPayment(paymentId: number) {
    const row = this.db.prepare(`SELECT * FROM manual_payments WHERE id = ?`).get(paymentId) as Record<string, unknown> | undefined;
    return row ? this.rowToManualPayment(row) : null;
  }

  listManualPayments(companyId?: string) {
    const rows = companyId
      ? this.db.prepare(`SELECT * FROM manual_payments WHERE companyId = ? ORDER BY createdAt DESC`).all(companyId)
      : this.db.prepare(`SELECT * FROM manual_payments ORDER BY createdAt DESC`).all();
    return (rows as Record<string, unknown>[]).map((row) => this.rowToManualPayment(row));
  }

  confirmManualPayment(paymentId: number, adminNote?: string | null) {
    const payment = this.getManualPayment(paymentId);
    if (!payment) return null;
    const confirmedAt = new Date().toISOString();
    this.db
      .prepare(`UPDATE manual_payments SET confirmedByAdmin = 1, confirmedAt = ?, notes = COALESCE(?, notes) WHERE id = ?`)
      .run(confirmedAt, asNullableTrimmedString(adminNote), paymentId);
    this.logAudit(payment.companyId, "payment_confirmed", null, null, null, null, adminNote ?? null);
    return this.getManualPayment(paymentId);
  }

  renewCompany(companyId: string, months: number, adminNote?: string | null) {
    const snapshot = this.getSubscriptionSnapshot(companyId);
    if (!snapshot) return null;
    const now = new Date();
    const base = snapshot.company.subscriptionEndDate && new Date(snapshot.company.subscriptionEndDate).getTime() > now.getTime()
      ? new Date(snapshot.company.subscriptionEndDate)
      : now;
    const newEndDate = new Date(base.getTime());
    newEndDate.setUTCMonth(newEndDate.getUTCMonth() + Math.max(1, months));
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE companies
         SET subscriptionStatus = 'active',
             subscriptionStartDate = COALESCE(subscriptionStartDate, ?),
             subscriptionEndDate = ?,
             graceUntil = NULL,
             updatedAt = ?
         WHERE id = ?`
      )
      .run(snapshot.company.subscriptionStartDate ?? now.toISOString(), newEndDate.toISOString(), updatedAt, companyId);
    this.logAudit(
      companyId,
      `renew_${months}_months`,
      snapshot.company.subscriptionStatus,
      "active",
      snapshot.company.subscriptionEndDate,
      newEndDate.toISOString(),
      adminNote ?? null
    );
    return this.getSubscriptionSnapshot(companyId);
  }

  updateCompanyStatus(companyId: string, nextStatus: ManualSubscriptionStatus, adminNote?: string | null) {
    const snapshot = this.getSubscriptionSnapshot(companyId);
    if (!snapshot) return null;
    const updatedAt = new Date().toISOString();
    const nextEndDate = nextStatus === "expired" ? updatedAt : snapshot.company.subscriptionEndDate;
    const graceUntil = nextStatus === "expired"
      ? addDaysIso(new Date(), DEFAULT_GRACE_DAYS)
      : null;
    this.db
      .prepare(
        `UPDATE companies
         SET subscriptionStatus = ?, subscriptionEndDate = ?, graceUntil = ?, updatedAt = ?, notes = COALESCE(?, notes)
         WHERE id = ?`
      )
      .run(nextStatus, nextEndDate, graceUntil, updatedAt, asNullableTrimmedString(adminNote), companyId);
    this.logAudit(
      companyId,
      `status_${nextStatus}`,
      snapshot.company.subscriptionStatus,
      nextStatus,
      snapshot.company.subscriptionEndDate,
      snapshot.company.subscriptionEndDate,
      adminNote ?? null
    );
    return this.getSubscriptionSnapshot(companyId);
  }

  updateCompanyNote(companyId: string, note: string | null) {
    this.db.prepare(`UPDATE companies SET notes = ?, updatedAt = ? WHERE id = ?`).run(asNullableTrimmedString(note), new Date().toISOString(), companyId);
    return this.getCompany(companyId);
  }

  listAuditLog(companyId: string) {
    return this.db
      .prepare(`SELECT * FROM subscription_audit_log WHERE companyId = ? ORDER BY id DESC LIMIT 100`)
      .all(companyId) as SubscriptionAuditLogRecord[];
  }

  getAdminDashboard() {
    const companies = this.listCompanies().map((company) => {
      const snapshot = this.getSubscriptionSnapshot(company.id);
      const lastSeenRow = this.db
        .prepare(`SELECT lastSeenAt FROM devices WHERE companyId = ? ORDER BY lastSeenAt DESC LIMIT 1`)
        .get(company.id) as { lastSeenAt?: string } | undefined;
      const pendingPayments = this.db
        .prepare(`SELECT COUNT(*) as total FROM manual_payments WHERE companyId = ? AND confirmedByAdmin = 0`)
        .get(company.id) as { total?: number } | undefined;
      return {
        ...company,
        resolvedStatus: snapshot?.status ?? company.subscriptionStatus,
        hasAccess: snapshot?.hasAccess ?? false,
        limitedAccess: snapshot?.limitedAccess ?? false,
        expiresInDays: snapshot?.expiresInDays ?? 0,
        expiredDays: snapshot?.expiredDays ?? 0,
        graceDaysRemaining: snapshot?.graceDaysRemaining ?? 0,
        lastSeenAt: lastSeenRow?.lastSeenAt ?? null,
        pendingPaymentCount: Number(pendingPayments?.total ?? 0)
      };
    });
    return {
      companies,
      activeAccounts: companies.filter((company) => company.resolvedStatus === "active" || company.resolvedStatus === "trial").length,
      expiredAccounts: companies.filter((company) => company.resolvedStatus === "expired").length,
      expiringSoon: companies.filter((company) => company.expiresInDays > 0 && company.expiresInDays <= 7).length,
      suspendedAccounts: companies.filter((company) => company.resolvedStatus === "suspended").length,
      pendingPaymentProofs: this.listManualPayments().filter((payment) => !payment.confirmedByAdmin).length,
      devices: this.listDevices()
    };
  }
}

export function openManualSubscriptionDatabase(rootDir = process.cwd()) {
  const dbPath = path.join(rootDir, "qouterx-manual-subscriptions.sqlite");
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
      subscriptionStatus TEXT NOT NULL DEFAULT 'trial',
      planName TEXT NOT NULL DEFAULT 'Qouter X Standard',
      subscriptionStartDate TEXT,
      subscriptionEndDate TEXT,
      graceUntil TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId TEXT NOT NULL,
      deviceId TEXT NOT NULL UNIQUE,
      deviceName TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL,
      isAllowed INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS manual_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyId TEXT NOT NULL,
      paymentReference TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      paymentDate TEXT NOT NULL,
      paymentMethod TEXT NOT NULL DEFAULT 'eft',
      proofFilePath TEXT,
      notes TEXT,
      confirmedByAdmin INTEGER NOT NULL DEFAULT 0,
      confirmedAt TEXT,
      createdAt TEXT NOT NULL
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
  `);
  return new ManualSubscriptionService(db);
}

export function ensureManualProofDirectory(rootDir: string, companyId: string) {
  const dir = path.join(rootDir, "manual-payment-proofs", companyId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
