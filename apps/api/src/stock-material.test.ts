import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addOffcut,
  addStockSheet,
  findBestOffcutMatch,
  findBestStockMatch,
  getAvailableStock,
  getLowStockWarnings,
  listStockMovements,
  openStockMaterialDatabase,
  reserveStockForJob,
  markStockUsed,
  buildQuoteStockSuggestion
} from "./stock-material.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-stock-"));
}

test("offcut is preferred over full sheet", () => {
  const db = openStockMaterialDatabase(makeTempDir());
  addStockSheet(db, {
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
  addOffcut(db, {
    parentSheetId: null,
    material: "304 Stainless",
    thickness: 1.5,
    width: 600,
    height: 400,
    shapeData: null,
    location: "Offcut Bin",
    status: "available"
  });
  const result = buildQuoteStockSuggestion(db, {
    material: "304 Stainless",
    thickness: 1.5,
    requiredWidth: 500,
    requiredHeight: 300
  });
  assert.equal(result.message, "Use offcut");
  assert.ok(result.bestOffcut);
});

test("smallest fitting offcut is selected", () => {
  const db = openStockMaterialDatabase(makeTempDir());
  addOffcut(db, {
    parentSheetId: null,
    material: "Mild Steel",
    thickness: 3,
    width: 800,
    height: 600,
    shapeData: null,
    location: "Bin 1",
    status: "available"
  });
  addOffcut(db, {
    parentSheetId: null,
    material: "Mild Steel",
    thickness: 3,
    width: 520,
    height: 320,
    shapeData: null,
    location: "Bin 2",
    status: "available"
  });
  const best = findBestOffcutMatch(db, "Mild Steel", 3, 500, 300);
  assert.ok(best);
  assert.equal(best?.offcut.width, 520);
});

test("rotated offcut fit works", () => {
  const db = openStockMaterialDatabase(makeTempDir());
  addOffcut(db, {
    parentSheetId: null,
    material: "Aluminium",
    thickness: 2,
    width: 400,
    height: 800,
    shapeData: null,
    location: "Bin 3",
    status: "available"
  });
  const best = findBestOffcutMatch(db, "Aluminium", 2, 700, 350);
  assert.ok(best?.fit.fitsRotated);
});

test("reserved sheet is not returned as available", () => {
  const db = openStockMaterialDatabase(makeTempDir());
  addStockSheet(db, {
    material: "Mild Steel",
    thickness: 4,
    width: 3000,
    height: 1500,
    quantity: 1,
    supplier: null,
    costPerSheet: null,
    costPerKg: null,
    location: "Rack B",
    status: "available"
  });
  reserveStockForJob(db, "job-1", "Mild Steel", 4, 1000, 1000);
  const available = getAvailableStock(db, "Mild Steel", 4);
  assert.equal(available.length, 0);
});

test("low stock warning triggers below 2 sheets", () => {
  const db = openStockMaterialDatabase(makeTempDir());
  addStockSheet(db, {
    material: "304 Stainless",
    thickness: 1.5,
    width: 3000,
    height: 1500,
    quantity: 1,
    supplier: null,
    costPerSheet: null,
    costPerKg: null,
    location: "Rack C",
    status: "available"
  });
  const warnings = getLowStockWarnings(db);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /only 1 sheet available/i);
});

test("stock movement is created when reserving", () => {
  const db = openStockMaterialDatabase(makeTempDir());
  addStockSheet(db, {
    material: "Mild Steel",
    thickness: 6,
    width: 3000,
    height: 1500,
    quantity: 1,
    supplier: null,
    costPerSheet: null,
    costPerKg: null,
    location: "Rack D",
    status: "available"
  });
  reserveStockForJob(db, "job-2", "Mild Steel", 6, 900, 900);
  const movements = listStockMovements(db);
  assert.ok(movements.some((entry) => entry.type === "reserved" && entry.jobId === "job-2"));
});

test("stock movement is created when marking used", () => {
  const db = openStockMaterialDatabase(makeTempDir());
  addStockSheet(db, {
    material: "Mild Steel",
    thickness: 8,
    width: 3000,
    height: 1500,
    quantity: 1,
    supplier: null,
    costPerSheet: null,
    costPerKg: null,
    location: "Rack E",
    status: "available"
  });
  reserveStockForJob(db, "job-3", "Mild Steel", 8, 900, 900);
  markStockUsed(db, "job-3");
  const movements = listStockMovements(db);
  assert.ok(movements.some((entry) => entry.type === "used" && entry.jobId === "job-3"));
});

test("no stock returns material required warning", () => {
  const db = openStockMaterialDatabase(makeTempDir());
  const result = buildQuoteStockSuggestion(db, {
    material: "304 Stainless",
    thickness: 1.5,
    requiredWidth: 500,
    requiredHeight: 300
  });
  assert.equal(result.materialRequired, true);
  assert.equal(result.message, "Need to order material");
});
