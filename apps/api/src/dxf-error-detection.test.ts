import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { openBrainCoreDatabase } from "./brain-core.js";
import { DxfErrorDetectionService, openDxfErrorDetectionDatabase } from "./dxf-error-detection.js";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildService() {
  const root = makeTempDir("qouterx-dxf-errors-");
  const brainRoot = path.join(root, "brain");
  const dxfRoot = path.join(root, "dxf");
  ensureDir(brainRoot);
  ensureDir(dxfRoot);
  const brainDb = openBrainCoreDatabase(brainRoot);
  const dxfDb = openDxfErrorDetectionDatabase(dxfRoot);
  return new DxfErrorDetectionService(dxfDb, brainDb);
}

const OPEN_AND_DUPLICATE_DXF = `0
SECTION
2
ENTITIES
0
LINE
8
0
10
0
20
0
11
10
21
0
0
LINE
8
0
10
10
20
0
11
10
21
10
0
LINE
8
0
10
10
20
10
11
0
21
10
0
LINE
8
0
10
0
20
0
11
10
21
0
0
ENDSEC
0
EOF`;

const CIRCLE_AND_UNSUPPORTED_DXF = `0
SECTION
2
ENTITIES
0
LINE
8
0
10
0
20
0
11
40
21
0
0
LINE
8
0
10
40
20
0
11
40
21
40
0
LINE
8
0
10
40
20
40
11
0
21
40
0
LINE
8
0
10
0
20
40
11
0
21
0
0
CIRCLE
8
0
10
20
20
20
40
0.5
0
SPLINE
8
0
0
ENDSEC
0
EOF`;

test("detects open contours and duplicate geometry", () => {
  const service = buildService();
  const result = service.checkDxf({
    workspaceId: "ws-1",
    dxfFileId: "test-open.dxf",
    rawDxf: OPEN_AND_DUPLICATE_DXF,
    thickness: 2
  });

  assert.ok(result.summary.criticalCount >= 1);
  assert.ok(result.reports.some((entry) => entry.errorType === "open_contours"));
  assert.ok(result.reports.some((entry) => entry.errorType === "duplicate_lines"));

  const fetched = service.listReports("ws-1", "test-open.dxf");
  assert.equal(fetched.reports.length, result.reports.length);
});

test("detects tiny holes, unsupported entities, and missing scale", () => {
  const service = buildService();
  const result = service.checkDxf({
    workspaceId: "ws-2",
    dxfFileId: "test-hole.dxf",
    rawDxf: CIRCLE_AND_UNSUPPORTED_DXF,
    thickness: 1.5,
    partDnaId: 42
  });

  assert.ok(result.reports.some((entry) => entry.errorType === "unsupported_entities"));
  assert.ok(result.reports.some((entry) => entry.errorType === "tiny_holes"));
  assert.ok(result.reports.some((entry) => entry.errorType === "holes_smaller_than_thickness"));
  assert.ok(result.reports.some((entry) => entry.errorType === "missing_scale"));
});
