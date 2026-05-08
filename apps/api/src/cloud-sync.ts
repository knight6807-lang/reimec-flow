import path from "node:path";
import os from "node:os";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import { getCloudProviderConfig } from "./cloud-provider-config.js";

export type CloudDeviceRole = "admin" | "operator" | "sales" | "viewer";
export type CloudEventType =
  | "app_started"
  | "quote_created"
  | "job_created"
  | "job_started"
  | "job_completed"
  | "dxf_imported"
  | "part_dna_detected"
  | "purchase_order_detected"
  | "email_quote_request_detected"
  | "stock_reserved"
  | "stock_used"
  | "subscription_status_checked"
  | "payment_proof_uploaded"
  | "payment_confirmed"
  | "subscription_renewed"
  | "subscription_expired"
  | "account_suspended"
  | "error_report";

export type CloudSyncSettings = {
  enabled: boolean;
  companyId: string;
  deviceName: string;
  role: CloudDeviceRole;
  adminMode: boolean;
  updatedAt: string;
};

export type SyncEventRecord = {
  id: number;
  eventType: CloudEventType;
  payloadJson: string;
  status: "pending" | "sent" | "failed";
  retryCount: number;
  createdAt: string;
  sentAt?: string | null;
  lastError?: string | null;
};

export type DeviceRecord = {
  id: number;
  deviceId: string;
  deviceName: string;
  userName: string;
  role: CloudDeviceRole;
  lastSeenAt: string;
  createdAt: string;
};

type DeviceInput = {
  deviceId: string;
  deviceName: string;
  userName?: string;
  role: CloudDeviceRole;
  companyId?: string;
  deviceToken?: string;
};

type EventInput = {
  eventType: CloudEventType;
  payload: Record<string, unknown>;
};

export interface CloudProvider {
  registerDevice(device: DeviceInput): Promise<{ ok: true }>;
  postEvent(event: SyncEventRecord): Promise<{ ok: true }>;
  getCompanyEvents(companyId: string, limit?: number): Promise<SyncEventRecord[]>;
  getDevices(companyId: string): Promise<DeviceInput[]>;
}

export class MockCloudProvider implements CloudProvider {
  async registerDevice(_device: DeviceInput) {
    return { ok: true } as const;
  }

  async postEvent(_event: SyncEventRecord) {
    return { ok: true } as const;
  }

  async getCompanyEvents(_companyId: string) {
    return [];
  }

  async getDevices(_companyId: string) {
    return [];
  }
}

export class SupabaseCloudProvider implements CloudProvider {
  constructor(private readonly cloudUrl: string | null) {}

  async registerDevice(_device: DeviceInput) {
    if (!this.cloudUrl) {
      throw new Error("Supabase cloud URL is not configured.");
    }
    throw new Error("SupabaseCloudProvider is a placeholder. Configure the hosted sync API before enabling it.");
    return { ok: true } as const;
  }

  async postEvent(_event: SyncEventRecord) {
    if (!this.cloudUrl) {
      throw new Error("Supabase cloud URL is not configured.");
    }
    throw new Error("SupabaseCloudProvider is a placeholder. Configure the hosted sync API before enabling it.");
    return { ok: true } as const;
  }

  async getCompanyEvents(_companyId: string, _limit?: number) {
    if (!this.cloudUrl) return [];
    return [];
  }

  async getDevices(_companyId: string) {
    if (!this.cloudUrl) return [];
    return [];
  }
}

export class CloudSyncService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly provider: CloudProvider
  ) {}

  getDeviceId() {
    return `device-${os.hostname().replace(/[^a-z0-9-]/gi, "").toLowerCase() || "qouterx"}`;
  }

  getCurrentUserRole(): CloudDeviceRole {
    const settings = this.getSettings();
    return settings.role;
  }

  getSettings(): CloudSyncSettings {
    const row = this.db
      .prepare(
        `SELECT enabled, companyId, deviceName, role, adminMode, updatedAt
         FROM cloud_sync_settings
         WHERE id = 1`
      )
      .get() as
      | {
          enabled: number;
          companyId: string;
          deviceName: string;
          role: CloudDeviceRole;
          adminMode: number;
          updatedAt: string;
        }
      | undefined;
    if (!row) {
      return {
        enabled: false,
        companyId: "",
        deviceName: os.hostname(),
        role: "operator",
        adminMode: false,
        updatedAt: new Date(0).toISOString()
      };
    }
    return {
      enabled: Boolean(row.enabled),
      companyId: row.companyId ?? "",
      deviceName: row.deviceName ?? os.hostname(),
      role: row.role ?? "operator",
      adminMode: Boolean(row.adminMode),
      updatedAt: row.updatedAt
    };
  }

  saveSettings(input: Partial<CloudSyncSettings>) {
    const current = this.getSettings();
    const next: CloudSyncSettings = {
      enabled: input.enabled ?? current.enabled,
      companyId: input.companyId?.trim() ?? current.companyId,
      deviceName: input.deviceName?.trim() || current.deviceName,
      role: input.role ?? current.role,
      adminMode: input.adminMode ?? current.adminMode,
      updatedAt: new Date().toISOString()
    };
    this.db
      .prepare(
        `INSERT INTO cloud_sync_settings (id, enabled, companyId, deviceName, role, adminMode, updatedAt)
         VALUES (1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           enabled = excluded.enabled,
           companyId = excluded.companyId,
           deviceName = excluded.deviceName,
           role = excluded.role,
           adminMode = excluded.adminMode,
           updatedAt = excluded.updatedAt`
      )
      .run(next.enabled ? 1 : 0, next.companyId, next.deviceName, next.role, next.adminMode ? 1 : 0, next.updatedAt);
    return next;
  }

  registerDevice(input: DeviceInput) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO devices (deviceId, deviceName, userName, role, lastSeenAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(deviceId) DO UPDATE SET
           deviceName = excluded.deviceName,
           userName = excluded.userName,
           role = excluded.role,
           lastSeenAt = excluded.lastSeenAt`
      )
      .run(input.deviceId, input.deviceName, input.userName ?? "", input.role, now, now);
    return this.provider.registerDevice(input);
  }

  sendHeartbeat(deviceId: string, userName: string, role: CloudDeviceRole) {
    return this.registerDevice({
      deviceId,
      deviceName: this.getSettings().deviceName || os.hostname(),
      userName,
      role
    });
  }

  pushEvent(input: EventInput) {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO sync_events (eventType, payloadJson, status, retryCount, createdAt)
         VALUES (?, ?, 'pending', 0, ?)`
      )
      .run(input.eventType, JSON.stringify(input.payload ?? {}), now);
    return Number(result.lastInsertRowid);
  }

  listEvents(limit = 100) {
    return this.db
      .prepare(
        `SELECT id, eventType, payloadJson, status, retryCount, createdAt, sentAt, lastError
         FROM sync_events
         ORDER BY createdAt DESC
         LIMIT ?`
      )
      .all(limit) as SyncEventRecord[];
  }

  async syncPendingEvents() {
    const settings = this.getSettings();
    if (!settings.enabled || !settings.companyId) {
      return { sent: 0, skipped: true };
    }
    const pending = this.db
      .prepare(
        `SELECT id, eventType, payloadJson, status, retryCount, createdAt, sentAt, lastError
         FROM sync_events
         WHERE status IN ('pending', 'failed')
         ORDER BY createdAt ASC
         LIMIT 50`
      )
      .all() as SyncEventRecord[];
    let sent = 0;
    for (const event of pending) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.provider.postEvent(event);
        this.db
          .prepare(`UPDATE sync_events SET status = 'sent', sentAt = ?, lastError = NULL WHERE id = ?`)
          .run(new Date().toISOString(), event.id);
        sent += 1;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.db
          .prepare(`UPDATE sync_events SET status = 'failed', retryCount = retryCount + 1, lastError = ? WHERE id = ?`)
          .run(detail, event.id);
      }
    }
    return { sent, skipped: false };
  }

  getCompanyDashboard() {
    const devices = this.db
      .prepare(
        `SELECT id, deviceId, deviceName, userName, role, lastSeenAt, createdAt
         FROM devices
         ORDER BY lastSeenAt DESC`
      )
      .all() as DeviceRecord[];
    const recentEvents = this.listEvents(50);
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const quotesCreatedToday = recentEvents.filter(
      (event) => event.eventType === "quote_created" && event.createdAt.startsWith(todayPrefix)
    ).length;
    const jobsCompletedToday = recentEvents.filter(
      (event) => event.eventType === "job_completed" && event.createdAt.startsWith(todayPrefix)
    ).length;
    const errors = recentEvents.filter((event) => event.eventType === "error_report");
    const recentDxfImports = recentEvents.filter((event) => event.eventType === "dxf_imported").slice(0, 10);
    const purchaseOrdersDetected = recentEvents.filter((event) => event.eventType === "purchase_order_detected").slice(0, 10);
    return {
      devices,
      jobsCompletedToday,
      quotesCreatedToday,
      errors,
      recentDxfImports,
      purchaseOrdersDetected,
      recentEvents
    };
  }
}

export function openCloudSyncDatabase(rootDir = process.cwd()) {
  const dbPath = path.join(rootDir, "qouterx-cloud-sync.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eventType TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retryCount INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      sentAt TEXT,
      lastError TEXT
    );
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deviceId TEXT NOT NULL UNIQUE,
      deviceName TEXT NOT NULL,
      userName TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'operator',
      lastSeenAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cloud_sync_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      companyId TEXT NOT NULL DEFAULT '',
      deviceName TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'operator',
      adminMode INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL
    );
  `);
  const { mode, cloudUrl } = getCloudProviderConfig();
  const provider =
    mode === "supabase"
      ? new SupabaseCloudProvider(cloudUrl)
      : new MockCloudProvider();
  return new CloudSyncService(db, provider);
}
