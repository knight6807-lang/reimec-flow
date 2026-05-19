import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openBrainCoreDatabase } from "./brain-core.js";
import { addOffcut, openStockMaterialDatabase } from "./stock-material.js";
import { NestingWorkspaceService, openNestingWorkspaceDatabase } from "./nesting-workspace.js";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-nesting-workspace-"));
}

function buildService() {
  const root = tempRoot();
  const brainRoot = path.join(root, "brain");
  const stockRoot = path.join(root, "stock");
  const nestingRoot = path.join(root, "nesting");
  for (const dir of [brainRoot, stockRoot, nestingRoot]) fs.mkdirSync(dir, { recursive: true });
  const brain = openBrainCoreDatabase(brainRoot);
  const stock = openStockMaterialDatabase(stockRoot);
  const nesting = openNestingWorkspaceDatabase(nestingRoot);
  const service = new NestingWorkspaceService(nesting, stock, path.join(root, "exports", "nesting"), brain);
  return { root, brain, stock, service };
}

function createWorkspace(service: NestingWorkspaceService) {
  const workspace = service.createWorkspace({
    workspaceId: "ws-1",
    customerName: "Acme Laser",
    nestName: "Bracket Run",
    material: "Mild Steel",
    thickness: 3,
    sheetWidth: 500,
    sheetHeight: 300,
    border: 10,
    kerf: 0.2,
    spacing: 5,
    allowRotation: true,
    allowCommonLine: true,
    enableMicroJoins: true
  });
  assert.ok(workspace);
  return workspace!;
}

function addRectPart(service: NestingWorkspaceService, workspaceId: number, width = 100, height = 80, quantity = 1) {
  const part = service.addPart(workspaceId, {
    fileName: "part.dxf",
    quantity,
    width,
    height,
    cutLength: width * 2 + height * 2,
    pierceCount: 1
  });
  assert.ok(part);
  return part!;
}

test("creates nesting workspace with sheet size and writes brain event", () => {
  const { brain, service } = buildService();
  const workspace = createWorkspace(service);
  assert.equal(workspace.sheetWidth, 500);
  assert.equal(workspace.sheetHeight, 300);
  assert.equal(brain.eventService.listEvents({ eventType: "nesting_workspace_created", workspaceId: "ws-1" }).length, 1);
});

test("adds DXF part and writes brain event", () => {
  const { brain, service } = buildService();
  const workspace = createWorkspace(service);
  const part = addRectPart(service, workspace.id, 120, 60, 2);
  assert.equal(part.quantity, 2);
  assert.equal(part.width, 120);
  assert.equal(service.getWorkspace(workspace.id)?.parts.length, 1);
  assert.equal(brain.eventService.listEvents({ eventType: "nesting_parts_added", workspaceId: "ws-1" }).length, 1);
});

test("stores non-rectangular DXF preview geometry for nesting preview", () => {
  const { service } = buildService();
  const workspace = createWorkspace(service);
  const triangleDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "90", "3", "70", "1",
    "10", "0", "20", "0", "10", "100", "20", "0", "10", "30", "20", "70",
    "0", "CIRCLE", "10", "30", "20", "20", "40", "4",
    "0", "ARC", "10", "60", "20", "20", "40", "8", "50", "0", "51", "90",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const part = service.addPart(workspace.id, { fileName: "triangle.dxf", quantity: 1, rawDxf: triangleDxf });
  const geometry = JSON.parse(part.geometryJson) as { outerContour: Array<{ x: number; y: number }>; preview: Array<{ x: number; y: number }>; previewGeometry: { outerContours: Array<Array<{ x: number; y: number }>>; innerHoles: Array<Array<{ x: number; y: number }>>; circles: Array<{ cx: number; cy: number; r: number }>; arcs: Array<{ cx: number; cy: number; r: number; startAngle: number; endAngle: number }> } };
  assert.equal(geometry.outerContour.length, 3);
  assert.equal(geometry.preview.length, 3);
  assert.equal(part.previewGeometry.outerContours.length, 1);
  assert.equal(part.previewGeometry.outerContours[0].length, 3);
  assert.equal(part.previewGeometry.innerHoles.length, 0);
  assert.equal(part.previewGeometry.circles.length, 1);
  assert.equal(part.previewGeometry.arcs.length, 1);
  assert.equal(geometry.previewGeometry.circles.length, 1);
  const area = Math.abs(geometry.preview.reduce((sum, point, index) => {
    const next = geometry.preview[(index + 1) % geometry.preview.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
  assert.equal(area, 3500);
});

test("recommends matching offcut and rejects wrong material or thickness", () => {
  const { stock, service } = buildService();
  const workspace = createWorkspace(service);
  addRectPart(service, workspace.id, 200, 100, 1);
  addOffcut(stock, { parentSheetId: null, material: "Mild Steel", thickness: 3, width: 240, height: 140, shapeData: null, location: "Rack A", status: "available" });
  addOffcut(stock, { parentSheetId: null, material: "Stainless", thickness: 3, width: 500, height: 300, shapeData: null, location: "Rack B", status: "available" });
  addOffcut(stock, { parentSheetId: null, material: "Mild Steel", thickness: 6, width: 500, height: 300, shapeData: null, location: "Rack C", status: "available" });

  const result = service.recommendOffcuts({ workspaceId: workspace.id, material: "Mild Steel", thickness: 3 });
  assert.equal(result.best?.source, "stock");
  assert.equal(result.recommendations.length, 1);
  assert.match(result.best?.message ?? "", /Recommended: Use OFFCUT/);
});

test("rotated offcut fit works", () => {
  const { stock, service } = buildService();
  const workspace = createWorkspace(service);
  addRectPart(service, workspace.id, 300, 120, 1);
  addOffcut(stock, { parentSheetId: null, material: "Mild Steel", thickness: 3, width: 150, height: 330, shapeData: null, location: "Rack A", status: "available" });
  const result = service.recommendOffcuts({ workspaceId: workspace.id, material: "Mild Steel", thickness: 3 });
  assert.equal(result.best?.fitsRotated, true);
});

test("manual placement saves and collision detection works", () => {
  const { service } = buildService();
  const workspace = createWorkspace(service);
  const partA = addRectPart(service, workspace.id, 100, 100, 1);
  const partB = addRectPart(service, workspace.id, 100, 100, 1);
  const result = service.savePlacements(workspace.id, [
    { partId: partA.id, x: 20, y: 20, rotation: 0, isManual: true },
    { partId: partB.id, x: 60, y: 60, rotation: 0, isManual: true }
  ]);
  assert.equal(result.workspace?.placements.length, 2);
  assert.ok(result.workspace?.placements.some((placement) => placement.hasCollision));
  assert.ok(result.warnings.some((warning) => /overlap/i.test(warning.message)));
});

test("export DXF creates customer folder and customer filename", () => {
  const { root, service } = buildService();
  const workspace = createWorkspace(service);
  addRectPart(service, workspace.id, 100, 80, 1);
  service.autoNest(workspace.id);
  const exported = service.exportDxf(workspace.id);
  assert.ok(fs.existsSync(exported.exportPath));
  assert.match(exported.exportPath, /Acme_Laser/);
  assert.match(path.basename(exported.exportPath), /^Acme_Laser_Bracket_Run_\d{8}_\d{4}\.dxf$/);
  assert.ok(exported.exportPath.startsWith(path.join(root, "exports", "nesting", "Acme_Laser")));
});

test("created offcut appears in offcut library and writes brain event", () => {
  const { brain, service } = buildService();
  const workspace = createWorkspace(service);
  addRectPart(service, workspace.id, 100, 80, 1);
  service.autoNest(workspace.id);
  const offcuts = service.createSuggestedOffcuts(workspace.id);
  assert.ok(offcuts.length >= 1);
  assert.ok(service.listOffcuts({ material: "Mild Steel", thickness: 3 }).some((offcut) => offcut.id === offcuts[0]?.id));
  assert.equal(brain.eventService.listEvents({ eventType: "offcut_created", workspaceId: "ws-1" }).length, 1);
});

test("auto nest completes and writes nesting_completed event", () => {
  const { brain, service } = buildService();
  const workspace = createWorkspace(service);
  addRectPart(service, workspace.id, 100, 80, 3);
  const result = service.autoNest(workspace.id);
  assert.equal(result.workspace?.status, "nested");
  assert.equal(result.workspace?.placements.length, 3);
  assert.equal(brain.eventService.listEvents({ eventType: "nesting_completed", workspaceId: "ws-1" }).length, 1);
});

test("auto nest uses full DXF footprint when a file has disconnected contours", () => {
  const { service } = buildService();
  const workspace = createWorkspace(service);
  const multiContourDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "90", "4", "70", "1",
    "10", "0", "20", "0", "10", "40", "20", "0", "10", "40", "20", "30", "10", "0", "20", "30",
    "0", "LWPOLYLINE", "90", "4", "70", "1",
    "10", "180", "20", "0", "10", "220", "20", "0", "10", "220", "20", "30", "10", "180", "20", "30",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  service.addPart(workspace.id, { fileName: "two-contours.dxf", quantity: 2, rawDxf: multiContourDxf });
  const result = service.autoNest(workspace.id);
  const placements = result.workspace?.placements ?? [];
  assert.equal(placements.length, 2);
  assert.ok(placements.every((placement) => !placement.hasCollision && !placement.isOutsideSheet));
  const sameSheet = placements[0].sheetIndex === placements[1].sheetIndex;
  if (sameSheet) {
    const rotatedA = placements[0].rotation === 90 || placements[0].rotation === 270;
    const rotatedB = placements[1].rotation === 90 || placements[1].rotation === 270;
    const widthA = rotatedA ? 30 : 220;
    const heightA = rotatedA ? 220 : 30;
    const widthB = rotatedB ? 30 : 220;
    const heightB = rotatedB ? 220 : 30;
    const separatedX = placements[0].x + widthA + 5 <= placements[1].x || placements[1].x + widthB + 5 <= placements[0].x;
    const separatedY = placements[0].y + heightA + 5 <= placements[1].y || placements[1].y + heightB + 5 <= placements[0].y;
    assert.ok(
      separatedX || separatedY,
      "placements must be separated by the full disconnected DXF footprint"
    );
  }
});
