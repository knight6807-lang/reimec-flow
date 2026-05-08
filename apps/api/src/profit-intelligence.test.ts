import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openBrainCoreDatabase } from "./brain-core.js";
import { openManufacturingMemoryDatabase, ManufacturingMemoryService } from "./manufacturing-memory.js";
import { openProfitIntelligenceDatabase, ProfitIntelligenceService } from "./profit-intelligence.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-profit-intelligence-"));
}

test("calculates profit record and underpriced insight", () => {
  const root = makeTempRoot();
  const brain = openBrainCoreDatabase(root);
  const memory = new ManufacturingMemoryService(openManufacturingMemoryDatabase(root), brain);
  const service = new ProfitIntelligenceService(openProfitIntelligenceDatabase(root), brain, memory);

  const result = service.calculateForJob({
    workspaceId: "ws-1",
    jobId: "job-1",
    customerId: "cust-1",
    material: "304 Stainless",
    thickness: 1.5,
    revenue: 1000,
    estimatedCutTimeMinutes: 40,
    estimatedSetupTimeMinutes: 20,
    cutLengthMm: 12000,
    totalAreaSqm: 1.4
  });

  assert.ok(result.record.totalCost > 0);
  assert.ok(result.record.grossProfit < result.record.revenue);
  assert.ok(result.insights.some((entry) => entry.insightType === "underpriced_job" || entry.insightType === "price_increase_suggestion"));
});

test("summary aggregates best and worst customers", () => {
  const root = makeTempRoot();
  const brain = openBrainCoreDatabase(root);
  const memory = new ManufacturingMemoryService(openManufacturingMemoryDatabase(root), brain);
  const service = new ProfitIntelligenceService(openProfitIntelligenceDatabase(root), brain, memory);

  service.calculateForJob({
    workspaceId: "ws-1",
    jobId: "job-a",
    customerId: "cust-a",
    material: "Mild Steel",
    thickness: 3,
    revenue: 5000,
    estimatedCutTimeMinutes: 20,
    estimatedSetupTimeMinutes: 10,
    cutLengthMm: 4000,
    totalAreaSqm: 0.8
  });
  service.calculateForJob({
    workspaceId: "ws-1",
    jobId: "job-b",
    customerId: "cust-b",
    material: "304 Stainless",
    thickness: 1.5,
    revenue: 1200,
    estimatedCutTimeMinutes: 55,
    estimatedSetupTimeMinutes: 25,
    cutLengthMm: 15000,
    totalAreaSqm: 1.6
  });

  const summary = service.getSummary();
  assert.ok(summary.bestCustomers.length >= 1);
  assert.ok(summary.worstCustomers.length >= 1);
  assert.ok(summary.profitMonth !== 0);
});
