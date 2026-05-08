import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openBrainCoreDatabase } from "./brain-core.js";
import { ManufacturingMemoryService, openManufacturingMemoryDatabase } from "./manufacturing-memory.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-manufacturing-memory-"));
}

test("part dna events create repeat-part memories and patterns", () => {
  const root = makeTempRoot();
  const brain = openBrainCoreDatabase(root);
  const memoryDb = openManufacturingMemoryDatabase(root);
  const service = new ManufacturingMemoryService(memoryDb, brain);

  const event = brain.eventService.recordEvent({
    eventType: "part_dna_detected",
    entityType: "part_dna",
    entityId: "12",
    payload: {
      workspaceId: "ws-1",
      partName: "Bracket",
      exactMatch: true,
      nearMatchCount: 0
    }
  });
  const result = service.ingestEvent(event);
  assert.equal(result.memories.length, 1);
  assert.equal(result.memories[0]?.memoryType, "repeat_customer_part");
});

test("job completed event creates difficult-part memory when cut time is high", () => {
  const root = makeTempRoot();
  const brain = openBrainCoreDatabase(root);
  const memoryDb = openManufacturingMemoryDatabase(root);
  const service = new ManufacturingMemoryService(memoryDb, brain);

  const event = brain.eventService.recordEvent({
    eventType: "job_completed",
    entityType: "job",
    entityId: "job-1",
    payload: {
      workspaceId: "ws-1",
      jobNumber: "JB-1",
      actualCutTimeMinutes: 60,
      estimatedCutTimeMinutes: 30
    }
  });
  const result = service.ingestEvent(event);
  assert.equal(result.memories[0]?.memoryType, "difficult_part");
  const memories = service.listMemories({ workspaceId: "ws-1" });
  assert.ok(memories.length >= 1);
});

test("rebuild regenerates memories from brain events", () => {
  const root = makeTempRoot();
  const brain = openBrainCoreDatabase(root);
  const memoryDb = openManufacturingMemoryDatabase(root);
  const service = new ManufacturingMemoryService(memoryDb, brain);

  brain.eventService.recordEvent({
    eventType: "material_used",
    entityType: "stock",
    entityId: "sheet-1",
    payload: {
      workspaceId: "ws-2",
      material: "304 Stainless",
      thickness: 1.5
    }
  });

  const rebuilt = service.rebuildFromBrainEvents("ws-2");
  assert.equal(rebuilt.rebuiltEventCount, 1);
  assert.ok(rebuilt.patterns.some((entry) => entry.patternType === "recurring_material_usage"));
});
