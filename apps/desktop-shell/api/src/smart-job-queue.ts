import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SmartJobStatus = "pending" | "ready" | "cutting" | "paused" | "completed" | "cancelled";
export type SmartJobPriority = "low" | "normal" | "urgent";
export type SmartQueueGroupStatus = "planned" | "active" | "completed";

export type SmartJobRecord = {
  id: number;
  workspaceId: string;
  legacyJobId: string | null;
  customerName: string | null;
  customerId: string | null;
  jobNumber: string;
  quoteId: string | null;
  title: string;
  status: SmartJobStatus;
  priority: SmartJobPriority;
  dueDate: string | null;
  material: string;
  thickness: number | null;
  sheetSize: string | null;
  estimatedCutTimeMinutes: number;
  estimatedSetupTimeMinutes: number;
  estimatedPierceCount: number;
  estimatedCutLength: number;
  dxfFilePath: string | null;
  partDnaId: number | null;
  manualSortOrder: number | null;
  actualCutTimeMinutes: number | null;
  manuallyMarkedReady: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SmartQueueGroupItemRecord = {
  id: number;
  groupId: number;
  jobId: number;
  sortOrder: number;
  createdAt: string;
};

export type SmartQueueGroupRecord = {
  id: number;
  workspaceId: string;
  groupName: string;
  material: string;
  thickness: number | null;
  sheetSize: string | null;
  status: SmartQueueGroupStatus;
  estimatedTotalCutTimeMinutes: number;
  estimatedSetupSavingMinutes: number;
  totalPierces: number;
  totalCutLength: number;
  urgencyWarning: string | null;
  recommendedRunOrder: number;
  createdAt: string;
  updatedAt: string;
  items: SmartQueueGroupItemRecord[];
  jobs: SmartJobRecord[];
};

export type SmartJobScoreResult = {
  score: number;
  reasons: string[];
  ready: boolean;
  warnings: string[];
};

export type SmartQueueRecommendation = {
  id: string;
  kind: "run_next" | "combine" | "urgent_first" | "missing_dxf" | "shared_material" | "manual_override";
  severity: "info" | "warning" | "urgent";
  title: string;
  detail: string;
  relatedJobIds: number[];
  relatedGroupIds: number[];
};

export type SmartQueueSnapshot = {
  jobs: Array<SmartJobRecord & { queueScore: number; queueReasons: string[]; ready: boolean; warnings: string[] }>;
  groups: SmartQueueGroupRecord[];
  recommendations: SmartQueueRecommendation[];
};

export type SmartQueueSourcePart = {
  id: string;
  name: string;
  partCode?: string;
  partDnaId?: number;
  material?: string;
  thicknessMm?: number;
  quantity: number;
  widthMm: number;
  heightMm: number;
  cutLengthMm: number;
  pierceCount: number;
};

export type SmartQueueSourceWorkspaceJob = {
  id: string;
  jobNumber: string;
  title: string;
  status: "open" | "in_progress" | "incomplete" | "done";
  customerName?: string;
  quoteNumber?: string;
  jobFolder?: string;
  fileLinks?: Array<{ fileName: string; originalPath: string; linkPath: string }>;
  jobDxfParts?: SmartQueueSourcePart[];
  createdAt: string;
};

export type SmartQueueSourceQuote = {
  id: string;
  quoteNumber: string;
  status: "draft" | "sent" | "accepted" | "rejected";
};

export type SmartQueueSourceCustomer = {
  id: string;
  name: string;
};

export interface PartDnaService {
  getPartById(id: number): { id: number; partCode?: string | null } | null;
  updateActualCutTime(partDnaId: number, jobId: number, actualMinutes: number): void;
}

export interface DxfService {
  hasValidDxf(job: SmartJobRecord): boolean;
  getDxfStats(job: SmartJobRecord): {
    estimatedPierceCount?: number;
    estimatedCutLength?: number;
    estimatedCutTimeMinutes?: number;
    sheetSize?: string | null;
  } | null;
}

export interface QuoteService {
  getApprovedQuote(quoteId: string): { id: string } | null;
}

export type SmartQueueServices = {
  partDnaService: PartDnaService;
  dxfService: DxfService;
  quoteService: QuoteService;
};

export function createPlaceholderSmartQueueServices(): SmartQueueServices {
  return {
    partDnaService: {
      getPartById: () => null,
      updateActualCutTime: () => {}
    },
    dxfService: {
      hasValidDxf: (job) => Boolean(job.dxfFilePath),
      getDxfStats: () => null
    },
    quoteService: {
      getApprovedQuote: () => null
    }
  };
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toIso(input?: string | null) {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toSafeNumber(input: unknown, fallback = 0) {
  const parsed = typeof input === "number" ? input : Number(input);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePriority(input: unknown): SmartJobPriority {
  return input === "low" || input === "urgent" || input === "normal" ? input : "normal";
}

function normalizeStatus(input: unknown): SmartJobStatus {
  return input === "pending" ||
    input === "ready" ||
    input === "cutting" ||
    input === "paused" ||
    input === "completed" ||
    input === "cancelled"
    ? input
    : "pending";
}

function materialKey(material: string) {
  return material.trim().toLowerCase();
}

function thicknessKey(thickness: number | null) {
  return thickness === null ? "unknown" : String(Math.round(thickness * 100) / 100);
}

function deriveThicknessLabel(thickness: number | null) {
  return thickness === null ? "Unknown thickness" : `${thickness}mm`;
}

function estimateCutTimeMinutes(cutLengthMm: number, pierceCount: number) {
  return Math.max(1, Math.round(cutLengthMm / 900 + pierceCount * 0.12));
}

export function isSmartJobReady(job: SmartJobRecord, services: SmartQueueServices = createPlaceholderSmartQueueServices()) {
  const dxfReady = services.dxfService.hasValidDxf(job);
  const hasMaterial = job.material.trim().length > 0;
  const hasThickness = job.thickness !== null && job.thickness > 0;
  const quoteApproved = job.quoteId ? Boolean(services.quoteService.getApprovedQuote(job.quoteId)) : false;
  const ready = dxfReady && hasMaterial && hasThickness && (quoteApproved || job.manuallyMarkedReady);
  const warnings: string[] = [];
  if (!dxfReady) warnings.push("Missing DXF");
  if (!hasMaterial) warnings.push("Material not selected");
  if (!hasThickness) warnings.push("Thickness not selected");
  if (job.quoteId && !quoteApproved && !job.manuallyMarkedReady) warnings.push("Quote not approved");
  if (!job.quoteId && !job.manuallyMarkedReady) warnings.push("Not manually marked ready");
  return { ready, warnings, dxfReady, hasMaterial, hasThickness, quoteApproved };
}

export function calculateJobQueueScore(
  job: SmartJobRecord,
  allJobs: SmartJobRecord[],
  services: SmartQueueServices = createPlaceholderSmartQueueServices(),
  now = new Date()
): SmartJobScoreResult {
  const readiness = isSmartJobReady(job, services);
  let score = 0;
  const reasons: string[] = [];

  if (job.manualSortOrder !== null) {
    score += 10_000 - job.manualSortOrder * 50;
    reasons.push("Manual queue order override");
  }

  if (job.priority === "urgent") {
    score += 320;
    reasons.push("Urgent job");
  } else if (job.priority === "normal") {
    score += 100;
  } else {
    score += 40;
  }

  if (job.dueDate) {
    const dueAt = new Date(job.dueDate);
    const diffDays = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 0) {
      score += 260;
      reasons.push("Overdue");
    } else if (diffDays <= 1) {
      score += 220;
      reasons.push("Due soon");
    } else if (diffDays <= 3) {
      score += 160;
      reasons.push("Early due date");
    } else if (diffDays <= 7) {
      score += 90;
      reasons.push("Due this week");
    }
  }

  if (readiness.ready) {
    score += 140;
    reasons.push("DXF ready");
  } else {
    score -= 180;
    if (!readiness.dxfReady) reasons.push("Missing DXF");
  }

  const sameMaterialJobs = allJobs.filter(
    (candidate) =>
      candidate.id !== job.id &&
      materialKey(candidate.material) === materialKey(job.material) &&
      isSmartJobReady(candidate, services).ready
  );
  if (sameMaterialJobs.length > 0) {
    score += Math.min(120, sameMaterialJobs.length * 20);
    reasons.push("Same material as other ready jobs");
  }

  const sameThicknessJobs = allJobs.filter(
    (candidate) =>
      candidate.id !== job.id &&
      candidate.thickness !== null &&
      job.thickness !== null &&
      thicknessKey(candidate.thickness) === thicknessKey(job.thickness) &&
      isSmartJobReady(candidate, services).ready
  );
  if (sameThicknessJobs.length > 0) {
    score += Math.min(90, sameThicknessJobs.length * 18);
    reasons.push("Same thickness as other ready jobs");
  }

  if (job.sheetSize) {
    const sameSheetJobs = allJobs.filter(
      (candidate) =>
        candidate.id !== job.id &&
        candidate.sheetSize === job.sheetSize &&
        isSmartJobReady(candidate, services).ready
    );
    if (sameSheetJobs.length > 0) {
      score += Math.min(70, sameSheetJobs.length * 16);
      reasons.push("Same sheet size as other ready jobs");
    }
  }

  if (job.estimatedCutTimeMinutes > 0 && job.estimatedCutTimeMinutes <= 20) {
    score += 48;
    reasons.push("Short job can fill gaps");
  } else if (job.estimatedCutTimeMinutes <= 45) {
    score += 24;
    reasons.push("Useful filler job");
  }

  const createdAt = new Date(job.createdAt);
  const waitingDays = Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  if (waitingDays >= 1) {
    score += clamp(waitingDays * 4, 0, 120);
    reasons.push("Waiting too long");
  }

  return {
    score: Math.round(score),
    reasons,
    ready: readiness.ready,
    warnings: readiness.warnings
  };
}

export function sortJobsForQueue(
  jobs: SmartJobRecord[],
  services: SmartQueueServices = createPlaceholderSmartQueueServices(),
  now = new Date()
) {
  return jobs
    .map((job) => {
      const scored = calculateJobQueueScore(job, jobs, services, now);
      return {
        ...job,
        queueScore: scored.score,
        queueReasons: scored.reasons,
        ready: scored.ready,
        warnings: scored.warnings
      };
    })
    .sort((left, right) => {
      if (left.manualSortOrder !== null || right.manualSortOrder !== null) {
        if (left.manualSortOrder === null) return 1;
        if (right.manualSortOrder === null) return -1;
        return left.manualSortOrder - right.manualSortOrder;
      }
      return (
        right.queueScore - left.queueScore ||
        left.estimatedCutTimeMinutes - right.estimatedCutTimeMinutes ||
        left.createdAt.localeCompare(right.createdAt)
      );
    });
}

export function createRecommendedQueueGroups(
  jobs: SmartJobRecord[],
  services: SmartQueueServices = createPlaceholderSmartQueueServices(),
  now = new Date()
) {
  const activeJobs = jobs.filter((job) => job.status !== "completed" && job.status !== "cancelled");
  const groups = new Map<string, SmartQueueGroupRecord>();
  const scoredJobs = sortJobsForQueue(activeJobs, services, now);

  for (const job of scoredJobs) {
    const key = [job.material.trim() || "Unknown Material", thicknessKey(job.thickness), job.sheetSize ?? "Any Sheet"].join("|");
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: 0,
        workspaceId: job.workspaceId,
        groupName: `${job.material.trim() || "Unknown Material"} / ${deriveThicknessLabel(job.thickness)} / ${job.sheetSize ?? "Any sheet"}`,
        material: job.material.trim() || "Unknown Material",
        thickness: job.thickness,
        sheetSize: job.sheetSize,
        status: "planned",
        estimatedTotalCutTimeMinutes: 0,
        estimatedSetupSavingMinutes: 0,
        totalPierces: 0,
        totalCutLength: 0,
        urgencyWarning: null,
        recommendedRunOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [],
        jobs: []
      });
    }
    const target = groups.get(key)!;
    target.jobs.push(job);
    target.estimatedTotalCutTimeMinutes += job.estimatedCutTimeMinutes;
    target.totalPierces += job.estimatedPierceCount;
    target.totalCutLength += job.estimatedCutLength;
    if (job.priority === "urgent") {
      target.urgencyWarning = "Urgent jobs inside this group";
    }
  }

  const sortedGroups = Array.from(groups.values())
    .map((group) => {
      const setupBase = Math.max(
        0,
        group.jobs.reduce((maxMinutes, job) => Math.max(maxMinutes, job.estimatedSetupTimeMinutes), 0)
      );
      group.estimatedSetupSavingMinutes = Math.max(0, Math.round((group.jobs.length - 1) * Math.max(4, setupBase * 0.75)));
      return group;
    })
    .sort((left, right) => {
      const leftBest = Math.max(...left.jobs.map((job) => calculateJobQueueScore(job, activeJobs, services, now).score));
      const rightBest = Math.max(...right.jobs.map((job) => calculateJobQueueScore(job, activeJobs, services, now).score));
      return rightBest - leftBest || right.jobs.length - left.jobs.length;
    })
    .map((group, index) => ({
      ...group,
      recommendedRunOrder: index + 1,
      items: group.jobs.map((job, itemIndex) => ({
        id: 0,
        groupId: group.id,
        jobId: job.id,
        sortOrder: itemIndex,
        createdAt: group.createdAt
      }))
    }));

  return sortedGroups;
}

export function buildQueueRecommendations(
  jobs: SmartJobRecord[],
  groups: SmartQueueGroupRecord[],
  services: SmartQueueServices = createPlaceholderSmartQueueServices(),
  now = new Date()
) {
  const recommendations: SmartQueueRecommendation[] = [];
  const scoredJobs = sortJobsForQueue(jobs, services, now);

  const nextGroup = groups[0];
  if (nextGroup) {
    recommendations.push({
      id: `run-next-${nextGroup.material}-${nextGroup.thickness ?? "na"}-${nextGroup.sheetSize ?? "na"}`,
      kind: "run_next",
      severity: nextGroup.urgencyWarning ? "urgent" : "info",
      title: "Run this group next",
      detail: `${nextGroup.groupName} has ${nextGroup.jobs.length} jobs and saves about ${nextGroup.estimatedSetupSavingMinutes} setup minutes.`,
      relatedJobIds: nextGroup.jobs.map((job) => job.id),
      relatedGroupIds: [nextGroup.id]
    });
  }

  const urgentJob = scoredJobs.find((job) => job.priority === "urgent");
  if (urgentJob) {
    recommendations.push({
      id: `urgent-${urgentJob.id}`,
      kind: "urgent_first",
      severity: "urgent",
      title: "Urgent job should run first",
      detail: `${urgentJob.jobNumber} ${urgentJob.title} is marked urgent and should be prioritized.`,
      relatedJobIds: [urgentJob.id],
      relatedGroupIds: []
    });
  }

  const missingDxfJobs = scoredJobs.filter((job) => !job.ready && job.warnings.includes("Missing DXF")).slice(0, 3);
  for (const job of missingDxfJobs) {
    recommendations.push({
      id: `missing-dxf-${job.id}`,
      kind: "missing_dxf",
      severity: "warning",
      title: "This job is missing DXF",
      detail: `${job.jobNumber} cannot move to ready until its DXF is available.`,
      relatedJobIds: [job.id],
      relatedGroupIds: []
    });
  }

  const combinableGroup = groups.find((group) => group.jobs.length > 1);
  if (combinableGroup) {
    recommendations.push({
      id: `combine-${combinableGroup.recommendedRunOrder}`,
      kind: "combine",
      severity: "info",
      title: "Combine these jobs",
      detail: `${combinableGroup.groupName} shares material and thickness, making it a strong combined cutting run.`,
      relatedJobIds: combinableGroup.jobs.map((job) => job.id),
      relatedGroupIds: [combinableGroup.id]
    });
  }

  const sharedMaterialGroup = groups.find((group) => group.jobs.length > 0 && group.material.trim().length > 0);
  if (sharedMaterialGroup) {
    recommendations.push({
      id: `shared-${sharedMaterialGroup.recommendedRunOrder}`,
      kind: "shared_material",
      severity: "info",
      title: "These jobs share material and thickness",
      detail: `${sharedMaterialGroup.jobs.length} jobs can be run together on ${sharedMaterialGroup.material} ${deriveThicknessLabel(sharedMaterialGroup.thickness)}.`,
      relatedJobIds: sharedMaterialGroup.jobs.map((job) => job.id),
      relatedGroupIds: [sharedMaterialGroup.id]
    });
  }

  const manualJob = scoredJobs.find((job) => job.manualSortOrder !== null);
  if (manualJob) {
    recommendations.push({
      id: `manual-${manualJob.id}`,
      kind: "manual_override",
      severity: "warning",
      title: "Manual order is overriding auto-plan",
      detail: `${manualJob.jobNumber} has a manual queue order. Auto recommendations still show warnings, but your manual order wins.`,
      relatedJobIds: [manualJob.id],
      relatedGroupIds: []
    });
  }

  return recommendations;
}

function rowToJob(row: Record<string, unknown>): SmartJobRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    legacyJobId: row.legacyJobId ? String(row.legacyJobId) : null,
    customerName: row.customerName ? String(row.customerName) : null,
    customerId: row.customerId ? String(row.customerId) : null,
    jobNumber: String(row.jobNumber ?? ""),
    quoteId: row.quoteId ? String(row.quoteId) : null,
    title: String(row.title ?? ""),
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.priority),
    dueDate: row.dueDate ? String(row.dueDate) : null,
    material: String(row.material ?? ""),
    thickness: row.thickness === null || row.thickness === undefined ? null : Number(row.thickness),
    sheetSize: row.sheetSize ? String(row.sheetSize) : null,
    estimatedCutTimeMinutes: toSafeNumber(row.estimatedCutTimeMinutes),
    estimatedSetupTimeMinutes: toSafeNumber(row.estimatedSetupTimeMinutes),
    estimatedPierceCount: toSafeNumber(row.estimatedPierceCount),
    estimatedCutLength: toSafeNumber(row.estimatedCutLength),
    dxfFilePath: row.dxfFilePath ? String(row.dxfFilePath) : null,
    partDnaId: row.partDnaId === null || row.partDnaId === undefined ? null : Number(row.partDnaId),
    manualSortOrder: row.manualSortOrder === null || row.manualSortOrder === undefined ? null : Number(row.manualSortOrder),
    actualCutTimeMinutes: row.actualCutTimeMinutes === null || row.actualCutTimeMinutes === undefined ? null : Number(row.actualCutTimeMinutes),
    manuallyMarkedReady: Boolean(row.manuallyMarkedReady),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? "")
  };
}

function rowToGroup(row: Record<string, unknown>): SmartQueueGroupRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    groupName: String(row.groupName ?? ""),
    material: String(row.material ?? ""),
    thickness: row.thickness === null || row.thickness === undefined ? null : Number(row.thickness),
    sheetSize: row.sheetSize ? String(row.sheetSize) : null,
    status: row.status === "active" || row.status === "completed" ? row.status : "planned",
    estimatedTotalCutTimeMinutes: toSafeNumber(row.estimatedTotalCutTimeMinutes),
    estimatedSetupSavingMinutes: toSafeNumber(row.estimatedSetupSavingMinutes),
    totalPierces: toSafeNumber(row.totalPierces),
    totalCutLength: toSafeNumber(row.totalCutLength),
    urgencyWarning: row.urgencyWarning ? String(row.urgencyWarning) : null,
    recommendedRunOrder: toSafeNumber(row.recommendedRunOrder),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
    items: [],
    jobs: []
  };
}

function rowToGroupItem(row: Record<string, unknown>): SmartQueueGroupItemRecord {
  return {
    id: Number(row.id ?? 0),
    groupId: Number(row.groupId ?? 0),
    jobId: Number(row.jobId ?? 0),
    sortOrder: toSafeNumber(row.sortOrder),
    createdAt: String(row.createdAt ?? "")
  };
}

export function openSmartJobQueueDatabase(rootDir: string) {
  ensureDir(rootDir);
  const db = new DatabaseSync(path.join(rootDir, "qouterx-smart-job-queue.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      legacyJobId TEXT,
      customerName TEXT,
      customerId TEXT,
      jobNumber TEXT NOT NULL UNIQUE,
      quoteId TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      dueDate TEXT,
      material TEXT NOT NULL DEFAULT '',
      thickness REAL,
      sheetSize TEXT,
      estimatedCutTimeMinutes REAL NOT NULL DEFAULT 0,
      estimatedSetupTimeMinutes REAL NOT NULL DEFAULT 0,
      estimatedPierceCount REAL NOT NULL DEFAULT 0,
      estimatedCutLength REAL NOT NULL DEFAULT 0,
      dxfFilePath TEXT,
      partDnaId INTEGER,
      manualSortOrder INTEGER,
      actualCutTimeMinutes REAL,
      manuallyMarkedReady INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_workspace_status ON jobs (workspaceId, status);
    CREATE INDEX IF NOT EXISTS idx_jobs_workspace_material ON jobs (workspaceId, material, thickness);

    CREATE TABLE IF NOT EXISTS job_queue_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      groupName TEXT NOT NULL,
      material TEXT NOT NULL,
      thickness REAL,
      sheetSize TEXT,
      status TEXT NOT NULL,
      estimatedTotalCutTimeMinutes REAL NOT NULL DEFAULT 0,
      estimatedSetupSavingMinutes REAL NOT NULL DEFAULT 0,
      totalPierces REAL NOT NULL DEFAULT 0,
      totalCutLength REAL NOT NULL DEFAULT 0,
      urgencyWarning TEXT,
      recommendedRunOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_job_queue_groups_workspace_status ON job_queue_groups (workspaceId, status);

    CREATE TABLE IF NOT EXISTS job_queue_group_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      groupId INTEGER NOT NULL REFERENCES job_queue_groups(id) ON DELETE CASCADE,
      jobId INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_job_queue_group_items_group ON job_queue_group_items (groupId, sortOrder);
  `);
  return db;
}

export function listSmartJobs(db: DatabaseSync, workspaceId: string) {
  const stmt = db.prepare("SELECT * FROM jobs WHERE workspaceId = ? ORDER BY createdAt DESC");
  return stmt.all(workspaceId).map((row) => rowToJob(row as Record<string, unknown>));
}

export function getSmartJob(db: DatabaseSync, workspaceId: string, id: number) {
  const stmt = db.prepare("SELECT * FROM jobs WHERE workspaceId = ? AND id = ?");
  const row = stmt.get(workspaceId, id);
  return row ? rowToJob(row as Record<string, unknown>) : null;
}

export type UpsertSmartJobInput = Partial<Omit<SmartJobRecord, "id" | "workspaceId" | "createdAt" | "updatedAt">> & {
  jobNumber: string;
  title: string;
};

export function upsertSmartJob(db: DatabaseSync, workspaceId: string, input: UpsertSmartJobInput) {
  const now = new Date().toISOString();
  const existingStmt = db.prepare("SELECT * FROM jobs WHERE workspaceId = ? AND jobNumber = ?");
  const existingRow = existingStmt.get(workspaceId, input.jobNumber);
  if (existingRow) {
    const existing = rowToJob(existingRow as Record<string, unknown>);
    db.prepare(`
      UPDATE jobs
      SET legacyJobId = ?,
          customerName = ?,
          customerId = ?,
          quoteId = ?,
          title = ?,
          status = ?,
          priority = ?,
          dueDate = ?,
          material = ?,
          thickness = ?,
          sheetSize = ?,
          estimatedCutTimeMinutes = ?,
          estimatedSetupTimeMinutes = ?,
          estimatedPierceCount = ?,
          estimatedCutLength = ?,
          dxfFilePath = ?,
          partDnaId = ?,
          manualSortOrder = ?,
          actualCutTimeMinutes = ?,
          manuallyMarkedReady = ?,
          updatedAt = ?
      WHERE id = ?
    `).run(
      input.legacyJobId ?? existing.legacyJobId,
      input.customerName ?? existing.customerName,
      input.customerId ?? existing.customerId,
      input.quoteId ?? existing.quoteId,
      input.title ?? existing.title,
      input.status ?? existing.status,
      input.priority ?? existing.priority,
      toIso(input.dueDate ?? existing.dueDate),
      input.material ?? existing.material,
      input.thickness ?? existing.thickness,
      input.sheetSize ?? existing.sheetSize,
      input.estimatedCutTimeMinutes ?? existing.estimatedCutTimeMinutes,
      input.estimatedSetupTimeMinutes ?? existing.estimatedSetupTimeMinutes,
      input.estimatedPierceCount ?? existing.estimatedPierceCount,
      input.estimatedCutLength ?? existing.estimatedCutLength,
      input.dxfFilePath ?? existing.dxfFilePath,
      input.partDnaId ?? existing.partDnaId,
      input.manualSortOrder ?? existing.manualSortOrder,
      input.actualCutTimeMinutes ?? existing.actualCutTimeMinutes,
      input.manuallyMarkedReady === undefined ? Number(existing.manuallyMarkedReady) : Number(input.manuallyMarkedReady),
      now,
      existing.id
    );
    return getSmartJob(db, workspaceId, existing.id);
  }

  const inserted = db.prepare(`
    INSERT INTO jobs (
      workspaceId, legacyJobId, customerName, customerId, jobNumber, quoteId, title, status, priority, dueDate,
      material, thickness, sheetSize, estimatedCutTimeMinutes, estimatedSetupTimeMinutes, estimatedPierceCount,
      estimatedCutLength, dxfFilePath, partDnaId, manualSortOrder, actualCutTimeMinutes, manuallyMarkedReady, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    workspaceId,
    input.legacyJobId ?? null,
    input.customerName ?? null,
    input.customerId ?? null,
    input.jobNumber,
    input.quoteId ?? null,
    input.title,
    input.status ?? "pending",
    input.priority ?? "normal",
    toIso(input.dueDate) ?? null,
    input.material ?? "",
    input.thickness ?? null,
    input.sheetSize ?? null,
    input.estimatedCutTimeMinutes ?? 0,
    input.estimatedSetupTimeMinutes ?? 0,
    input.estimatedPierceCount ?? 0,
    input.estimatedCutLength ?? 0,
    input.dxfFilePath ?? null,
    input.partDnaId ?? null,
    input.manualSortOrder ?? null,
    input.actualCutTimeMinutes ?? null,
    input.manuallyMarkedReady ? 1 : 0,
    now,
    now
  );
  return getSmartJob(db, workspaceId, Number(inserted.lastInsertRowid));
}

export function deleteSmartJob(db: DatabaseSync, workspaceId: string, id: number) {
  db.prepare("DELETE FROM jobs WHERE workspaceId = ? AND id = ?").run(workspaceId, id);
}

export function listQueueGroups(db: DatabaseSync, workspaceId: string) {
  const groups = db
    .prepare("SELECT * FROM job_queue_groups WHERE workspaceId = ? ORDER BY recommendedRunOrder ASC, createdAt ASC")
    .all(workspaceId)
    .map((row) => rowToGroup(row as Record<string, unknown>));
  const items = db
    .prepare(`
      SELECT item.*
      FROM job_queue_group_items item
      JOIN job_queue_groups grp ON grp.id = item.groupId
      WHERE grp.workspaceId = ?
      ORDER BY item.groupId ASC, item.sortOrder ASC
    `)
    .all(workspaceId)
    .map((row) => rowToGroupItem(row as Record<string, unknown>));
  const jobsById = new Map(listSmartJobs(db, workspaceId).map((job) => [job.id, job]));
  const itemsByGroup = new Map<number, SmartQueueGroupItemRecord[]>();
  for (const item of items) {
    if (!itemsByGroup.has(item.groupId)) itemsByGroup.set(item.groupId, []);
    itemsByGroup.get(item.groupId)!.push(item);
  }
  return groups.map((group) => {
    const groupItems = itemsByGroup.get(group.id) ?? [];
    return {
      ...group,
      items: groupItems,
      jobs: groupItems.map((item) => jobsById.get(item.jobId)).filter((job): job is SmartJobRecord => Boolean(job))
    };
  });
}

export function replaceQueueGroups(db: DatabaseSync, workspaceId: string, groups: SmartQueueGroupRecord[]) {
  const now = new Date().toISOString();
  db.prepare("DELETE FROM job_queue_group_items WHERE groupId IN (SELECT id FROM job_queue_groups WHERE workspaceId = ?)").run(workspaceId);
  db.prepare("DELETE FROM job_queue_groups WHERE workspaceId = ?").run(workspaceId);
  for (const group of groups) {
    const inserted = db.prepare(`
      INSERT INTO job_queue_groups (
        workspaceId, groupName, material, thickness, sheetSize, status, estimatedTotalCutTimeMinutes,
        estimatedSetupSavingMinutes, totalPierces, totalCutLength, urgencyWarning, recommendedRunOrder, createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspaceId,
      group.groupName,
      group.material,
      group.thickness ?? null,
      group.sheetSize ?? null,
      group.status,
      group.estimatedTotalCutTimeMinutes,
      group.estimatedSetupSavingMinutes,
      group.totalPierces,
      group.totalCutLength,
      group.urgencyWarning ?? null,
      group.recommendedRunOrder,
      now,
      now
    );
    const groupId = Number(inserted.lastInsertRowid);
    group.jobs.forEach((job, index) => {
      db.prepare(`
        INSERT INTO job_queue_group_items (groupId, jobId, sortOrder, createdAt)
        VALUES (?, ?, ?, ?)
      `).run(groupId, job.id, index, now);
    });
  }
}

export function updateQueueGroup(
  db: DatabaseSync,
  workspaceId: string,
  groupId: number,
  input: Partial<Pick<SmartQueueGroupRecord, "groupName" | "status">> & { jobIds?: number[] }
) {
  const existing = listQueueGroups(db, workspaceId).find((group) => group.id === groupId);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE job_queue_groups
    SET groupName = ?, status = ?, updatedAt = ?
    WHERE workspaceId = ? AND id = ?
  `).run(input.groupName ?? existing.groupName, input.status ?? existing.status, now, workspaceId, groupId);
  if (Array.isArray(input.jobIds)) {
    db.prepare("DELETE FROM job_queue_group_items WHERE groupId = ?").run(groupId);
    input.jobIds.forEach((jobId, index) => {
      db.prepare("INSERT INTO job_queue_group_items (groupId, jobId, sortOrder, createdAt) VALUES (?, ?, ?, ?)").run(
        groupId,
        jobId,
        index,
        now
      );
    });
  }
  return listQueueGroups(db, workspaceId).find((group) => group.id === groupId) ?? null;
}

export function startQueueGroup(db: DatabaseSync, workspaceId: string, groupId: number) {
  const groups = listQueueGroups(db, workspaceId);
  const target = groups.find((group) => group.id === groupId);
  if (!target) return null;
  const now = new Date().toISOString();
  db.prepare("UPDATE job_queue_groups SET status = 'active', updatedAt = ? WHERE workspaceId = ? AND id = ?").run(now, workspaceId, groupId);
  const firstJob = target.jobs.find((job) => job.status !== "completed" && job.status !== "cancelled");
  if (firstJob) {
    upsertSmartJob(db, workspaceId, {
      ...firstJob,
      status: "cutting",
      title: firstJob.title,
      jobNumber: firstJob.jobNumber
    });
  }
  return listQueueGroups(db, workspaceId).find((group) => group.id === groupId) ?? null;
}

export function completeQueueGroup(db: DatabaseSync, workspaceId: string, groupId: number) {
  const now = new Date().toISOString();
  db.prepare("UPDATE job_queue_groups SET status = 'completed', updatedAt = ? WHERE workspaceId = ? AND id = ?").run(now, workspaceId, groupId);
  return listQueueGroups(db, workspaceId).find((group) => group.id === groupId) ?? null;
}

export function completeSmartJob(job: SmartJobRecord, actualMinutes?: number | null) {
  return {
    ...job,
    status: "completed" as const,
    actualCutTimeMinutes: actualMinutes ?? job.actualCutTimeMinutes ?? null,
    updatedAt: new Date().toISOString()
  };
}

function deriveLegacyStatus(status: SmartJobStatus): SmartQueueSourceWorkspaceJob["status"] {
  if (status === "cutting") return "in_progress";
  if (status === "paused" || status === "cancelled") return "incomplete";
  if (status === "completed") return "done";
  return "open";
}

function deriveSmartStatusFromLegacy(status: SmartQueueSourceWorkspaceJob["status"]): SmartJobStatus {
  if (status === "in_progress") return "cutting";
  if (status === "incomplete") return "paused";
  if (status === "done") return "completed";
  return "pending";
}

function findFirstDxfPath(job: SmartQueueSourceWorkspaceJob) {
  for (const file of job.fileLinks ?? []) {
    if (/\.dxf$/i.test(file.fileName)) {
      if (file.originalPath && fs.existsSync(file.originalPath)) return file.originalPath;
      if (file.linkPath && fs.existsSync(file.linkPath)) return file.linkPath;
    }
  }
  if (!job.jobFolder) return null;
  try {
    const files = fs.readdirSync(job.jobFolder);
    const hit = files.find((fileName) => /\.dxf$/i.test(fileName));
    return hit ? path.join(job.jobFolder, hit) : null;
  } catch {
    return null;
  }
}

function deriveJobStats(parts: SmartQueueSourcePart[]) {
  const meaningfulParts = parts.filter((part) => part.quantity > 0);
  const estimatedPierceCount = meaningfulParts.reduce((sum, part) => sum + part.pierceCount * part.quantity, 0);
  const estimatedCutLength = meaningfulParts.reduce((sum, part) => sum + part.cutLengthMm * part.quantity, 0);
  const dominant = meaningfulParts[0];
  const material = dominant?.material?.trim() ?? "";
  const thickness = dominant?.thicknessMm ?? null;
  const sheetWidth = meaningfulParts.reduce((max, part) => Math.max(max, part.widthMm), 0);
  const sheetHeight = meaningfulParts.reduce((max, part) => Math.max(max, part.heightMm), 0);
  const sheetSize = sheetWidth > 0 && sheetHeight > 0 ? `${Math.round(sheetWidth)}x${Math.round(sheetHeight)}` : null;
  const partDnaId = meaningfulParts.find((part) => typeof part.partDnaId === "number")?.partDnaId ?? null;
  return {
    material,
    thickness,
    sheetSize,
    partDnaId,
    estimatedPierceCount,
    estimatedCutLength,
    estimatedCutTimeMinutes: estimateCutTimeMinutes(estimatedCutLength, estimatedPierceCount),
    estimatedSetupTimeMinutes: meaningfulParts.length > 0 ? 10 : 0
  };
}

export function syncWorkspaceJobsToSmartQueue(
  db: DatabaseSync,
  workspaceId: string,
  source: {
    jobs: SmartQueueSourceWorkspaceJob[];
    quotes: SmartQueueSourceQuote[];
    customers: SmartQueueSourceCustomer[];
  }
) {
  const existingByLegacyId = new Map(
    listSmartJobs(db, workspaceId).map((job) => [job.legacyJobId ?? "", job])
  );

  for (const sourceJob of source.jobs) {
    const parts = sourceJob.jobDxfParts ?? [];
    const quote = source.quotes.find((entry) => entry.quoteNumber === sourceJob.quoteNumber);
    const customer = source.customers.find(
      (entry) => entry.name.trim().toLowerCase() === (sourceJob.customerName ?? "").trim().toLowerCase()
    );
    const stats = deriveJobStats(parts);
    const existing = existingByLegacyId.get(sourceJob.id);
    const suggestedStatus = deriveSmartStatusFromLegacy(sourceJob.status);
    const createdAt = toIso(sourceJob.createdAt) ?? new Date().toISOString();
    const priority: SmartJobPriority = /\burgent|rush|asap\b/i.test(sourceJob.title) ? "urgent" : existing?.priority ?? "normal";
    const nextStatus =
      suggestedStatus === "completed"
        ? "completed"
        : existing?.status === "cutting" || existing?.status === "paused" || existing?.status === "cancelled"
          ? existing.status
          : suggestedStatus;

    upsertSmartJob(db, workspaceId, {
      legacyJobId: sourceJob.id,
      customerName: sourceJob.customerName ?? null,
      customerId: customer?.id ?? null,
      jobNumber: sourceJob.jobNumber,
      quoteId: quote?.id ?? existing?.quoteId ?? null,
      title: sourceJob.title,
      status: nextStatus,
      priority,
      dueDate: existing?.dueDate ?? null,
      material: stats.material || existing?.material || "",
      thickness: stats.thickness ?? existing?.thickness ?? null,
      sheetSize: stats.sheetSize ?? existing?.sheetSize ?? null,
      estimatedCutTimeMinutes: stats.estimatedCutTimeMinutes || existing?.estimatedCutTimeMinutes || 0,
      estimatedSetupTimeMinutes: stats.estimatedSetupTimeMinutes || existing?.estimatedSetupTimeMinutes || 0,
      estimatedPierceCount: stats.estimatedPierceCount || existing?.estimatedPierceCount || 0,
      estimatedCutLength: stats.estimatedCutLength || existing?.estimatedCutLength || 0,
      dxfFilePath: findFirstDxfPath(sourceJob) ?? existing?.dxfFilePath ?? null,
      partDnaId: stats.partDnaId ?? existing?.partDnaId ?? null,
      manualSortOrder: existing?.manualSortOrder ?? null,
      actualCutTimeMinutes: existing?.actualCutTimeMinutes ?? null,
      manuallyMarkedReady: existing?.manuallyMarkedReady ?? false
    });

    const row = existingByLegacyId.get(sourceJob.id);
    if (!row) {
      const inserted = db.prepare("UPDATE jobs SET createdAt = ?, updatedAt = ? WHERE workspaceId = ? AND jobNumber = ?").run(
        createdAt,
        new Date().toISOString(),
        workspaceId,
        sourceJob.jobNumber
      );
      void inserted;
    }
  }
}

export function normalizeSmartJobStates(
  db: DatabaseSync,
  workspaceId: string,
  services: SmartQueueServices = createPlaceholderSmartQueueServices()
) {
  const jobs = listSmartJobs(db, workspaceId);
  for (const job of jobs) {
    if (job.status === "completed" || job.status === "cancelled" || job.status === "cutting" || job.status === "paused") continue;
    const readiness = isSmartJobReady(job, services);
    const nextStatus: SmartJobStatus = readiness.ready ? "ready" : "pending";
    if (job.status !== nextStatus) {
      upsertSmartJob(db, workspaceId, {
        ...job,
        title: job.title,
        jobNumber: job.jobNumber,
        status: nextStatus
      });
    }
  }
}

export function buildSmartQueueSnapshot(
  db: DatabaseSync,
  workspaceId: string,
  services: SmartQueueServices = createPlaceholderSmartQueueServices(),
  now = new Date()
): SmartQueueSnapshot {
  normalizeSmartJobStates(db, workspaceId, services);
  const jobs = listSmartJobs(db, workspaceId);
  const scoredJobs = sortJobsForQueue(jobs, services, now);
  const recommendedGroups = createRecommendedQueueGroups(jobs, services, now);
  const persistedGroups = listQueueGroups(db, workspaceId);
  const groups = persistedGroups.length > 0
    ? persistedGroups.map((group) => ({
        ...group,
        jobs: group.jobs.length > 0 ? sortJobsForQueue(group.jobs, services, now) : group.jobs
      }))
    : recommendedGroups;
  const recommendations = buildQueueRecommendations(jobs, groups, services, now);
  return { jobs: scoredJobs, groups, recommendations };
}

export function reorderJobsWithManualOverride(
  db: DatabaseSync,
  workspaceId: string,
  orderedJobIds: number[]
) {
  orderedJobIds.forEach((jobId, index) => {
    const job = getSmartJob(db, workspaceId, jobId);
    if (!job) return;
    upsertSmartJob(db, workspaceId, {
      ...job,
      title: job.title,
      jobNumber: job.jobNumber,
      manualSortOrder: index + 1
    });
  });
}

export function updateSmartJobStatus(
  db: DatabaseSync,
  workspaceId: string,
  id: number,
  status: SmartJobStatus,
  actualMinutes?: number | null
) {
  const job = getSmartJob(db, workspaceId, id);
  if (!job) return null;
  const next = status === "completed" ? completeSmartJob(job, actualMinutes) : { ...job, status, updatedAt: new Date().toISOString() };
  return upsertSmartJob(db, workspaceId, {
    ...next,
    title: next.title,
    jobNumber: next.jobNumber
  });
}

export function mapSmartStatusToLegacy(status: SmartJobStatus) {
  return deriveLegacyStatus(status);
}
