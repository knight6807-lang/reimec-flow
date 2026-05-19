import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openBrainCoreDatabase } from "./brain-core.js";
import { BrainOrchestrator } from "./brain/core/BrainOrchestrator.js";
import type { BrainModule } from "./brain/core/types.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-brain-core-"));
}

test("records events and creates linked recommendations", () => {
  const root = makeTempRoot();
  const brain = openBrainCoreDatabase(root);
  const event = brain.eventService.recordEvent({
    eventType: "quote_accepted",
    entityType: "quote",
    entityId: "quote-1",
    payload: { workspaceId: "ws-1", quoteNumber: "Q-2026-001" },
    links: [
      {
        sourceType: "quote",
        sourceId: "quote-1",
        targetType: "workspace",
        targetId: "ws-1",
        linkType: "belongs_to"
      }
    ]
  });
  assert.ok(event.id > 0);

  const events = brain.eventService.listEvents({ workspaceId: "ws-1" });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "quote_accepted");

  const recommendations = brain.recommendationService.listRecommendations({ workspaceId: "ws-1" });
  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0]?.recommendationType, "job_follow_up");

  const links = brain.memoryService.listLinksForEntity("quote", "quote-1");
  assert.equal(links.length, 1);
  assert.equal(links[0]?.targetId, "ws-1");
});

test("updates recommendation status", () => {
  const root = makeTempRoot();
  const brain = openBrainCoreDatabase(root);
  const created = brain.recommendationService.createRecommendation({
    moduleName: "brain_core",
    recommendationType: "error_review",
    title: "Review error",
    message: "Investigate the captured error.",
    confidence: 0.95,
    impactScore: 90,
    payload: { workspaceId: "ws-2" }
  });
  assert.ok(created);
  const updated = brain.recommendationService.updateRecommendation(created!.id, "accepted");
  assert.equal(updated?.status, "accepted");
});

test("processes persisted outbox events through matching brain modules", async () => {
  const root = makeTempRoot();
  const brain = openBrainCoreDatabase(root);
  let handled = 0;
  const module: BrainModule = {
    name: "test_module",
    supportedEvents: ["dxf_imported"],
    async handleEvent(event) {
      handled += 1;
      assert.equal(event.eventType, "dxf_imported");
      assert.equal(event.entityId, "file-1");
      return {
        eventsCreated: [],
        recommendationsCreated: [],
        warnings: [],
        metrics: { handled }
      };
    }
  };
  const orchestrator = new BrainOrchestrator(brain.eventBus, [module], brain.cache, brain.taskService);

  brain.eventService.recordEvent({
    eventType: "dxf_imported",
    entityType: "dxf",
    entityId: "file-1",
    payload: { workspaceId: "ws-1" }
  });

  assert.equal(brain.eventBus.stats().pending, 1);
  const result = await orchestrator.processPendingEvents();
  assert.equal(result.completed, 1);
  assert.equal(handled, 1);
  assert.equal(brain.eventBus.stats().completed, 1);
});
