import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService, BrainRecommendationRecord } from "./brain-core.js";
import type { ManufacturingMemoryService } from "./manufacturing-memory.js";

export type ProfitRecord = {
  id: number;
  jobId: string | null;
  quoteId: string | null;
  customerId: string | null;
  partDnaId: number | null;
  material: string;
  thickness: number | null;
  revenue: number;
  materialCost: number;
  cuttingCost: number;
  gasCost: number;
  laborCost: number;
  setupCost: number;
  scrapCost: number;
  deliveryCost: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  createdAt: string;
};

export type ProfitInsight = {
  id: number;
  insightType: string;
  title: string;
  message: string;
  confidence: number;
  payloadJson: string;
  createdAt: string;
};

export type ProfitSummary = {
  profitToday: number;
  profitMonth: number;
  bestCustomers: Array<{ customerId: string; revenue: number; grossProfit: number; marginPercent: number; jobCount: number }>;
  worstCustomers: Array<{ customerId: string; revenue: number; grossProfit: number; marginPercent: number; jobCount: number }>;
  underpricedJobs: ProfitRecord[];
  recommendedPriceIncreases: ProfitInsight[];
};

export type ProfitCalculationInput = {
  workspaceId: string;
  jobId: string;
  quoteId?: string | null;
  customerId?: string | null;
  partDnaId?: number | null;
  material?: string | null;
  thickness?: number | null;
  revenue?: number | null;
  jobPrice?: number | null;
  jobCost?: number | null;
  estimatedCutTimeMinutes?: number | null;
  actualCutTimeMinutes?: number | null;
  estimatedSetupTimeMinutes?: number | null;
  cutLengthMm?: number | null;
  pierceCount?: number | null;
  totalAreaSqm?: number | null;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function parsePayload(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function materialRatePerSqm(material: string, thickness: number | null) {
  const normalized = material.trim().toLowerCase();
  const thicknessFactor = Math.max(0.5, thickness ?? 1);
  if (normalized.includes("stainless")) return 780 * thicknessFactor;
  if (normalized.includes("aluminium") || normalized.includes("aluminum")) return 420 * thicknessFactor;
  return 310 * thicknessFactor;
}

function gasRatePerMeter(material: string, thickness: number | null) {
  const normalized = material.trim().toLowerCase();
  const thicknessFactor = Math.max(0.5, thickness ?? 1);
  if (normalized.includes("stainless")) return 0.22 * thicknessFactor;
  return 0.12 * thicknessFactor;
}

function cuttingRatePerMinute(material: string, thickness: number | null) {
  const normalized = material.trim().toLowerCase();
  const thicknessFactor = Math.max(0.5, thickness ?? 1);
  if (normalized.includes("stainless")) return 8.5 + thicknessFactor * 1.8;
  return 6.2 + thicknessFactor * 1.4;
}

function laborRatePerMinute() {
  return 2.1;
}

function setupRatePerMinute() {
  return 2.6;
}

function rowToProfitRecord(row: Record<string, unknown>): ProfitRecord {
  return {
    id: Number(row.id ?? 0),
    jobId: row.jobId ? String(row.jobId) : null,
    quoteId: row.quoteId ? String(row.quoteId) : null,
    customerId: row.customerId ? String(row.customerId) : null,
    partDnaId: row.partDnaId === null || row.partDnaId === undefined ? null : Number(row.partDnaId),
    material: String(row.material ?? ""),
    thickness: row.thickness === null || row.thickness === undefined ? null : Number(row.thickness),
    revenue: Number(row.revenue ?? 0),
    materialCost: Number(row.materialCost ?? 0),
    cuttingCost: Number(row.cuttingCost ?? 0),
    gasCost: Number(row.gasCost ?? 0),
    laborCost: Number(row.laborCost ?? 0),
    setupCost: Number(row.setupCost ?? 0),
    scrapCost: Number(row.scrapCost ?? 0),
    deliveryCost: Number(row.deliveryCost ?? 0),
    totalCost: Number(row.totalCost ?? 0),
    grossProfit: Number(row.grossProfit ?? 0),
    marginPercent: Number(row.marginPercent ?? 0),
    createdAt: String(row.createdAt ?? "")
  };
}

function rowToProfitInsight(row: Record<string, unknown>): ProfitInsight {
  return {
    id: Number(row.id ?? 0),
    insightType: String(row.insightType ?? ""),
    title: String(row.title ?? ""),
    message: String(row.message ?? ""),
    confidence: Number(row.confidence ?? 0),
    payloadJson: String(row.payloadJson ?? "{}"),
    createdAt: String(row.createdAt ?? "")
  };
}

export function openProfitIntelligenceDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-profit-intelligence.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS profit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId TEXT,
      quoteId TEXT,
      customerId TEXT,
      partDnaId INTEGER,
      material TEXT NOT NULL,
      thickness REAL,
      revenue REAL NOT NULL,
      materialCost REAL NOT NULL,
      cuttingCost REAL NOT NULL,
      gasCost REAL NOT NULL,
      laborCost REAL NOT NULL,
      setupCost REAL NOT NULL,
      scrapCost REAL NOT NULL,
      deliveryCost REAL NOT NULL,
      totalCost REAL NOT NULL,
      grossProfit REAL NOT NULL,
      marginPercent REAL NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profit_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      insightType TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      confidence REAL NOT NULL,
      payloadJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_profit_records_job ON profit_records(jobId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_profit_records_customer ON profit_records(customerId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_profit_insights_type ON profit_insights(insightType, createdAt DESC);
  `);
  return db;
}

export class ProfitIntelligenceService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly brainCore: BrainCoreService,
    private readonly manufacturingMemory: ManufacturingMemoryService
  ) {}

  calculateForJob(input: ProfitCalculationInput) {
    const material = input.material?.trim() || "Unknown Material";
    const thickness = typeof input.thickness === "number" && Number.isFinite(input.thickness) ? input.thickness : null;
    const revenue = roundMoney(
      typeof input.revenue === "number" && Number.isFinite(input.revenue)
        ? input.revenue
        : typeof input.jobPrice === "number" && Number.isFinite(input.jobPrice)
          ? input.jobPrice
          : 0
    );
    const totalAreaSqm = Math.max(0, input.totalAreaSqm ?? 0);
    const materialCostBase = totalAreaSqm > 0 ? totalAreaSqm * materialRatePerSqm(material, thickness) : 0;
    const materialCost = roundMoney(
      typeof input.jobCost === "number" && Number.isFinite(input.jobCost) && input.jobCost > 0
        ? Math.max(materialCostBase, input.jobCost * 0.55)
        : materialCostBase
    );
    const effectiveCutMinutes = Math.max(0, input.actualCutTimeMinutes ?? input.estimatedCutTimeMinutes ?? 0);
    const cuttingCost = roundMoney(effectiveCutMinutes * cuttingRatePerMinute(material, thickness));
    const cutMeters = Math.max(0, (input.cutLengthMm ?? 0) / 1000);
    const gasCost = roundMoney(cutMeters * gasRatePerMeter(material, thickness));
    const laborCost = roundMoney(effectiveCutMinutes * laborRatePerMinute());
    const setupCost = roundMoney(Math.max(0, input.estimatedSetupTimeMinutes ?? 0) * setupRatePerMinute());
    const scrapCost = roundMoney(materialCost * 0.08);
    const deliveryCost = roundMoney(revenue > 0 ? Math.min(revenue * 0.03, 250) : 0);
    const totalCost = roundMoney(materialCost + cuttingCost + gasCost + laborCost + setupCost + scrapCost + deliveryCost);
    const grossProfit = roundMoney(revenue - totalCost);
    const marginPercent = roundMoney(revenue > 0 ? (grossProfit / revenue) * 100 : 0);
    const createdAt = new Date().toISOString();

    const existing = this.db.prepare(`SELECT * FROM profit_records WHERE jobId = ? ORDER BY id DESC LIMIT 1`).get(input.jobId) as
      | Record<string, unknown>
      | undefined;
    if (existing) {
      this.db.prepare(
        `UPDATE profit_records
         SET quoteId = ?, customerId = ?, partDnaId = ?, material = ?, thickness = ?, revenue = ?, materialCost = ?, cuttingCost = ?, gasCost = ?, laborCost = ?, setupCost = ?, scrapCost = ?, deliveryCost = ?, totalCost = ?, grossProfit = ?, marginPercent = ?, createdAt = ?
         WHERE id = ?`
      ).run(
        input.quoteId ?? null,
        input.customerId ?? null,
        input.partDnaId ?? null,
        material,
        thickness,
        revenue,
        materialCost,
        cuttingCost,
        gasCost,
        laborCost,
        setupCost,
        scrapCost,
        deliveryCost,
        totalCost,
        grossProfit,
        marginPercent,
        createdAt,
        Number(existing.id)
      );
    } else {
      this.db.prepare(
        `INSERT INTO profit_records
         (jobId, quoteId, customerId, partDnaId, material, thickness, revenue, materialCost, cuttingCost, gasCost, laborCost, setupCost, scrapCost, deliveryCost, totalCost, grossProfit, marginPercent, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.jobId,
        input.quoteId ?? null,
        input.customerId ?? null,
        input.partDnaId ?? null,
        material,
        thickness,
        revenue,
        materialCost,
        cuttingCost,
        gasCost,
        laborCost,
        setupCost,
        scrapCost,
        deliveryCost,
        totalCost,
        grossProfit,
        marginPercent,
        createdAt
      );
    }

    const record = this.db.prepare(`SELECT * FROM profit_records WHERE jobId = ? ORDER BY id DESC LIMIT 1`).get(input.jobId) as Record<string, unknown>;
    const profitRecord = rowToProfitRecord(record);
    const insights = this.generateInsights(profitRecord, input.workspaceId);

    this.brainCore.eventService.recordEvent({
      eventType: "payment_received",
      entityType: "profit_record",
      entityId: String(profitRecord.id),
      payload: {
        workspaceId: input.workspaceId,
        jobId: input.jobId,
        customerId: input.customerId ?? null,
        quoteId: input.quoteId ?? null,
        grossProfit,
        marginPercent,
        material,
        thickness
      }
    });
    this.manufacturingMemory.rebuildFromBrainEvents(input.workspaceId);
    return { record: profitRecord, insights };
  }

  listRecords(filter?: { customerId?: string; limit?: number }) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter?.customerId?.trim()) {
      clauses.push("customerId = ?");
      params.push(filter.customerId.trim());
    }
    const limit = Math.max(1, Math.min(500, filter?.limit ?? 100));
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM profit_records ${where} ORDER BY id DESC LIMIT ${limit}`).all(...params) as Record<string, unknown>[];
    return rows.map(rowToProfitRecord);
  }

  listInsights(limit = 100) {
    const rows = this.db.prepare(`SELECT * FROM profit_insights ORDER BY id DESC LIMIT ${Math.max(1, Math.min(500, limit))}`).all() as Record<string, unknown>[];
    return rows.map(rowToProfitInsight);
  }

  getSummary() {
    const records = this.listRecords({ limit: 1000 });
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const profitToday = roundMoney(records.filter((entry) => entry.createdAt >= startOfDay).reduce((sum, entry) => sum + entry.grossProfit, 0));
    const profitMonth = roundMoney(records.filter((entry) => entry.createdAt >= startOfMonth).reduce((sum, entry) => sum + entry.grossProfit, 0));

    const byCustomer = new Map<string, { revenue: number; grossProfit: number; jobCount: number }>();
    for (const record of records) {
      const customerId = record.customerId ?? "Unknown";
      const current = byCustomer.get(customerId) ?? { revenue: 0, grossProfit: 0, jobCount: 0 };
      current.revenue += record.revenue;
      current.grossProfit += record.grossProfit;
      current.jobCount += 1;
      byCustomer.set(customerId, current);
    }
    const customerRows = [...byCustomer.entries()].map(([customerId, totals]) => ({
      customerId,
      revenue: roundMoney(totals.revenue),
      grossProfit: roundMoney(totals.grossProfit),
      marginPercent: roundMoney(totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : 0),
      jobCount: totals.jobCount
    }));

    return {
      profitToday,
      profitMonth,
      bestCustomers: customerRows.sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 5),
      worstCustomers: [...customerRows].sort((a, b) => a.grossProfit - b.grossProfit).slice(0, 5),
      underpricedJobs: records.filter((entry) => entry.marginPercent < 12).slice(0, 10),
      recommendedPriceIncreases: this.listInsights(50).filter((entry) => entry.insightType === "price_increase_suggestion").slice(0, 10)
    } satisfies ProfitSummary;
  }

  private generateInsights(record: ProfitRecord, workspaceId: string) {
    const insights: ProfitInsight[] = [];
    const addInsight = (input: {
      insightType: string;
      title: string;
      message: string;
      confidence: number;
      payload?: Record<string, unknown>;
    }) => {
      const payloadJson = JSON.stringify({ workspaceId, profitRecordId: record.id, ...input.payload });
      const duplicate = this.db.prepare(
        `SELECT * FROM profit_insights WHERE insightType = ? AND title = ? AND payloadJson = ? ORDER BY id DESC LIMIT 1`
      ).get(input.insightType, input.title, payloadJson) as Record<string, unknown> | undefined;
      if (duplicate) {
        insights.push(rowToProfitInsight(duplicate));
        return;
      }
      const createdAt = new Date().toISOString();
      const result = this.db.prepare(
        `INSERT INTO profit_insights (insightType, title, message, confidence, payloadJson, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(input.insightType, input.title, input.message, clamp(input.confidence, 0, 1), payloadJson, createdAt);
      const row = this.db.prepare(`SELECT * FROM profit_insights WHERE id = ?`).get(Number(result.lastInsertRowid)) as Record<string, unknown>;
      insights.push(rowToProfitInsight(row));
    };

    if (record.marginPercent < 12) {
      addInsight({
        insightType: "underpriced_job",
        title: `Underpriced job ${record.jobId ?? record.id}`,
        message: `Job ${record.jobId ?? record.id} only returned ${record.marginPercent.toFixed(1)}% margin. Review pricing before repeating this work.`,
        confidence: 0.9,
        payload: { jobId: record.jobId, customerId: record.customerId, marginPercent: record.marginPercent }
      });
      addInsight({
        insightType: "price_increase_suggestion",
        title: `Increase price on ${record.material}${record.thickness !== null ? ` ${record.thickness}mm` : ""}`,
        message: `This job ran at low margin. Increase selling price or setup recovery for similar work.`,
        confidence: 0.84,
        payload: { material: record.material, thickness: record.thickness, marginPercent: record.marginPercent }
      });
      this.brainCore.recommendationService.createRecommendation({
        moduleName: "profit_intelligence",
        recommendationType: "underpriced_job",
        title: `Underpriced job detected`,
        message: `Job ${record.jobId ?? record.id} is below target margin at ${record.marginPercent.toFixed(1)}%.`,
        confidence: 0.9,
        impactScore: 86,
        payload: { workspaceId, jobId: record.jobId, customerId: record.customerId, marginPercent: record.marginPercent }
      });
    }
    if (record.marginPercent >= 35 && record.customerId) {
      addInsight({
        insightType: "high_profit_customer",
        title: `High profit customer ${record.customerId}`,
        message: `Customer ${record.customerId} generated a strong ${record.marginPercent.toFixed(1)}% margin on the latest job.`,
        confidence: 0.82,
        payload: { customerId: record.customerId, marginPercent: record.marginPercent }
      });
    }
    if (record.marginPercent <= 10 && record.customerId) {
      addInsight({
        insightType: "low_profit_customer",
        title: `Low profit customer ${record.customerId}`,
        message: `Customer ${record.customerId} is currently low margin and may need a pricing review.`,
        confidence: 0.8,
        payload: { customerId: record.customerId, marginPercent: record.marginPercent }
      });
    }
    if (record.marginPercent >= 28) {
      addInsight({
        insightType: "profitable_material_type",
        title: `Profitable material type ${record.material}${record.thickness !== null ? ` ${record.thickness}mm` : ""}`,
        message: `${record.material}${record.thickness !== null ? ` ${record.thickness}mm` : ""} is currently producing strong margin.`,
        confidence: 0.77,
        payload: { material: record.material, thickness: record.thickness, marginPercent: record.marginPercent }
      });
    }
    return insights;
  }
}
