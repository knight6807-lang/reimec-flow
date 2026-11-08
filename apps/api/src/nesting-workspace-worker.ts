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

function rotatedSize(part: WorkerPart, rotation: number) {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return normalized === 90 || normalized === 270 ? { width: part.height, height: part.width } : { width: part.width, height: part.height };
}

function partFitsSheet(workspace: WorkerWorkspace, part: WorkerPart, rotation: number) {
  const size = rotatedSize(part, rotation);
  const usableWidth = Math.max(0, workspace.sheetWidth - workspace.border * 2);
  const usableHeight = Math.max(0, workspace.sheetHeight - workspace.border * 2);
  return size.width <= usableWidth + 0.001 && size.height <= usableHeight + 0.001;
}

function pack(workspace: WorkerWorkspace, parts: WorkerPart[]) {
  const engineParts: NestPart[] = parts.map((part) => ({
    id: String(part.id),
    name: part.name || `Part ${part.id}`,
    quantity: Math.max(1, Math.round(part.quantity || 1)),
    allowRotation: workspace.allowRotation && part.allowRotation !== false,
    polygon: part.polygon && part.polygon.length >= 3
      ? part.polygon
      : [{ x: 0, y: 0 }, { x: part.width, y: 0 }, { x: part.width, y: part.height }, { x: 0, y: part.height }]
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

  const placements: WorkerPlacement[] = result.placements
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
  for (const placement of placements) {
    placedCounts.set(placement.partId, (placedCounts.get(placement.partId) ?? 0) + 1);
  }

  const remaining = parts.flatMap((part) => {
    const already = placedCounts.get(part.id) ?? 0;
    const needed = Math.max(0, Math.max(1, Math.round(part.quantity || 1)) - already);
    return Array.from({ length: needed }, () => part);
  });

  if (!remaining.length) {
    return { placements, unplacedCount: result.unplaced.length };
  }

  let x = workspace.border;
  let y = workspace.border;
  let rowHeight = 0;
  let sheetIndex = Math.max(0, ...placements.map((placement) => placement.sheetIndex), -1) + (placements.length ? 1 : 0);
  let unplacedCount = result.unplaced.length;

  for (const part of remaining.sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height))) {
    const rotations = workspace.allowRotation ? [0, 90, 180, 270] : [0];
    if (!rotations.some((rotation) => partFitsSheet(workspace, part, rotation))) {
      unplacedCount += 1;
      continue;
    }

    let placed: { x: number; y: number; rotation: number; width: number; height: number } | null = null;
    for (const rotation of rotations) {
      const size = rotatedSize(part, rotation);
      if (x + size.width <= workspace.sheetWidth - workspace.border && y + size.height <= workspace.sheetHeight - workspace.border) {
        placed = { x, y, rotation, ...size };
        break;
      }
    }
    if (!placed) {
      x = workspace.border;
      y += rowHeight + workspace.spacing;
      rowHeight = 0;
      for (const rotation of rotations) {
        const size = rotatedSize(part, rotation);
        if (x + size.width <= workspace.sheetWidth - workspace.border && y + size.height <= workspace.sheetHeight - workspace.border) {
          placed = { x, y, rotation, ...size };
          break;
        }
      }
    }
    if (!placed) {
      sheetIndex += 1;
      x = workspace.border;
      y = workspace.border;
      rowHeight = 0;
      for (const rotation of rotations) {
        const size = rotatedSize(part, rotation);
        if (size.width <= workspace.sheetWidth - workspace.border * 2 && size.height <= workspace.sheetHeight - workspace.border * 2) {
          placed = { x, y, rotation, ...size };
          break;
        }
      }
    }
    if (!placed) {
      unplacedCount += 1;
      continue;
    }
    placements.push({ partId: part.id, sheetIndex, x: placed.x, y: placed.y, rotation: placed.rotation, mirrored: false, isManual: false });
    x += placed.width + workspace.spacing;
    rowHeight = Math.max(rowHeight, placed.height);
  }

  return { placements, unplacedCount };
}

try {
  parentPort?.postMessage(pack(workerData.workspace, workerData.parts));
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
