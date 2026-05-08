import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type DxfSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type DxfBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type PartDnaFingerprint = {
  normalizedGeometry: string;
  geometryHash: string;
  softHash: string;
  boundingWidth: number;
  boundingHeight: number;
  cutLength: number;
  pierceCount: number;
  holeCount: number;
  outsideProfileWidth: number;
  outsideProfileHeight: number;
  segmentCount: number;
  previewSvg: string;
};

export type PartDnaHistoryRow = {
  id: number;
  partId: number;
  quoteId: string | null;
  fileName: string;
  customerName: string | null;
  quotedPrice: number | null;
  actualCutTime: number | null;
  operatorNotes: string | null;
  createdAt: string;
};

export type PartDnaPartRow = {
  id: number;
  workspaceId: string;
  partCode: string;
  geometryHash: string;
  softHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
  timesQuoted: number;
  partName: string | null;
  material: string | null;
  thickness: number | null;
  boundingWidth: number;
  boundingHeight: number;
  cutLength: number;
  pierceCount: number;
  holeCount: number;
  notes: string | null;
  previewSvg: string | null;
  lastCustomerName: string | null;
};

export type PartDnaLibraryRow = {
  id: number;
  partCode: string;
  partName: string | null;
  customerName: string | null;
  material: string | null;
  thickness: number | null;
  timesQuoted: number;
  boundingWidth: number;
  boundingHeight: number;
  cutLength: number;
  pierceCount: number;
  holeCount: number;
  previewSvg: string | null;
  previousQuotedPrice: number | null;
  previousQuotedAt: string | null;
  lastSeenAt: string;
};

function readPreviewSvgFromArtifacts(rootDir: string, customerName: string | null | undefined, partCode: string) {
  const candidateCustomers = [sanitizeName(customerName ?? undefined) || "Unassigned Customer"];
  try {
    const customerDirs = fs.readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    for (const dir of customerDirs) {
      if (!candidateCustomers.includes(dir)) candidateCustomers.push(dir);
    }
  } catch {
    return null;
  }

  for (const customerDir of candidateCustomers) {
    const previewPath = path.join(rootDir, customerDir, partCode, `${partCode}.svg`);
    try {
      if (fs.existsSync(previewPath)) {
        return fs.readFileSync(previewPath, "utf8");
      }
    } catch {
      // ignore fallback read errors
    }
  }
  return null;
}

export type PartDnaNearMatch = {
  id: number;
  partCode: string;
  partName: string | null;
  material: string | null;
  thickness: number | null;
  similarityPercent: number;
  timesQuoted: number;
  boundingWidth: number;
  boundingHeight: number;
  cutLength: number;
  pierceCount: number;
  holeCount: number;
};

export type AnalyzePartDnaInput = {
  workspaceId: string;
  rawDxf: string;
  fileName: string;
  partName?: string;
  material?: string;
  thickness?: number;
  quoteId?: string | null;
  quotedPrice?: number | null;
  customerName?: string;
  artifactRoot?: string;
};

export type AnalyzePartDnaResult = {
  partId: number;
  partCode: string;
  geometryHash: string;
  softHash: string;
  isExistingPart: boolean;
  exactMatchPart: PartDnaPartRow;
  nearMatches: PartDnaNearMatch[];
  boundingBox: { width: number; height: number; outsideWidth: number; outsideHeight: number };
  cutLength: number;
  pierceCount: number;
  holeCount: number;
  timesQuoted: number;
  previousHistory: PartDnaHistoryRow[];
  previousQuotedPrice: number | null;
  previousActualCutTime: number | null;
  previousOperatorNotes: string | null;
  previewSvg: string;
  savedFiles?: { folderPath: string; dxfPath: string; previewPath: string };
};

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeName(input?: string) {
  return (input ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roundTo(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function segmentLength(seg: DxfSegment) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function decodeDxfBuffer(buffer: Buffer) {
  const utf8 = buffer.toString("utf8");
  if (utf8.includes("SECTION") || utf8.includes("ENTITIES") || utf8.includes("LINE")) return utf8;
  return buffer.toString("latin1");
}

export function parseDxfSegments(raw: string): DxfSegment[] {
  const lines = raw.replace(/\r/g, "").split("\n");
  const segments: DxfSegment[] = [];
  let section = "";
  let awaitingSectionName = false;
  let entityType = "";
  let entityIndex = 0;
  let entity: Record<string, string | string[]> = {};
  let activePolyline:
    | {
        closed: boolean;
        points: Array<{ x: number; y: number }>;
      }
    | null = null;

  const addValue = (code: string, value: string) => {
    const existing = entity[code];
    if (existing === undefined) entity[code] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else entity[code] = [existing, value];
  };

  const asNumber = (value: string | string[] | undefined, fallback = NaN) => {
    const rawValue = Array.isArray(value) ? value[0] : value;
    const num = rawValue === undefined ? NaN : Number(rawValue);
    return Number.isFinite(num) ? num : fallback;
  };

  const asNumbers = (value: string | string[] | undefined) => {
    if (value === undefined) return [] as number[];
    const list = Array.isArray(value) ? value : [value];
    return list.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  };

  const pushSegment = (x1: number, y1: number, x2: number, y2: number) => {
    if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) return;
    segments.push({ x1, y1, x2, y2 });
  };

  const flushActivePolyline = () => {
    if (!activePolyline) return;
    const { points, closed } = activePolyline;
    for (let i = 0; i < points.length - 1; i += 1) {
      pushSegment(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    }
    if (closed && points.length > 2) {
      const first = points[0];
      const last = points[points.length - 1];
      pushSegment(last.x, last.y, first.x, first.y);
    }
    activePolyline = null;
  };

  const flushEntity = () => {
    if (!entityType) return;
    if (entityType === "LINE") {
      pushSegment(asNumber(entity["10"]), asNumber(entity["20"]), asNumber(entity["11"]), asNumber(entity["21"]));
    } else if (entityType === "LWPOLYLINE") {
      const xs = asNumbers(entity["10"]);
      const ys = asNumbers(entity["20"]);
      const count = Math.min(xs.length, ys.length);
      for (let i = 0; i < count - 1; i += 1) {
        pushSegment(xs[i], ys[i], xs[i + 1], ys[i + 1]);
      }
      const flags = asNumber(entity["70"], 0);
      if ((flags & 1) === 1 && count > 2) {
        pushSegment(xs[count - 1], ys[count - 1], xs[0], ys[0]);
      }
    } else if (entityType === "POLYLINE") {
      const flags = asNumber(entity["70"], 0);
      activePolyline = {
        closed: (flags & 1) === 1,
        points: []
      };
    } else if (entityType === "VERTEX") {
      if (activePolyline) {
        const x = asNumber(entity["10"]);
        const y = asNumber(entity["20"]);
        if (Number.isFinite(x) && Number.isFinite(y)) activePolyline.points.push({ x, y });
      }
    } else if (entityType === "SEQEND") {
      flushActivePolyline();
    } else if (entityType === "CIRCLE") {
      const cx = asNumber(entity["10"]);
      const cy = asNumber(entity["20"]);
      const r = asNumber(entity["40"]);
      if (r > 0) {
        const steps = 48;
        let prevX = cx + r;
        let prevY = cy;
        for (let i = 1; i <= steps; i += 1) {
          const theta = (i / steps) * Math.PI * 2;
          const x = cx + Math.cos(theta) * r;
          const y = cy + Math.sin(theta) * r;
          pushSegment(prevX, prevY, x, y);
          prevX = x;
          prevY = y;
        }
      }
    } else if (entityType === "ARC") {
      const cx = asNumber(entity["10"]);
      const cy = asNumber(entity["20"]);
      const r = asNumber(entity["40"]);
      let start = (asNumber(entity["50"], 0) * Math.PI) / 180;
      let end = (asNumber(entity["51"], 0) * Math.PI) / 180;
      if (end <= start) end += Math.PI * 2;
      if (r > 0) {
        const span = end - start;
        const steps = Math.max(12, Math.ceil(span / (Math.PI / 18)));
        let prevX = cx + Math.cos(start) * r;
        let prevY = cy + Math.sin(start) * r;
        for (let i = 1; i <= steps; i += 1) {
          const theta = start + (span * i) / steps;
          const x = cx + Math.cos(theta) * r;
          const y = cy + Math.sin(theta) * r;
          pushSegment(prevX, prevY, x, y);
          prevX = x;
          prevY = y;
        }
      }
    }
    entityType = "";
    entity = {};
  };

  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();

    if (code === "0" && value === "SECTION") {
      awaitingSectionName = true;
      continue;
    }
    if (awaitingSectionName && code === "2") {
      section = value;
      awaitingSectionName = false;
      continue;
    }
    if (code === "0" && value === "ENDSEC") {
      flushEntity();
      flushActivePolyline();
      section = "";
      continue;
    }
    if (section !== "ENTITIES") continue;
    if (code === "0") {
      flushEntity();
      if (activePolyline && value !== "VERTEX" && value !== "SEQEND") flushActivePolyline();
      entityType = value;
      entity = {};
      entityIndex += 1;
      continue;
    }
    if (entityType) addValue(code, value);
  }

  flushEntity();
  flushActivePolyline();
  return segments;
}

function getBounds(segments: DxfSegment[]): DxfBounds | undefined {
  if (!segments.length) return undefined;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const seg of segments) {
    minX = Math.min(minX, seg.x1, seg.x2);
    minY = Math.min(minY, seg.y1, seg.y2);
    maxX = Math.max(maxX, seg.x1, seg.x2);
    maxY = Math.max(maxY, seg.y1, seg.y2);
  }
  return { minX, minY, maxX, maxY };
}

function splitContours(segments: DxfSegment[]) {
  if (!segments.length) return [] as DxfSegment[][];
  const endpointMap = new Map<string, number[]>();
  const toKey = (x: number, y: number) => `${roundTo(x, 0.01).toFixed(2)},${roundTo(y, 0.01).toFixed(2)}`;
  segments.forEach((seg, index) => {
    const keys = [toKey(seg.x1, seg.y1), toKey(seg.x2, seg.y2)];
    for (const key of keys) {
      if (!endpointMap.has(key)) endpointMap.set(key, []);
      endpointMap.get(key)!.push(index);
    }
  });

  const visited = new Array(segments.length).fill(false);
  const contours: DxfSegment[][] = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (visited[i]) continue;
    const queue = [i];
    visited[i] = true;
    const component: DxfSegment[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      const seg = segments[current];
      component.push(seg);
      const keys = [toKey(seg.x1, seg.y1), toKey(seg.x2, seg.y2)];
      for (const key of keys) {
        for (const neighbor of endpointMap.get(key) ?? []) {
          if (visited[neighbor]) continue;
          visited[neighbor] = true;
          queue.push(neighbor);
        }
      }
    }
    contours.push(component);
  }
  return contours;
}

function estimatePierceCount(segments: DxfSegment[]) {
  const contours = splitContours(segments);
  let totalPierces = 0;
  const pointKey = (x: number, y: number) => `${roundTo(x, 0.01).toFixed(2)},${roundTo(y, 0.01).toFixed(2)}`;

  for (const contour of contours) {
    const endpointDegree = new Map<string, number>();
    for (const seg of contour) {
      const keys = [pointKey(seg.x1, seg.y1), pointKey(seg.x2, seg.y2)];
      for (const key of keys) endpointDegree.set(key, (endpointDegree.get(key) ?? 0) + 1);
    }
    const openEnds = Array.from(endpointDegree.values()).filter((value) => value % 2 === 1).length;
    totalPierces += openEnds === 0 ? 1 : Math.max(1, Math.ceil(openEnds / 2));
  }
  return totalPierces;
}

function isClosedContour(segments: DxfSegment[]) {
  const endpointDegree = new Map<string, number>();
  const pointKey = (x: number, y: number) => `${roundTo(x, 0.01).toFixed(2)},${roundTo(y, 0.01).toFixed(2)}`;
  for (const seg of segments) {
    const keys = [pointKey(seg.x1, seg.y1), pointKey(seg.x2, seg.y2)];
    for (const key of keys) endpointDegree.set(key, (endpointDegree.get(key) ?? 0) + 1);
  }
  return Array.from(endpointDegree.values()).every((value) => value % 2 === 0);
}

function buildPreviewSvg(segments: DxfSegment[], bounds: DxfBounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const size = 240;
  const padding = 12;
  const scale = Math.min((size - padding * 2) / width, (size - padding * 2) / height);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const offsetX = (size - scaledWidth) / 2;
  const offsetY = (size - scaledHeight) / 2;
  const lines = segments
    .map((seg) => {
      const x1 = offsetX + (seg.x1 - bounds.minX) * scale;
      const x2 = offsetX + (seg.x2 - bounds.minX) * scale;
      const y1 = size - (offsetY + (seg.y1 - bounds.minY) * scale);
      const y2 = size - (offsetY + (seg.y2 - bounds.minY) * scale);
      return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#22c55e" stroke-width="1.4" stroke-linecap="round" />`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="16" fill="#020617" /><g>${lines}</g></svg>`;
}

export function fingerprintDxfGeometry(rawDxf: string): PartDnaFingerprint {
  const segments = parseDxfSegments(rawDxf);
  if (!segments.length) {
    throw new Error("No supported cut geometry found in DXF");
  }
  const bounds = getBounds(segments);
  if (!bounds) throw new Error("Failed to calculate DXF bounds");

  // This is the fingerprint core: normalize translation, round to 0.01mm, canonicalize line direction, then sort.
  const normalizedSegments = segments
    .map((segment) => {
      const ax = roundTo(segment.x1 - bounds.minX, 0.01);
      const ay = roundTo(segment.y1 - bounds.minY, 0.01);
      const bx = roundTo(segment.x2 - bounds.minX, 0.01);
      const by = roundTo(segment.y2 - bounds.minY, 0.01);
      const swap = ax > bx || (ax === bx && ay > by);
      const x1 = swap ? bx : ax;
      const y1 = swap ? by : ay;
      const x2 = swap ? ax : bx;
      const y2 = swap ? ay : by;
      return { x1, y1, x2, y2 };
    })
    .sort((left, right) =>
      left.x1 - right.x1 ||
      left.y1 - right.y1 ||
      left.x2 - right.x2 ||
      left.y2 - right.y2
    );

  const normalizedGeometry = normalizedSegments
    .map((segment) => `${segment.x1.toFixed(2)},${segment.y1.toFixed(2)}>${segment.x2.toFixed(2)},${segment.y2.toFixed(2)}`)
    .join("|");

  const boundingWidth = roundTo(bounds.maxX - bounds.minX, 0.01);
  const boundingHeight = roundTo(bounds.maxY - bounds.minY, 0.01);
  const cutLength = roundTo(segments.reduce((sum, segment) => sum + segmentLength(segment), 0), 0.01);
  const contours = splitContours(normalizedSegments);
  const contourMetrics = contours.map((contour) => {
    const contourBounds = getBounds(contour)!;
    return {
      contour,
      bounds: contourBounds,
      area: Math.max(0.01, (contourBounds.maxX - contourBounds.minX) * (contourBounds.maxY - contourBounds.minY)),
      closed: isClosedContour(contour)
    };
  });
  const closedContours = contourMetrics.filter((entry) => entry.closed).sort((left, right) => right.area - left.area);
  const outsideContour = closedContours[0];
  const holeCount = Math.max(0, closedContours.length - 1);
  const outsideProfileWidth = outsideContour ? roundTo(outsideContour.bounds.maxX - outsideContour.bounds.minX, 0.01) : boundingWidth;
  const outsideProfileHeight = outsideContour ? roundTo(outsideContour.bounds.maxY - outsideContour.bounds.minY, 0.01) : boundingHeight;
  const pierceCount = estimatePierceCount(normalizedSegments);
  const softHashPayload = [
    Math.round(boundingWidth),
    Math.round(boundingHeight),
    Math.round(outsideProfileWidth),
    Math.round(outsideProfileHeight),
    Math.round(cutLength / 5),
    pierceCount,
    holeCount,
    normalizedSegments.length
  ].join("|");

  return {
    normalizedGeometry,
    geometryHash: sha256(normalizedGeometry),
    softHash: sha256(softHashPayload),
    boundingWidth,
    boundingHeight,
    cutLength,
    pierceCount,
    holeCount,
    outsideProfileWidth,
    outsideProfileHeight,
    segmentCount: normalizedSegments.length,
    previewSvg: buildPreviewSvg(normalizedSegments, {
      minX: 0,
      minY: 0,
      maxX: boundingWidth,
      maxY: boundingHeight
    })
  };
}

function rowToPart(row: Record<string, unknown>): PartDnaPartRow {
  return {
    id: Number(row.id),
    workspaceId: String(row.workspaceId ?? ""),
    partCode: String(row.partCode ?? ""),
    geometryHash: String(row.geometryHash ?? ""),
    softHash: String(row.softHash ?? ""),
    firstSeenAt: String(row.firstSeenAt ?? ""),
    lastSeenAt: String(row.lastSeenAt ?? ""),
    timesQuoted: Number(row.timesQuoted ?? 0),
    partName: row.partName ? String(row.partName) : null,
    material: row.material ? String(row.material) : null,
    thickness: row.thickness === null || row.thickness === undefined ? null : Number(row.thickness),
    boundingWidth: Number(row.boundingWidth ?? 0),
    boundingHeight: Number(row.boundingHeight ?? 0),
    cutLength: Number(row.cutLength ?? 0),
    pierceCount: Number(row.pierceCount ?? 0),
    holeCount: Number(row.holeCount ?? 0),
    notes: row.notes ? String(row.notes) : null,
    previewSvg: row.previewSvg ? String(row.previewSvg) : null,
    lastCustomerName: row.lastCustomerName ? String(row.lastCustomerName) : null
  };
}

function rowToHistory(row: Record<string, unknown>): PartDnaHistoryRow {
  return {
    id: Number(row.id),
    partId: Number(row.partId),
    quoteId: row.quoteId ? String(row.quoteId) : null,
    fileName: String(row.fileName ?? ""),
    customerName: row.customerName ? String(row.customerName) : null,
    quotedPrice: row.quotedPrice === null || row.quotedPrice === undefined ? null : Number(row.quotedPrice),
    actualCutTime: row.actualCutTime === null || row.actualCutTime === undefined ? null : Number(row.actualCutTime),
    operatorNotes: row.operatorNotes ? String(row.operatorNotes) : null,
    createdAt: String(row.createdAt ?? "")
  };
}

function rowToLibraryRow(row: Record<string, unknown>): PartDnaLibraryRow {
  return {
    id: Number(row.id ?? 0),
    partCode: String(row.partCode ?? ""),
    partName: row.partName ? String(row.partName) : null,
    customerName: row.customerName ? String(row.customerName) : null,
    material: row.material ? String(row.material) : null,
    thickness: row.thickness === null || row.thickness === undefined ? null : Number(row.thickness),
    timesQuoted: Number(row.timesQuoted ?? 0),
    boundingWidth: Number(row.boundingWidth ?? 0),
    boundingHeight: Number(row.boundingHeight ?? 0),
    cutLength: Number(row.cutLength ?? 0),
    pierceCount: Number(row.pierceCount ?? 0),
    holeCount: Number(row.holeCount ?? 0),
    previewSvg: row.previewSvg ? String(row.previewSvg) : null,
    previousQuotedPrice: row.previousQuotedPrice === null || row.previousQuotedPrice === undefined ? null : Number(row.previousQuotedPrice),
    previousQuotedAt: row.previousQuotedAt ? String(row.previousQuotedAt) : null,
    lastSeenAt: String(row.lastSeenAt ?? "")
  };
}

export function openPartDnaDatabase(rootDir: string) {
  ensureDir(rootDir);
  const dbPath = path.join(rootDir, "qouterx-part-dna.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      partCode TEXT UNIQUE,
      geometryHash TEXT NOT NULL,
      softHash TEXT NOT NULL,
      firstSeenAt TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL,
      timesQuoted INTEGER NOT NULL DEFAULT 0,
      partName TEXT,
      material TEXT,
      thickness REAL,
      boundingWidth REAL NOT NULL,
      boundingHeight REAL NOT NULL,
      cutLength REAL NOT NULL,
      pierceCount INTEGER NOT NULL,
      holeCount INTEGER NOT NULL,
      notes TEXT,
      previewSvg TEXT,
      lastCustomerName TEXT,
      UNIQUE(workspaceId, geometryHash)
    );

    CREATE TABLE IF NOT EXISTS part_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partId INTEGER NOT NULL,
      quoteId TEXT,
      fileName TEXT NOT NULL,
      customerName TEXT,
      quotedPrice REAL,
      actualCutTime REAL,
      operatorNotes TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(partId) REFERENCES parts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_parts_workspace_softHash ON parts(workspaceId, softHash);
    CREATE INDEX IF NOT EXISTS idx_part_history_partId ON part_history(partId, createdAt DESC);
  `);
  try {
    db.exec(`ALTER TABLE parts ADD COLUMN previewSvg TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE parts ADD COLUMN lastCustomerName TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE part_history ADD COLUMN customerName TEXT`);
  } catch {}
  return db;
}

export function listPartHistory(db: DatabaseSync, workspaceId: string, partId: number) {
  const part = db.prepare(`SELECT * FROM parts WHERE id = ? AND workspaceId = ?`).get(partId, workspaceId) as Record<string, unknown> | undefined;
  if (!part) return { part: null, history: [] as PartDnaHistoryRow[] };
  const historyRows = db.prepare(`SELECT * FROM part_history WHERE partId = ? ORDER BY createdAt DESC, id DESC`).all(partId) as Record<string, unknown>[];
  return {
    part: rowToPart(part),
    history: historyRows.map(rowToHistory)
  };
}

export function updatePartNotes(db: DatabaseSync, workspaceId: string, partId: number, notes: string) {
  db.prepare(`UPDATE parts SET notes = ? WHERE id = ? AND workspaceId = ?`).run(notes, partId, workspaceId);
  const row = db.prepare(`SELECT * FROM parts WHERE id = ? AND workspaceId = ?`).get(partId, workspaceId) as Record<string, unknown> | undefined;
  return row ? rowToPart(row) : null;
}

export function listPartLibrary(db: DatabaseSync, workspaceId: string, artifactRoot?: string) {
  const rows = db.prepare(`
    SELECT
      p.*,
      COALESCE(
        (
          SELECT ph.customerName
          FROM part_history ph
          WHERE ph.partId = p.id AND ph.customerName IS NOT NULL AND TRIM(ph.customerName) != ''
          ORDER BY ph.createdAt DESC, ph.id DESC
          LIMIT 1
        ),
        p.lastCustomerName
      ) AS customerName,
      (
        SELECT ph.quotedPrice
        FROM part_history ph
        WHERE ph.partId = p.id AND ph.quotedPrice IS NOT NULL
        ORDER BY ph.createdAt DESC, ph.id DESC
        LIMIT 1
      ) AS previousQuotedPrice,
      (
        SELECT ph.createdAt
        FROM part_history ph
        WHERE ph.partId = p.id AND ph.quotedPrice IS NOT NULL
        ORDER BY ph.createdAt DESC, ph.id DESC
        LIMIT 1
      ) AS previousQuotedAt
    FROM parts p
    WHERE p.workspaceId = ?
    ORDER BY COALESCE(customerName, 'Unassigned Customer') ASC, p.lastSeenAt DESC, p.id DESC
  `).all(workspaceId) as Record<string, unknown>[];
  return rows.map((row) => {
    const item = rowToLibraryRow(row);
    if (!item.previewSvg && artifactRoot && item.partCode) {
      item.previewSvg = readPreviewSvgFromArtifacts(artifactRoot, item.customerName, item.partCode);
    }
    return item;
  });
}

function scoreNearMatch(fingerprint: PartDnaFingerprint, candidate: PartDnaPartRow) {
  const ratioScore = (a: number, b: number) => {
    const maxValue = Math.max(Math.abs(a), Math.abs(b), 1);
    return Math.max(0, 1 - Math.abs(a - b) / maxValue);
  };
  const widthScore = ratioScore(fingerprint.boundingWidth, candidate.boundingWidth);
  const heightScore = ratioScore(fingerprint.boundingHeight, candidate.boundingHeight);
  const cutScore = ratioScore(fingerprint.cutLength, candidate.cutLength);
  const pierceScore = candidate.pierceCount === fingerprint.pierceCount ? 1 : Math.max(0, 1 - Math.abs(candidate.pierceCount - fingerprint.pierceCount) / Math.max(fingerprint.pierceCount, candidate.pierceCount, 1));
  const holeScore = candidate.holeCount === fingerprint.holeCount ? 1 : 0;
  const softBoost = candidate.softHash === fingerprint.softHash ? 0.08 : 0;
  const total =
    widthScore * 0.24 +
    heightScore * 0.24 +
    cutScore * 0.24 +
    pierceScore * 0.16 +
    holeScore * 0.12 +
    softBoost;
  return Math.max(0, Math.min(1, total));
}

function savePartArtifacts(rootDir: string, customerName: string | undefined, partCode: string, rawDxf: string, previewSvg: string) {
  const safeCustomer = sanitizeName(customerName) || "Unassigned Customer";
  const safePartCode = sanitizeName(partCode) || partCode;
  const folderPath = path.join(rootDir, safeCustomer, safePartCode);
  ensureDir(folderPath);
  const dxfPath = path.join(folderPath, `${safePartCode}.dxf`);
  const previewPath = path.join(folderPath, `${safePartCode}.svg`);
  fs.writeFileSync(dxfPath, rawDxf, "utf8");
  fs.writeFileSync(previewPath, previewSvg, "utf8");
  return { folderPath, dxfPath, previewPath };
}

export function analyzeAndUpsertPartDna(
  db: DatabaseSync,
  input: AnalyzePartDnaInput
): AnalyzePartDnaResult {
  const fingerprint = fingerprintDxfGeometry(input.rawDxf);
  const safeThickness = typeof input.thickness === "number" && Number.isFinite(input.thickness) ? input.thickness : null;
  const now = new Date().toISOString();
  const existingRow = db.prepare(`SELECT * FROM parts WHERE workspaceId = ? AND geometryHash = ?`).get(input.workspaceId, fingerprint.geometryHash) as Record<string, unknown> | undefined;
  let exactPart: PartDnaPartRow;
  let isExistingPart = Boolean(existingRow);

  if (existingRow) {
    db.prepare(`
      UPDATE parts
      SET lastSeenAt = ?,
          partName = COALESCE(?, partName),
          material = COALESCE(?, material),
          thickness = COALESCE(?, thickness),
          previewSvg = COALESCE(?, previewSvg),
          lastCustomerName = COALESCE(?, lastCustomerName)
      WHERE id = ?
    `).run(
      now,
      input.partName?.trim() || null,
      input.material?.trim() || null,
      safeThickness,
      fingerprint.previewSvg,
      input.customerName?.trim() || null,
      Number(existingRow.id)
    );
    exactPart = rowToPart(
      db.prepare(`SELECT * FROM parts WHERE id = ?`).get(Number(existingRow.id)) as Record<string, unknown>
    );
  } else {
    const insert = db.prepare(`
      INSERT INTO parts (
        workspaceId, geometryHash, softHash, firstSeenAt, lastSeenAt, timesQuoted,
        partName, material, thickness, boundingWidth, boundingHeight, cutLength, pierceCount, holeCount, notes, previewSvg, lastCustomerName
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      input.workspaceId,
      fingerprint.geometryHash,
      fingerprint.softHash,
      now,
      now,
      input.partName?.trim() || null,
      input.material?.trim() || null,
      safeThickness,
      fingerprint.boundingWidth,
      fingerprint.boundingHeight,
      fingerprint.cutLength,
      fingerprint.pierceCount,
      fingerprint.holeCount,
      fingerprint.previewSvg,
      input.customerName?.trim() || null
    );
    const id = Number(insert.lastInsertRowid);
    const partCode = `PDNA-${String(id).padStart(6, "0")}`;
    db.prepare(`UPDATE parts SET partCode = ? WHERE id = ?`).run(partCode, id);
    exactPart = rowToPart(db.prepare(`SELECT * FROM parts WHERE id = ?`).get(id) as Record<string, unknown>);
  }

  const candidatesRows = db.prepare(`
    SELECT * FROM parts
    WHERE workspaceId = ?
      AND id != ?
      AND (
        softHash = ?
        OR ABS(boundingWidth - ?) <= ?
        OR ABS(boundingHeight - ?) <= ?
      )
    ORDER BY lastSeenAt DESC
    LIMIT 24
  `).all(
    input.workspaceId,
    exactPart.id,
    fingerprint.softHash,
    fingerprint.boundingWidth,
    Math.max(5, fingerprint.boundingWidth * 0.2),
    fingerprint.boundingHeight,
    Math.max(5, fingerprint.boundingHeight * 0.2)
  ) as Record<string, unknown>[];
  const nearMatches = candidatesRows
    .map((row) => rowToPart(row))
    .map((candidate) => ({
      candidate,
      similarityPercent: Math.round(scoreNearMatch(fingerprint, candidate) * 100)
    }))
    .filter((entry) => entry.similarityPercent >= 70)
    .sort((left, right) => right.similarityPercent - left.similarityPercent)
    .slice(0, 5)
    .map(({ candidate, similarityPercent }) => ({
      id: candidate.id,
      partCode: candidate.partCode,
      partName: candidate.partName,
      material: candidate.material,
      thickness: candidate.thickness,
      similarityPercent,
      timesQuoted: candidate.timesQuoted,
      boundingWidth: candidate.boundingWidth,
      boundingHeight: candidate.boundingHeight,
      cutLength: candidate.cutLength,
      pierceCount: candidate.pierceCount,
      holeCount: candidate.holeCount
    }));

  const historyRows = db.prepare(`SELECT * FROM part_history WHERE partId = ? ORDER BY createdAt DESC, id DESC`).all(exactPart.id) as Record<string, unknown>[];
  const previousHistory = historyRows.map(rowToHistory);
  const previousQuotedPrice = previousHistory.find((entry) => entry.quotedPrice !== null)?.quotedPrice ?? null;
  const previousActualCutTime = previousHistory.find((entry) => entry.actualCutTime !== null)?.actualCutTime ?? null;
  const previousOperatorNotes = previousHistory.find((entry) => entry.operatorNotes)?.operatorNotes ?? null;
  const savedFiles =
    input.artifactRoot && exactPart.partCode
      ? savePartArtifacts(input.artifactRoot, input.customerName, exactPart.partCode, input.rawDxf, fingerprint.previewSvg)
      : undefined;

  return {
    partId: exactPart.id,
    partCode: exactPart.partCode,
    geometryHash: fingerprint.geometryHash,
    softHash: fingerprint.softHash,
    isExistingPart,
    exactMatchPart: exactPart,
    nearMatches,
    boundingBox: {
      width: fingerprint.boundingWidth,
      height: fingerprint.boundingHeight,
      outsideWidth: fingerprint.outsideProfileWidth,
      outsideHeight: fingerprint.outsideProfileHeight
    },
    cutLength: fingerprint.cutLength,
    pierceCount: fingerprint.pierceCount,
    holeCount: fingerprint.holeCount,
    timesQuoted: exactPart.timesQuoted,
    previousHistory,
    previousQuotedPrice,
    previousActualCutTime,
    previousOperatorNotes,
    previewSvg: fingerprint.previewSvg,
    savedFiles
  };
}

export function recordQuotedPartHistory(
  db: DatabaseSync,
  input: {
    workspaceId: string;
    partCode?: string | null;
    geometryHash?: string | null;
    quoteId?: string | null;
    fileName: string;
    customerName?: string | null;
    quotedPrice?: number | null;
    actualCutTime?: number | null;
    operatorNotes?: string | null;
    partName?: string | null;
    material?: string | null;
    thickness?: number | null;
  }
) {
  const safeThickness = typeof input.thickness === "number" && Number.isFinite(input.thickness) ? input.thickness : null;
  const partRow = input.partCode
    ? (db.prepare(`SELECT * FROM parts WHERE workspaceId = ? AND partCode = ?`).get(input.workspaceId, input.partCode) as Record<string, unknown> | undefined)
    : input.geometryHash
      ? (db.prepare(`SELECT * FROM parts WHERE workspaceId = ? AND geometryHash = ?`).get(input.workspaceId, input.geometryHash) as Record<string, unknown> | undefined)
      : undefined;
  if (!partRow) return null;
  const part = rowToPart(partRow);
  const existingHistory = input.quoteId
    ? (db.prepare(`SELECT id FROM part_history WHERE partId = ? AND quoteId = ? AND fileName = ?`).get(part.id, input.quoteId, input.fileName) as Record<string, unknown> | undefined)
    : undefined;
  if (!existingHistory) {
    db.prepare(`
      INSERT INTO part_history (partId, quoteId, fileName, customerName, quotedPrice, actualCutTime, operatorNotes, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      part.id,
      input.quoteId ?? null,
      input.fileName,
      input.customerName?.trim() || null,
      input.quotedPrice ?? null,
      input.actualCutTime ?? null,
      input.operatorNotes ?? null,
      new Date().toISOString()
    );
    db.prepare(`
      UPDATE parts
      SET timesQuoted = timesQuoted + 1,
          lastSeenAt = ?,
          partName = COALESCE(?, partName),
          material = COALESCE(?, material),
          thickness = COALESCE(?, thickness),
          lastCustomerName = COALESCE(?, lastCustomerName)
      WHERE id = ?
    `).run(
      new Date().toISOString(),
      input.partName ?? null,
      input.material ?? null,
      safeThickness,
      input.customerName?.trim() || null,
      part.id
    );
  }
  const refreshed = db.prepare(`SELECT * FROM parts WHERE id = ?`).get(part.id) as Record<string, unknown>;
  return rowToPart(refreshed);
}

export function updatePartActualCutTime(
  db: DatabaseSync,
  workspaceId: string,
  partId: number,
  input: {
    jobId?: number | null;
    fileName?: string | null;
    actualMinutes: number;
    operatorNotes?: string | null;
  }
) {
  const partRow = db.prepare(`SELECT * FROM parts WHERE id = ? AND workspaceId = ?`).get(partId, workspaceId) as Record<string, unknown> | undefined;
  if (!partRow) return null;
  const historyRow = db.prepare(`
    SELECT *
    FROM part_history
    WHERE partId = ?
    ORDER BY createdAt DESC, id DESC
    LIMIT 1
  `).get(partId) as Record<string, unknown> | undefined;

  if (historyRow) {
    db.prepare(`
      UPDATE part_history
      SET actualCutTime = ?,
          operatorNotes = COALESCE(?, operatorNotes)
      WHERE id = ?
    `).run(input.actualMinutes, input.operatorNotes ?? null, Number(historyRow.id));
  } else {
    db.prepare(`
      INSERT INTO part_history (partId, quoteId, fileName, customerName, quotedPrice, actualCutTime, operatorNotes, createdAt)
      VALUES (?, NULL, ?, NULL, NULL, ?, ?, ?)
    `).run(
      partId,
      input.fileName?.trim() || `job-${input.jobId ?? partId}`,
      input.actualMinutes,
      input.operatorNotes ?? null,
      new Date().toISOString()
    );
  }

  return rowToPart(partRow);
}
