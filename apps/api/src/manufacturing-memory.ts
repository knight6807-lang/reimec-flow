import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService, BrainEventRecord, BrainRecommendationRecord } from "./brain-core.js";

export type ManufacturingMemoryRecord = {
  id: number;
  memoryType: string;
  title: string;
  summary: string;
  entityType: string;
  entityId: string;
  importanceScore: number;
  payloadJson: string;
  createdAt: string;
};

export type KnownPatternRecord = {
  id: number;
  patternType: string;
  title: string;
  description: string;
  confidence: number;
  payloadJson: string;
  createdAt: string;
};

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function stringifyPayload(payload: Record<string, unknown>) {
  return JSON.stringify(payload);
}

function memoryRow(row: Record<string, unknown>): ManufacturingMemoryRecord {
  return {
    id: Number(row.id ?? 0),
    memoryType: String(row.memoryType ?? ""),
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    entityType: String(row.entityType ?? ""),
    entityId: String(row.entityId ?? ""),
    importanceScore: Number(row.importanceScore ?? 0),
    payloadJson: String(row.payloadJson ?? "{}"),
    createdAt: String(row.createdAt ?? "")
  };
}

function patternRow(row: Record<string, unknown>): KnownPatternRecord {
  return {
    id: Number(row.id ?? 0),
    patternType: String(row.patternType ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    confidence: Number(row.confidence ?? 0),
    payloadJson: String(row.payloadJson ?? "{}"),
    createdAt: String(row.createdAt ?? "")
  };
}

export function openManufacturingMemoryDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-manufacturing-memory.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS manufacturing_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memoryType TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      importanceScore REAL NOT NULL DEFAULT 0,
      payloadJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS known_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patternType TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      payloadJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_type ON manufacturing_memory(memoryType, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_entity ON manufacturing_memory(entityType, entityId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_patterns_type ON known_patterns(patternType, createdAt DESC);
  `);
  return db;
}

export class ManufacturingMemoryService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly brainCore: BrainCoreService
  ) {}

  ingestEvent(event: BrainEventRecord) {
    const payload = parseJsonObject(event.payloadJson);
    const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : "";
    const memories: ManufacturingMemoryRecord[] = [];
    const patterns: KnownPatternRecord[] = [];
    const recommendations: BrainRecommendationRecord[] = [];

    const addMemory = (input: {
      memoryType: string;
      title: string;
      summary: string;
      importanceScore: number;
      payload?: Record<string, unknown>;
    }) => {
      const created = this.createMemory({
        memoryType: input.memoryType,
        title: input.title,
        summary: input.summary,
        entityType: event.entityType,
        entityId: event.entityId,
        importanceScore: input.importanceScore,
        payload: {
          workspaceId,
          eventId: event.id,
          eventType: event.eventType,
          ...payload,
          ...input.payload
        }
      });
      if (created) memories.push(created);
      return created;
    };

    const addPattern = (input: {
      patternType: string;
      title: string;
      description: string;
      confidence: number;
      payload?: Record<string, unknown>;
    }) => {
      const created = this.upsertPattern({
        patternType: input.patternType,
        title: input.title,
        description: input.description,
        confidence: input.confidence,
        payload: {
          workspaceId,
          eventId: event.id,
          eventType: event.eventType,
          ...payload,
          ...input.payload
        }
      });
      if (created) patterns.push(created);
      return created;
    };

    const addRecommendation = (input: {
      recommendationType: string;
      title: string;
      message: string;
      confidence: number;
      impactScore: number;
      payload?: Record<string, unknown>;
    }) => {
      const created = this.brainCore.recommendationService.createRecommendation({
        moduleName: "manufacturing_memory",
        recommendationType: input.recommendationType,
        title: input.title,
        message: input.message,
        confidence: input.confidence,
        impactScore: input.impactScore,
        payload: {
          workspaceId,
          eventId: event.id,
          entityType: event.entityType,
          entityId: event.entityId,
          ...input.payload
        }
      });
      if (created) recommendations.push(created);
      return created;
    };

    switch (event.eventType) {
      case "part_dna_detected": {
        const partName = typeof payload.partName === "string" ? payload.partName : `Part ${event.entityId}`;
        const exactMatch = Boolean(payload.exactMatch);
        const nearMatchCount = Number(payload.nearMatchCount ?? 0);
        if (exactMatch) {
          addMemory({
            memoryType: "repeat_customer_part",
            title: `Repeat part detected: ${partName}`,
            summary: `${partName} matched an existing geometry record and should reuse pricing and cut knowledge.`,
            importanceScore: 78,
            payload: { partName }
          });
        }
        if (!exactMatch && nearMatchCount > 0) {
          addPattern({
            patternType: "repeat_customer_part",
            title: `Near-match repeat part pattern`,
            description: `${partName} has ${nearMatchCount} similar historical parts. Pricing and operator notes are worth reviewing.`,
            confidence: clamp(0.72 + nearMatchCount * 0.04, 0, 0.96),
            payload: { partName, nearMatchCount }
          });
          addRecommendation({
            recommendationType: "reuse_part_knowledge",
            title: "Review repeat-part knowledge",
            message: `${partName} is close to previous workshop work. Reuse previous quote, material, and cut-time memory before pricing.`,
            confidence: clamp(0.74 + nearMatchCount * 0.03, 0, 0.95),
            impactScore: 70 + Math.min(20, nearMatchCount * 4),
            payload: { partName, nearMatchCount }
          });
        }
        break;
      }
      case "quote_accepted": {
        const customerName = typeof payload.customerName === "string" ? payload.customerName : "Unknown customer";
        const total = Number(payload.total ?? 0);
        addMemory({
          memoryType: "profitable_job_type",
          title: `Accepted quote for ${customerName}`,
          summary: `Quote ${payload.quoteNumber ?? event.entityId} was accepted${total > 0 ? ` at ${total.toFixed(2)}` : ""}.`,
          importanceScore: clamp(55 + Math.min(35, total / 1000), 35, 95),
          payload: { customerName, total }
        });
        addPattern({
          patternType: "profitable_job_type",
          title: `Accepted quote pattern`,
          description: `${customerName} accepted quote ${payload.quoteNumber ?? event.entityId}.`,
          confidence: 0.78,
          payload: { customerName, total }
        });
        break;
      }
      case "job_completed": {
        const actualCutTimeMinutes = Number(payload.actualCutTimeMinutes ?? payload.actualMinutes ?? 0);
        const estimatedCutTimeMinutes = Number(payload.estimatedCutTimeMinutes ?? 0);
        const ratio = estimatedCutTimeMinutes > 0 ? actualCutTimeMinutes / estimatedCutTimeMinutes : 0;
        const difficult = actualCutTimeMinutes > 0 && (ratio >= 1.35 || actualCutTimeMinutes >= 45);
        if (difficult) {
          addMemory({
            memoryType: "difficult_part",
            title: `Difficult completed job`,
            summary: `Job ${payload.jobNumber ?? event.entityId} ran longer than expected and should retain operator and setup knowledge.`,
            importanceScore: clamp(65 + Math.min(30, actualCutTimeMinutes / 4), 60, 98),
            payload: { actualCutTimeMinutes, estimatedCutTimeMinutes, ratio: round(ratio, 0.01) }
          });
          addRecommendation({
            recommendationType: "capture_job_learning",
            title: "Capture operator learning",
            message: `Job ${payload.jobNumber ?? event.entityId} took longer than expected. Store notes and reuse them for repeat parts.`,
            confidence: clamp(0.8 + Math.min(0.15, ratio / 10), 0, 0.98),
            impactScore: 85,
            payload: { actualCutTimeMinutes, estimatedCutTimeMinutes }
          });
        }
        break;
      }
      case "material_used": {
        const material = typeof payload.material === "string" ? payload.material : "Unknown material";
        const thickness = payload.thickness ?? null;
        addPattern({
          patternType: "recurring_material_usage",
          title: `${material}${thickness !== null && thickness !== undefined ? ` ${thickness}mm` : ""} usage`,
          description: `${material}${thickness !== null && thickness !== undefined ? ` ${thickness}mm` : ""} was consumed in production again.`,
          confidence: 0.76,
          payload: { material, thickness }
        });
        break;
      }
      case "offcut_created": {
        addMemory({
          memoryType: "frequent_offcut_match",
          title: "Reusable offcut created",
          summary: `A new offcut was created and should be considered for future quote and nesting matches.`,
          importanceScore: 62,
          payload
        });
        addPattern({
          patternType: "frequent_offcut_match",
          title: "Offcut reuse opportunity",
          description: `Offcut inventory is growing for this material/thickness combination.`,
          confidence: 0.74,
          payload
        });
        break;
      }
      case "error_detected": {
        const title = typeof payload.title === "string" ? payload.title : `Issue on ${event.entityType}`;
        addMemory({
          memoryType: "common_dxf_error",
          title,
          summary: `Error captured for ${event.entityType} ${event.entityId}.`,
          importanceScore: 80,
          payload
        });
        addPattern({
          patternType: "common_dxf_error",
          title: `Recurring issue signature`,
          description: `Track and cluster this error so it can be prevented before production.`,
          confidence: 0.84,
          payload
        });
        break;
      }
      default:
        break;
    }

    return { memories, patterns, recommendations };
  }

  listMemories(filter?: {
    workspaceId?: string;
    memoryType?: string;
    entityType?: string;
    limit?: number;
  }) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter?.workspaceId?.trim()) {
      clauses.push("json_extract(payloadJson, '$.workspaceId') = ?");
      params.push(filter.workspaceId.trim());
    }
    if (filter?.memoryType?.trim()) {
      clauses.push("memoryType = ?");
      params.push(filter.memoryType.trim());
    }
    if (filter?.entityType?.trim()) {
      clauses.push("entityType = ?");
      params.push(filter.entityType.trim());
    }
    const limit = Math.max(1, Math.min(500, filter?.limit ?? 100));
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(
      `SELECT * FROM manufacturing_memory ${where} ORDER BY id DESC LIMIT ${limit}`
    ).all(...params) as Record<string, unknown>[];
    return rows.map(memoryRow);
  }

  listPatterns(filter?: {
    workspaceId?: string;
    patternType?: string;
    limit?: number;
  }) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter?.workspaceId?.trim()) {
      clauses.push("json_extract(payloadJson, '$.workspaceId') = ?");
      params.push(filter.workspaceId.trim());
    }
    if (filter?.patternType?.trim()) {
      clauses.push("patternType = ?");
      params.push(filter.patternType.trim());
    }
    const limit = Math.max(1, Math.min(500, filter?.limit ?? 100));
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(
      `SELECT * FROM known_patterns ${where} ORDER BY id DESC LIMIT ${limit}`
    ).all(...params) as Record<string, unknown>[];
    return rows.map(patternRow);
  }

  rebuildFromBrainEvents(workspaceId?: string) {
    const existingMemories = this.listMemories({ workspaceId, limit: 1000 });
    const existingPatterns = this.listPatterns({ workspaceId, limit: 1000 });
    for (const entry of existingMemories) {
      this.db.prepare(`DELETE FROM manufacturing_memory WHERE id = ?`).run(entry.id);
    }
    for (const entry of existingPatterns) {
      this.db.prepare(`DELETE FROM known_patterns WHERE id = ?`).run(entry.id);
    }
    const events = this.brainCore.eventService.listEvents({ workspaceId, limit: 1000 });
    for (const event of [...events].reverse()) {
      this.ingestEvent(event);
    }
    return {
      memories: this.listMemories({ workspaceId, limit: 1000 }),
      patterns: this.listPatterns({ workspaceId, limit: 1000 }),
      rebuiltEventCount: events.length
    };
  }

  private createMemory(input: {
    memoryType: string;
    title: string;
    summary: string;
    entityType: string;
    entityId: string;
    importanceScore: number;
    payload: Record<string, unknown>;
  }) {
    const payloadJson = stringifyPayload(input.payload);
    const duplicate = this.db.prepare(
      `SELECT * FROM manufacturing_memory
       WHERE memoryType = ? AND entityType = ? AND entityId = ? AND payloadJson = ?
       ORDER BY id DESC LIMIT 1`
    ).get(input.memoryType, input.entityType, input.entityId, payloadJson) as Record<string, unknown> | undefined;
    if (duplicate) return memoryRow(duplicate);
    const createdAt = new Date().toISOString();
    const result = this.db.prepare(
      `INSERT INTO manufacturing_memory
       (memoryType, title, summary, entityType, entityId, importanceScore, payloadJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.memoryType,
      input.title,
      input.summary,
      input.entityType,
      input.entityId,
      clamp(input.importanceScore, 0, 100),
      payloadJson,
      createdAt
    );
    return memoryRow(
      this.db.prepare(`SELECT * FROM manufacturing_memory WHERE id = ?`).get(Number(result.lastInsertRowid)) as Record<string, unknown>
    );
  }

  private upsertPattern(input: {
    patternType: string;
    title: string;
    description: string;
    confidence: number;
    payload: Record<string, unknown>;
  }) {
    const payloadJson = stringifyPayload(input.payload);
    const duplicate = this.db.prepare(
      `SELECT * FROM known_patterns
       WHERE patternType = ? AND title = ? AND payloadJson = ?
       ORDER BY id DESC LIMIT 1`
    ).get(input.patternType, input.title, payloadJson) as Record<string, unknown> | undefined;
    if (duplicate) return patternRow(duplicate);
    const createdAt = new Date().toISOString();
    const result = this.db.prepare(
      `INSERT INTO known_patterns
       (patternType, title, description, confidence, payloadJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      input.patternType,
      input.title,
      input.description,
      clamp(input.confidence, 0, 1),
      payloadJson,
      createdAt
    );
    return patternRow(
      this.db.prepare(`SELECT * FROM known_patterns WHERE id = ?`).get(Number(result.lastInsertRowid)) as Record<string, unknown>
    );
  }
}
