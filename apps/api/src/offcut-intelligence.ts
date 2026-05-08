import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService, BrainRecommendationRecord } from "./brain-core.js";
import type { OffcutRecord, StockSheetRecord } from "./stock-material.js";
import {
  buildQuoteStockSuggestion,
  getAvailableOffcuts,
  getOffcut,
  listOffcuts,
  markSpecificOffcutUsed,
  reserveSpecificOffcut
} from "./stock-material.js";

export type OffcutFitType = "normal" | "rotated" | "partial";

export type OffcutIntelligenceRecord = {
  id: number;
  offcutId: number;
  material: string;
  thickness: number;
  width: number;
  height: number;
  usableArea: number;
  shapeJson: string | null;
  location: string | null;
  timesSuggested: number;
  timesUsed: number;
  createdAt: string;
};

export type OffcutMatchRecord = {
  id: number;
  offcutId: number;
  jobId: string | null;
  quoteId: string | null;
  partDnaId: number | null;
  fitType: OffcutFitType;
  wasteArea: number;
  savingEstimate: number;
  confidence: number;
  createdAt: string;
};

export type OffcutMatchResult = {
  offcut: OffcutRecord | null;
  intelligence: OffcutIntelligenceRecord | null;
  match: OffcutMatchRecord | null;
  recommendation: BrainRecommendationRecord | null;
  fitType: OffcutFitType | null;
  wasteArea: number;
  savingEstimate: number;
  confidence: number;
  fullSheetFallback: StockSheetRecord | null;
  message: string;
};

export type OffcutRecommendationView = {
  recommendation: BrainRecommendationRecord;
  offcut: OffcutRecord | null;
  intelligence: OffcutIntelligenceRecord | null;
  latestMatch: OffcutMatchRecord | null;
};

type FindOffcutMatchInput = {
  workspaceId: string;
  material: string;
  thickness: number;
  requiredWidth: number;
  requiredHeight: number;
  jobId?: string | null;
  quoteId?: string | null;
  partDnaId?: number | null;
  entityLabel?: string | null;
};

type UseSuggestedOffcutInput = {
  workspaceId: string;
  offcutId: number;
  action?: "reserve" | "use";
  jobId?: string | null;
  quoteId?: string | null;
  partDnaId?: number | null;
  requiredWidth?: number | null;
  requiredHeight?: number | null;
};

function round(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function parseJsonObject(value: string | null | undefined) {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function computeFit(width: number, height: number, requiredWidth: number, requiredHeight: number) {
  const fitsNormal = width >= requiredWidth && height >= requiredHeight;
  const fitsRotated = height >= requiredWidth && width >= requiredHeight;
  const requiredArea = requiredWidth * requiredHeight;
  const stockArea = width * height;
  const wasteArea = Math.max(0, stockArea - requiredArea);
  return { fitsNormal, fitsRotated, wasteArea, requiredArea, stockArea };
}

function computePartialDeficit(width: number, height: number, requiredWidth: number, requiredHeight: number) {
  const normalShortWidth = Math.max(0, requiredWidth - width);
  const normalShortHeight = Math.max(0, requiredHeight - height);
  const rotatedShortWidth = Math.max(0, requiredWidth - height);
  const rotatedShortHeight = Math.max(0, requiredHeight - width);
  const normalDeficit = normalShortWidth * Math.max(requiredHeight, height) + normalShortHeight * Math.max(requiredWidth, width);
  const rotatedDeficit = rotatedShortWidth * Math.max(requiredHeight, width) + rotatedShortHeight * Math.max(requiredWidth, height);
  return Math.min(normalDeficit, rotatedDeficit);
}

function rowToIntelligence(row: Record<string, unknown>): OffcutIntelligenceRecord {
  return {
    id: Number(row.id ?? 0),
    offcutId: Number(row.offcutId ?? 0),
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    width: Number(row.width ?? 0),
    height: Number(row.height ?? 0),
    usableArea: Number(row.usableArea ?? 0),
    shapeJson: row.shapeJson ? String(row.shapeJson) : null,
    location: row.location ? String(row.location) : null,
    timesSuggested: Number(row.timesSuggested ?? 0),
    timesUsed: Number(row.timesUsed ?? 0),
    createdAt: String(row.createdAt ?? "")
  };
}

function rowToMatch(row: Record<string, unknown>): OffcutMatchRecord {
  return {
    id: Number(row.id ?? 0),
    offcutId: Number(row.offcutId ?? 0),
    jobId: row.jobId ? String(row.jobId) : null,
    quoteId: row.quoteId ? String(row.quoteId) : null,
    partDnaId: row.partDnaId === null || row.partDnaId === undefined ? null : Number(row.partDnaId),
    fitType: row.fitType === "rotated" || row.fitType === "partial" ? row.fitType : "normal",
    wasteArea: Number(row.wasteArea ?? 0),
    savingEstimate: Number(row.savingEstimate ?? 0),
    confidence: Number(row.confidence ?? 0),
    createdAt: String(row.createdAt ?? "")
  };
}

export function openOffcutIntelligenceDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-offcut-intelligence.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS offcut_intelligence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offcutId INTEGER NOT NULL UNIQUE,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      usableArea REAL NOT NULL,
      shapeJson TEXT,
      location TEXT,
      timesSuggested INTEGER NOT NULL DEFAULT 0,
      timesUsed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offcut_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offcutId INTEGER NOT NULL,
      jobId TEXT,
      quoteId TEXT,
      partDnaId INTEGER,
      fitType TEXT NOT NULL,
      wasteArea REAL NOT NULL DEFAULT 0,
      savingEstimate REAL NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_offcut_intelligence_material ON offcut_intelligence(material, thickness);
    CREATE INDEX IF NOT EXISTS idx_offcut_matches_offcut ON offcut_matches(offcutId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_offcut_matches_job ON offcut_matches(jobId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_offcut_matches_quote ON offcut_matches(quoteId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_offcut_matches_part_dna ON offcut_matches(partDnaId, createdAt DESC);
  `);
  return db;
}

export class OffcutIntelligenceService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly stockDb: DatabaseSync,
    private readonly brainCore: BrainCoreService
  ) {}

  syncInventory() {
    const offcuts = listOffcuts(this.stockDb);
    return offcuts.map((offcut) => this.upsertOffcut(offcut));
  }

  findMatch(input: FindOffcutMatchInput): OffcutMatchResult {
    const material = input.material.trim();
    const thickness = Number(input.thickness);
    const requiredWidth = Number(input.requiredWidth);
    const requiredHeight = Number(input.requiredHeight);
    if (!material || !Number.isFinite(thickness) || thickness <= 0 || !Number.isFinite(requiredWidth) || requiredWidth <= 0 || !Number.isFinite(requiredHeight) || requiredHeight <= 0) {
      throw new Error("material, thickness, requiredWidth, and requiredHeight are required");
    }

    this.syncInventory();
    const availableOffcuts = getAvailableOffcuts(this.stockDb, { material, thickness });
    const stockSuggestion = buildQuoteStockSuggestion(this.stockDb, {
      material,
      thickness,
      requiredWidth,
      requiredHeight
    });
    const fullSheetFallback = stockSuggestion.bestSheet ? {
      ...stockSuggestion.bestSheet
    } : null;

    if (availableOffcuts.length === 0) {
      return {
        offcut: null,
        intelligence: null,
        match: null,
        recommendation: null,
        fitType: null,
        wasteArea: 0,
        savingEstimate: 0,
        confidence: 0,
        fullSheetFallback,
        message: "No available offcuts. Use full sheet or order material."
      };
    }

    const exactCandidates = availableOffcuts
      .map((offcut) => {
        const fit = computeFit(offcut.width, offcut.height, requiredWidth, requiredHeight);
        if (!fit.fitsNormal && !fit.fitsRotated) return null;
        const fitType: OffcutFitType = fit.fitsNormal ? "normal" : "rotated";
        return { offcut, fit, fitType };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const a = left!;
        const b = right!;
        return a.fit.wasteArea - b.fit.wasteArea || a.fit.stockArea - b.fit.stockArea;
      }) as Array<{ offcut: OffcutRecord; fit: ReturnType<typeof computeFit>; fitType: OffcutFitType }>;

    const selectedExact = exactCandidates[0] ?? null;
    const selectedPartial = !selectedExact
      ? availableOffcuts
          .map((offcut) => ({
            offcut,
            fit: computeFit(offcut.width, offcut.height, requiredWidth, requiredHeight),
            deficit: computePartialDeficit(offcut.width, offcut.height, requiredWidth, requiredHeight)
          }))
          .sort((left, right) => left.deficit - right.deficit || left.fit.stockArea - right.fit.stockArea)[0] ?? null
      : null;

    const selectedOffcut = selectedExact?.offcut ?? selectedPartial?.offcut ?? null;
    if (!selectedOffcut) {
      return {
        offcut: null,
        intelligence: null,
        match: null,
        recommendation: null,
        fitType: null,
        wasteArea: 0,
        savingEstimate: 0,
        confidence: 0,
        fullSheetFallback,
        message: "No offcut recommendation available."
      };
    }

    const fitType: OffcutFitType = selectedExact?.fitType ?? "partial";
    const wasteArea = round(selectedExact?.fit.wasteArea ?? 0);
    const savingEstimate = round(
      fitType === "partial"
        ? 0
        : stockSuggestion.bestOffcut?.id === selectedOffcut.id
          ? stockSuggestion.estimatedSaving
          : fullSheetFallback?.costPerSheet
            ? Math.max(fullSheetFallback.costPerSheet * 0.15, 0)
            : 0
    );
    const confidence = round(
      fitType === "normal"
        ? clamp(0.9 - wasteArea / Math.max(1, selectedOffcut.usableArea * 5), 0.55, 0.96)
        : fitType === "rotated"
          ? clamp(0.84 - wasteArea / Math.max(1, selectedOffcut.usableArea * 6), 0.5, 0.9)
          : clamp(
              0.42 -
                computePartialDeficit(selectedOffcut.width, selectedOffcut.height, requiredWidth, requiredHeight) /
                  Math.max(1, requiredWidth * requiredHeight * 2.5),
              0.12,
              0.45
            ),
      0.01
    );

    const intelligence = this.upsertOffcut(selectedOffcut);
    const match = this.recordMatch({
      offcutId: selectedOffcut.id,
      jobId: input.jobId?.trim() || null,
      quoteId: input.quoteId?.trim() || null,
      partDnaId: Number.isFinite(input.partDnaId) ? Number(input.partDnaId) : null,
      fitType,
      wasteArea,
      savingEstimate,
      confidence
    });

    this.bumpSuggestedCount(intelligence.offcutId);
    let recommendation: BrainRecommendationRecord | null = null;
    if (fitType !== "partial") {
      const targetLabel = input.entityLabel?.trim() || input.jobId?.trim() || input.quoteId?.trim() || "this work";
      recommendation =
        this.brainCore.recommendationService.createRecommendation({
          moduleName: "offcut_intelligence",
          recommendationType: "offcut_fit_match",
          title: `Use offcut ${selectedOffcut.material} ${selectedOffcut.thickness}mm`,
          message: `Offcut ${selectedOffcut.width} x ${selectedOffcut.height} at ${selectedOffcut.location ?? "stock"} fits ${targetLabel} with ${fitType} fit and ${savingEstimate > 0 ? `~${savingEstimate.toFixed(2)} saving` : "reduced material waste"}.`,
          confidence,
          impactScore: clamp(Math.round(62 + confidence * 30 + Math.min(8, savingEstimate / 100)), 35, 95),
          payload: {
            workspaceId: input.workspaceId,
            offcutId: selectedOffcut.id,
            matchId: match.id,
            jobId: input.jobId?.trim() || null,
            quoteId: input.quoteId?.trim() || null,
            partDnaId: Number.isFinite(input.partDnaId) ? Number(input.partDnaId) : null,
            fitType,
            savingEstimate,
            material,
            thickness
          }
        }) ?? null;
    }

    return {
      offcut: selectedOffcut,
      intelligence,
      match,
      recommendation,
      fitType,
      wasteArea,
      savingEstimate,
      confidence,
      fullSheetFallback,
      message:
        fitType === "partial"
          ? "Closest offcut found, but it does not fully fit."
          : `Best offcut fit found (${fitType}).`
    };
  }

  listRecommendations(workspaceId?: string, limit = 50) {
    const recommendations = this.brainCore.recommendationService.listRecommendations({
      moduleName: "offcut_intelligence",
      workspaceId: workspaceId?.trim() || undefined,
      status: "all",
      limit
    });
    return recommendations.map((recommendation) => {
      const payload = parseJsonObject(recommendation.payloadJson);
      const offcutId = Number(payload.offcutId ?? 0);
      const offcut = offcutId > 0 ? getOffcut(this.stockDb, offcutId) : null;
      const intelligence = offcutId > 0 ? this.getIntelligenceByOffcutId(offcutId) : null;
      const latestMatch = offcutId > 0 ? this.getLatestMatchForOffcut(offcutId) : null;
      return { recommendation, offcut, intelligence, latestMatch } satisfies OffcutRecommendationView;
    });
  }

  useSuggestedOffcut(input: UseSuggestedOffcutInput) {
    const offcutId = Number(input.offcutId);
    if (!Number.isFinite(offcutId) || offcutId <= 0) {
      throw new Error("Valid offcutId is required");
    }
    const offcut = getOffcut(this.stockDb, offcutId);
    if (!offcut) throw new Error("Offcut not found");
    if (offcut.status === "used" || offcut.status === "scrapped") {
      throw new Error("This offcut is no longer available");
    }

    const reservationKey = input.jobId?.trim() || (input.quoteId?.trim() ? `quote:${input.quoteId.trim()}` : `offcut:${offcutId}`);
    const action = input.action === "use" ? "use" : "reserve";
    const result =
      action === "use"
        ? markSpecificOffcutUsed(this.stockDb, offcutId, reservationKey)
        : reserveSpecificOffcut(this.stockDb, offcutId, reservationKey);
    if (!result) {
      throw new Error(action === "use" ? "Failed to mark offcut used" : "Failed to reserve offcut");
    }

    this.bumpUsedCount(offcutId);
    const match = this.recordMatch({
      offcutId,
      jobId: input.jobId?.trim() || null,
      quoteId: input.quoteId?.trim() || null,
      partDnaId: Number.isFinite(input.partDnaId) ? Number(input.partDnaId) : null,
      fitType: "normal",
      wasteArea: 0,
      savingEstimate: 0,
      confidence: 1
    });
    this.brainCore.eventService.recordEvent({
      eventType: action === "use" ? "material_used" : "material_reserved",
      entityType: "offcut",
      entityId: String(offcutId),
      payload: {
        workspaceId: input.workspaceId,
        offcutId,
        jobId: input.jobId?.trim() || null,
        quoteId: input.quoteId?.trim() || null,
        partDnaId: Number.isFinite(input.partDnaId) ? Number(input.partDnaId) : null,
        material: offcut.material,
        thickness: offcut.thickness,
        width: offcut.width,
        height: offcut.height,
        reservationKey
      },
      links: [
        {
          sourceType: "offcut",
          sourceId: String(offcutId),
          targetType: "workspace",
          targetId: input.workspaceId,
          linkType: "belongs_to"
        },
        ...(input.jobId?.trim()
          ? [
              {
                sourceType: "offcut",
                sourceId: String(offcutId),
                targetType: "job",
                targetId: input.jobId.trim(),
                linkType: action === "use" ? "used_for" : "reserved_for"
              }
            ]
          : []),
        ...(input.quoteId?.trim()
          ? [
              {
                sourceType: "offcut",
                sourceId: String(offcutId),
                targetType: "quote",
                targetId: input.quoteId.trim(),
                linkType: action === "use" ? "used_for" : "reserved_for"
              }
            ]
          : [])
      ]
    });

    return {
      offcut: result,
      intelligence: this.getIntelligenceByOffcutId(offcutId),
      match
    };
  }

  private upsertOffcut(offcut: OffcutRecord) {
    const existing = this.getIntelligenceByOffcutId(offcut.id);
    if (existing) {
      this.db.prepare(
        `UPDATE offcut_intelligence
         SET material = ?, thickness = ?, width = ?, height = ?, usableArea = ?, shapeJson = ?, location = ?
         WHERE offcutId = ?`
      ).run(
        offcut.material,
        offcut.thickness,
        offcut.width,
        offcut.height,
        offcut.usableArea,
        offcut.shapeData ?? null,
        offcut.location ?? null,
        offcut.id
      );
      return this.getIntelligenceByOffcutId(offcut.id)!;
    }

    const createdAt = offcut.createdAt || new Date().toISOString();
    this.db.prepare(
      `INSERT INTO offcut_intelligence
       (offcutId, material, thickness, width, height, usableArea, shapeJson, location, timesSuggested, timesUsed, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
    ).run(
      offcut.id,
      offcut.material,
      offcut.thickness,
      offcut.width,
      offcut.height,
      offcut.usableArea,
      offcut.shapeData ?? null,
      offcut.location ?? null,
      createdAt
    );
    return this.getIntelligenceByOffcutId(offcut.id)!;
  }

  private getIntelligenceByOffcutId(offcutId: number) {
    const row = this.db.prepare(`SELECT * FROM offcut_intelligence WHERE offcutId = ? LIMIT 1`).get(offcutId) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToIntelligence(row) : null;
  }

  private getLatestMatchForOffcut(offcutId: number) {
    const row = this.db.prepare(`SELECT * FROM offcut_matches WHERE offcutId = ? ORDER BY id DESC LIMIT 1`).get(offcutId) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToMatch(row) : null;
  }

  private bumpSuggestedCount(offcutId: number) {
    this.db.prepare(`UPDATE offcut_intelligence SET timesSuggested = timesSuggested + 1 WHERE offcutId = ?`).run(offcutId);
  }

  private bumpUsedCount(offcutId: number) {
    this.db.prepare(`UPDATE offcut_intelligence SET timesUsed = timesUsed + 1 WHERE offcutId = ?`).run(offcutId);
  }

  private recordMatch(input: {
    offcutId: number;
    jobId: string | null;
    quoteId: string | null;
    partDnaId: number | null;
    fitType: OffcutFitType;
    wasteArea: number;
    savingEstimate: number;
    confidence: number;
  }) {
    const createdAt = new Date().toISOString();
    const inserted = this.db.prepare(
      `INSERT INTO offcut_matches
       (offcutId, jobId, quoteId, partDnaId, fitType, wasteArea, savingEstimate, confidence, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.offcutId,
      input.jobId,
      input.quoteId,
      input.partDnaId,
      input.fitType,
      input.wasteArea,
      input.savingEstimate,
      input.confidence,
      createdAt
    );
    const row = this.db.prepare(`SELECT * FROM offcut_matches WHERE id = ?`).get(Number(inserted.lastInsertRowid)) as Record<string, unknown>;
    return rowToMatch(row);
  }
}
