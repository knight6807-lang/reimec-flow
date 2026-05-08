import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateJobQueueScore,
  completeSmartJob,
  createPlaceholderSmartQueueServices,
  createRecommendedQueueGroups,
  isSmartJobReady,
  sortJobsForQueue,
  type SmartJobRecord
} from "./smart-job-queue.js";

function buildJob(overrides: Partial<SmartJobRecord> = {}): SmartJobRecord {
  return {
    id: overrides.id ?? 1,
    workspaceId: overrides.workspaceId ?? "ws-1",
    legacyJobId: overrides.legacyJobId ?? null,
    customerName: overrides.customerName ?? "Acme",
    customerId: overrides.customerId ?? "customer-1",
    jobNumber: overrides.jobNumber ?? `JOB-${overrides.id ?? 1}`,
    quoteId: overrides.quoteId ?? null,
    title: overrides.title ?? "Laser Job",
    status: overrides.status ?? "pending",
    priority: overrides.priority ?? "normal",
    dueDate: "dueDate" in overrides ? overrides.dueDate ?? null : null,
    material: overrides.material ?? "Mild Steel",
    thickness: "thickness" in overrides ? overrides.thickness ?? null : 3,
    sheetSize: "sheetSize" in overrides ? overrides.sheetSize ?? null : "3000x1500",
    estimatedCutTimeMinutes: overrides.estimatedCutTimeMinutes ?? 25,
    estimatedSetupTimeMinutes: overrides.estimatedSetupTimeMinutes ?? 10,
    estimatedPierceCount: overrides.estimatedPierceCount ?? 14,
    estimatedCutLength: overrides.estimatedCutLength ?? 2200,
    dxfFilePath: "dxfFilePath" in overrides ? overrides.dxfFilePath ?? null : "/tmp/example.dxf",
    partDnaId: "partDnaId" in overrides ? overrides.partDnaId ?? null : null,
    manualSortOrder: "manualSortOrder" in overrides ? overrides.manualSortOrder ?? null : null,
    actualCutTimeMinutes: "actualCutTimeMinutes" in overrides ? overrides.actualCutTimeMinutes ?? null : null,
    manuallyMarkedReady: overrides.manuallyMarkedReady ?? true,
    createdAt: overrides.createdAt ?? "2026-04-20T08:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-20T08:00:00.000Z"
  };
}

test("urgent job scores higher than normal job", () => {
  const urgent = buildJob({ id: 1, priority: "urgent", jobNumber: "JOB-URGENT" });
  const normal = buildJob({ id: 2, priority: "normal", jobNumber: "JOB-NORMAL" });
  const services = createPlaceholderSmartQueueServices();

  const urgentScore = calculateJobQueueScore(urgent, [urgent, normal], services);
  const normalScore = calculateJobQueueScore(normal, [urgent, normal], services);

  assert.ok(urgentScore.score > normalScore.score);
  assert.ok(urgentScore.reasons.includes("Urgent job"));
});

test("earlier due date scores higher", () => {
  const near = buildJob({ id: 1, dueDate: "2026-04-21T09:00:00.000Z" });
  const later = buildJob({ id: 2, dueDate: "2026-05-12T09:00:00.000Z" });

  const nearScore = calculateJobQueueScore(near, [near, later], createPlaceholderSmartQueueServices(), new Date("2026-04-20T09:00:00.000Z"));
  const laterScore = calculateJobQueueScore(later, [near, later], createPlaceholderSmartQueueServices(), new Date("2026-04-20T09:00:00.000Z"));

  assert.ok(nearScore.score > laterScore.score);
});

test("same material and thickness jobs group together", () => {
  const a = buildJob({ id: 1, jobNumber: "JOB-1", material: "304 Stainless", thickness: 1.5 });
  const b = buildJob({ id: 2, jobNumber: "JOB-2", material: "304 Stainless", thickness: 1.5 });
  const c = buildJob({ id: 3, jobNumber: "JOB-3", material: "Mild Steel", thickness: 3 });

  const groups = createRecommendedQueueGroups([a, b, c]);
  const stainlessGroup = groups.find((group) => group.material === "304 Stainless" && group.thickness === 1.5);

  assert.ok(stainlessGroup);
  assert.equal(stainlessGroup?.jobs.length, 2);
});

test("missing DXF job is not marked ready", () => {
  const job = buildJob({ dxfFilePath: null, manuallyMarkedReady: true });
  const readiness = isSmartJobReady(job);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.warnings.includes("Missing DXF"));
});

test("auto grouping creates correct material thickness groups", () => {
  const jobs = [
    buildJob({ id: 1, material: "Mild Steel", thickness: 3 }),
    buildJob({ id: 2, material: "Mild Steel", thickness: 3 }),
    buildJob({ id: 3, material: "Aluminium", thickness: 2 })
  ];

  const groups = createRecommendedQueueGroups(jobs);
  assert.equal(groups.length, 2);
  assert.ok(groups.some((group) => group.material === "Mild Steel" && group.thickness === 3 && group.jobs.length === 2));
});

test("manual queue order is respected", () => {
  const first = buildJob({ id: 1, jobNumber: "JOB-1", manualSortOrder: 2, priority: "urgent" });
  const second = buildJob({ id: 2, jobNumber: "JOB-2", manualSortOrder: 1, priority: "low" });

  const ordered = sortJobsForQueue([first, second]);
  assert.equal(ordered[0].id, 2);
  assert.ok(ordered[0].queueReasons.includes("Manual queue order override"));
});

test("completing a job updates status correctly", () => {
  const job = buildJob({ status: "cutting", actualCutTimeMinutes: null });
  const completed = completeSmartJob(job, 42);

  assert.equal(completed.status, "completed");
  assert.equal(completed.actualCutTimeMinutes, 42);
});
