import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { openBrainCoreDatabase } from "./brain-core.js";
import { ManufacturingMemoryService, openManufacturingMemoryDatabase } from "./manufacturing-memory.js";
import { openMaterialPredictionDatabase, MaterialPredictionService } from "./material-prediction.js";
import { getStockSnapshot, openStockMaterialDatabase, StockService } from "./stock-material.js";
import type { JobRecord, QuoteRecord } from "./store.js";

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function quotePart(material: string, thicknessMm: number, lengthMm: number, widthMm: number, quantity = 1) {
  return {
    name: `${material} part`,
    material,
    thicknessMm,
    lengthMm,
    widthMm,
    quantity,
    cutLengthMm: 1000,
    pierceCount: 4,
    bendCount: 0,
    unitPrice: 100,
    lineTotal: 100 * quantity
  };
}

test("material prediction rebuilds forecasts and reports shortages", () => {
  const root = makeTempDir("qouterx-material-prediction-");
  const brainRoot = path.join(root, "brain");
  const memoryRoot = path.join(root, "memory");
  const stockRoot = path.join(root, "stock");
  const predictionRoot = path.join(root, "prediction");
  ensureDir(brainRoot);
  ensureDir(memoryRoot);
  ensureDir(stockRoot);
  ensureDir(predictionRoot);
  const brainDb = openBrainCoreDatabase(brainRoot);
  const memoryDb = openManufacturingMemoryDatabase(memoryRoot);
  const stockDb = openStockMaterialDatabase(stockRoot);
  const predictionDb = openMaterialPredictionDatabase(predictionRoot);
  const stockService = new StockService(stockDb);
  const service = new MaterialPredictionService(predictionDb, brainDb, new ManufacturingMemoryService(memoryDb, brainDb));

  stockService.addStockSheet({
    material: "304 Stainless",
    thickness: 1.5,
    width: 3000,
    height: 1500,
    quantity: 1,
    status: "available"
  });

  const jobs: JobRecord[] = [
    {
      id: "job-1",
      jobNumber: "J-001",
      qrToken: "QR1",
      title: "Stainless batch",
      status: "open",
      customerName: "Repeat Customer",
      jobDxfParts: [
        {
          id: "part-1",
          name: "Bracket",
          layer: "0",
          material: "304 Stainless",
          thicknessMm: 1.5,
          quantity: 6,
          widthMm: 900,
          heightMm: 600,
          cutLengthMm: 4000,
          pierceCount: 12,
          segmentCount: 40
        }
      ],
      createdAt: new Date().toISOString()
    }
  ];

  const quotes: QuoteRecord[] = [
    {
      id: "quote-1",
      quoteNumber: "Q-001",
      title: "Approved stainless quote",
      status: "accepted",
      customerName: "Repeat Customer",
      sections: {
        laserCutting: {
          parts: [quotePart("304 Stainless", 1.5, 1200, 800, 4)],
          amount: 2000
        },
        punching: {},
        fabrication: {},
        laserWelding: {},
        tankManufacturing: {},
        bending: {},
        rolling: {}
      },
      total: 2000,
      createdAt: new Date().toISOString()
    }
  ];

  const rebuilt = service.rebuildForecast({
    workspaceId: "ws-1",
    jobs,
    quotes,
    stockSnapshot: getStockSnapshot(stockDb)
  });

  assert.ok(rebuilt.forecasts.length >= 2);
  const forecast7 = rebuilt.forecasts.find((entry) => entry.material === "304 Stainless" && entry.forecastPeriodDays === 7);
  assert.ok(forecast7);
  assert.ok((forecast7?.predictedSheetsNeeded ?? 0) > 1);
  assert.ok((forecast7?.predictedKgNeeded ?? 0) > 0);
  assert.ok(rebuilt.shortages.some((entry) => entry.material === "304 Stainless" && entry.thickness === 1.5));
  assert.ok(rebuilt.recommendations.some((entry) => entry.recommendationType === "buy_before_shortage"));
});

test("material prediction uses low stock rules and forecast periods", () => {
  const root = makeTempDir("qouterx-material-prediction-rules-");
  const brainRoot = path.join(root, "brain");
  const memoryRoot = path.join(root, "memory");
  const stockRoot = path.join(root, "stock");
  const predictionRoot = path.join(root, "prediction");
  ensureDir(brainRoot);
  ensureDir(memoryRoot);
  ensureDir(stockRoot);
  ensureDir(predictionRoot);
  const brainDb = openBrainCoreDatabase(brainRoot);
  const memoryDb = openManufacturingMemoryDatabase(memoryRoot);
  const stockDb = openStockMaterialDatabase(stockRoot);
  const predictionDb = openMaterialPredictionDatabase(predictionRoot);
  const stockService = new StockService(stockDb);
  const service = new MaterialPredictionService(predictionDb, brainDb, new ManufacturingMemoryService(memoryDb, brainDb));

  stockService.addStockSheet({
    material: "Mild Steel",
    thickness: 3,
    width: 3000,
    height: 1500,
    quantity: 5,
    status: "available",
    supplier: "LaserSteel"
  });

  const quotes: QuoteRecord[] = [
    {
      id: "quote-2",
      quoteNumber: "Q-002",
      title: "Sent quote",
      status: "sent",
      customerName: "Fabrication Co",
      sections: {
        laserCutting: {
          parts: [quotePart("Mild Steel", 3, 500, 500, 2)],
          amount: 500
        },
        punching: {},
        fabrication: {},
        laserWelding: {},
        tankManufacturing: {},
        bending: {},
        rolling: {}
      },
      total: 500,
      createdAt: new Date().toISOString()
    }
  ];

  service.rebuildForecast({
    workspaceId: "ws-2",
    jobs: [],
    quotes,
    stockSnapshot: getStockSnapshot(stockDb),
    forecastPeriodsDays: [7, 30]
  });

  const forecasts = service.listForecasts({ workspaceId: "ws-2", limit: 20 });
  assert.equal(forecasts.length, 2);
  assert.deepEqual(
    forecasts.map((entry) => entry.forecastPeriodDays).sort((a, b) => a - b),
    [7, 30]
  );
  const shortages = service.getShortages({ workspaceId: "ws-2", stockSnapshot: getStockSnapshot(stockDb) });
  assert.equal(shortages.length, 0);
  const rules = service.listRules({ workspaceId: "ws-2" });
  assert.ok(rules.some((entry) => entry.material === "Mild Steel" && entry.thickness === 3 && entry.preferredSupplier === "LaserSteel"));
});
