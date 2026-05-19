import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { openBrainCoreDatabase } from "./brain-core.js";
import { ManufacturingMemoryService, openManufacturingMemoryDatabase } from "./manufacturing-memory.js";
import { openMaterialPredictionDatabase, MaterialPredictionService } from "./material-prediction.js";
import { openNestingIntelligenceDatabase, NestingIntelligenceService } from "./nesting-intelligence.js";
import { openProductionQueueBrainDatabase, ProductionQueueBrainService, type ProductionQueueScoredJob } from "./production-queue-brain.js";
import { openSheetOptimizerDatabase, SheetOptimizerService } from "./sheet-optimizer.js";
import { addOffcut, getStockSnapshot, openStockMaterialDatabase, StockService } from "./stock-material.js";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildServices() {
  const root = makeTempDir("qouterx-nesting-");
  const brainRoot = path.join(root, "brain");
  const memoryRoot = path.join(root, "memory");
  const stockRoot = path.join(root, "stock");
  const materialRoot = path.join(root, "materials");
  const queueRoot = path.join(root, "queue");
  const sheetRoot = path.join(root, "sheets");
  const nestingRoot = path.join(root, "nesting");
  for (const dir of [brainRoot, memoryRoot, stockRoot, materialRoot, queueRoot, sheetRoot, nestingRoot]) ensureDir(dir);

  const brainDb = openBrainCoreDatabase(brainRoot);
  const memoryDb = openManufacturingMemoryDatabase(memoryRoot);
  const stockDb = openStockMaterialDatabase(stockRoot);
  const materialDb = openMaterialPredictionDatabase(materialRoot);
  const queueDb = openProductionQueueBrainDatabase(queueRoot);
  const sheetDb = openSheetOptimizerDatabase(sheetRoot);
  const nestingDb = openNestingIntelligenceDatabase(nestingRoot);

  const memoryService = new ManufacturingMemoryService(memoryDb, brainDb);
  const materialPrediction = new MaterialPredictionService(materialDb, brainDb, memoryService);
  const stockService = new StockService(stockDb);
  const queueService = new ProductionQueueBrainService(queueDb, brainDb, materialPrediction);
  const sheetOptimizer = new SheetOptimizerService(sheetDb, stockDb, brainDb, materialPrediction);
  const nestingService = new NestingIntelligenceService(nestingDb, brainDb, sheetOptimizer);
  return { stockDb, stockService, queueService, nestingService };
}

function queueJob(input: Partial<ProductionQueueScoredJob> & Pick<ProductionQueueScoredJob, "id" | "workspaceId" | "jobNumber" | "title" | "material">): ProductionQueueScoredJob {
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
    estimatedCutTimeMinutes: 15,
    estimatedSetupTimeMinutes: 8,
    estimatedPierceCount: 10,
    estimatedCutLength: 5000,
    dxfFilePath: "/tmp/part.dxf",
    partDnaId: null,
    manualSortOrder: null,
    actualCutTimeMinutes: null,
    manuallyMarkedReady: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    brainScore: 100,
    brainReasons: ["Ready for nesting"],
    stockAvailable: true,
    offcutSavingEstimate: 120,
    blocked: false,
    ...input
  };
}

test("nesting intelligence prefers fitting offcut and stores draft plan items", () => {
  const { stockDb, stockService, nestingService } = buildServices();

  stockService.addStockSheet({
    material: "304 Stainless",
    thickness: 1.5,
    width: 3000,
    height: 1500,
    quantity: 2,
    status: "available"
  });
  addOffcut(stockDb, {
    material: "304 Stainless",
    thickness: 1.5,
    width: 1200,
    height: 1000,
    location: "Rack A",
    status: "available"
  });

  const jobs = [
    queueJob({
      id: 11,
      workspaceId: "ws-1",
      jobNumber: "J-011",
      title: "Panel A",
      material: "304 Stainless",
      thickness: 1.5,
      brainScore: 165
    }),
    queueJob({
      id: 12,
      workspaceId: "ws-1",
      jobNumber: "J-012",
      title: "Panel B",
      material: "304 Stainless",
      thickness: 1.5,
      brainScore: 142
    })
  ];

  const result = nestingService.recommend({
    workspaceId: "ws-1",
    jobs,
    parts: [
      {
        jobId: 11,
        quoteId: null,
        partDnaId: 101,
        quantity: 2,
        width: 400,
        height: 300,
        cutLength: 2600,
        pierceCount: 8,
        material: "304 Stainless",
        thickness: 1.5
      },
      {
        jobId: 12,
        quoteId: null,
        partDnaId: 102,
        quantity: 1,
        width: 350,
        height: 280,
        cutLength: 2200,
        pierceCount: 6,
        material: "304 Stainless",
        thickness: 1.5
      }
    ],
    stockSnapshot: getStockSnapshot(stockDb)
  });

  assert.equal(result.skippedGroups.length, 0);
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0]?.sheetSourceType, "offcut");
  assert.equal(result.plans[0]?.sheetSourceId, 1);
  assert.equal(result.plans[0]?.status, "draft");
  assert.equal(result.plans[0]?.items.length, 3);
  assert.ok((result.plans[0]?.wastePercent ?? 100) < 100);
});

test("nesting intelligence approves saved draft plan", () => {
  const { stockDb, stockService, nestingService } = buildServices();
  stockService.addStockSheet({
    material: "Mild Steel",
    thickness: 3,
    width: 3000,
    height: 1500,
    quantity: 1,
    status: "available"
  });

  const created = nestingService.recommend({
    workspaceId: "ws-2",
    jobs: [
      queueJob({
        id: 22,
        workspaceId: "ws-2",
        jobNumber: "J-022",
        title: "MS Panel",
        material: "Mild Steel",
        thickness: 3
      })
    ],
    parts: [
      {
        jobId: 22,
        quoteId: null,
        partDnaId: 202,
        quantity: 1,
        width: 800,
        height: 600,
        cutLength: 5000,
        pierceCount: 12,
        material: "Mild Steel",
        thickness: 3
      }
    ],
    stockSnapshot: getStockSnapshot(stockDb)
  });

  const approved = nestingService.approvePlan("ws-2", created.plans[0]!.id);
  assert.equal(approved?.status, "approved");
  assert.equal(nestingService.listPlans("ws-2")[0]?.status, "approved");
});
