import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { openBrainCoreDatabase } from "./brain-core.js";
import { ManufacturingMemoryService, openManufacturingMemoryDatabase } from "./manufacturing-memory.js";
import { openMaterialPredictionDatabase, MaterialPredictionService } from "./material-prediction.js";
import { getStockSnapshot, openStockMaterialDatabase, StockService } from "./stock-material.js";
import { openPurchasingIntelligenceDatabase, PurchasingIntelligenceService } from "./purchasing-intelligence.js";
import type { JobRecord, QuoteRecord } from "./store.js";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

function setupServices(prefix: string) {
  const root = makeTempDir(prefix);
  const brainRoot = path.join(root, "brain");
  const memoryRoot = path.join(root, "memory");
  const stockRoot = path.join(root, "stock");
  const predictionRoot = path.join(root, "prediction");
  const purchasingRoot = path.join(root, "purchasing");
  ensureDir(brainRoot);
  ensureDir(memoryRoot);
  ensureDir(stockRoot);
  ensureDir(predictionRoot);
  ensureDir(purchasingRoot);
  const brainDb = openBrainCoreDatabase(brainRoot);
  const memoryDb = openManufacturingMemoryDatabase(memoryRoot);
  const stockDb = openStockMaterialDatabase(stockRoot);
  const predictionDb = openMaterialPredictionDatabase(predictionRoot);
  const purchasingDb = openPurchasingIntelligenceDatabase(purchasingRoot);
  const stockService = new StockService(stockDb);
  const memoryService = new ManufacturingMemoryService(memoryDb, brainDb);
  const materialPrediction = new MaterialPredictionService(predictionDb, brainDb, memoryService);
  const purchasing = new PurchasingIntelligenceService(purchasingDb, brainDb, materialPrediction);
  return { stockDb, stockService, materialPrediction, purchasing, brainDb };
}

test("purchasing intelligence creates urgent recommendations from shortages", () => {
  const { stockDb, stockService, materialPrediction, purchasing, brainDb } = setupServices("qouterx-purchase-");

  stockService.addStockSheet({
    material: "304 Stainless",
    thickness: 1.5,
    width: 3000,
    height: 1500,
    quantity: 1,
    supplier: "Cape Metals",
    costPerSheet: 4800,
    status: "available"
  });

  const jobs: JobRecord[] = [
    {
      id: "job-1",
      jobNumber: "J-001",
      qrToken: "QR1",
      title: "Upcoming stainless batch",
      status: "open",
      customerName: "Reimec",
      jobDxfParts: [
        {
          id: "part-1",
          name: "Bracket",
          layer: "0",
          material: "304 Stainless",
          thicknessMm: 1.5,
          quantity: 8,
          widthMm: 900,
          heightMm: 700,
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
      title: "Accepted work",
      status: "accepted",
      customerName: "Reimec",
      sections: {
        laserCutting: {
          parts: [quotePart("304 Stainless", 1.5, 1200, 1000, 4)],
          amount: 1000
        },
        punching: {},
        fabrication: {},
        laserWelding: {},
        tankManufacturing: {},
        bending: {},
        rolling: {}
      },
      total: 1000,
      createdAt: new Date().toISOString()
    }
  ];

  materialPrediction.rebuildForecast({
    workspaceId: "ws-1",
    jobs,
    quotes,
    stockSnapshot: getStockSnapshot(stockDb)
  });

  const synced = purchasing.syncRecommendations({
    workspaceId: "ws-1",
    stockSnapshot: getStockSnapshot(stockDb)
  });

  assert.ok(synced.recommendations.length > 0);
  const recommendation = synced.recommendations[0];
  assert.equal(recommendation.material, "304 Stainless");
  assert.equal(recommendation.urgency, "urgent");
  assert.ok(recommendation.recommendedQuantity >= 1);
  assert.ok(recommendation.estimatedCost > 0);
  assert.equal(recommendation.preferredSupplier, "Cape Metals");

  const listed = purchasing.listRecommendations({ workspaceId: "ws-1" });
  assert.equal(listed.length, synced.recommendations.length);
  assert.ok(brainDb.recommendationService.listRecommendations({ status: "all", limit: 50 }).some((entry) => entry.moduleName === "purchasing_intelligence"));
});

test("purchasing recommendations can be marked ordered or dismissed", () => {
  const { stockDb, stockService, materialPrediction, purchasing } = setupServices("qouterx-purchase-status-");

  stockService.addStockSheet({
    material: "Mild Steel",
    thickness: 3,
    width: 3000,
    height: 1500,
    quantity: 1,
    costPerSheet: 2100,
    status: "available"
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
          parts: [quotePart("Mild Steel", 3, 2200, 1400, 6)],
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

  materialPrediction.rebuildForecast({
    workspaceId: "ws-2",
    jobs: [],
    quotes,
    stockSnapshot: getStockSnapshot(stockDb)
  });

  const synced = purchasing.syncRecommendations({
    workspaceId: "ws-2",
    stockSnapshot: getStockSnapshot(stockDb)
  });
  const first = synced.recommendations[0];
  const ordered = purchasing.markOrdered("ws-2", first.id);
  assert.equal(ordered.status, "ordered");

  purchasing.syncRecommendations({
    workspaceId: "ws-2",
    stockSnapshot: getStockSnapshot(stockDb)
  });
  const nextOpen = purchasing.listRecommendations({ workspaceId: "ws-2", status: "open" })[0];
  const dismissed = purchasing.dismiss("ws-2", nextOpen.id);
  assert.equal(dismissed.status, "dismissed");
});
