import fs from "node:fs";
import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService } from "./brain-core.js";

export type NestingJobStatus = "draft" | "optimized" | "approved" | "exported";
export type NestWarningSeverity = "info" | "warning" | "critical";
export type LeadInType = "line" | "arc";

export type Point = { x: number; y: number };
export type Segment = { x1: number; y1: number; x2: number; y2: number; kind: "line" | "arc" | "circle" };
export type Polygon = Point[];
export type DxfOriginalEntity = { type: string; layer: string; values: Record<string, string[]> };
export type DxfGeometryPreview = {
  width: number;
  height: number;
  outerContour: Polygon;
  holes: Polygon[];
  simplifiedPolygon: Polygon;
  segments: Segment[];
  originalEntities: DxfOriginalEntity[];
};

export type NormalizedPart = {
  itemId: number;
  jobId: string | null;
  quoteId: string | null;
  partDnaId: number | null;
  dxfFileId: string | null;
  quantity: number;
  width: number;
  height: number;
  area: number;
  cutLength: number;
  pierceCount: number;
  holeCount: number;
  outerContour: Polygon;
  holes: Polygon[];
  simplifiedPolygon: Polygon;
  segments: Segment[];
  originalDxfEntities: DxfOriginalEntity[];
  rawDxf?: string | null;
};

export type NestingEngineInput = {
  workspaceId?: string | null;
  sheetWidth: number;
  sheetHeight: number;
  material: string;
  thickness: number;
  kerf: number;
  border: number;
  spacing: number;
  parts: Array<{
    jobId?: string | number | null;
    quoteId?: string | null;
    partDnaId?: number | null;
    dxfFileId?: string | null;
    dxfPath?: string | null;
    rawDxf?: string | null;
    quantity: number;
    width?: number;
    height?: number;
    cutLength?: number;
    pierceCount?: number;
  }>;
  allowedRotations?: number[];
  grainDirection?: "x" | "y" | null;
  allowCommonLine?: boolean;
  allowCommonLineCutting?: boolean;
  allowMicroJoins?: boolean;
  enableMicroJoins?: boolean;
  leadInType?: LeadInType;
  leadInLength?: number;
  leadOutLength?: number;
  pierceOffset?: number;
  defaultTabWidth?: number;
  minimumPartSizeForTabs?: number;
  tabsPerPartSmall?: number;
  tabsPerPartLarge?: number;
  angleStepDegrees?: number;
  maxOptimizationMs?: number;
  customerToleranceAllowsCommonLine?: boolean;
  customerName?: string;
  nestName?: string;
};

export type PartPlacement = {
  id: string;
  nestingItemId: number;
  sheetIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  mirrored: boolean;
  isCommonLine: boolean;
  part: NormalizedPart;
};

export type CommonLineSaving = {
  placementIds: [string, string];
  length: number;
  cutLengthSaved: number;
  piercesSaved: number;
  timeSavedMinutes: number;
  costSaved: number;
};

export type LeadIn = {
  placementId: string;
  contourType: "outer" | "hole";
  point: Point;
  startPoint?: Point;
  length: number;
  type: LeadInType;
  warning?: string;
};

export type MicroJoin = {
  placementId: string;
  x: number;
  y: number;
  tabWidth: number;
  reason: string;
};

export type HeatZone = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  pierces: number;
};

export type HeatAnalysis = {
  heatScore: number;
  heatZones: HeatZone[];
  warnings: NestWarning[];
};

export type OptimizationProgress = {
  attemptsCompleted: number;
  bestWastePercent: number;
  bestUsagePercent: number;
  placedPartsCount: number;
  timeLimitMs: number;
  returnedBestSoFar: boolean;
};

export type NoFitPolygonDebug = {
  boundaries: Polygon[];
  collisionZones: Polygon[];
  validPoints: Point[];
};

export type RecoveredBasePartModel = {
  shapeId: string;
  originalPolygons: Polygon[];
  fitGapPolygons: Polygon[];
  offsetDist: number;
  angleParts: Map<number, Polygon>;
};

export type RecoveredNestedPartModel = {
  placementId: string;
  part: NormalizedPart;
  angle: number;
  offset: Point;
  nestedPolygon: Polygon;
  bounds: ReturnType<typeof polygonBoundsSize>;
};

type OptimizationWeights = {
  placed: number;
  unplaced: number;
  waste: number;
  commonLine: number;
  heat: number;
};

export type CutOperation = {
  cutOrder: number;
  placementId: string;
  partId?: string;
  operation: "hole" | "outer";
  x: number;
  y: number;
  size?: number;
  pierceCount?: number;
};

export type NestWarning = {
  severity: NestWarningSeverity;
  message: string;
  payload?: Record<string, unknown>;
};

export type NestingPlan = {
  jobId?: number;
  status: NestingJobStatus;
  material: string;
  thickness: number;
  sheetWidth: number;
  sheetHeight: number;
  kerf: number;
  border: number;
  spacing: number;
  placements: PartPlacement[];
  wastePercentage: number;
  wastePercent: number;
  sheetUsagePercentage: number;
  usagePercent: number;
  estimatedCutLength: number;
  estimatedPierceCount: number;
  estimatedCutTime: number;
  estimatedCutTimeMinutes: number;
  commonLineSavingEstimate: number;
  commonLineSavings: CommonLineSaving[];
  leadIns: LeadIn[];
  microJoins: MicroJoin[];
  cutOrder: CutOperation[];
  heatScore: number;
  heatZones: HeatZone[];
  nfpDebug?: NoFitPolygonDebug;
  optimizationProgress: OptimizationProgress;
  warnings: NestWarning[];
  dxfExportPath: string | null;
  exportReportPath?: string | null;
};

export type CypNestStrategyName = "fast" | "balanced" | "full_fill" | "coedge" | "quality";

export type CypNestProgramInput = {
  workspaceId?: string | null;
  customerName?: string;
  nestName?: string;
  material: string;
  thickness: number;
  parts: NestingEngineInput["parts"];
  plateParam: {
    plateSource?: "custom" | "standard" | "offcut";
    plateWidth?: number;
    plateLength?: number;
    plateAmount?: number;
    standardPlateName?: string;
    standardPlates?: Array<{ name: string; width: number; length: number; amount?: number }>;
  };
  nestParam?: {
    strategyName?: CypNestStrategyName | string;
    nestDirection?: "x" | "y" | "auto";
    gapDist?: number;
    plateGap?: number;
    kerf?: number;
    clearPrevResults?: boolean;
    maxNestLoopCount?: number;
    allowCommonLine?: boolean;
    coedgeMinLength?: number;
    coedgeGap?: number;
    coedgeDifference?: number;
    leadInKind?: LeadInType;
    leadInLength?: number;
    leadOutLength?: number;
    leadSealSize?: number;
    fullFill?: boolean;
  };
};

export type CypNestProgramReport = {
  source: "recovered-cypnest-symbols";
  recoveredModules: string[];
  mappedFeatures: string[];
  strategyName: string;
  plateSource: string;
  plateWidth: number;
  plateLength: number;
  plateAmount: number;
  partsComplete: number;
  totalParts: number;
  resultInfo: {
    usagePercent: number;
    wastePercent: number;
    estimatedCutLength: number;
    estimatedPierceCount: number;
    commonLineSavingEstimate: number;
    heatScore: number;
  };
  dividedPlates: Array<{ x: number; y: number; width: number; height: number; usableArea: number; reason: string }>;
};

export type CypNestProgramResult = {
  plan: NestingPlan;
  report: CypNestProgramReport;
};

type ExpandedPart = {
  id: string;
  part: NormalizedPart;
  width: number;
  height: number;
  rotation: number;
};

type SkylineNode = { x: number; y: number; width: number };
type PartGeometry = { outer: Polygon; holes: Polygon[] };

function round(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function positiveNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function seededShuffle<T>(items: T[], seed: number) {
  const shuffled = [...items];
  const random = seededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function safeExportSegment(value: string) {
  return value.trim().replace(/[^a-z0-9._ -]+/gi, "_").replace(/\s+/g, " ").slice(0, 80) || "Customer";
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeRotationDegrees(value: number) {
  return round((((value % 360) + 360) % 360), 0.001);
}

function uniqueRotations(values: number[]) {
  return values
    .map(normalizeRotationDegrees)
    .filter(Number.isFinite)
    .filter((value, index, list) => index === list.findIndex((entry) => Math.abs(entry - value) < 0.001));
}

function polygonArea(points: Polygon) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    sum += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(sum / 2);
}

function boundsFromPoints(points: Point[]) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function polygonBoundsSize(poly: Point[]) {
  const box = boundsFromPoints(poly);
  return {
    ...box,
    width: box.maxX - box.minX,
    height: box.maxY - box.minY
  };
}

function polygonBoxesOverlap(a: ReturnType<typeof polygonBoundsSize>, b: ReturnType<typeof polygonBoundsSize>, spacing = 0) {
  return !(a.maxX + spacing < b.minX || a.minX - spacing > b.maxX || a.maxY + spacing < b.minY || a.minY - spacing > b.maxY);
}

function pointOnSegment(point: Point, a: Point, b: Point, tolerance = 0.001) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > tolerance) return false;
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  if (dot < -tolerance) return false;
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= lengthSquared + tolerance;
}

function pointInPolygon(point: Point, polygon: Polygon) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if (pointOnSegment(point, a, b)) return true;
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses) {
      const x = ((b.x - a.x) * (point.y - a.y)) / Math.max(1e-9, b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

function segmentIntersects(a1: Point, a2: Point, b1: Point, b2: Point) {
  const direction = (a: Point, b: Point, c: Point) => (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
  const d1 = direction(a1, a2, b1);
  const d2 = direction(a1, a2, b2);
  const d3 = direction(b1, b2, a1);
  const d4 = direction(b1, b2, a2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return pointOnSegment(b1, a1, a2) || pointOnSegment(b2, a1, a2) || pointOnSegment(a1, b1, b2) || pointOnSegment(a2, b1, b2);
}

function segmentProperIntersects(a1: Point, a2: Point, b1: Point, b2: Point) {
  const direction = (a: Point, b: Point, c: Point) => (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
  const d1 = direction(a1, a2, b1);
  const d2 = direction(a1, a2, b2);
  const d3 = direction(b1, b2, a1);
  const d4 = direction(b1, b2, a2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function pointStrictlyInPolygon(point: Point, polygon: Polygon) {
  if (polygonEdges(polygon).some(([a, b]) => pointOnSegment(point, a, b))) return false;
  return pointInPolygon(point, polygon);
}

function distancePointToSegment(point: Point, a: Point, b: Point) {
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (lengthSquared <= 1e-9) return distance(point, a);
  const t = clamp(((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared, 0, 1);
  return distance(point, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
}

function distanceSegmentToSegment(a1: Point, a2: Point, b1: Point, b2: Point) {
  if (segmentIntersects(a1, a2, b1, b2)) return 0;
  return Math.min(distancePointToSegment(a1, b1, b2), distancePointToSegment(a2, b1, b2), distancePointToSegment(b1, a1, a2), distancePointToSegment(b2, a1, a2));
}

function polygonEdges(poly: Polygon) {
  const edges: Array<[Point, Point]> = [];
  for (let index = 0; index < poly.length; index += 1) edges.push([poly[index], poly[(index + 1) % poly.length]]);
  return edges;
}

function polygonsOverlap(a: Polygon, b: Polygon) {
  if (a.length < 3 || b.length < 3) return false;
  if (!polygonBoxesOverlap(polygonBoundsSize(a), polygonBoundsSize(b))) return false;
  for (const [a1, a2] of polygonEdges(a)) {
    for (const [b1, b2] of polygonEdges(b)) {
      if (segmentProperIntersects(a1, a2, b1, b2)) return true;
    }
  }
  if (polygonEdges(a).some(([start, end]) => pointStrictlyInPolygon({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, b))) return true;
  if (polygonEdges(b).some(([start, end]) => pointStrictlyInPolygon({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, a))) return true;
  return (
    a.some((point) => pointStrictlyInPolygon(point, b)) ||
    b.some((point) => pointStrictlyInPolygon(point, a)) ||
    pointStrictlyInPolygon(polygonCentroid(a), b) ||
    pointStrictlyInPolygon(polygonCentroid(b), a)
  );
}

function polygonDistance(a: Polygon, b: Polygon) {
  if (polygonsOverlap(a, b)) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (const [a1, a2] of polygonEdges(a)) {
    for (const [b1, b2] of polygonEdges(b)) minimum = Math.min(minimum, distanceSegmentToSegment(a1, a2, b1, b2));
  }
  return minimum;
}

function polygonsCollideOrTooClose(a: Polygon, b: Polygon, spacing: number) {
  if (!polygonBoxesOverlap(polygonBoundsSize(a), polygonBoundsSize(b), spacing)) return false;
  if (polygonsOverlap(a, b)) return true;
  return spacing > 0 && polygonDistance(a, b) < spacing;
}

function offsetPolygonOutward(poly: Polygon, amount: number) {
  if (amount <= 0 || poly.length < 3) return poly;
  const center = polygonCentroid(poly);
  return poly.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: round(point.x + (dx / length) * amount, 0.01), y: round(point.y + (dy / length) * amount, 0.01) };
  });
}

function offsetPolygonInward(poly: Polygon, amount: number) {
  if (amount <= 0 || poly.length < 3) return poly;
  const center = polygonCentroid(poly);
  return poly.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: round(point.x - (dx / length) * amount, 0.01), y: round(point.y - (dy / length) * amount, 0.01) };
  });
}

function polygonEdgeDistance(a: Polygon, b: Polygon) {
  let minimum = Number.POSITIVE_INFINITY;
  for (const [a1, a2] of polygonEdges(a)) {
    for (const [b1, b2] of polygonEdges(b)) minimum = Math.min(minimum, distanceSegmentToSegment(a1, a2, b1, b2));
  }
  return minimum;
}

function convexHull(points: Point[]) {
  const unique = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: round(point.x, 0.01), y: round(point.y, 0.01) }))
    .filter((point, index, list) => index === list.findIndex((entry) => Math.abs(entry.x - point.x) < 0.01 && Math.abs(entry.y - point.y) < 0.01))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (unique.length <= 2) return unique;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function polygonInsidePolygonWithClearance(inner: Polygon, outer: Polygon, clearance: number) {
  if (inner.length < 3 || outer.length < 3) return false;
  if (!inner.every((point) => pointInPolygon(point, outer))) return false;
  for (const [innerA, innerB] of polygonEdges(inner)) {
    for (const [outerA, outerB] of polygonEdges(outer)) {
      if (segmentProperIntersects(innerA, innerB, outerA, outerB)) return false;
    }
  }
  return clearance <= 0 || polygonEdgeDistance(inner, outer) >= clearance;
}

function transformPolygon(poly: Polygon, x: number, y: number, rotation: number) {
  return movePolygon(normalizePolygon(rotatePolygon(poly, rotation)), x, y);
}

function transformPartGeometry(part: Pick<NormalizedPart, "outerContour" | "holes">, x: number, y: number, rotation: number): PartGeometry {
  const rotatedOuter = rotatePolygon(part.outerContour, rotation);
  const outerBox = boundsFromPoints(rotatedOuter);
  const shift = (polygon: Polygon) => rotatePolygon(polygon, rotation).map((point) => ({
    x: round(point.x - outerBox.minX + x, 0.01),
    y: round(point.y - outerBox.minY + y, 0.01)
  }));
  return {
    outer: shift(part.outerContour),
    holes: part.holes.map((hole) => shift(hole))
  };
}

function transformRawDxfPoint(point: Point, sourceBounds: ReturnType<typeof boundsFromPoints>, placement: PartPlacement) {
  return transformPolygon([{ x: point.x - sourceBounds.minX, y: point.y - sourceBounds.minY }], placement.x, placement.y, placement.rotation)[0];
}

function polygonFitsInsideAnyHole(poly: Polygon, holes: Polygon[], clearance: number) {
  return holes.some((hole) => {
    const usableHole = offsetPolygonInward(hole, clearance);
    return polygonInsidePolygonWithClearance(poly, usableHole, 0);
  });
}

function partHasUnusablePocketMark(part: Pick<NormalizedPart, "originalDxfEntities" | "rawDxf">) {
  const layerMarked = part.originalDxfEntities.some((entity) => /unusable|no[_-]?nest|no[_-]?pocket/i.test(entity.layer));
  return layerMarked || /unusable[_ -]?pocket|no[_ -]?nest|no[_ -]?pocket/i.test(part.rawDxf ?? "");
}

function partHasPrecisionEdgeMark(part: Pick<NormalizedPart, "originalDxfEntities" | "rawDxf">) {
  const layerMarked = part.originalDxfEntities.some((entity) => /precision|no[_-]?tab|no[_-]?micro/i.test(entity.layer));
  return layerMarked || /precision[_ -]?edge|no[_ -]?tab|no[_ -]?micro/i.test(part.rawDxf ?? "");
}

function usableHolePockets(part: NormalizedPart) {
  if (partHasUnusablePocketMark(part)) return [];
  return part.holes.filter((hole) => polygonArea(hole) >= Math.max(400, part.area * 0.04));
}

function placementInsidePocket(placement: PartPlacement, containers: PartPlacement[], clearance: number) {
  const geometry = transformPartGeometry(placement.part, placement.x, placement.y, placement.rotation);
  return containers.find((container) => {
    if (container.id === placement.id || partHasUnusablePocketMark(container.part)) return false;
    const containerGeometry = transformPartGeometry(container.part, container.x, container.y, container.rotation);
    return polygonFitsInsideAnyHole(geometry.outer, containerGeometry.holes, clearance);
  });
}

function partGeometriesCollideOrTooClose(a: PartGeometry, b: PartGeometry, spacing: number) {
  if (!polygonBoxesOverlap(polygonBoundsSize(a.outer), polygonBoundsSize(b.outer), spacing)) return false;
  if (polygonFitsInsideAnyHole(a.outer, b.holes, spacing)) return false;
  if (polygonFitsInsideAnyHole(b.outer, a.holes, spacing)) return false;
  if (spacing <= 0) return polygonsOverlap(a.outer, b.outer);
  const boundaryOffset = spacing / 2;
  const aBoundary = offsetPolygonOutward(a.outer, boundaryOffset);
  const bBoundary = offsetPolygonOutward(b.outer, boundaryOffset);
  return polygonsOverlap(aBoundary, bBoundary) || polygonDistance(aBoundary, bBoundary) <= 0.01;
}

function parseDxfEntities(raw: string): DxfOriginalEntity[] {
  const pairs: Array<[string, string]> = [];
  const lines = raw.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length - 1; i += 2) pairs.push([lines[i].trim(), lines[i + 1].trim()]);
  const entities: DxfOriginalEntity[] = [];
  let section = "";
  let awaitingSection = false;
  let current: DxfOriginalEntity | null = null;
  const flush = () => {
    if (current) entities.push(current);
    current = null;
  };
  for (const [code, value] of pairs) {
    if (code === "0" && value === "SECTION") {
      awaitingSection = true;
      continue;
    }
    if (awaitingSection && code === "2") {
      section = value;
      awaitingSection = false;
      continue;
    }
    if (code === "0" && value === "ENDSEC") {
      flush();
      section = "";
      continue;
    }
    if (section !== "ENTITIES") continue;
    if (code === "0") {
      flush();
      current = { type: value, layer: "0", values: {} };
      continue;
    }
    if (!current) continue;
    if (!current.values[code]) current.values[code] = [];
    current.values[code].push(value);
    if (code === "8") current.layer = value || "0";
  }
  flush();
  return entities;
}

function firstNumber(values: Record<string, string[]>, code: string, fallback = NaN) {
  const value = values[code]?.[0];
  const numeric = value === undefined ? NaN : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function allNumbers(values: Record<string, string[]>, code: string) {
  return (values[code] ?? []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function approximateArc(cx: number, cy: number, radius: number, startDeg: number, endDeg: number) {
  let start = (startDeg * Math.PI) / 180;
  let end = (endDeg * Math.PI) / 180;
  if (end <= start) end += Math.PI * 2;
  const span = end - start;
  const steps = Math.max(8, Math.ceil(span / (Math.PI / 12)));
  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const theta = start + (span * i) / steps;
    points.push({ x: cx + Math.cos(theta) * radius, y: cy + Math.sin(theta) * radius });
  }
  return points;
}

function segmentsFromDxf(raw: string) {
  const entities = parseDxfEntities(raw);
  const segments: Segment[] = [];
  let activePolyline: { closed: boolean; points: Point[] } | null = null;
  const push = (x1: number, y1: number, x2: number, y2: number, kind: Segment["kind"] = "line") => {
    if ([x1, y1, x2, y2].every((value) => Number.isFinite(value))) segments.push({ x1, y1, x2, y2, kind });
  };
  const flushPolyline = () => {
    if (!activePolyline) return;
    for (let i = 0; i < activePolyline.points.length - 1; i += 1) {
      const a = activePolyline.points[i];
      const b = activePolyline.points[i + 1];
      push(a.x, a.y, b.x, b.y);
    }
    if (activePolyline.closed && activePolyline.points.length > 2) {
      const first = activePolyline.points[0];
      const last = activePolyline.points[activePolyline.points.length - 1];
      push(last.x, last.y, first.x, first.y);
    }
    activePolyline = null;
  };
  for (const entity of entities) {
    if (entity.type !== "VERTEX" && entity.type !== "SEQEND" && activePolyline) flushPolyline();
    if (entity.type === "LINE") {
      push(firstNumber(entity.values, "10"), firstNumber(entity.values, "20"), firstNumber(entity.values, "11"), firstNumber(entity.values, "21"));
    } else if (entity.type === "LWPOLYLINE") {
      const xs = allNumbers(entity.values, "10");
      const ys = allNumbers(entity.values, "20");
      const count = Math.min(xs.length, ys.length);
      for (let i = 0; i < count - 1; i += 1) push(xs[i], ys[i], xs[i + 1], ys[i + 1]);
      if ((firstNumber(entity.values, "70", 0) & 1) === 1 && count > 2) push(xs[count - 1], ys[count - 1], xs[0], ys[0]);
    } else if (entity.type === "POLYLINE") {
      activePolyline = { closed: (firstNumber(entity.values, "70", 0) & 1) === 1, points: [] };
    } else if (entity.type === "VERTEX" && activePolyline) {
      activePolyline.points.push({ x: firstNumber(entity.values, "10"), y: firstNumber(entity.values, "20") });
    } else if (entity.type === "SEQEND") {
      flushPolyline();
    } else if (entity.type === "CIRCLE") {
      const cx = firstNumber(entity.values, "10");
      const cy = firstNumber(entity.values, "20");
      const radius = firstNumber(entity.values, "40");
      const points = approximateArc(cx, cy, radius, 0, 360);
      for (let i = 0; i < points.length - 1; i += 1) push(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, "circle");
    } else if (entity.type === "ARC") {
      const points = approximateArc(
        firstNumber(entity.values, "10"),
        firstNumber(entity.values, "20"),
        firstNumber(entity.values, "40"),
        firstNumber(entity.values, "50", 0),
        firstNumber(entity.values, "51", 0)
      );
      for (let i = 0; i < points.length - 1; i += 1) push(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, "arc");
    }
  }
  flushPolyline();
  return segments;
}

function simplifyPolygon(points: Polygon, tolerance = 0.25): Polygon {
  if (points.length <= 12) return points;
  const simplified = points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1];
    const next = points[(index + 1) % points.length];
    return distancePointToSegment(point, previous, next) > tolerance;
  });
  return simplified.length >= 3 ? simplified : points;
}

function polygonCentroid(points: Polygon) {
  if (!points.length) return { x: 0, y: 0 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function extractDxfGeometry(rawDxf: string, fallbackWidth = 100, fallbackHeight = 100): DxfGeometryPreview {
  const originalEntities = parseDxfEntities(rawDxf).filter((entity) => ["LINE", "ARC", "CIRCLE", "LWPOLYLINE", "POLYLINE", "VERTEX", "SEQEND"].includes(entity.type));
  const segments = segmentsFromDxf(rawDxf);
  const allPoints = segments.flatMap((segment) => [{ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }]);
  const bounds = allPoints.length ? boundsFromPoints(allPoints) : { minX: 0, minY: 0, maxX: fallbackWidth, maxY: fallbackHeight };
  const width = Math.max(1, round(bounds.maxX - bounds.minX, 0.01));
  const height = Math.max(1, round(bounds.maxY - bounds.minY, 0.01));
  const shiftedSegments = segments.map((segment) => ({
    ...segment,
    x1: round(segment.x1 - bounds.minX, 0.01),
    y1: round(segment.y1 - bounds.minY, 0.01),
    x2: round(segment.x2 - bounds.minX, 0.01),
    y2: round(segment.y2 - bounds.minY, 0.01)
  }));
  const contours = splitContours(shiftedSegments)
    .map((contour) => ({ contour, polygon: contourToPoints(contour), closed: contourIsClosed(contour) }))
    .filter((entry) => entry.polygon.length >= 3)
    .sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon));
  const outerContour = contours[0]?.polygon.length ? contours[0].polygon : defaultRectangle(width, height);
  const holes = contours
    .slice(1)
    .filter((entry) => entry.closed)
    .map((entry) => entry.polygon)
    .filter((polygon) => polygonArea(polygon) > 0.01 && pointInPolygon(polygonCentroid(polygon), outerContour));
  return {
    width,
    height,
    outerContour,
    holes,
    simplifiedPolygon: simplifyPolygon(outerContour),
    segments: shiftedSegments,
    originalEntities
  };
}

function splitContours(segments: Segment[]) {
  const key = (x: number, y: number) => `${round(x, 0.05).toFixed(2)},${round(y, 0.05).toFixed(2)}`;
  const endpointMap = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    for (const pointKey of [key(segment.x1, segment.y1), key(segment.x2, segment.y2)]) {
      const list = endpointMap.get(pointKey) ?? [];
      list.push(index);
      endpointMap.set(pointKey, list);
    }
  });
  const visited = new Array(segments.length).fill(false);
  const contours: Segment[][] = [];
  for (let index = 0; index < segments.length; index += 1) {
    if (visited[index]) continue;
    const queue = [index];
    const contour: Segment[] = [];
    visited[index] = true;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const segment = segments[current];
      contour.push(segment);
      for (const pointKey of [key(segment.x1, segment.y1), key(segment.x2, segment.y2)]) {
        for (const next of endpointMap.get(pointKey) ?? []) {
          if (!visited[next]) {
            visited[next] = true;
            queue.push(next);
          }
        }
      }
    }
    contours.push(contour);
  }
  return contours;
}

function contourToPoints(contour: Segment[]) {
  if (!contour.length) return [];
  const samePoint = (a: Point, b: Point) => distance(a, b) <= 0.05;
  const remaining = contour.map((segment) => ({
    start: { x: segment.x1, y: segment.y1 },
    end: { x: segment.x2, y: segment.y2 }
  }));
  const first = remaining.shift();
  if (!first) return [];
  const points: Point[] = [first.start, first.end];
  let current = first.end;
  while (remaining.length) {
    const nextIndex = remaining.findIndex((segment) => samePoint(segment.start, current) || samePoint(segment.end, current));
    if (nextIndex < 0) break;
    const [next] = remaining.splice(nextIndex, 1);
    current = samePoint(next.start, current) ? next.end : next.start;
    if (!samePoint(current, points[0])) points.push(current);
  }
  if (points.length >= 3) return points;
  const fallback = contour.flatMap((segment) => [{ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }]);
  return convexHull(fallback);
}

function contourIsClosed(contour: Segment[]) {
  if (!contour.length) return false;
  const samePoint = (a: Point, b: Point) => distance(a, b) <= 0.05;
  const counts = new Map<string, number>();
  const key = (point: Point) => `${round(point.x, 0.05).toFixed(2)},${round(point.y, 0.05).toFixed(2)}`;
  for (const segment of contour) {
    for (const point of [{ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }]) counts.set(key(point), (counts.get(key(point)) ?? 0) + 1);
  }
  if ([...counts.values()].every((count) => count >= 2)) return true;
  const first = { x: contour[0].x1, y: contour[0].y1 };
  const last = { x: contour[contour.length - 1].x2, y: contour[contour.length - 1].y2 };
  return samePoint(first, last);
}

function defaultRectangle(width: number, height: number): Polygon {
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
}

export class GeometryNormalizer {
  normalize(input: {
    itemId: number;
    jobId?: string | number | null;
    quoteId?: string | null;
    partDnaId?: number | null;
    dxfFileId?: string | null;
    dxfPath?: string | null;
    rawDxf?: string | null;
    quantity: number;
    width?: number;
    height?: number;
    cutLength?: number;
    pierceCount?: number;
  }): NormalizedPart {
    const rawDxf = input.rawDxf ?? (input.dxfPath && fs.existsSync(input.dxfPath) ? fs.readFileSync(input.dxfPath, "utf8") : null);
    const dxfGeometry = rawDxf ? extractDxfGeometry(rawDxf, Number(input.width ?? 100), Number(input.height ?? 100)) : null;
    const shiftedSegments = dxfGeometry?.segments ?? [];
    const width = Math.max(1, Number(input.width) || dxfGeometry?.width || 100);
    const height = Math.max(1, Number(input.height) || dxfGeometry?.height || 100);
    const outerContour = dxfGeometry?.outerContour.length ? dxfGeometry.outerContour : defaultRectangle(width, height);
    const holes = dxfGeometry?.holes ?? [];
    const cutLength = Number.isFinite(input.cutLength)
      ? Number(input.cutLength)
      : round(shiftedSegments.reduce((sum, segment) => sum + Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1), 0), 0.01);
    const pierceCount = Number.isFinite(input.pierceCount) ? Number(input.pierceCount) : Math.max(1, 1 + holes.length);
    return {
      itemId: input.itemId,
      jobId: input.jobId === null || input.jobId === undefined ? null : String(input.jobId),
      quoteId: input.quoteId ?? null,
      partDnaId: input.partDnaId ?? null,
      dxfFileId: input.dxfFileId ?? null,
      quantity: Math.max(1, Math.round(Number(input.quantity) || 1)),
      width,
      height,
      area: round(polygonArea(outerContour) || width * height, 0.01),
      cutLength: Math.max(0, cutLength || width * 2 + height * 2),
      pierceCount: Math.max(1, Math.round(pierceCount)),
      holeCount: holes.length,
      outerContour,
      holes,
      simplifiedPolygon: dxfGeometry?.simplifiedPolygon ?? outerContour,
      segments: shiftedSegments,
      originalDxfEntities: dxfGeometry?.originalEntities ?? [],
      rawDxf
    };
  }
}

export class NoFitPolygonService {
  private readonly cache = new Map<string, { boundary: Polygon; collisionZone: Polygon; validPoints: Point[] }>();

  generate(placedPolygon: Polygon, candidatePolygon: Polygon, spacing: number) {
    const cacheKey = this.cacheKey(placedPolygon, candidatePolygon, spacing);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const clearance = Math.max(0, spacing);
    const collisionZone = offsetPolygonOutward(placedPolygon, clearance);
    const placedPoints = this.edgeSamples(collisionZone);
    const candidatePoints = this.edgeSamples(candidatePolygon);
    const origins: Point[] = [];
    for (const placedPoint of placedPoints) {
      for (const candidatePoint of candidatePoints) {
        origins.push({ x: placedPoint.x - candidatePoint.x, y: placedPoint.y - candidatePoint.y });
      }
    }
    const boundary = convexHull(origins);
    const validPoints = [
      ...origins,
      ...polygonEdges(boundary).map(([start, end]) => ({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }))
    ];
    const result = {
      boundary,
      collisionZone,
      validPoints: this.uniquePoints(validPoints)
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  generateCandidates(placements: PartPlacement[], candidatePolygon: Polygon, spacing: number) {
    const debug: NoFitPolygonDebug = { boundaries: [], collisionZones: [], validPoints: [] };
    const points: Point[] = [];
    const sourcePlacements = placements.length > 20 ? placements.slice(-12) : placements;
    for (const placement of sourcePlacements) {
      const result = this.generate(transformPartGeometry(placement.part, placement.x, placement.y, placement.rotation).outer, candidatePolygon, spacing);
      debug.boundaries.push(result.boundary);
      debug.collisionZones.push(result.collisionZone);
      debug.validPoints.push(...result.validPoints);
      points.push(...result.validPoints);
    }
    debug.validPoints = this.uniquePoints(debug.validPoints).slice(0, 1000);
    return { points: this.uniquePoints(points), debug };
  }

  private edgeSamples(poly: Polygon) {
    return polygonEdges(poly).flatMap(([start, end]) => [
      start,
      { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      end
    ]);
  }

  private uniquePoints(points: Point[]) {
    return points
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => ({ x: round(point.x, 0.1), y: round(point.y, 0.1) }))
      .filter((point, index, list) => index === list.findIndex((candidate) => Math.abs(candidate.x - point.x) < 0.1 && Math.abs(candidate.y - point.y) < 0.1));
  }

  private cacheKey(placedPolygon: Polygon, candidatePolygon: Polygon, spacing: number) {
    const shapeKey = (poly: Polygon) => poly.map((point) => `${round(point.x, 0.1)},${round(point.y, 0.1)}`).join(";");
    return `${round(spacing, 0.01)}|${shapeKey(placedPolygon)}|${shapeKey(candidatePolygon)}`;
  }
}

export class RecoveredNestModelService {
  createBasePart(part: NormalizedPart, fitGap: number): RecoveredBasePartModel {
    return {
      shapeId: String(part.itemId),
      originalPolygons: [part.outerContour, ...part.holes],
      fitGapPolygons: [offsetPolygonOutward(part.outerContour, Math.max(0, fitGap)), ...part.holes.map((hole) => offsetPolygonInward(hole, Math.max(0, fitGap)))],
      offsetDist: Math.max(0, fitGap),
      angleParts: new Map()
    };
  }

  getAnglePart(model: RecoveredBasePartModel, angle: number) {
    const normalized = normalizeRotationDegrees(angle);
    const cached = model.angleParts.get(normalized);
    if (cached) return cached;
    const rotated = normalizePolygon(rotatePolygon(model.fitGapPolygons[0] ?? [], normalized));
    model.angleParts.set(normalized, rotated);
    return rotated;
  }
}

export class RecoveredBasePlateModel {
  private readonly nestedParts: RecoveredNestedPartModel[] = [];

  constructor(private readonly sheetWidth: number, private readonly sheetHeight: number, private readonly border: number) {}

  addPlacement(placement: PartPlacement) {
    const nestedPolygon = transformPartGeometry(placement.part, placement.x, placement.y, placement.rotation).outer;
    this.nestedParts.push({
      placementId: placement.id,
      part: placement.part,
      angle: placement.rotation,
      offset: { x: placement.x, y: placement.y },
      nestedPolygon,
      bounds: polygonBoundsSize(nestedPolygon)
    });
  }

  getNestedPartsByBoundbox(box: ReturnType<typeof polygonBoundsSize>, fitGap = 0) {
    return this.nestedParts.filter((part) => polygonBoxesOverlap(part.bounds, box, fitGap));
  }

  getSurroundingPlacements(poly: Polygon, fitGap = 0) {
    return this.getNestedPartsByBoundbox(polygonBoundsSize(poly), fitGap);
  }

  getNestedPartsOutsidePlate() {
    const usable = {
      minX: this.border,
      minY: this.border,
      maxX: this.sheetWidth - this.border,
      maxY: this.sheetHeight - this.border
    };
    return this.nestedParts.filter((part) => part.nestedPolygon.some((point) => point.x < usable.minX || point.y < usable.minY || point.x > usable.maxX || point.y > usable.maxY));
  }

  calcRemainArea() {
    const sheetArea = Math.max(1, (this.sheetWidth - this.border * 2) * (this.sheetHeight - this.border * 2));
    const usedArea = this.nestedParts.reduce((sum, part) => sum + polygonArea(part.nestedPolygon), 0);
    return Math.max(0, sheetArea - usedArea);
  }

  getBaseNestedPartsForNFP() {
    return [...this.nestedParts];
  }
}

export type RecoveredNestPath = "rectangle" | "circle" | "polygon";

export class RecoveredNestingStrategyService {
  readonly capabilities = {
    nfp: "Nfp@TNFPCalculator / Nfpalgorithmset@TNFP",
    angleCandidates: "Autonestalgo@CalcRotationCandidates / TAngleSet",
    rectangleNest: "Urectnest@TRectangleNest / TRectNestSmart",
    circleNest: "Ucirclenest@TMaxCirclePacking",
    arrayNest: "Arrayinfo@TArrayInfoAlgo@CalcArrayTransX/Y",
    commonEdge: "Coedgemodel@TAutoCoedgeInfoPack"
  };

  classifyPart(part: Pick<NormalizedPart, "outerContour" | "segments" | "width" | "height">): RecoveredNestPath {
    const circleSegments = part.segments.filter((segment) => segment.kind === "circle").length;
    if (circleSegments >= Math.max(8, part.segments.length * 0.65)) return "circle";
    const box = polygonBoundsSize(part.outerContour);
    const rectangleLike = part.outerContour.length === 4 && Math.abs(box.width - part.width) < 0.5 && Math.abs(box.height - part.height) < 0.5;
    return rectangleLike ? "rectangle" : "polygon";
  }

  rotationCandidates(parts: Array<Pick<NormalizedPart, "outerContour" | "segments" | "width" | "height">>, requested?: number[], angleStepDegrees?: number) {
    const base = requested?.length ? requested : [0, 90, 180, 270];
    const step = Number(angleStepDegrees);
    const candidates = [...base];
    if (Number.isFinite(step) && step > 0 && step < 90) {
      for (let angle = 0; angle < 360; angle += step) candidates.push(angle);
    }
    for (const part of parts) {
      if (this.classifyPart(part) !== "polygon") continue;
      for (const [start, end] of polygonEdges(part.outerContour)) {
        if (distance(start, end) < 10) continue;
        const edgeAngle = normalizeRotationDegrees((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI);
        const alignToAxis = normalizeRotationDegrees(360 - edgeAngle);
        if (requested?.length || (Number.isFinite(step) && step < 90)) {
          candidates.push(alignToAxis, normalizeRotationDegrees(alignToAxis + 90), normalizeRotationDegrees(alignToAxis + 180), normalizeRotationDegrees(alignToAxis + 270));
        }
      }
    }
    return uniqueRotations(candidates).slice(0, 32);
  }
}

export class SheetPackingService {
  constructor(
    private readonly noFitPolygonService = new NoFitPolygonService(),
    private readonly recoveredStrategy = new RecoveredNestingStrategyService()
  ) {}

  pack(parts: NormalizedPart[], input: NestingEngineInput): PartPlacement[] {
    const allowedRotations = this.recoveredStrategy.rotationCandidates(parts, input.allowedRotations, input.angleStepDegrees);
    const expanded = parts.flatMap((part) => {
      const result: ExpandedPart[] = [];
      for (let index = 0; index < part.quantity; index += 1) {
        result.push({ id: `${part.itemId}-${index}`, part, width: part.width, height: part.height, rotation: 0 });
      }
      return result;
    }).sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.width * b.height - a.width * a.height);
    const usableWidth = Math.max(1, input.sheetWidth - input.border * 2);
    const usableHeight = Math.max(1, input.sheetHeight - input.border * 2);
    const sheetArea = Math.max(1, usableWidth * usableHeight);
    let best: PartPlacement[] = [];
    const started = Date.now();
    const maxMs = clamp(Number(input.maxOptimizationMs) || 1500, 100, 10_000);
    const orders = [
      expanded,
      [...expanded].sort((a, b) => b.height - a.height || b.width - a.width),
      [...expanded].sort((a, b) => b.part.cutLength - a.part.cutLength)
    ];
    for (const ordered of orders) {
      if (Date.now() - started > maxMs) break;
      const placed = this.packOrder(ordered, allowedRotations, usableWidth, usableHeight, input);
      const placedArea = placed.reduce((sum, placement) => sum + placement.part.area, 0);
      const bestArea = best.reduce((sum, placement) => sum + placement.part.area, 0);
      if (placed.length > best.length || (placed.length === best.length && placedArea / sheetArea > bestArea / sheetArea)) best = placed;
    }
    return best;
  }

  private packOrder(parts: ExpandedPart[], rotations: number[], usableWidth: number, usableHeight: number, input: NestingEngineInput) {
    const placements: PartPlacement[] = [];
    const plateModel = new RecoveredBasePlateModel(input.sheetWidth, input.sheetHeight, input.border);
    const spacing = Math.max(0, input.spacing + input.kerf);
    const started = Date.now();
    const maxMs = clamp(Number(input.maxOptimizationMs) || 1500, 50, 10_000);
    for (const part of parts) {
      if (Date.now() - started > maxMs) break;
      let best: { x: number; y: number; width: number; height: number; rotation: number; polygon: Polygon; score: number } | null = null;
      for (const rotation of rotations) {
        const localPolygon = normalizePolygon(rotatePolygon(part.part.outerContour, rotation));
        for (const point of this.candidatePoints(placements, input, localPolygon)) {
          const x = round(point.x, 0.1);
          const y = round(point.y, 0.1);
          const geometry = transformPartGeometry(part.part, x, y, rotation);
          if (!this.insideUsableSheet(geometry.outer, input)) continue;
          const surrounding = plateModel.getSurroundingPlacements(geometry.outer, spacing);
          if (surrounding.some((placement) => partGeometriesCollideOrTooClose(geometry, transformPartGeometry(placement.part, placement.offset.x, placement.offset.y, placement.angle), spacing))) continue;
          const box = polygonBoundsSize(geometry.outer);
          const boundingWaste = Math.max(0, box.width * box.height - part.part.area);
          const travel = placements.length ? Math.min(...placements.map((placement) => distance({ x, y }, { x: placement.x, y: placement.y }))) : 0;
          const envelope = placements.length > 20 ? box : this.layoutEnvelope([...placements.map((placement) => this.placementPolygon(placement)), geometry.outer]);
          const envelopeWaste = placements.length > 20 ? 0 : Math.max(0, envelope.width * envelope.height - placements.reduce((sum, placement) => sum + placement.part.area, 0) - part.part.area);
          const contactScore = placements.reduce((sum, placement) => {
            const clearance = polygonDistance(geometry.outer, this.placementPolygon(placement));
            return sum + (clearance <= Math.max(0.01, spacing + 0.05) ? 1 : 0);
          }, 0);
          const score = envelopeWaste * 2 + envelope.height * 100 + envelope.width * 20 + box.minY * 10 + box.minX + boundingWaste * 0.2 + travel * 0.05 - contactScore * 25;
          if (!best || score < best.score) best = { x, y, width: box.width, height: box.height, rotation, polygon: geometry.outer, score };
        }
      }
      if (!best) continue;
      const box = polygonBoundsSize(best.polygon);
      const placement = {
        id: part.id,
        nestingItemId: part.part.itemId,
        sheetIndex: 0,
        x: round(box.minX, 0.1),
        y: round(box.minY, 0.1),
        width: round(box.width, 0.1),
        height: round(box.height, 0.1),
        rotation: best.rotation,
        mirrored: false,
        isCommonLine: false,
        part: part.part
      };
      placements.push(placement);
      plateModel.addPlacement(placement);
    }
    return placements;
  }

  private placementPolygon(placement: PartPlacement) {
    return transformPartGeometry(placement.part, placement.x, placement.y, placement.rotation).outer;
  }

  private placementGeometry(placement: PartPlacement) {
    return transformPartGeometry(placement.part, placement.x, placement.y, placement.rotation);
  }

  private insideUsableSheet(poly: Polygon, input: NestingEngineInput) {
    const tolerance = 0.001;
    const minX = input.border;
    const minY = input.border;
    const maxX = input.sheetWidth - input.border;
    const maxY = input.sheetHeight - input.border;
    return poly.every((point) => point.x >= minX - tolerance && point.y >= minY - tolerance && point.x <= maxX + tolerance && point.y <= maxY + tolerance);
  }

  private candidatePoints(placements: PartPlacement[], input: NestingEngineInput, partPolygon: Polygon) {
    const partBox = polygonBoundsSize(partPolygon);
    const partWidth = partBox.width;
    const partHeight = partBox.height;
    const maxX = input.sheetWidth - input.border - partWidth;
    const maxY = input.sheetHeight - input.border - partHeight;
    const points: Point[] = [
      { x: input.border, y: input.border },
      { x: maxX, y: input.border },
      { x: input.border, y: maxY },
      { x: maxX, y: maxY }
    ];
    const spacing = Math.max(0, input.spacing + input.kerf);
    const boxes: Array<ReturnType<typeof polygonBoundsSize>> = [];
    const largeNest = placements.length > 20;
    const detailedPlacements = new Set((largeNest ? placements.slice(-12) : placements).map((placement) => placement.id));
    const nfpCandidates = this.noFitPolygonService.generateCandidates(placements, partPolygon, spacing);
    points.push(...nfpCandidates.points);
    const partVertices = partPolygon;
    const partEdgePoints = polygonEdges(partPolygon).flatMap(([start, end]) => [
      start,
      { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      end
    ]);
    for (const placement of placements) {
      const polygon = this.placementPolygon(placement);
      const box = polygonBoundsSize(polygon);
      boxes.push(box);
      points.push(
        { x: box.maxX + spacing, y: box.minY },
        { x: box.minX, y: box.maxY + spacing },
        { x: box.maxX + spacing, y: box.maxY + spacing },
        { x: input.border, y: box.maxY + spacing },
        { x: box.maxX + spacing, y: input.border }
      );
      if (!detailedPlacements.has(placement.id)) continue;
      for (const point of polygon) {
        points.push(
          { x: point.x + spacing, y: box.minY },
          { x: box.minX, y: point.y + spacing },
          { x: point.x + spacing, y: point.y },
          { x: point.x, y: point.y + spacing },
          { x: point.x + spacing, y: point.y + spacing }
        );
        for (const vertex of partVertices) {
          points.push(
            { x: point.x - vertex.x + spacing, y: point.y - vertex.y },
            { x: point.x - vertex.x - spacing, y: point.y - vertex.y },
            { x: point.x - vertex.x, y: point.y - vertex.y + spacing },
            { x: point.x - vertex.x, y: point.y - vertex.y - spacing }
          );
        }
      }
      for (const [edgeStart, edgeEnd] of polygonEdges(polygon)) {
        const edgeBox = polygonBoundsSize([edgeStart, edgeEnd]);
        const midpoint = { x: (edgeStart.x + edgeEnd.x) / 2, y: (edgeStart.y + edgeEnd.y) / 2 };
        points.push(
          { x: edgeBox.maxX + spacing, y: edgeBox.minY },
          { x: edgeBox.minX, y: edgeBox.maxY + spacing },
          { x: midpoint.x + spacing, y: midpoint.y },
          { x: midpoint.x, y: midpoint.y + spacing }
        );
        for (const edgePoint of partEdgePoints) {
          points.push(
            { x: midpoint.x - edgePoint.x + spacing, y: midpoint.y - edgePoint.y },
            { x: midpoint.x - edgePoint.x - spacing, y: midpoint.y - edgePoint.y },
            { x: midpoint.x - edgePoint.x, y: midpoint.y - edgePoint.y + spacing },
            { x: midpoint.x - edgePoint.x, y: midpoint.y - edgePoint.y - spacing }
          );
        }
      }
      const placedHoles = partHasUnusablePocketMark(placement.part)
        ? []
        : this.placementGeometry(placement).holes.filter((hole) => polygonArea(hole) >= Math.max(400, placement.part.area * 0.04));
      for (const placedHole of placedHoles) {
        const holeBox = polygonBoundsSize(placedHole);
        if (holeBox.width < partWidth + spacing * 2 || holeBox.height < partHeight + spacing * 2) continue;
        points.push(
          { x: holeBox.minX + spacing, y: holeBox.minY + spacing },
          { x: holeBox.maxX - partWidth - spacing, y: holeBox.minY + spacing },
          { x: holeBox.minX + spacing, y: holeBox.maxY - partHeight - spacing },
          { x: holeBox.maxX - partWidth - spacing, y: holeBox.maxY - partHeight - spacing }
        );
        for (const point of placedHole) {
          points.push({ x: point.x + spacing, y: point.y + spacing });
        }
      }
    }
    const recentBoxes = boxes.slice(-(largeNest ? 10 : 24));
    for (const left of recentBoxes) {
      for (const lower of recentBoxes) {
        if (left === lower) continue;
        const pocketA = { x: left.maxX + spacing, y: lower.maxY + spacing };
        const pocketB = { x: lower.maxX + spacing, y: left.maxY + spacing };
        if (pocketA.x <= maxX && pocketA.y <= maxY) points.push(pocketA);
        if (pocketB.x <= maxX && pocketB.y <= maxY) points.push(pocketB);
      }
      points.push(
        { x: left.maxX + spacing, y: Math.max(input.border, left.minY - partHeight - spacing) },
        { x: Math.max(input.border, left.minX - partWidth - spacing), y: left.maxY + spacing }
      );
    }
    return points
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => ({ x: clamp(point.x, input.border, Math.max(input.border, maxX)), y: clamp(point.y, input.border, Math.max(input.border, maxY)) }))
      .filter((point, index, list) => index === list.findIndex((candidate) => Math.abs(candidate.x - point.x) < 0.1 && Math.abs(candidate.y - point.y) < 0.1))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .slice(0, largeNest ? 80 : 900);
  }

  private layoutEnvelope(polygons: Polygon[]) {
    return polygonBoundsSize(polygons.flat());
  }

  private fitAtNode(nodes: SkylineNode[], index: number, width: number, height: number, sheetHeight: number) {
    const x = nodes[index].x;
    let y = nodes[index].y;
    let widthLeft = width;
    for (let cursor = index; cursor < nodes.length && widthLeft > 0; cursor += 1) {
      y = Math.max(y, nodes[cursor].y);
      if (y + height > sheetHeight) return null;
      widthLeft -= nodes[cursor].width;
    }
    return widthLeft <= 0 ? y : null;
  }

  private addSkylineNode(nodes: SkylineNode[], index: number, node: SkylineNode) {
    nodes.splice(index, 0, node);
    for (let cursor = index + 1; cursor < nodes.length; cursor += 1) {
      const previous = nodes[cursor - 1];
      const current = nodes[cursor];
      if (current.x < previous.x + previous.width) {
        const shrink = previous.x + previous.width - current.x;
        current.x += shrink;
        current.width -= shrink;
        if (current.width <= 0) {
          nodes.splice(cursor, 1);
          cursor -= 1;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    for (let cursor = 0; cursor < nodes.length - 1; cursor += 1) {
      if (Math.abs(nodes[cursor].y - nodes[cursor + 1].y) < 0.001) {
        nodes[cursor].width += nodes[cursor + 1].width;
        nodes.splice(cursor + 1, 1);
        cursor -= 1;
      }
    }
  }
}

export class PartPlacementService {
  constructor(private readonly sheetPacking = new SheetPackingService()) {}
  place(parts: NormalizedPart[], input: NestingEngineInput) {
    return this.sheetPacking.pack(parts, input);
  }
}

export class NestingOptimizerService {
  constructor(
    private readonly placementService = new PartPlacementService(),
    private readonly commonLineService = new CommonLineService(),
    private readonly heatAnalysisService = new HeatAnalysisService(),
    private readonly recoveredStrategy = new RecoveredNestingStrategyService()
  ) {}

  optimize(parts: NormalizedPart[], input: NestingEngineInput) {
    const started = Date.now();
    const maxMs = clamp(Number(input.maxOptimizationMs) || 10_000, 250, 60_000);
    const rotationPasses = this.rotationPasses(parts, input.allowedRotations, input.angleStepDegrees);
    const weightPasses = this.weightPasses();
    let attemptsCompleted = 0;
    let best: { placements: PartPlacement[]; heat: HeatAnalysis; commonLineSavings: CommonLineSaving[]; score: number; usagePercent: number; wastePercent: number } | null = null;
    for (let attempt = 0; Date.now() - started < maxMs && attempt < 128; attempt += 1) {
      const attemptInput = {
        ...input,
        allowedRotations: rotationPasses[attempt % rotationPasses.length],
        maxOptimizationMs: Math.max(75, Math.floor((maxMs - (Date.now() - started)) / Math.max(1, Math.min(10, rotationPasses.length * weightPasses.length))))
      };
      const weights = weightPasses[attempt % weightPasses.length];
      const attemptParts = this.orderParts(parts, attempt);
      const placements = this.placementService.place(attemptParts, attemptInput);
      const heat = this.heatAnalysisService.analyze(placements, attemptInput);
      const commonLineSavings = this.commonLineService.detect(placements, attemptInput);
      const usagePercent = this.usagePercent(placements, input);
      const wastePercent = round(100 - usagePercent, 0.01);
      const score = this.score(placements, parts, wastePercent, commonLineSavings, heat, weights);
      attemptsCompleted += 1;
      if (!best || score > best.score) best = { placements, heat, commonLineSavings, score, usagePercent, wastePercent };
    }
    const fallback = best ?? { placements: [], heat: { heatScore: 0, heatZones: [], warnings: [] }, commonLineSavings: [], score: 0, usagePercent: 0, wastePercent: 100 };
    return {
      ...fallback,
      progress: {
        attemptsCompleted,
        bestWastePercent: fallback.wastePercent,
        bestUsagePercent: fallback.usagePercent,
        placedPartsCount: fallback.placements.length,
        timeLimitMs: maxMs,
        returnedBestSoFar: Date.now() - started >= maxMs
      } satisfies OptimizationProgress
    };
  }

  private rotationPasses(parts: NormalizedPart[], rotations?: number[], angleStepDegrees?: number) {
    const allowed = this.recoveredStrategy.rotationCandidates(parts, rotations, angleStepDegrees);
    return [
      allowed,
      [...allowed].reverse(),
      [90, 0, 270, 180].filter((rotation) => allowed.includes(rotation)),
      [0, 180, 90, 270].filter((rotation) => allowed.includes(rotation))
    ].filter((pass) => pass.length);
  }

  private weightPasses(): OptimizationWeights[] {
    return [
      { placed: 10_000, unplaced: 25_000, waste: 120, commonLine: 2, heat: 55 },
      { placed: 12_000, unplaced: 35_000, waste: 90, commonLine: 1, heat: 40 },
      { placed: 9_000, unplaced: 22_000, waste: 180, commonLine: 4, heat: 50 },
      { placed: 9_500, unplaced: 24_000, waste: 110, commonLine: 2, heat: 90 }
    ];
  }

  private orderParts(parts: NormalizedPart[], attempt: number) {
    const ordered = [...parts];
    if (attempt >= 4) return seededShuffle(ordered, 10_000 + attempt);
    if (attempt % 4 === 1) return ordered.sort((a, b) => b.height - a.height || b.width - a.width);
    if (attempt % 4 === 2) return ordered.sort((a, b) => b.cutLength - a.cutLength || b.pierceCount - a.pierceCount);
    if (attempt % 4 === 3) return ordered.sort((a, b) => b.pierceCount - a.pierceCount || b.area - a.area);
    return ordered.sort((a, b) => b.area - a.area || Math.max(b.width, b.height) - Math.max(a.width, a.height));
  }

  private usagePercent(placements: PartPlacement[], input: NestingEngineInput) {
    const usedArea = placements.reduce((sum, placement) => sum + placement.part.area, 0);
    return round((usedArea / Math.max(1, input.sheetWidth * input.sheetHeight)) * 100, 0.01);
  }

  private score(placements: PartPlacement[], parts: NormalizedPart[], wastePercent: number, commonLineSavings: CommonLineSaving[], heat: HeatAnalysis, weights: OptimizationWeights) {
    const requested = parts.reduce((sum, part) => sum + part.quantity, 0);
    const unplaced = Math.max(0, requested - placements.length);
    const commonLineSaved = commonLineSavings.reduce((sum, saving) => sum + saving.cutLengthSaved, 0);
    return placements.length * weights.placed - unplaced * weights.unplaced - wastePercent * weights.waste + commonLineSaved * weights.commonLine - heat.heatScore * weights.heat;
  }
}

export class CommonLineService {
  detect(placements: PartPlacement[], input: NestingEngineInput) {
    if (!(input.allowCommonLine ?? input.allowCommonLineCutting) || input.customerToleranceAllowsCommonLine === false) return [];
    const tolerance = Math.max(0.05, input.kerf + 0.05);
    const savings: CommonLineSaving[] = [];
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const a = placements[i];
        const b = placements[j];
        const verticalTouch = Math.abs(a.x + a.width - b.x) <= tolerance || Math.abs(b.x + b.width - a.x) <= tolerance;
        const horizontalOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        const horizontalTouch = Math.abs(a.y + a.height - b.y) <= tolerance || Math.abs(b.y + b.height - a.y) <= tolerance;
        const verticalOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const length = verticalTouch ? horizontalOverlap : horizontalTouch ? verticalOverlap : 0;
        if (length <= Math.max(5, input.thickness * 4)) continue;
        if (!this.hasStraightCompatibleEdge(a) || !this.hasStraightCompatibleEdge(b)) continue;
        a.isCommonLine = true;
        b.isCommonLine = true;
        savings.push({
          placementIds: [a.id, b.id],
          length: round(length, 0.01),
          cutLengthSaved: round(length, 0.01),
          piercesSaved: 0,
          timeSavedMinutes: round(length / 900, 0.01),
          costSaved: round((length / 900) * 12, 0.01)
        });
      }
    }
    return savings;
  }

  private hasStraightCompatibleEdge(placement: PartPlacement) {
    return placement.part.outerContour.length <= 8 || placement.part.segments.some((segment) => segment.kind === "line" && Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) > 10);
  }
}

export class LeadInService {
  createLeadIns(placements: PartPlacement[], input: NestingEngineInput): { leadIns: LeadIn[]; warnings: NestWarning[] } {
    const leadIns: LeadIn[] = [];
    const warnings: NestWarning[] = [];
    const length = Math.max(Number(input.leadInLength) || input.thickness * 1.5, input.thickness);
    const type = input.leadInType ?? "line";
    const pierceOffset = Math.max(0, Number(input.pierceOffset) || 0);
    for (const placement of placements) {
      const geometry = transformPartGeometry(placement.part, placement.x, placement.y, placement.rotation);
      for (let index = 0; index < Math.max(placement.part.holeCount, geometry.holes.length); index += 1) {
        const hole = geometry.holes[index] ?? [];
        const holeLead = this.choosePiercePoint(hole, Math.max(input.thickness, length * 0.6), "hole", input, placement);
        leadIns.push({ placementId: placement.id, contourType: "hole", point: holeLead.point, startPoint: holeLead.startPoint, length: holeLead.length, type, warning: holeLead.warning });
        if (holeLead.warning) warnings.push({ severity: "warning", message: holeLead.warning, payload: { placementId: placement.id, contourType: "hole", holeIndex: index } });
      }
      const outerLead = this.choosePiercePoint(geometry.outer, length, "outer", input, placement);
      leadIns.push({ placementId: placement.id, contourType: "outer", point: outerLead.point, startPoint: outerLead.startPoint, length: outerLead.length, type, warning: outerLead.warning });
      if (outerLead.warning || outerLead.point.x <= input.border + pierceOffset) {
        warnings.push({ severity: "warning", message: outerLead.warning ?? "No safe lead-in found for outer profile", payload: { placementId: placement.id, contourType: "outer" } });
      }
    }
    return { leadIns, warnings };
  }

  private choosePiercePoint(poly: Polygon, length: number, contourType: "outer" | "hole", input: NestingEngineInput, placement: PartPlacement) {
    const fallback = { x: placement.x + placement.width / 2, y: placement.y + placement.height / 2 };
    if (poly.length < 3) {
      return { point: fallback, startPoint: { x: fallback.x - length, y: fallback.y }, length, warning: `No safe lead-in found for ${contourType}` };
    }
    const box = polygonBoundsSize(poly);
    const thinWeb = Math.min(box.width, box.height) < Math.max(input.thickness * 6, length * 2);
    const edges = polygonEdges(poly)
      .map(([start, end]) => ({ start, end, edgeLength: distance(start, end) }))
      .filter((edge) => edge.edgeLength >= Math.max(length * 2, input.thickness * 2))
      .sort((a, b) => b.edgeLength - a.edgeLength);
    const edge = edges[0];
    if (!edge) {
      return { point: fallback, startPoint: { x: fallback.x - length, y: fallback.y }, length, warning: `No safe lead-in found for ${contourType}` };
    }
    const point = { x: round(edge.start.x + (edge.end.x - edge.start.x) * 0.5, 0.01), y: round(edge.start.y + (edge.end.y - edge.start.y) * 0.5, 0.01) };
    const dx = edge.end.x - edge.start.x;
    const dy = edge.end.y - edge.start.y;
    const edgeLength = Math.hypot(dx, dy) || 1;
    const normal = contourType === "hole" ? { x: -dy / edgeLength, y: dx / edgeLength } : { x: dy / edgeLength, y: -dx / edgeLength };
    const startPoint = { x: round(point.x + normal.x * length, 0.01), y: round(point.y + normal.y * length, 0.01) };
    return {
      point,
      startPoint,
      length,
      warning: thinWeb ? `No safe lead-in found away from thin webs for ${contourType}` : undefined
    };
  }
}

export class MicroJoinService {
  createMicroJoins(placements: PartPlacement[], input: NestingEngineInput): { microJoins: MicroJoin[]; warnings: NestWarning[] } {
    if (!(input.allowMicroJoins ?? input.enableMicroJoins)) return { microJoins: [], warnings: [] };
    const tabWidth = Math.max(0.2, Number(input.defaultTabWidth) || Math.max(0.8, input.thickness * 0.6));
    const minSize = Math.max(1, Number(input.minimumPartSizeForTabs) || 60);
    const smallTabs = Math.max(1, Math.round(Number(input.tabsPerPartSmall) || 2));
    const largeTabs = Math.max(smallTabs, Math.round(Number(input.tabsPerPartLarge) || 4));
    const microJoins: MicroJoin[] = [];
    const warnings: NestWarning[] = [];
    for (const placement of placements) {
      const longNarrow = Math.max(placement.width, placement.height) / Math.max(1, Math.min(placement.width, placement.height)) >= 5;
      const small = placement.width * placement.height < minSize * minSize;
      const thin = input.thickness <= 1.6;
      if (!longNarrow && !small && !thin && placement.part.holeCount < 4) continue;
      const tabs = longNarrow || placement.width * placement.height > 40_000 ? largeTabs : smallTabs;
      const locations = this.tabLocations(placement, tabs, tabWidth);
      for (const location of locations) {
        microJoins.push({
          placementId: placement.id,
          x: location.x,
          y: location.y,
          tabWidth,
          reason: longNarrow ? "Long narrow part may tip or warp" : thin ? "Thin material benefits from retention tabs" : "Small or hole-dense part may move"
        });
      }
      if (locations.length) warnings.push({ severity: "warning", message: "Micro joins recommended", payload: { placementId: placement.id, tabs: locations.length } });
      if (locations.length < tabs) warnings.push({ severity: "warning", message: "Some micro joins skipped near corners or precision edges", payload: { placementId: placement.id, requestedTabs: tabs, placedTabs: locations.length } });
    }
    return { microJoins, warnings };
  }

  private tabLocations(placement: PartPlacement, requestedTabs: number, tabWidth: number) {
    if (partHasPrecisionEdgeMark(placement.part) && requestedTabs <= 1) return [];
    const geometry = transformPartGeometry(placement.part, placement.x, placement.y, placement.rotation);
    const minEdgeLength = Math.max(tabWidth * 6, 12);
    const edgeInset = Math.max(tabWidth * 2, 4);
    const edges = polygonEdges(geometry.outer)
      .map(([start, end]) => ({ start, end, edgeLength: distance(start, end), horizontalBias: Math.abs(start.y - end.y) < 0.01 ? 0 : 1 }))
      .filter((edge) => edge.edgeLength >= minEdgeLength + edgeInset * 2)
      .sort((a, b) => a.horizontalBias - b.horizontalBias || b.edgeLength - a.edgeLength);
    if (!edges.length) return [];
    const usableEdges = partHasPrecisionEdgeMark(placement.part) && edges.length > 1 ? edges.slice(1) : edges;
    const locations: Point[] = [];
    for (let index = 0; index < requestedTabs; index += 1) {
      const edge = usableEdges[index % usableEdges.length];
      const cycle = Math.floor(index / usableEdges.length);
      const fraction = clamp((cycle + 1) / (Math.ceil(requestedTabs / usableEdges.length) + 1), 0.25, 0.75);
      const x = edge.start.x + (edge.end.x - edge.start.x) * fraction;
      const y = edge.start.y + (edge.end.y - edge.start.y) * fraction;
      if (distance({ x, y }, edge.start) < edgeInset || distance({ x, y }, edge.end) < edgeInset) continue;
      locations.push({ x: round(x, 0.1), y: round(y, 0.1) });
    }
    return locations;
  }
}

export class HeatAnalysisService {
  analyze(placements: PartPlacement[], input: NestingEngineInput): HeatAnalysis {
    const zones = this.buildZones(input.sheetWidth, input.sheetHeight, 6, 4);
    const warnings: NestWarning[] = [];
    for (const placement of placements) {
      const center = { x: placement.x + placement.width / 2, y: placement.y + placement.height / 2 };
      const aspect = Math.max(placement.width, placement.height) / Math.max(1, Math.min(placement.width, placement.height));
      const pierceDensity = placement.part.pierceCount / Math.max(1, placement.part.area / 10_000);
      const thinWebRisk = placement.part.holeCount >= 3 && Math.min(placement.width, placement.height) < Math.max(12, input.thickness * 12);
      const score = clamp(placement.part.pierceCount * 5 + placement.part.holeCount * 8 + pierceDensity * 10 + (aspect >= 7 ? 22 : 0) + (thinWebRisk ? 18 : 0), 0, 100);
      this.addHeat(zones, center, score, placement.part.pierceCount);
      if (pierceDensity > 2 || placement.part.holeCount >= 8) warnings.push({ severity: "warning", message: "High heat concentration", payload: { placementId: placement.id, pierceDensity: round(pierceDensity, 0.01) } });
      if (aspect >= 7) warnings.push({ severity: "warning", message: "Possible warping", payload: { placementId: placement.id, aspect: round(aspect, 0.01) } });
      if (thinWebRisk) warnings.push({ severity: "warning", message: "Thin web burn risk", payload: { placementId: placement.id, holes: placement.part.holeCount } });
    }
    for (let index = 0; index < placements.length; index += 1) {
      const a = placements[index];
      if (a.part.holeCount < 2 && a.part.pierceCount < 5) continue;
      const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
      for (let next = index + 1; next < placements.length; next += 1) {
        const b = placements[next];
        if (b.part.holeCount < 2 && b.part.pierceCount < 5) continue;
        const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        if (distance(ac, bc) < 120) {
          warnings.push({ severity: "warning", message: "Small holes close together", payload: { placementIds: [a.id, b.id] } });
          break;
        }
      }
    }
    return this.finish(zones, warnings);
  }

  analyzeStarter(placements: Placement[], sheet: SheetSource): { heatScore: number; heatZones: HeatZone[]; warnings: string[] } {
    const zones = this.buildZones(sheet.width, sheet.height, 6, 4);
    const warnings: string[] = [];
    for (const placement of placements) {
      const box = polygonBoundsSize(placement.polygon);
      const center = { x: box.minX + box.width / 2, y: box.minY + box.height / 2 };
      const aspect = Math.max(box.width, box.height) / Math.max(1, Math.min(box.width, box.height));
      const score = clamp(placement.microJoins.length * 14 + (aspect >= 7 ? 24 : 0) + (box.width * box.height < 2500 ? 12 : 0), 0, 100);
      this.addHeat(zones, center, score, 1);
      if (score >= 45) warnings.push(`${placement.name}: high heat concentration.`);
      if (aspect >= 7) warnings.push(`${placement.name}: possible warping.`);
      if (Math.min(box.width, box.height) < Math.max(8, sheet.kerf * 20)) warnings.push(`${placement.name}: thin web burn risk.`);
    }
    const finished = this.finish(zones, []);
    return { heatScore: finished.heatScore, heatZones: finished.heatZones, warnings: Array.from(new Set(warnings)) };
  }

  private buildZones(sheetWidth: number, sheetHeight: number, columns: number, rows: number) {
    const zones: HeatZone[] = [];
    const width = sheetWidth / columns;
    const height = sheetHeight / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) zones.push({ x: round(column * width, 0.01), y: round(row * height, 0.01), width: round(width, 0.01), height: round(height, 0.01), score: 0, pierces: 0 });
    }
    return zones;
  }

  private addHeat(zones: HeatZone[], point: Point, score: number, pierces: number) {
    let best: HeatZone | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const zone of zones) {
      const center = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
      const zoneDistance = distance(point, center);
      if (point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height) {
        best = zone;
        break;
      }
      if (zoneDistance < bestDistance) {
        best = zone;
        bestDistance = zoneDistance;
      }
    }
    if (!best) return;
    best.score = clamp(best.score + score, 0, 100);
    best.pierces += pierces;
  }

  private finish(zones: HeatZone[], warnings: NestWarning[]): HeatAnalysis {
    const activeZones = zones.filter((zone) => zone.score > 0 || zone.pierces > 0);
    const heatScore = round(activeZones.reduce((max, zone) => Math.max(max, zone.score), 0), 0.01);
    for (const zone of activeZones) {
      if (zone.score >= 70 || zone.pierces >= 12) warnings.push({ severity: "warning", message: "High heat concentration", payload: { zone } });
    }
    return { heatScore, heatZones: activeZones, warnings };
  }
}

export class CutOrderService {
  buildCutOrder(placements: PartPlacement[], heat?: HeatAnalysis) {
    const holes = placements.flatMap((placement) => {
      const sourceHoles = placement.part.holes.length ? placement.part.holes : Array.from({ length: Math.max(0, placement.part.holeCount) }, () => []);
      return sourceHoles.map((hole, index) => {
        const box = hole.length ? polygonBoundsSize(hole) : { minX: placement.width * 0.45, minY: placement.height * 0.45, maxX: placement.width * 0.55, maxY: placement.height * 0.55, width: placement.width * 0.1, height: placement.height * 0.1 };
        return {
          cutOrder: 0,
          placementId: placement.id,
          partId: String(placement.part.itemId),
          operation: "hole" as const,
          x: round(placement.x + box.minX + box.width / 2, 0.01),
          y: round(placement.y + box.minY + box.height / 2, 0.01),
          size: Math.max(1, hole.length ? polygonArea(hole) : (placement.width * placement.height) / Math.max(10, placement.part.holeCount * 8)),
          pierceCount: index === 0 ? Math.max(1, placement.part.holeCount) : 1
        };
      });
    });
    const outers = placements.map((placement) => ({
      cutOrder: 0,
      placementId: placement.id,
      partId: String(placement.part.itemId),
      operation: "outer" as const,
      x: round(placement.x + placement.width / 2, 0.01),
      y: round(placement.y + placement.height / 2, 0.01),
      size: Math.max(1, placement.width * placement.height),
      pierceCount: 1
    }));
    return [...this.orderOperations(holes, true, heat?.heatZones), ...this.orderOperations(outers, false, heat?.heatZones)].map((operation, index) => ({ ...operation, cutOrder: index + 1 }));
  }

  buildStarterCutOrder(placements: Placement[], heat?: { heatZones: HeatZone[] }) {
    const outers = placements.map((placement) => {
      const box = polygonBoundsSize(placement.polygon);
      return {
        cutOrder: 0,
        placementId: placement.partId,
        partId: placement.partId,
        operation: "outer" as const,
        x: round(box.minX + box.width / 2, 0.01),
        y: round(box.minY + box.height / 2, 0.01),
        size: Math.max(1, box.width * box.height),
        pierceCount: 1
      };
    });
    return this.orderOperations(outers, false, heat?.heatZones).map((operation, index) => ({ ...operation, cutOrder: index + 1 }));
  }

  createWarnings(placements: PartPlacement[]): NestWarning[] {
    const warnings: NestWarning[] = [];
    for (const placement of placements) {
      const aspect = Math.max(placement.width, placement.height) / Math.max(1, Math.min(placement.width, placement.height));
      const pierceDensity = placement.part.pierceCount / Math.max(1, (placement.width * placement.height) / 10_000);
      if (aspect >= 8) warnings.push({ severity: "warning", message: "Long narrow parts may warp", payload: { placementId: placement.id, aspect: round(aspect, 0.01) } });
      if (placement.part.holeCount >= 8 || pierceDensity > 2) warnings.push({ severity: "warning", message: "High heat concentration", payload: { placementId: placement.id, pierces: placement.part.pierceCount } });
      if (pierceDensity > 3) warnings.push({ severity: "warning", message: "Many pierces close together", payload: { placementId: placement.id, pierceDensity: round(pierceDensity, 0.01) } });
    }
    for (let index = 0; index < placements.length; index += 1) {
      const a = placements[index];
      if (a.part.pierceCount < 6) continue;
      const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
      for (let next = index + 1; next < placements.length; next += 1) {
        const b = placements[next];
        if (b.part.pierceCount < 6) continue;
        const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        if (distance(ac, bc) < 150) {
          warnings.push({ severity: "warning", message: "Many pierces close together", payload: { placementIds: [a.id, b.id] } });
          break;
        }
      }
    }
    return warnings;
  }

  createStarterWarnings(placements: Placement[]): string[] {
    const warnings: string[] = [];
    for (const placement of placements) {
      const box = polygonBoundsSize(placement.polygon);
      const aspect = Math.max(box.width, box.height) / Math.max(1, Math.min(box.width, box.height));
      if (aspect >= 8) warnings.push(`${placement.name}: long narrow parts may warp.`);
      if (placement.microJoins.length >= 4) warnings.push(`${placement.name}: high heat concentration.`);
    }
    for (let index = 0; index < placements.length; index += 1) {
      const a = polygonBoundsSize(placements[index].polygon);
      for (let next = index + 1; next < placements.length; next += 1) {
        const b = polygonBoundsSize(placements[next].polygon);
        if (distance({ x: a.minX + a.width / 2, y: a.minY + a.height / 2 }, { x: b.minX + b.width / 2, y: b.minY + b.height / 2 }) < 80) {
          warnings.push("Many pierces close together.");
          return Array.from(new Set(warnings));
        }
      }
    }
    return Array.from(new Set(warnings));
  }

  private orderOperations(operations: CutOperation[], preferSmallFeatures: boolean, heatZones: HeatZone[] = []) {
    const remaining = [...operations].sort((a, b) => preferSmallFeatures ? (a.size ?? 0) - (b.size ?? 0) : (a.y - b.y || a.x - b.x));
    const ordered: CutOperation[] = [];
    let cursor = { x: 0, y: 0 };
    while (remaining.length) {
      let bestIndex = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let index = 0; index < remaining.length; index += 1) {
        const operation = remaining[index];
        const recentPenalty = ordered.slice(-4).reduce((sum, previous) => {
          const close = distance(previous, operation) < 180;
          const samePierceCluster = (previous.pierceCount ?? 1) >= 4 || (operation.pierceCount ?? 1) >= 4;
          const previousHotZone = this.hotZoneFor(previous, heatZones);
          const operationHotZone = this.hotZoneFor(operation, heatZones);
          const sameHotZone = Boolean(previousHotZone && operationHotZone && previousHotZone.x === operationHotZone.x && previousHotZone.y === operationHotZone.y);
          return sum + (close ? 250 : 0) + (close && samePierceCluster ? 650 : 0) + (sameHotZone ? 800 : 0);
        }, 0);
        const smallFeatureBias = preferSmallFeatures ? (operation.size ?? 0) * 0.001 : 0;
        const score = distance(cursor, operation) + recentPenalty + smallFeatureBias;
        if (score < bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
      const [next] = remaining.splice(bestIndex, 1);
      ordered.push(next);
      cursor = { x: next.x, y: next.y };
    }
    return ordered;
  }

  private hotZoneFor(point: Point, heatZones: HeatZone[]) {
    return heatZones.find((zone) => zone.score >= 45 && point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height) ?? null;
  }
}

export class NestValidationService {
  validate(plan: Omit<NestingPlan, "warnings">, input: NestingEngineInput) {
    const warnings: NestWarning[] = [];
    const totalRequested = input.parts.reduce((sum, part) => sum + Math.max(1, Math.round(Number(part.quantity) || 1)), 0);
    if (plan.placements.length < totalRequested) {
      warnings.push({ severity: "critical", message: "Not all parts fit on the selected sheet", payload: { requested: totalRequested, placed: plan.placements.length } });
    }
    if ((input.allowCommonLine ?? input.allowCommonLineCutting) && plan.commonLineSavings.length) {
      warnings.push({ severity: "info", message: "Common-line cutting may affect edge finish", payload: { commonLines: plan.commonLineSavings.length } });
    }
    const clearance = Math.max(0, input.spacing + input.kerf);
    if (input.spacing < input.kerf || clearance < 0.5) {
      warnings.push({ severity: "warning", message: "Part spacing may be too small for kerf and laser clearance", payload: { spacing: input.spacing, kerf: input.kerf, clearance } });
    }
    for (const placement of plan.placements) {
      const placementPolygon = transformPolygon(placement.part.outerContour, placement.x, placement.y, placement.rotation);
      const outsideSheet = placementPolygon.some((point) => point.x < input.border || point.y < input.border || point.x > input.sheetWidth - input.border || point.y > input.sheetHeight - input.border);
      if (outsideSheet) {
        warnings.push({ severity: "critical", message: "Part violates sheet border", payload: { placementId: placement.id } });
      }
      const aspect = Math.max(placement.width, placement.height) / Math.max(1, Math.min(placement.width, placement.height));
      if (aspect >= 8) warnings.push({ severity: "warning", message: "Long narrow parts may warp", payload: { placementId: placement.id } });
      if (placement.part.holeCount >= 8 || placement.part.pierceCount / Math.max(1, placement.width * placement.height / 10_000) > 2) {
        warnings.push({ severity: "warning", message: "High heat concentration", payload: { placementId: placement.id, pierces: placement.part.pierceCount } });
      }
      if (input.thickness <= 1.2 && /stainless/i.test(input.material) && placement.part.holeCount > 3) {
        warnings.push({ severity: "warning", message: "Thin webs may burn", payload: { placementId: placement.id } });
      }
      const pocketContainer = placementInsidePocket(placement, plan.placements, clearance);
      if (pocketContainer) {
        warnings.push({
          severity: "warning",
          message: "Pocket placement depends on safe cut order",
          payload: { placementId: placement.id, pocketSourcePlacementId: pocketContainer.id }
        });
      }
    }
    for (let index = 0; index < plan.placements.length; index += 1) {
      const a = plan.placements[index];
      const aGeometry = transformPartGeometry(a.part, a.x, a.y, a.rotation);
      for (let next = index + 1; next < plan.placements.length; next += 1) {
        const b = plan.placements[next];
        const bGeometry = transformPartGeometry(b.part, b.x, b.y, b.rotation);
        if (!polygonBoxesOverlap(polygonBoundsSize(aGeometry.outer), polygonBoundsSize(bGeometry.outer), clearance)) continue;
        const debugPayload = {
          placementIds: [a.id, b.id],
          clearance,
          overlapDebug: {
            aBounds: polygonBoundsSize(aGeometry.outer),
            bBounds: polygonBoundsSize(bGeometry.outer),
            aPolygon: aGeometry.outer,
            bPolygon: bGeometry.outer,
            polygonDistance: round(polygonDistance(aGeometry.outer, bGeometry.outer), 0.01)
          }
        };
        if (partGeometriesCollideOrTooClose(aGeometry, bGeometry, 0)) {
          warnings.push({ severity: "critical", message: "Parts overlap", payload: debugPayload });
        } else if (clearance > 0 && partGeometriesCollideOrTooClose(aGeometry, bGeometry, clearance)) {
          warnings.push({ severity: "warning", message: "Parts violate spacing or kerf clearance", payload: debugPayload });
        }
      }
    }
    return warnings;
  }
}

export class NestingCostEstimator {
  estimate(placements: PartPlacement[], commonLineSavings: CommonLineSaving[], input: NestingEngineInput) {
    const rawCutLength = placements.reduce((sum, placement) => sum + placement.part.cutLength, 0);
    const savedCutLength = commonLineSavings.reduce((sum, saving) => sum + saving.cutLengthSaved, 0);
    const estimatedCutLength = round(Math.max(0, rawCutLength - savedCutLength), 0.01);
    const estimatedPierceCount = Math.max(0, placements.reduce((sum, placement) => sum + placement.part.pierceCount, 0) - commonLineSavings.reduce((sum, saving) => sum + saving.piercesSaved, 0));
    const speedMmPerMinute = input.thickness > 8 ? 450 : input.thickness > 3 ? 700 : 1000;
    return {
      estimatedCutLength,
      estimatedPierceCount,
      estimatedCutTimeMinutes: round(estimatedCutLength / speedMmPerMinute + estimatedPierceCount * 0.12, 0.01),
      commonLineSavingEstimate: round(commonLineSavings.reduce((sum, saving) => sum + saving.costSaved, 0), 0.01)
    };
  }
}

export class NestingDxfExporter {
  export(plan: NestingPlan, outputPath: string) {
    const lines: string[] = ["0", "SECTION", "2", "ENTITIES"];
    const layer = (name: string) => ["8", name];
    const line = (x1: number, y1: number, x2: number, y2: number, layerName: string) => {
      lines.push("0", "LINE", ...layer(layerName), "10", String(round(x1, 0.001)), "20", String(round(y1, 0.001)), "30", "0", "11", String(round(x2, 0.001)), "21", String(round(y2, 0.001)), "31", "0");
    };
    const polyline = (points: Point[], layerName: string) => {
      lines.push("0", "LWPOLYLINE", ...layer(layerName), "90", String(points.length), "70", "1");
      for (const point of points) lines.push("10", String(round(point.x, 0.001)), "20", String(round(point.y, 0.001)));
    };
    const emitEntity = (type: string, values: Record<string, string[]>, layerName = "CUT") => {
      lines.push("0", type, ...layer(layerName));
      for (const [code, entries] of Object.entries(values)) {
        if (code === "8") continue;
        for (const value of entries) lines.push(code, value);
      }
    };
    polyline([{ x: 0, y: 0 }, { x: plan.sheetWidth, y: 0 }, { x: plan.sheetWidth, y: plan.sheetHeight }, { x: 0, y: plan.sheetHeight }], "SHEET");
    for (const placement of plan.placements) {
      if (placement.part.originalDxfEntities.length) {
        for (const entity of this.transformOriginalEntities(placement)) emitEntity(entity.type, entity.values, "CUT");
      } else {
        polyline(transformPartGeometry(placement.part, placement.x, placement.y, placement.rotation).outer, "CUT");
      }
    }
    for (const saving of plan.commonLineSavings) {
      const pair = saving.placementIds.map((id) => plan.placements.find((placement) => placement.id === id)).filter(Boolean) as PartPlacement[];
      if (pair.length === 2) {
        const a = polygonBoundsSize(transformPartGeometry(pair[0].part, pair[0].x, pair[0].y, pair[0].rotation).outer);
        const b = polygonBoundsSize(transformPartGeometry(pair[1].part, pair[1].x, pair[1].y, pair[1].rotation).outer);
        if (Math.abs(a.maxX - b.minX) < 0.1 || Math.abs(b.maxX - a.minX) < 0.1) line(Math.max(a.minX, b.minX), Math.max(a.minY, b.minY), Math.max(a.minX, b.minX), Math.min(a.maxY, b.maxY), "COMMON_LINE");
        if (Math.abs(a.maxY - b.minY) < 0.1 || Math.abs(b.maxY - a.minY) < 0.1) line(Math.max(a.minX, b.minX), Math.max(a.minY, b.minY), Math.min(a.maxX, b.maxX), Math.max(a.minY, b.minY), "COMMON_LINE");
      }
    }
    for (const leadIn of plan.leadIns) {
      const start = leadIn.startPoint ?? { x: leadIn.point.x - leadIn.length, y: leadIn.point.y };
      line(start.x, start.y, leadIn.point.x, leadIn.point.y, "LEAD_IN");
    }
    for (const tab of plan.microJoins) {
      line(tab.x - tab.tabWidth / 2, tab.y, tab.x + tab.tabWidth / 2, tab.y, "MICRO_JOIN");
    }
    lines.push("0", "TEXT", ...layer("TEXT"), "10", "10", "20", String(round(plan.sheetHeight - 20, 0.001)), "40", "10", "1", `Nested DXF job ${plan.jobId ?? ""}`.trim());
    for (const operation of plan.cutOrder) {
      lines.push("0", "TEXT", ...layer("CUT_ORDER"), "10", String(round(operation.x, 0.001)), "20", String(round(operation.y, 0.001)), "40", "10", "1", String(operation.cutOrder));
    }
    for (const warning of plan.warnings) {
      lines.push("0", "TEXT", ...layer("WARNINGS"), "10", "10", "20", "10", "40", "8", "1", warning.message.slice(0, 120));
    }
    lines.push("0", "ENDSEC", "0", "EOF");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
    fs.writeFileSync(this.reportPath(outputPath), JSON.stringify(this.report(plan, outputPath), null, 2), "utf8");
    return outputPath;
  }

  reportPath(outputPath: string) {
    return outputPath.replace(/\.dxf$/i, ".report.json");
  }

  private report(plan: NestingPlan, outputPath: string) {
    return {
      exportPath: outputPath,
      jobId: plan.jobId,
      material: plan.material,
      thickness: plan.thickness,
      sheet: { width: plan.sheetWidth, height: plan.sheetHeight },
      placements: plan.placements.length,
      usagePercent: plan.usagePercent,
      wastePercent: plan.wastePercent,
      estimatedCutLength: plan.estimatedCutLength,
      estimatedPierceCount: plan.estimatedPierceCount,
      commonLineSavings: plan.commonLineSavings.length,
      leadIns: plan.leadIns.length,
      microJoins: plan.microJoins.length,
      warnings: plan.warnings.map((warning) => warning.message)
    };
  }

  private transformOriginalEntities(placement: PartPlacement): DxfOriginalEntity[] {
    const sourcePoints = placement.part.originalDxfEntities.flatMap((entity) => this.entityPoints(entity));
    const sourceBounds = boundsFromPoints(sourcePoints.length ? sourcePoints : placement.part.outerContour);
    return placement.part.originalDxfEntities.map((entity) => this.transformEntity(entity, sourceBounds, placement));
  }

  private entityPoints(entity: DxfOriginalEntity) {
    const values = entity.values;
    const xs = allNumbers(values, "10");
    const ys = allNumbers(values, "20");
    const points: Point[] = [];
    for (let index = 0; index < Math.min(xs.length, ys.length); index += 1) points.push({ x: xs[index], y: ys[index] });
    for (const [xCode, yCode] of [["11", "21"], ["12", "22"], ["13", "23"]] as const) {
      const x = firstNumber(values, xCode, Number.NaN);
      const y = firstNumber(values, yCode, Number.NaN);
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    }
    return points;
  }

  private transformEntity(entity: DxfOriginalEntity, sourceBounds: ReturnType<typeof boundsFromPoints>, placement: PartPlacement): DxfOriginalEntity {
    const values = Object.fromEntries(Object.entries(entity.values).map(([code, entries]) => [code, [...entries]])) as Record<string, string[]>;
    const setPoint = (xCode: string, yCode: string, index = 0) => {
      const x = Number(values[xCode]?.[index]);
      const y = Number(values[yCode]?.[index]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const point = transformRawDxfPoint({ x, y }, sourceBounds, placement);
      values[xCode][index] = String(round(point.x, 0.001));
      values[yCode][index] = String(round(point.y, 0.001));
    };
    if (entity.type === "LWPOLYLINE") {
      const count = Math.min(values["10"]?.length ?? 0, values["20"]?.length ?? 0);
      for (let index = 0; index < count; index += 1) setPoint("10", "20", index);
    } else {
      setPoint("10", "20");
      setPoint("11", "21");
      setPoint("12", "22");
      setPoint("13", "23");
    }
    if (entity.type === "ARC") {
      for (const code of ["50", "51"]) {
        const angle = Number(values[code]?.[0]);
        if (Number.isFinite(angle)) values[code][0] = String(round((((angle + placement.rotation) % 360) + 360) % 360, 0.001));
      }
    }
    return { type: entity.type, layer: "CUT", values };
  }
}

export class CypNestProgramService {
  private readonly recoveredModules = ["nestpack.bpl", "PlateSvcs.bpl", "geometry.bpl", "gks.bpl", "cutsys.bpl", "model.bpl"];
  private readonly mappedFeatures = [
    "TNestPartInfo/GetNestPartsInfo",
    "TNestResultInfo/GetNestResultsInfo",
    "NestParam.StrategyName",
    "NestParam.NestDirection",
    "PlateParam.PlateSource",
    "PlateParam.PlateWidth/PlateLength/PlateAmount",
    "cbStandardPlates",
    "edtGapDist/vgrPartDistance",
    "edtPlateGap/vgrPlateDistance",
    "dxpmNestFullFill",
    "vgrCoedgeAll/vgrCoedgeMinLength/vgrCoedgeGap",
    "dxpmLeadLines/tsNestLeadSealSize",
    "CheckNestWorkCount/GetMaxNestLoopCount",
    "dxpmDivPlate/dxtbPlateSeparate",
    "dxtbbSaveAsDxf/dxmFileNestReport"
  ];

  constructor(
    private readonly normalizer = new GeometryNormalizer(),
    private readonly optimizer = new NestingOptimizerService(),
    private readonly commonLine = new CommonLineService(),
    private readonly leadIns = new LeadInService(),
    private readonly microJoins = new MicroJoinService(),
    private readonly cutOrder = new CutOrderService(),
    private readonly validation = new NestValidationService(),
    private readonly estimator = new NestingCostEstimator()
  ) {}

  run(input: CypNestProgramInput): CypNestProgramResult {
    const engineInput = this.toEngineInput(input);
    const parts = input.parts.map((part, index) => this.normalizer.normalize({
      itemId: index + 1,
      jobId: part.jobId === null || part.jobId === undefined ? null : String(part.jobId),
      quoteId: part.quoteId ?? null,
      partDnaId: part.partDnaId ?? null,
      dxfFileId: part.dxfFileId ?? part.dxfPath ?? null,
      rawDxf: part.rawDxf ?? null,
      quantity: Math.max(1, Math.round(Number(part.quantity) || 1)),
      width: part.width,
      height: part.height,
      cutLength: part.cutLength,
      pierceCount: part.pierceCount
    }));
    const optimized = this.optimizer.optimize(parts, engineInput);
    const commonLineSavings = this.commonLine.detect(optimized.placements, engineInput);
    const leadResult = this.leadIns.createLeadIns(optimized.placements, engineInput);
    const microJoinResult = this.microJoins.createMicroJoins(optimized.placements, engineInput);
    const cutOrder = this.cutOrder.buildCutOrder(optimized.placements, optimized.heat);
    const estimates = this.estimator.estimate(optimized.placements, commonLineSavings, engineInput);
    const usedArea = optimized.placements.reduce((sum, placement) => sum + placement.part.area, 0);
    const usagePercent = round((usedArea / Math.max(1, engineInput.sheetWidth * engineInput.sheetHeight)) * 100, 0.01);
    const basePlan = {
      status: "optimized" as NestingJobStatus,
      material: engineInput.material,
      thickness: engineInput.thickness,
      sheetWidth: engineInput.sheetWidth,
      sheetHeight: engineInput.sheetHeight,
      kerf: engineInput.kerf,
      border: engineInput.border,
      spacing: engineInput.spacing,
      placements: optimized.placements,
      wastePercentage: round(100 - usagePercent, 0.01),
      wastePercent: round(100 - usagePercent, 0.01),
      sheetUsagePercentage: usagePercent,
      usagePercent,
      estimatedCutLength: estimates.estimatedCutLength,
      estimatedPierceCount: estimates.estimatedPierceCount,
      estimatedCutTime: estimates.estimatedCutTimeMinutes,
      estimatedCutTimeMinutes: estimates.estimatedCutTimeMinutes,
      commonLineSavingEstimate: estimates.commonLineSavingEstimate,
      commonLineSavings,
      leadIns: leadResult.leadIns,
      microJoins: microJoinResult.microJoins,
      cutOrder,
      heatScore: optimized.heat.heatScore,
      heatZones: optimized.heat.heatZones,
      nfpDebug: optimized.placements.flatMap((placement) => placement.id).length ? optimized.placements[0]?.part ? undefined : undefined : undefined,
      optimizationProgress: optimized.progress,
      dxfExportPath: null
    };
    const warnings = [
      ...leadResult.warnings,
      ...microJoinResult.warnings,
      ...optimized.heat.warnings,
      ...this.validation.validate(basePlan, engineInput),
      ...this.cutOrder.createWarnings(optimized.placements),
      ...this.programWarnings(input, engineInput, optimized.placements.length)
    ];
    const plan: NestingPlan = { ...basePlan, warnings };
    return { plan, report: this.report(input, engineInput, plan) };
  }

  toEngineInput(input: CypNestProgramInput): NestingEngineInput {
    const plate = this.resolvePlate(input);
    const strategy = this.strategyName(input);
    const maxLoops = Math.max(1, Math.round(Number(input.nestParam?.maxNestLoopCount) || (strategy === "fast" ? 12 : strategy === "quality" || strategy === "full_fill" ? 128 : 48)));
    const maxOptimizationMs = clamp(maxLoops * 120, 500, 60_000);
    const direction = input.nestParam?.nestDirection ?? "auto";
    return {
      workspaceId: input.workspaceId,
      customerName: input.customerName,
      nestName: input.nestName,
      material: input.material,
      thickness: input.thickness,
      sheetWidth: plate.width,
      sheetHeight: plate.length,
      kerf: Math.max(0, Number(input.nestParam?.kerf) || 0),
      border: Math.max(0, Number(input.nestParam?.plateGap) || 0),
      spacing: Math.max(0, Number(input.nestParam?.gapDist) || 0),
      parts: input.parts,
      allowedRotations: direction === "x" ? [0, 180] : direction === "y" ? [90, 270] : [0, 90, 180, 270],
      allowCommonLine: Boolean(input.nestParam?.allowCommonLine || strategy === "coedge"),
      allowCommonLineCutting: Boolean(input.nestParam?.allowCommonLine || strategy === "coedge"),
      customerToleranceAllowsCommonLine: true,
      allowMicroJoins: true,
      enableMicroJoins: true,
      leadInType: input.nestParam?.leadInKind ?? "line",
      leadInLength: Math.max(0, Number(input.nestParam?.leadInLength) || Number(input.nestParam?.leadSealSize) || 4),
      leadOutLength: Math.max(0, Number(input.nestParam?.leadOutLength) || 0),
      angleStepDegrees: strategy === "quality" || strategy === "full_fill" ? 45 : 90,
      maxOptimizationMs
    };
  }

  extractNestResultInfo(result: CypNestProgramResult) {
    return {
      partsComplete: result.report.partsComplete,
      totalParts: result.report.totalParts,
      usagePercent: result.plan.usagePercent,
      wastePercent: result.plan.wastePercent,
      warnings: result.plan.warnings.map((warning) => warning.message)
    };
  }

  private resolvePlate(input: CypNestProgramInput) {
    const requested = input.plateParam;
    if (requested.plateSource === "standard" && requested.standardPlates?.length) {
      const selected = requested.standardPlates.find((plate) => plate.name === requested.standardPlateName) ?? requested.standardPlates[0];
      return { width: positiveNumber(selected.width, 3000), length: positiveNumber(selected.length, 1500), amount: Math.max(1, Math.round(Number(selected.amount ?? requested.plateAmount) || 1)), source: "standard" };
    }
    return {
      width: positiveNumber(requested.plateWidth, 3000),
      length: positiveNumber(requested.plateLength, 1500),
      amount: Math.max(1, Math.round(Number(requested.plateAmount) || 1)),
      source: requested.plateSource ?? "custom"
    };
  }

  private strategyName(input: CypNestProgramInput): CypNestStrategyName {
    const raw = String(input.nestParam?.strategyName ?? (input.nestParam?.fullFill ? "full_fill" : "balanced")).toLowerCase().replace(/[\s-]+/g, "_");
    if (raw === "fast" || raw === "balanced" || raw === "full_fill" || raw === "coedge" || raw === "quality") return raw;
    if (raw.includes("full")) return "full_fill";
    if (raw.includes("coedge") || raw.includes("common")) return "coedge";
    if (raw.includes("quality")) return "quality";
    if (raw.includes("fast")) return "fast";
    return "balanced";
  }

  private report(input: CypNestProgramInput, engineInput: NestingEngineInput, plan: NestingPlan): CypNestProgramReport {
    const plate = this.resolvePlate(input);
    const totalParts = input.parts.reduce((sum, part) => sum + Math.max(1, Math.round(Number(part.quantity) || 1)), 0);
    return {
      source: "recovered-cypnest-symbols",
      recoveredModules: this.recoveredModules,
      mappedFeatures: this.mappedFeatures,
      strategyName: this.strategyName(input),
      plateSource: plate.source,
      plateWidth: engineInput.sheetWidth,
      plateLength: engineInput.sheetHeight,
      plateAmount: plate.amount,
      partsComplete: plan.placements.length,
      totalParts,
      resultInfo: {
        usagePercent: plan.usagePercent,
        wastePercent: plan.wastePercent,
        estimatedCutLength: plan.estimatedCutLength,
        estimatedPierceCount: plan.estimatedPierceCount,
        commonLineSavingEstimate: plan.commonLineSavingEstimate,
        heatScore: plan.heatScore
      },
      dividedPlates: this.divideRemainingPlate(plan)
    };
  }

  private divideRemainingPlate(plan: NestingPlan) {
    if (!plan.placements.length) return [{ x: plan.border, y: plan.border, width: Math.max(0, plan.sheetWidth - plan.border * 2), height: Math.max(0, plan.sheetHeight - plan.border * 2), usableArea: Math.max(0, (plan.sheetWidth - plan.border * 2) * (plan.sheetHeight - plan.border * 2)), reason: "empty plate" }];
    const envelope = polygonBoundsSize(plan.placements.flatMap((placement) => transformPartGeometry(placement.part, placement.x, placement.y, placement.rotation).outer));
    const right = { x: envelope.maxX + plan.spacing, y: plan.border, width: Math.max(0, plan.sheetWidth - plan.border - envelope.maxX - plan.spacing), height: Math.max(0, plan.sheetHeight - plan.border * 2), reason: "right remainder" };
    const top = { x: plan.border, y: envelope.maxY + plan.spacing, width: Math.max(0, plan.sheetWidth - plan.border * 2), height: Math.max(0, plan.sheetHeight - plan.border - envelope.maxY - plan.spacing), reason: "top remainder" };
    return [right, top]
      .map((entry) => ({ ...entry, usableArea: round(entry.width * entry.height, 0.01) }))
      .filter((entry) => entry.width >= 50 && entry.height >= 50 && entry.usableArea >= 10_000)
      .sort((a, b) => b.usableArea - a.usableArea);
  }

  private programWarnings(input: CypNestProgramInput, engineInput: NestingEngineInput, placedCount: number): NestWarning[] {
    const warnings: NestWarning[] = [];
    const totalParts = input.parts.reduce((sum, part) => sum + Math.max(1, Math.round(Number(part.quantity) || 1)), 0);
    if (placedCount < totalParts) warnings.push({ severity: "warning", message: "Not all parts completed in nesting work count", payload: { partsComplete: placedCount, totalParts } });
    if ((input.nestParam?.coedgeGap ?? 0) > 0 && !engineInput.allowCommonLine) warnings.push({ severity: "info", message: "Coedge gap was set but common-line/coedge strategy is disabled", payload: { coedgeGap: input.nestParam?.coedgeGap } });
    if (engineInput.spacing < engineInput.kerf) warnings.push({ severity: "warning", message: "Part gap is smaller than kerf; increase GapDist", payload: { gapDist: engineInput.spacing, kerf: engineInput.kerf } });
    return warnings;
  }
}

function rowToJob(row: Record<string, unknown>): NestingPlan {
  return {
    jobId: Number(row.id),
    status: String(row.status ?? "draft") as NestingJobStatus,
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    sheetWidth: Number(row.sheetWidth ?? 0),
    sheetHeight: Number(row.sheetHeight ?? 0),
    kerf: Number(row.kerf ?? 0),
    border: Number(row.border ?? 0),
    spacing: Number(row.spacing ?? 0),
    placements: [],
    wastePercentage: Number(row.wastePercent ?? 0),
    wastePercent: Number(row.wastePercent ?? 0),
    sheetUsagePercentage: Number(row.usagePercent ?? 0),
    usagePercent: Number(row.usagePercent ?? 0),
    estimatedCutLength: Number(row.estimatedCutLength ?? 0),
    estimatedPierceCount: Number(row.estimatedPierceCount ?? 0),
    estimatedCutTime: Number(row.estimatedCutTimeMinutes ?? 0),
    estimatedCutTimeMinutes: Number(row.estimatedCutTimeMinutes ?? 0),
    commonLineSavingEstimate: 0,
    commonLineSavings: [],
    leadIns: [],
    microJoins: [],
    cutOrder: [],
    heatScore: 0,
    heatZones: [],
    optimizationProgress: { attemptsCompleted: 0, bestWastePercent: Number(row.wastePercent ?? 0), bestUsagePercent: Number(row.usagePercent ?? 0), placedPartsCount: 0, timeLimitMs: 0, returnedBestSoFar: false },
    warnings: [],
    dxfExportPath: row.dxfExportPath ? String(row.dxfExportPath) : null,
    exportReportPath: row.dxfExportPath ? String(row.dxfExportPath).replace(/\.dxf$/i, ".report.json") : null
  };
}

export function openNestingEngineDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-nesting-engine.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS nesting_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      sheetWidth REAL NOT NULL,
      sheetHeight REAL NOT NULL,
      kerf REAL NOT NULL,
      border REAL NOT NULL,
      spacing REAL NOT NULL,
      allowCommonLine INTEGER NOT NULL,
      allowMicroJoins INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'optimized', 'approved', 'exported')),
      wastePercent REAL NOT NULL DEFAULT 0,
      usagePercent REAL NOT NULL DEFAULT 0,
      estimatedCutLength REAL NOT NULL DEFAULT 0,
      estimatedPierceCount INTEGER NOT NULL DEFAULT 0,
      estimatedCutTimeMinutes REAL NOT NULL DEFAULT 0,
      dxfExportPath TEXT,
      settingsJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nesting_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nestingJobId INTEGER NOT NULL,
      jobId TEXT,
      quoteId TEXT,
      partDnaId INTEGER,
      dxfFileId TEXT,
      quantity INTEGER NOT NULL,
      width REAL,
      height REAL,
      cutLength REAL,
      pierceCount INTEGER,
      rawDxf TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(nestingJobId) REFERENCES nesting_jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nesting_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nestingJobId INTEGER NOT NULL,
      nestingItemId INTEGER NOT NULL,
      sheetIndex INTEGER NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      rotation REAL NOT NULL,
      mirrored INTEGER NOT NULL,
      isCommonLine INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(nestingJobId) REFERENCES nesting_jobs(id) ON DELETE CASCADE,
      FOREIGN KEY(nestingItemId) REFERENCES nesting_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nesting_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nestingJobId INTEGER NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'critical')),
      message TEXT NOT NULL,
      payloadJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL,
      FOREIGN KEY(nestingJobId) REFERENCES nesting_jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_nesting_engine_jobs_workspace ON nesting_jobs(workspaceId, status, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_nesting_engine_items_job ON nesting_items(nestingJobId);
    CREATE INDEX IF NOT EXISTS idx_nesting_engine_placements_job ON nesting_placements(nestingJobId, sheetIndex);
    CREATE INDEX IF NOT EXISTS idx_nesting_engine_warnings_job ON nesting_warnings(nestingJobId, severity);
  `);
  return db;
}

export class NestingEngineService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly exportRoot: string,
    private readonly brainCore?: BrainCoreService,
    private readonly normalizer = new GeometryNormalizer(),
    private readonly placementService = new PartPlacementService(),
    private readonly commonLineService = new CommonLineService(),
    private readonly leadInService = new LeadInService(),
    private readonly microJoinService = new MicroJoinService(),
    private readonly heatAnalysisService = new HeatAnalysisService(),
    private readonly optimizerService = new NestingOptimizerService(),
    private readonly validationService = new NestValidationService(),
    private readonly estimator = new NestingCostEstimator(),
    private readonly cutOrderService = new CutOrderService(),
    private readonly dxfExporter = new NestingDxfExporter()
  ) {}

  create(input: NestingEngineInput) {
    const now = new Date().toISOString();
    const material = input.material.trim();
    if (!material || input.thickness <= 0 || input.sheetWidth <= 0 || input.sheetHeight <= 0) throw new Error("material, thickness, sheetWidth, and sheetHeight are required");
    const insert = this.db.prepare(
      `INSERT INTO nesting_jobs
       (workspaceId, material, thickness, sheetWidth, sheetHeight, kerf, border, spacing, allowCommonLine, allowMicroJoins, status, settingsJson, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
    ).run(
      input.workspaceId?.trim() || null,
      material,
      input.thickness,
      input.sheetWidth,
      input.sheetHeight,
      Math.max(0, input.kerf),
      Math.max(0, input.border),
      Math.max(0, input.spacing),
      input.allowCommonLine ?? input.allowCommonLineCutting ? 1 : 0,
      input.allowMicroJoins ?? input.enableMicroJoins ? 1 : 0,
      JSON.stringify(input),
      now,
      now
    );
    const jobId = Number(insert.lastInsertRowid);
    for (const part of input.parts) {
      this.db.prepare(
        `INSERT INTO nesting_items
         (nestingJobId, jobId, quoteId, partDnaId, dxfFileId, quantity, width, height, cutLength, pierceCount, rawDxf, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        jobId,
        part.jobId === null || part.jobId === undefined ? null : String(part.jobId),
        part.quoteId ?? null,
        part.partDnaId ?? null,
        part.dxfFileId ?? part.dxfPath ?? null,
        Math.max(1, Math.round(Number(part.quantity) || 1)),
        part.width ?? null,
        part.height ?? null,
        part.cutLength ?? null,
        part.pierceCount ?? null,
        part.rawDxf ?? null,
        now
      );
    }
    return this.get(jobId);
  }

  optimize(jobId: number) {
    const job = this.getJobRow(jobId);
    if (!job) throw new Error("nesting job not found");
    const input = this.inputFromJob(job);
    const items = this.getItemRows(jobId);
    const parts = items.map((item) => this.normalizer.normalize({
      itemId: Number(item.id),
      jobId: item.jobId === null ? null : String(item.jobId ?? ""),
      quoteId: item.quoteId ? String(item.quoteId) : null,
      partDnaId: item.partDnaId === null || item.partDnaId === undefined ? null : Number(item.partDnaId),
      dxfFileId: item.dxfFileId ? String(item.dxfFileId) : null,
      rawDxf: item.rawDxf ? String(item.rawDxf) : null,
      quantity: Number(item.quantity ?? 1),
      width: item.width === null || item.width === undefined ? undefined : Number(item.width),
      height: item.height === null || item.height === undefined ? undefined : Number(item.height),
      cutLength: item.cutLength === null || item.cutLength === undefined ? undefined : Number(item.cutLength),
      pierceCount: item.pierceCount === null || item.pierceCount === undefined ? undefined : Number(item.pierceCount)
    }));
    const optimized = this.optimizerService.optimize(parts, input);
    const placements = optimized.placements;
    const commonLineSavings = optimized.commonLineSavings;
    const leadResult = this.leadInService.createLeadIns(placements, input);
    const microJoinResult = this.microJoinService.createMicroJoins(placements, input);
    const heatAnalysis = optimized.heat;
    const cutOrder = this.cutOrderService.buildCutOrder(placements, heatAnalysis);
    const estimates = this.estimator.estimate(placements, commonLineSavings, input);
    const usedArea = placements.reduce((sum, placement) => sum + placement.part.area, 0);
    const sheetArea = Math.max(1, input.sheetWidth * input.sheetHeight);
    const usagePercent = round((usedArea / sheetArea) * 100, 0.01);
    const planWithoutWarnings = {
      jobId,
      status: "optimized" as NestingJobStatus,
      material: input.material,
      thickness: input.thickness,
      sheetWidth: input.sheetWidth,
      sheetHeight: input.sheetHeight,
      kerf: input.kerf,
      border: input.border,
      spacing: input.spacing,
      placements,
      wastePercentage: round(100 - usagePercent, 0.01),
      wastePercent: round(100 - usagePercent, 0.01),
      sheetUsagePercentage: usagePercent,
      usagePercent,
      estimatedCutLength: estimates.estimatedCutLength,
      estimatedPierceCount: estimates.estimatedPierceCount,
      estimatedCutTime: estimates.estimatedCutTimeMinutes,
      estimatedCutTimeMinutes: estimates.estimatedCutTimeMinutes,
      commonLineSavingEstimate: estimates.commonLineSavingEstimate,
      commonLineSavings,
      leadIns: leadResult.leadIns,
      microJoins: microJoinResult.microJoins,
      cutOrder,
      heatScore: heatAnalysis.heatScore,
      heatZones: heatAnalysis.heatZones,
      optimizationProgress: optimized.progress,
      dxfExportPath: job.dxfExportPath ? String(job.dxfExportPath) : null
    };
    const warnings = [
      ...leadResult.warnings,
      ...microJoinResult.warnings,
      ...heatAnalysis.warnings,
      ...this.validationService.validate(planWithoutWarnings, input),
      ...this.cutOrderService.createWarnings(placements)
    ];
    const plan: NestingPlan = { ...planWithoutWarnings, warnings };
    this.persistOptimized(jobId, plan);
    this.writeBrainSignals(jobId, input, plan);
    return plan;
  }

  get(jobId: number) {
    const job = this.getJobRow(jobId);
    if (!job) return null;
    const plan = rowToJob(job);
    const itemRows = this.getItemRows(jobId);
    const itemsById = new Map(itemRows.map((row) => [Number(row.id), row]));
    const placements = this.db.prepare(`SELECT * FROM nesting_placements WHERE nestingJobId = ? ORDER BY sheetIndex ASC, y ASC, x ASC`).all(jobId) as Record<string, unknown>[];
    plan.placements = placements.map((row) => {
      const item = itemsById.get(Number(row.nestingItemId));
      const part = this.normalizer.normalize({
        itemId: Number(row.nestingItemId),
        jobId: item?.jobId === null ? null : String(item?.jobId ?? ""),
        quoteId: item?.quoteId ? String(item.quoteId) : null,
        partDnaId: item?.partDnaId === null || item?.partDnaId === undefined ? null : Number(item.partDnaId),
        dxfFileId: item?.dxfFileId ? String(item.dxfFileId) : null,
        rawDxf: item?.rawDxf ? String(item.rawDxf) : null,
        quantity: Number(item?.quantity ?? 1),
        width: item?.width === null || item?.width === undefined ? undefined : Number(item.width),
        height: item?.height === null || item?.height === undefined ? undefined : Number(item.height),
        cutLength: item?.cutLength === null || item?.cutLength === undefined ? undefined : Number(item.cutLength),
        pierceCount: item?.pierceCount === null || item?.pierceCount === undefined ? undefined : Number(item.pierceCount)
      });
      const rotation = Number(row.rotation ?? 0);
      const rotated = rotation === 90 || rotation === 270;
      return {
        id: String(row.id),
        nestingItemId: Number(row.nestingItemId),
        sheetIndex: Number(row.sheetIndex ?? 0),
        x: Number(row.x ?? 0),
        y: Number(row.y ?? 0),
        width: rotated ? part.height : part.width,
        height: rotated ? part.width : part.height,
        rotation,
        mirrored: Boolean(row.mirrored),
        isCommonLine: Boolean(row.isCommonLine),
        part
      };
    });
    const input = this.inputFromJob(job);
    const heatAnalysis = this.heatAnalysisService.analyze(plan.placements, input);
    plan.heatScore = heatAnalysis.heatScore;
    plan.heatZones = heatAnalysis.heatZones;
    plan.leadIns = this.leadInService.createLeadIns(plan.placements, input).leadIns;
    plan.microJoins = this.microJoinService.createMicroJoins(plan.placements, input).microJoins;
    plan.cutOrder = this.cutOrderService.buildCutOrder(plan.placements, heatAnalysis);
    plan.warnings = this.getWarnings(jobId);
    plan.dxfExportPath = job.dxfExportPath ? String(job.dxfExportPath) : null;
    plan.exportReportPath = plan.dxfExportPath ? plan.dxfExportPath.replace(/\.dxf$/i, ".report.json") : null;
    return plan;
  }

  updateSettings(jobId: number, patch: Partial<NestingEngineInput>) {
    const current = this.getJobRow(jobId);
    if (!current) throw new Error("nesting job not found");
    const input = { ...this.inputFromJob(current), ...patch };
    this.db.prepare(
      `UPDATE nesting_jobs
       SET material = ?, thickness = ?, sheetWidth = ?, sheetHeight = ?, kerf = ?, border = ?, spacing = ?,
           allowCommonLine = ?, allowMicroJoins = ?, settingsJson = ?, updatedAt = ?
       WHERE id = ?`
    ).run(
      input.material,
      input.thickness,
      input.sheetWidth,
      input.sheetHeight,
      Math.max(0, input.kerf),
      Math.max(0, input.border),
      Math.max(0, input.spacing),
      input.allowCommonLine ?? input.allowCommonLineCutting ? 1 : 0,
      input.allowMicroJoins ?? input.enableMicroJoins ? 1 : 0,
      JSON.stringify(input),
      new Date().toISOString(),
      jobId
    );
    return this.get(jobId);
  }

  exportDxf(jobId: number) {
    let plan = this.get(jobId);
    if (!plan || !plan.placements.length) plan = this.optimize(jobId);
    const input = this.inputFromJob(this.getJobRow(jobId) ?? {});
    const customerName = safeExportSegment(String(input.customerName ?? "Customer"));
    const nestName = safeExportSegment(String(input.nestName ?? `nesting-job-${jobId}`));
    const outputPath = path.join(this.exportRoot, customerName, `${customerName}_${nestName}.dxf`);
    const exported = this.dxfExporter.export(plan, outputPath);
    this.db.prepare(`UPDATE nesting_jobs SET status = 'exported', dxfExportPath = ?, updatedAt = ? WHERE id = ?`).run(exported, new Date().toISOString(), jobId);
    return { ...plan, status: "exported" as const, dxfExportPath: exported, exportReportPath: this.dxfExporter.reportPath(exported) };
  }

  getWarnings(jobId: number) {
    const rows = this.db.prepare(`SELECT * FROM nesting_warnings WHERE nestingJobId = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, id ASC`).all(jobId) as Record<string, unknown>[];
    return rows.map((row) => ({
      severity: String(row.severity ?? "info") as NestWarningSeverity,
      message: String(row.message ?? ""),
      payload: typeof row.payloadJson === "string" ? JSON.parse(row.payloadJson || "{}") : {}
    }));
  }

  private getJobRow(jobId: number) {
    return this.db.prepare(`SELECT * FROM nesting_jobs WHERE id = ?`).get(jobId) as Record<string, unknown> | undefined;
  }

  private getItemRows(jobId: number) {
    return this.db.prepare(`SELECT * FROM nesting_items WHERE nestingJobId = ? ORDER BY id ASC`).all(jobId) as Record<string, unknown>[];
  }

  private inputFromJob(job: Record<string, unknown>): NestingEngineInput {
    const settings = typeof job.settingsJson === "string" ? JSON.parse(job.settingsJson || "{}") : {};
    return {
      ...settings,
      sheetWidth: Number(job.sheetWidth),
      sheetHeight: Number(job.sheetHeight),
      material: String(job.material),
      thickness: Number(job.thickness),
      kerf: Number(job.kerf),
      border: Number(job.border),
      spacing: Number(job.spacing),
      allowCommonLine: Boolean(job.allowCommonLine),
      allowMicroJoins: Boolean(job.allowMicroJoins),
      parts: []
    };
  }

  private persistOptimized(jobId: number, plan: NestingPlan) {
    const now = new Date().toISOString();
    this.db.prepare(`DELETE FROM nesting_placements WHERE nestingJobId = ?`).run(jobId);
    this.db.prepare(`DELETE FROM nesting_warnings WHERE nestingJobId = ?`).run(jobId);
    for (const placement of plan.placements) {
      this.db.prepare(
        `INSERT INTO nesting_placements
         (nestingJobId, nestingItemId, sheetIndex, x, y, rotation, mirrored, isCommonLine, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(jobId, placement.nestingItemId, placement.sheetIndex, placement.x, placement.y, placement.rotation, placement.mirrored ? 1 : 0, placement.isCommonLine ? 1 : 0, now);
    }
    for (const warning of plan.warnings) {
      this.db.prepare(`INSERT INTO nesting_warnings (nestingJobId, severity, message, payloadJson, createdAt) VALUES (?, ?, ?, ?, ?)`)
        .run(jobId, warning.severity, warning.message, JSON.stringify(warning.payload ?? {}), now);
    }
    this.db.prepare(
      `UPDATE nesting_jobs
       SET status = 'optimized', wastePercent = ?, usagePercent = ?, estimatedCutLength = ?, estimatedPierceCount = ?, estimatedCutTimeMinutes = ?, updatedAt = ?
       WHERE id = ?`
    ).run(plan.wastePercent, plan.usagePercent, plan.estimatedCutLength, plan.estimatedPierceCount, plan.estimatedCutTimeMinutes, now, jobId);
  }

  private writeBrainSignals(jobId: number, input: NestingEngineInput, plan: NestingPlan) {
    if (!this.brainCore || !input.workspaceId) return;
    this.brainCore.eventService.recordEvent({
      eventType: "nesting_completed",
      entityType: "nesting_job",
      entityId: String(jobId),
      payload: {
        material: input.material,
        thickness: input.thickness,
        wastePercent: plan.wastePercent,
        usagePercent: plan.usagePercent,
        commonLineSavingEstimate: plan.commonLineSavingEstimate,
        microJoins: plan.microJoins.length,
        warnings: plan.warnings.length
      }
    });
    if (plan.commonLineSavingEstimate > 0) {
      this.brainCore.recommendationService.createRecommendation({
        moduleName: "advanced_nesting_engine",
        recommendationType: "common_line_saving",
        title: "Common-line cutting can save cost",
        message: `This nest can save about ${plan.commonLineSavings.reduce((sum, saving) => sum + saving.cutLengthSaved, 0).toFixed(0)} mm of cutting.`,
        confidence: 0.78,
        impactScore: 68,
        payload: { workspaceId: input.workspaceId, nestingJobId: jobId, saving: plan.commonLineSavingEstimate }
      });
    }
    if (plan.wastePercent > 35) {
      this.brainCore.recommendationService.createRecommendation({
        moduleName: "advanced_nesting_engine",
        recommendationType: "high_material_waste",
        title: "Material waste is high",
        message: `The optimized nest still has ${plan.wastePercent.toFixed(1)}% waste. Check offcuts or a different sheet size.`,
        confidence: 0.82,
        impactScore: 74,
        payload: { workspaceId: input.workspaceId, nestingJobId: jobId, wastePercent: plan.wastePercent }
      });
    }
    if (plan.warnings.some((warning) => /heat|warp|burn|micro joins/i.test(warning.message))) {
      this.brainCore.eventService.recordEvent({
        eventType: "nesting_heat_warning",
        entityType: "nesting_job",
        entityId: String(jobId),
        payload: {
          material: input.material,
          thickness: input.thickness,
          heatScore: plan.heatScore,
          heatZones: plan.heatZones,
          warnings: plan.warnings.filter((warning) => /heat|warp|burn|thin web/i.test(warning.message)).map((warning) => warning.message)
        }
      });
      this.brainCore.recommendationService.createRecommendation({
        moduleName: "advanced_nesting_engine",
        recommendationType: "nest_manufacturability_risk",
        title: "Review nest manufacturability",
        message: "Heat, tab, or distortion warnings were found. Review cut order and micro joins before release.",
        confidence: 0.76,
        impactScore: 70,
        payload: { workspaceId: input.workspaceId, nestingJobId: jobId, warnings: plan.warnings }
      });
    }
  }
}

export type NestPart = {
  id: string;
  name: string;
  quantity: number;
  polygon: Point[];
  allowRotation?: boolean;
  allowedRotations?: number[];
};

export type SheetSource = {
  id?: string;
  type: "sheet" | "offcut";
  width: number;
  height: number;
  border: number;
  spacing: number;
  kerf: number;
};

export type Placement = {
  partId: string;
  name: string;
  x: number;
  y: number;
  rotation: number;
  cutOrder?: number;
  polygon: Point[];
  microJoins: Point[];
  leadIn: { start: Point; end: Point };
};

export type NestResult = {
  placements: Placement[];
  unplaced: NestPart[];
  usagePercent: number;
  wastePercent: number;
  commonLineSaving: number;
  cutOrder: CutOperation[];
  heatScore: number;
  heatZones: HeatZone[];
  nfpDebug: NoFitPolygonDebug;
  optimizationProgress: OptimizationProgress;
  warnings: string[];
  dxf: string;
};

function rotatePolygon(poly: Point[], deg: number): Point[] {
  const radians = (deg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return poly.map((point) => ({ x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }));
}

function movePolygon(poly: Point[], x: number, y: number): Point[] {
  return poly.map((point) => ({ x: point.x + x, y: point.y + y }));
}

function normalizePolygon(poly: Point[]): Point[] {
  const box = boundsFromPoints(poly);
  return poly.map((point) => ({ x: point.x - box.minX, y: point.y - box.minY }));
}

function polygonInsideSheet(poly: Point[], sheet: SheetSource): boolean {
  return poly.every((point) => point.x >= sheet.border && point.y >= sheet.border && point.x <= sheet.width - sheet.border && point.y <= sheet.height - sheet.border);
}

function starterPolygonsCollide(a: Point[], b: Point[], spacing: number): boolean {
  if (!polygonBoxesOverlap(polygonBoundsSize(a), polygonBoundsSize(b), spacing)) return false;
  if (spacing <= 0) return polygonsOverlap(a, b);
  const boundaryOffset = spacing / 2;
  const aBoundary = offsetPolygonOutward(a, boundaryOffset);
  const bBoundary = offsetPolygonOutward(b, boundaryOffset);
  return polygonsOverlap(aBoundary, bBoundary) || polygonDistance(aBoundary, bBoundary) <= 0.01;
}

function starterHasCollision(poly: Point[], placements: Placement[], spacing: number): boolean {
  return placements.some((placement) => starterPolygonsCollide(poly, placement.polygon, spacing));
}

function expandNestParts(parts: NestPart[]): NestPart[] {
  const expanded: NestPart[] = [];
  for (const part of parts) {
    for (let index = 0; index < Math.max(1, Math.round(Number(part.quantity) || 1)); index += 1) {
      expanded.push({ ...part, id: `${part.id}_${index + 1}`, quantity: 1 });
    }
  }
  return expanded;
}

function starterCandidatePoints(sheet: SheetSource, placements: Placement[], candidatePolygon: Polygon, debug?: NoFitPolygonDebug): Point[] {
  const points: Point[] = [{ x: sheet.border, y: sheet.border }];
  const clearance = Math.max(0, sheet.spacing + sheet.kerf);
  const nfpService = new NoFitPolygonService();
  for (const placement of placements) {
    const nfp = nfpService.generate(placement.polygon, candidatePolygon, clearance);
    points.push(...nfp.validPoints);
    debug?.boundaries.push(nfp.boundary);
    debug?.collisionZones.push(nfp.collisionZone);
    debug?.validPoints.push(...nfp.validPoints);
    const box = polygonBoundsSize(placement.polygon);
    points.push(
      { x: box.maxX + clearance, y: box.minY },
      { x: box.minX, y: box.maxY + clearance },
      { x: box.maxX + clearance, y: box.maxY + clearance },
      { x: sheet.border, y: box.maxY + clearance },
      { x: box.maxX + clearance, y: sheet.border }
    );
    for (const point of placement.polygon) {
      points.push({ x: point.x + clearance, y: box.minY }, { x: box.minX, y: point.y + clearance });
    }
  }
  return points.filter((point, index, list) => index === list.findIndex((candidate) => Math.abs(candidate.x - point.x) < 0.1 && Math.abs(candidate.y - point.y) < 0.1));
}

function starterPlacementScore(poly: Point[], weights: { y: number; x: number; waste: number }): number {
  const box = polygonBoundsSize(poly);
  const boundingWaste = Math.max(0, box.width * box.height - polygonArea(poly));
  return box.minY * weights.y + box.minX * weights.x + boundingWaste * weights.waste;
}

function starterRotationCandidates(part: NestPart, defaultRotations: number[], angleStepDegrees?: number) {
  if (part.allowRotation === false) return [0];
  const base = part.allowedRotations?.length ? part.allowedRotations : defaultRotations;
  const candidates = [...base];
  const step = Number(angleStepDegrees);
  if (Number.isFinite(step) && step > 0 && step < 90) {
    for (let angle = 0; angle < 360; angle += step) candidates.push(angle);
    for (const [start, end] of polygonEdges(part.polygon)) {
      if (distance(start, end) < 10) continue;
      const edgeAngle = normalizeRotationDegrees((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI);
      candidates.push(normalizeRotationDegrees(360 - edgeAngle));
    }
  }
  return uniqueRotations(candidates).slice(0, 32);
}

function makeStarterLeadIn(poly: Point[]): { start: Point; end: Point } {
  const box = polygonBoundsSize(poly);
  return {
    start: { x: box.minX - 4, y: box.minY + 4 },
    end: { x: box.minX, y: box.minY + 4 }
  };
}

function makeStarterMicroJoins(poly: Point[]): Point[] {
  const box = polygonBoundsSize(poly);
  const joins: Point[] = [];
  if (box.width > 250 || box.height > 250) {
    joins.push({ x: box.minX + box.width / 2, y: box.minY }, { x: box.minX + box.width / 2, y: box.maxY });
  }
  if (box.width > 700 || box.height > 700) {
    joins.push({ x: box.minX, y: box.minY + box.height / 2 }, { x: box.maxX, y: box.minY + box.height / 2 });
  }
  return joins;
}

function starterCommonLineEstimate(placements: Placement[], tolerance = 0.01): number {
  let saving = 0;
  for (let i = 0; i < placements.length; i += 1) {
    const a = polygonBoundsSize(placements[i].polygon);
    for (let j = i + 1; j < placements.length; j += 1) {
      const b = polygonBoundsSize(placements[j].polygon);
      const verticalTouch = Math.abs(a.maxX - b.minX) <= tolerance || Math.abs(b.maxX - a.minX) <= tolerance;
      const horizontalTouch = Math.abs(a.maxY - b.minY) <= tolerance || Math.abs(b.maxY - a.minY) <= tolerance;
      if (verticalTouch) saving += Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
      if (horizontalTouch) saving += Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
    }
  }
  return Number(saving.toFixed(2));
}

function starterDxfPolyline(poly: Point[], layer = "CUT"): string {
  let dxf = `0\nLWPOLYLINE\n8\n${layer}\n90\n${poly.length}\n70\n1\n`;
  for (const point of poly) dxf += `10\n${point.x.toFixed(3)}\n20\n${point.y.toFixed(3)}\n`;
  return dxf;
}

function starterDxfLine(a: Point, b: Point, layer: string): string {
  return `0\nLINE\n8\n${layer}\n10\n${a.x.toFixed(3)}\n20\n${a.y.toFixed(3)}\n11\n${b.x.toFixed(3)}\n21\n${b.y.toFixed(3)}\n`;
}

function starterDxfText(text: string, point: Point, height = 20, layer = "TEXT"): string {
  return `0\nTEXT\n8\n${layer}\n10\n${point.x.toFixed(3)}\n20\n${point.y.toFixed(3)}\n40\n${height}\n1\n${text}\n`;
}

function exportStarterDXF(sheet: SheetSource, placements: Placement[], title: string, cutOrder: CutOperation[]): string {
  const sheetPoly: Point[] = [
    { x: 0, y: 0 },
    { x: sheet.width, y: 0 },
    { x: sheet.width, y: sheet.height },
    { x: 0, y: sheet.height }
  ];
  let dxf = "0\nSECTION\n2\nENTITIES\n";
  dxf += starterDxfPolyline(sheetPoly, sheet.type === "offcut" ? "OFFCUT_OUTLINE" : "SHEET");
  dxf += starterDxfText(title, { x: 20, y: sheet.height - 40 }, 25);
  for (const placement of placements) {
    dxf += starterDxfPolyline(placement.polygon, "CUT");
    dxf += starterDxfLine(placement.leadIn.start, placement.leadIn.end, "LEAD_IN");
    for (const join of placement.microJoins) dxf += starterDxfLine({ x: join.x - 3, y: join.y }, { x: join.x + 3, y: join.y }, "MICRO_JOIN");
    const box = polygonBoundsSize(placement.polygon);
    dxf += starterDxfText(placement.name, { x: box.minX + 5, y: box.minY + 15 }, 10);
  }
  for (const operation of cutOrder) {
    dxf += starterDxfText(String(operation.cutOrder), { x: operation.x, y: operation.y }, 10, "CUT_ORDER");
  }
  return `${dxf}0\nENDSEC\n0\nEOF\n`;
}

function runStarterNestingAttempt(instances: NestPart[], sheet: SheetSource, started: number, maxMs: number, rotations: number[], placementWeights: { y: number; x: number; waste: number }, angleStepDegrees?: number) {
  const placements: Placement[] = [];
  const unplaced: NestPart[] = [];
  const warnings: string[] = [];
  const nfpDebug: NoFitPolygonDebug = { boundaries: [], collisionZones: [], validPoints: [] };
  for (const part of instances) {
    if (Date.now() - started > maxMs) {
      warnings.push("Optimization time limit reached. Returning best result so far.");
      unplaced.push(part);
      continue;
    }
    let best: { x: number; y: number; rotation: number; polygon: Point[]; score: number } | null = null;
    for (const rotation of starterRotationCandidates(part, rotations, angleStepDegrees)) {
      const rotated = normalizePolygon(rotatePolygon(part.polygon, rotation));
      for (const point of starterCandidatePoints(sheet, placements, rotated, nfpDebug)) {
        const moved = movePolygon(rotated, point.x, point.y);
        if (!polygonInsideSheet(moved, sheet)) continue;
        if (starterHasCollision(moved, placements, sheet.spacing + sheet.kerf)) continue;
        const candidateScore = starterPlacementScore(moved, placementWeights);
        if (!best || candidateScore < best.score) best = { x: point.x, y: point.y, rotation, polygon: moved, score: candidateScore };
      }
    }
    if (!best) {
      unplaced.push(part);
      warnings.push(`Could not place ${part.name}`);
      continue;
    }
    placements.push({
      partId: part.id,
      name: part.name,
      x: best.x,
      y: best.y,
      rotation: best.rotation,
      polygon: best.polygon,
      microJoins: makeStarterMicroJoins(best.polygon),
      leadIn: makeStarterLeadIn(best.polygon)
    });
  }
  nfpDebug.validPoints = nfpDebug.validPoints
    .filter((point, index, list) => index === list.findIndex((candidate) => Math.abs(candidate.x - point.x) < 0.1 && Math.abs(candidate.y - point.y) < 0.1))
    .slice(0, 1000);
  return { placements, unplaced, warnings, nfpDebug };
}

export function runAdvancedNesting(
  parts: NestPart[],
  sheet: SheetSource,
  options?: {
    customerName?: string;
    nestName?: string;
    maxOptimizationMs?: number;
    angleStepDegrees?: number;
  }
): NestResult {
  const start = Date.now();
  const maxMs = clamp(Number(options?.maxOptimizationMs) || 10_000, 250, 60_000);
  const baseInstances = expandNestParts(parts)
    .map((part) => ({ ...part, polygon: normalizePolygon(part.polygon) }))
    .sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon));
  let attemptsCompleted = 0;
  let bestAttempt: (ReturnType<typeof runStarterNestingAttempt> & { usagePercent: number; wastePercent: number; score: number }) | null = null;
  const orders = [
    baseInstances,
    [...baseInstances].sort((a, b) => polygonBoundsSize(b.polygon).height - polygonBoundsSize(a.polygon).height || polygonArea(b.polygon) - polygonArea(a.polygon)),
    [...baseInstances].sort((a, b) => polygonBoundsSize(b.polygon).width - polygonBoundsSize(a.polygon).width || polygonArea(b.polygon) - polygonArea(a.polygon)),
    [...baseInstances].sort((a, b) => a.name.localeCompare(b.name))
  ];
  const rotationPasses = [
    [0, 90, 180, 270],
    [90, 0, 270, 180],
    [0, 180, 90, 270],
    [270, 180, 90, 0]
  ];
  const placementWeightPasses = [
    { y: 100_000, x: 10, waste: 0.2 },
    { y: 70_000, x: 30, waste: 0.4 },
    { y: 120_000, x: 8, waste: 0.1 },
    { y: 80_000, x: 12, waste: 0.8 }
  ];
  const resultWeightPasses: OptimizationWeights[] = [
    { placed: 10_000, unplaced: 25_000, waste: 120, commonLine: 2, heat: 55 },
    { placed: 12_000, unplaced: 35_000, waste: 90, commonLine: 1, heat: 40 },
    { placed: 9_000, unplaced: 22_000, waste: 180, commonLine: 4, heat: 50 },
    { placed: 9_500, unplaced: 24_000, waste: 110, commonLine: 2, heat: 90 }
  ];
  for (let attempt = 0; Date.now() - start < maxMs && attempt < 128; attempt += 1) {
    const ordered = attempt < orders.length ? orders[attempt] : seededShuffle(baseInstances, 20_000 + attempt);
    const current = runStarterNestingAttempt(
      ordered,
      sheet,
      start,
      maxMs,
      rotationPasses[attempt % rotationPasses.length],
      placementWeightPasses[attempt % placementWeightPasses.length],
      options?.angleStepDegrees
    );
    attemptsCompleted += 1;
    const currentArea = current.placements.reduce((sum, placement) => sum + polygonArea(placement.polygon), 0);
    const usagePercent = round((currentArea / Math.max(1, sheet.width * sheet.height)) * 100, 0.01);
    const wastePercent = round(100 - usagePercent, 0.01);
    const heatAnalysis = new HeatAnalysisService().analyzeStarter(current.placements, sheet);
    const commonLineSaving = starterCommonLineEstimate(current.placements);
    const weights = resultWeightPasses[attempt % resultWeightPasses.length];
    const score = current.placements.length * weights.placed - current.unplaced.length * weights.unplaced - wastePercent * weights.waste + commonLineSaving * weights.commonLine - heatAnalysis.heatScore * weights.heat;
    if (!bestAttempt || score > bestAttempt.score) bestAttempt = { ...current, usagePercent, wastePercent, score };
  }

  const placements = bestAttempt?.placements ?? [];
  const unplaced = bestAttempt?.unplaced ?? baseInstances;
  const warnings = bestAttempt?.warnings ?? [];
  const usagePercent = bestAttempt?.usagePercent ?? 0;
  const wastePercent = bestAttempt?.wastePercent ?? 100;
  const commonLineSaving = starterCommonLineEstimate(placements);
  const cutOrderService = new CutOrderService();
  const heatAnalysis = new HeatAnalysisService().analyzeStarter(placements, sheet);
  const cutOrder = cutOrderService.buildStarterCutOrder(placements, heatAnalysis);
  const placementsWithCutOrder = placements.map((placement) => {
    const outer = cutOrder.find((operation) => operation.placementId === placement.partId && operation.operation === "outer");
    return { ...placement, cutOrder: outer?.cutOrder };
  });
  const title = `${options?.customerName ?? "Customer"} - ${options?.nestName ?? "Nest"}`;
  return {
    placements: placementsWithCutOrder,
    unplaced,
    usagePercent,
    wastePercent,
    commonLineSaving,
    cutOrder,
    heatScore: heatAnalysis.heatScore,
    heatZones: heatAnalysis.heatZones,
    nfpDebug: bestAttempt?.nfpDebug ?? { boundaries: [], collisionZones: [], validPoints: [] },
    optimizationProgress: {
      attemptsCompleted,
      bestWastePercent: wastePercent,
      bestUsagePercent: usagePercent,
      placedPartsCount: placements.length,
      timeLimitMs: maxMs,
      returnedBestSoFar: Date.now() - start >= maxMs
    },
    warnings: Array.from(new Set([...warnings, ...cutOrderService.createStarterWarnings(placements), ...heatAnalysis.warnings])),
    dxf: exportStarterDXF(sheet, placementsWithCutOrder, title, cutOrder)
  };
}
