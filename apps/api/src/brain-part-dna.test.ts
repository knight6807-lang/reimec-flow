import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openBrainCoreDatabase } from "./brain-core.js";
import { openBrainPartDnaDatabase, PartDnaBrainService } from "./brain-part-dna.js";
import { openPartDnaDatabase } from "./part-dna.js";

function lineEntity(x1: number, y1: number, x2: number, y2: number) {
  return `0
LINE
8
0
10
${x1}
20
${y1}
11
${x2}
21
${y2}
`;
}

function circleEntity(cx: number, cy: number, r: number) {
  return `0
CIRCLE
8
0
10
${cx}
20
${cy}
40
${r}
`;
}

function makeDxf(entities: string[]) {
  return `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
ENTITIES
${entities.join("")}0
ENDSEC
0
EOF
`;
}

function rectangleEntities(x: number, y: number, w: number, h: number) {
  return [
    lineEntity(x, y, x + w, y),
    lineEntity(x + w, y, x + w, y + h),
    lineEntity(x + w, y + h, x, y + h),
    lineEntity(x, y + h, x, y)
  ];
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-brain-part-dna-"));
}

test("brain part dna analyze records event and history", () => {
  const root = makeTempRoot();
  const brainCore = openBrainCoreDatabase(root);
  const legacyDb = openPartDnaDatabase(root);
  const brainDb = openBrainPartDnaDatabase(root);
  const service = new PartDnaBrainService(brainDb, legacyDb, brainCore);
  const rawDxf = makeDxf(rectangleEntities(0, 0, 120, 60));

  const result = service.analyzeDxf({
    workspaceId: "ws-1",
    rawDxf,
    fileName: "plate-a.dxf",
    partName: "Plate A",
    customerId: "cust-1",
    customerName: "Reimec",
    material: "304 Stainless",
    thickness: 1.5,
    entityType: "quote",
    entityId: "quote-1",
    quotedPrice: 420
  });

  assert.ok(result.brainPartDnaId > 0);
  assert.ok(result.complexityScore > 0);
  assert.equal(result.customerHistory.length, 1);
  assert.equal(result.customerHistory[0]?.quotedPrice, 420);

  const events = brainCore.eventService.listEvents({ workspaceId: "ws-1", eventType: "part_dna_detected" });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.entityType, "part_dna");
});

test("brain part dna creates near-match recommendation", () => {
  const root = makeTempRoot();
  const brainCore = openBrainCoreDatabase(root);
  const legacyDb = openPartDnaDatabase(root);
  const brainDb = openBrainPartDnaDatabase(root);
  const service = new PartDnaBrainService(brainDb, legacyDb, brainCore);

  service.analyzeDxf({
    workspaceId: "ws-2",
    rawDxf: makeDxf(rectangleEntities(0, 0, 100, 50)),
    fileName: "rect-a.dxf",
    partName: "Rect A",
    entityType: "quote",
    entityId: "quote-a"
  });

  const second = service.analyzeDxf({
    workspaceId: "ws-2",
    rawDxf: makeDxf([...rectangleEntities(0, 0, 100, 50), circleEntity(30, 25, 8)]),
    fileName: "rect-b.dxf",
    partName: "Rect B",
    entityType: "quote",
    entityId: "quote-b"
  });

  assert.ok(second.nearMatches.length >= 1);
  const recommendations = brainCore.recommendationService.listRecommendations({ workspaceId: "ws-2", moduleName: "true_part_dna" });
  assert.ok(recommendations.some((entry) => entry.recommendationType === "similar_part_found"));
});
