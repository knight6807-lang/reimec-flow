import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService, BrainRecommendationRecord } from "./brain-core.js";
import type { MaterialPredictionService } from "./material-prediction.js";
import type { OffcutRecord, QuoteStockSuggestion, StockSheetRecord, StockSnapshot } from "./stock-material.js";
import { buildQuoteStockSuggestion } from "./stock-material.js";

export type SheetOptimizationSourceType = "offcut" | "sheet" | "order_required";

export type SheetOptimizationResultRecord = {
  id: number;
  workspaceId: string;
  jobId: string | null;
  quoteId: string | null;
  material: string;
  thickness: number;
  requiredWidth: number;
  requiredHeight: number;
  recommendedSourceType: SheetOptimizationSourceType;
  sourceId: number | null;
  wastePercent: number;
  savingEstimate: number;
  confidence: number;
  createdAt: string;
};

export type SheetOptimizationResultView = SheetOptimizationResultRecord & {
  recommendation: string;
  sourceLabel: string;
  fitType: "normal" | "rotated" | "none";
  sourceSheet: StockSheetRecord | null;
  sourceOffcut: OffcutRecord | null;
  betterSheetWarning: string | null;
  stockMessage: string;
};

type OptimizeSheetInput = {
  workspaceId: string;
  material: string;
  thickness: number;
  requiredWidth: number;
  requiredHeight: number;
  jobId?: string | null;
  quoteId?: string | null;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function rowToResult(row: Record<string, unknown>): SheetOptimizationResultRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    jobId: row.jobId ? String(row.jobId) : null,
    quoteId: row.quoteId ? String(row.quoteId) : null,
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    requiredWidth: Number(row.requiredWidth ?? 0),
    requiredHeight: Number(row.requiredHeight ?? 0),
    recommendedSourceType:
      row.recommendedSourceType === "offcut" || row.recommendedSourceType === "sheet" ? row.recommendedSourceType : "order_required",
    sourceId: row.sourceId === null || row.sourceId === undefined ? null : Number(row.sourceId),
    wastePercent: Number(row.wastePercent ?? 0),
    savingEstimate: Number(row.savingEstimate ?? 0),
    confidence: Number(row.confidence ?? 0),
    createdAt: String(row.createdAt ?? "")
  };
}

function area(width: number, height: number) {
  return Math.max(0, width) * Math.max(0, height);
}

function fitType(width: number, height: number, requiredWidth: number, requiredHeight: number) {
  if (width >= requiredWidth && height >= requiredHeight) return "normal" as const;
  if (height >= requiredWidth && width >= requiredHeight) return "rotated" as const;
  return "none" as const;
}

function computeWastePercent(stockWidth: number, stockHeight: number, requiredWidth: number, requiredHeight: number) {
  const stockArea = area(stockWidth, stockHeight);
  if (stockArea <= 0) return 100;
  const waste = Math.max(0, stockArea - area(requiredWidth, requiredHeight));
  return round((waste / stockArea) * 100, 0.01);
}

function findBetterSheetWarning(suggestion: QuoteStockSuggestion) {
  if (!suggestion.bestOffcut || !suggestion.bestSheet) return null;
  const offcutWaste = suggestion.bestOffcut.fit.wasteArea;
  const sheetWaste = suggestion.bestSheet.fit.wasteArea;
  if (sheetWaste <= 0) return null;
  if (offcutWaste > sheetWaste * 1.6) {
    return "A full sheet would leave much less waste than the best offcut.";
  }
  if ((suggestion.bestSheet.costPerSheet ?? 0) > 0 && suggestion.estimatedSaving <= 0) {
    return "This stock match is usable, but a different sheet size may save more money.";
  }
  return null;
}

export function openSheetOptimizerDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-sheet-optimizer.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sheet_optimization_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      jobId TEXT,
      quoteId TEXT,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      requiredWidth REAL NOT NULL,
      requiredHeight REAL NOT NULL,
      recommendedSourceType TEXT NOT NULL,
      sourceId INTEGER,
      wastePercent REAL NOT NULL,
      savingEstimate REAL NOT NULL,
      confidence REAL NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sheet_optimizer_job ON sheet_optimization_results(workspaceId, jobId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_sheet_optimizer_quote ON sheet_optimization_results(workspaceId, quoteId, createdAt DESC);
  `);
  return db;
}

export class SheetOptimizerService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly stockDb: DatabaseSync,
    private readonly brainCore: BrainCoreService,
    private readonly materialPrediction: MaterialPredictionService
  ) {}

  optimize(input: OptimizeSheetInput): SheetOptimizationResultView {
    const material = input.material.trim();
    const thickness = Number(input.thickness);
    const requiredWidth = Number(input.requiredWidth);
    const requiredHeight = Number(input.requiredHeight);
    if (!material || !Number.isFinite(thickness) || thickness <= 0 || !Number.isFinite(requiredWidth) || requiredWidth <= 0 || !Number.isFinite(requiredHeight) || requiredHeight <= 0) {
      throw new Error("material, thickness, requiredWidth, and requiredHeight are required");
    }

    const suggestion = buildQuoteStockSuggestion(this.stockDb, {
      material,
      thickness,
      requiredWidth,
      requiredHeight
    });
    const shortages = this.materialPrediction.getShortages({
      workspaceId: input.workspaceId,
      stockSnapshot: this.getStockSnapshot()
    });
    const shortage = shortages.find((entry) => entry.material.trim().toLowerCase() === material.toLowerCase() && Math.abs(entry.thickness - thickness) < 0.0001);

    let recommendedSourceType: SheetOptimizationSourceType = "order_required";
    let sourceId: number | null = null;
    let wastePercent = 100;
    let savingEstimate = 0;
    let confidence = 0.45;
    let sourceSheet: StockSheetRecord | null = null;
    let sourceOffcut: OffcutRecord | null = null;
    let recommendation = "Order material";
    let sourceLabel = "No stock";
    let stockMessage = suggestion.message;
    let fit: "normal" | "rotated" | "none" = "none";

    if (suggestion.bestOffcut) {
      recommendedSourceType = "offcut";
      sourceId = suggestion.bestOffcut.id;
      sourceOffcut = suggestion.bestOffcut;
      wastePercent = computeWastePercent(sourceOffcut.width, sourceOffcut.height, requiredWidth, requiredHeight);
      savingEstimate = round(suggestion.estimatedSaving || suggestion.bestOffcut.fit.savingEstimate || 0, 0.01);
      confidence = 0.87;
      fit = fitType(sourceOffcut.width, sourceOffcut.height, requiredWidth, requiredHeight);
      recommendation = "Use offcut first";
      sourceLabel = `Offcut #${sourceOffcut.id}${sourceOffcut.location ? ` · ${sourceOffcut.location}` : ""}`;
      stockMessage = "Best result uses an offcut and avoids opening a fresh sheet.";
    } else if (suggestion.bestSheet) {
      recommendedSourceType = "sheet";
      sourceId = suggestion.bestSheet.id;
      sourceSheet = suggestion.bestSheet;
      wastePercent = computeWastePercent(sourceSheet.width, sourceSheet.height, requiredWidth, requiredHeight);
      savingEstimate = 0;
      confidence = 0.78;
      fit = fitType(sourceSheet.width, sourceSheet.height, requiredWidth, requiredHeight);
      recommendation = "Use full sheet";
      sourceLabel = `Sheet #${sourceSheet.id}${sourceSheet.location ? ` · ${sourceSheet.location}` : ""}`;
      stockMessage = "No usable offcut was found. A full sheet is the best in-stock option.";
    } else {
      if (shortage) {
        stockMessage = `No stock fits. Forecast shows a likely shortage; buy about ${shortage.recommendedBuySheets} sheet(s).`;
      } else {
        stockMessage = "No stock or offcut fits this requirement.";
      }
      recommendation = "Order material before quoting or cutting";
      confidence = shortage ? 0.82 : 0.62;
    }

    const betterSheetWarning = findBetterSheetWarning(suggestion);
    if (betterSheetWarning) {
      this.brainCore.recommendationService.createRecommendation({
        moduleName: "sheet_optimizer",
        recommendationType: "better_sheet_size",
        title: "A better sheet size may save money",
        message: betterSheetWarning,
        confidence: 0.72,
        impactScore: 58,
        payload: {
          workspaceId: input.workspaceId,
          jobId: input.jobId ?? null,
          quoteId: input.quoteId ?? null,
          material,
          thickness
        }
      });
    }

    if (recommendedSourceType === "order_required") {
      this.brainCore.recommendationService.createRecommendation({
        moduleName: "sheet_optimizer",
        recommendationType: "material_order_required",
        title: "Material order required",
        message: stockMessage,
        confidence,
        impactScore: shortage ? 84 : 68,
        payload: {
          workspaceId: input.workspaceId,
          jobId: input.jobId ?? null,
          quoteId: input.quoteId ?? null,
          material,
          thickness,
          requiredWidth,
          requiredHeight
        }
      });
    }

    const createdAt = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO sheet_optimization_results
       (workspaceId, jobId, quoteId, material, thickness, requiredWidth, requiredHeight, recommendedSourceType, sourceId, wastePercent, savingEstimate, confidence, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.workspaceId,
      input.jobId?.trim() || null,
      input.quoteId?.trim() || null,
      material,
      thickness,
      requiredWidth,
      requiredHeight,
      recommendedSourceType,
      sourceId,
      wastePercent,
      savingEstimate,
      confidence,
      createdAt
    );

    return {
      ...rowToResult({
        id: Number(insert.lastInsertRowid ?? 0),
        workspaceId: input.workspaceId,
        jobId: input.jobId?.trim() || null,
        quoteId: input.quoteId?.trim() || null,
        material,
        thickness,
        requiredWidth,
        requiredHeight,
        recommendedSourceType,
        sourceId,
        wastePercent,
        savingEstimate,
        confidence,
        createdAt
      }),
      recommendation,
      sourceLabel,
      fitType: fit,
      sourceSheet,
      sourceOffcut,
      betterSheetWarning,
      stockMessage
    };
  }

  getResult(workspaceId: string, id: number): SheetOptimizationResultView | null {
    const row = this.db.prepare(`SELECT * FROM sheet_optimization_results WHERE workspaceId = ? AND id = ?`).get(workspaceId, id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    const record = rowToResult(row);
    const sourceSheet = record.recommendedSourceType === "sheet" && record.sourceId
      ? (this.stockDb.prepare(`SELECT * FROM stock_sheets WHERE id = ?`).get(record.sourceId) as Record<string, unknown> | undefined)
      : undefined;
    const sourceOffcut = record.recommendedSourceType === "offcut" && record.sourceId
      ? (this.stockDb.prepare(`SELECT * FROM offcuts WHERE id = ?`).get(record.sourceId) as Record<string, unknown> | undefined)
      : undefined;
    const normalizedSheet = sourceSheet ? this.stockRowToSheet(sourceSheet) : null;
    const normalizedOffcut = sourceOffcut ? this.stockRowToOffcut(sourceOffcut) : null;
    return {
      ...record,
      recommendation:
        record.recommendedSourceType === "offcut"
          ? "Use offcut first"
          : record.recommendedSourceType === "sheet"
          ? "Use full sheet"
          : "Order material before quoting or cutting",
      sourceLabel:
        record.recommendedSourceType === "offcut"
          ? `Offcut #${record.sourceId ?? "?"}`
          : record.recommendedSourceType === "sheet"
          ? `Sheet #${record.sourceId ?? "?"}`
          : "No stock",
      fitType:
        normalizedOffcut
          ? fitType(normalizedOffcut.width, normalizedOffcut.height, record.requiredWidth, record.requiredHeight)
          : normalizedSheet
          ? fitType(normalizedSheet.width, normalizedSheet.height, record.requiredWidth, record.requiredHeight)
          : "none",
      sourceSheet: normalizedSheet,
      sourceOffcut: normalizedOffcut,
      betterSheetWarning: null,
      stockMessage:
        record.recommendedSourceType === "order_required"
          ? "No stock or offcut was available for this optimization result."
          : "Optimization result loaded from history."
    };
  }

  private getStockSnapshot(): StockSnapshot {
    const sheets = this.stockDb.prepare(`SELECT * FROM stock_sheets ORDER BY updatedAt DESC, id DESC`).all() as Record<string, unknown>[];
    const offcuts = this.stockDb.prepare(`SELECT * FROM offcuts ORDER BY updatedAt DESC, id DESC`).all() as Record<string, unknown>[];
    const materials = this.stockDb.prepare(`SELECT * FROM materials ORDER BY updatedAt DESC, id DESC`).all() as Record<string, unknown>[];
    return {
      materials: materials.map((row) => ({
        id: Number(row.id ?? 0),
        name: String(row.name ?? ""),
        grade: row.grade ? String(row.grade) : null,
        defaultDensity: row.defaultDensity === null || row.defaultDensity === undefined ? null : Number(row.defaultDensity),
        createdAt: String(row.createdAt ?? ""),
        updatedAt: String(row.updatedAt ?? "")
      })),
      sheets: sheets.map((row) => this.stockRowToSheet(row)),
      offcuts: offcuts.map((row) => this.stockRowToOffcut(row)),
      movements: [],
      lowStockWarnings: []
    };
  }

  private stockRowToSheet(row: Record<string, unknown>): StockSheetRecord {
    return {
      id: Number(row.id ?? 0),
      material: String(row.material ?? ""),
      thickness: Number(row.thickness ?? 0),
      width: Number(row.width ?? 0),
      height: Number(row.height ?? 0),
      quantity: Number(row.quantity ?? 0),
      supplier: row.supplier ? String(row.supplier) : null,
      costPerSheet: row.costPerSheet === null || row.costPerSheet === undefined ? null : Number(row.costPerSheet),
      costPerKg: row.costPerKg === null || row.costPerKg === undefined ? null : Number(row.costPerKg),
      location: row.location ? String(row.location) : null,
      status: row.status === "reserved" || row.status === "used" || row.status === "scrapped" ? row.status : "available",
      reservedJobId: row.reservedJobId ? String(row.reservedJobId) : null,
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? "")
    };
  }

  private stockRowToOffcut(row: Record<string, unknown>): OffcutRecord {
    return {
      id: Number(row.id ?? 0),
      parentSheetId: row.parentSheetId === null || row.parentSheetId === undefined ? null : Number(row.parentSheetId),
      material: String(row.material ?? ""),
      thickness: Number(row.thickness ?? 0),
      width: Number(row.width ?? 0),
      height: Number(row.height ?? 0),
      shapeData: row.shapeData ? String(row.shapeData) : null,
      usableArea: Number(row.usableArea ?? 0),
      location: row.location ? String(row.location) : null,
      status: row.status === "reserved" || row.status === "used" || row.status === "scrapped" ? row.status : "available",
      reservedJobId: row.reservedJobId ? String(row.reservedJobId) : null,
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? "")
    };
  }
}
