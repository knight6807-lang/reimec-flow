import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeAndUpsertPartDna, fingerprintDxfGeometry, openPartDnaDatabase } from "./part-dna.js";

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

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-part-dna-"));
}

test("same DXF with different filename matches", () => {
  const root = makeTempDir();
  const db = openPartDnaDatabase(root);
  const raw = makeDxf(rectangleEntities(0, 0, 100, 50));

  const first = analyzeAndUpsertPartDna(db, {
    workspaceId: "ws-1",
    rawDxf: raw,
    fileName: "alpha.dxf"
  });
  const second = analyzeAndUpsertPartDna(db, {
    workspaceId: "ws-1",
    rawDxf: raw,
    fileName: "beta.dxf"
  });

  assert.equal(first.geometryHash, second.geometryHash);
  assert.equal(second.isExistingPart, true);
  assert.equal(first.partCode, second.partCode);
});

test("same geometry moved in X/Y still matches", () => {
  const original = makeDxf(rectangleEntities(0, 0, 100, 50));
  const shifted = makeDxf(rectangleEntities(300, 120, 100, 50));
  const a = fingerprintDxfGeometry(original);
  const b = fingerprintDxfGeometry(shifted);
  assert.equal(a.geometryHash, b.geometryHash);
});

test("entity order changed still matches", () => {
  const ordered = makeDxf(rectangleEntities(0, 0, 100, 50));
  const shuffled = makeDxf([...rectangleEntities(0, 0, 100, 50)].reverse());
  const a = fingerprintDxfGeometry(ordered);
  const b = fingerprintDxfGeometry(shuffled);
  assert.equal(a.geometryHash, b.geometryHash);
});

test("slight coordinate rounding still matches", () => {
  const exact = makeDxf(rectangleEntities(0, 0, 100, 50));
  const rounded = makeDxf(rectangleEntities(0.004, 0.006, 100.003, 50.004));
  const a = fingerprintDxfGeometry(exact);
  const b = fingerprintDxfGeometry(rounded);
  assert.equal(a.geometryHash, b.geometryHash);
});

test("different hole count does not exact match", () => {
  const noHole = makeDxf(rectangleEntities(0, 0, 100, 50));
  const oneHole = makeDxf([...rectangleEntities(0, 0, 100, 50), circleEntity(30, 25, 10)]);
  const a = fingerprintDxfGeometry(noHole);
  const b = fingerprintDxfGeometry(oneHole);
  assert.notEqual(a.geometryHash, b.geometryHash);
  assert.notEqual(a.holeCount, b.holeCount);
});
