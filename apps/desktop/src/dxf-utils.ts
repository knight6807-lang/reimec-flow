import { getDocument } from "pdfjs-dist";
import type {
  DxfSegment,
  DxfBounds,
  DxfReaderPartPreview,
  JobDxfPartPreview,
  JobDxfSourceFile,
  QuoteDxfSourceFile,
  PdfReaderPartPreview,
  PdfReaderSourcePage,
  NestingPlateInput,
  NestingPlacement,
  NestingPlateLayout,
  NestingResult,
  NestingWorkspacePartRecord,
  NestingWorkspacePlacementRecord,
  NestingStudioResult,
  NestingOffcutRecord,
  NestingPreviewGeometry,
} from "./types";
export function segmentLength(seg: DxfSegment) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  return Math.sqrt(dx * dx + dy * dy);
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
        layer: string;
        entityId: string;
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

  const pushSegment = (x1: number, y1: number, x2: number, y2: number, layer: string, entityId: string) => {
    if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) return;
    segments.push({ x1, y1, x2, y2, layer, entityId });
  };

  const flushActivePolyline = () => {
    if (!activePolyline) return;
    const { points, layer, entityId, closed } = activePolyline;
    for (let i = 0; i < points.length - 1; i += 1) {
      pushSegment(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, layer, entityId);
    }
    if (closed && points.length > 2) {
      const first = points[0];
      const last = points[points.length - 1];
      pushSegment(last.x, last.y, first.x, first.y, layer, entityId);
    }
    activePolyline = null;
  };

  const flushEntity = () => {
    if (!entityType) return;
    const layerRaw = entity["8"];
    const layer = (Array.isArray(layerRaw) ? layerRaw[0] : layerRaw)?.trim() || "0";
    const entityId = `${entityType}-${entityIndex}`;
    if (entityType === "LINE") {
      pushSegment(
        asNumber(entity["10"]),
        asNumber(entity["20"]),
        asNumber(entity["11"]),
        asNumber(entity["21"]),
        layer,
        entityId
      );
    } else if (entityType === "LWPOLYLINE") {
      const xs = asNumbers(entity["10"]);
      const ys = asNumbers(entity["20"]);
      const count = Math.min(xs.length, ys.length);
      for (let i = 0; i < count - 1; i += 1) {
        pushSegment(xs[i], ys[i], xs[i + 1], ys[i + 1], layer, entityId);
      }
      const flags = asNumber(entity["70"], 0);
      if ((flags & 1) === 1 && count > 2) {
        pushSegment(xs[count - 1], ys[count - 1], xs[0], ys[0], layer, entityId);
      }
    } else if (entityType === "POLYLINE") {
      const flags = asNumber(entity["70"], 0);
      activePolyline = {
        layer,
        entityId,
        closed: (flags & 1) === 1,
        points: []
      };
    } else if (entityType === "VERTEX") {
      if (activePolyline) {
        const x = asNumber(entity["10"]);
        const y = asNumber(entity["20"]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          activePolyline.points.push({ x, y });
        }
      }
    } else if (entityType === "SEQEND") {
      flushActivePolyline();
    } else if (entityType === "CIRCLE") {
      const cx = asNumber(entity["10"]);
      const cy = asNumber(entity["20"]);
      const r = asNumber(entity["40"]);
      if (r > 0) {
        const steps = 40;
        let prevX = cx + r;
        let prevY = cy;
        for (let i = 1; i <= steps; i += 1) {
          const theta = (i / steps) * Math.PI * 2;
          const x = cx + Math.cos(theta) * r;
          const y = cy + Math.sin(theta) * r;
          pushSegment(prevX, prevY, x, y, layer, entityId);
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
          pushSegment(prevX, prevY, x, y, layer, entityId);
          prevX = x;
          prevY = y;
        }
      }
    } else if (entityType === "ELLIPSE") {
      const cx = asNumber(entity["10"]);
      const cy = asNumber(entity["20"]);
      const majorX = asNumber(entity["11"]);
      const majorY = asNumber(entity["21"]);
      const ratio = asNumber(entity["40"]);
      let start = asNumber(entity["41"], 0);
      let end = asNumber(entity["42"], Math.PI * 2);
      if (![cx, cy, majorX, majorY, ratio].every((n) => Number.isFinite(n))) {
        // ignore malformed ellipse
      } else {
        if (end <= start) end += Math.PI * 2;
        const a = Math.hypot(majorX, majorY);
        if (a > 0 && ratio > 0) {
          const b = a * ratio;
          const phi = Math.atan2(majorY, majorX);
          const span = end - start;
          const steps = Math.max(16, Math.ceil(span / (Math.PI / 24)));
          let prevX = cx + a * Math.cos(start) * Math.cos(phi) - b * Math.sin(start) * Math.sin(phi);
          let prevY = cy + a * Math.cos(start) * Math.sin(phi) + b * Math.sin(start) * Math.cos(phi);
          for (let i = 1; i <= steps; i += 1) {
            const t = start + (span * i) / steps;
            const x = cx + a * Math.cos(t) * Math.cos(phi) - b * Math.sin(t) * Math.sin(phi);
            const y = cy + a * Math.cos(t) * Math.sin(phi) + b * Math.sin(t) * Math.cos(phi);
            pushSegment(prevX, prevY, x, y, layer, entityId);
            prevX = x;
            prevY = y;
          }
        }
      }
    } else if (entityType === "SPLINE") {
      const fitXs = asNumbers(entity["11"]);
      const fitYs = asNumbers(entity["21"]);
      const ctrlXs = asNumbers(entity["10"]);
      const ctrlYs = asNumbers(entity["20"]);
      const xs = fitXs.length >= 2 ? fitXs : ctrlXs;
      const ys = fitYs.length >= 2 ? fitYs : ctrlYs;
      const count = Math.min(xs.length, ys.length);
      for (let i = 0; i < count - 1; i += 1) {
        pushSegment(xs[i], ys[i], xs[i + 1], ys[i + 1], layer, entityId);
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
      if (activePolyline && value !== "VERTEX" && value !== "SEQEND") {
        flushActivePolyline();
      }
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

export function getDxfBounds(segments: DxfSegment[]): DxfBounds | undefined {
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

export function createSegmentThumbnailDataUrl(
  segments: DxfSegment[],
  size = 96,
  background = "#0b1220",
  stroke = "#93c5fd"
) {
  const bounds = getDxfBounds(segments);
  if (!bounds) return undefined;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const padding = 8;
  const drawSize = size - padding * 2;
  const scale = Math.min(drawSize / width, drawSize / height);
  const xOffset = (size - width * scale) / 2;
  const yOffset = (size - height * scale) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const seg of segments) {
    const x1 = xOffset + (seg.x1 - bounds.minX) * scale;
    const y1 = yOffset + (bounds.maxY - seg.y1) * scale;
    const x2 = xOffset + (seg.x2 - bounds.minX) * scale;
    const y2 = yOffset + (bounds.maxY - seg.y2) * scale;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  return canvas.toDataURL("image/png");
}

export function createSegmentSvgDataUrl(segments: DxfSegment[], size = 700, background = "#ffffff", stroke = "#0f172a") {
  const bounds = getDxfBounds(segments);
  if (!bounds) return undefined;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const padding = 18;
  const drawSize = size - padding * 2;
  const scale = Math.min(drawSize / width, drawSize / height);
  const xOffset = (size - width * scale) / 2;
  const yOffset = (size - height * scale) / 2;
  const lines = segments
    .map((seg) => {
      const x1 = xOffset + (seg.x1 - bounds.minX) * scale;
      const y1 = yOffset + (bounds.maxY - seg.y1) * scale;
      const x2 = xOffset + (seg.x2 - bounds.minX) * scale;
      const y2 = yOffset + (bounds.maxY - seg.y2) * scale;
      return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" />`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${background}"/><g stroke="${stroke}" stroke-width="1.1" stroke-linecap="round">${lines}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createNestingPartPreviewDataUrl(part: NestingWorkspacePartRecord) {
  try {
    const geometry = JSON.parse(part.geometryJson || "{}") as { preview?: Array<{ x: number; y: number }> };
    const points = geometry.preview?.length
      ? geometry.preview
      : [
          { x: 0, y: 0 },
          { x: part.width, y: 0 },
          { x: part.width, y: part.height },
          { x: 0, y: part.height }
        ];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const pad = Math.max(width, height) * 0.08;
    const viewBox = `${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)} ${(width + pad * 2).toFixed(2)} ${(height + pad * 2).toFixed(2)}`;
    const polyline = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="110" viewBox="${viewBox}"><rect x="${(minX - pad).toFixed(2)}" y="${(minY - pad).toFixed(2)}" width="${(width + pad * 2).toFixed(2)}" height="${(height + pad * 2).toFixed(2)}" fill="#020617"/><polygon points="${polyline}" fill="rgba(96,165,250,0.18)" stroke="#93c5fd" stroke-width="${Math.max(0.4, Math.max(width, height) / 180).toFixed(2)}"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return undefined;
  }
}

export function parseNestingPreviewGeometry(part?: NestingWorkspacePartRecord | null): NestingPreviewGeometry | null {
  if (!part?.geometryJson) return null;
  try {
    const parsed = JSON.parse(part.geometryJson) as NestingPreviewGeometry & { previewGeometry?: NestingPreviewGeometry };
    return {
      ...(parsed.previewGeometry ?? {}),
      ...(part?.previewGeometry ?? {}),
      segments: parsed.segments ?? parsed.previewGeometry?.segments ?? part?.previewGeometry?.segments ?? [],
      outerContour: parsed.outerContour,
      simplifiedPolygon: parsed.simplifiedPolygon,
      preview: parsed.preview,
      holes: parsed.holes
    };
  } catch {
    return part?.previewGeometry ?? null;
  }
}

export function rotateNestingPreviewPoint(point: { x: number; y: number }, rotation: number) {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
  };
}

export function transformNestingPreviewPoint(point: { x: number; y: number }, x: number, y: number, rotation: number, rotatedBounds: { minX: number; minY: number }) {
  const rotated = rotateNestingPreviewPoint(point, rotation);
  return { x: rotated.x - rotatedBounds.minX + x, y: rotated.y - rotatedBounds.minY + y };
}

export function arcPreviewPoints(arc: { cx: number; cy: number; r: number; startAngle: number; endAngle: number }, steps = 24) {
  const start = arc.startAngle;
  let end = arc.endAngle;
  while (end < start) end += 360;
  const sweep = end - start;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = ((start + (sweep * index) / steps) * Math.PI) / 180;
    return { x: arc.cx + Math.cos(angle) * arc.r, y: arc.cy + Math.sin(angle) * arc.r };
  });
}

export function nestingWorkspaceGeometryPaths(part: NestingWorkspacePartRecord | undefined, placement: NestingWorkspacePlacementRecord) {
  const geometry = parseNestingPreviewGeometry(part) ?? placement.previewGeometry ?? null;
  const outerContours = geometry?.outerContours?.length
    ? geometry.outerContours
    : geometry?.outerContour?.length
      ? [geometry.outerContour]
      : geometry?.simplifiedPolygon?.length
        ? [geometry.simplifiedPolygon]
        : geometry?.preview?.length
          ? [geometry.preview]
          : [];
  const holes = geometry?.innerHoles?.length ? geometry.innerHoles : geometry?.holes ?? [];
  const circles = geometry?.circles ?? [];
  const arcs = geometry?.arcs ?? [];
  const arcPoints = arcs.flatMap((arc) => arcPreviewPoints(arc));
  const segmentPoints = (geometry?.segments ?? []).flatMap((segment) => [{ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }]);
  const sourcePoints = [...outerContours.flat(), ...holes.flat(), ...circles.flatMap((circle) => [{ x: circle.cx - circle.r, y: circle.cy - circle.r }, { x: circle.cx + circle.r, y: circle.cy + circle.r }]), ...arcPoints, ...segmentPoints];
  const rotatedBounds = sourcePoints.length ? nestingStudioBounds(sourcePoints.map((point) => rotateNestingPreviewPoint(point, placement.rotation))) : { minX: 0, minY: 0 };
  const hasTrueGeometry = Boolean(outerContours.length || holes.length || circles.length || arcs.length || geometry?.segments?.length);
  const toPath = (points: Array<{ x: number; y: number }>) => {
    const transformed = points.map((point) => transformNestingPreviewPoint(point, placement.x, placement.y, placement.rotation, rotatedBounds));
    return transformed.length ? `M ${transformed.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" L ")} Z` : "";
  };
  const segmentLines = (geometry?.segments ?? []).map((segment) => {
    const start = transformNestingPreviewPoint({ x: segment.x1, y: segment.y1 }, placement.x, placement.y, placement.rotation, rotatedBounds);
    const end = transformNestingPreviewPoint({ x: segment.x2, y: segment.y2 }, placement.x, placement.y, placement.rotation, rotatedBounds);
    return start && end ? { start, end, kind: segment.kind } : null;
  }).filter((entry): entry is { start: { x: number; y: number }; end: { x: number; y: number }; kind?: "line" | "arc" | "circle" } => Boolean(entry));
  const circleShapes = circles.map((circle) => ({
    center: transformNestingPreviewPoint({ x: circle.cx, y: circle.cy }, placement.x, placement.y, placement.rotation, rotatedBounds),
    r: circle.r
  }));
  const arcPaths = arcs.map((arc) => {
    const points = arcPreviewPoints(arc).map((point) => transformNestingPreviewPoint(point, placement.x, placement.y, placement.rotation, rotatedBounds));
    return points.length ? `M ${points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" L ")}` : "";
  }).filter(Boolean);
  return {
    hasTrueGeometry,
    outerPath: outerContours.map(toPath).filter(Boolean).join(" "),
    holePaths: holes.map(toPath).filter(Boolean),
    segmentLines,
    circleShapes,
    arcPaths
  };
}

export function nestingStudioBounds(points: Array<{ x: number; y: number }>) {
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

export function nestingStudioArea(points: Array<{ x: number; y: number }>) {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    total += point.x * next.y - next.x * point.y;
  }
  return Math.abs(total / 2);
}

export function nestingStudioCentroid(points: Array<{ x: number; y: number }>) {
  if (!points.length) return { x: 0, y: 0 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function nestingStudioOffsetPolygon(points: Array<{ x: number; y: number }>, amount: number) {
  if (amount <= 0 || points.length < 3) return points;
  const center = nestingStudioCentroid(points);
  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x + (dx / length) * amount, y: point.y + (dy / length) * amount };
  });
}

export function nestingStudioPointOnSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > 0.001) return false;
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot >= -0.001 && dot <= lengthSquared + 0.001;
}

export function nestingStudioPointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if (nestingStudioPointOnSegment(point, a, b)) return true;
    if (a.y > point.y !== b.y > point.y) {
      const x = ((b.x - a.x) * (point.y - a.y)) / Math.max(1e-9, b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

export function nestingStudioSegmentIntersects(a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }) {
  const direction = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
  const d1 = direction(a1, a2, b1);
  const d2 = direction(a1, a2, b2);
  const d3 = direction(b1, b2, a1);
  const d4 = direction(b1, b2, a2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return nestingStudioPointOnSegment(b1, a1, a2) || nestingStudioPointOnSegment(b2, a1, a2) || nestingStudioPointOnSegment(a1, b1, b2) || nestingStudioPointOnSegment(a2, b1, b2);
}

export function nestingStudioEdges(polygon: Array<{ x: number; y: number }>) {
  return polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]] as const);
}

export function nestingStudioPolygonsOverlap(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>) {
  if (a.length < 3 || b.length < 3) return false;
  const aBox = nestingStudioBounds(a);
  const bBox = nestingStudioBounds(b);
  if (aBox.maxX < bBox.minX || aBox.minX > bBox.maxX || aBox.maxY < bBox.minY || aBox.minY > bBox.maxY) return false;
  for (const [a1, a2] of nestingStudioEdges(a)) {
    for (const [b1, b2] of nestingStudioEdges(b)) {
      if (nestingStudioSegmentIntersects(a1, a2, b1, b2)) return true;
    }
  }
  return nestingStudioPointInPolygon(a[0], b) || nestingStudioPointInPolygon(b[0], a);
}

export function nestingStudioPointSegmentDistance(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (lengthSquared <= 1e-9) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared));
  return Math.hypot(point.x - (a.x + (b.x - a.x) * t), point.y - (a.y + (b.y - a.y) * t));
}

export function nestingStudioPolygonDistance(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>) {
  if (nestingStudioPolygonsOverlap(a, b)) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (const [a1, a2] of nestingStudioEdges(a)) {
    for (const [b1, b2] of nestingStudioEdges(b)) {
      minimum = Math.min(
        minimum,
        nestingStudioPointSegmentDistance(a1, b1, b2),
        nestingStudioPointSegmentDistance(a2, b1, b2),
        nestingStudioPointSegmentDistance(b1, a1, a2),
        nestingStudioPointSegmentDistance(b2, a1, a2)
      );
    }
  }
  return minimum;
}

export function buildNestingStudioHeat(placements: NestingStudioResult["placements"], sheetWidth: number, sheetHeight: number) {
  const columns = 6;
  const rows = 4;
  const heatZones: NonNullable<NestingStudioResult["heatZones"]> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      heatZones.push({ x: (sheetWidth / columns) * column, y: (sheetHeight / rows) * row, width: sheetWidth / columns, height: sheetHeight / rows, score: 0, pierces: 0 });
    }
  }
  const warnings: string[] = [];
  for (const placement of placements) {
    const box = nestingStudioBounds(placement.polygon);
    const center = { x: box.minX + box.width / 2, y: box.minY + box.height / 2 };
    const aspect = Math.max(box.width, box.height) / Math.max(1, Math.min(box.width, box.height));
    const score = Math.min(100, placement.microJoins.length * 14 + (aspect >= 7 ? 24 : 0) + (box.width * box.height < 2500 ? 12 : 0));
    const zone = heatZones.find((entry) => center.x >= entry.x && center.x <= entry.x + entry.width && center.y >= entry.y && center.y <= entry.y + entry.height) ?? heatZones[0];
    zone.score = Math.min(100, zone.score + score);
    zone.pierces += 1;
    if (score >= 45) warnings.push(`${placement.name}: high heat concentration.`);
    if (aspect >= 7) warnings.push(`${placement.name}: possible warping.`);
  }
  const activeZones = heatZones.filter((zone) => zone.score > 0 || zone.pierces > 0);
  return {
    heatScore: activeZones.reduce((max, zone) => Math.max(max, zone.score), 0),
    heatZones: activeZones,
    warnings: Array.from(new Set(warnings))
  };
}

export function buildNestingStudioCutOrder(placements: NestingStudioResult["placements"], heatZones: NonNullable<NestingStudioResult["heatZones"]> = []) {
  const remaining = placements.map((placement) => {
    const box = nestingStudioBounds(placement.polygon);
    return {
      cutOrder: 0,
      placementId: placement.partId,
      partId: placement.partId,
      operation: "outer" as const,
      x: box.minX + box.width / 2,
      y: box.minY + box.height / 2
    };
  });
  const ordered: NonNullable<NestingStudioResult["cutOrder"]> = [];
  let cursor = { x: 0, y: 0 };
  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const recentHeatPenalty = ordered.slice(-4).some((item) => Math.hypot(item.x - candidate.x, item.y - candidate.y) < 180) ? 250 : 0;
      const candidateHotZone = heatZones.find((zone) => zone.score >= 45 && candidate.x >= zone.x && candidate.x <= zone.x + zone.width && candidate.y >= zone.y && candidate.y <= zone.y + zone.height);
      const sameHotZonePenalty = candidateHotZone && ordered.slice(-4).some((item) => item.x >= candidateHotZone.x && item.x <= candidateHotZone.x + candidateHotZone.width && item.y >= candidateHotZone.y && item.y <= candidateHotZone.y + candidateHotZone.height) ? 800 : 0;
      const score = Math.hypot(candidate.x - cursor.x, candidate.y - cursor.y) + recentHeatPenalty + sameHotZonePenalty;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push({ ...next, cutOrder: ordered.length + 1 });
    cursor = { x: next.x, y: next.y };
  }
  return ordered;
}

export function buildNestingStudioDxf(result: NestingStudioResult, sheetWidth: number, sheetHeight: number, customerName: string) {
  const polyline = (points: Array<{ x: number; y: number }>, layer: string) =>
    `0\nLWPOLYLINE\n8\n${layer}\n90\n${points.length}\n70\n1\n${points.map((point) => `10\n${point.x.toFixed(3)}\n20\n${point.y.toFixed(3)}\n`).join("")}`;
  const line = (start: { x: number; y: number }, end: { x: number; y: number }, layer: string) =>
    `0\nLINE\n8\n${layer}\n10\n${start.x.toFixed(3)}\n20\n${start.y.toFixed(3)}\n11\n${end.x.toFixed(3)}\n21\n${end.y.toFixed(3)}\n`;
  const text = (value: string, point: { x: number; y: number }, layer: string, height = 10) =>
    `0\nTEXT\n8\n${layer}\n10\n${point.x.toFixed(3)}\n20\n${point.y.toFixed(3)}\n40\n${height}\n1\n${value}\n`;
  let dxf = "0\nSECTION\n2\nENTITIES\n";
  dxf += polyline([{ x: 0, y: 0 }, { x: sheetWidth, y: 0 }, { x: sheetWidth, y: sheetHeight }, { x: 0, y: sheetHeight }], "SHEET");
  dxf += text(`${customerName} - Nesting Studio`, { x: 20, y: Math.max(20, sheetHeight - 40) }, "TEXT", 25);
  for (const placement of result.placements) {
    dxf += polyline(placement.polygon, "CUT");
    dxf += line(placement.leadIn.start, placement.leadIn.end, "LEAD_IN");
    for (const join of placement.microJoins) dxf += line({ x: join.x - 3, y: join.y }, { x: join.x + 3, y: join.y }, "MICRO_JOIN");
  }
  for (const operation of result.cutOrder ?? []) {
    dxf += text(String(operation.cutOrder), { x: operation.x, y: operation.y }, "CUT_ORDER", 10);
  }
  return `${dxf}0\nENDSEC\n0\nEOF\n`;
}

export function recalculateNestingStudioResult(result: NestingStudioResult, sheetWidth: number, sheetHeight: number, border: number, spacing: number, kerf: number, customerName: string): NestingStudioResult {
  const warnings: string[] = [...result.unplaced.map((part) => `Could not place ${part.name}`)];
  const clearance = Math.max(0, spacing + kerf);
  const spacingBoundaryOffset = clearance / 2;
  if (spacing < kerf || clearance < 0.5) warnings.push("Part spacing may be too small for kerf and laser clearance.");
  for (const placement of result.placements) {
    const box = nestingStudioBounds(placement.polygon);
    if (box.minX < border || box.minY < border || box.maxX > sheetWidth - border || box.maxY > sheetHeight - border) {
      warnings.push(`${placement.name} is outside sheet or border.`);
    }
    const aspect = Math.max(box.width, box.height) / Math.max(1, Math.min(box.width, box.height));
    if (aspect >= 8) warnings.push(`${placement.name}: long narrow parts may warp.`);
    if (placement.microJoins.length >= 4) warnings.push(`${placement.name}: high heat concentration.`);
  }
  for (let index = 0; index < result.placements.length; index += 1) {
    const a = result.placements[index];
    const aBox = nestingStudioBounds(a.polygon);
    for (let nextIndex = index + 1; nextIndex < result.placements.length; nextIndex += 1) {
      const b = result.placements[nextIndex];
      const bBox = nestingStudioBounds(b.polygon);
      const aBoundary = nestingStudioOffsetPolygon(a.polygon, spacingBoundaryOffset);
      const bBoundary = nestingStudioOffsetPolygon(b.polygon, spacingBoundaryOffset);
      if (nestingStudioPolygonsOverlap(a.polygon, b.polygon)) {
        warnings.push(`${a.name} overlaps ${b.name}.`);
        continue;
      }
      if (clearance > 0 && (nestingStudioPolygonsOverlap(aBoundary, bBoundary) || nestingStudioPolygonDistance(aBoundary, bBoundary) <= 0.01)) warnings.push(`${a.name} is too close to ${b.name}.`);
      const aCenter = { x: aBox.minX + aBox.width / 2, y: aBox.minY + aBox.height / 2 };
      const bCenter = { x: bBox.minX + bBox.width / 2, y: bBox.minY + bBox.height / 2 };
      if (Math.hypot(aCenter.x - bCenter.x, aCenter.y - bCenter.y) < 80) warnings.push("Many pierces close together.");
    }
  }
  const usedArea = result.placements.reduce((sum, placement) => sum + nestingStudioArea(placement.polygon), 0);
  const sheetArea = Math.max(1, sheetWidth * sheetHeight);
  const usagePercent = Number(((usedArea / sheetArea) * 100).toFixed(2));
  const wastePercent = Number((100 - usagePercent).toFixed(2));
  const heat = buildNestingStudioHeat(result.placements, sheetWidth, sheetHeight);
  const cutOrder = buildNestingStudioCutOrder(result.placements, heat.heatZones);
  const placements = result.placements.map((placement) => ({
    ...placement,
    cutOrder: cutOrder.find((operation) => operation.placementId === placement.partId)?.cutOrder
  }));
  const next = { ...result, placements, usagePercent, wastePercent, cutOrder, heatScore: heat.heatScore, heatZones: heat.heatZones, warnings: Array.from(new Set([...warnings, ...heat.warnings])) };
  return { ...next, dxf: buildNestingStudioDxf(next, sheetWidth, sheetHeight, customerName) };
}

export function getNestingStudioFootprint(result: NestingStudioResult | null) {
  if (!result?.placements.length) return { width: 0, height: 0, area: 0 };
  const points = result.placements.flatMap((placement) => placement.polygon);
  const bounds = nestingStudioBounds(points);
  return {
    width: bounds.width,
    height: bounds.height,
    area: result.placements.reduce((sum, placement) => sum + nestingStudioArea(placement.polygon), 0)
  };
}

export function createOffcutPreviewDataUrl(offcut: NestingOffcutRecord) {
  const width = Math.max(1, Number(offcut.width) || 1);
  const height = Math.max(1, Number(offcut.height) || 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="80" viewBox="0 0 ${width} ${height}"><rect x="0" y="0" width="${width}" height="${height}" fill="#020617" stroke="#93c5fd" stroke-width="${Math.max(width, height) / 90}"/><rect x="${width * 0.08}" y="${height * 0.08}" width="${width * 0.84}" height="${height * 0.84}" fill="rgba(96,165,250,0.15)" stroke="rgba(147,197,253,0.45)" stroke-dasharray="${Math.max(width, height) / 30} ${Math.max(width, height) / 45}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function detectPdfDrawingPartsFromCanvas(
  canvas: HTMLCanvasElement,
  fileName: string,
  pageNumber: number,
  idPrefix: string,
  renderScale: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return [] as PdfReaderPartPreview[];
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const dark = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const a = pixels[offset + 3];
    if (a < 25) continue;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance < 185) dark[i] = 1;
  }

  const visited = new Uint8Array(width * height);
  const components: Array<{ minX: number; minY: number; maxX: number; maxY: number; area: number }> = [];
  const queue = new Int32Array(width * height);
  const neighbors = [1, -1, width, -width];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const start = y * width + x;
      if (!dark[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let area = 0;
      const componentPixels: number[] = [];
      while (head < tail) {
        const current = queue[head++];
        const cy = Math.floor(current / width);
        const cx = current - cy * width;
        area += 1;
        componentPixels.push(current);
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;
        for (const delta of neighbors) {
          const next = current + delta;
          if (next < 0 || next >= width * height) continue;
          const ny = Math.floor(next / width);
          const nx = next - ny * width;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          if (!dark[next] || visited[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      if (area < 220 || w < 32 || h < 32) continue;
      if (w > width * 0.95 && h > height * 0.95) continue;
      const aspect = Math.max(w / Math.max(1, h), h / Math.max(1, w));
      if (aspect > 14) continue;

      const rowFlags = new Uint8Array(h);
      const colFlags = new Uint8Array(w);
      for (const pixelIndex of componentPixels) {
        const py = Math.floor(pixelIndex / width);
        const px = pixelIndex - py * width;
        rowFlags[py - minY] = 1;
        colFlags[px - minX] = 1;
      }
      const usedRows = rowFlags.reduce((sum, value) => sum + value, 0);
      const usedCols = colFlags.reduce((sum, value) => sum + value, 0);
      const rowCoverage = usedRows / Math.max(1, h);
      const colCoverage = usedCols / Math.max(1, w);
      if (rowCoverage < 0.18 || colCoverage < 0.18) continue;

      const bboxArea = w * h;
      const fillRatio = area / Math.max(1, bboxArea);
      if (fillRatio > 0.42) continue;

      // Keep only mostly closed drawing islands by measuring enclosed white area inside the component box.
      const localDark = new Uint8Array(bboxArea);
      for (const pixelIndex of componentPixels) {
        const py = Math.floor(pixelIndex / width);
        const px = pixelIndex - py * width;
        localDark[(py - minY) * w + (px - minX)] = 1;
      }
      const seenWhite = new Uint8Array(bboxArea);
      const whiteQueue = new Int32Array(bboxArea);
      let qHead = 0;
      let qTail = 0;
      const enqueueWhite = (idx: number) => {
        if (idx < 0 || idx >= bboxArea) return;
        if (localDark[idx] || seenWhite[idx]) return;
        seenWhite[idx] = 1;
        whiteQueue[qTail++] = idx;
      };
      for (let bx = 0; bx < w; bx += 1) {
        enqueueWhite(bx);
        enqueueWhite((h - 1) * w + bx);
      }
      for (let by = 0; by < h; by += 1) {
        enqueueWhite(by * w);
        enqueueWhite(by * w + (w - 1));
      }
      while (qHead < qTail) {
        const current = whiteQueue[qHead++];
        const cy = Math.floor(current / w);
        const cx = current - cy * w;
        if (cx > 0) enqueueWhite(current - 1);
        if (cx < w - 1) enqueueWhite(current + 1);
        if (cy > 0) enqueueWhite(current - w);
        if (cy < h - 1) enqueueWhite(current + w);
      }
      let enclosedWhite = 0;
      let totalWhite = 0;
      for (let i = 0; i < bboxArea; i += 1) {
        if (!localDark[i]) {
          totalWhite += 1;
          if (!seenWhite[i]) enclosedWhite += 1;
        }
      }
      const enclosedRatio = enclosedWhite / Math.max(1, totalWhite);
      if (enclosedWhite < 140 || enclosedRatio < 0.035) continue;

      components.push({ minX, minY, maxX, maxY, area });
    }
  }

  components.sort((a, b) => (a.minY === b.minY ? a.minX - b.minX : a.minY - b.minY));
  const mmPerPx = 25.4 / (72 * Math.max(0.1, renderScale));
  return components.map((component, index) => {
    const padding = 8;
    const sx = Math.max(0, component.minX - padding);
    const sy = Math.max(0, component.minY - padding);
    const sw = Math.min(width - sx, component.maxX - component.minX + 1 + padding * 2);
    const sh = Math.min(height - sy, component.maxY - component.minY + 1 + padding * 2);
    const crop = document.createElement("canvas");
    crop.width = Math.max(1, sw);
    crop.height = Math.max(1, sh);
    const cropCtx = crop.getContext("2d");
    if (!cropCtx) return null;
    cropCtx.fillStyle = "#ffffff";
    cropCtx.fillRect(0, 0, crop.width, crop.height);
    cropCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
    const thumbnailDataUrl = crop.toDataURL("image/png");
    const widthMm = Math.max(1, Math.round((component.maxX - component.minX + 1) * mmPerPx));
    const heightMm = Math.max(1, Math.round((component.maxY - component.minY + 1) * mmPerPx));
    const nameBase = fileName.replace(/\.pdf$/i, "");
    return {
      id: `${idPrefix}-part-${index + 1}`,
      name: `${nameBase}-p${pageNumber}-part-${index + 1}`,
      fileName,
      pageNumber,
      quantity: 1,
      widthMm,
      heightMm,
      thumbnailDataUrl,
      printDataUrl: thumbnailDataUrl
    } satisfies PdfReaderPartPreview;
  }).filter((entry): entry is PdfReaderPartPreview => Boolean(entry));
}

export function createRectangleSegments(widthMm: number, heightMm: number, layer: string, entityPrefix: string, offsetX = 0, offsetY = 0) {
  const w = Math.max(1, widthMm);
  const h = Math.max(1, heightMm);
  const x1 = offsetX;
  const y1 = offsetY;
  const x2 = offsetX + w;
  const y2 = offsetY + h;
  return [
    { x1, y1, x2, y2: y1, layer, entityId: `${entityPrefix}-1` },
    { x1: x2, y1, x2, y2, layer, entityId: `${entityPrefix}-2` },
    { x1: x2, y1: y2, x2: x1, y2, layer, entityId: `${entityPrefix}-3` },
    { x1, y1: y2, x2: x1, y2: y1, layer, entityId: `${entityPrefix}-4` }
  ] satisfies DxfSegment[];
}

export function createCircleSegments(diameterMm: number, layer: string, entityPrefix: string, offsetX = 0, offsetY = 0, steps = 72) {
  const diameter = Math.max(1, diameterMm);
  const radius = diameter / 2;
  const cx = offsetX + radius;
  const cy = offsetY + radius;
  const segmentCount = Math.max(24, steps);
  const segments: DxfSegment[] = [];
  let prevX = cx + radius;
  let prevY = cy;
  for (let i = 1; i <= segmentCount; i += 1) {
    const theta = (Math.PI * 2 * i) / segmentCount;
    const x = cx + Math.cos(theta) * radius;
    const y = cy + Math.sin(theta) * radius;
    segments.push({
      x1: prevX,
      y1: prevY,
      x2: x,
      y2: y,
      layer,
      entityId: `${entityPrefix}-${i}`
    });
    prevX = x;
    prevY = y;
  }
  return segments;
}

export function createRegularPolygonSegments(
  sides: number,
  radiusMm: number,
  layer: string,
  entityPrefix: string,
  offsetX = 0,
  offsetY = 0,
  rotationRad = 0
) {
  const count = Math.max(3, Math.round(sides));
  const radius = Math.max(0.5, radiusMm);
  const cx = offsetX + radius;
  const cy = offsetY + radius;
  const points = Array.from({ length: count }, (_, index) => {
    const theta = rotationRad + (Math.PI * 2 * index) / count;
    return {
      x: cx + Math.cos(theta) * radius,
      y: cy + Math.sin(theta) * radius
    };
  });
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return {
      x1: point.x,
      y1: point.y,
      x2: next.x,
      y2: next.y,
      layer,
      entityId: `${entityPrefix}-${index + 1}`
    };
  }) satisfies DxfSegment[];
}

export function createSlotSegments(lengthMm: number, widthMm: number, layer: string, entityPrefix: string, offsetX = 0, offsetY = 0, steps = 20) {
  const length = Math.max(1, lengthMm);
  const width = Math.max(1, widthMm);
  if (length <= width) return createCircleSegments(width, layer, entityPrefix, offsetX, offsetY, Math.max(24, steps * 2));

  const radius = width / 2;
  const straight = length - width;
  const leftCx = offsetX + radius;
  const rightCx = offsetX + radius + straight;
  const cy = offsetY + radius;
  const segments: DxfSegment[] = [];
  const arcSteps = Math.max(10, steps);

  for (let i = 0; i < arcSteps; i += 1) {
    const start = Math.PI / 2 + (Math.PI * i) / arcSteps;
    const end = Math.PI / 2 + (Math.PI * (i + 1)) / arcSteps;
    segments.push({
      x1: leftCx + Math.cos(start) * radius,
      y1: cy + Math.sin(start) * radius,
      x2: leftCx + Math.cos(end) * radius,
      y2: cy + Math.sin(end) * radius,
      layer,
      entityId: `${entityPrefix}-left-${i + 1}`
    });
  }
  for (let i = 0; i < arcSteps; i += 1) {
    const start = -Math.PI / 2 + (Math.PI * i) / arcSteps;
    const end = -Math.PI / 2 + (Math.PI * (i + 1)) / arcSteps;
    segments.push({
      x1: rightCx + Math.cos(start) * radius,
      y1: cy + Math.sin(start) * radius,
      x2: rightCx + Math.cos(end) * radius,
      y2: cy + Math.sin(end) * radius,
      layer,
      entityId: `${entityPrefix}-right-${i + 1}`
    });
  }
  segments.push({
    x1: leftCx,
    y1: offsetY + width,
    x2: rightCx,
    y2: offsetY + width,
    layer,
    entityId: `${entityPrefix}-top`
  });
  segments.push({
    x1: rightCx,
    y1: offsetY,
    x2: leftCx,
    y2: offsetY,
    layer,
    entityId: `${entityPrefix}-bottom`
  });
  return segments;
}

export function buildDxfFromSegments(segments: DxfSegment[]) {
  const lines = segments
    .map(
      (segment) =>
        `0\nLINE\n8\n${segment.layer}\n10\n${segment.x1}\n20\n${segment.y1}\n30\n0\n11\n${segment.x2}\n21\n${segment.y2}\n31\n0\n`
    )
    .join("");
  return `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${lines}0\nENDSEC\n0\nEOF\n`;
}

export function appendDxfSegments(target: DxfSegment[], source: DxfSegment[]) {
  for (const segment of source) target.push(segment);
}

export function splitSegmentsIntoParts(segments: DxfSegment[]) {
  if (!segments.length) return [] as DxfSegment[][];
  const endpointMap = new Map<string, number[]>();
  const toKey = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
  segments.forEach((seg, i) => {
    const k1 = toKey(seg.x1, seg.y1);
    const k2 = toKey(seg.x2, seg.y2);
    if (!endpointMap.has(k1)) endpointMap.set(k1, []);
    if (!endpointMap.has(k2)) endpointMap.set(k2, []);
    endpointMap.get(k1)!.push(i);
    endpointMap.get(k2)!.push(i);
  });

  const visited = new Array(segments.length).fill(false);
  const parts: DxfSegment[][] = [];
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
    parts.push(component);
  }
  return parts.sort((a, b) => b.length - a.length);
}

export function mergeContainedComponents(components: DxfSegment[][]) {
  if (components.length <= 1) return components;
  const metrics = components.map((segments, index) => {
    const bounds = getDxfBounds(segments);
    const area = bounds ? Math.max(1, bounds.maxX - bounds.minX) * Math.max(1, bounds.maxY - bounds.minY) : 1;
    return { index, segments, bounds, area };
  });

  const parentByChild = new Map<number, number>();
  for (const child of metrics) {
    if (!child.bounds) continue;
    let bestParent: number | null = null;
    let bestParentArea = Number.POSITIVE_INFINITY;
    for (const parent of metrics) {
      if (parent.index === child.index || !parent.bounds) continue;
      if (parent.area <= child.area) continue;
      const inside =
        child.bounds.minX >= parent.bounds.minX - 0.5 &&
        child.bounds.maxX <= parent.bounds.maxX + 0.5 &&
        child.bounds.minY >= parent.bounds.minY - 0.5 &&
        child.bounds.maxY <= parent.bounds.maxY + 0.5;
      if (!inside) continue;
      if (parent.area < bestParentArea) {
        bestParent = parent.index;
        bestParentArea = parent.area;
      }
    }
    if (bestParent !== null) parentByChild.set(child.index, bestParent);
  }

  const merged = new Map<number, DxfSegment[]>();
  for (const item of metrics) merged.set(item.index, [...item.segments]);
  for (const [childIndex, parentIndex] of parentByChild.entries()) {
    merged.set(parentIndex, [...(merged.get(parentIndex) ?? []), ...(merged.get(childIndex) ?? [])]);
    merged.delete(childIndex);
  }

  return Array.from(merged.values()).sort((a, b) => b.length - a.length);
}

export function groupComponentsByDrawingIslands(components: DxfSegment[][]) {
  if (components.length <= 1) return components;
  const boxes = components.map((segments) => getDxfBounds(segments));
  const parent = components.map((_c, i) => i);

  const find = (x: number): number => {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };

  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const overlapsOrContains = (a?: DxfBounds, b?: DxfBounds) => {
    if (!a || !b) return false;
    const pad = 0.2;
    const disjoint =
      a.maxX < b.minX - pad ||
      b.maxX < a.minX - pad ||
      a.maxY < b.minY - pad ||
      b.maxY < a.minY - pad;
    return !disjoint;
  };

  for (let i = 0; i < components.length; i += 1) {
    for (let j = i + 1; j < components.length; j += 1) {
      if (overlapsOrContains(boxes[i], boxes[j])) unite(i, j);
    }
  }

  const grouped = new Map<number, DxfSegment[]>();
  components.forEach((segments, index) => {
    const root = find(index);
    grouped.set(root, [...(grouped.get(root) ?? []), ...segments]);
  });
  return Array.from(grouped.values()).sort((a, b) => b.length - a.length);
}

export function boundsDistanceMm(a?: DxfBounds, b?: DxfBounds) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
  return Math.sqrt(dx * dx + dy * dy);
}

export function endpointDistanceMm(a: DxfSegment[], b: DxfSegment[]) {
  let minDist = Number.POSITIVE_INFINITY;
  for (const s1 of a) {
    const pts1 = [
      [s1.x1, s1.y1],
      [s1.x2, s1.y2]
    ] as const;
    for (const s2 of b) {
      const pts2 = [
        [s2.x1, s2.y1],
        [s2.x2, s2.y2]
      ] as const;
      for (const p1 of pts1) {
        for (const p2 of pts2) {
          const dx = p1[0] - p2[0];
          const dy = p1[1] - p2[1];
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < minDist) minDist = d;
        }
      }
    }
  }
  return minDist;
}

export function mergeComponentsByProximity(components: DxfSegment[][], thresholdMm: number) {
  if (components.length <= 1) return components;
  const parent = components.map((_c, i) => i);
  const bounds = components.map((segments) => getDxfBounds(segments));

  const find = (x: number): number => {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };

  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < components.length; i += 1) {
    for (let j = i + 1; j < components.length; j += 1) {
      if (boundsDistanceMm(bounds[i], bounds[j]) > thresholdMm * 1.6) continue;
      const near = endpointDistanceMm(components[i], components[j]) <= thresholdMm;
      if (near) unite(i, j);
    }
  }

  const grouped = new Map<number, DxfSegment[]>();
  components.forEach((segments, index) => {
    const root = find(index);
    grouped.set(root, [...(grouped.get(root) ?? []), ...segments]);
  });
  return Array.from(grouped.values()).sort((a, b) => b.length - a.length);
}

export function estimatePierceCount(segments: DxfSegment[]) {
  if (!segments.length) return 0;
  const contours = splitSegmentsIntoParts(segments);
  let totalPierces = 0;
  const pointKey = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;

  for (const contour of contours) {
    const endpointDegree = new Map<string, number>();
    for (const seg of contour) {
      const k1 = pointKey(seg.x1, seg.y1);
      const k2 = pointKey(seg.x2, seg.y2);
      endpointDegree.set(k1, (endpointDegree.get(k1) ?? 0) + 1);
      endpointDegree.set(k2, (endpointDegree.get(k2) ?? 0) + 1);
    }
    const openEnds = Array.from(endpointDegree.values()).filter((d) => d % 2 === 1).length;
    totalPierces += openEnds === 0 ? 1 : Math.max(1, Math.ceil(openEnds / 2));
  }
  return totalPierces;
}

export function getPartSignature(segments: DxfSegment[]) {
  const lengths = segments
    .map((seg) => segmentLength(seg))
    .filter((len) => Number.isFinite(len) && len > 0.01)
    .sort((a, b) => a - b);
  if (!lengths.length) return "empty";
  const quantized = lengths
    .map((len) => Math.round(len / 0.5))
    .slice(0, 180)
    .join(",");
  const totalLength = Math.round(lengths.reduce((sum, len) => sum + len, 0) / 0.5);
  return `${segments.length}|${totalLength}|${quantized}`;
}

export function estimateNestingForPlate(
  input: NestingPlateInput[],
  plateWidthMm: number,
  plateHeightMm: number,
  gapMm: number
): NestingResult {
  const expandedBase = input
    .flatMap((part) =>
      Array.from({ length: Math.max(1, Math.floor(part.quantity)) }, () => ({
        name: part.name,
        w: Math.max(1, part.widthMm),
        h: Math.max(1, part.heightMm),
        sourceSegments: part.sourceSegments,
        sourceBounds: part.sourceBounds
      }))
    )
    .filter((part) => part.w > 0 && part.h > 0);

  type ExpandedPart = (typeof expandedBase)[number];
  type FreeRect = { x: number; y: number; w: number; h: number };
  type Plate = { freeRects: FreeRect[]; placements: NestingPlacement[] };
  type NestingCandidateResult = NestingResult & { compactAreaMm2: number };
  type ShapeProfile = {
    width: number;
    height: number;
    rowStep: number;
    rowMins: number[];
    rowMaxs: number[];
  };
  type OrientedPart = ExpandedPart & {
    rotationDeg: 0 | 90 | 180;
    profile?: ShapeProfile;
    profileKey: string;
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const buildRectProfile = (width: number, height: number, samples: number): ShapeProfile => ({
    width,
    height,
    rowStep: height / samples,
    rowMins: Array.from({ length: samples }, () => 0),
    rowMaxs: Array.from({ length: samples }, () => width)
  });

  const buildShapeProfile = (part: ExpandedPart): ShapeProfile | undefined => {
    if (!part.sourceSegments?.length || !part.sourceBounds) return undefined;
    const width = Math.max(1, part.w);
    const height = Math.max(1, part.h);
    const samples = Math.max(16, Math.min(48, Math.round(height / 12)));
    const rowStep = height / samples;
    const rowMins = Array.from({ length: samples }, () => width);
    const rowMaxs = Array.from({ length: samples }, () => 0);
    const rowHits = Array.from({ length: samples }, () => false);
    const epsilon = Math.max(0.001, rowStep * 0.5);

    const toLocal = (x: number, y: number) => ({
      x: x - part.sourceBounds!.minX,
      y: part.sourceBounds!.maxY - y
    });

    for (const seg of part.sourceSegments) {
      const p1 = toLocal(seg.x1, seg.y1);
      const p2 = toLocal(seg.x2, seg.y2);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      const startIndex = clamp(Math.floor((minY - epsilon) / rowStep), 0, samples - 1);
      const endIndex = clamp(Math.floor((maxY + epsilon) / rowStep), 0, samples - 1);

      for (let index = startIndex; index <= endIndex; index += 1) {
        const sampleY = index * rowStep + rowStep / 2;
        if (Math.abs(p2.y - p1.y) <= 0.001) {
          if (Math.abs(sampleY - p1.y) > rowStep / 2 + 0.001) continue;
          const minX = Math.min(p1.x, p2.x);
          const maxX = Math.max(p1.x, p2.x);
          rowMins[index] = Math.min(rowMins[index], minX);
          rowMaxs[index] = Math.max(rowMaxs[index], maxX);
          rowHits[index] = true;
          continue;
        }
        if (sampleY < minY - 0.001 || sampleY > maxY + 0.001) continue;
        const t = (sampleY - p1.y) / (p2.y - p1.y);
        if (t < -0.01 || t > 1.01) continue;
        const x = p1.x + (p2.x - p1.x) * t;
        rowMins[index] = Math.min(rowMins[index], x);
        rowMaxs[index] = Math.max(rowMaxs[index], x);
        rowHits[index] = true;
      }
    }

    for (let index = 0; index < samples; index += 1) {
      if (rowHits[index]) {
        rowMins[index] = clamp(rowMins[index], 0, width);
        rowMaxs[index] = clamp(rowMaxs[index], 0, width);
        continue;
      }
      rowMins[index] = 0;
      rowMaxs[index] = width;
    }

    return { width, height, rowStep, rowMins, rowMaxs };
  };

  const rotateProfile180 = (profile: ShapeProfile): ShapeProfile => ({
    width: profile.width,
    height: profile.height,
    rowStep: profile.rowStep,
    rowMins: [...profile.rowMins].reverse().map((_, index, arr) => profile.width - profile.rowMaxs[profile.rowMaxs.length - 1 - index]),
    rowMaxs: [...profile.rowMaxs].reverse().map((_, index, arr) => profile.width - profile.rowMins[profile.rowMins.length - 1 - index])
  });

  const getProfileRowRange = (profile: ShapeProfile, yFromTop: number) => {
    const index = clamp(Math.floor(yFromTop / Math.max(0.001, profile.rowStep)), 0, profile.rowMins.length - 1);
    return {
      minX: profile.rowMins[index],
      maxX: profile.rowMaxs[index]
    };
  };

  const profileCache = new Map<string, ShapeProfile | undefined>();
  const getProfile = (part: ExpandedPart) => {
    const key = `${part.name}|${part.w}|${part.h}|${part.sourceSegments?.length ?? 0}|${part.sourceBounds?.minX ?? 0}|${part.sourceBounds?.minY ?? 0}|${
      part.sourceBounds?.maxX ?? 0
    }|${part.sourceBounds?.maxY ?? 0}`;
    if (!profileCache.has(key)) {
      profileCache.set(key, buildShapeProfile(part) ?? buildRectProfile(part.w, part.h, Math.max(16, Math.min(48, Math.round(part.h / 12)))));
    }
    return profileCache.get(key)!;
  };

  const orientPart = (part: ExpandedPart, rotationDeg: 0 | 90 | 180): OrientedPart => {
    const baseProfile = getProfile(part);
    if (rotationDeg === 90) {
      return {
        ...part,
        w: part.h,
        h: part.w,
        rotationDeg,
        profile: undefined,
        profileKey: `${part.name}-90`
      };
    }
    return {
      ...part,
      rotationDeg,
      profile: rotationDeg === 180 ? rotateProfile180(baseProfile) : baseProfile,
      profileKey: `${part.name}-${rotationDeg}`
    };
  };

  const createPlate = (): Plate => ({
    freeRects: [{ x: 0, y: 0, w: plateWidthMm, h: plateHeightMm }],
    placements: []
  });

  const intersects = (a: FreeRect, b: FreeRect) =>
    !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

  const contains = (outer: FreeRect, inner: FreeRect) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h;

  const measureCompactArea = (placements: NestingPlacement[]) => {
    if (!placements.length) return 0;
    const maxX = Math.max(...placements.map((placement) => placement.xMm + placement.widthMm));
    const maxY = Math.max(...placements.map((placement) => placement.yMm + placement.heightMm));
    return maxX * maxY;
  };

  const placePartOnPlate = (plate: Plate, part: ExpandedPart) => {
    type Candidate = {
      rectIndex: number;
      x: number;
      y: number;
      allocatedW: number;
      allocatedH: number;
      orientedPart: OrientedPart;
      score1: number;
      score2: number;
      score3: number;
    };
    let best: Candidate | null = null;

    const options = [
      {
        allocatedW: part.w + gapMm,
        allocatedH: part.h + gapMm,
        orientedPart: orientPart(part, 0)
      },
      {
        allocatedW: part.h + gapMm,
        allocatedH: part.w + gapMm,
        orientedPart: orientPart(part, 90)
      }
    ];

    for (let i = 0; i < plate.freeRects.length; i += 1) {
      const free = plate.freeRects[i];
      for (const option of options) {
        if (option.allocatedW > free.w || option.allocatedH > free.h) continue;
        const anchorCandidates = [
          { x: free.x, y: free.y },
          { x: free.x + free.w - option.allocatedW, y: free.y },
          { x: free.x, y: free.y + free.h - option.allocatedH },
          { x: free.x + free.w - option.allocatedW, y: free.y + free.h - option.allocatedH }
        ].filter(
          (anchor, index, arr) =>
            anchor.x >= free.x - 0.001 &&
            anchor.y >= free.y - 0.001 &&
            anchor.x + option.allocatedW <= free.x + free.w + 0.001 &&
            anchor.y + option.allocatedH <= free.y + free.h + 0.001 &&
            arr.findIndex((other) => Math.abs(other.x - anchor.x) < 0.001 && Math.abs(other.y - anchor.y) < 0.001) === index
        );

        for (const anchor of anchorCandidates) {
          const placements = [
            ...plate.placements,
            {
              xMm: anchor.x,
              yMm: anchor.y,
              widthMm: option.orientedPart.w,
              heightMm: option.orientedPart.h,
              name: part.name,
              rotationDeg: option.orientedPart.rotationDeg,
              sourceSegments: part.sourceSegments,
              sourceBounds: part.sourceBounds
            } satisfies NestingPlacement
          ];
          const compactArea = measureCompactArea(placements);
          const leftoverW = free.w - option.allocatedW;
          const leftoverH = free.h - option.allocatedH;
          const score1 = compactArea;
          const score2 = Math.min(leftoverW, leftoverH);
          const score3 = anchor.x + anchor.y + Math.max(leftoverW, leftoverH);
          if (
            !best ||
            score1 < best.score1 ||
            (score1 === best.score1 && score2 < best.score2) ||
            (score1 === best.score1 && score2 === best.score2 && score3 < best.score3)
          ) {
            best = {
              rectIndex: i,
              x: anchor.x,
              y: anchor.y,
              allocatedW: option.allocatedW,
              allocatedH: option.allocatedH,
              orientedPart: option.orientedPart,
              score1,
              score2,
              score3
            };
          }
        }
      }
    }

    if (!best) return false;

    plate.placements.push({
      xMm: best.x,
      yMm: best.y,
      widthMm: best.orientedPart.w,
      heightMm: best.orientedPart.h,
      name: part.name,
      rotationDeg: best.orientedPart.rotationDeg,
      sourceSegments: part.sourceSegments,
      sourceBounds: part.sourceBounds
    });

    const placedRect: FreeRect = {
      x: best.x,
      y: best.y,
      w: best.allocatedW,
      h: best.allocatedH
    };
    const newFreeRects: FreeRect[] = [];

    for (const free of plate.freeRects) {
      if (!intersects(free, placedRect)) {
        newFreeRects.push(free);
        continue;
      }

      if (placedRect.x > free.x) {
        newFreeRects.push({
          x: free.x,
          y: free.y,
          w: placedRect.x - free.x,
          h: free.h
        });
      }
      if (placedRect.x + placedRect.w < free.x + free.w) {
        newFreeRects.push({
          x: placedRect.x + placedRect.w,
          y: free.y,
          w: free.x + free.w - (placedRect.x + placedRect.w),
          h: free.h
        });
      }
      if (placedRect.y > free.y) {
        newFreeRects.push({
          x: free.x,
          y: free.y,
          w: free.w,
          h: placedRect.y - free.y
        });
      }
      if (placedRect.y + placedRect.h < free.y + free.h) {
        newFreeRects.push({
          x: free.x,
          y: placedRect.y + placedRect.h,
          w: free.w,
          h: free.y + free.h - (placedRect.y + placedRect.h)
        });
      }
    }

    const filtered = newFreeRects.filter((r) => r.w > 0.001 && r.h > 0.001);
    const pruned: FreeRect[] = [];
    for (let i = 0; i < filtered.length; i += 1) {
      let contained = false;
      for (let j = 0; j < filtered.length; j += 1) {
        if (i === j) continue;
        if (contains(filtered[j], filtered[i])) {
          contained = true;
          break;
        }
      }
      if (!contained) pruned.push(filtered[i]);
    }
    plate.freeRects = pruned;
    return true;
  };

  const runStrategy = (parts: ExpandedPart[]): NestingCandidateResult => {
    const plates: Plate[] = [];
    for (const part of parts) {
      let placed = false;
      for (const plate of plates) {
        if (placePartOnPlate(plate, part)) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        const plate = createPlate();
        if (placePartOnPlate(plate, part)) {
          plates.push(plate);
        }
      }
    }

    const totalParts = expandedBase.length;
    const usedAreaMm2 = expandedBase.reduce((sum, part) => sum + part.w * part.h, 0);
    const totalPlateAreaMm2 = Math.max(1, plates.length) * plateWidthMm * plateHeightMm;
    const utilizationPercent = (usedAreaMm2 / totalPlateAreaMm2) * 100;
    const wastePercent = Math.max(0, 100 - utilizationPercent);
    const compactAreaMm2 = plates.reduce((sum, plate) => sum + measureCompactArea(plate.placements), 0);

    return {
      plateWidthMm,
      plateHeightMm,
      plateCount: Math.max(1, plates.length),
      totalParts,
      usedAreaMm2,
      totalPlateAreaMm2,
      wastePercent,
      utilizationPercent,
      layouts: plates.map((plate) => ({ placements: plate.placements })),
      compactAreaMm2
    };
  };

  const computeHorizontalInterlock = (left: OrientedPart, right: OrientedPart) => {
    if (!left.profile || !right.profile) return 0;
    const samples = Math.min(left.profile.rowMins.length, right.profile.rowMins.length);
    let overlap = Number.POSITIVE_INFINITY;
    for (let index = 0; index < samples; index += 1) {
      const sampleY = ((index + 0.5) / samples) * Math.min(left.h, right.h);
      const leftRange = getProfileRowRange(left.profile, sampleY);
      const rightRange = getProfileRowRange(right.profile, sampleY);
      const rightInsetOfLeft = Math.max(0, left.w - leftRange.maxX);
      const leftInsetOfRight = Math.max(0, rightRange.minX);
      overlap = Math.min(overlap, rightInsetOfLeft + leftInsetOfRight - gapMm);
    }
    if (!Number.isFinite(overlap)) return 0;
    return Math.max(0, Math.min(left.w, overlap));
  };

  const runInterlockingStrategy = (parts: ExpandedPart[]): NestingCandidateResult => {
    type ShelfRow = {
      y: number;
      height: number;
      cursorX: number;
      lastPart: OrientedPart | null;
      placements: NestingPlacement[];
    };
    type ShelfPlate = {
      rows: ShelfRow[];
      placements: NestingPlacement[];
      nextRowY: number;
    };

    const createShelfPlate = (): ShelfPlate => ({
      rows: [],
      placements: [],
      nextRowY: 0
    });

    const tryPlaceInRow = (row: ShelfRow, candidate: OrientedPart) => {
      if (candidate.h > row.height + 0.001) return null;
      let x = row.cursorX === 0 ? 0 : row.cursorX;
      if (row.lastPart) {
        x = Math.max(0, row.cursorX - computeHorizontalInterlock(row.lastPart, candidate));
      }
      if (x + candidate.w > plateWidthMm + 0.001) return null;
      return { x, y: row.y };
    };

    const tryPlaceOnPlate = (plate: ShelfPlate, part: ExpandedPart) => {
      const options: OrientedPart[] = [orientPart(part, 0), orientPart(part, 180)];
      let best:
        | {
            row: ShelfRow;
            option: OrientedPart;
            x: number;
            y: number;
            score: number;
          }
        | null = null;

      for (const row of plate.rows) {
        for (const option of options) {
          const placed = tryPlaceInRow(row, option);
          if (!placed) continue;
          const overlapScore = row.lastPart ? computeHorizontalInterlock(row.lastPart, option) : 0;
          const widthSlack = plateWidthMm - (placed.x + option.w);
          const score = overlapScore * 1000 - widthSlack - (row.height - option.h) * 0.5;
          if (!best || score > best.score) {
            best = { row, option, x: placed.x, y: placed.y, score };
          }
        }
      }

      if (best) {
        const placement: NestingPlacement = {
          xMm: best.x,
          yMm: best.y,
          widthMm: best.option.w,
          heightMm: best.option.h,
          name: part.name,
          rotationDeg: best.option.rotationDeg,
          sourceSegments: part.sourceSegments,
          sourceBounds: part.sourceBounds
        };
        best.row.placements.push(placement);
        best.row.lastPart = best.option;
        best.row.cursorX = best.x + best.option.w + gapMm;
        plate.placements.push(placement);
        return true;
      }

      const newRowOptions = options
        .filter((option) => plate.nextRowY + option.h <= plateHeightMm + 0.001)
        .sort((a, b) => a.h - b.h || a.w - b.w);
      const option = newRowOptions[0];
      if (!option) return false;

      const row: ShelfRow = {
        y: plate.nextRowY,
        height: option.h,
        cursorX: option.w + gapMm,
        lastPart: option,
        placements: [
          {
            xMm: 0,
            yMm: plate.nextRowY,
            widthMm: option.w,
            heightMm: option.h,
            name: part.name,
            rotationDeg: option.rotationDeg,
            sourceSegments: part.sourceSegments,
            sourceBounds: part.sourceBounds
          }
        ]
      };
      plate.rows.push(row);
      plate.placements.push(row.placements[0]);
      plate.nextRowY += option.h + gapMm;
      return true;
    };

    const plates: ShelfPlate[] = [];
    for (const part of parts) {
      let placed = false;
      for (const plate of plates) {
        if (tryPlaceOnPlate(plate, part)) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        const plate = createShelfPlate();
        if (tryPlaceOnPlate(plate, part)) plates.push(plate);
      }
    }

    const totalParts = expandedBase.length;
    const usedAreaMm2 = expandedBase.reduce((sum, part) => sum + part.w * part.h, 0);
    const totalPlateAreaMm2 = Math.max(1, plates.length) * plateWidthMm * plateHeightMm;
    const utilizationPercent = (usedAreaMm2 / totalPlateAreaMm2) * 100;
    const wastePercent = Math.max(0, 100 - utilizationPercent);
    const compactAreaMm2 = plates.reduce((sum, plate) => sum + measureCompactArea(plate.placements), 0);

    return {
      plateWidthMm,
      plateHeightMm,
      plateCount: Math.max(1, plates.length),
      totalParts,
      usedAreaMm2,
      totalPlateAreaMm2,
      wastePercent,
      utilizationPercent,
      layouts: plates.map((plate) => ({ placements: plate.placements })),
      compactAreaMm2
    };
  };

  const strategies: Array<(parts: ExpandedPart[]) => ExpandedPart[]> = [
    (parts) => [...parts].sort((a, b) => b.w * b.h - a.w * a.h),
    (parts) => [...parts].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)),
    (parts) => [...parts].sort((a, b) => b.h - a.h),
    (parts) => [...parts].sort((a, b) => b.w - a.w)
  ];

  const candidates = strategies.map((sorter) => runStrategy(sorter(expandedBase)));
  if (expandedBase.some((part) => part.sourceSegments?.length && part.sourceBounds)) {
    candidates.push(
      ...strategies.map((sorter) =>
        runInterlockingStrategy(
          sorter(expandedBase).sort((a, b) => b.h - a.h || b.w - a.w)
        )
      )
    );
  }
  candidates.sort(
    (a, b) =>
      a.plateCount - b.plateCount ||
      a.compactAreaMm2 - b.compactAreaMm2 ||
      a.wastePercent - b.wastePercent ||
      b.utilizationPercent - a.utilizationPercent
  );
  return candidates[0];
}

export async function readDxfText(file: File) {
  const buf = await file.arrayBuffer();
  return decodeDxfArrayBuffer(buf);
}

export function decodeDxfArrayBuffer(buf: ArrayBuffer) {
  const decoders = ["utf-8", "utf-16le", "utf-16be", "windows-1252"] as const;
  for (const encoding of decoders) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(buf);
      if (text.includes("SECTION") || text.includes("ENTITIES") || text.includes("LINE")) {
        return text;
      }
    } catch {
      // try next encoding
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

export function decodeBase64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function createDxfThumbnailDataUrl(raw: string) {
  const segments = parseDxfSegments(raw);
  return createSegmentThumbnailDataUrl(segments);
}

