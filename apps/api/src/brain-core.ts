import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";

export type BrainEventType =
  | "quote_created"
  | "quote_accepted"
  | "job_created"
  | "job_started"
  | "job_completed"
  | "dxf_imported"
  | "part_dna_detected"
  | "material_reserved"
  | "material_used"
  | "offcut_created"
  | "nesting_completed"
  | "purchase_order_detected"
  | "payment_received"
  | "error_detected";

export type BrainRecommendationStatus = "open" | "accepted" | "dismissed";

export type BrainEventRecord = {
  id: number;
  eventType: BrainEventType;
  entityType: string;
  entityId: string;
  payloadJson: string;
  createdAt: string;
};

export type BrainRecommendationRecord = {
  id: number;
  moduleName: string;
  recommendationType: string;
  title: string;
  message: string;
  confidence: number;
  impactScore: number;
  status: BrainRecommendationStatus;
  payloadJson: string;
  createdAt: string;
};

export type BrainEntityLinkRecord = {
  id: number;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  linkType: string;
  createdAt: string;
};

type BrainEventInput = {
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
};

type BrainRecommendationInput = {
  moduleName: string;
  recommendationType: string;
  title: string;
  message: string;
  confidence: number;
  impactScore: number;
  status?: BrainRecommendationStatus;
  payload?: Record<string, unknown>;
};

function parseJsonObject(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function asEventType(value: unknown): BrainEventType {
  const candidate = typeof value === "string" ? value.trim() : "";
  const allowed: BrainEventType[] = [
    "quote_created",
    "quote_accepted",
    "job_created",
    "job_started",
    "job_completed",
    "dxf_imported",
    "part_dna_detected",
    "material_reserved",
    "material_used",
    "offcut_created",
    "nesting_completed",
    "purchase_order_detected",
    "payment_received",
    "error_detected"
  ];
  return allowed.includes(candidate as BrainEventType) ? (candidate as BrainEventType) : "error_detected";
}

function asRecommendationStatus(value: unknown): BrainRecommendationStatus {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate === "accepted" || candidate === "dismissed" ? candidate : "open";
}

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampImpactScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export class BrainMemoryService {
  constructor(private readonly db: DatabaseSync) {}

  linkEntities(input: {
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    linkType: string;
  }) {
    const sourceType = input.sourceType.trim();
    const sourceId = input.sourceId.trim();
    const targetType = input.targetType.trim();
    const targetId = input.targetId.trim();
    const linkType = input.linkType.trim();
    if (!sourceType || !sourceId || !targetType || !targetId || !linkType) return null;

    const existing = this.db.prepare(
      `SELECT * FROM brain_entity_links
       WHERE sourceType = ? AND sourceId = ? AND targetType = ? AND targetId = ? AND linkType = ?
       LIMIT 1`
    ).get(sourceType, sourceId, targetType, targetId, linkType) as Record<string, unknown> | undefined;
    if (existing) return this.rowToLink(existing);

    const createdAt = new Date().toISOString();
    const result = this.db.prepare(
      `INSERT INTO brain_entity_links
       (sourceType, sourceId, targetType, targetId, linkType, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(sourceType, sourceId, targetType, targetId, linkType, createdAt);
    return {
      id: Number(result.lastInsertRowid ?? 0),
      sourceType,
      sourceId,
      targetType,
      targetId,
      linkType,
      createdAt
    } satisfies BrainEntityLinkRecord;
  }

  listLinksForEntity(entityType: string, entityId: string) {
    const rows = this.db.prepare(
      `SELECT * FROM brain_entity_links
       WHERE (sourceType = ? AND sourceId = ?) OR (targetType = ? AND targetId = ?)
       ORDER BY id DESC`
    ).all(entityType, entityId, entityType, entityId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToLink(row));
  }

  private rowToLink(row: Record<string, unknown>): BrainEntityLinkRecord {
    return {
      id: Number(row.id ?? 0),
      sourceType: String(row.sourceType ?? ""),
      sourceId: String(row.sourceId ?? ""),
      targetType: String(row.targetType ?? ""),
      targetId: String(row.targetId ?? ""),
      linkType: String(row.linkType ?? ""),
      createdAt: String(row.createdAt ?? "")
    };
  }
}

export class BrainRecommendationService {
  constructor(private readonly db: DatabaseSync) {}

  createRecommendation(input: BrainRecommendationInput) {
    const moduleName = input.moduleName.trim();
    const recommendationType = input.recommendationType.trim();
    const title = input.title.trim();
    const message = input.message.trim();
    if (!moduleName || !recommendationType || !title || !message) return null;

    const payloadJson = JSON.stringify(input.payload ?? {});
    const duplicate = this.db.prepare(
      `SELECT * FROM brain_recommendations
       WHERE moduleName = ? AND recommendationType = ? AND title = ? AND status = 'open' AND payloadJson = ?
       ORDER BY id DESC
       LIMIT 1`
    ).get(moduleName, recommendationType, title, payloadJson) as Record<string, unknown> | undefined;
    if (duplicate) return this.rowToRecommendation(duplicate);

    const createdAt = new Date().toISOString();
    const result = this.db.prepare(
      `INSERT INTO brain_recommendations
       (moduleName, recommendationType, title, message, confidence, impactScore, status, payloadJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      moduleName,
      recommendationType,
      title,
      message,
      clampPercentage(input.confidence),
      clampImpactScore(input.impactScore),
      input.status ?? "open",
      payloadJson,
      createdAt
    );
    return {
      id: Number(result.lastInsertRowid ?? 0),
      moduleName,
      recommendationType,
      title,
      message,
      confidence: clampPercentage(input.confidence),
      impactScore: clampImpactScore(input.impactScore),
      status: input.status ?? "open",
      payloadJson,
      createdAt
    } satisfies BrainRecommendationRecord;
  }

  listRecommendations(filter?: {
    status?: BrainRecommendationStatus | "all";
    moduleName?: string;
    limit?: number;
    workspaceId?: string;
  }) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter?.status && filter.status !== "all") {
      clauses.push("status = ?");
      params.push(filter.status);
    }
    if (filter?.moduleName?.trim()) {
      clauses.push("moduleName = ?");
      params.push(filter.moduleName.trim());
    }
    if (filter?.workspaceId?.trim()) {
      clauses.push("json_extract(payloadJson, '$.workspaceId') = ?");
      params.push(filter.workspaceId.trim());
    }
    const limit = Math.max(1, Math.min(500, filter?.limit ?? 100));
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(
      `SELECT * FROM brain_recommendations
       ${where}
       ORDER BY id DESC
       LIMIT ${limit}`
    ).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToRecommendation(row));
  }

  updateRecommendation(id: number, status: BrainRecommendationStatus) {
    if (!Number.isFinite(id) || id <= 0) return null;
    this.db.prepare(`UPDATE brain_recommendations SET status = ? WHERE id = ?`).run(status, id);
    const row = this.db.prepare(`SELECT * FROM brain_recommendations WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToRecommendation(row) : null;
  }

  createRecommendationsForEvent(event: BrainEventRecord) {
    const payload = parseJsonObject(event.payloadJson);
    const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : undefined;
    const recommendations: BrainRecommendationRecord[] = [];
    const add = (input: Omit<BrainRecommendationInput, "payload"> & { payload?: Record<string, unknown> }) => {
      const created = this.createRecommendation({
        ...input,
        payload: {
          eventId: event.id,
          entityType: event.entityType,
          entityId: event.entityId,
          workspaceId,
          ...input.payload
        }
      });
      if (created) recommendations.push(created);
    };

    switch (event.eventType) {
      case "quote_accepted":
        add({
          moduleName: "brain_core",
          recommendationType: "job_follow_up",
          title: "Create job from accepted quote",
          message: `Quote ${event.entityId} was accepted. Review production planning and create the job if it has not been started.`,
          confidence: 0.93,
          impactScore: 88
        });
        break;
      case "dxf_imported":
        add({
          moduleName: "brain_core",
          recommendationType: "part_dna_review",
          title: "Run Part DNA review",
          message: `DXF ${event.entityId} was imported. Check whether it should be fingerprinted for Part DNA and previous pricing reuse.`,
          confidence: 0.84,
          impactScore: 63
        });
        break;
      case "purchase_order_detected":
        add({
          moduleName: "brain_core",
          recommendationType: "purchase_order_review",
          title: "Review detected purchase order",
          message: `Purchase order ${event.entityId} was detected. Confirm the customer, quantities, and whether a job should be prepared.`,
          confidence: 0.89,
          impactScore: 79
        });
        break;
      case "offcut_created":
        add({
          moduleName: "brain_core",
          recommendationType: "offcut_reuse",
          title: "Review offcut for reuse",
          message: `A new offcut was created. Tag it correctly so future quotes and jobs can reserve it before using a full sheet.`,
          confidence: 0.82,
          impactScore: 58
        });
        break;
      case "error_detected":
        add({
          moduleName: "brain_core",
          recommendationType: "error_review",
          title: "Review system error",
          message: `An error event was captured for ${event.entityType} ${event.entityId}. Review the details and resolve the root cause.`,
          confidence: 0.97,
          impactScore: 91
        });
        break;
      default:
        break;
    }
    return recommendations;
  }

  private rowToRecommendation(row: Record<string, unknown>): BrainRecommendationRecord {
    return {
      id: Number(row.id ?? 0),
      moduleName: String(row.moduleName ?? ""),
      recommendationType: String(row.recommendationType ?? ""),
      title: String(row.title ?? ""),
      message: String(row.message ?? ""),
      confidence: Number(row.confidence ?? 0),
      impactScore: Number(row.impactScore ?? 0),
      status: asRecommendationStatus(row.status),
      payloadJson: String(row.payloadJson ?? "{}"),
      createdAt: String(row.createdAt ?? "")
    };
  }
}

export class BrainEventService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly memory: BrainMemoryService,
    private readonly recommendations: BrainRecommendationService
  ) {}

  recordEvent(input: BrainEventInput) {
    const eventType = asEventType(input.eventType);
    const entityType = input.entityType.trim();
    const entityId = input.entityId.trim();
    if (!entityType || !entityId) {
      throw new Error("entityType and entityId are required.");
    }
    const createdAt = new Date().toISOString();
    const payloadJson = JSON.stringify(input.payload ?? {});
    const result = this.db.prepare(
      `INSERT INTO brain_events
       (eventType, entityType, entityId, payloadJson, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    ).run(eventType, entityType, entityId, payloadJson, createdAt);
    const event: BrainEventRecord = {
      id: Number(result.lastInsertRowid ?? 0),
      eventType,
      entityType,
      entityId,
      payloadJson,
      createdAt
    };
    for (const link of input.links ?? []) {
      this.memory.linkEntities(link);
    }
    this.recommendations.createRecommendationsForEvent(event);
    return event;
  }

  listEvents(filter?: {
    eventType?: BrainEventType;
    entityType?: string;
    entityId?: string;
    workspaceId?: string;
    limit?: number;
  }) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter?.eventType) {
      clauses.push("eventType = ?");
      params.push(filter.eventType);
    }
    if (filter?.entityType?.trim()) {
      clauses.push("entityType = ?");
      params.push(filter.entityType.trim());
    }
    if (filter?.entityId?.trim()) {
      clauses.push("entityId = ?");
      params.push(filter.entityId.trim());
    }
    if (filter?.workspaceId?.trim()) {
      clauses.push("json_extract(payloadJson, '$.workspaceId') = ?");
      params.push(filter.workspaceId.trim());
    }
    const limit = Math.max(1, Math.min(500, filter?.limit ?? 100));
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(
      `SELECT * FROM brain_events
       ${where}
       ORDER BY id DESC
       LIMIT ${limit}`
    ).all(...params) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: Number(row.id ?? 0),
      eventType: asEventType(row.eventType),
      entityType: String(row.entityType ?? ""),
      entityId: String(row.entityId ?? ""),
      payloadJson: String(row.payloadJson ?? "{}"),
      createdAt: String(row.createdAt ?? "")
    }));
  }
}

export class BrainCoreService {
  readonly memoryService: BrainMemoryService;
  readonly recommendationService: BrainRecommendationService;
  readonly eventService: BrainEventService;

  constructor(private readonly db: DatabaseSync) {
    this.memoryService = new BrainMemoryService(db);
    this.recommendationService = new BrainRecommendationService(db);
    this.eventService = new BrainEventService(db, this.memoryService, this.recommendationService);
  }
}

export function openBrainCoreDatabase(rootDir = process.cwd()) {
  const dbPath = path.join(rootDir, "qouterx-brain-core.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS brain_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eventType TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      payloadJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brain_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      moduleName TEXT NOT NULL,
      recommendationType TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      impactScore REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      payloadJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brain_entity_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceType TEXT NOT NULL,
      sourceId TEXT NOT NULL,
      targetType TEXT NOT NULL,
      targetId TEXT NOT NULL,
      linkType TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_brain_events_eventType ON brain_events(eventType);
    CREATE INDEX IF NOT EXISTS idx_brain_events_entity ON brain_events(entityType, entityId);
    CREATE INDEX IF NOT EXISTS idx_brain_recommendations_status ON brain_recommendations(status);
    CREATE INDEX IF NOT EXISTS idx_brain_links_source ON brain_entity_links(sourceType, sourceId);
    CREATE INDEX IF NOT EXISTS idx_brain_links_target ON brain_entity_links(targetType, targetId);
  `);
  return new BrainCoreService(db);
}
