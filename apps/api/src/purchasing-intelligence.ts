import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService, BrainRecommendationRecord } from "./brain-core.js";
import type { MaterialPredictionService } from "./material-prediction.js";
import type { StockSnapshot } from "./stock-material.js";

export type PurchaseRecommendationStatus = "open" | "ordered" | "dismissed";
export type PurchaseRecommendationUrgency = "low" | "normal" | "urgent";

export type PurchaseRecommendationRecord = {
  id: number;
  workspaceId: string;
  material: string;
  thickness: number;
  recommendedQuantity: number;
  unit: string;
  reason: string;
  urgency: PurchaseRecommendationUrgency;
  estimatedCost: number;
  preferredSupplier: string | null;
  status: PurchaseRecommendationStatus;
  createdAt: string;
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

function recommendationRow(row: Record<string, unknown>): PurchaseRecommendationRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    recommendedQuantity: Number(row.recommendedQuantity ?? 0),
    unit: String(row.unit ?? "sheets"),
    reason: String(row.reason ?? ""),
    urgency:
      row.urgency === "low" || row.urgency === "urgent"
        ? row.urgency
        : "normal",
    estimatedCost: Number(row.estimatedCost ?? 0),
    preferredSupplier: row.preferredSupplier ? String(row.preferredSupplier) : null,
    status:
      row.status === "ordered" || row.status === "dismissed"
        ? row.status
        : "open",
    createdAt: String(row.createdAt ?? "")
  };
}

export function openPurchasingIntelligenceDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-purchasing-intelligence.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS purchase_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      recommendedQuantity REAL NOT NULL,
      unit TEXT NOT NULL,
      reason TEXT NOT NULL,
      urgency TEXT NOT NULL,
      estimatedCost REAL NOT NULL,
      preferredSupplier TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_recommendations_workspace
      ON purchase_recommendations(workspaceId, status, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_purchase_recommendations_lookup
      ON purchase_recommendations(workspaceId, material, thickness, status, createdAt DESC);
  `);
  return db;
}

export class PurchasingIntelligenceService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly brainCore: BrainCoreService,
    private readonly materialPrediction: MaterialPredictionService
  ) {}

  syncRecommendations(input: { workspaceId: string; stockSnapshot: StockSnapshot }) {
    const shortages = this.materialPrediction.getShortages({
      workspaceId: input.workspaceId,
      stockSnapshot: input.stockSnapshot
    });

    this.db.prepare(`DELETE FROM purchase_recommendations WHERE workspaceId = ? AND status = 'open'`).run(input.workspaceId);

    const recommendations: PurchaseRecommendationRecord[] = [];
    const brainRecommendations: BrainRecommendationRecord[] = [];

    for (const shortage of shortages) {
      const urgency = this.resolveUrgency(shortage.shortageSheets, shortage.forecastPeriodDays, shortage.leadTimeDays);
      const recommendedQuantity = Math.max(
        1,
        Math.ceil(shortage.recommendedBuySheets + (urgency === "urgent" ? 1 : urgency === "normal" ? 0.5 : 0))
      );
      const estimatedCost = this.estimateCost(input.stockSnapshot, shortage.material, shortage.thickness, recommendedQuantity, shortage.predictedKgNeeded, shortage.predictedSheetsNeeded);
      const reason =
        `${shortage.material} ${shortage.thickness}mm is forecast to fall short within ${shortage.forecastPeriodDays} days. ` +
        `Current stock covers ${shortage.availableEquivalentSheets.toFixed(2)} equivalent sheets against ${shortage.predictedSheetsNeeded.toFixed(2)} predicted usage plus a ${shortage.minimumSheets.toFixed(2)} sheet buffer.`;
      const createdAt = new Date().toISOString();
      const result = this.db.prepare(
        `INSERT INTO purchase_recommendations
         (workspaceId, material, thickness, recommendedQuantity, unit, reason, urgency, estimatedCost, preferredSupplier, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
      ).run(
        input.workspaceId,
        shortage.material,
        shortage.thickness,
        recommendedQuantity,
        "sheets",
        reason,
        urgency,
        estimatedCost,
        shortage.preferredSupplier,
        createdAt
      );
      const recommendation: PurchaseRecommendationRecord = {
        id: Number(result.lastInsertRowid ?? 0),
        workspaceId: input.workspaceId,
        material: shortage.material,
        thickness: shortage.thickness,
        recommendedQuantity,
        unit: "sheets",
        reason,
        urgency,
        estimatedCost,
        preferredSupplier: shortage.preferredSupplier,
        status: "open",
        createdAt
      };
      recommendations.push(recommendation);

      const brainRecommendation = this.brainCore.recommendationService.createRecommendation({
        moduleName: "purchasing_intelligence",
        recommendationType: urgency === "urgent" ? "urgent_material_purchase" : "material_purchase_suggestion",
        title: `Buy ${shortage.material} ${shortage.thickness}mm`,
        message: reason,
        confidence: shortage.confidence,
        impactScore: clamp(Math.round(shortage.shortageSheets * 20 + (urgency === "urgent" ? 30 : urgency === "normal" ? 18 : 8)), 20, 98),
        payload: {
          workspaceId: input.workspaceId,
          material: shortage.material,
          thickness: shortage.thickness,
          recommendedQuantity,
          preferredSupplier: shortage.preferredSupplier,
          estimatedCost,
          urgency
        }
      });
      if (brainRecommendation) brainRecommendations.push(brainRecommendation);
    }

    return { recommendations, brainRecommendations };
  }

  listRecommendations(input: { workspaceId: string; status?: PurchaseRecommendationStatus | "all"; limit?: number }) {
    const rows = this.db.prepare(
      `SELECT * FROM purchase_recommendations
       WHERE workspaceId = ?
         AND (? = 'all' OR status = ?)
       ORDER BY
         CASE urgency WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
         createdAt DESC
       LIMIT ?`
    ).all(
      input.workspaceId,
      input.status ?? "open",
      input.status ?? "open",
      Math.max(1, Math.min(500, input.limit ?? 200))
    ) as Record<string, unknown>[];
    return rows.map(recommendationRow);
  }

  markOrdered(workspaceId: string, id: number) {
    return this.updateStatus(workspaceId, id, "ordered");
  }

  dismiss(workspaceId: string, id: number) {
    return this.updateStatus(workspaceId, id, "dismissed");
  }

  private updateStatus(workspaceId: string, id: number, status: PurchaseRecommendationStatus) {
    const existing = this.db.prepare(
      `SELECT * FROM purchase_recommendations WHERE workspaceId = ? AND id = ? LIMIT 1`
    ).get(workspaceId, id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error("Purchase recommendation not found.");
    }
    this.db.prepare(`UPDATE purchase_recommendations SET status = ? WHERE id = ?`).run(status, id);
    const updated = this.db.prepare(`SELECT * FROM purchase_recommendations WHERE id = ? LIMIT 1`).get(id) as Record<string, unknown>;
    return recommendationRow(updated);
  }

  private resolveUrgency(shortageSheets: number, forecastPeriodDays: number, leadTimeDays: number): PurchaseRecommendationUrgency {
    if (shortageSheets >= 2 || forecastPeriodDays <= leadTimeDays + 3) return "urgent";
    if (shortageSheets >= 0.75 || forecastPeriodDays <= leadTimeDays + 10) return "normal";
    return "low";
  }

  private estimateCost(
    stockSnapshot: StockSnapshot,
    material: string,
    thickness: number,
    recommendedQuantity: number,
    predictedKgNeeded: number,
    predictedSheetsNeeded: number
  ) {
    const matchingSheets = stockSnapshot.sheets.filter((sheet) =>
      sheet.material.trim().toLowerCase() === material.trim().toLowerCase() &&
      Math.abs(sheet.thickness - thickness) < 0.0001
    );
    const costPerSheetValues = matchingSheets.map((sheet) => Number(sheet.costPerSheet)).filter((value) => Number.isFinite(value) && value > 0);
    if (costPerSheetValues.length > 0) {
      const averageCostPerSheet = costPerSheetValues.reduce((sum, value) => sum + value, 0) / costPerSheetValues.length;
      return round(averageCostPerSheet * recommendedQuantity, 0.01);
    }
    const costPerKgValues = matchingSheets.map((sheet) => Number(sheet.costPerKg)).filter((value) => Number.isFinite(value) && value > 0);
    if (costPerKgValues.length > 0) {
      const averageCostPerKg = costPerKgValues.reduce((sum, value) => sum + value, 0) / costPerKgValues.length;
      const requiredKg = predictedSheetsNeeded > 0
        ? predictedKgNeeded * (recommendedQuantity / Math.max(1, predictedSheetsNeeded))
        : predictedKgNeeded;
      return round(averageCostPerKg * Math.max(requiredKg, 1), 0.01);
    }
    const fallbackPerSheet =
      material.toLowerCase().includes("stainless")
        ? 4200 * Math.max(1, thickness / 1.5)
        : material.toLowerCase().includes("aluminium") || material.toLowerCase().includes("aluminum")
          ? 2500 * Math.max(1, thickness / 2)
          : 1800 * Math.max(1, thickness / 2);
    return round(fallbackPerSheet * recommendedQuantity, 0.01);
  }
}
