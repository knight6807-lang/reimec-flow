import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { openBrainCoreDatabase } from "./brain-core.js";
import { ManufacturingMemoryService, openManufacturingMemoryDatabase } from "./manufacturing-memory.js";
import { openMaterialPredictionDatabase, MaterialPredictionService } from "./material-prediction.js";
import { openProductionQueueBrainDatabase, ProductionQueueBrainService } from "./production-queue-brain.js";
import { addOffcut, openStockMaterialDatabase, StockService, getStockSnapshot } from "./stock-material.js";
import type { SmartJobRecord, SmartQueueServices } from "./smart-job-queue.js";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildServices() {
  const root = makeTempDir("qouterx-production-queue-");
  const brainRoot = path.join(root, "brain");
  const memoryRoot = path.join(root, "memory");
  const stockRoot = path.join(root, "stock");
  const materialRoot = path.join(root, "materials");
  const queueRoot = path.join(root, "queue");
  ensureDir(brainRoot);
  ensureDir(memoryRoot);
  ensureDir(stockRoot);
  ensureDir(materialRoot);
  ensureDir(queueRoot);

  const brainDb = openBrainCoreDatabase(brainRoot);
  const memoryDb = openManufacturingMemoryDatabase(memoryRoot);
  const stockDb = openStockMaterialDatabase(stockRoot);
  const materialDb = openMaterialPredictionDatabase(materialRoot);
  const queueDb = openProductionQueueBrainDatabase(queueRoot);
  const stockService = new StockService(stockDb);
  const memoryService = new ManufacturingMemoryService(memoryDb, brainDb);
  const materialPrediction = new MaterialPredictionService(materialDb, brainDb, memoryService);
  const queueService = new ProductionQueueBrainService(queueDb, brainDb, materialPrediction);
  return { brainDb, stockDb, stockService, materialPrediction, queueService };
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
    ...input
  };
}

test("AI production queue boosts urgent stocked jobs with offcut and part DNA support", () => {
  const { stockDb, stockService, queueService } = buildServices();

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
    height: 900,
    location: "Rack A",
    status: "available"
  });

  const jobs: SmartJobRecord[] = [
    job({
      id: 1,
      workspaceId: "ws-1",
      jobNumber: "J-001",
      title: "Urgent stainless",
      material: "304 Stainless",
      priority: "urgent",
      partDnaId: 10,
      estimatedCutTimeMinutes: 22,
      estimatedSetupTimeMinutes: 10,
      estimatedPierceCount: 16,
      estimatedCutLength: 7800,
      createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      updatedAt: new Date().toISOString()
    }),
    job({
      id: 2,
      workspaceId: "ws-1",
      jobNumber: "J-002",
      title: "Normal mild steel",
      material: "Mild Steel",
      thickness: 3,
      estimatedCutTimeMinutes: 22,
      estimatedSetupTimeMinutes: 10,
      estimatedPierceCount: 16,
      estimatedCutLength: 7800,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  ];

  const services: SmartQueueServices = {
    partDnaService: {
      getPartById: (id) => (id === 10 ? { id, partCode: "PDNA-0010" } : null),
      updateActualCutTime: () => {}
    },
    dxfService: {
      hasValidDxf: () => true,
      getDxfStats: () => null
    },
    quoteService: {
      getApprovedQuote: () => null
    }
  };

  const scored = queueService.scoreJobs({
    workspaceId: "ws-1",
    jobs,
    stockSnapshot: getStockSnapshot(stockDb),
    services
  });

  assert.equal(scored[0]?.id, 1);
  assert.ok(scored[0].brainReasons.includes("Stock available now"));
  assert.ok(scored[0].brainReasons.includes("Offcut match available"));
  assert.ok(scored[0].brainReasons.includes("Known Part DNA history"));
});

test("AI production queue creates plan and tracks lifecycle", () => {
  const { stockDb, stockService, queueService } = buildServices();

  stockService.addStockSheet({
    material: "Mild Steel",
    thickness: 3,
    width: 3000,
    height: 1500,
    quantity: 3,
    status: "available"
  });

  const now = new Date();
  const jobs: SmartJobRecord[] = [
    job({
      id: 11,
      workspaceId: "ws-2",
      jobNumber: "J-011",
      title: "MS job 1",
      material: "Mild Steel",
      thickness: 3,
      estimatedCutTimeMinutes: 40,
      estimatedSetupTimeMinutes: 12,
      estimatedPierceCount: 20,
      estimatedCutLength: 12000,
      createdAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      updatedAt: now.toISOString()
    }),
    job({
      id: 12,
      workspaceId: "ws-2",
      jobNumber: "J-012",
      title: "MS job 2",
      material: "Mild Steel",
      thickness: 3,
      estimatedCutTimeMinutes: 18,
      estimatedSetupTimeMinutes: 8,
      estimatedPierceCount: 8,
      estimatedCutLength: 5200,
      createdAt: new Date(now.getTime() - 1 * 86_400_000).toISOString(),
      updatedAt: now.toISOString()
    })
  ];

  const created = queueService.createPlan({
    workspaceId: "ws-2",
    jobs,
    stockSnapshot: getStockSnapshot(stockDb),
    title: "Shift A Plan"
  });

  assert.ok(created.plan);
  assert.equal(created.plan?.title, "Shift A Plan");
  assert.equal(created.plan?.status, "draft");
  assert.equal(created.plan?.items.length, 2);
  assert.ok((created.plan?.setupSavingMinutes ?? 0) > 0);

  const current = queueService.getCurrentPlan("ws-2");
  assert.equal(current?.id, created.plan?.id);

  const active = queueService.startPlan("ws-2", created.plan!.id);
  assert.equal(active?.status, "active");
  const completed = queueService.completePlan("ws-2", created.plan!.id);
  assert.equal(completed?.status, "completed");
});
