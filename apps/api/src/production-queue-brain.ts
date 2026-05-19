import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import {
  calculateJobQueueScore,
  createPlaceholderSmartQueueServices,
  type SmartJobRecord,
  type SmartQueueServices
} from "./smart-job-queue.js";
import type { BrainCoreService, BrainRecommendationRecord } from "./brain-core.js";
import type { MaterialPredictionService, MaterialShortageRecord } from "./material-prediction.js";
import type { OffcutRecord, StockSheetRecord, StockSnapshot } from "./stock-material.js";

export type QueueScoreRecord = {
  id: number;
  workspaceId: string;
  jobId: number;
  score: number;
  reasonsJson: string;
  createdAt: string;
};

export type QueuePlanStatus = "draft" | "active" | "completed";

export type QueuePlanRecord = {
  id: number;
  workspaceId: string;
  title: string;
  status: QueuePlanStatus;
  totalEstimatedMinutes: number;
  setupSavingMinutes: number;
  materialSavingEstimate: number;
  createdAt: string;
  items: QueuePlanItemRecord[];
};

export type QueuePlanItemRecord = {
  id: number;
  queuePlanId: number;
  jobId: number;
  sortOrder: number;
  reason: string;
  createdAt: string;
};

export type ProductionQueueScoredJob = SmartJobRecord & {
  brainScore: number;
  brainReasons: string[];
  stockAvailable: boolean;
  offcutSavingEstimate: number;
  blocked: boolean;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function materialKey(material: string) {
  return material.trim().toLowerCase();
}

function sameThickness(left: number | null | undefined, right: number | null | undefined) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return Math.abs(left - right) < 0.0001;
}

function parseReasonsJson(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

function queueScoreRow(row: Record<string, unknown>): QueueScoreRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    jobId: Number(row.jobId ?? 0),
    score: Number(row.score ?? 0),
    reasonsJson: String(row.reasonsJson ?? "[]"),
    createdAt: String(row.createdAt ?? "")
  };
}

function queuePlanRow(row: Record<string, unknown>): QueuePlanRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    title: String(row.title ?? ""),
    status: row.status === "active" || row.status === "completed" ? row.status : "draft",
    totalEstimatedMinutes: Number(row.totalEstimatedMinutes ?? 0),
    setupSavingMinutes: Number(row.setupSavingMinutes ?? 0),
    materialSavingEstimate: Number(row.materialSavingEstimate ?? 0),
    createdAt: String(row.createdAt ?? ""),
    items: []
  };
}

function queuePlanItemRow(row: Record<string, unknown>): QueuePlanItemRecord {
  return {
    id: Number(row.id ?? 0),
    queuePlanId: Number(row.queuePlanId ?? 0),
    jobId: Number(row.jobId ?? 0),
    sortOrder: Number(row.sortOrder ?? 0),
    reason: String(row.reason ?? ""),
    createdAt: String(row.createdAt ?? "")
  };
}

export function openProductionQueueBrainDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-production-queue-brain.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS queue_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      jobId INTEGER NOT NULL,
      score REAL NOT NULL,
      reasonsJson TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queue_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      totalEstimatedMinutes REAL NOT NULL,
      setupSavingMinutes REAL NOT NULL,
      materialSavingEstimate REAL NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queue_plan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queuePlanId INTEGER NOT NULL,
      jobId INTEGER NOT NULL,
      sortOrder INTEGER NOT NULL,
      reason TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(queuePlanId) REFERENCES queue_plans(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_queue_scores_workspace ON queue_scores(workspaceId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_queue_scores_job ON queue_scores(workspaceId, jobId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_queue_plans_workspace ON queue_plans(workspaceId, status, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_queue_plan_items_plan ON queue_plan_items(queuePlanId, sortOrder ASC);
  `);
  return db;
}

export class ProductionQueueBrainService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly brainCore: BrainCoreService,
    private readonly materialPrediction: MaterialPredictionService
  ) {}

  scoreJobs(input: {
    workspaceId: string;
    jobs: SmartJobRecord[];
    stockSnapshot: StockSnapshot;
    services?: SmartQueueServices;
    now?: Date;
  }) {
    const services = input.services ?? createPlaceholderSmartQueueServices();
    const now = input.now ?? new Date();
    const shortages = this.materialPrediction.getShortages({
      workspaceId: input.workspaceId,
      stockSnapshot: input.stockSnapshot
    });
    this.db.prepare(`DELETE FROM queue_scores WHERE workspaceId = ?`).run(input.workspaceId);

    const scoredJobs = input.jobs
      .filter((job) => job.status !== "completed" && job.status !== "cancelled")
      .map((job) => this.scoreSingleJob(job, input.jobs, input.stockSnapshot, shortages, services, now))
      .sort((left, right) => right.brainScore - left.brainScore || left.estimatedCutTimeMinutes - right.estimatedCutTimeMinutes);

    for (const job of scoredJobs) {
      this.db.prepare(
        `INSERT INTO queue_scores (workspaceId, jobId, score, reasonsJson, createdAt)
         VALUES (?, ?, ?, ?, ?)`
      ).run(input.workspaceId, job.id, job.brainScore, JSON.stringify(job.brainReasons), now.toISOString());
    }

    return scoredJobs;
  }

  createPlan(input: {
    workspaceId: string;
    jobs: SmartJobRecord[];
    stockSnapshot: StockSnapshot;
    services?: SmartQueueServices;
    title?: string;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const scoredJobs = this.scoreJobs(input);
    const title = input.title?.trim() || `AI Queue Plan ${now.toISOString().slice(0, 10)}`;
    this.db.prepare(`UPDATE queue_plans SET status = 'completed' WHERE workspaceId = ? AND status = 'draft'`).run(input.workspaceId);

    const totals = this.estimatePlanSavings(scoredJobs);
    const planResult = this.db.prepare(
      `INSERT INTO queue_plans
       (workspaceId, title, status, totalEstimatedMinutes, setupSavingMinutes, materialSavingEstimate, createdAt)
       VALUES (?, ?, 'draft', ?, ?, ?, ?)`
    ).run(input.workspaceId, title, totals.totalEstimatedMinutes, totals.setupSavingMinutes, totals.materialSavingEstimate, now.toISOString());
    const planId = Number(planResult.lastInsertRowid ?? 0);

    const items: QueuePlanItemRecord[] = [];
    for (const [index, job] of scoredJobs.entries()) {
      const reason = job.brainReasons.slice(0, 3).join(" • ") || "AI queue recommendation";
      const itemResult = this.db.prepare(
        `INSERT INTO queue_plan_items
         (queuePlanId, jobId, sortOrder, reason, createdAt)
         VALUES (?, ?, ?, ?, ?)`
      ).run(planId, job.id, index, reason, now.toISOString());
      items.push({
        id: Number(itemResult.lastInsertRowid ?? 0),
        queuePlanId: planId,
        jobId: job.id,
        sortOrder: index,
        reason,
        createdAt: now.toISOString()
      });
    }

    const plan = this.getPlanById(input.workspaceId, planId);
    const recommendation = this.brainCore.recommendationService.createRecommendation({
      moduleName: "production_queue_brain",
      recommendationType: "production_plan_created",
      title: "AI production queue plan ready",
      message: `${title} recommends ${items.length} jobs with ${totals.setupSavingMinutes.toFixed(0)} setup minutes saved.`,
      confidence: 0.82,
      impactScore: clamp(60 + items.length * 4, 40, 96),
      payload: {
        workspaceId: input.workspaceId,
        queuePlanId: planId,
        totalEstimatedMinutes: totals.totalEstimatedMinutes,
        setupSavingMinutes: totals.setupSavingMinutes,
        materialSavingEstimate: totals.materialSavingEstimate
      }
    });
    return { plan, scoredJobs, recommendation };
  }

  getCurrentPlan(workspaceId: string) {
    const row = this.db.prepare(
      `SELECT * FROM queue_plans
       WHERE workspaceId = ?
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, createdAt DESC
       LIMIT 1`
    ).get(workspaceId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.getPlanById(workspaceId, Number(row.id ?? 0));
  }

  startPlan(workspaceId: string, planId: number) {
    this.db.prepare(`UPDATE queue_plans SET status = 'draft' WHERE workspaceId = ? AND status = 'active'`).run(workspaceId);
    this.db.prepare(`UPDATE queue_plans SET status = 'active' WHERE workspaceId = ? AND id = ?`).run(workspaceId, planId);
    return this.getPlanById(workspaceId, planId);
  }

  completePlan(workspaceId: string, planId: number) {
    this.db.prepare(`UPDATE queue_plans SET status = 'completed' WHERE workspaceId = ? AND id = ?`).run(workspaceId, planId);
    return this.getPlanById(workspaceId, planId);
  }

  listScores(workspaceId: string) {
    const rows = this.db.prepare(`SELECT * FROM queue_scores WHERE workspaceId = ? ORDER BY score DESC, createdAt DESC`).all(workspaceId) as Record<string, unknown>[];
    return rows.map(queueScoreRow);
  }

  private getPlanById(workspaceId: string, planId: number) {
    const row = this.db.prepare(`SELECT * FROM queue_plans WHERE workspaceId = ? AND id = ? LIMIT 1`).get(workspaceId, planId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const plan = queuePlanRow(row);
    const itemRows = this.db.prepare(`SELECT * FROM queue_plan_items WHERE queuePlanId = ? ORDER BY sortOrder ASC`).all(planId) as Record<string, unknown>[];
    plan.items = itemRows.map(queuePlanItemRow);
    return plan;
  }

  private scoreSingleJob(
    job: SmartJobRecord,
    allJobs: SmartJobRecord[],
    stockSnapshot: StockSnapshot,
    shortages: MaterialShortageRecord[],
    services: SmartQueueServices,
    now: Date
  ): ProductionQueueScoredJob {
    const base = calculateJobQueueScore(job, allJobs, services, now);
    let score = base.score;
    const reasons = [...base.reasons];

    const stockMatch = this.findBestSheet(job, stockSnapshot.sheets);
    const offcutMatch = this.findBestOffcut(job, stockSnapshot.offcuts);
    const shortage = shortages.find((entry) =>
      materialKey(entry.material) === materialKey(job.material) &&
      sameThickness(entry.thickness, job.thickness ?? null)
    );

    const stockAvailable = Boolean(stockMatch || offcutMatch);
    if (stockMatch) {
      score += 70;
      reasons.push("Stock available now");
    }
    if (offcutMatch) {
      score += 95;
      reasons.push("Offcut match available");
    }
    if (job.partDnaId && services.partDnaService.getPartById(job.partDnaId)) {
      score += 38;
      reasons.push("Known Part DNA history");
    }

    if (shortage) {
      if (!stockAvailable) {
        score -= shortage.forecastPeriodDays <= shortage.leadTimeDays + 3 ? 180 : 110;
        reasons.push("Blocked by material shortage");
      } else if (job.priority === "urgent") {
        score += 36;
        reasons.push("Material risk makes this urgent run valuable");
      } else {
        score -= 18;
        reasons.push("Material shortage risk");
      }
    }

    const relatedJobs = allJobs.filter((candidate) =>
      candidate.id !== job.id &&
      candidate.status !== "completed" &&
      candidate.status !== "cancelled" &&
      materialKey(candidate.material) === materialKey(job.material) &&
      sameThickness(candidate.thickness ?? null, job.thickness ?? null)
    );
    if (relatedJobs.length > 0) {
      score += Math.min(60, relatedJobs.length * 12);
      reasons.push("Pairs well with same material/thickness jobs");
    }

    const blocked = !base.ready || (!stockAvailable && Boolean(shortage));
    return {
      ...job,
      brainScore: Math.round(score),
      brainReasons: reasons,
      stockAvailable,
      offcutSavingEstimate: offcutMatch?.savingEstimate ?? 0,
      blocked
    };
  }

  private estimatePlanSavings(jobs: ProductionQueueScoredJob[]) {
    const totalEstimatedMinutes = jobs.reduce((sum, job) => sum + job.estimatedCutTimeMinutes + job.estimatedSetupTimeMinutes, 0);
    let setupSavingMinutes = 0;
    let materialSavingEstimate = 0;
    for (let index = 1; index < jobs.length; index += 1) {
      const previous = jobs[index - 1];
      const current = jobs[index];
      if (materialKey(previous.material) === materialKey(current.material) && sameThickness(previous.thickness ?? null, current.thickness ?? null)) {
        setupSavingMinutes += Math.max(4, Math.min(previous.estimatedSetupTimeMinutes, current.estimatedSetupTimeMinutes, 18));
      }
    }
    for (const job of jobs) {
      materialSavingEstimate += job.offcutSavingEstimate;
    }
    return {
      totalEstimatedMinutes: round(totalEstimatedMinutes, 0.01),
      setupSavingMinutes: round(setupSavingMinutes, 0.01),
      materialSavingEstimate: round(materialSavingEstimate, 0.01)
    };
  }

  private findBestSheet(job: SmartJobRecord, sheets: StockSheetRecord[]) {
    if (!job.material.trim() || !job.thickness || job.thickness <= 0) return null;
    const requiredArea = Math.max(1, (job.estimatedCutLength / 1000) * Math.max(0.25, job.thickness / 6));
    return sheets.find((sheet) =>
      sheet.status === "available" &&
      sheet.quantity > 0 &&
      materialKey(sheet.material) === materialKey(job.material) &&
      sameThickness(sheet.thickness, job.thickness) &&
      sheet.width * sheet.height >= requiredArea * 1_000_000
    ) ?? null;
  }

  private findBestOffcut(job: SmartJobRecord, offcuts: OffcutRecord[]) {
    if (!job.material.trim() || !job.thickness || job.thickness <= 0) return null;
    const candidates = offcuts
      .filter((offcut) =>
        offcut.status === "available" &&
        materialKey(offcut.material) === materialKey(job.material) &&
        sameThickness(offcut.thickness, job.thickness)
      )
      .map((offcut) => {
        const estimatedNeed = Math.max(0.1, (job.estimatedCutLength / 1000) * Math.max(0.15, job.thickness / 10));
        const usableAreaSqm = (offcut.usableArea > 0 ? offcut.usableArea : offcut.width * offcut.height) / 1_000_000;
        const wasteArea = Math.max(0, usableAreaSqm - estimatedNeed);
        return {
          offcut,
          wasteArea,
          savingEstimate: round(Math.max(0, wasteArea) * 240, 0.01)
        };
      })
      .filter((entry) => entry.wasteArea >= 0)
      .sort((left, right) => left.wasteArea - right.wasteArea);
    return candidates[0] ?? null;
  }
}
