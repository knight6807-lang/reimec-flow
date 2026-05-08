import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type {
  AnalyzePartDnaInput,
  AnalyzePartDnaResult,
  PartDnaHistoryRow,
  PartDnaNearMatch
} from "./part-dna.js";
import { analyzeAndUpsertPartDna, openPartDnaDatabase } from "./part-dna.js";
import type { BrainCoreService, BrainRecommendationRecord } from "./brain-core.js";

export type BrainPartDnaRecord = {
  id: number;
  workspaceId: string;
  legacyPartId: number | null;
  legacyPartCode: string | null;
  geometryHash: string;
  softHash: string;
  partName: string | null;
  boundingWidth: number;
  boundingHeight: number;
  cutLength: number;
  pierceCount: number;
  holeCount: number;
  complexityScore: number;
  firstSeenAt: string;
  lastSeenAt: string;
  timesSeen: number;
};

export type BrainPartDnaHistoryRecord = {
  id: number;
  workspaceId: string;
  partDnaId: number;
  entityType: string;
  entityId: string;
  customerId: string | null;
  customerName: string | null;
  material: string | null;
  thickness: number | null;
  quotedPrice: number | null;
  actualCutTimeMinutes: number | null;
  operatorNotes: string | null;
  createdAt: string;
};

export type BrainPartDnaNearMatch = PartDnaNearMatch & {
  brainPartDnaId: number | null;
  complexityScore: number | null;
  previousQuotedPrice: number | null;
  previousActualCutTimeMinutes: number | null;
};

export type BrainPartDnaAnalysisResult = AnalyzePartDnaResult & {
  brainPartDnaId: number;
  complexityScore: number;
  customerHistory: BrainPartDnaHistoryRecord[];
  intelligenceRecommendations: BrainRecommendationRecord[];
  nearMatches: BrainPartDnaNearMatch[];
};

type AnalyzeBrainPartDnaInput = AnalyzePartDnaInput & {
  customerId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actualCutTimeMinutes?: number | null;
  operatorNotes?: string | null;
};

function roundTo(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function clampScore(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function computeComplexityScore(analysis: AnalyzePartDnaResult) {
  const sizeFactor = Math.max(1, analysis.boundingBox.width + analysis.boundingBox.height);
  const normalizedCut = (analysis.cutLength / sizeFactor) * 12;
  const score =
    normalizedCut +
    analysis.pierceCount * 2.2 +
    analysis.holeCount * 2.8 +
    Math.max(0, analysis.nearMatches.length - 1) * 0.4;
  return roundTo(clampScore(score, 0, 100), 0.1);
}

function rowToBrainPart(row: Record<string, unknown>): BrainPartDnaRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    legacyPartId: row.legacyPartId === null || row.legacyPartId === undefined ? null : Number(row.legacyPartId),
    legacyPartCode: row.legacyPartCode ? String(row.legacyPartCode) : null,
    geometryHash: String(row.geometryHash ?? ""),
    softHash: String(row.softHash ?? ""),
    partName: row.partName ? String(row.partName) : null,
    boundingWidth: Number(row.boundingWidth ?? 0),
    boundingHeight: Number(row.boundingHeight ?? 0),
    cutLength: Number(row.cutLength ?? 0),
    pierceCount: Number(row.pierceCount ?? 0),
    holeCount: Number(row.holeCount ?? 0),
    complexityScore: Number(row.complexityScore ?? 0),
    firstSeenAt: String(row.firstSeenAt ?? ""),
    lastSeenAt: String(row.lastSeenAt ?? ""),
    timesSeen: Number(row.timesSeen ?? 0)
  };
}

function rowToBrainHistory(row: Record<string, unknown>): BrainPartDnaHistoryRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    partDnaId: Number(row.partDnaId ?? 0),
    entityType: String(row.entityType ?? ""),
    entityId: String(row.entityId ?? ""),
    customerId: row.customerId ? String(row.customerId) : null,
    customerName: row.customerName ? String(row.customerName) : null,
    material: row.material ? String(row.material) : null,
    thickness: row.thickness === null || row.thickness === undefined ? null : Number(row.thickness),
    quotedPrice: row.quotedPrice === null || row.quotedPrice === undefined ? null : Number(row.quotedPrice),
    actualCutTimeMinutes:
      row.actualCutTimeMinutes === null || row.actualCutTimeMinutes === undefined ? null : Number(row.actualCutTimeMinutes),
    operatorNotes: row.operatorNotes ? String(row.operatorNotes) : null,
    createdAt: String(row.createdAt ?? "")
  };
}

function pickPreviousQuotedPrice(history: BrainPartDnaHistoryRecord[]) {
  return history.find((entry) => entry.quotedPrice !== null)?.quotedPrice ?? null;
}

function pickPreviousCutTime(history: BrainPartDnaHistoryRecord[]) {
  return history.find((entry) => entry.actualCutTimeMinutes !== null)?.actualCutTimeMinutes ?? null;
}

export function openBrainPartDnaDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-brain-part-dna.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS part_dna (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      legacyPartId INTEGER,
      legacyPartCode TEXT,
      geometryHash TEXT NOT NULL,
      softHash TEXT NOT NULL,
      partName TEXT,
      boundingWidth REAL NOT NULL,
      boundingHeight REAL NOT NULL,
      cutLength REAL NOT NULL,
      pierceCount INTEGER NOT NULL,
      holeCount INTEGER NOT NULL,
      complexityScore REAL NOT NULL DEFAULT 0,
      firstSeenAt TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL,
      timesSeen INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workspaceId, geometryHash)
    );

    CREATE TABLE IF NOT EXISTS part_dna_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      partDnaId INTEGER NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      customerId TEXT,
      customerName TEXT,
      material TEXT,
      thickness REAL,
      quotedPrice REAL,
      actualCutTimeMinutes REAL,
      operatorNotes TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(partDnaId) REFERENCES part_dna(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_brain_part_dna_workspace_hash ON part_dna(workspaceId, geometryHash);
    CREATE INDEX IF NOT EXISTS idx_brain_part_dna_workspace_soft_hash ON part_dna(workspaceId, softHash);
    CREATE INDEX IF NOT EXISTS idx_brain_part_dna_history_part ON part_dna_history(partDnaId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_brain_part_dna_history_entity ON part_dna_history(workspaceId, entityType, entityId);
  `);
  return db;
}

export class PartDnaBrainService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly legacyPartDnaDb: ReturnType<typeof openPartDnaDatabase>,
    private readonly brainCore: BrainCoreService
  ) {}

  analyzeDxf(input: AnalyzeBrainPartDnaInput): BrainPartDnaAnalysisResult {
    const base = analyzeAndUpsertPartDna(this.legacyPartDnaDb, input);
    const exactMatch = this.upsertBrainPart(input.workspaceId, base);
    const entityType = input.entityType?.trim() || (input.quoteId ? "quote" : "dxf");
    const entityId = input.entityId?.trim() || input.quoteId?.trim() || input.fileName.trim();
    if (entityType && entityId) {
      this.recordHistory({
        workspaceId: input.workspaceId,
        geometryHash: base.geometryHash,
        entityType,
        entityId,
        customerId: input.customerId ?? null,
        customerName: input.customerName?.trim() || null,
        material: input.material?.trim() || null,
        thickness: typeof input.thickness === "number" && Number.isFinite(input.thickness) ? input.thickness : null,
        quotedPrice: input.quotedPrice ?? null,
        actualCutTimeMinutes: input.actualCutTimeMinutes ?? null,
        operatorNotes: input.operatorNotes?.trim() || null
      });
    }

    const customerHistory = this.listHistory(input.workspaceId, exactMatch.id).history;
    const nearMatches = this.listSimilarParts({
      workspaceId: input.workspaceId,
      geometryHash: base.geometryHash,
      softHash: base.softHash,
      excludePartId: exactMatch.id,
      limit: 5
    });

    this.brainCore.eventService.recordEvent({
      eventType: "part_dna_detected",
      entityType: "part_dna",
      entityId: String(exactMatch.id),
      payload: {
        workspaceId: input.workspaceId,
        geometryHash: base.geometryHash,
        softHash: base.softHash,
        partCode: base.partCode,
        partName: base.exactMatchPart.partName ?? input.partName ?? null,
        exactMatch: base.isExistingPart,
        nearMatchCount: nearMatches.length
      },
      links: [
        {
          sourceType: "part_dna",
          sourceId: String(exactMatch.id),
          targetType: "workspace",
          targetId: input.workspaceId,
          linkType: "belongs_to"
        },
        ...(input.customerId || input.customerName
          ? [
              {
                sourceType: "part_dna",
                sourceId: String(exactMatch.id),
                targetType: "customer",
                targetId: input.customerId?.trim() || input.customerName?.trim() || "customer",
                linkType: "seen_for_customer"
              }
            ]
          : []),
        ...(entityType && entityId
          ? [
              {
                sourceType: "part_dna",
                sourceId: String(exactMatch.id),
                targetType: entityType,
                targetId: entityId,
                linkType: "analyzed_for"
              }
            ]
          : [])
      ]
    });

    if (!base.isExistingPart && nearMatches.length) {
      this.brainCore.recommendationService.createRecommendation({
        moduleName: "true_part_dna",
        recommendationType: "similar_part_found",
        title: "Similar previous part found",
        message: `${base.partCode} looks similar to ${nearMatches[0]?.partCode ?? "a previous part"}. Reuse previous quote and cut history before pricing.`,
        confidence: clampScore((nearMatches[0]?.similarityPercent ?? 0) / 100, 0, 1),
        impactScore: clampScore((nearMatches[0]?.similarityPercent ?? 0) * 0.8, 0, 100),
        payload: {
          workspaceId: input.workspaceId,
          partDnaId: exactMatch.id,
          geometryHash: base.geometryHash,
          nearMatchIds: nearMatches.map((match) => match.id)
        }
      });
    }

    const intelligenceRecommendations = this.brainCore.recommendationService.listRecommendations({
      workspaceId: input.workspaceId,
      status: "open",
      moduleName: "true_part_dna",
      limit: 20
    }).filter((entry) => {
      try {
        const payload = JSON.parse(entry.payloadJson) as Record<string, unknown>;
        return Number(payload.partDnaId) === exactMatch.id;
      } catch {
        return false;
      }
    });

    return {
      ...base,
      brainPartDnaId: exactMatch.id,
      complexityScore: exactMatch.complexityScore,
      customerHistory,
      intelligenceRecommendations,
      nearMatches
    };
  }

  listHistory(workspaceId: string, partDnaId: number) {
    const partRow = this.db.prepare(`SELECT * FROM part_dna WHERE id = ? AND workspaceId = ?`).get(partDnaId, workspaceId) as
      | Record<string, unknown>
      | undefined;
    if (!partRow) {
      return { part: null as BrainPartDnaRecord | null, history: [] as BrainPartDnaHistoryRecord[] };
    }
    const historyRows = this.db.prepare(
      `SELECT * FROM part_dna_history WHERE workspaceId = ? AND partDnaId = ? ORDER BY createdAt DESC, id DESC`
    ).all(workspaceId, partDnaId) as Record<string, unknown>[];
    return {
      part: rowToBrainPart(partRow),
      history: historyRows.map((row) => rowToBrainHistory(row))
    };
  }

  listSimilarParts(input: {
    workspaceId: string;
    geometryHash?: string | null;
    softHash?: string | null;
    partDnaId?: number | null;
    excludePartId?: number | null;
    limit?: number;
  }) {
    const subjectRow = input.partDnaId
      ? (this.db.prepare(`SELECT * FROM part_dna WHERE id = ? AND workspaceId = ?`).get(input.partDnaId, input.workspaceId) as
          | Record<string, unknown>
          | undefined)
      : undefined;
    const geometryHash = input.geometryHash?.trim() || (subjectRow ? String(subjectRow.geometryHash ?? "") : "");
    const softHash = input.softHash?.trim() || (subjectRow ? String(subjectRow.softHash ?? "") : "");
    if (!geometryHash && !softHash) return [] as BrainPartDnaNearMatch[];
    const limit = Math.max(1, Math.min(20, input.limit ?? 5));
    const exact = subjectRow ? rowToBrainPart(subjectRow) : null;
    const rows = this.db.prepare(
      `SELECT * FROM part_dna
       WHERE workspaceId = ?
         AND id != COALESCE(?, -1)
         AND geometryHash != COALESCE(?, '')
         AND (
           softHash = COALESCE(?, softHash)
           OR ABS(boundingWidth - COALESCE(?, boundingWidth)) <= MAX(5, COALESCE(?, boundingWidth) * 0.2)
           OR ABS(boundingHeight - COALESCE(?, boundingHeight)) <= MAX(5, COALESCE(?, boundingHeight) * 0.2)
         )
       ORDER BY lastSeenAt DESC
       LIMIT ?`
    ).all(
      input.workspaceId,
      input.excludePartId ?? input.partDnaId ?? null,
      geometryHash || null,
      softHash || null,
      exact?.boundingWidth ?? null,
      exact?.boundingWidth ?? null,
      exact?.boundingHeight ?? null,
      exact?.boundingHeight ?? null,
      limit * 5
    ) as Record<string, unknown>[];

    const target = exact ?? (rows[0] ? rowToBrainPart(rows[0]) : null);
    if (!target) return [];

    return rows
      .map((row) => rowToBrainPart(row))
      .map((candidate) => {
        const widthScore = 1 - Math.min(1, Math.abs(candidate.boundingWidth - target.boundingWidth) / Math.max(target.boundingWidth, candidate.boundingWidth, 1));
        const heightScore = 1 - Math.min(1, Math.abs(candidate.boundingHeight - target.boundingHeight) / Math.max(target.boundingHeight, candidate.boundingHeight, 1));
        const cutScore = 1 - Math.min(1, Math.abs(candidate.cutLength - target.cutLength) / Math.max(target.cutLength, candidate.cutLength, 1));
        const pierceScore =
          candidate.pierceCount === target.pierceCount
            ? 1
            : 1 - Math.min(1, Math.abs(candidate.pierceCount - target.pierceCount) / Math.max(candidate.pierceCount, target.pierceCount, 1));
        const holeScore = candidate.holeCount === target.holeCount ? 1 : 0;
        const similarityPercent = Math.round(clampScore(widthScore * 0.24 + heightScore * 0.24 + cutScore * 0.24 + pierceScore * 0.16 + holeScore * 0.12 + (candidate.softHash === target.softHash ? 0.08 : 0), 0, 1) * 100);
        const history = this.listHistory(input.workspaceId, candidate.id).history;
        return {
          id: candidate.id,
          brainPartDnaId: candidate.id,
          partCode: candidate.legacyPartCode ?? `PDNA-BRAIN-${candidate.id}`,
          partName: candidate.partName,
          material: history.find((entry) => entry.material)?.material ?? null,
          thickness: history.find((entry) => entry.thickness !== null)?.thickness ?? null,
          similarityPercent,
          timesQuoted: history.filter((entry) => entry.quotedPrice !== null).length,
          timesSeen: candidate.timesSeen,
          boundingWidth: candidate.boundingWidth,
          boundingHeight: candidate.boundingHeight,
          cutLength: candidate.cutLength,
          pierceCount: candidate.pierceCount,
          holeCount: candidate.holeCount,
          complexityScore: candidate.complexityScore,
          previousQuotedPrice: pickPreviousQuotedPrice(history),
          previousActualCutTimeMinutes: pickPreviousCutTime(history),
          lastSeenAt: candidate.lastSeenAt
        };
      })
      .filter((entry) => entry.similarityPercent >= 70)
      .sort((left, right) => right.similarityPercent - left.similarityPercent)
      .slice(0, limit);
  }

  recordHistory(input: {
    workspaceId: string;
    geometryHash?: string | null;
    partCode?: string | null;
    entityType: string;
    entityId: string;
    customerId?: string | null;
    customerName?: string | null;
    material?: string | null;
    thickness?: number | null;
    quotedPrice?: number | null;
    actualCutTimeMinutes?: number | null;
    operatorNotes?: string | null;
  }) {
    const partRow = input.geometryHash?.trim()
      ? (this.db.prepare(`SELECT * FROM part_dna WHERE workspaceId = ? AND geometryHash = ?`).get(input.workspaceId, input.geometryHash.trim()) as
          | Record<string, unknown>
          | undefined)
      : input.partCode?.trim()
        ? (this.db.prepare(`SELECT * FROM part_dna WHERE workspaceId = ? AND legacyPartCode = ?`).get(input.workspaceId, input.partCode.trim()) as
            | Record<string, unknown>
            | undefined)
        : undefined;
    if (!partRow) return null;
    const part = rowToBrainPart(partRow);
    const existing = this.db.prepare(
      `SELECT id FROM part_dna_history WHERE workspaceId = ? AND partDnaId = ? AND entityType = ? AND entityId = ? LIMIT 1`
    ).get(input.workspaceId, part.id, input.entityType.trim(), input.entityId.trim()) as Record<string, unknown> | undefined;
    if (existing) {
      this.db.prepare(
        `UPDATE part_dna_history
         SET customerId = COALESCE(?, customerId),
             customerName = COALESCE(?, customerName),
             material = COALESCE(?, material),
             thickness = COALESCE(?, thickness),
             quotedPrice = COALESCE(?, quotedPrice),
             actualCutTimeMinutes = COALESCE(?, actualCutTimeMinutes),
             operatorNotes = COALESCE(?, operatorNotes)
         WHERE id = ?`
      ).run(
        input.customerId?.trim() || null,
        input.customerName?.trim() || null,
        input.material?.trim() || null,
        input.thickness ?? null,
        input.quotedPrice ?? null,
        input.actualCutTimeMinutes ?? null,
        input.operatorNotes?.trim() || null,
        Number(existing.id)
      );
      return this.db.prepare(`SELECT * FROM part_dna_history WHERE id = ?`).get(Number(existing.id)) as Record<string, unknown>;
    }

    const createdAt = new Date().toISOString();
    const result = this.db.prepare(
      `INSERT INTO part_dna_history
       (workspaceId, partDnaId, entityType, entityId, customerId, customerName, material, thickness, quotedPrice, actualCutTimeMinutes, operatorNotes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.workspaceId,
      part.id,
      input.entityType.trim(),
      input.entityId.trim(),
      input.customerId?.trim() || null,
      input.customerName?.trim() || null,
      input.material?.trim() || null,
      input.thickness ?? null,
      input.quotedPrice ?? null,
      input.actualCutTimeMinutes ?? null,
      input.operatorNotes?.trim() || null,
      createdAt
    );

    this.brainCore.memoryService.linkEntities({
      sourceType: "part_dna",
      sourceId: String(part.id),
      targetType: input.entityType.trim(),
      targetId: input.entityId.trim(),
      linkType: "history_for"
    });

    return rowToBrainHistory(
      this.db.prepare(`SELECT * FROM part_dna_history WHERE id = ?`).get(Number(result.lastInsertRowid)) as Record<string, unknown>
    );
  }

  private upsertBrainPart(workspaceId: string, analysis: AnalyzePartDnaResult) {
    const now = new Date().toISOString();
    const complexityScore = computeComplexityScore(analysis);
    const existing = this.db.prepare(`SELECT * FROM part_dna WHERE workspaceId = ? AND geometryHash = ?`).get(workspaceId, analysis.geometryHash) as
      | Record<string, unknown>
      | undefined;
    if (existing) {
      this.db.prepare(
        `UPDATE part_dna
         SET legacyPartId = ?,
             legacyPartCode = ?,
             softHash = ?,
             partName = COALESCE(?, partName),
             boundingWidth = ?,
             boundingHeight = ?,
             cutLength = ?,
             pierceCount = ?,
             holeCount = ?,
             complexityScore = ?,
             lastSeenAt = ?,
             timesSeen = timesSeen + 1
         WHERE id = ?`
      ).run(
        analysis.partId,
        analysis.partCode,
        analysis.softHash,
        analysis.exactMatchPart.partName ?? null,
        analysis.boundingBox.width,
        analysis.boundingBox.height,
        analysis.cutLength,
        analysis.pierceCount,
        analysis.holeCount,
        complexityScore,
        now,
        Number(existing.id)
      );
      return rowToBrainPart(this.db.prepare(`SELECT * FROM part_dna WHERE id = ?`).get(Number(existing.id)) as Record<string, unknown>);
    }

    const result = this.db.prepare(
      `INSERT INTO part_dna
       (workspaceId, legacyPartId, legacyPartCode, geometryHash, softHash, partName, boundingWidth, boundingHeight, cutLength, pierceCount, holeCount, complexityScore, firstSeenAt, lastSeenAt, timesSeen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      workspaceId,
      analysis.partId,
      analysis.partCode,
      analysis.geometryHash,
      analysis.softHash,
      analysis.exactMatchPart.partName ?? null,
      analysis.boundingBox.width,
      analysis.boundingBox.height,
      analysis.cutLength,
      analysis.pierceCount,
      analysis.holeCount,
      complexityScore,
      now,
      now
    );
    return rowToBrainPart(this.db.prepare(`SELECT * FROM part_dna WHERE id = ?`).get(Number(result.lastInsertRowid)) as Record<string, unknown>);
  }
}
