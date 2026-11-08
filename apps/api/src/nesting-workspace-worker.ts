import { parentPort, workerData } from "node:worker_threads";
import { runAdvancedNesting, type NestPart, type SheetSource } from "./nesting-engine.js";

type WorkerWorkspace = {
  border: number;
  spacing: number;
  kerf: number;
  sheetWidth: number;
  sheetHeight: number;
  allowRotation: boolean;
  customerName?: string;
  nestName?: string;
};

type WorkerPart = {
  id: number;
  name?: string;
  quantity: number;
  width: number;
  height: number;
  polygon?: Array<{ x: number; y: number }>;
  allowRotation?: boolean;
};

type WorkerPlacement = {
  partId: number;
  sheetIndex: number;
  x: number;
  y: number;
  rotation: number;
  mirrored: boolean;
  isManual: boolean;
};

type Point = { x: number; y: number };

function rotatedSize(part: WorkerPart, rotation: number) {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return normalized === 90 || normalized === 270 ? { width: part.height, height: part.width } : { width: part.width, height: part.height };
}

function partPolygon(part: WorkerPart): Point[] {
  if (part.polygon && part.polygon.length >= 3) {
    return part.polygon.map((point) => ({ x: Number(point.x), y: Number(point.y) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  return [
    { x: 0, y: 0 },
    { x: part.width, y: 0 },
    { x: part.width, y: part.height },
    { x: 0, y: part.height }
  ];
}

function rotatePoint(point: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
  };
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

function transformedPolygon(part: WorkerPart, x: number, y: number, rotation: number) {
  const polygon = partPolygon(part);
  const rotated = polygon.map((point) => rotatePoint(point, rotation));
  const bounds = boundsForPoints(rotated);
  return polygon.map((point) => {
    const next = rotatePoint(point, rotation);
    return { x: next.x - bounds.minX + x, y: next.y - bounds.minY + y };
  });
}

function boxesOverlap(a: ReturnType<typeof boundsForPoints>, b: ReturnType<typeof boundsForPoints>, spacing: number) {
  return !(a.minX >= b.maxX + spacing || a.maxX + spacing <= b.minX || a.minY >= b.maxY + spacing || a.maxY + spacing <= b.minY);
}

function partFitsSheet(workspace: WorkerWorkspace, part: WorkerPart, rotation: number) {
  const size = rotatedSize(part, rotation);
  const usableWidth = Math.max(0, workspace.sheetWidth - workspace.border * 2);
  const usableHeight = Math.max(0, workspace.sheetHeight - workspace.border * 2);
  return size.width <= usableWidth + 0.001 && size.height <= usableHeight + 0.001;
}

function candidatePoints(
  workspace: WorkerWorkspace,
  part: WorkerPart,
  rotation: number,
  sheetPlacements: WorkerPlacement[],
  partsById: Map<number, WorkerPart>,
  spacing: number
) {
  const size = rotatedSize(part, rotation);
  const points: Point[] = [{ x: workspace.border, y: workspace.border }];
  for (const placement of sheetPlacements) {
    const other = partsById.get(placement.partId);
    if (!other) continue;
    const box = boundsForPoints(transformedPolygon(other, placement.x, placement.y, placement.rotation));
    points.push(
      { x: box.maxX + spacing, y: box.minY },
      { x: box.minX, y: box.maxY + spacing },
      { x: box.maxX + spacing, y: box.maxY + spacing },
      { x: workspace.border, y: box.maxY + spacing },
      { x: box.maxX + spacing, y: workspace.border }
    );
  }
  return points
    .map((point) => ({
      x: Math.max(workspace.border, Math.min(point.x, workspace.sheetWidth - workspace.border - size.width)),
      y: Math.max(workspace.border, Math.min(point.y, workspace.sheetHeight - workspace.border - size.height))
    }))
    .filter((point, index, list) => index === list.findIndex((entry) => Math.abs(entry.x - point.x) < 0.1 && Math.abs(entry.y - point.y) < 0.1))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function placeRemaining(
  workspace: WorkerWorkspace,
  remaining: WorkerPart[],
  existing: WorkerPlacement[],
  partsById: Map<number, WorkerPart>
) {
  const spacing = Math.max(0, workspace.spacing + workspace.kerf);
  const placements = [...existing];
  let unplacedCount = 0;
  const ordered = [...remaining].sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.width * b.height - a.width * a.height);

  for (const part of ordered) {
    const rotations = workspace.allowRotation && part.allowRotation !== false ? [0, 90, 180, 270] : [0];
    if (!rotations.some((rotation) => partFitsSheet(workspace, part, rotation))) {
      unplacedCount += 1;
      continue;
    }
    let best: { sheetIndex: number; x: number; y: number; rotation: number; score: number } | null = null;
    const maxSheet = Math.max(0, ...placements.map((placement) => placement.sheetIndex), -1);
    for (let sheetIndex = 0; sheetIndex <= maxSheet + 1; sheetIndex += 1) {
      const sheetPlacements = placements.filter((placement) => placement.sheetIndex === sheetIndex);
      for (const rotation of rotations) {
        for (const candidate of candidatePoints(workspace, part, rotation, sheetPlacements, partsById, spacing)) {
          const polygon = transformedPolygon(part, candidate.x, candidate.y, rotation);
          const box = boundsForPoints(polygon);
          if (box.minX < workspace.border - 0.001 || box.minY < workspace.border - 0.001) continue;
          if (box.maxX > workspace.sheetWidth - workspace.border + 0.001 || box.maxY > workspace.sheetHeight - workspace.border + 0.001) continue;
          const collides = sheetPlacements.some((placement) => {
            const other = partsById.get(placement.partId);
            if (!other) return false;
            const otherBox = boundsForPoints(transformedPolygon(other, placement.x, placement.y, placement.rotation));
            return boxesOverlap(box, otherBox, spacing);
          });
          if (collides) continue;
          const score = sheetIndex * 1_000_000_000 + box.minY * 100_000 + box.minX;
          if (!best || score < best.score) best = { sheetIndex, x: candidate.x, y: candidate.y, rotation, score };
        }
      }
      if (best?.sheetIndex === sheetIndex) break;
    }
    if (!best) {
      unplacedCount += 1;
      continue;
    }
    placements.push({
      partId: part.id,
      sheetIndex: best.sheetIndex,
      x: best.x,
      y: best.y,
      rotation: best.rotation,
      mirrored: false,
      isManual: false
    });
  }

  return { placements, unplacedCount };
}

function pack(workspace: WorkerWorkspace, parts: WorkerPart[]) {
  const partsById = new Map(parts.map((part) => [part.id, part]));
  const engineParts: NestPart[] = parts.map((part) => ({
    id: String(part.id),
    name: part.name || `Part ${part.id}`,
    quantity: Math.max(1, Math.round(part.quantity || 1)),
    allowRotation: workspace.allowRotation && part.allowRotation !== false,
    polygon: partPolygon(part)
  }));
  const sheet: SheetSource = {
    type: "sheet",
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

  const enginePlacements: WorkerPlacement[] = result.placements
    .map((placement) => ({
      partId: Number(String(placement.partId).split("_")[0]),
      sheetIndex: 0,
      x: placement.x,
      y: placement.y,
      rotation: placement.rotation,
      mirrored: false,
      isManual: false
    }))
    .filter((placement) => Number.isFinite(placement.partId));

  const placedCounts = new Map<number, number>();
  for (const placement of enginePlacements) {
    placedCounts.set(placement.partId, (placedCounts.get(placement.partId) ?? 0) + 1);
  }

  const remaining = parts.flatMap((part) => {
    const already = placedCounts.get(part.id) ?? 0;
    const needed = Math.max(0, Math.max(1, Math.round(part.quantity || 1)) - already);
    return Array.from({ length: needed }, () => part);
  });

  if (!remaining.length) {
    return { placements: enginePlacements, unplacedCount: result.unplaced.length };
  }

  const packed = placeRemaining(workspace, remaining, enginePlacements, partsById);
  return {
    placements: packed.placements,
    unplacedCount: packed.unplacedCount + result.unplaced.filter((part) => {
      const id = Number(String(part.id).split("_")[0]);
      return !remaining.some((entry) => entry.id === id);
    }).length
  };
}

try {
  parentPort?.postMessage(pack(workerData.workspace, workerData.parts));
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
