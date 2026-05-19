import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openBrainCoreDatabase } from "./brain-core.js";
import { openDxfErrorDetectionDatabase, DxfErrorDetectionService } from "./dxf-error-detection.js";
import { ManufacturingMemoryService, openManufacturingMemoryDatabase } from "./manufacturing-memory.js";
import { openMaterialPredictionDatabase, MaterialPredictionService } from "./material-prediction.js";
import { OffcutIntelligenceService, openOffcutIntelligenceDatabase } from "./offcut-intelligence.js";
import { openProductionQueueBrainDatabase, ProductionQueueBrainService } from "./production-queue-brain.js";
import { ProductionAssistantService } from "./production-assistant.js";
import { openProfitIntelligenceDatabase, ProfitIntelligenceService } from "./profit-intelligence.js";
import { addOffcut, openStockMaterialDatabase, StockService, getStockSnapshot } from "./stock-material.js";
import type { SmartQueueSnapshot } from "./smart-job-queue.js";
import type { QuoteRecord, CustomerRecord } from "./store.js";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildServices() {
  const root = makeTempDir("qouterx-production-assistant-");
  const brainRoot = path.join(root, "brain");
  const dxfRoot = path.join(root, "dxf");
  const memoryRoot = path.join(root, "memory");
  const materialRoot = path.join(root, "materials");
  const offcutRoot = path.join(root, "offcuts");
  const queueRoot = path.join(root, "queue");
  const profitRoot = path.join(root, "profit");
  const stockRoot = path.join(root, "stock");
  for (const dir of [brainRoot, dxfRoot, memoryRoot, materialRoot, offcutRoot, queueRoot, profitRoot, stockRoot]) ensureDir(dir);

  const brainDb = openBrainCoreDatabase(brainRoot);
  const dxfDb = openDxfErrorDetectionDatabase(dxfRoot);
  const memoryDb = openManufacturingMemoryDatabase(memoryRoot);
  const materialDb = openMaterialPredictionDatabase(materialRoot);
  const offcutDb = openOffcutIntelligenceDatabase(offcutRoot);
  const queueDb = openProductionQueueBrainDatabase(queueRoot);
  const profitDb = openProfitIntelligenceDatabase(profitRoot);
  const stockDb = openStockMaterialDatabase(stockRoot);
  const stockService = new StockService(stockDb);
  const memoryService = new ManufacturingMemoryService(memoryDb, brainDb);
  const materialPrediction = new MaterialPredictionService(materialDb, brainDb, memoryService);
  const queueService = new ProductionQueueBrainService(queueDb, brainDb, materialPrediction);
  const profitService = new ProfitIntelligenceService(profitDb, brainDb, memoryService);
  const offcutService = new OffcutIntelligenceService(offcutDb, stockDb, brainDb);
  const dxfErrorService = new DxfErrorDetectionService(dxfDb, brainDb);
  const assistant = new ProductionAssistantService(queueService, materialPrediction, profitService, offcutService, dxfErrorService);
  return { stockDb, stockService, materialPrediction, profitService, offcutService, dxfErrorService, queueService, assistant };
}

function buildQueueSnapshot(): SmartQueueSnapshot {
  return {
    jobs: [
      {
        id: 1,
        workspaceId: "ws-1",
        legacyJobId: "job-1",
        customerName: "Acme",
        customerId: "cust-1",
        jobNumber: "J-001",
        quoteId: "quote-1",
        title: "Late stainless panel",
        status: "ready",
        priority: "urgent",
        dueDate: new Date(Date.now() - 86_400_000).toISOString(),
        material: "304 Stainless",
        thickness: 1.5,
        sheetSize: "3000x1500",
        estimatedCutTimeMinutes: 30,
        estimatedSetupTimeMinutes: 8,
        estimatedPierceCount: 12,
        estimatedCutLength: 6200,
        dxfFilePath: "/tmp/one.dxf",
        partDnaId: 101,
        manualSortOrder: null,
        actualCutTimeMinutes: null,
        manuallyMarkedReady: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        queueScore: 182,
        queueReasons: ["Urgent job", "Due soon", "DXF ready"],
        ready: true,
        warnings: []
      },
      {
        id: 2,
        workspaceId: "ws-1",
        legacyJobId: "job-2",
        customerName: "Acme",
        customerId: "cust-1",
        jobNumber: "J-002",
        quoteId: "quote-2",
        title: "Companion stainless panel",
        status: "ready",
        priority: "normal",
        dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        material: "304 Stainless",
        thickness: 1.5,
        sheetSize: "3000x1500",
        estimatedCutTimeMinutes: 18,
        estimatedSetupTimeMinutes: 8,
        estimatedPierceCount: 8,
        estimatedCutLength: 4200,
        dxfFilePath: "/tmp/two.dxf",
        partDnaId: 102,
        manualSortOrder: null,
        actualCutTimeMinutes: null,
        manuallyMarkedReady: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        queueScore: 148,
        queueReasons: ["Same material batch", "DXF ready"],
        ready: true,
        warnings: []
      }
    ],
    groups: [],
    recommendations: [
      {
        id: "combine-1",
        kind: "combine",
        severity: "info",
        title: "Combine J-001 with J-002",
        detail: "Both jobs share 304 Stainless 1.5mm and can run together.",
        relatedJobIds: [1, 2],
        relatedGroupIds: []
      }
    ]
  };
}

test("assistant answers late jobs and offcuts using local services", () => {
  const { stockDb, stockService, assistant, offcutService, dxfErrorService, materialPrediction, profitService } = buildServices();

  stockService.addStockSheet({
    material: "304 Stainless",
    thickness: 1.5,
    width: 3000,
    height: 1500,
    quantity: 1,
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
  offcutService.findMatch({
    workspaceId: "ws-1",
    material: "304 Stainless",
    thickness: 1.5,
    requiredWidth: 1000,
    requiredHeight: 700,
    jobId: "job-1",
    partDnaId: 101
  });
  dxfErrorService.checkDxf({
    workspaceId: "ws-1",
    dxfFileId: "bad-panel.dxf",
    rawDxf: "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n0\n0\nENDSEC\n0\nEOF\n",
    thickness: 3
  });

  materialPrediction.rebuildForecast({
    workspaceId: "ws-1",
    jobs: [],
    quotes: [],
    stockSnapshot: getStockSnapshot(stockDb),
    forecastPeriodsDays: [7]
  });

  const customers: CustomerRecord[] = [
    {
      id: "cust-1",
      name: "Acme",
      payments: [{ id: "pay-1", amount: 100, createdAt: new Date().toISOString() }],
      createdAt: new Date().toISOString()
    }
  ];
  const quotes: QuoteRecord[] = [
    {
      id: "quote-1",
      quoteNumber: "Q-1",
      title: "Q1",
      status: "accepted",
      customerName: "Acme",
      sections: {
        laserCutting: { amount: 500, parts: [] },
        punching: { amount: 0, parts: [] },
        fabrication: { amount: 0, parts: [] },
        laserWelding: { amount: 0, parts: [] },
        tankManufacturing: { amount: 0, parts: [] },
        bending: { amount: 0, parts: [] },
        rolling: { amount: 0, parts: [] }
      },
      total: 500,
      createdAt: new Date().toISOString()
    }
  ];

  const queueSnapshot = buildQueueSnapshot();
  const late = assistant.ask({
    workspaceId: "ws-1",
    question: "What jobs are late?",
    queueSnapshot,
    stockSnapshot: getStockSnapshot(stockDb),
    currentPlan: null,
    shortages: materialPrediction.getShortages({ workspaceId: "ws-1", stockSnapshot: getStockSnapshot(stockDb) }),
    profitService,
    offcutService,
    dxfErrorService,
    customers,
    quotes
  });
  assert.match(late.answer, /Late jobs:/);
  assert.ok(late.sourceModules.includes("smart_job_queue"));

  const offcuts = assistant.ask({
    workspaceId: "ws-1",
    question: "Which offcuts can be used?",
    queueSnapshot,
    stockSnapshot: getStockSnapshot(stockDb),
    currentPlan: null,
    shortages: [],
    profitService,
    offcutService,
    dxfErrorService,
    customers,
    quotes
  });
  assert.match(offcuts.answer, /Usable offcuts:/);
  assert.ok(offcuts.recommendations.length >= 1);
});
