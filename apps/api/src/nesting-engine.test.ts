import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CypNestProgramService, extractDxfGeometry, GeometryNormalizer, NestValidationService, NestingEngineService, NoFitPolygonService, RecoveredBasePlateModel, RecoveredNestModelService, RecoveredNestingStrategyService, openNestingEngineDatabase, runAdvancedNesting } from "./nesting-engine.js";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-nesting-engine-"));
}

function service() {
  const root = tempRoot();
  return {
    root,
    service: new NestingEngineService(openNestingEngineDatabase(root), path.join(root, "exports"))
  };
}

function rectPart(width: number, height: number, quantity = 1, extra: Record<string, unknown> = {}) {
  return {
    quantity,
    width,
    height,
    cutLength: width * 2 + height * 2,
    pierceCount: 1,
    ...extra
  };
}

function createAndOptimize(input: Partial<Parameters<NestingEngineService["create"]>[0]>) {
  const setup = service();
  const created = setup.service.create({
    sheetWidth: 500,
    sheetHeight: 300,
    material: "Mild Steel",
    thickness: 3,
    kerf: 0,
    border: 0,
    spacing: 5,
    parts: [],
    allowedRotations: [0, 90, 180, 270],
    ...input
  });
  assert.ok(created?.jobId);
  return { ...setup, plan: setup.service.optimize(created.jobId) };
}

test("multiple rectangles nest on one sheet", () => {
  const { plan } = createAndOptimize({
    sheetWidth: 300,
    sheetHeight: 200,
    parts: [rectPart(100, 80, 4)]
  });
  assert.equal(plan.placements.length, 4);
  assert.equal(new Set(plan.placements.map((placement) => placement.sheetIndex)).size, 1);
  assert.ok(plan.usagePercent > 50);
});

test("rotations reduce waste and allow a fitting nest", () => {
  const { plan } = createAndOptimize({
    sheetWidth: 130,
    sheetHeight: 100,
    spacing: 0,
    parts: [rectPart(100, 120, 1)]
  });
  assert.equal(plan.placements.length, 1);
  assert.ok([90, 270].includes(plan.placements[0].rotation));
});

test("common-line detects shared straight edges and reduces cut length estimate", () => {
  const { plan } = createAndOptimize({
    sheetWidth: 200,
    sheetHeight: 100,
    spacing: 0,
    allowCommonLine: true,
    allowCommonLineCutting: true,
    parts: [rectPart(100, 100, 2)]
  });
  assert.equal(plan.placements.length, 2);
  assert.ok(plan.commonLineSavings.length >= 1);
  assert.ok(plan.commonLineSavings[0].cutLengthSaved > 0);
  assert.ok(plan.estimatedCutLength < 800);
});

test("holes are cut before outer profiles", () => {
  const dxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "90", "4", "70", "1", "10", "0", "20", "0", "10", "100", "20", "0", "10", "100", "20", "100", "10", "0", "20", "100",
    "0", "CIRCLE", "10", "50", "20", "50", "40", "10",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const { plan } = createAndOptimize({
    sheetWidth: 200,
    sheetHeight: 200,
    parts: [{ quantity: 1, rawDxf: dxf }]
  });
  assert.ok(plan.cutOrder.some((operation) => operation.operation === "hole"));
  const firstOuter = plan.cutOrder.findIndex((operation) => operation.operation === "outer");
  const firstHole = plan.cutOrder.findIndex((operation) => operation.operation === "hole");
  assert.ok(firstHole >= 0 && firstOuter > firstHole);
});

test("lead-ins choose hole pierces before outer profiles and export LEAD_IN layer", () => {
  const dxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "90", "4", "70", "1", "10", "0", "20", "0", "10", "100", "20", "0", "10", "100", "20", "100", "10", "0", "20", "100",
    "0", "LWPOLYLINE", "90", "4", "70", "1", "10", "30", "20", "30", "10", "70", "20", "30", "10", "70", "20", "70", "10", "30", "20", "70",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const setup = service();
  const created = setup.service.create({
    sheetWidth: 180,
    sheetHeight: 180,
    material: "Mild Steel",
    thickness: 3,
    kerf: 0.2,
    border: 5,
    spacing: 5,
    leadInType: "line",
    leadInLength: 8,
    pierceOffset: 2,
    parts: [{ quantity: 1, rawDxf: dxf }]
  });
  assert.ok(created?.jobId);
  const plan = setup.service.optimize(created.jobId);
  assert.equal(plan.leadIns[0].contourType, "hole");
  assert.equal(plan.leadIns.at(-1)?.contourType, "outer");
  assert.ok(plan.leadIns.every((leadIn) => leadIn.startPoint));
  const exported = setup.service.exportDxf(created.jobId);
  assert.match(fs.readFileSync(exported.dxfExportPath ?? "", "utf8"), /LEAD_IN/);
});

test("extracts true DXF contours, holes, and original entities for nesting preview", () => {
  const dxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "CUT", "10", "0", "20", "0", "11", "100", "21", "0",
    "0", "LINE", "8", "CUT", "10", "100", "20", "0", "11", "100", "21", "60",
    "0", "LINE", "8", "CUT", "10", "100", "20", "60", "11", "0", "21", "60",
    "0", "LINE", "8", "CUT", "10", "0", "20", "60", "11", "0", "21", "0",
    "0", "CIRCLE", "8", "CUT", "10", "50", "20", "30", "40", "8",
    "0", "ARC", "8", "CUT", "10", "20", "20", "20", "40", "5", "50", "0", "51", "90",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const geometry = extractDxfGeometry(dxf);
  assert.equal(geometry.width, 100);
  assert.equal(geometry.height, 60);
  assert.ok(geometry.outerContour.length >= 4);
  assert.equal(geometry.holes.length, 1);
  assert.ok(geometry.simplifiedPolygon.length >= 3);
  assert.ok(geometry.originalEntities.some((entity) => entity.type === "CIRCLE" && entity.layer === "CUT"));
  assert.ok(geometry.originalEntities.some((entity) => entity.type === "ARC"));
});

test("polygon collision respects holes and flags solid overlap", () => {
  const normalizer = new GeometryNormalizer();
  const donutDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "90", "4", "70", "1", "10", "0", "20", "0", "10", "200", "20", "0", "10", "200", "20", "200", "10", "0", "20", "200",
    "0", "LWPOLYLINE", "90", "4", "70", "1", "10", "75", "20", "75", "10", "125", "20", "75", "10", "125", "20", "125", "10", "75", "20", "125",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const donut = normalizer.normalize({ itemId: 1, rawDxf: donutDxf, quantity: 1 });
  const plug = normalizer.normalize({ itemId: 2, width: 40, height: 40, quantity: 1 });
  const input = { sheetWidth: 250, sheetHeight: 250, material: "Mild Steel", thickness: 3, kerf: 0, border: 0, spacing: 5, parts: [{ quantity: 1 }, { quantity: 1 }] };
  const basePlan = {
    commonLineSavings: [],
    placements: [
      { id: "donut", nestingItemId: 1, sheetIndex: 0, x: 0, y: 0, width: 200, height: 200, rotation: 0, mirrored: false, isCommonLine: false, part: donut },
      { id: "plug", nestingItemId: 2, sheetIndex: 0, x: 80, y: 80, width: 40, height: 40, rotation: 0, mirrored: false, isCommonLine: false, part: plug }
    ]
  };
  const validator = new NestValidationService();
  assert.ok(!validator.validate(basePlan as never, input as never).some((warning) => /overlap|spacing/i.test(warning.message)));
  const solidOverlapPlan = { ...basePlan, placements: [basePlan.placements[0], { ...basePlan.placements[1], x: 60, y: 80 }] };
  assert.ok(validator.validate(solidOverlapPlan as never, input as never).some((warning) => /overlap|spacing/i.test(warning.message)));
});

test("polygon collision supports concave polygons", () => {
  const normalizer = new GeometryNormalizer();
  const concave = normalizer.normalize({
    itemId: 1,
    quantity: 1,
    rawDxf: [
      "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "90", "6", "70", "1",
      "10", "0", "20", "0", "10", "120", "20", "0", "10", "120", "20", "40", "10", "40", "20", "40", "10", "40", "20", "120", "10", "0", "20", "120",
      "0", "ENDSEC", "0", "EOF"
    ].join("\n")
  });
  const rect = normalizer.normalize({ itemId: 2, width: 35, height: 35, quantity: 1 });
  const input = { sheetWidth: 200, sheetHeight: 200, material: "Mild Steel", thickness: 3, kerf: 0, border: 0, spacing: 0, parts: [{ quantity: 1 }, { quantity: 1 }] };
  const plan = {
    commonLineSavings: [],
    placements: [
      { id: "concave", nestingItemId: 1, sheetIndex: 0, x: 0, y: 0, width: 120, height: 120, rotation: 0, mirrored: false, isCommonLine: false, part: concave },
      { id: "rect", nestingItemId: 2, sheetIndex: 0, x: 20, y: 60, width: 35, height: 35, rotation: 0, mirrored: false, isCommonLine: false, part: rect }
    ]
  };
  assert.ok(new NestValidationService().validate(plan as never, input as never).some((warning) => /overlap/i.test(warning.message)));
});

test("polygon offset boundary catches kerf and spacing violations", () => {
  const normalizer = new GeometryNormalizer();
  const partA = normalizer.normalize({ itemId: 1, width: 50, height: 50, quantity: 1 });
  const partB = normalizer.normalize({ itemId: 2, width: 50, height: 50, quantity: 1 });
  const plan = {
    commonLineSavings: [],
    placements: [
      { id: "a", nestingItemId: 1, sheetIndex: 0, x: 0, y: 0, width: 50, height: 50, rotation: 0, mirrored: false, isCommonLine: false, part: partA },
      { id: "b", nestingItemId: 2, sheetIndex: 0, x: 53, y: 0, width: 50, height: 50, rotation: 0, mirrored: false, isCommonLine: false, part: partB }
    ]
  };
  const input = { sheetWidth: 200, sheetHeight: 100, material: "Mild Steel", thickness: 3, kerf: 1, border: 0, spacing: 5, parts: [{ quantity: 1 }, { quantity: 1 }] };
  const warnings = new NestValidationService().validate(plan as never, input as never);
  assert.ok(warnings.some((warning) => /spacing|kerf/i.test(warning.message)));
});

test("true-shape candidate points place parts into open polygon pockets", () => {
  const pocketDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "90", "6", "70", "1",
    "10", "0", "20", "0", "10", "120", "20", "0", "10", "120", "20", "40", "10", "40", "20", "40", "10", "40", "20", "120", "10", "0", "20", "120",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const { plan } = createAndOptimize({
    sheetWidth: 120,
    sheetHeight: 120,
    spacing: 0,
    kerf: 0,
    parts: [
      { quantity: 1, rawDxf: pocketDxf },
      rectPart(35, 35, 1)
    ]
  });
  assert.equal(plan.placements.length, 2);
  const inserted = plan.placements.find((placement) => placement.part.width === 35 && placement.part.height === 35);
  assert.ok(inserted);
  assert.ok(inserted.x >= 40 || inserted.y >= 40);
});

test("puzzle-fit candidates use polygon vertices and reject real overlaps", () => {
  const lShapeDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "90", "6", "70", "1",
    "10", "0", "20", "0", "10", "120", "20", "0", "10", "120", "20", "40", "10", "40", "20", "40", "10", "40", "20", "120", "10", "0", "20", "120",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const { plan } = createAndOptimize({
    sheetWidth: 120,
    sheetHeight: 120,
    spacing: 0,
    kerf: 0,
    parts: [
      { quantity: 1, rawDxf: lShapeDxf },
      rectPart(35, 35, 1)
    ]
  });
  assert.equal(plan.placements.length, 2);
  assert.ok(!plan.warnings.some((warning) => /Parts overlap/i.test(warning.message)));

  const normalizer = new GeometryNormalizer();
  const partA = normalizer.normalize({ itemId: 1, rawDxf: lShapeDxf, quantity: 1 });
  const partB = normalizer.normalize({ itemId: 2, width: 35, height: 35, quantity: 1 });
  const debugWarnings = new NestValidationService().validate({
    ...plan,
    placements: [
      { id: "a", nestingItemId: 1, sheetIndex: 0, x: 0, y: 0, width: 120, height: 120, rotation: 0, mirrored: false, isCommonLine: false, part: partA },
      { id: "b", nestingItemId: 2, sheetIndex: 0, x: 20, y: 60, width: 35, height: 35, rotation: 0, mirrored: false, isCommonLine: false, part: partB }
    ]
  } as never, { sheetWidth: 120, sheetHeight: 120, material: "Mild Steel", thickness: 3, kerf: 0, border: 0, spacing: 0, parts: [{ quantity: 1 }, { quantity: 1 }] } as never);
  const overlap = debugWarnings.find((warning) => /Parts overlap/i.test(warning.message));
  assert.ok(overlap?.payload?.overlapDebug);
});

test("small parts can nest inside usable internal cutout pockets", () => {
  const pocketDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "90", "4", "70", "1",
    "10", "0", "20", "0", "10", "200", "20", "0", "10", "200", "20", "200", "10", "0", "20", "200",
    "0", "LWPOLYLINE", "90", "4", "70", "1",
    "10", "70", "20", "70", "10", "150", "20", "70", "10", "150", "20", "150", "10", "70", "20", "150",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const { plan } = createAndOptimize({
    sheetWidth: 200,
    sheetHeight: 200,
    spacing: 5,
    kerf: 1,
    allowedRotations: [0],
    parts: [
      { quantity: 1, rawDxf: pocketDxf },
      rectPart(45, 45, 1)
    ]
  });
  assert.equal(plan.placements.length, 2);
  const inserted = plan.placements.find((placement) => placement.part.width === 45 && placement.part.height === 45);
  assert.ok(inserted);
  assert.ok(inserted.x >= 76 && inserted.y >= 76);
  assert.ok(plan.warnings.some((warning) => /Pocket placement depends on safe cut order/i.test(warning.message)));
});

test("small parts do not nest inside cutouts marked unusable", () => {
  const unusablePocketDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "8", "UNUSABLE_POCKET", "90", "4", "70", "1",
    "10", "0", "20", "0", "10", "200", "20", "0", "10", "200", "20", "200", "10", "0", "20", "200",
    "0", "LWPOLYLINE", "8", "UNUSABLE_POCKET", "90", "4", "70", "1",
    "10", "70", "20", "70", "10", "150", "20", "70", "10", "150", "20", "150", "10", "70", "20", "150",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const { plan } = createAndOptimize({
    sheetWidth: 200,
    sheetHeight: 200,
    spacing: 5,
    kerf: 1,
    allowedRotations: [0],
    parts: [
      { quantity: 1, rawDxf: unusablePocketDxf },
      rectPart(45, 45, 1)
    ]
  });
  assert.equal(plan.placements.length, 1);
});

test("micro joins are added to long narrow parts", () => {
  const { plan } = createAndOptimize({
    allowMicroJoins: true,
    enableMicroJoins: true,
    defaultTabWidth: 3,
    parts: [rectPart(300, 30, 1)]
  });
  assert.ok(plan.microJoins.length >= 2);
  const placement = plan.placements[0];
  assert.ok(plan.microJoins.every((tab) => tab.x >= placement.x && tab.x <= placement.x + placement.width && tab.y >= placement.y && tab.y <= placement.y + placement.height));
  assert.ok(plan.microJoins.every((tab) => Math.min(Math.abs(tab.x - placement.x), Math.abs(tab.x - placement.x - placement.width), Math.abs(tab.y - placement.y), Math.abs(tab.y - placement.y - placement.height)) <= 0.1));
  assert.ok(plan.warnings.some((warning) => /micro joins/i.test(warning.message)));
});

test("micro joins are optional and export on MICRO_JOIN layer", () => {
  const disabled = createAndOptimize({
    allowMicroJoins: false,
    enableMicroJoins: false,
    parts: [rectPart(300, 30, 1)]
  });
  assert.equal(disabled.plan.microJoins.length, 0);

  const setup = service();
  const created = setup.service.create({
    sheetWidth: 500,
    sheetHeight: 300,
    material: "Mild Steel",
    thickness: 3,
    kerf: 0,
    border: 0,
    spacing: 5,
    allowMicroJoins: true,
    enableMicroJoins: true,
    parts: [rectPart(300, 30, 1)]
  });
  assert.ok(created?.jobId);
  const exported = setup.service.exportDxf(created.jobId);
  assert.match(fs.readFileSync(exported.dxfExportPath ?? "", "utf8"), /MICRO_JOIN/);
});

test("iterative optimizer handles many parts without recursion stack overflow", () => {
  const started = Date.now();
  const { plan } = createAndOptimize({
    sheetWidth: 1000,
    sheetHeight: 1000,
    parts: [rectPart(20, 20, 400)],
    maxOptimizationMs: 500
  });
  assert.ok(plan.placements.length > 0);
  assert.ok(Date.now() - started < 5000);
  assert.ok(plan.optimizationProgress.returnedBestSoFar || plan.optimizationProgress.attemptsCompleted > 1);
});

test("export DXF works for nested result", () => {
  const setup = service();
  const created = setup.service.create({
    sheetWidth: 300,
    sheetHeight: 200,
    material: "Mild Steel",
    thickness: 3,
    kerf: 0,
    border: 0,
    spacing: 5,
    parts: [rectPart(100, 80, 2)]
  });
  assert.ok(created?.jobId);
  const exported = setup.service.exportDxf(created.jobId);
  assert.ok(exported.dxfExportPath);
  assert.ok(fs.existsSync(exported.dxfExportPath));
  assert.match(fs.readFileSync(exported.dxfExportPath, "utf8"), /LWPOLYLINE/);
});

test("export DXF preserves transformed original entities and writes report", () => {
  const setup = service();
  const dxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "CUT", "10", "0", "20", "0", "11", "80", "21", "0",
    "0", "ARC", "8", "CUT", "10", "40", "20", "30", "40", "15", "50", "0", "51", "180",
    "0", "CIRCLE", "8", "CUT", "10", "40", "20", "30", "40", "8",
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");
  const created = setup.service.create({
    sheetWidth: 300,
    sheetHeight: 200,
    material: "Mild Steel",
    thickness: 3,
    kerf: 0,
    border: 10,
    spacing: 5,
    customerName: "Reimec",
    nestName: "Original Geometry",
    parts: [{ quantity: 1, rawDxf: dxf }]
  });
  assert.ok(created?.jobId);
  const exported = setup.service.exportDxf(created.jobId);
  assert.ok(exported.dxfExportPath?.includes(path.join("Reimec", "Reimec_Original Geometry.dxf")));
  assert.ok(exported.exportReportPath);
  assert.ok(fs.existsSync(exported.exportReportPath));
  const output = fs.readFileSync(exported.dxfExportPath ?? "", "utf8");
  assert.match(output, /0\nARC\n8\nCUT/);
  assert.match(output, /0\nCIRCLE\n8\nCUT/);
  assert.match(output, /0\nTEXT\n8\nTEXT/);
  assert.doesNotMatch(output, /90\n\d{3,}/);
  const report = JSON.parse(fs.readFileSync(exported.exportReportPath, "utf8")) as { placements: number; exportPath: string };
  assert.equal(report.placements, 1);
  assert.equal(report.exportPath, exported.dxfExportPath);
});

test("warning is created for high heat small-hole pattern", () => {
  const { plan } = createAndOptimize({
    material: "Stainless",
    thickness: 1,
    parts: [rectPart(120, 120, 1, { pierceCount: 20 })]
  });
  assert.ok(plan.warnings.some((warning) => /heat concentration/i.test(warning.message)));
});

test("no-fit polygon service generates touching candidates and debug zones", () => {
  const service = new NoFitPolygonService();
  const placed = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
  const candidate = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
  const nfp = service.generate(placed, candidate, 5);
  assert.ok(nfp.boundary.length >= 3);
  assert.ok(nfp.collisionZone.length >= 3);
  assert.ok(nfp.validPoints.some((point) => point.x > 100 || point.y > 80));
});

test("recovered nesting strategy maps symbols to rotation and specialist paths", () => {
  const strategy = new RecoveredNestingStrategyService();
  const rectangle = new GeometryNormalizer().normalize({ itemId: 1, quantity: 1, width: 100, height: 50 });
  const polygon = new GeometryNormalizer().normalize({
    itemId: 2,
    quantity: 1,
    rawDxf: [
      "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "90", "3", "70", "1",
      "10", "0", "20", "0", "10", "100", "20", "20", "10", "20", "20", "80",
      "0", "ENDSEC", "0", "EOF"
    ].join("\n")
  });
  assert.equal(strategy.classifyPart(rectangle), "rectangle");
  assert.equal(strategy.classifyPart(polygon), "polygon");
  const rotations = strategy.rotationCandidates([polygon], undefined, 45);
  assert.ok(rotations.includes(45));
  assert.ok(rotations.some((rotation) => rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270));
});

test("recovered nest model caches angle parts and indexes surrounding plate parts", () => {
  const normalizer = new GeometryNormalizer();
  const part = normalizer.normalize({ itemId: 7, quantity: 1, width: 100, height: 50 });
  const modelService = new RecoveredNestModelService();
  const basePart = modelService.createBasePart(part, 5);
  const anglePart = modelService.getAnglePart(basePart, 90);
  const sameAnglePart = modelService.getAnglePart(basePart, 450);
  assert.equal(anglePart, sameAnglePart);

  const plate = new RecoveredBasePlateModel(500, 300, 10);
  plate.addPlacement({
    id: "7-1",
    nestingItemId: 7,
    sheetIndex: 0,
    x: 10,
    y: 10,
    width: 100,
    height: 50,
    rotation: 0,
    mirrored: false,
    isCommonLine: false,
    part
  });
  const near = plate.getSurroundingPlacements([{ x: 105, y: 10 }, { x: 130, y: 10 }, { x: 130, y: 60 }, { x: 105, y: 60 }], 10);
  const far = plate.getSurroundingPlacements([{ x: 300, y: 10 }, { x: 330, y: 10 }, { x: 330, y: 60 }, { x: 300, y: 60 }], 10);
  assert.equal(near.length, 1);
  assert.equal(far.length, 0);
  assert.ok(plate.calcRemainArea() > 0);
});

test("one-file advanced nesting runner places polygons and exports DXF", () => {
  const result = runAdvancedNesting(
    [
      {
        id: "part-a",
        name: "300x200 Plate",
        quantity: 2,
        polygon: [
          { x: 0, y: 0 },
          { x: 300, y: 0 },
          { x: 300, y: 200 },
          { x: 0, y: 200 }
        ]
      },
      {
        id: "part-b",
        name: "600x120 Strip",
        quantity: 1,
        polygon: [
          { x: 0, y: 0 },
          { x: 600, y: 0 },
          { x: 600, y: 120 },
          { x: 0, y: 120 }
        ]
      }
    ],
    {
      type: "sheet",
      width: 1000,
      height: 500,
      border: 10,
      spacing: 0,
      kerf: 0
    },
    {
      customerName: "Reimec",
      nestName: "TestNest",
      maxOptimizationMs: 1000
    }
  );
  assert.equal(result.placements.length, 3);
  assert.equal(result.unplaced.length, 0);
  assert.ok(result.usagePercent > 0);
  assert.ok(result.commonLineSaving > 0);
  assert.ok(result.optimizationProgress.attemptsCompleted > 1);
  assert.equal(result.optimizationProgress.bestWastePercent, result.wastePercent);
  assert.ok(result.nfpDebug.validPoints.length > 0);
  assert.match(result.dxf, /LWPOLYLINE/);
  assert.match(result.dxf, /MICRO_JOIN/);
  assert.match(result.dxf, /Reimec - TestNest/);
});

test("cypnest program maps recovered symbols to a complete nesting run", () => {
  const program = new CypNestProgramService();
  const result = program.run({
    customerName: "Reimec",
    nestName: "Recovered Program",
    material: "Mild Steel",
    thickness: 3,
    plateParam: {
      plateSource: "standard",
      standardPlateName: "Small",
      standardPlates: [{ name: "Small", width: 600, length: 300, amount: 1 }]
    },
    nestParam: {
      strategyName: "full_fill",
      nestDirection: "auto",
      gapDist: 5,
      plateGap: 10,
      kerf: 0.2,
      maxNestLoopCount: 12,
      allowCommonLine: true,
      leadInKind: "line",
      leadInLength: 6,
      leadSealSize: 1.2
    },
    parts: [
      rectPart(120, 80, 3),
      rectPart(60, 160, 1)
    ]
  });
  assert.equal(result.report.source, "recovered-cypnest-symbols");
  assert.equal(result.report.strategyName, "full_fill");
  assert.equal(result.report.plateSource, "standard");
  assert.ok(result.report.mappedFeatures.some((feature) => feature.includes("NestParam")));
  assert.equal(result.report.totalParts, 4);
  assert.equal(result.report.partsComplete, result.plan.placements.length);
  assert.ok(result.plan.placements.length > 0);
  assert.ok(result.plan.leadIns.length > 0);
  assert.ok(result.plan.cutOrder.length > 0);
  assert.ok(program.extractNestResultInfo(result).usagePercent > 0);
});
