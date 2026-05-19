import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService } from "./brain-core.js";
import { GeometryNormalizer, runAdvancedNesting, type DxfOriginalEntity, type NestPart, type NestWarning, type Point, type SheetSource } from "./nesting-engine.js";
import { addOffcut, listOffcuts, type OffcutRecord } from "./stock-material.js";

export type NestingWorkspaceStatus = "draft" | "nested" | "exported" | "completed";
export type NestingSourceType = "sheet" | "offcut";
export type NestingOffcutStatus = "available" | "reserved" | "used" | "scrapped";

export type NestingWorkspaceRecord = {
  id: number;
  workspaceId: string | null;
  customerId: string | null;
  customerName: string;
  nestName: string;
  material: string;
  thickness: number;
  sourceType: NestingSourceType;
  sourceId: number | null;
  sheetWidth: number;
  sheetHeight: number;
  border: number;
  kerf: number;
  spacing: number;
  allowRotation: boolean;
  allowCommonLine: boolean;
  enableMicroJoins: boolean;
  leadInType: "line" | "arc";
  leadInLength: number;
  status: NestingWorkspaceStatus;
  wastePercent: number | null;
  usagePercent: number | null;
  estimatedCutLength: number | null;
  estimatedPierceCount: number | null;
  exportedDxfPath: string | null;
  createdAt: string;
  updatedAt: string;
  parts: NestingWorkspacePartRecord[];
  placements: NestingPlacementRecord[];
  warnings: NestWarning[];
};

export type NestingWorkspacePartRecord = {
  id: number;
  workspaceId: number;
  dxfFileId: string | null;
  jobId: string | null;
  quoteId: string | null;
  partDnaId: number | null;
  fileName: string;
  quantity: number;
  width: number;
  height: number;
  cutLength: number;
  pierceCount: number;
  geometryJson: string;
  previewGeometry: NestingPreviewGeometry;
  rawDxf: string | null;
  createdAt: string;
};

export type NestingPreviewGeometry = {
  outerContours: Point[][];
  innerHoles: Point[][];
  circles: Array<{ cx: number; cy: number; r: number }>;
  arcs: Array<{ cx: number; cy: number; r: number; startAngle: number; endAngle: number }>;
};

export type NestingPlacementRecord = {
  id: number;
  workspaceId: number;
  partId: number;
  fileName?: string | null;
  previewGeometry?: NestingPreviewGeometry;
  sheetIndex: number;
  x: number;
  y: number;
  rotation: number;
  mirrored: boolean;
  isManual: boolean;
  hasCollision: boolean;
  isOutsideSheet: boolean;
  createdAt: string;
};

export type NestingOffcutRecord = {
  id: number;
  sourceWorkspaceId: number | null;
  sourceJobId: string | null;
  sourceCustomerId: string | null;
  material: string;
  thickness: number;
  width: number;
  height: number;
  shapeJson: string | null;
  previewJson: string | null;
  usableArea: number;
  location: string | null;
  status: NestingOffcutStatus;
  createdAt: string;
  updatedAt: string;
};

export type OffcutRecommendation = {
  source: "nesting" | "stock" | "sheet" | "order";
  offcutId: number | null;
  stockOffcutId?: number | null;
  material: string;
  thickness: number;
  width: number;
  height: number;
  fitsNormal: boolean;
  fitsRotated: boolean;
  wastePercent: number;
  estimatedSaving: number;
  message: string;
  previewJson: string | null;
  offcut?: NestingOffcutRecord | OffcutRecord | null;
};

function nowIso() {
  return new Date().toISOString();
}

function positive(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function nonNegative(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function boolInt(value: unknown) {
  return value ? 1 : 0;
}

function parseJson(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safeFileSegment(value: string) {
  return (value.trim() || "Customer").replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

function dateStamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, spacing: number) {
  return (
    a.x < b.x + b.width + spacing &&
    a.x + a.width + spacing > b.x &&
    a.y < b.y + b.height + spacing &&
    a.y + a.height + spacing > b.y
  );
}

function rotatedSize(part: Pick<NestingWorkspacePartRecord, "width" | "height">, rotation: number) {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return normalized === 90 || normalized === 270 ? { width: part.height, height: part.width } : { width: part.width, height: part.height };
}

function pointKey(point: Point) {
  return `${Math.round(point.x * 100) / 100},${Math.round(point.y * 100) / 100}`;
}

function convexHull(points: Point[]) {
  const unique = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .filter((point, index, list) => index === list.findIndex((entry) => Math.abs(entry.x - point.x) < 0.01 && Math.abs(entry.y - point.y) < 0.01))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (unique.length <= 3) return unique;
  const cross = (origin: Point, a: Point, b: Point) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
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

function pointsFromGeometryJson(parsed: Record<string, unknown>) {
  const points: Point[] = [];
  const addPoint = (point: unknown) => {
    if (!point || typeof point !== "object") return;
    const candidate = point as Record<string, unknown>;
    const x = Number(candidate.x);
    const y = Number(candidate.y);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  };
  const addPolygon = (polygon: unknown) => {
    if (Array.isArray(polygon)) polygon.forEach(addPoint);
  };
  const addPolygons = (polygons: unknown) => {
    if (Array.isArray(polygons)) polygons.forEach(addPolygon);
  };
  const previewGeometry = parsed.previewGeometry && typeof parsed.previewGeometry === "object" ? parsed.previewGeometry as Record<string, unknown> : {};
  addPolygons(previewGeometry.outerContours);
  addPolygons(previewGeometry.innerHoles);
  addPolygon(parsed.outerContour);
  addPolygon(parsed.simplifiedPolygon);
  addPolygon(parsed.preview);
  addPolygons(parsed.holes);
  if (Array.isArray(parsed.segments)) {
    for (const segment of parsed.segments) {
      if (!segment || typeof segment !== "object") continue;
      const source = segment as Record<string, unknown>;
      const x1 = Number(source.x1);
      const y1 = Number(source.y1);
      const x2 = Number(source.x2);
      const y2 = Number(source.y2);
      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        points.push({ x: x1, y: y1 }, { x: x2, y: y2 });
      }
    }
  }
  for (const circle of Array.isArray(previewGeometry.circles) ? previewGeometry.circles : []) {
    if (!circle || typeof circle !== "object") continue;
    const source = circle as Record<string, unknown>;
    const cx = Number(source.cx);
    const cy = Number(source.cy);
    const r = Number(source.r);
    if ([cx, cy, r].every(Number.isFinite) && r > 0) points.push({ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r });
  }
  return points;
}

function buildCollisionPolygon(points: Point[], fallbackWidth: number, fallbackHeight: number) {
  const hull = convexHull(points);
  if (hull.length >= 3 && polygonArea(hull) > 0.01) return hull;
  return [{ x: 0, y: 0 }, { x: fallbackWidth, y: 0 }, { x: fallbackWidth, y: fallbackHeight }, { x: 0, y: fallbackHeight }];
}

function polygonFromPart(part: NestingWorkspacePartRecord): Point[] {
  const parsed = parseJson(part.geometryJson);
  const collision = Array.isArray(parsed.collisionPolygon) ? parsed.collisionPolygon as Point[] : [];
  if (collision.length >= 3) return collision.map((point) => ({ x: Number(point.x), y: Number(point.y) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const simplified = Array.isArray(parsed.simplifiedPolygon) ? parsed.simplifiedPolygon as Point[] : [];
  const outer = Array.isArray(parsed.outerContour) ? parsed.outerContour as Point[] : [];
  const footprint = buildCollisionPolygon(pointsFromGeometryJson(parsed), part.width, part.height);
  const footprintBounds = boundsForPoints(footprint);
  const simpleBounds = simplified.length >= 3 ? boundsForPoints(simplified) : outer.length >= 3 ? boundsForPoints(outer) : null;
  if (simpleBounds && (footprintBounds.width > simpleBounds.width + 1 || footprintBounds.height > simpleBounds.height + 1)) return footprint;
  const polygon = simplified.length >= 3 ? simplified : outer;
  if (polygon.length >= 3) return polygon.map((point) => ({ x: Number(point.x), y: Number(point.y) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const preview = part.previewGeometry.outerContours[0] ?? [];
  if (preview.length >= 3) return preview;
  return [{ x: 0, y: 0 }, { x: part.width, y: 0 }, { x: part.width, y: part.height }, { x: 0, y: part.height }];
}

function rotatePoint(point: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
  };
}

function transformPoint(point: Point, x: number, y: number, rotation: number, rotatedBounds?: { minX: number; minY: number }): Point {
  const rotated = rotatePoint(point, rotation);
  return { x: rotated.x - (rotatedBounds?.minX ?? 0) + x, y: rotated.y - (rotatedBounds?.minY ?? 0) + y };
}

function boundsForPoints(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

function transformedPartPolygon(part: NestingWorkspacePartRecord, x: number, y: number, rotation: number) {
  const polygon = polygonFromPart(part);
  const rotated = polygon.map((point) => rotatePoint(point, rotation));
  const bounds = boundsForPoints(rotated);
  return polygon.map((point) => transformPoint(point, x, y, rotation, bounds));
}

function ccw(a: Point, b: Point, c: Point) {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

function lineSegmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function pointInsidePolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / Math.max(1e-9, b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function polygonEdges(poly: Point[]) {
  return poly.map((point, index) => [point, poly[(index + 1) % poly.length]] as const);
}

function polygonArea(points: Point[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

function polygonDistance(a: Point[], b: Point[]) {
  const segmentDistance = (p: Point, start: Point, end: Point) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - start.x, p.y - start.y);
    const t = Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - (start.x + t * dx), p.y - (start.y + t * dy));
  };
  let best = Number.POSITIVE_INFINITY;
  for (const [a1, a2] of polygonEdges(a)) {
    for (const [b1, b2] of polygonEdges(b)) {
      best = Math.min(best, segmentDistance(a1, b1, b2), segmentDistance(a2, b1, b2), segmentDistance(b1, a1, a2), segmentDistance(b2, a1, a2));
    }
  }
  return best;
}

function polygonsTouchOrOverlap(a: Point[], b: Point[], spacing: number) {
  const aBox = boundsForPoints(a);
  const bBox = boundsForPoints(b);
  if (aBox.minX >= bBox.maxX + spacing || aBox.maxX + spacing <= bBox.minX || aBox.minY >= bBox.maxY + spacing || aBox.maxY + spacing <= bBox.minY) return false;
  for (const [a1, a2] of polygonEdges(a)) {
    for (const [b1, b2] of polygonEdges(b)) {
      if (lineSegmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  if (a.some((point) => pointInsidePolygon(point, b)) || b.some((point) => pointInsidePolygon(point, a))) return true;
  return polygonDistance(a, b) < spacing;
}

function entityNumbers(entity: DxfOriginalEntity, code: string) {
  return (entity.values[code] ?? []).map(Number).filter(Number.isFinite);
}

function entityPreviewPoints(entity: DxfOriginalEntity): Point[] {
  const xs = entityNumbers(entity, "10");
  const ys = entityNumbers(entity, "20");
  const radii = entityNumbers(entity, "40");
  if (entity.type === "CIRCLE" || entity.type === "ARC") {
    const cx = xs[0] ?? 0;
    const cy = ys[0] ?? 0;
    const r = radii[0] ?? 0;
    return [{ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r }];
  }
  return xs.map((x, index) => ({ x, y: ys[index] ?? 0 }));
}

function buildPreviewGeometry(normalized: { outerContour: Point[]; holes: Point[][]; originalDxfEntities: DxfOriginalEntity[] }): NestingPreviewGeometry {
  const sourcePoints = normalized.originalDxfEntities.flatMap(entityPreviewPoints);
  const minX = sourcePoints.length ? Math.min(...sourcePoints.map((point) => point.x)) : 0;
  const minY = sourcePoints.length ? Math.min(...sourcePoints.map((point) => point.y)) : 0;
  const circles = normalized.originalDxfEntities
    .filter((entity) => entity.type === "CIRCLE")
    .map((entity) => {
      const cx = entityNumbers(entity, "10")[0] ?? 0;
      const cy = entityNumbers(entity, "20")[0] ?? 0;
      const r = entityNumbers(entity, "40")[0] ?? 0;
      return { cx: cx - minX, cy: cy - minY, r };
    })
    .filter((circle) => circle.r > 0);
  const arcs = normalized.originalDxfEntities
    .filter((entity) => entity.type === "ARC")
    .map((entity) => {
      const cx = entityNumbers(entity, "10")[0] ?? 0;
      const cy = entityNumbers(entity, "20")[0] ?? 0;
      const r = entityNumbers(entity, "40")[0] ?? 0;
      const startAngle = entityNumbers(entity, "50")[0] ?? 0;
      const endAngle = entityNumbers(entity, "51")[0] ?? 360;
      return { cx: cx - minX, cy: cy - minY, r, startAngle, endAngle };
    })
    .filter((arc) => arc.r > 0);
  return {
    outerContours: normalized.outerContour.length ? [normalized.outerContour] : [],
    innerHoles: normalized.holes,
    circles,
    arcs
  };
}

function previewGeometryFromJson(geometryJson: string): NestingPreviewGeometry {
  const parsed = parseJson(geometryJson);
  const explicit = parsed.previewGeometry as Partial<NestingPreviewGeometry> | undefined;
  const legacyOuter = Array.isArray(parsed.outerContour) ? parsed.outerContour as Point[] : [];
  const legacyPreview = Array.isArray(parsed.preview) ? parsed.preview as Point[] : [];
  const legacyHoles = Array.isArray(parsed.holes) ? parsed.holes as Point[][] : [];
  return {
    outerContours: explicit?.outerContours?.length ? explicit.outerContours : legacyOuter.length ? [legacyOuter] : legacyPreview.length ? [legacyPreview] : [],
    innerHoles: explicit?.innerHoles ?? legacyHoles,
    circles: explicit?.circles ?? [],
    arcs: explicit?.arcs ?? []
  };
}

function rowToPart(row: Record<string, unknown>): NestingWorkspacePartRecord {
  const geometryJson = String(row.geometryJson ?? "{}");
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspaceId),
    dxfFileId: row.dxfFileId ? String(row.dxfFileId) : null,
    jobId: row.jobId ? String(row.jobId) : null,
    quoteId: row.quoteId ? String(row.quoteId) : null,
    partDnaId: row.partDnaId === null || row.partDnaId === undefined ? null : Number(row.partDnaId),
    fileName: String(row.fileName ?? ""),
    quantity: Number(row.quantity ?? 1),
    width: Number(row.width ?? 0),
    height: Number(row.height ?? 0),
    cutLength: Number(row.cutLength ?? 0),
    pierceCount: Number(row.pierceCount ?? 0),
    geometryJson,
    previewGeometry: previewGeometryFromJson(geometryJson),
    rawDxf: row.rawDxf ? String(row.rawDxf) : null,
    createdAt: String(row.createdAt ?? "")
  };
}

function rowToPlacement(row: Record<string, unknown>): NestingPlacementRecord {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspaceId),
    partId: Number(row.partId),
    sheetIndex: Number(row.sheetIndex ?? 0),
    x: Number(row.x ?? 0),
    y: Number(row.y ?? 0),
    rotation: Number(row.rotation ?? 0),
    mirrored: Boolean(row.mirrored),
    isManual: Boolean(row.isManual),
    hasCollision: Boolean(row.hasCollision),
    isOutsideSheet: Boolean(row.isOutsideSheet),
    createdAt: String(row.createdAt ?? "")
  };
}

function rowToOffcut(row: Record<string, unknown>): NestingOffcutRecord {
  return {
    id: Number(row.id),
    sourceWorkspaceId: row.sourceWorkspaceId === null || row.sourceWorkspaceId === undefined ? null : Number(row.sourceWorkspaceId),
    sourceJobId: row.sourceJobId ? String(row.sourceJobId) : null,
    sourceCustomerId: row.sourceCustomerId ? String(row.sourceCustomerId) : null,
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    width: Number(row.width ?? 0),
    height: Number(row.height ?? 0),
    shapeJson: row.shapeJson ? String(row.shapeJson) : null,
    previewJson: row.previewJson ? String(row.previewJson) : null,
    usableArea: Number(row.usableArea ?? 0),
    location: row.location ? String(row.location) : null,
    status: String(row.status ?? "available") as NestingOffcutStatus,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? "")
  };
}

export function openNestingWorkspaceDatabase(rootDir: string) {
  fs.mkdirSync(rootDir, { recursive: true });
  const dbPath = path.join(rootDir, "qouterx-nesting-workspace.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS nesting_workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT,
      customerId TEXT,
      customerName TEXT NOT NULL,
      nestName TEXT NOT NULL,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      sourceType TEXT NOT NULL CHECK(sourceType IN ('sheet', 'offcut')),
      sourceId INTEGER,
      sheetWidth REAL NOT NULL,
      sheetHeight REAL NOT NULL,
      border REAL NOT NULL,
      kerf REAL NOT NULL,
      spacing REAL NOT NULL,
      allowRotation INTEGER NOT NULL,
      allowCommonLine INTEGER NOT NULL,
      enableMicroJoins INTEGER NOT NULL,
      leadInType TEXT NOT NULL DEFAULT 'line',
      leadInLength REAL NOT NULL DEFAULT 3,
      status TEXT NOT NULL CHECK(status IN ('draft', 'nested', 'exported', 'completed')),
      wastePercent REAL,
      usagePercent REAL,
      estimatedCutLength REAL,
      estimatedPierceCount INTEGER,
      exportedDxfPath TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nesting_workspace_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId INTEGER NOT NULL,
      dxfFileId TEXT,
      jobId TEXT,
      quoteId TEXT,
      partDnaId INTEGER,
      fileName TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      cutLength REAL NOT NULL,
      pierceCount INTEGER NOT NULL,
      geometryJson TEXT NOT NULL DEFAULT '{}',
      rawDxf TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(workspaceId) REFERENCES nesting_workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nesting_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId INTEGER NOT NULL,
      partId INTEGER NOT NULL,
      sheetIndex INTEGER NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      rotation REAL NOT NULL,
      mirrored INTEGER NOT NULL,
      isManual INTEGER NOT NULL,
      hasCollision INTEGER NOT NULL,
      isOutsideSheet INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(workspaceId) REFERENCES nesting_workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(partId) REFERENCES nesting_workspace_parts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nesting_offcuts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceWorkspaceId INTEGER,
      sourceJobId TEXT,
      sourceCustomerId TEXT,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      shapeJson TEXT,
      previewJson TEXT,
      usableArea REAL NOT NULL,
      location TEXT,
      status TEXT NOT NULL CHECK(status IN ('available', 'reserved', 'used', 'scrapped')),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nesting_exports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId INTEGER NOT NULL,
      customerId TEXT,
      customerName TEXT NOT NULL,
      exportFileName TEXT NOT NULL,
      exportPath TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(workspaceId) REFERENCES nesting_workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_nesting_ws_workspace ON nesting_workspaces(workspaceId, status, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_nesting_ws_parts ON nesting_workspace_parts(workspaceId);
    CREATE INDEX IF NOT EXISTS idx_nesting_ws_placements ON nesting_placements(workspaceId, sheetIndex);
    CREATE INDEX IF NOT EXISTS idx_nesting_offcuts_lookup ON nesting_offcuts(material, thickness, status);
  `);
  return db;
}

export class NestingWorkspaceService {
  private readonly normalizer = new GeometryNormalizer();

  constructor(
    private readonly db: DatabaseSync,
    private readonly stockDb: DatabaseSync,
    private readonly exportRoot: string,
    private readonly brainCore?: BrainCoreService
  ) {}

  createWorkspace(input: {
    workspaceId?: string | null;
    customerId?: string | null;
    customerName?: string | null;
    nestName?: string | null;
    material: string;
    thickness: number;
    sourceType?: NestingSourceType;
    sourceId?: number | null;
    sheetWidth: number;
    sheetHeight: number;
    border?: number;
    kerf?: number;
    spacing?: number;
    allowRotation?: boolean;
    allowCommonLine?: boolean;
    enableMicroJoins?: boolean;
    leadInType?: "line" | "arc";
    leadInLength?: number;
  }) {
    const now = nowIso();
    const material = String(input.material ?? "").trim();
    if (!material) throw new Error("material is required");
    const insert = this.db.prepare(
      `INSERT INTO nesting_workspaces
       (workspaceId, customerId, customerName, nestName, material, thickness, sourceType, sourceId, sheetWidth, sheetHeight, border, kerf, spacing,
        allowRotation, allowCommonLine, enableMicroJoins, leadInType, leadInLength, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
    ).run(
      input.workspaceId?.trim() || null,
      input.customerId?.trim() || null,
      input.customerName?.trim() || "Walk-in",
      input.nestName?.trim() || `Nest ${now.slice(0, 10)}`,
      material,
      positive(input.thickness, 1),
      input.sourceType === "offcut" ? "offcut" : "sheet",
      input.sourceId ?? null,
      positive(input.sheetWidth, 3000),
      positive(input.sheetHeight, 1500),
      nonNegative(input.border, 10),
      nonNegative(input.kerf, 0.2),
      nonNegative(input.spacing, 5),
      boolInt(input.allowRotation ?? true),
      boolInt(input.allowCommonLine ?? true),
      boolInt(input.enableMicroJoins ?? true),
      input.leadInType === "arc" ? "arc" : "line",
      positive(input.leadInLength, 3),
      now,
      now
    );
    const workspace = this.getWorkspace(Number(insert.lastInsertRowid));
    this.emitEvent(input.workspaceId, "nesting_workspace_created", "nesting_workspace", String(workspace?.id ?? insert.lastInsertRowid), {
      customerName: workspace?.customerName,
      material,
      thickness: positive(input.thickness, 1)
    });
    return workspace;
  }

  listWorkspaces(workspaceId?: string | null) {
    const rows = workspaceId?.trim()
      ? this.db.prepare(`SELECT * FROM nesting_workspaces WHERE workspaceId = ? ORDER BY updatedAt DESC, id DESC`).all(workspaceId.trim())
      : this.db.prepare(`SELECT * FROM nesting_workspaces ORDER BY updatedAt DESC, id DESC`).all();
    return (rows as Record<string, unknown>[]).map((row) => this.hydrateWorkspace(row));
  }

  getWorkspace(id: number) {
    const row = this.db.prepare(`SELECT * FROM nesting_workspaces WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.hydrateWorkspace(row) : null;
  }

  updateWorkspace(id: number, patch: Record<string, unknown>) {
    const current = this.getWorkspace(id);
    if (!current) throw new Error("nesting workspace not found");
    const next = { ...current, ...patch };
    this.db.prepare(
      `UPDATE nesting_workspaces
       SET customerId = ?, customerName = ?, nestName = ?, material = ?, thickness = ?, sourceType = ?, sourceId = ?, sheetWidth = ?, sheetHeight = ?,
           border = ?, kerf = ?, spacing = ?, allowRotation = ?, allowCommonLine = ?, enableMicroJoins = ?, leadInType = ?, leadInLength = ?, updatedAt = ?
       WHERE id = ?`
    ).run(
      typeof next.customerId === "string" && next.customerId.trim() ? next.customerId.trim() : null,
      String(next.customerName ?? "Walk-in").trim() || "Walk-in",
      String(next.nestName ?? "Nest").trim() || "Nest",
      String(next.material ?? "").trim(),
      positive(next.thickness, current.thickness),
      next.sourceType === "offcut" ? "offcut" : "sheet",
      next.sourceId ?? null,
      positive(next.sheetWidth, current.sheetWidth),
      positive(next.sheetHeight, current.sheetHeight),
      nonNegative(next.border, current.border),
      nonNegative(next.kerf, current.kerf),
      nonNegative(next.spacing, current.spacing),
      boolInt(Boolean(next.allowRotation)),
      boolInt(Boolean(next.allowCommonLine)),
      boolInt(Boolean(next.enableMicroJoins)),
      next.leadInType === "arc" ? "arc" : "line",
      positive(next.leadInLength, current.leadInLength),
      nowIso(),
      id
    );
    return this.getWorkspace(id);
  }

  addPart(workspaceId: number, input: {
    dxfFileId?: string | null;
    jobId?: string | number | null;
    quoteId?: string | null;
    partDnaId?: number | null;
    fileName?: string | null;
    quantity?: number;
    width?: number;
    height?: number;
    cutLength?: number;
    pierceCount?: number;
    rawDxf?: string | null;
  }) {
    const workspace = this.requireWorkspace(workspaceId);
    const normalized = this.normalizer.normalize({
      itemId: 0,
      jobId: input.jobId === null || input.jobId === undefined ? null : String(input.jobId),
      quoteId: input.quoteId ?? null,
      partDnaId: input.partDnaId ?? null,
      dxfFileId: input.dxfFileId ?? null,
      rawDxf: input.rawDxf ?? null,
      quantity: Math.max(1, Math.round(Number(input.quantity) || 1)),
      width: input.width,
      height: input.height,
      cutLength: input.cutLength,
      pierceCount: input.pierceCount
    });
    const previewGeometry = buildPreviewGeometry(normalized);
    const collisionPolygon = buildCollisionPolygon(
      [
        ...normalized.outerContour,
        ...normalized.holes.flat(),
        ...normalized.segments.flatMap((segment) => [{ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }])
      ],
      normalized.width,
      normalized.height
    );
    const geometry = {
      previewGeometry,
      collisionPolygon,
      outerContour: normalized.outerContour,
      holes: normalized.holes,
      simplifiedPolygon: normalized.simplifiedPolygon,
      segments: normalized.segments.slice(0, 400),
      originalEntities: normalized.originalDxfEntities,
      preview: normalized.outerContour.length ? normalized.outerContour : this.rectPolygon(normalized.width, normalized.height)
    };
    const now = nowIso();
    const insert = this.db.prepare(
      `INSERT INTO nesting_workspace_parts
       (workspaceId, dxfFileId, jobId, quoteId, partDnaId, fileName, quantity, width, height, cutLength, pierceCount, geometryJson, rawDxf, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      workspaceId,
      input.dxfFileId ?? null,
      input.jobId === null || input.jobId === undefined ? null : String(input.jobId),
      input.quoteId ?? null,
      input.partDnaId ?? null,
      input.fileName?.trim() || input.dxfFileId || "Part.dxf",
      normalized.quantity,
      normalized.width,
      normalized.height,
      normalized.cutLength,
      normalized.pierceCount,
      JSON.stringify(geometry),
      input.rawDxf ?? null,
      now
    );
    this.touch(workspaceId);
    this.emitEvent(workspace.workspaceId, "nesting_parts_added", "nesting_workspace", String(workspaceId), {
      partId: Number(insert.lastInsertRowid),
      quantity: normalized.quantity,
      width: normalized.width,
      height: normalized.height
    });
    return this.getPart(Number(insert.lastInsertRowid));
  }

  deletePart(workspaceId: number, partId: number) {
    this.requireWorkspace(workspaceId);
    this.db.prepare(`DELETE FROM nesting_workspace_parts WHERE workspaceId = ? AND id = ?`).run(workspaceId, partId);
    this.touch(workspaceId);
  }

  updatePart(workspaceId: number, partId: number, patch: { quantity?: number }) {
    this.requireWorkspace(workspaceId);
    const current = this.getPart(partId);
    if (!current || current.workspaceId !== workspaceId) {
      throw new Error("nesting part not found");
    }
    if (patch.quantity !== undefined) {
      const quantity = Math.max(1, Math.round(Number(patch.quantity) || 1));
      this.db.prepare(`UPDATE nesting_workspace_parts SET quantity = ? WHERE workspaceId = ? AND id = ?`).run(quantity, workspaceId, partId);
    }
    this.touch(workspaceId);
    return this.getPart(partId);
  }

  savePlacements(workspaceId: number, placements: Array<{ partId: number; sheetIndex?: number; x: number; y: number; rotation?: number; mirrored?: boolean; isManual?: boolean }>) {
    const workspace = this.requireWorkspace(workspaceId);
    const parts = new Map(this.listParts(workspaceId).map((part) => [part.id, part]));
    const validated = this.validatePlacements(workspace, parts, placements);
    this.db.prepare(`DELETE FROM nesting_placements WHERE workspaceId = ?`).run(workspaceId);
    const now = nowIso();
    for (const placement of validated) {
      this.db.prepare(
        `INSERT INTO nesting_placements
         (workspaceId, partId, sheetIndex, x, y, rotation, mirrored, isManual, hasCollision, isOutsideSheet, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        workspaceId,
        placement.partId,
        placement.sheetIndex,
        placement.x,
        placement.y,
        placement.rotation,
        boolInt(placement.mirrored),
        boolInt(placement.isManual),
        boolInt(placement.hasCollision),
        boolInt(placement.isOutsideSheet),
        now
      );
    }
    const metrics = this.updateMetrics(workspaceId);
    this.touch(workspaceId);
    return { workspace: this.getWorkspace(workspaceId), metrics, warnings: this.buildWarnings(workspaceId) };
  }

  autoNest(workspaceId: number) {
    const workspace = this.requireWorkspace(workspaceId);
    const parts = this.listParts(workspaceId);
    const placements = this.safeBottomLeftPack(workspace, parts);
    return this.finishAutoNest(workspaceId, workspace, placements, { workspacePacker: true });
  }

  async autoNestInWorker(workspaceId: number) {
    const workspace = this.requireWorkspace(workspaceId);
    const parts = this.listParts(workspaceId);
    const fastPlacements = this.safeBottomLeftPack(workspace, parts);
    return this.finishAutoNest(workspaceId, workspace, fastPlacements, { workspacePacker: true, workerThread: false });
  }

  private async autoNestInOptimizationWorker(workspaceId: number, workspace: NestingWorkspaceRecord, parts: NestingWorkspacePartRecord[]) {
    try {
      const placements = await new Promise<Array<{ partId: number; sheetIndex: number; x: number; y: number; rotation: number; mirrored: boolean; isManual: boolean }>>((resolve, reject) => {
        const worker = new Worker(new URL("./nesting-workspace-worker.js", import.meta.url), {
          workerData: {
            workspace: {
              border: workspace.border,
              spacing: workspace.spacing,
              kerf: workspace.kerf,
              sheetWidth: workspace.sheetWidth,
              sheetHeight: workspace.sheetHeight,
              allowRotation: workspace.allowRotation,
              customerName: workspace.customerName,
              nestName: workspace.nestName
            },
            parts: parts.map((part) => ({
              id: part.id,
              name: part.fileName,
              quantity: part.quantity,
              width: part.width,
              height: part.height,
              polygon: polygonFromPart(part),
              allowRotation: workspace.allowRotation
            }))
          }
        });
        const timer = setTimeout(() => {
          worker.terminate().catch(() => undefined);
          reject(new Error("nesting worker timed out"));
        }, 3_000);
        worker.once("message", (message: { placements?: Array<{ partId: number; sheetIndex: number; x: number; y: number; rotation: number; mirrored: boolean; isManual: boolean }>; error?: string }) => {
          clearTimeout(timer);
          if (message.error) reject(new Error(message.error));
          else resolve(message.placements ?? []);
        });
        worker.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      const safePlacements = this.ensureNonOverlappingPlacements(workspace, parts, placements);
      return this.finishAutoNest(workspaceId, workspace, safePlacements, { workerThread: true });
    } catch {
      return this.autoNest(workspaceId);
    }
  }

  private finishAutoNest(
    workspaceId: number,
    workspace: NestingWorkspaceRecord,
    placements: Array<{ partId: number; sheetIndex: number; x: number; y: number; rotation: number; mirrored: boolean; isManual: boolean }>,
    payload: Record<string, unknown> = {}
  ) {
    const result = this.savePlacements(workspaceId, placements);
    this.db.prepare(`UPDATE nesting_workspaces SET status = 'nested', updatedAt = ? WHERE id = ?`).run(nowIso(), workspaceId);
    const updated = this.getWorkspace(workspaceId);
    this.emitEvent(workspace.workspaceId, "nesting_completed", "nesting_workspace", String(workspaceId), {
      wastePercent: updated?.wastePercent,
      usagePercent: updated?.usagePercent,
      estimatedCutLength: updated?.estimatedCutLength,
      estimatedPierceCount: updated?.estimatedPierceCount,
      sourceType: updated?.sourceType,
      sourceId: updated?.sourceId,
      ...payload
    });
    return { ...result, workspace: updated };
  }

  private buildEnginePlacements(workspace: NestingWorkspaceRecord, parts: NestingWorkspacePartRecord[]) {
    const engineParts: NestPart[] = parts.map((part) => ({
      id: String(part.id),
      name: part.fileName,
      quantity: part.quantity,
      polygon: polygonFromPart(part),
      allowRotation: workspace.allowRotation
    }));
    const sheet: SheetSource = {
      id: workspace.sourceId === null ? undefined : String(workspace.sourceId),
      type: workspace.sourceType,
      width: workspace.sheetWidth,
      height: workspace.sheetHeight,
      border: workspace.border,
      spacing: workspace.spacing,
      kerf: workspace.kerf
    };
    const result = runAdvancedNesting(engineParts, sheet, {
      customerName: workspace.customerName,
      nestName: workspace.nestName,
      maxOptimizationMs: 10_000
    });
    const placements = result.placements.map((placement) => ({
      partId: Number(String(placement.partId).split("_")[0]),
      sheetIndex: 0,
      x: placement.x,
      y: placement.y,
      rotation: placement.rotation,
      mirrored: false,
      isManual: false
    })).filter((placement) => Number.isFinite(placement.partId));
    return this.ensureNonOverlappingPlacements(workspace, parts, placements);
  }

  private ensureNonOverlappingPlacements(
    workspace: NestingWorkspaceRecord,
    parts: NestingWorkspacePartRecord[],
    placements: Array<{ partId: number; sheetIndex: number; x: number; y: number; rotation: number; mirrored: boolean; isManual: boolean }>
  ) {
    const partsMap = new Map(parts.map((part) => [part.id, part]));
    const validated = this.validatePlacements(workspace, partsMap, placements);
    if (!validated.some((placement) => placement.hasCollision || placement.isOutsideSheet)) return placements;
    return this.safeBottomLeftPack(workspace, parts);
  }

  private safeBottomLeftPack(workspace: NestingWorkspaceRecord, parts: NestingWorkspacePartRecord[]) {
    const partsMap = new Map(parts.map((part) => [part.id, part]));
    const expanded = parts
      .flatMap((part) => Array.from({ length: Math.max(1, Math.round(part.quantity || 1)) }, () => part))
      .sort((a, b) => polygonArea(polygonFromPart(b)) - polygonArea(polygonFromPart(a)));
    const placements: Array<{ partId: number; sheetIndex: number; x: number; y: number; rotation: number; mirrored: boolean; isManual: boolean }> = [];
    const spacing = Math.max(0, workspace.spacing + workspace.kerf);
    const rotations = workspace.allowRotation ? [0, 90, 180, 270] : [0];
    for (const part of expanded) {
      let best: { sheetIndex: number; x: number; y: number; rotation: number; score: number } | null = null;
      const maxSheet = Math.max(0, ...placements.map((placement) => placement.sheetIndex));
      for (let sheetIndex = 0; sheetIndex <= maxSheet + 1; sheetIndex += 1) {
        const sheetPlacements = placements.filter((placement) => placement.sheetIndex === sheetIndex);
        for (const rotation of rotations) {
          const candidates = this.safeCandidatePoints(workspace, part, rotation, sheetPlacements, spacing, partsMap);
          for (const candidate of candidates) {
            const polygon = transformedPartPolygon(part, candidate.x, candidate.y, rotation);
            const box = boundsForPoints(polygon);
            if (box.minX < workspace.border || box.minY < workspace.border || box.maxX > workspace.sheetWidth - workspace.border || box.maxY > workspace.sheetHeight - workspace.border) continue;
            const collides = sheetPlacements.some((placement) => {
              const other = partsMap.get(placement.partId);
              return other ? polygonsTouchOrOverlap(polygon, transformedPartPolygon(other, placement.x, placement.y, placement.rotation), spacing) : false;
            });
            if (collides) continue;
            const score = sheetIndex * 1_000_000_000 + box.minY * 100_000 + box.minX;
            if (!best || score < best.score) best = { sheetIndex, x: candidate.x, y: candidate.y, rotation, score };
          }
        }
        if (best?.sheetIndex === sheetIndex) break;
      }
      if (!best) {
        best = { sheetIndex: Math.max(0, ...placements.map((placement) => placement.sheetIndex)) + 1, x: workspace.border, y: workspace.border, rotation: 0, score: 0 };
      }
      placements.push({ partId: part.id, sheetIndex: best.sheetIndex, x: best.x, y: best.y, rotation: best.rotation, mirrored: false, isManual: false });
    }
    return placements;
  }

  private safeCandidatePoints(
    workspace: NestingWorkspaceRecord,
    part: NestingWorkspacePartRecord,
    rotation: number,
    placements: Array<{ partId: number; x: number; y: number; rotation: number }>,
    spacing: number,
    parts: Map<number, NestingWorkspacePartRecord>
  ) {
    const polygon = transformedPartPolygon(part, workspace.border, workspace.border, rotation);
    const partBox = boundsForPoints(polygon);
    const candidates: Point[] = [{ x: workspace.border, y: workspace.border }];
    for (const placement of placements) {
      const placedPart = parts.get(placement.partId);
      if (!placedPart) continue;
      const placedBox = boundsForPoints(transformedPartPolygon(placedPart, placement.x, placement.y, placement.rotation));
      candidates.push(
        { x: placedBox.maxX + spacing, y: placedBox.minY },
        { x: placedBox.minX, y: placedBox.maxY + spacing },
        { x: placedBox.maxX + spacing, y: placedBox.maxY + spacing },
        { x: workspace.border, y: placedBox.maxY + spacing },
        { x: placedBox.maxX + spacing, y: workspace.border },
        { x: Math.max(workspace.border, placedBox.minX - partBox.width - spacing), y: placedBox.minY },
        { x: placedBox.minX, y: Math.max(workspace.border, placedBox.minY - partBox.height - spacing) }
      );
    }
    return candidates
      .map((point) => ({
        x: Math.max(workspace.border, Math.min(point.x, workspace.sheetWidth - workspace.border - partBox.width)),
        y: Math.max(workspace.border, Math.min(point.y, workspace.sheetHeight - workspace.border - partBox.height))
      }))
      .filter((point, index, list) => index === list.findIndex((entry) => Math.abs(entry.x - point.x) < 0.1 && Math.abs(entry.y - point.y) < 0.1))
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }

  recommendOffcuts(input: { workspaceId?: number | null; material: string; thickness: number; requiredWidth?: number; requiredHeight?: number; requiredArea?: number }) {
    const workspace = input.workspaceId ? this.getWorkspace(input.workspaceId) : null;
    const parts = input.workspaceId ? this.listParts(input.workspaceId) : [];
    const required = this.requiredSize(parts, input.requiredWidth, input.requiredHeight, input.requiredArea);
    const material = String(input.material || workspace?.material || "").trim();
    const thickness = positive(input.thickness || workspace?.thickness, 1);
    const nestingOffcuts = this.listOffcuts({ material, thickness });
    const stockOffcuts = listOffcuts(this.stockDb).filter(
      (offcut) => offcut.status === "available" && offcut.material.trim().toLowerCase() === material.toLowerCase() && Math.abs(offcut.thickness - thickness) < 0.0001
    );
    const recommendations: OffcutRecommendation[] = [
      ...nestingOffcuts.map((offcut) => this.scoreOffcut("nesting", offcut, required)),
      ...stockOffcuts.map((offcut) => this.scoreOffcut("stock", offcut, required))
    ].filter((entry) => entry.fitsNormal || entry.fitsRotated)
      .sort((a, b) => b.estimatedSaving - a.estimatedSaving || a.wastePercent - b.wastePercent);
    if (recommendations[0]) {
      try {
        this.brainCore?.recommendationService.createRecommendation({
          moduleName: "nesting_workspace",
          recommendationType: "use_offcut_to_save_material",
          title: "Use offcut to save material",
          message: recommendations[0].message,
          confidence: 0.88,
          impactScore: Math.min(95, 55 + Math.round(recommendations[0].estimatedSaving / 20)),
          priority: recommendations[0].estimatedSaving > 500 ? "high" : "normal",
          entityType: input.workspaceId ? "nesting_workspace" : null,
          entityId: input.workspaceId ? String(input.workspaceId) : null,
          payload: { workspaceId: workspace?.workspaceId, offcutId: recommendations[0].offcutId, saving: recommendations[0].estimatedSaving }
        });
      } catch (error) {
        console.error("[nesting-workspace] brain recommendation failed:", error instanceof Error ? error.message : error);
      }
    }
    return {
      requiredWidth: required.width,
      requiredHeight: required.height,
      requiredArea: required.area,
      best: recommendations[0] ?? null,
      recommendations,
      materialOrderRequired: recommendations.length === 0
    };
  }

  listOffcuts(filter?: { material?: string; thickness?: number | null; status?: NestingOffcutStatus | "all" }) {
    const rows = this.db.prepare(`SELECT * FROM nesting_offcuts ORDER BY updatedAt DESC, id DESC`).all() as Record<string, unknown>[];
    return rows.map(rowToOffcut).filter((offcut) => {
      if (filter?.status && filter.status !== "all" && offcut.status !== filter.status) return false;
      if (filter?.material && offcut.material.trim().toLowerCase() !== filter.material.trim().toLowerCase()) return false;
      if (typeof filter?.thickness === "number" && Math.abs(offcut.thickness - filter.thickness) > 0.0001) return false;
      return true;
    });
  }

  createOffcut(input: {
    sourceWorkspaceId?: number | null;
    sourceJobId?: string | null;
    sourceCustomerId?: string | null;
    material: string;
    thickness: number;
    width: number;
    height: number;
    shapeJson?: string | null;
    previewJson?: string | null;
    location?: string | null;
    status?: NestingOffcutStatus;
  }) {
    const now = nowIso();
    const width = positive(input.width, 1);
    const height = positive(input.height, 1);
    const shapeJson = input.shapeJson ?? JSON.stringify({ type: "rect", width, height });
    const previewJson = input.previewJson ?? JSON.stringify({ outline: this.rectPolygon(width, height), cutouts: [], width, height });
    const insert = this.db.prepare(
      `INSERT INTO nesting_offcuts
       (sourceWorkspaceId, sourceJobId, sourceCustomerId, material, thickness, width, height, shapeJson, previewJson, usableArea, location, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.sourceWorkspaceId ?? null,
      input.sourceJobId ?? null,
      input.sourceCustomerId ?? null,
      input.material.trim(),
      positive(input.thickness, 1),
      width,
      height,
      shapeJson,
      previewJson,
      width * height,
      input.location?.trim() || null,
      input.status ?? "available",
      now,
      now
    );
    const offcut = this.listOffcuts({ status: "all" }).find((entry) => entry.id === Number(insert.lastInsertRowid)) ?? null;
    addOffcut(this.stockDb, {
      parentSheetId: null,
      material: input.material,
      thickness: positive(input.thickness, 1),
      width,
      height,
      shapeData: shapeJson,
      location: input.location ?? "Nesting offcuts",
      status: input.status ?? "available"
    });
    const source = input.sourceWorkspaceId ? this.getWorkspace(input.sourceWorkspaceId) : null;
    this.emitEvent(source?.workspaceId ?? null, "offcut_created", "nesting_offcut", String(offcut?.id ?? insert.lastInsertRowid), {
      sourceWorkspaceId: input.sourceWorkspaceId ?? null,
      material: input.material,
      thickness: input.thickness,
      width,
      height
    });
    return offcut;
  }

  createSuggestedOffcuts(workspaceId: number) {
    const workspace = this.requireWorkspace(workspaceId);
    const used = this.listPlacements(workspaceId).reduce((sum, placement) => {
      const part = this.getPart(placement.partId);
      if (!part) return sum;
      const size = rotatedSize(part, placement.rotation);
      return sum + size.width * size.height;
    }, 0);
    const sheetArea = workspace.sheetWidth * workspace.sheetHeight;
    const leftoverArea = Math.max(0, sheetArea - used);
    const width = Math.max(50, workspace.sheetWidth - workspace.border * 2);
    const height = Math.max(50, Math.min(workspace.sheetHeight / 3, leftoverArea / Math.max(1, width)));
    if (leftoverArea < 10_000 || height < 50) return [];
    const offcut = this.createOffcut({
      sourceWorkspaceId: workspaceId,
      sourceCustomerId: workspace.customerId,
      material: workspace.material,
      thickness: workspace.thickness,
      width,
      height,
      location: `From ${workspace.nestName}`
    });
    return offcut ? [offcut] : [];
  }

  exportDxf(workspaceId: number) {
    const workspace = this.requireWorkspace(workspaceId);
    if (!workspace.placements.length) this.autoNest(workspaceId);
    const current = this.requireWorkspace(workspaceId);
    const customer = safeFileSegment(current.customerName);
    const nest = safeFileSegment(current.nestName);
    const exportDir = path.join(this.exportRoot, customer);
    fs.mkdirSync(exportDir, { recursive: true });
    const exportFileName = `${customer}_${nest}_${dateStamp()}.dxf`;
    const exportPath = path.join(exportDir, exportFileName);
    fs.writeFileSync(exportPath, this.buildDxf(current), "utf8");
    const now = nowIso();
    this.db.prepare(`UPDATE nesting_workspaces SET status = 'exported', exportedDxfPath = ?, updatedAt = ? WHERE id = ?`).run(exportPath, now, workspaceId);
    this.db.prepare(`INSERT INTO nesting_exports (workspaceId, customerId, customerName, exportFileName, exportPath, createdAt) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(workspaceId, current.customerId, current.customerName, exportFileName, exportPath, now);
    this.emitEvent(current.workspaceId, "nesting_exported", "nesting_workspace", String(workspaceId), {
      exportPath,
      customerName: current.customerName,
      material: current.material,
      thickness: current.thickness
    });
    return { workspace: this.getWorkspace(workspaceId), exportPath, exportFileName };
  }

  history(workspaceId?: string | null) {
    return this.listWorkspaces(workspaceId).filter((workspace) => workspace.status !== "draft" || workspace.exportedDxfPath);
  }

  private hydrateWorkspace(row: Record<string, unknown>): NestingWorkspaceRecord {
    const id = Number(row.id);
    const parts = this.listParts(id);
    const placements = this.listPlacements(id).map((placement) => {
      const part = parts.find((entry) => entry.id === placement.partId);
      return {
        ...placement,
        fileName: part?.fileName ?? null,
        previewGeometry: part?.previewGeometry
      };
    });
    const workspace = {
      id,
      workspaceId: row.workspaceId ? String(row.workspaceId) : null,
      customerId: row.customerId ? String(row.customerId) : null,
      customerName: String(row.customerName ?? "Walk-in"),
      nestName: String(row.nestName ?? "Nest"),
      material: String(row.material ?? ""),
      thickness: Number(row.thickness ?? 0),
      sourceType: row.sourceType === "offcut" ? "offcut" : "sheet",
      sourceId: row.sourceId === null || row.sourceId === undefined ? null : Number(row.sourceId),
      sheetWidth: Number(row.sheetWidth ?? 0),
      sheetHeight: Number(row.sheetHeight ?? 0),
      border: Number(row.border ?? 0),
      kerf: Number(row.kerf ?? 0),
      spacing: Number(row.spacing ?? 0),
      allowRotation: Boolean(row.allowRotation),
      allowCommonLine: Boolean(row.allowCommonLine),
      enableMicroJoins: Boolean(row.enableMicroJoins),
      leadInType: row.leadInType === "arc" ? "arc" : "line",
      leadInLength: Number(row.leadInLength ?? 3),
      status: String(row.status ?? "draft") as NestingWorkspaceStatus,
      wastePercent: row.wastePercent === null || row.wastePercent === undefined ? null : Number(row.wastePercent),
      usagePercent: row.usagePercent === null || row.usagePercent === undefined ? null : Number(row.usagePercent),
      estimatedCutLength: row.estimatedCutLength === null || row.estimatedCutLength === undefined ? null : Number(row.estimatedCutLength),
      estimatedPierceCount: row.estimatedPierceCount === null || row.estimatedPierceCount === undefined ? null : Number(row.estimatedPierceCount),
      exportedDxfPath: row.exportedDxfPath ? String(row.exportedDxfPath) : null,
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? ""),
      parts,
      placements,
      warnings: []
    } satisfies NestingWorkspaceRecord;
    workspace.warnings = this.buildWarnings(id);
    return workspace;
  }

  private requireWorkspace(id: number) {
    const workspace = this.getWorkspace(id);
    if (!workspace) throw new Error("nesting workspace not found");
    return workspace;
  }

  private listParts(workspaceId: number) {
    return (this.db.prepare(`SELECT * FROM nesting_workspace_parts WHERE workspaceId = ? ORDER BY id ASC`).all(workspaceId) as Record<string, unknown>[]).map(rowToPart);
  }

  private listPlacements(workspaceId: number) {
    return (this.db.prepare(`SELECT * FROM nesting_placements WHERE workspaceId = ? ORDER BY sheetIndex ASC, y ASC, x ASC, id ASC`).all(workspaceId) as Record<string, unknown>[]).map(rowToPlacement);
  }

  private getPart(partId: number) {
    const row = this.db.prepare(`SELECT * FROM nesting_workspace_parts WHERE id = ?`).get(partId) as Record<string, unknown> | undefined;
    return row ? rowToPart(row) : null;
  }

  private validatePlacements(
    workspace: NestingWorkspaceRecord,
    parts: Map<number, NestingWorkspacePartRecord>,
    placements: Array<{ partId: number; sheetIndex?: number; x: number; y: number; rotation?: number; mirrored?: boolean; isManual?: boolean }>
  ) {
    return placements.map((placement, index) => {
      const part = parts.get(placement.partId);
      if (!part) throw new Error(`unknown nesting part: ${placement.partId}`);
      const rotation = Number(placement.rotation ?? 0);
      const polygon = transformedPartPolygon(part, Number(placement.x), Number(placement.y), rotation);
      const rect = boundsForPoints(polygon);
      const isOutsideSheet =
        rect.minX < workspace.border ||
        rect.minY < workspace.border ||
        rect.maxX > workspace.sheetWidth - workspace.border ||
        rect.maxY > workspace.sheetHeight - workspace.border;
      const hasCollision = placements.some((other, otherIndex) => {
        if (otherIndex === index || Number(other.sheetIndex ?? 0) !== Number(placement.sheetIndex ?? 0)) return false;
        const otherPart = parts.get(other.partId);
        if (!otherPart) return false;
        const otherPolygon = transformedPartPolygon(otherPart, Number(other.x), Number(other.y), Number(other.rotation ?? 0));
        return polygonsTouchOrOverlap(polygon, otherPolygon, workspace.spacing + workspace.kerf);
      });
      return {
        partId: placement.partId,
        sheetIndex: Math.max(0, Math.round(Number(placement.sheetIndex ?? 0))),
        x: Number(placement.x),
        y: Number(placement.y),
        rotation: Number(placement.rotation ?? 0),
        mirrored: Boolean(placement.mirrored),
        isManual: placement.isManual ?? true,
        hasCollision,
        isOutsideSheet
      };
    });
  }

  private updateMetrics(workspaceId: number) {
    const workspace = this.requireWorkspace(workspaceId);
    const parts = new Map(this.listParts(workspaceId).map((part) => [part.id, part]));
    const placements = this.listPlacements(workspaceId);
    const usedArea = placements.reduce((sum, placement) => {
      const part = parts.get(placement.partId);
      if (!part) return sum;
      return sum + polygonArea(polygonFromPart(part));
    }, 0);
    const sheetCount = Math.max(1, new Set(placements.map((placement) => placement.sheetIndex)).size || 1);
    const sheetArea = Math.max(1, workspace.sheetWidth * workspace.sheetHeight * sheetCount);
    const usagePercent = Math.round((usedArea / sheetArea) * 10_000) / 100;
    const wastePercent = Math.max(0, Math.round((100 - usagePercent) * 100) / 100);
    const estimatedCutLength = placements.reduce((sum, placement) => sum + (parts.get(placement.partId)?.cutLength ?? 0), 0);
    const estimatedPierceCount = placements.reduce((sum, placement) => sum + (parts.get(placement.partId)?.pierceCount ?? 0), 0);
    this.db.prepare(
      `UPDATE nesting_workspaces SET wastePercent = ?, usagePercent = ?, estimatedCutLength = ?, estimatedPierceCount = ?, updatedAt = ? WHERE id = ?`
    ).run(wastePercent, usagePercent, estimatedCutLength, estimatedPierceCount, nowIso(), workspaceId);
    return { wastePercent, usagePercent, estimatedCutLength, estimatedPierceCount };
  }

  private buildWarnings(workspaceId: number): NestWarning[] {
    const workspace = this.getWorkspaceShallow(workspaceId);
    if (!workspace) return [];
    const warnings: NestWarning[] = [];
    const placements = this.listPlacements(workspaceId);
    if (placements.some((placement) => placement.hasCollision)) warnings.push({ severity: "critical", message: "One or more parts overlap", payload: { workspaceId } });
    if (placements.some((placement) => placement.isOutsideSheet)) warnings.push({ severity: "critical", message: "One or more parts are outside the sheet/offcut border", payload: { workspaceId } });
    for (const placement of placements) {
      const part = this.getPart(placement.partId);
      if (!part) continue;
      const size = rotatedSize(part, placement.rotation);
      const aspect = Math.max(size.width, size.height) / Math.max(1, Math.min(size.width, size.height));
      if (aspect >= 6) warnings.push({ severity: "warning", message: "Micro joins recommended for long narrow part", payload: { partId: part.id, placementId: placement.id } });
      if (part.pierceCount >= 12) warnings.push({ severity: "warning", message: "High heat concentration", payload: { partId: part.id, pierces: part.pierceCount } });
      if (placement.x < workspace.border + workspace.leadInLength || placement.y < workspace.border + workspace.leadInLength) {
        warnings.push({ severity: "warning", message: "Lead-in may be too close to border", payload: { placementId: placement.id } });
      }
    }
    return warnings;
  }

  private getWorkspaceShallow(id: number) {
    const row = this.db.prepare(`SELECT * FROM nesting_workspaces WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id,
      workspaceId: row.workspaceId ? String(row.workspaceId) : null,
      border: Number(row.border ?? 0),
      leadInLength: Number(row.leadInLength ?? 0)
    };
  }

  private requiredSize(parts: NestingWorkspacePartRecord[], fallbackWidth?: number, fallbackHeight?: number, fallbackArea?: number) {
    if (!parts.length) {
      const width = positive(fallbackWidth, 1);
      const height = positive(fallbackHeight, 1);
      return { width, height, area: positive(fallbackArea, width * height) };
    }
    const totalArea = parts.reduce((sum, part) => sum + part.width * part.height * Math.max(1, part.quantity), 0);
    const maxWidth = Math.max(...parts.map((part) => part.width), 1);
    const maxHeight = Math.max(...parts.map((part) => part.height), 1);
    return { width: maxWidth, height: maxHeight, area: totalArea };
  }

  private scoreOffcut(source: "nesting" | "stock", offcut: NestingOffcutRecord | OffcutRecord, required: { width: number; height: number; area: number }): OffcutRecommendation {
    const fitsNormal = offcut.width >= required.width && offcut.height >= required.height;
    const fitsRotated = offcut.width >= required.height && offcut.height >= required.width;
    const area = offcut.width * offcut.height;
    const wastePercent = Math.max(0, Math.round((1 - required.area / Math.max(1, area)) * 10_000) / 100);
    const estimatedSaving = fitsNormal || fitsRotated ? Math.round(Math.max(80, Math.min(2500, area / 2500))) : 0;
    const id = Number(offcut.id);
    return {
      source,
      offcutId: id,
      stockOffcutId: source === "stock" ? id : null,
      material: offcut.material,
      thickness: offcut.thickness,
      width: offcut.width,
      height: offcut.height,
      fitsNormal,
      fitsRotated,
      wastePercent,
      estimatedSaving,
      message: `Recommended: Use OFFCUT-${id}-${offcut.thickness}-${Math.round(offcut.width)}. Estimated saving R${estimatedSaving}.`,
      previewJson: source === "nesting" ? (offcut as NestingOffcutRecord).previewJson : JSON.stringify({ outline: this.rectPolygon(offcut.width, offcut.height), width: offcut.width, height: offcut.height }),
      offcut
    };
  }

  private rectPolygon(width: number, height: number): Point[] {
    return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  }

  private touch(workspaceId: number) {
    this.db.prepare(`UPDATE nesting_workspaces SET updatedAt = ? WHERE id = ?`).run(nowIso(), workspaceId);
  }

  private emitEvent(workspaceId: string | null | undefined, eventType: Parameters<BrainCoreService["eventService"]["recordEvent"]>[0]["eventType"], entityType: string, entityId: string, payload: Record<string, unknown>) {
    if (!this.brainCore || !workspaceId) return;
    try {
      this.brainCore.eventService.recordEvent({
        eventType,
        entityType,
        entityId,
        payload: { workspaceId, ...payload }
      });
    } catch (error) {
      console.error("[nesting-workspace] brain event failed:", error instanceof Error ? error.message : error);
    }
  }

  private buildDxf(workspace: NestingWorkspaceRecord) {
    const lines: string[] = ["0", "SECTION", "2", "ENTITIES"];
    const layer = (name: string) => ["8", name];
    const line = (x1: number, y1: number, x2: number, y2: number, layerName: string) => {
      lines.push("0", "LINE", ...layer(layerName), "10", String(x1), "20", String(y1), "30", "0", "11", String(x2), "21", String(y2), "31", "0");
    };
    const polyline = (points: Point[], layerName: string) => {
      lines.push("0", "LWPOLYLINE", ...layer(layerName), "90", String(points.length), "70", "1");
      for (const point of points) lines.push("10", String(Math.round(point.x * 1000) / 1000), "20", String(Math.round(point.y * 1000) / 1000));
    };
    const transformedContour = (points: Point[], placement: NestingPlacementRecord) => {
      const rotated = points.map((point) => rotatePoint(point, placement.rotation));
      const rotatedBounds = rotated.length ? boundsForPoints(rotated) : { minX: 0, minY: 0 };
      return points.map((point) => transformPoint(point, placement.x, placement.y, placement.rotation, rotatedBounds));
    };
    const transformedCenter = (point: Point, placement: NestingPlacementRecord, sourcePoints: Point[]) => {
      const rotatedBounds = sourcePoints.length ? boundsForPoints(sourcePoints.map((entry) => rotatePoint(entry, placement.rotation))) : { minX: 0, minY: 0 };
      return transformPoint(point, placement.x, placement.y, placement.rotation, rotatedBounds);
    };
    polyline(this.rectPolygon(workspace.sheetWidth, workspace.sheetHeight), workspace.sourceType === "offcut" ? "OFFCUT_OUTLINE" : "SHEET");
    const parts = new Map(workspace.parts.map((part) => [part.id, part]));
    for (const placement of workspace.placements) {
      const part = parts.get(placement.partId);
      if (!part) continue;
      const size = rotatedSize(part, placement.rotation);
      const layerName = placement.hasCollision ? "WARNINGS" : "CUT";
      const outerContours = part.previewGeometry.outerContours.length ? part.previewGeometry.outerContours : [polygonFromPart(part)];
      for (const contour of outerContours) polyline(transformedContour(contour, placement), layerName);
      for (const hole of part.previewGeometry.innerHoles) polyline(transformedContour(hole, placement), layerName);
      const sourcePoints = [...outerContours.flat(), ...part.previewGeometry.innerHoles.flat()];
      for (const circle of part.previewGeometry.circles) {
        const center = transformedCenter({ x: circle.cx, y: circle.cy }, placement, sourcePoints);
        lines.push("0", "CIRCLE", ...layer(layerName), "10", String(Math.round(center.x * 1000) / 1000), "20", String(Math.round(center.y * 1000) / 1000), "30", "0", "40", String(Math.round(circle.r * 1000) / 1000));
      }
      for (const arc of part.previewGeometry.arcs) {
        const center = transformedCenter({ x: arc.cx, y: arc.cy }, placement, sourcePoints);
        lines.push(
          "0",
          "ARC",
          ...layer(layerName),
          "10",
          String(Math.round(center.x * 1000) / 1000),
          "20",
          String(Math.round(center.y * 1000) / 1000),
          "30",
          "0",
          "40",
          String(Math.round(arc.r * 1000) / 1000),
          "50",
          String((arc.startAngle + placement.rotation) % 360),
          "51",
          String((arc.endAngle + placement.rotation) % 360)
        );
      }
      line(placement.x, placement.y + Math.min(10, size.height / 2), placement.x + Math.min(workspace.leadInLength, size.width / 2), placement.y + Math.min(10, size.height / 2), "LEAD_IN");
      if (workspace.enableMicroJoins && Math.max(size.width, size.height) / Math.max(1, Math.min(size.width, size.height)) >= 5) {
        line(placement.x + size.width * 0.4, placement.y, placement.x + size.width * 0.4 + Math.max(0.8, workspace.thickness * 0.5), placement.y, "MICRO_JOIN");
      }
      if (workspace.allowCommonLine) {
        lines.push("0", "TEXT", ...layer("COMMON_LINE"), "10", String(placement.x), "20", String(placement.y - 4), "40", "6", "1", "CL OK");
      }
    }
    lines.push("0", "TEXT", ...layer("TEXT"), "10", "10", "20", String(workspace.sheetHeight + 20), "40", "12", "1", `${workspace.customerName} - ${workspace.nestName}`);
    for (const warning of workspace.warnings) {
      lines.push("0", "TEXT", ...layer("WARNINGS"), "10", "10", "20", "10", "40", "8", "1", warning.message.slice(0, 120));
    }
    lines.push("0", "ENDSEC", "0", "EOF");
    return `${lines.join("\n")}\n`;
  }
}
