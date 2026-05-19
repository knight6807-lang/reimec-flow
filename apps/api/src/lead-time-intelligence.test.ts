import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { openBrainCoreDatabase } from "./brain-core.js";
import { openLeadTimeIntelligenceDatabase, LeadTimeIntelligenceService } from "./lead-time-intelligence.js";
import { ManufacturingMemoryService, openManufacturingMemoryDatabase } from "./manufacturing-memory.js";
import { openMaterialPredictionDatabase, MaterialPredictionService } from "./material-prediction.js";
import { openPartDnaDatabase } from "./part-dna.js";
import { openProductionQueueBrainDatabase, ProductionQueueBrainService } from "./production-queue-brain.js";
import { openStockMaterialDatabase, StockService, getStockSnapshot } from "./stock-material.js";
import type { SmartJobRecord } from "./smart-job-queue.js";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildServices() {
  const root = makeTempDir("qouterx-lead-time-");
  const brainRoot = path.join(root, "brain");
  const memoryRoot = path.join(root, "memory");
  const partDnaRoot = path.join(root, "part-dna");
  const stockRoot = path.join(root, "stock");
  const materialRoot = path.join(root, "materials");
  const queueRoot = path.join(root, "queue");
  const leadTimeRoot = path.join(root, "lead-time");
  for (const dir of [brainRoot, memoryRoot, partDnaRoot, stockRoot, materialRoot, queueRoot, leadTimeRoot]) {
    ensureDir(dir);
  }

  const brainDb = openBrainCoreDatabase(brainRoot);
  const memoryDb = openManufacturingMemoryDatabase(memoryRoot);
  const partDnaDb = openPartDnaDatabase(partDnaRoot);
  const stockDb = openStockMaterialDatabase(stockRoot);
  const materialDb = openMaterialPredictionDatabase(materialRoot);
  const queueDb = openProductionQueueBrainDatabase(queueRoot);
  const leadTimeDb = openLeadTimeIntelligenceDatabase(leadTimeRoot);
  const stockService = new StockService(stockDb);
  const memoryService = new ManufacturingMemoryService(memoryDb, brainDb);
  const materialPrediction = new MaterialPredictionService(materialDb, brainDb, memoryService);
  const queueService = new ProductionQueueBrainService(queueDb, brainDb, materialPrediction);
  const leadTimeService = new LeadTimeIntelligenceService(leadTimeDb, brainDb, queueService, memoryService, partDnaDb);
  return { partDnaDb, stockDb, stockService, memoryService, queueService, leadTimeService };
}

function job(input: Partial<SmartJobRecord> & Pick<SmartJobRecord, "id" | "jobNumber" | "title" | "material" | "estimatedCutTimeMinutes" | "estimatedSetupTimeMinutes" | "estimatedPierceCount" | "estimatedCutLength" | "createdAt" | "updatedAt" | "workspaceId">): SmartJobRecord {
  return {
    legacyJobId: null,
    customerName: null,
    customerId: null,
    quoteId: null,
    status: "ready",
    priority: "normal",
    dueDate: null,
    thickness: 1.5,
    sheetSize: "3000x1500",
    dxfFilePath: "/tmp/part.dxf",
    partDnaId: null,
    manualSortOrder: null,
    actualCutTimeMinutes: null,
    manuallyMarkedReady: true,
    queueScore: 0,
    queueReasons: [],
    ready: true,
    warnings: [],
    ...input
  };
}

test("lead time prediction uses queue load and Part DNA history", () => {
  const { partDnaDb, stockDb, stockService, leadTimeService } = buildServices();
  const now = new Date("2026-05-08T08:00:00.000Z");

  stockService.addStockSheet({
    material: "304 Stainless",
    thickness: 1.5,
    width: 3000,
    height: 1500,
    quantity: 2,
    status: "available"
  });

  const partInsert = partDnaDb.prepare(
    `INSERT INTO parts
     (workspaceId, partCode, geometryHash, softHash, firstSeenAt, lastSeenAt, timesQuoted, partName, material, thickness, boundingWidth, boundingHeight, cutLength, pierceCount, holeCount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "ws-1",
    "PDNA-0001",
    "geo-1",
    "soft-1",
    now.toISOString(),
    now.toISOString(),
    2,
    "Bracket",
    "304 Stainless",
    1.5,
    200,
    120,
    4800,
    12,
    4
  );
  const partId = Number(partInsert.lastInsertRowid ?? 0);
  partDnaDb.prepare(
    `INSERT INTO part_history
     (partId, quoteId, fileName, customerName, quotedPrice, actualCutTime, operatorNotes, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(partId, "Q-1", "bracket.dxf", "Acme", 120, 42, "Ran slower than expected", now.toISOString());

  const jobs: SmartJobRecord[] = [
    job({
      id: 1,
      workspaceId: "ws-1",
      jobNumber: "J-001",
      title: "Current run",
      material: "304 Stainless",
      estimatedCutTimeMinutes: 55,
      estimatedSetupTimeMinutes: 15,
      estimatedPierceCount: 18,
      estimatedCutLength: 12000,
      queueScore: 600,
      createdAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      updatedAt: now.toISOString()
    }),
    job({
      id: 2,
      workspaceId: "ws-1",
      jobNumber: "J-002",
      title: "Bracket repeat",
      material: "304 Stainless",
      estimatedCutTimeMinutes: 24,
      estimatedSetupTimeMinutes: 10,
      estimatedPierceCount: 10,
      estimatedCutLength: 5400,
      partDnaId: partId,
      queueScore: 420,
      createdAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
      updatedAt: now.toISOString()
    })
  ];

  const prediction = leadTimeService.predict({
    workspaceId: "ws-1",
    target: jobs[1],
    jobs,
    stockSnapshot: getStockSnapshot(stockDb),
    workerCount: 1,
    now
  });

  assert.equal(prediction.jobId, 2);
  assert.ok(prediction.queueLoadMinutes >= 70);
  assert.ok(prediction.adjustedCutTimeMinutes > jobs[1].estimatedCutTimeMinutes);
  assert.ok(prediction.reasons.some((entry) => entry.includes("Part DNA history used")));
  assert.ok(prediction.riskWarnings.some((entry) => entry.includes("Similar Part DNA history")));

  const fetched = leadTimeService.getLatestForJob("ws-1", 2);
  assert.equal(fetched?.id, prediction.id);
});

test("lead time prediction warns when material is unavailable and due date will slip", () => {
  const { stockDb, memoryService, leadTimeService } = buildServices();
  const now = new Date("2026-05-08T08:00:00.000Z");

  memoryService.createMemory({
    memoryType: "difficult_part",
    title: "Difficult aluminium part",
    summary: "Past aluminium jobs of this type ran long.",
    entityType: "job",
    entityId: "job-99",
    importanceScore: 80,
    payload: {
      workspaceId: "ws-2",
      material: "Aluminium",
      partDnaId: 77
    }
  });

  const jobs: SmartJobRecord[] = [
    job({
      id: 11,
      workspaceId: "ws-2",
      jobNumber: "J-011",
      title: "Urgent aluminium",
      material: "Aluminium",
      thickness: 2,
      dueDate: new Date(now.getTime() + 12 * 60 * 60_000).toISOString(),
      estimatedCutTimeMinutes: 80,
      estimatedSetupTimeMinutes: 14,
      estimatedPierceCount: 20,
      estimatedCutLength: 15500,
      partDnaId: 77,
      queueScore: 510,
      createdAt: new Date(now.getTime() - 86_400_000).toISOString(),
      updatedAt: now.toISOString()
    })
  ];

  const prediction = leadTimeService.predict({
    workspaceId: "ws-2",
    target: jobs[0],
    jobs,
    stockSnapshot: getStockSnapshot(stockDb),
    workerCount: 1,
    now
  });

  assert.ok(prediction.stockDelayDays >= 3);
  assert.ok(prediction.riskWarnings.some((entry) => entry.includes("Material is not currently available")));
  assert.ok(prediction.riskWarnings.some((entry) => entry.includes("due date")));
  assert.ok(prediction.reasons.some((entry) => entry.includes("Manufacturing Memory flagged similar work as difficult")));
});
