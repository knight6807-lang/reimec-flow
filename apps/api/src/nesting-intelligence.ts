import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService } from "./brain-core.js";
import type { ProductionQueueScoredJob } from "./production-queue-brain.js";
import type { SheetOptimizationResultView, SheetOptimizerService } from "./sheet-optimizer.js";
import type { OffcutRecord, StockSheetRecord, StockSnapshot } from "./stock-material.js";

export type NestingPlanStatus = "draft" | "approved" | "completed";
export type NestingSheetSourceType = "sheet" | "offcut";

export type NestingPlanRecord = {
  id: number;
  workspaceId: string;
  material: string;
  thickness: number;
  sheetSourceType: NestingSheetSourceType;
  sheetSourceId: number | null;
  width: number;
  height: number;
  wastePercent: number;
  estimatedCutTimeMinutes: number;
  estimatedSaving: number;
  status: NestingPlanStatus;
  createdAt: string;
  items: NestingPlanItemRecord[];
};

export type NestingPlanItemRecord = {
  id: number;
  nestingPlanId: number;
  jobId: number | null;
  quoteId: string | null;
  partDnaId: number | null;
  quantity: number;
  x: number;
  y: number;
  rotation: number;
  createdAt: string;
};

export type NestingPartCandidate = {
  jobId: number | null;
  quoteId: string | null;
  partDnaId: number | null;
  quantity: number;
  width: number;
  height: number;
  cutLength: number;
  pierceCount: number;
  material: string;
  thickness: number;
};

export type NestingRecommendationResult = {
  plans: NestingPlanRecord[];
  skippedGroups: Array<{
    material: string;
    thickness: number;
    reason: string;
    jobIds: number[];
  }>;
};

type PlacementItem = {
  jobId: number | null;
  quoteId: string | null;
  partDnaId: number | null;
  width: number;
  height: number;
  cutLength: number;
  pierceCount: number;
};

type PlacementResult = {
  items: Array<{
    jobId: number | null;
    quoteId: string | null;
    partDnaId: number | null;
    x: number;
    y: number;
    rotation: number;
    width: number;
    height: number;
    cutLength: number;
    pierceCount: number;
  }>;
  usedWidth: number;
  usedHeight: number;
};

type SourceCandidate = {
  type: NestingSheetSourceType;
  id: number | null;
  width: number;
  height: number;
  stockSheet: StockSheetRecord | null;
  offcut: OffcutRecord | null;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function materialKey(value: string) {
  return value.trim().toLowerCase();
}

function sameThickness(left: number, right: number) {
  return Math.abs(left - right) < 0.0001;
}

function area(width: number, height: number) {
  return Math.max(0, width) * Math.max(0, height);
}

function rowToPlan(row: Record<string, unknown>): NestingPlanRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    sheetSourceType: row.sheetSourceType === "offcut" ? "offcut" : "sheet",
    sheetSourceId: row.sheetSourceId === null || row.sheetSourceId === undefined ? null : Number(row.sheetSourceId),
    width: Number(row.width ?? 0),
    height: Number(row.height ?? 0),
    wastePercent: Number(row.wastePercent ?? 0),
    estimatedCutTimeMinutes: Number(row.estimatedCutTimeMinutes ?? 0),
    estimatedSaving: Number(row.estimatedSaving ?? 0),
    status: row.status === "approved" || row.status === "completed" ? row.status : "draft",
    createdAt: String(row.createdAt ?? ""),
    items: []
  };
}

function rowToPlanItem(row: Record<string, unknown>): NestingPlanItemRecord {
  return {
    id: Number(row.id ?? 0),
    nestingPlanId: Number(row.nestingPlanId ?? 0),
    jobId: row.jobId === null || row.jobId === undefined ? null : Number(row.jobId),
    quoteId: row.quoteId ? String(row.quoteId) : null,
    partDnaId: row.partDnaId === null || row.partDnaId === undefined ? null : Number(row.partDnaId),
    quantity: Number(row.quantity ?? 1),
    x: Number(row.x ?? 0),
    y: Number(row.y ?? 0),
    rotation: Number(row.rotation ?? 0),
    createdAt: String(row.createdAt ?? "")
  };
}

function expandParts(parts: NestingPartCandidate[]) {
  const expanded: PlacementItem[] = [];
  for (const part of parts) {
    const quantity = Math.max(1, Math.round(part.quantity || 1));
    for (let index = 0; index < quantity; index += 1) {
      expanded.push({
        jobId: part.jobId,
        quoteId: part.quoteId,
        partDnaId: part.partDnaId,
        width: Math.max(1, Number(part.width) || 1),
        height: Math.max(1, Number(part.height) || 1),
        cutLength: Math.max(0, Number(part.cutLength) || 0),
        pierceCount: Math.max(0, Number(part.pierceCount) || 0)
      });
    }
  }
  return expanded.sort((left, right) => {
    const leftMax = Math.max(left.width, left.height);
    const rightMax = Math.max(right.width, right.height);
    return rightMax - leftMax || area(right.width, right.height) - area(left.width, left.height);
  });
}

function chooseOrientation(part: PlacementItem, remainingWidth: number, sheetHeight: number, currentShelfHeight: number | null) {
  const choices = [
    { rotation: 0, width: part.width, height: part.height },
    { rotation: 90, width: part.height, height: part.width }
  ];
  const valid = choices.filter((choice) => {
    if (choice.width > remainingWidth) return false;
    if (currentShelfHeight !== null && choice.height > currentShelfHeight) return false;
    return choice.height <= sheetHeight;
  });
  if (!valid.length) return null;
  valid.sort((left, right) => left.height - right.height || left.width - right.width);
  return valid[0];
}

function placeWithShelves(parts: PlacementItem[], sheetWidth: number, sheetHeight: number, gap = 5): PlacementResult | null {
  let cursorX = 0;
  let cursorY = 0;
  let shelfHeight = 0;
  let usedWidth = 0;
  let usedHeight = 0;
  const items: PlacementResult["items"] = [];

  for (const part of parts) {
    const tryCurrentShelf = chooseOrientation(
      part,
      sheetWidth - cursorX,
      sheetHeight - cursorY,
      shelfHeight > 0 ? shelfHeight : null
    );
    let chosen = tryCurrentShelf;
    if (!chosen) {
      cursorX = 0;
      cursorY += shelfHeight > 0 ? shelfHeight + gap : 0;
      shelfHeight = 0;
      chosen = chooseOrientation(part, sheetWidth - cursorX, sheetHeight - cursorY, null);
    }
    if (!chosen) return null;
    if (cursorY + chosen.height > sheetHeight) return null;

    items.push({
      jobId: part.jobId,
      quoteId: part.quoteId,
      partDnaId: part.partDnaId,
      x: round(cursorX, 0.1),
      y: round(cursorY, 0.1),
      rotation: chosen.rotation,
      width: chosen.width,
      height: chosen.height,
      cutLength: part.cutLength,
      pierceCount: part.pierceCount
    });
    cursorX += chosen.width + gap;
    shelfHeight = Math.max(shelfHeight, chosen.height);
    usedWidth = Math.max(usedWidth, cursorX - gap);
    usedHeight = Math.max(usedHeight, cursorY + shelfHeight);
  }

  return { items, usedWidth, usedHeight };
}

function estimateCutMinutes(items: PlacementResult["items"]) {
  const cutLength = items.reduce((sum, item) => sum + item.cutLength, 0);
  const pierces = items.reduce((sum, item) => sum + item.pierceCount, 0);
  return round(Math.max(1, cutLength / 900 + pierces * 0.12), 0.1);
}

function buildGroupKey(material: string, thickness: number) {
  return `${materialKey(material)}::${round(thickness, 0.001)}`;
}

function planTitle(material: string, thickness: number, sheetSourceType: NestingSheetSourceType, sourceId: number | null) {
  const sourceLabel = sheetSourceType === "offcut" ? `Offcut ${sourceId ?? "?"}` : `Sheet ${sourceId ?? "?"}`;
  return `${material} ${thickness}mm · ${sourceLabel}`;
}

export function openNestingIntelligenceDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-nesting-intelligence.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS nesting_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      sheetSourceType TEXT NOT NULL,
      sheetSourceId INTEGER,
      width REAL NOT NULL,
      height REAL NOT NULL,
      wastePercent REAL NOT NULL,
      estimatedCutTimeMinutes REAL NOT NULL,
      estimatedSaving REAL NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nesting_plan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nestingPlanId INTEGER NOT NULL,
      jobId INTEGER,
      quoteId TEXT,
      partDnaId INTEGER,
      quantity INTEGER NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      rotation REAL NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(nestingPlanId) REFERENCES nesting_plans(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_nesting_plans_workspace ON nesting_plans(workspaceId, status, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_nesting_items_plan ON nesting_plan_items(nestingPlanId, id ASC);
  `);
  return db;
}

export class NestingIntelligenceService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly brainCore: BrainCoreService,
    private readonly sheetOptimizer: SheetOptimizerService
  ) {}

  recommend(input: {
    workspaceId: string;
    jobs: ProductionQueueScoredJob[];
    parts: NestingPartCandidate[];
    stockSnapshot: StockSnapshot;
    titlePrefix?: string;
  }): NestingRecommendationResult {
    const workspaceId = input.workspaceId.trim();
    if (!workspaceId) throw new Error("workspaceId is required");

    this.db.prepare(
      `DELETE FROM nesting_plan_items
       WHERE nestingPlanId IN (SELECT id FROM nesting_plans WHERE workspaceId = ? AND status = 'draft')`
    ).run(workspaceId);
    this.db.prepare(`DELETE FROM nesting_plans WHERE workspaceId = ? AND status = 'draft'`).run(workspaceId);

    const jobsById = new Map(input.jobs.map((job) => [job.id, job]));
    const grouped = new Map<string, NestingPartCandidate[]>();
    for (const part of input.parts) {
      if (!part.material.trim() || !Number.isFinite(part.thickness) || part.thickness <= 0) continue;
      const key = buildGroupKey(part.material, part.thickness);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(part);
      else grouped.set(key, [part]);
    }

    const groups = Array.from(grouped.values()).sort((left, right) => {
      const leftScore = this.groupPriority(left, jobsById);
      const rightScore = this.groupPriority(right, jobsById);
      return rightScore - leftScore;
    });

    const plans: NestingPlanRecord[] = [];
    const skippedGroups: NestingRecommendationResult["skippedGroups"] = [];
    const now = new Date().toISOString();

    for (const groupParts of groups) {
      const first = groupParts[0];
      if (!first) continue;
      const optimizerSeed = this.sheetOptimizer.optimize({
        workspaceId,
        material: first.material,
        thickness: first.thickness,
        requiredWidth: Math.max(...groupParts.map((part) => part.width)),
        requiredHeight: Math.max(...groupParts.map((part) => part.height)),
        jobId: groupParts.find((part) => part.jobId !== null)?.jobId ? String(groupParts.find((part) => part.jobId !== null)?.jobId) : null,
        quoteId: groupParts.find((part) => part.quoteId)?.quoteId ?? null
      });

      const candidateSources = this.listSources(
        input.stockSnapshot,
        first.material,
        first.thickness,
        optimizerSeed
      );
      const expanded = expandParts(groupParts);
      const best = this.findBestPlan(expanded, candidateSources);
      if (!best) {
        const jobIds = Array.from(new Set(groupParts.map((part) => part.jobId).filter((value): value is number => value !== null)));
        skippedGroups.push({
          material: first.material,
          thickness: first.thickness,
          reason: "No available offcut or sheet could fit the grouped parts.",
          jobIds
        });
        this.brainCore.recommendationService.createRecommendation({
          moduleName: "nesting_intelligence",
          recommendationType: "nesting_order_required",
          title: `${first.material} ${first.thickness}mm needs stock before nesting`,
          message: `No current offcut or full sheet can fit the queued parts for ${first.material} ${first.thickness}mm.`,
          confidence: 0.82,
          impactScore: clamp(60 + jobIds.length * 6, 50, 96),
          payload: { workspaceId, material: first.material, thickness: first.thickness, jobIds }
        });
        continue;
      }

      const setupSavingMinutes = Math.max(0, (new Set(best.items.map((item) => item.jobId).filter((value): value is number => value !== null)).size - 1) * 8);
      const estimatedSaving = round(Math.max(0, optimizerSeed.savingEstimate) + setupSavingMinutes * 2.5, 0.01);
      const wastePercent = round(((area(best.source.width, best.source.height) - area(best.usedWidth, best.usedHeight)) / Math.max(1, area(best.source.width, best.source.height))) * 100, 0.01);
      const planInsert = this.db.prepare(
        `INSERT INTO nesting_plans
         (workspaceId, material, thickness, sheetSourceType, sheetSourceId, width, height, wastePercent, estimatedCutTimeMinutes, estimatedSaving, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
      ).run(
        workspaceId,
        first.material,
        first.thickness,
        best.source.type,
        best.source.id,
        best.source.width,
        best.source.height,
        wastePercent,
        estimateCutMinutes(best.items),
        estimatedSaving,
        now
      );
      const planId = Number(planInsert.lastInsertRowid ?? 0);

      for (const item of best.items) {
        this.db.prepare(
          `INSERT INTO nesting_plan_items
           (nestingPlanId, jobId, quoteId, partDnaId, quantity, x, y, rotation, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(planId, item.jobId, item.quoteId, item.partDnaId, 1, item.x, item.y, item.rotation, now);
      }

      const plan = this.getPlanById(workspaceId, planId);
      if (plan) {
        plans.push(plan);
        const groupedJobIds = Array.from(new Set(plan.items.map((item) => item.jobId).filter((value): value is number => value !== null)));
        this.brainCore.eventService.recordEvent({
          eventType: "nesting_completed",
          entityType: "nesting_plan",
          entityId: String(plan.id),
          payload: {
            workspaceId,
            material: plan.material,
            thickness: plan.thickness,
            wastePercent: plan.wastePercent,
            estimatedSaving: plan.estimatedSaving,
            groupedJobIds
          }
        });
        this.brainCore.recommendationService.createRecommendation({
          moduleName: "nesting_intelligence",
          recommendationType: "nesting_plan_ready",
          title: `Smart nest ready for ${plan.material} ${plan.thickness}mm`,
          message: `${groupedJobIds.length} job(s) can nest together on ${plan.sheetSourceType} ${plan.sheetSourceId ?? "?"} with about ${plan.wastePercent.toFixed(1)}% waste.`,
          confidence: best.source.type === "offcut" ? 0.9 : 0.82,
          impactScore: clamp(55 + groupedJobIds.length * 6, 45, 96),
          payload: {
            workspaceId,
            nestingPlanId: plan.id,
            jobIds: groupedJobIds,
            wastePercent: plan.wastePercent,
            estimatedSaving: plan.estimatedSaving
          }
        });
      }
    }

    return { plans, skippedGroups };
  }

  listPlans(workspaceId: string) {
    const rows = this.db.prepare(
      `SELECT * FROM nesting_plans
       WHERE workspaceId = ?
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'approved' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, createdAt DESC`
    ).all(workspaceId) as Record<string, unknown>[];
    return rows.map((row) => this.getPlanById(workspaceId, Number(row.id ?? 0))).filter((plan): plan is NestingPlanRecord => Boolean(plan));
  }

  approvePlan(workspaceId: string, planId: number) {
    this.db.prepare(`UPDATE nesting_plans SET status = 'approved' WHERE workspaceId = ? AND id = ?`).run(workspaceId, planId);
    const plan = this.getPlanById(workspaceId, planId);
    if (plan) {
      this.brainCore.recommendationService.createRecommendation({
        moduleName: "nesting_intelligence",
        recommendationType: "nesting_plan_approved",
        title: `Nesting plan approved`,
        message: `${plan.material} ${plan.thickness}mm nesting plan is approved for cutting.`,
        confidence: 0.95,
        impactScore: 72,
        payload: {
          workspaceId,
          nestingPlanId: plan.id,
          sheetSourceType: plan.sheetSourceType,
          sheetSourceId: plan.sheetSourceId
        }
      });
    }
    return plan;
  }

  private getPlanById(workspaceId: string, planId: number) {
    const row = this.db.prepare(`SELECT * FROM nesting_plans WHERE workspaceId = ? AND id = ?`).get(workspaceId, planId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    const plan = rowToPlan(row);
    const itemRows = this.db.prepare(
      `SELECT * FROM nesting_plan_items WHERE nestingPlanId = ? ORDER BY id ASC`
    ).all(plan.id) as Record<string, unknown>[];
    plan.items = itemRows.map((item) => rowToPlanItem(item));
    return plan;
  }

  private groupPriority(parts: NestingPartCandidate[], jobsById: Map<number, ProductionQueueScoredJob>) {
    let score = 0;
    for (const part of parts) {
      if (part.jobId !== null) {
        const job = jobsById.get(part.jobId);
        if (job) score += job.brainScore;
      }
      score += Math.max(1, part.quantity) * 2;
    }
    return score;
  }

  private listSources(
    stockSnapshot: StockSnapshot,
    material: string,
    thickness: number,
    optimizerSeed: SheetOptimizationResultView
  ) {
    const preferredType = optimizerSeed.recommendedSourceType === "order_required" ? null : optimizerSeed.recommendedSourceType;
    const preferredId = optimizerSeed.sourceId;
    const offcuts = stockSnapshot.offcuts
      .filter((offcut) => offcut.status === "available" && materialKey(offcut.material) === materialKey(material) && sameThickness(offcut.thickness, thickness))
      .map<SourceCandidate>((offcut) => ({
        type: "offcut",
        id: offcut.id,
        width: offcut.width,
        height: offcut.height,
        stockSheet: null,
        offcut
      }));
    const sheets = stockSnapshot.sheets
      .filter((sheet) => sheet.status === "available" && sheet.quantity > 0 && materialKey(sheet.material) === materialKey(material) && sameThickness(sheet.thickness, thickness))
      .map<SourceCandidate>((sheet) => ({
        type: "sheet",
        id: sheet.id,
        width: sheet.width,
        height: sheet.height,
        stockSheet: sheet,
        offcut: null
      }));
    return [...offcuts, ...sheets].sort((left, right) => {
      const leftPreferred = preferredType === left.type && preferredId === left.id ? 1 : 0;
      const rightPreferred = preferredType === right.type && preferredId === right.id ? 1 : 0;
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
      if (left.type !== right.type) return left.type === "offcut" ? -1 : 1;
      return area(left.width, left.height) - area(right.width, right.height);
    });
  }

  private findBestPlan(parts: PlacementItem[], sources: SourceCandidate[]) {
    let best:
      | (PlacementResult & {
          source: SourceCandidate;
          wastePercent: number;
        })
      | null = null;
    for (const source of sources) {
      const placed = placeWithShelves(parts, source.width, source.height, 5);
      if (!placed) continue;
      const wastePercent = round(((area(source.width, source.height) - area(placed.usedWidth, placed.usedHeight)) / Math.max(1, area(source.width, source.height))) * 100, 0.01);
      if (
        !best ||
        wastePercent < best.wastePercent - 0.01 ||
        (Math.abs(wastePercent - best.wastePercent) < 0.01 && source.type === "offcut" && best.source.type === "sheet")
      ) {
        best = { ...placed, source, wastePercent };
      }
    }
    return best;
  }
}
