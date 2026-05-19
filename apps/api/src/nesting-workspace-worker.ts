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

function rotatedSize(part: WorkerPart, rotation: number) {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return normalized === 90 || normalized === 270 ? { width: part.height, height: part.width } : { width: part.width, height: part.height };
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
  if (result.placements.length) {
    return result.placements.map((placement) => ({
      partId: Number(String(placement.partId).split("_")[0]),
      sheetIndex: 0,
      x: placement.x,
      y: placement.y,
      rotation: placement.rotation,
      mirrored: false,
      isManual: false
    })).filter((placement) => Number.isFinite(placement.partId));
  }

  const expanded = parts.flatMap((part) => Array.from({ length: Math.max(1, Math.round(part.quantity || 1)) }, () => part));
  const placements: Array<{ partId: number; sheetIndex: number; x: number; y: number; rotation: number; mirrored: boolean; isManual: boolean }> = [];
  let x = workspace.border;
  let y = workspace.border;
  let rowHeight = 0;
  let sheetIndex = 0;
  for (const part of expanded.sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height))) {
    const rotations = workspace.allowRotation ? [0, 90, 180, 270] : [0];
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
      const size = rotatedSize(part, rotations[0] ?? 0);
      placed = { x, y, rotation: rotations[0] ?? 0, ...size };
    }
    placements.push({ partId: part.id, sheetIndex, x: placed.x, y: placed.y, rotation: placed.rotation, mirrored: false, isManual: false });
    x += placed.width + workspace.spacing;
    rowHeight = Math.max(rowHeight, placed.height);
  }
  return placements;
}

try {
  parentPort?.postMessage({ placements: pack(workerData.workspace, workerData.parts) });
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
