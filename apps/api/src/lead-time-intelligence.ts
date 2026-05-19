import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService } from "./brain-core.js";
import type { ManufacturingMemoryService } from "./manufacturing-memory.js";
import type { ProductionQueueBrainService } from "./production-queue-brain.js";
import type { SmartJobRecord, SmartQueueServices } from "./smart-job-queue.js";
import type { StockSnapshot } from "./stock-material.js";

export type LeadTimePredictionRecord = {
  id: number;
  workspaceId: string;
  jobId: number | null;
  quoteId: string | null;
  estimatedStartAt: string;
  estimatedFinishAt: string;
  confidence: number;
  reasonsJson: string;
  createdAt: string;
};

export type LeadTimePredictionResult = LeadTimePredictionRecord & {
  reasons: string[];
  riskWarnings: string[];
  queueLoadMinutes: number;
  stockDelayDays: number;
  adjustedCutTimeMinutes: number;
  setupMinutes: number;
  operatorCapacityMinutesPerDay: number;
  similarHistorySamples: number;
};

type QueueJobInput = SmartJobRecord & {
  queueScore?: number;
  queueReasons?: string[];
};

type PredictLeadTimeInput = {
  workspaceId: string;
  target: QueueJobInput;
  jobs: QueueJobInput[];
  stockSnapshot: StockSnapshot;
  workerCount?: number;
  services?: SmartQueueServices;
  now?: Date;
  quoteId?: string | null;
};

type SimilarJobHistory = {
  averageActualCutMinutes: number | null;
  sampleCount: number;
};

type ReasonPayload = {
  reasons: string[];
  riskWarnings: string[];
  queueLoadMinutes: number;
  stockDelayDays: number;
  adjustedCutTimeMinutes: number;
  setupMinutes: number;
  operatorCapacityMinutesPerDay: number;
  similarHistorySamples: number;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function materialMatches(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function sameThickness(left: number | null | undefined, right: number | null | undefined) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return Math.abs(left - right) < 0.0001;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function dateDiffDays(fromIso: string, to: Date) {
  const from = Date.parse(fromIso);
  if (!Number.isFinite(from)) return null;
  return (from - to.getTime()) / 86_400_000;
}

function parseReasonPayload(value: string): ReasonPayload {
  try {
    const parsed = JSON.parse(value) as Partial<ReasonPayload>;
    return {
      reasons: Array.isArray(parsed?.reasons) ? parsed.reasons.map((entry) => String(entry)) : [],
      riskWarnings: Array.isArray(parsed?.riskWarnings) ? parsed.riskWarnings.map((entry) => String(entry)) : [],
      queueLoadMinutes: Number(parsed?.queueLoadMinutes ?? 0),
      stockDelayDays: Number(parsed?.stockDelayDays ?? 0),
      adjustedCutTimeMinutes: Number(parsed?.adjustedCutTimeMinutes ?? 0),
      setupMinutes: Number(parsed?.setupMinutes ?? 0),
      operatorCapacityMinutesPerDay: Number(parsed?.operatorCapacityMinutesPerDay ?? 0),
      similarHistorySamples: Number(parsed?.similarHistorySamples ?? 0)
    };
  } catch {
    return {
      reasons: [],
      riskWarnings: [],
      queueLoadMinutes: 0,
      stockDelayDays: 0,
      adjustedCutTimeMinutes: 0,
      setupMinutes: 0,
      operatorCapacityMinutesPerDay: 0,
      similarHistorySamples: 0
    };
  }
}

function rowToLeadTimePrediction(row: Record<string, unknown>): LeadTimePredictionRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    jobId: row.jobId === null || row.jobId === undefined ? null : Number(row.jobId),
    quoteId: row.quoteId ? String(row.quoteId) : null,
    estimatedStartAt: String(row.estimatedStartAt ?? ""),
    estimatedFinishAt: String(row.estimatedFinishAt ?? ""),
    confidence: Number(row.confidence ?? 0),
    reasonsJson: String(row.reasonsJson ?? "{}"),
    createdAt: String(row.createdAt ?? "")
  };
}

function withParsedPayload(record: LeadTimePredictionRecord): LeadTimePredictionResult {
  const payload = parseReasonPayload(record.reasonsJson);
  return {
    ...record,
    ...payload
  };
}

function estimateSetupMinutes(job: QueueJobInput) {
  if (job.estimatedSetupTimeMinutes > 0) return job.estimatedSetupTimeMinutes;
  if (job.sheetSize?.trim()) return 12;
  return 8;
}

function estimateStockDelayDays(job: QueueJobInput, stockSnapshot: StockSnapshot) {
  const matchingSheets = stockSnapshot.sheets.filter((sheet) =>
    sheet.status === "available" &&
    materialMatches(sheet.material, job.material) &&
    sameThickness(sheet.thickness, job.thickness ?? null) &&
    sheet.quantity > 0
  );
  const matchingOffcuts = stockSnapshot.offcuts.filter((offcut) =>
    offcut.status === "available" &&
    materialMatches(offcut.material, job.material) &&
    sameThickness(offcut.thickness, job.thickness ?? null)
  );
  if (matchingSheets.length > 0 || matchingOffcuts.length > 0) {
    return { stockDelayDays: 0, stockAvailable: true };
  }
  const reservedSheets = stockSnapshot.sheets.filter((sheet) =>
    sheet.status === "reserved" &&
    materialMatches(sheet.material, job.material) &&
    sameThickness(sheet.thickness, job.thickness ?? null)
  );
  if (reservedSheets.length > 0) {
    return { stockDelayDays: 1.5, stockAvailable: false };
  }
  return { stockDelayDays: 3, stockAvailable: false };
}

export function openLeadTimeIntelligenceDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-lead-time-intelligence.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS lead_time_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      jobId INTEGER,
      quoteId TEXT,
      estimatedStartAt TEXT NOT NULL,
      estimatedFinishAt TEXT NOT NULL,
      confidence REAL NOT NULL,
      reasonsJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_lead_time_predictions_job ON lead_time_predictions(workspaceId, jobId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_lead_time_predictions_quote ON lead_time_predictions(workspaceId, quoteId, createdAt DESC);
  `);
  return db;
}

export class LeadTimeIntelligenceService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly brainCore: BrainCoreService,
    private readonly productionQueue: ProductionQueueBrainService,
    private readonly manufacturingMemory: ManufacturingMemoryService,
    private readonly partDnaDb: DatabaseSync
  ) {}

  predict(input: PredictLeadTimeInput) {
    const now = input.now ?? new Date();
    const activeJobs = input.jobs.filter((job) => job.status !== "completed" && job.status !== "cancelled");
    const currentPlan = this.productionQueue.getCurrentPlan(input.workspaceId);
    const operatorCapacityMinutesPerDay = Math.max(1, input.workerCount ?? 1) * 480;
    const queueLoadMinutes = this.calculateQueueLoadMinutes(input.target, activeJobs, currentPlan);
    const setupMinutes = estimateSetupMinutes(input.target);
    const similarHistory = this.findSimilarJobHistory(input.workspaceId, input.target);
    const memoryAdjustment = this.getManufacturingMemoryAdjustment(input.workspaceId, input.target);
    const adjustedCutTimeMinutes = round(
      Math.max(
        input.target.estimatedCutTimeMinutes || 1,
        similarHistory.averageActualCutMinutes
          ? input.target.estimatedCutTimeMinutes * 0.4 + similarHistory.averageActualCutMinutes * 0.6
          : input.target.estimatedCutTimeMinutes || 1
      ) * (1 + memoryAdjustment.extraCutFactor),
      0.1
    );
    const stockState = estimateStockDelayDays(input.target, input.stockSnapshot);
    const queueLoadDays = queueLoadMinutes / operatorCapacityMinutesPerDay;
    const workDurationDays = (setupMinutes + adjustedCutTimeMinutes) / operatorCapacityMinutesPerDay;
    const estimatedStartAt = addDays(now, queueLoadDays + stockState.stockDelayDays);
    const estimatedFinishAt = addDays(estimatedStartAt, workDurationDays);

    const reasons: string[] = [];
    const riskWarnings: string[] = [];
    reasons.push(`Queue load ahead: ${Math.round(queueLoadMinutes)} minutes across active work.`);
    reasons.push(`Setup estimate: ${Math.round(setupMinutes)} minutes.`);
    reasons.push(`Cut estimate: ${Math.round(adjustedCutTimeMinutes)} minutes.`);
    reasons.push(`Capacity basis: ${operatorCapacityMinutesPerDay} minutes/day.`);
    if (currentPlan?.status === "active") {
      reasons.push(`Using active AI queue plan: ${currentPlan.title}.`);
    }
    if (stockState.stockAvailable) {
      reasons.push("Matching material is available in local stock or offcuts.");
    } else {
      reasons.push(`Material delay assumed: ${stockState.stockDelayDays.toFixed(1)} day(s).`);
      riskWarnings.push("Material is not currently available. Completion may slip while stock is sourced.");
    }
    if (similarHistory.averageActualCutMinutes !== null && similarHistory.sampleCount > 0) {
      reasons.push(
        `Part DNA history used: ${similarHistory.sampleCount} similar job(s), average actual cut time ${Math.round(similarHistory.averageActualCutMinutes)} minutes.`
      );
      if (similarHistory.averageActualCutMinutes > input.target.estimatedCutTimeMinutes * 1.2) {
        riskWarnings.push("Similar Part DNA history ran longer than the current estimated cut time.");
      }
    } else {
      reasons.push("No previous Part DNA cut-time history found. Estimation relies more on current queue data.");
    }
    if (memoryAdjustment.reasons.length) {
      reasons.push(...memoryAdjustment.reasons);
    }
    if (!input.target.ready) {
      riskWarnings.push("Job is not fully ready to cut yet.");
    }
    if (!input.target.dxfFilePath) {
      riskWarnings.push("DXF is missing, so the lead-time prediction is less reliable.");
    }
    const dueDateDiffDays = input.target.dueDate ? dateDiffDays(input.target.dueDate, estimatedFinishAt) : null;
    if (dueDateDiffDays !== null && dueDateDiffDays < 0) {
      riskWarnings.push(`Predicted to miss the due date by about ${Math.ceil(Math.abs(dueDateDiffDays))} day(s).`);
    } else if (dueDateDiffDays !== null && dueDateDiffDays <= 1.5) {
      riskWarnings.push("Very tight due date. Any interruption could make this job late.");
    }

    let confidence = 0.58;
    if (stockState.stockAvailable) confidence += 0.12;
    if (similarHistory.sampleCount > 0) confidence += 0.14;
    if (input.target.ready) confidence += 0.08;
    if (input.target.dxfFilePath) confidence += 0.04;
    if (memoryAdjustment.confidenceBoost) confidence += memoryAdjustment.confidenceBoost;
    if (!stockState.stockAvailable) confidence -= 0.1;
    if (riskWarnings.length >= 2) confidence -= 0.04;
    confidence = clamp(round(confidence, 0.01), 0.25, 0.96);

    const payload: ReasonPayload = {
      reasons,
      riskWarnings,
      queueLoadMinutes: round(queueLoadMinutes, 0.1),
      stockDelayDays: round(stockState.stockDelayDays, 0.1),
      adjustedCutTimeMinutes,
      setupMinutes: round(setupMinutes, 0.1),
      operatorCapacityMinutesPerDay,
      similarHistorySamples: similarHistory.sampleCount
    };

    const createdAt = now.toISOString();
    const result = this.db.prepare(
      `INSERT INTO lead_time_predictions
       (workspaceId, jobId, quoteId, estimatedStartAt, estimatedFinishAt, confidence, reasonsJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.workspaceId,
      input.target.id > 0 ? input.target.id : null,
      input.quoteId?.trim() || null,
      estimatedStartAt.toISOString(),
      estimatedFinishAt.toISOString(),
      confidence,
      JSON.stringify(payload),
      createdAt
    );

    if (riskWarnings.length) {
      this.brainCore.recommendationService.createRecommendation({
        moduleName: "lead_time_intelligence",
        recommendationType: "lead_time_risk",
        title: "Lead-time risk detected",
        message: riskWarnings[0],
        confidence,
        impactScore: clamp(60 + riskWarnings.length * 10 + stockState.stockDelayDays * 5, 40, 98),
        payload: {
          workspaceId: input.workspaceId,
          jobId: input.target.id > 0 ? input.target.id : null,
          quoteId: input.quoteId?.trim() || null,
          estimatedFinishAt: estimatedFinishAt.toISOString(),
          riskWarnings
        }
      });
    }

    return withParsedPayload({
      id: Number(result.lastInsertRowid ?? 0),
      workspaceId: input.workspaceId,
      jobId: input.target.id > 0 ? input.target.id : null,
      quoteId: input.quoteId?.trim() || null,
      estimatedStartAt: estimatedStartAt.toISOString(),
      estimatedFinishAt: estimatedFinishAt.toISOString(),
      confidence,
      reasonsJson: JSON.stringify(payload),
      createdAt
    });
  }

  getLatestForJob(workspaceId: string, jobId: number) {
    const row = this.db.prepare(
      `SELECT * FROM lead_time_predictions
       WHERE workspaceId = ? AND jobId = ?
       ORDER BY id DESC LIMIT 1`
    ).get(workspaceId, jobId) as Record<string, unknown> | undefined;
    return row ? withParsedPayload(rowToLeadTimePrediction(row)) : null;
  }

  private calculateQueueLoadMinutes(target: QueueJobInput, jobs: QueueJobInput[], currentPlan: ReturnType<ProductionQueueBrainService["getCurrentPlan"]>) {
    if (target.status === "cutting") return 0;
    if (currentPlan?.items?.length) {
      const targetIndex = currentPlan.items.findIndex((item) => item.jobId === target.id);
      if (targetIndex >= 0) {
        const jobsById = new Map(jobs.map((job) => [job.id, job]));
        return currentPlan.items
          .slice(0, targetIndex)
          .map((item) => jobsById.get(item.jobId))
          .filter((job): job is QueueJobInput => Boolean(job))
          .reduce((sum, job) => sum + estimateSetupMinutes(job) + Math.max(1, job.estimatedCutTimeMinutes), 0);
      }
    }

    const sortedJobs = [...jobs].sort((left, right) => {
      const leftScore = Number(left.queueScore ?? 0);
      const rightScore = Number(right.queueScore ?? 0);
      return rightScore - leftScore || left.createdAt.localeCompare(right.createdAt);
    });
    const targetIndex = sortedJobs.findIndex((job) => job.id === target.id);
    const preceding = targetIndex >= 0 ? sortedJobs.slice(0, targetIndex) : sortedJobs.filter((job) => job.status !== "completed");
    return preceding.reduce((sum, job) => sum + estimateSetupMinutes(job) + Math.max(1, job.estimatedCutTimeMinutes), 0);
  }

  private findSimilarJobHistory(workspaceId: string, job: QueueJobInput): SimilarJobHistory {
    if (!job.partDnaId) {
      return { averageActualCutMinutes: null, sampleCount: 0 };
    }
    const rows = this.partDnaDb.prepare(
      `SELECT actualCutTime
       FROM part_history
       WHERE partId = ?
         AND actualCutTime IS NOT NULL
       ORDER BY createdAt DESC, id DESC
       LIMIT 25`
    ).all(job.partDnaId) as Record<string, unknown>[];
    const actualCutTimes = rows
      .map((row) => Number(row.actualCutTime))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (actualCutTimes.length === 0) {
      return { averageActualCutMinutes: null, sampleCount: 0 };
    }
    const averageActualCutMinutes = actualCutTimes.reduce((sum, value) => sum + value, 0) / actualCutTimes.length;
    return {
      averageActualCutMinutes: round(averageActualCutMinutes, 0.1),
      sampleCount: actualCutTimes.length
    };
  }

  private getManufacturingMemoryAdjustment(workspaceId: string, job: QueueJobInput) {
    const memories = this.manufacturingMemory.listMemories({ workspaceId, limit: 150 });
    const patterns = this.manufacturingMemory.listPatterns({ workspaceId, limit: 100 });
    const reasons: string[] = [];
    let extraCutFactor = 0;
    let confidenceBoost = 0;

    for (const memory of memories) {
      if (memory.memoryType !== "difficult_part") continue;
      try {
        const payload = JSON.parse(memory.payloadJson) as Record<string, unknown>;
        const memoryPartDnaId = Number(payload.partDnaId ?? 0);
        const memoryMaterial = typeof payload.material === "string" ? payload.material : null;
        if ((job.partDnaId && memoryPartDnaId === job.partDnaId) || (memoryMaterial && materialMatches(memoryMaterial, job.material))) {
          extraCutFactor = Math.max(extraCutFactor, 0.12);
          reasons.push("Manufacturing Memory flagged similar work as difficult in the past.");
          break;
        }
      } catch {
        // ignore malformed memory payloads
      }
    }

    for (const pattern of patterns) {
      if (pattern.patternType !== "recurring_material_usage") continue;
      try {
        const payload = JSON.parse(pattern.payloadJson) as Record<string, unknown>;
        const patternMaterial = typeof payload.material === "string" ? payload.material : null;
        if (patternMaterial && materialMatches(patternMaterial, job.material)) {
          confidenceBoost = Math.max(confidenceBoost, 0.04);
          reasons.push("Manufacturing Memory has repeat material usage data for this material, improving prediction confidence.");
          break;
        }
      } catch {
        // ignore malformed pattern payloads
      }
    }

    return { extraCutFactor, confidenceBoost, reasons };
  }
}
