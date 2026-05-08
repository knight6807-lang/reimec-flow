import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openBrainCoreDatabase } from "./brain-core.js";
import { OffcutIntelligenceService, openOffcutIntelligenceDatabase } from "./offcut-intelligence.js";
import { addOffcut, addStockSheet, getOffcut, openStockMaterialDatabase } from "./stock-material.js";

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeService() {
  const stockDb = openStockMaterialDatabase(makeTempDir("qouterx-offcut-stock-"));
  const brain = openBrainCoreDatabase(makeTempDir("qouterx-offcut-brain-"));
  const intelligenceDb = openOffcutIntelligenceDatabase(makeTempDir("qouterx-offcut-intel-"));
  const service = new OffcutIntelligenceService(intelligenceDb, stockDb, brain);
  return { stockDb, brain, intelligenceDb, service };
}

test("smallest fitting offcut wins and creates recommendation", () => {
  const { stockDb, service } = makeService();
  addStockSheet(stockDb, {
    material: "304 Stainless",
    thickness: 1.5,
    width: 3000,
    height: 1500,
    quantity: 1,
    supplier: null,
    costPerSheet: 1000,
    costPerKg: null,
    location: "Rack A",
    status: "available"
  });
  addOffcut(stockDb, {
    parentSheetId: null,
    material: "304 Stainless",
    thickness: 1.5,
    width: 800,
    height: 500,
    shapeData: null,
    location: "Bin 1",
    status: "available"
  });
  addOffcut(stockDb, {
    parentSheetId: null,
    material: "304 Stainless",
    thickness: 1.5,
    width: 540,
    height: 340,
    shapeData: null,
    location: "Bin 2",
    status: "available"
  });

  const result = service.findMatch({
    workspaceId: "ws-1",
    material: "304 Stainless",
    thickness: 1.5,
    requiredWidth: 500,
    requiredHeight: 300,
    quoteId: "quote-1",
    entityLabel: "Quote Q-1"
  });

  assert.equal(result.offcut?.location, "Bin 2");
  assert.equal(result.fitType, "normal");
  assert.ok(result.recommendation);
  assert.ok((result.savingEstimate ?? 0) >= 0);
});

test("rotated fit is detected", () => {
  const { stockDb, service } = makeService();
  addOffcut(stockDb, {
    parentSheetId: null,
    material: "Mild Steel",
    thickness: 3,
    width: 400,
    height: 800,
    shapeData: null,
    location: "Bin 3",
    status: "available"
  });

  const result = service.findMatch({
    workspaceId: "ws-1",
    material: "Mild Steel",
    thickness: 3,
    requiredWidth: 700,
    requiredHeight: 350,
    jobId: "job-2"
  });

  assert.equal(result.fitType, "rotated");
  assert.ok(result.confidence > 0.5);
});

test("using suggested offcut reserves it and records recommendation history", () => {
  const { stockDb, service } = makeService();
  const offcut = addOffcut(stockDb, {
    parentSheetId: null,
    material: "Aluminium",
    thickness: 2,
    width: 600,
    height: 400,
    shapeData: null,
    location: "Bin 4",
    status: "available"
  });
  assert.ok(offcut);

  const matchResult = service.findMatch({
    workspaceId: "ws-9",
    material: "Aluminium",
    thickness: 2,
    requiredWidth: 500,
    requiredHeight: 300,
    jobId: "job-9",
    partDnaId: 42
  });
  assert.equal(matchResult.offcut?.id, offcut?.id);

  const useResult = service.useSuggestedOffcut({
    workspaceId: "ws-9",
    offcutId: offcut!.id,
    action: "reserve",
    jobId: "job-9",
    partDnaId: 42
  });

  assert.equal(useResult.offcut?.status, "reserved");
  assert.equal(getOffcut(stockDb, offcut!.id)?.reservedJobId, "job-9");

  const recommendations = service.listRecommendations("ws-9", 20);
  assert.ok(recommendations.length >= 1);
  assert.equal(recommendations[0]?.offcut?.id, offcut!.id);
});
