import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService, BrainRecommendationRecord } from "./brain-core.js";
import type { ManufacturingMemoryService, KnownPatternRecord } from "./manufacturing-memory.js";
import type { StockSnapshot } from "./stock-material.js";
import type { JobRecord, QuoteRecord, QuoteSection, QuotePart } from "./store.js";

export type MaterialUsageForecastRecord = {
  id: number;
  workspaceId: string;
  material: string;
  thickness: number;
  forecastPeriodDays: number;
  predictedSheetsNeeded: number;
  predictedKgNeeded: number;
  confidence: number;
  basedOnJobsCount: number;
  basedOnQuoteCount: number;
  createdAt: string;
};

export type MaterialPredictionRuleRecord = {
  id: number;
  workspaceId: string;
  material: string;
  thickness: number;
  minimumSheets: number;
  leadTimeDays: number;
  preferredSupplier: string | null;
  createdAt: string;
};

export type MaterialShortageRecord = {
  material: string;
  thickness: number;
  forecastPeriodDays: number;
  predictedSheetsNeeded: number;
  predictedKgNeeded: number;
  availableEquivalentSheets: number;
  availableSheets: number;
  minimumSheets: number;
  shortageSheets: number;
  confidence: number;
  leadTimeDays: number;
  recommendedBuySheets: number;
  preferredSupplier: string | null;
  recommendation: string;
};

type ForecastSourceInput = {
  workspaceId: string;
  jobs: JobRecord[];
  quotes: QuoteRecord[];
  stockSnapshot: StockSnapshot;
  forecastPeriodsDays?: number[];
};

type MaterialAggregate = {
  material: string;
  thickness: number;
  areaSqm: number;
  kg: number;
  jobsCount: number;
  quoteCount: number;
  repeatBoost: number;
  confidence: number;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function materialKey(material: string, thickness: number) {
  return `${material.trim().toLowerCase()}|${round(thickness, 0.001)}`;
}

function parsePayloadJson(payloadJson: string) {
  try {
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function quotePartsFromQuote(quote: QuoteRecord) {
  const sections = Object.values(quote.sections ?? {}) as QuoteSection[];
  return sections.flatMap((section) => section.parts ?? []);
}

function densityForMaterial(material: string, snapshot: StockSnapshot) {
  const normalized = material.trim().toLowerCase();
  const explicit = snapshot.materials.find((entry) => entry.name.trim().toLowerCase() === normalized)?.defaultDensity;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) return explicit;
  if (normalized.includes("stainless")) return 8000;
  if (normalized.includes("aluminium") || normalized.includes("aluminum")) return 2700;
  return 7850;
}

function sheetAreaSqm(width: number, height: number) {
  return Math.max(0, width) * Math.max(0, height) / 1_000_000;
}

function averageSheetAreaSqm(stockSnapshot: StockSnapshot, material: string, thickness: number) {
  const sheets = stockSnapshot.sheets.filter((sheet) =>
    sheet.status === "available" &&
    sheet.material.trim().toLowerCase() === material.trim().toLowerCase() &&
    Math.abs(sheet.thickness - thickness) < 0.0001
  );
  if (sheets.length === 0) return 4.5;
  const totalArea = sheets.reduce((sum, sheet) => sum + sheetAreaSqm(sheet.width, sheet.height), 0);
  return Math.max(0.5, totalArea / sheets.length);
}

function availableStockEquivalent(stockSnapshot: StockSnapshot, material: string, thickness: number) {
  const matchingSheets = stockSnapshot.sheets.filter((sheet) =>
    sheet.status === "available" &&
    sheet.material.trim().toLowerCase() === material.trim().toLowerCase() &&
    Math.abs(sheet.thickness - thickness) < 0.0001
  );
  const matchingOffcuts = stockSnapshot.offcuts.filter((offcut) =>
    offcut.status === "available" &&
    offcut.material.trim().toLowerCase() === material.trim().toLowerCase() &&
    Math.abs(offcut.thickness - thickness) < 0.0001
  );
  const averageAreaSqm = averageSheetAreaSqm(stockSnapshot, material, thickness);
  const availableSheets = matchingSheets.reduce((sum, sheet) => sum + Math.max(0, sheet.quantity), 0);
  const offcutEquivalent = matchingOffcuts.reduce((sum, offcut) => {
    const areaSqm = offcut.usableArea > 0 ? offcut.usableArea / 1_000_000 : sheetAreaSqm(offcut.width, offcut.height);
    return sum + areaSqm / Math.max(0.5, averageAreaSqm);
  }, 0);
  return {
    availableSheets,
    availableEquivalentSheets: round(availableSheets + offcutEquivalent, 0.01),
    averageAreaSqm
  };
}

function quoteStatusProbability(status: QuoteRecord["status"]) {
  if (status === "accepted") return 0.92;
  if (status === "sent") return 0.45;
  return 0.2;
}

function recentWeight(createdAt: string, periodDays: number, multiplier = 3) {
  const createdTime = Date.parse(createdAt);
  if (!Number.isFinite(createdTime)) return 0;
  const ageDays = Math.max(0, (Date.now() - createdTime) / 86_400_000);
  const windowDays = Math.max(periodDays * multiplier, 21);
  if (ageDays > windowDays) return 0;
  const freshness = 1 - ageDays / windowDays;
  return clamp(0.25 + freshness * 0.75, 0, 1);
}

function addAggregate(
  aggregates: Map<string, MaterialAggregate>,
  input: {
    material: string;
    thickness: number;
    areaSqm: number;
    kg: number;
    jobsCount?: number;
    quoteCount?: number;
    confidence: number;
    repeatBoost?: number;
  }
) {
  const material = input.material.trim();
  const thickness = round(input.thickness, 0.001);
  if (!material || !Number.isFinite(thickness) || thickness <= 0) return;
  const key = materialKey(material, thickness);
  const current = aggregates.get(key) ?? {
    material,
    thickness,
    areaSqm: 0,
    kg: 0,
    jobsCount: 0,
    quoteCount: 0,
    repeatBoost: 0,
    confidence: 0
  };
  current.areaSqm += Math.max(0, input.areaSqm);
  current.kg += Math.max(0, input.kg);
  current.jobsCount += input.jobsCount ?? 0;
  current.quoteCount += input.quoteCount ?? 0;
  current.repeatBoost += input.repeatBoost ?? 0;
  current.confidence = Math.max(current.confidence, clamp(input.confidence, 0, 1));
  aggregates.set(key, current);
}

function forecastRow(row: Record<string, unknown>): MaterialUsageForecastRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    forecastPeriodDays: Number(row.forecastPeriodDays ?? 0),
    predictedSheetsNeeded: Number(row.predictedSheetsNeeded ?? 0),
    predictedKgNeeded: Number(row.predictedKgNeeded ?? 0),
    confidence: Number(row.confidence ?? 0),
    basedOnJobsCount: Number(row.basedOnJobsCount ?? 0),
    basedOnQuoteCount: Number(row.basedOnQuoteCount ?? 0),
    createdAt: String(row.createdAt ?? "")
  };
}

function ruleRow(row: Record<string, unknown>): MaterialPredictionRuleRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    minimumSheets: Number(row.minimumSheets ?? 0),
    leadTimeDays: Number(row.leadTimeDays ?? 0),
    preferredSupplier: row.preferredSupplier ? String(row.preferredSupplier) : null,
    createdAt: String(row.createdAt ?? "")
  };
}

export function openMaterialPredictionDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-material-prediction.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS material_usage_forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      forecastPeriodDays INTEGER NOT NULL,
      predictedSheetsNeeded REAL NOT NULL,
      predictedKgNeeded REAL NOT NULL,
      confidence REAL NOT NULL,
      basedOnJobsCount INTEGER NOT NULL,
      basedOnQuoteCount INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS material_prediction_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      minimumSheets REAL NOT NULL,
      leadTimeDays INTEGER NOT NULL,
      preferredSupplier TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_material_forecast_workspace ON material_usage_forecasts(workspaceId, forecastPeriodDays, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_material_forecast_lookup ON material_usage_forecasts(workspaceId, material, thickness, forecastPeriodDays, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_material_rules_lookup ON material_prediction_rules(workspaceId, material, thickness);
  `);
  return db;
}

export class MaterialPredictionService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly brainCore: BrainCoreService,
    private readonly manufacturingMemory: ManufacturingMemoryService
  ) {}

  rebuildForecast(input: ForecastSourceInput) {
    const forecastPeriods = Array.from(new Set((input.forecastPeriodsDays ?? [7, 30]).filter((value) => value > 0))).sort((a, b) => a - b);
    const patterns = this.manufacturingMemory.listPatterns({ workspaceId: input.workspaceId, limit: 200 });
    this.seedDefaultRules(input.workspaceId, input.stockSnapshot);
    this.db.prepare(`DELETE FROM material_usage_forecasts WHERE workspaceId = ?`).run(input.workspaceId);

    const created: MaterialUsageForecastRecord[] = [];
    for (const days of forecastPeriods) {
      const forecastRows = this.calculateForecastRows({
        workspaceId: input.workspaceId,
        jobs: input.jobs,
        quotes: input.quotes,
        stockSnapshot: input.stockSnapshot,
        patterns,
        forecastPeriodDays: days
      });
      for (const row of forecastRows) {
        const result = this.db.prepare(
          `INSERT INTO material_usage_forecasts
           (workspaceId, material, thickness, forecastPeriodDays, predictedSheetsNeeded, predictedKgNeeded, confidence, basedOnJobsCount, basedOnQuoteCount, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          row.workspaceId,
          row.material,
          row.thickness,
          row.forecastPeriodDays,
          row.predictedSheetsNeeded,
          row.predictedKgNeeded,
          row.confidence,
          row.basedOnJobsCount,
          row.basedOnQuoteCount,
          row.createdAt
        );
        created.push({ ...row, id: Number(result.lastInsertRowid ?? 0) });
      }
    }

    const shortages = this.getShortages({
      workspaceId: input.workspaceId,
      stockSnapshot: input.stockSnapshot
    });

    const recommendations: BrainRecommendationRecord[] = [];
    for (const shortage of shortages) {
      const recommendation = this.brainCore.recommendationService.createRecommendation({
        moduleName: "material_prediction",
        recommendationType: "buy_before_shortage",
        title: `Buy ${shortage.material} ${shortage.thickness}mm soon`,
        message: shortage.recommendation,
        confidence: shortage.confidence,
        impactScore: clamp(Math.round(shortage.shortageSheets * 18 + shortage.forecastPeriodDays), 20, 95),
        payload: {
          workspaceId: input.workspaceId,
          material: shortage.material,
          thickness: shortage.thickness,
          forecastPeriodDays: shortage.forecastPeriodDays,
          shortageSheets: shortage.shortageSheets,
          recommendedBuySheets: shortage.recommendedBuySheets,
          preferredSupplier: shortage.preferredSupplier
        }
      });
      if (recommendation) recommendations.push(recommendation);
    }

    return { forecasts: created, shortages, recommendations };
  }

  listForecasts(input: { workspaceId: string; forecastPeriodDays?: number; limit?: number }) {
    const rows = this.db.prepare(
      `SELECT * FROM material_usage_forecasts
       WHERE workspaceId = ?
         AND (? IS NULL OR forecastPeriodDays = ?)
       ORDER BY forecastPeriodDays ASC, predictedKgNeeded DESC, predictedSheetsNeeded DESC
       LIMIT ?`
    ).all(
      input.workspaceId,
      input.forecastPeriodDays ?? null,
      input.forecastPeriodDays ?? null,
      Math.max(1, Math.min(500, input.limit ?? 200))
    ) as Record<string, unknown>[];
    return rows.map(forecastRow);
  }

  listRules(input: { workspaceId: string; material?: string; thickness?: number; limit?: number }) {
    const rows = this.db.prepare(
      `SELECT * FROM material_prediction_rules
       WHERE workspaceId = ?
         AND (? IS NULL OR LOWER(material) = LOWER(?))
         AND (? IS NULL OR ABS(thickness - ?) < 0.0001)
       ORDER BY material ASC, thickness ASC
       LIMIT ?`
    ).all(
      input.workspaceId,
      input.material ?? null,
      input.material ?? null,
      input.thickness ?? null,
      input.thickness ?? null,
      Math.max(1, Math.min(500, input.limit ?? 200))
    ) as Record<string, unknown>[];
    return rows.map(ruleRow);
  }

  getShortages(input: {
    workspaceId: string;
    stockSnapshot: StockSnapshot;
    forecastPeriodDays?: number;
  }) {
    const forecasts = this.listForecasts({
      workspaceId: input.workspaceId,
      forecastPeriodDays: input.forecastPeriodDays,
      limit: 300
    });
    const rules = this.listRules({ workspaceId: input.workspaceId, limit: 300 });
    const shortages: MaterialShortageRecord[] = [];
    for (const forecast of forecasts) {
      const rule =
        rules.find((entry) => entry.material.trim().toLowerCase() === forecast.material.trim().toLowerCase() && Math.abs(entry.thickness - forecast.thickness) < 0.0001) ??
        {
          id: 0,
          workspaceId: input.workspaceId,
          material: forecast.material,
          thickness: forecast.thickness,
          minimumSheets: 2,
          leadTimeDays: 7,
          preferredSupplier: null,
          createdAt: forecast.createdAt
        };
      const availability = availableStockEquivalent(input.stockSnapshot, forecast.material, forecast.thickness);
      const targetSheets = forecast.predictedSheetsNeeded + Math.max(0, rule.minimumSheets);
      const shortageSheets = Math.max(0, targetSheets - availability.availableEquivalentSheets);
      if (shortageSheets <= 0) continue;
      const recommendedBuySheets = Math.max(1, Math.ceil(shortageSheets));
      shortages.push({
        material: forecast.material,
        thickness: forecast.thickness,
        forecastPeriodDays: forecast.forecastPeriodDays,
        predictedSheetsNeeded: forecast.predictedSheetsNeeded,
        predictedKgNeeded: forecast.predictedKgNeeded,
        availableEquivalentSheets: availability.availableEquivalentSheets,
        availableSheets: availability.availableSheets,
        minimumSheets: rule.minimumSheets,
        shortageSheets: round(shortageSheets, 0.01),
        confidence: forecast.confidence,
        leadTimeDays: rule.leadTimeDays,
        recommendedBuySheets,
        preferredSupplier: rule.preferredSupplier,
        recommendation:
          `${forecast.material} ${forecast.thickness}mm is likely to run short in the next ${forecast.forecastPeriodDays} days. ` +
          `Buy ${recommendedBuySheets} sheet${recommendedBuySheets === 1 ? "" : "s"} before lead time hits${rule.preferredSupplier ? ` from ${rule.preferredSupplier}` : ""}.`
      });
    }
    return shortages.sort((left, right) => right.shortageSheets - left.shortageSheets || right.confidence - left.confidence);
  }

  private seedDefaultRules(workspaceId: string, stockSnapshot: StockSnapshot) {
    const existing = this.listRules({ workspaceId, limit: 1000 });
    const knownKeys = new Set(existing.map((entry) => materialKey(entry.material, entry.thickness)));
    const candidates = new Map<string, { material: string; thickness: number; preferredSupplier: string | null }>();
    for (const sheet of stockSnapshot.sheets) {
      const key = materialKey(sheet.material, sheet.thickness);
      if (!candidates.has(key)) {
        candidates.set(key, {
          material: sheet.material,
          thickness: sheet.thickness,
          preferredSupplier: sheet.supplier ?? null
        });
      }
    }
    for (const candidate of candidates.values()) {
      const key = materialKey(candidate.material, candidate.thickness);
      if (knownKeys.has(key)) continue;
      this.db.prepare(
        `INSERT INTO material_prediction_rules
         (workspaceId, material, thickness, minimumSheets, leadTimeDays, preferredSupplier, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        workspaceId,
        candidate.material,
        candidate.thickness,
        2,
        7,
        candidate.preferredSupplier,
        new Date().toISOString()
      );
    }
  }

  private calculateForecastRows(input: {
    workspaceId: string;
    jobs: JobRecord[];
    quotes: QuoteRecord[];
    stockSnapshot: StockSnapshot;
    patterns: KnownPatternRecord[];
    forecastPeriodDays: number;
  }) {
    const aggregates = new Map<string, MaterialAggregate>();
    const repeatBoostByKey = new Map<string, number>();

    for (const pattern of input.patterns) {
      const payload = parsePayloadJson(pattern.payloadJson);
      const material = typeof payload.material === "string" ? payload.material.trim() : "";
      const thickness = Number(payload.thickness ?? 0);
      if (!material || !Number.isFinite(thickness) || thickness <= 0) continue;
      if (pattern.patternType !== "recurring_material_usage" && pattern.patternType !== "repeat_customer_part") continue;
      const key = materialKey(material, thickness);
      const current = repeatBoostByKey.get(key) ?? 0;
      repeatBoostByKey.set(key, current + clamp(pattern.confidence * 0.18, 0.03, 0.2));
    }

    for (const job of input.jobs) {
      const jobWeight = recentWeight(job.createdAt, input.forecastPeriodDays, 4);
      if (jobWeight <= 0) continue;
      const statusWeight = job.status === "done" ? 0.7 : job.status === "in_progress" ? 1 : 0.9;
      for (const part of job.jobDxfParts ?? []) {
        const material = part.material?.trim() ?? "";
        const thickness = Number(part.thicknessMm ?? 0);
        const quantity = Math.max(1, Number(part.quantity) || 1);
        if (!material || thickness <= 0) continue;
        const areaSqm = sheetAreaSqm(part.widthMm, part.heightMm) * quantity * jobWeight * statusWeight;
        const density = densityForMaterial(material, input.stockSnapshot);
        const kg = areaSqm * (thickness / 1000) * density;
        const boost = repeatBoostByKey.get(materialKey(material, thickness)) ?? 0;
        addAggregate(aggregates, {
          material,
          thickness,
          areaSqm: areaSqm * (1 + boost),
          kg: kg * (1 + boost),
          jobsCount: 1,
          confidence: clamp(0.72 + jobWeight * 0.16 + boost, 0, 0.97),
          repeatBoost: boost
        });
      }
    }

    for (const quote of input.quotes) {
      const quoteWeightBase = recentWeight(quote.createdAt, input.forecastPeriodDays, 5);
      if (quoteWeightBase <= 0) continue;
      const statusProbability = quoteStatusProbability(quote.status);
      const quoteWeight = quoteWeightBase * statusProbability;
      if (quoteWeight <= 0) continue;
      for (const part of quotePartsFromQuote(quote)) {
        const material = part.material?.trim() ?? "";
        const thickness = Number(part.thicknessMm ?? 0);
        const quantity = Math.max(1, Number(part.quantity) || 1);
        if (!material || thickness <= 0) continue;
        const areaSqm = sheetAreaSqm(part.lengthMm, part.widthMm) * quantity * quoteWeight;
        const density = densityForMaterial(material, input.stockSnapshot);
        const kg = areaSqm * (thickness / 1000) * density;
        const boost = repeatBoostByKey.get(materialKey(material, thickness)) ?? 0;
        addAggregate(aggregates, {
          material,
          thickness,
          areaSqm: areaSqm * (1 + boost * 0.7),
          kg: kg * (1 + boost * 0.7),
          quoteCount: 1,
          confidence: clamp(0.48 + statusProbability * 0.34 + boost * 0.6, 0, 0.92),
          repeatBoost: boost
        });
      }
    }

    const createdAt = new Date().toISOString();
    const rows: MaterialUsageForecastRecord[] = [];
    for (const aggregate of aggregates.values()) {
      const avgSheetAreaSqm = averageSheetAreaSqm(input.stockSnapshot, aggregate.material, aggregate.thickness);
      const predictedSheetsNeeded = round(aggregate.areaSqm / Math.max(0.5, avgSheetAreaSqm), 0.01);
      const predictedKgNeeded = round(aggregate.kg, 0.01);
      if (predictedSheetsNeeded <= 0 && predictedKgNeeded <= 0) continue;
      rows.push({
        id: 0,
        workspaceId: input.workspaceId,
        material: aggregate.material,
        thickness: aggregate.thickness,
        forecastPeriodDays: input.forecastPeriodDays,
        predictedSheetsNeeded,
        predictedKgNeeded,
        confidence: clamp(
          aggregate.confidence +
            Math.min(0.12, aggregate.jobsCount * 0.015) +
            Math.min(0.08, aggregate.quoteCount * 0.01) +
            Math.min(0.08, aggregate.repeatBoost),
          0.28,
          0.98
        ),
        basedOnJobsCount: aggregate.jobsCount,
        basedOnQuoteCount: aggregate.quoteCount,
        createdAt
      });
    }
    return rows.sort((left, right) => right.predictedKgNeeded - left.predictedKgNeeded || right.predictedSheetsNeeded - left.predictedSheetsNeeded);
  }
}
