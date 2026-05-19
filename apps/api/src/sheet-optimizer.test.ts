import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { openBrainCoreDatabase } from "./brain-core.js";
import { ManufacturingMemoryService, openManufacturingMemoryDatabase } from "./manufacturing-memory.js";
import { openMaterialPredictionDatabase, MaterialPredictionService } from "./material-prediction.js";
import { openSheetOptimizerDatabase, SheetOptimizerService } from "./sheet-optimizer.js";
import { openStockMaterialDatabase, StockService, addOffcut, getStockSnapshot } from "./stock-material.js";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildServices() {
  const root = makeTempDir("qouterx-sheet-optimizer-");
  const brainRoot = path.join(root, "brain");
  const memoryRoot = path.join(root, "memory");
  const stockRoot = path.join(root, "stock");
  const materialRoot = path.join(root, "materials");
  const optimizerRoot = path.join(root, "optimizer");
  for (const dir of [brainRoot, memoryRoot, stockRoot, materialRoot, optimizerRoot]) ensureDir(dir);
  const brainDb = openBrainCoreDatabase(brainRoot);
  const memoryDb = openManufacturingMemoryDatabase(memoryRoot);
  const stockDb = openStockMaterialDatabase(stockRoot);
  const materialDb = openMaterialPredictionDatabase(materialRoot);
  const optimizerDb = openSheetOptimizerDatabase(optimizerRoot);
  const stockService = new StockService(stockDb);
  const materialPrediction = new MaterialPredictionService(materialDb, brainDb, new ManufacturingMemoryService(memoryDb, brainDb));
  const optimizer = new SheetOptimizerService(optimizerDb, stockDb, brainDb, materialPrediction);
  return { stockDb, stockService, materialPrediction, optimizer };
}

test("sheet optimizer prefers smallest fitting offcut before sheets", () => {
  const { stockDb, stockService, optimizer } = buildServices();

  stockService.addStockSheet({
    material: "304 Stainless",
    thickness: 1.5,
    width: 3000,
    height: 1500,
    quantity: 2,
    costPerSheet: 900,
    status: "available"
  });
  addOffcut(stockDb, {
    material: "304 Stainless",
    thickness: 1.5,
    width: 1100,
    height: 900,
    usableArea: 990000,
    location: "Rack A",
    status: "available"
  });
  addOffcut(stockDb, {
    material: "304 Stainless",
    thickness: 1.5,
    width: 1500,
    height: 1200,
    usableArea: 1800000,
    location: "Rack B",
    status: "available"
  });

  const result = optimizer.optimize({
    workspaceId: "ws-1",
    material: "304 Stainless",
    thickness: 1.5,
    requiredWidth: 1000,
    requiredHeight: 800,
    quoteId: "Q-1"
  });

  assert.equal(result.recommendedSourceType, "offcut");
  assert.equal(result.sourceOffcut?.location, "Rack A");
  assert.ok(result.wastePercent < 25);
  assert.ok(result.savingEstimate >= 0);
});

test("sheet optimizer recommends order when nothing fits and shortage exists", () => {
  const { stockDb, stockService, materialPrediction, optimizer } = buildServices();

  stockService.addStockSheet({
    material: "Mild Steel",
    thickness: 3,
    width: 2500,
    height: 1250,
    quantity: 1,
    costPerSheet: 700,
    status: "available"
  });

  materialPrediction.rebuildForecast({
    workspaceId: "ws-2",
    jobs: [
      {
        id: "job-1",
        jobNumber: "J-1",
        qrToken: "qr-1",
        title: "Big Aluminium plate",
        status: "open",
        createdAt: new Date().toISOString(),
        jobDxfParts: [
          {
            id: "part-1",
            name: "Panel",
            material: "Aluminium",
            thicknessMm: 2,
            quantity: 2,
            widthMm: 2200,
            heightMm: 1400,
            cutLengthMm: 12000,
            pierceCount: 18,
            segmentCount: 44
          }
        ]
      }
    ],
    quotes: [],
    stockSnapshot: getStockSnapshot(stockDb),
    forecastPeriodsDays: [30]
  });

  const result = optimizer.optimize({
    workspaceId: "ws-2",
    material: "Aluminium",
    thickness: 2,
    requiredWidth: 2000,
    requiredHeight: 1400,
    jobId: "job-1"
  });

  assert.equal(result.recommendedSourceType, "order_required");
  assert.ok(result.stockMessage.toLowerCase().includes("buy"));

  const fetched = optimizer.getResult("ws-2", result.id);
  assert.equal(fetched?.id, result.id);
});
