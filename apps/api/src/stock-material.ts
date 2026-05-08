import fs from "node:fs";
import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";

export type StockStatus = "available" | "reserved" | "used" | "scrapped";
export type StockMovementType = "received" | "reserved" | "released" | "used" | "offcut_created" | "adjusted" | "scrapped";

export type MaterialRecord = {
  id: number;
  name: string;
  grade: string | null;
  defaultDensity: number | null;
  createdAt: string;
  updatedAt: string;
};

export type StockSheetRecord = {
  id: number;
  material: string;
  thickness: number;
  width: number;
  height: number;
  quantity: number;
  supplier: string | null;
  costPerSheet: number | null;
  costPerKg: number | null;
  location: string | null;
  status: StockStatus;
  reservedJobId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OffcutRecord = {
  id: number;
  parentSheetId: number | null;
  material: string;
  thickness: number;
  width: number;
  height: number;
  shapeData: string | null;
  usableArea: number;
  location: string | null;
  status: StockStatus;
  reservedJobId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StockMovementRecord = {
  id: number;
  type: StockMovementType;
  material: string;
  thickness: number;
  sheetId: number | null;
  offcutId: number | null;
  jobId: string | null;
  quantity: number;
  notes: string | null;
  createdAt: string;
};

export type StockFitResult = {
  fitsNormal: boolean;
  fitsRotated: boolean;
  wasteArea: number;
  savingEstimate: number;
};

export type StockMatchResult = {
  type: "offcut" | "sheet" | null;
  offcut: OffcutRecord | null;
  sheet: StockSheetRecord | null;
  fit: StockFitResult | null;
  materialRequired: boolean;
  message: string;
};

export type StockWarning = {
  material: string;
  thickness: number;
  availableQuantity: number;
  minimumQuantity: number;
  message: string;
};

export type StockSnapshot = {
  materials: MaterialRecord[];
  sheets: StockSheetRecord[];
  offcuts: OffcutRecord[];
  movements: StockMovementRecord[];
  lowStockWarnings: StockWarning[];
};

export type QuoteStockSuggestion = {
  bestOffcut: (OffcutRecord & { fit: StockFitResult }) | null;
  bestSheet: (StockSheetRecord & { fit: StockFitResult }) | null;
  materialRequired: boolean;
  estimatedSaving: number;
  message: string;
};

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function positiveNumber(value: unknown, field: string) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${field} must be greater than 0`);
  }
  return numeric;
}

function nonNegativeNumber(value: unknown, field: string) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${field} must not be negative`);
  }
  return numeric;
}

function stringOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function materialKey(material: string) {
  return material.trim().toLowerCase();
}

function thicknessEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.0001;
}

function usableArea(width: number, height: number) {
  return width * height;
}

function computeFit(width: number, height: number, requiredWidth: number, requiredHeight: number, costBasis = 0): StockFitResult {
  const fitsNormal = width >= requiredWidth && height >= requiredHeight;
  const fitsRotated = height >= requiredWidth && width >= requiredHeight;
  const wasteArea = Math.max(0, usableArea(width, height) - usableArea(requiredWidth, requiredHeight));
  const savingEstimate = costBasis > 0 ? Math.max(0, (wasteArea / Math.max(1, usableArea(width, height))) * costBasis) : 0;
  return { fitsNormal, fitsRotated, wasteArea, savingEstimate };
}

function sortBySmallestWaste<T extends { width: number; height: number }>(requiredWidth: number, requiredHeight: number, rows: T[]) {
  return rows.slice().sort((left, right) => {
    const leftFit = computeFit(left.width, left.height, requiredWidth, requiredHeight);
    const rightFit = computeFit(right.width, right.height, requiredWidth, requiredHeight);
    return leftFit.wasteArea - rightFit.wasteArea || usableArea(left.width, left.height) - usableArea(right.width, right.height);
  });
}

function rowToMaterial(row: Record<string, unknown>): MaterialRecord {
  return {
    id: Number(row.id ?? 0),
    name: String(row.name ?? ""),
    grade: row.grade ? String(row.grade) : null,
    defaultDensity: row.defaultDensity === null || row.defaultDensity === undefined ? null : Number(row.defaultDensity),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? "")
  };
}

function rowToSheet(row: Record<string, unknown>): StockSheetRecord {
  return {
    id: Number(row.id ?? 0),
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    width: Number(row.width ?? 0),
    height: Number(row.height ?? 0),
    quantity: Number(row.quantity ?? 0),
    supplier: row.supplier ? String(row.supplier) : null,
    costPerSheet: row.costPerSheet === null || row.costPerSheet === undefined ? null : Number(row.costPerSheet),
    costPerKg: row.costPerKg === null || row.costPerKg === undefined ? null : Number(row.costPerKg),
    location: row.location ? String(row.location) : null,
    status: row.status === "reserved" || row.status === "used" || row.status === "scrapped" ? row.status : "available",
    reservedJobId: row.reservedJobId ? String(row.reservedJobId) : null,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? "")
  };
}

function rowToOffcut(row: Record<string, unknown>): OffcutRecord {
  return {
    id: Number(row.id ?? 0),
    parentSheetId: row.parentSheetId === null || row.parentSheetId === undefined ? null : Number(row.parentSheetId),
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    width: Number(row.width ?? 0),
    height: Number(row.height ?? 0),
    shapeData: row.shapeData ? String(row.shapeData) : null,
    usableArea: Number(row.usableArea ?? 0),
    location: row.location ? String(row.location) : null,
    status: row.status === "reserved" || row.status === "used" || row.status === "scrapped" ? row.status : "available",
    reservedJobId: row.reservedJobId ? String(row.reservedJobId) : null,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? "")
  };
}

function rowToMovement(row: Record<string, unknown>): StockMovementRecord {
  return {
    id: Number(row.id ?? 0),
    type:
      row.type === "reserved" ||
      row.type === "released" ||
      row.type === "used" ||
      row.type === "offcut_created" ||
      row.type === "adjusted" ||
      row.type === "scrapped"
        ? row.type
        : "received",
    material: String(row.material ?? ""),
    thickness: Number(row.thickness ?? 0),
    sheetId: row.sheetId === null || row.sheetId === undefined ? null : Number(row.sheetId),
    offcutId: row.offcutId === null || row.offcutId === undefined ? null : Number(row.offcutId),
    jobId: row.jobId ? String(row.jobId) : null,
    quantity: Number(row.quantity ?? 0),
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.createdAt ?? "")
  };
}

export function openStockMaterialDatabase(rootDir: string) {
  ensureDir(rootDir);
  const dbPath = path.join(rootDir, "qouterx-stock-material.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade TEXT,
      defaultDensity REAL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      quantity INTEGER NOT NULL,
      supplier TEXT,
      costPerSheet REAL,
      costPerKg REAL,
      location TEXT,
      status TEXT NOT NULL,
      reservedJobId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offcuts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parentSheetId INTEGER,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      shapeData TEXT,
      usableArea REAL NOT NULL,
      location TEXT,
      status TEXT NOT NULL,
      reservedJobId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(parentSheetId) REFERENCES stock_sheets(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      material TEXT NOT NULL,
      thickness REAL NOT NULL,
      sheetId INTEGER,
      offcutId INTEGER,
      jobId TEXT,
      quantity REAL NOT NULL,
      notes TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stock_sheet_lookup ON stock_sheets(material, thickness, status);
    CREATE INDEX IF NOT EXISTS idx_offcut_lookup ON offcuts(material, thickness, status);
    CREATE INDEX IF NOT EXISTS idx_stock_movement_job ON stock_movements(jobId, createdAt DESC);
  `);
  try {
    db.exec(`ALTER TABLE stock_sheets ADD COLUMN reservedJobId TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE offcuts ADD COLUMN reservedJobId TEXT`);
  } catch {}
  return db;
}

function addMovement(
  db: DatabaseSync,
  input: Omit<StockMovementRecord, "id" | "createdAt">
) {
  db.prepare(`
    INSERT INTO stock_movements (type, material, thickness, sheetId, offcutId, jobId, quantity, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.type,
    input.material,
    input.thickness,
    input.sheetId ?? null,
    input.offcutId ?? null,
    input.jobId ?? null,
    input.quantity,
    input.notes ?? null,
    nowIso()
  );
}

export function listMaterials(db: DatabaseSync) {
  return db.prepare("SELECT * FROM materials ORDER BY name ASC, grade ASC, id ASC").all().map((row) => rowToMaterial(row as Record<string, unknown>));
}

export function upsertMaterial(
  db: DatabaseSync,
  input: { id?: number; name: string; grade?: string | null; defaultDensity?: number | null }
) {
  const name = input.name.trim();
  if (!name) throw new Error("Material name is required");
  const now = nowIso();
  if (input.id) {
    db.prepare(`
      UPDATE materials
      SET name = ?, grade = ?, defaultDensity = ?, updatedAt = ?
      WHERE id = ?
    `).run(name, stringOrNull(input.grade), input.defaultDensity ?? null, now, input.id);
    const row = db.prepare("SELECT * FROM materials WHERE id = ?").get(input.id) as Record<string, unknown> | undefined;
    return row ? rowToMaterial(row) : null;
  }
  const inserted = db.prepare(`
    INSERT INTO materials (name, grade, defaultDensity, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, stringOrNull(input.grade), input.defaultDensity ?? null, now, now);
  const row = db.prepare("SELECT * FROM materials WHERE id = ?").get(Number(inserted.lastInsertRowid)) as Record<string, unknown>;
  return rowToMaterial(row);
}

export function listStockSheets(db: DatabaseSync) {
  return db.prepare("SELECT * FROM stock_sheets ORDER BY updatedAt DESC, id DESC").all().map((row) => rowToSheet(row as Record<string, unknown>));
}

export function getStockSheet(db: DatabaseSync, id: number) {
  const row = db.prepare("SELECT * FROM stock_sheets WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSheet(row) : null;
}

export function addStockSheet(
  db: DatabaseSync,
  input: Omit<StockSheetRecord, "id" | "createdAt" | "updatedAt" | "reservedJobId"> & { reservedJobId?: string | null }
) {
  const width = positiveNumber(input.width, "width");
  const height = positiveNumber(input.height, "height");
  const thickness = positiveNumber(input.thickness, "thickness");
  const quantity = Math.max(1, Math.round(positiveNumber(input.quantity, "quantity")));
  const now = nowIso();
  const inserted = db.prepare(`
    INSERT INTO stock_sheets (
      material, thickness, width, height, quantity, supplier, costPerSheet, costPerKg, location, status, reservedJobId, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.material.trim(),
    thickness,
    width,
    height,
    quantity,
    stringOrNull(input.supplier),
    input.costPerSheet ?? null,
    input.costPerKg ?? null,
    stringOrNull(input.location),
    input.status,
    stringOrNull(input.reservedJobId),
    now,
    now
  );
  const row = getStockSheet(db, Number(inserted.lastInsertRowid));
  if (row) {
    addMovement(db, {
      type: "received",
      material: row.material,
      thickness: row.thickness,
      sheetId: row.id,
      offcutId: null,
      jobId: null,
      quantity: row.quantity,
      notes: "Sheet added to stock"
    });
  }
  return row;
}

export function updateStockSheet(
  db: DatabaseSync,
  id: number,
  input: Partial<Omit<StockSheetRecord, "id" | "createdAt" | "updatedAt">>
) {
  const current = getStockSheet(db, id);
  if (!current) return null;
  if (current.status === "reserved" && input.status === "available" && current.reservedJobId) {
    throw new Error("Use releaseStockReservation to release reserved stock");
  }
  const next = {
    ...current,
    ...input,
    quantity: input.quantity === undefined ? current.quantity : Math.max(0, Math.round(nonNegativeNumber(input.quantity, "quantity")))
  };
  db.prepare(`
    UPDATE stock_sheets
    SET material = ?, thickness = ?, width = ?, height = ?, quantity = ?, supplier = ?, costPerSheet = ?, costPerKg = ?, location = ?, status = ?, reservedJobId = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    next.material.trim(),
    positiveNumber(next.thickness, "thickness"),
    positiveNumber(next.width, "width"),
    positiveNumber(next.height, "height"),
    next.quantity,
    stringOrNull(next.supplier),
    next.costPerSheet ?? null,
    next.costPerKg ?? null,
    stringOrNull(next.location),
    next.status,
    stringOrNull(next.reservedJobId),
    nowIso(),
    id
  );
  addMovement(db, {
    type: "adjusted",
    material: next.material,
    thickness: next.thickness,
    sheetId: id,
    offcutId: null,
    jobId: next.reservedJobId,
    quantity: next.quantity,
    notes: "Sheet adjusted"
  });
  return getStockSheet(db, id);
}

export function deleteStockSheet(db: DatabaseSync, id: number, force = false) {
  const current = getStockSheet(db, id);
  if (!current) return;
  if (!force && current.status === "reserved" && current.reservedJobId) {
    throw new Error("Cannot delete reserved stock without force");
  }
  db.prepare("DELETE FROM stock_sheets WHERE id = ?").run(id);
}

export function listOffcuts(db: DatabaseSync) {
  return db.prepare("SELECT * FROM offcuts ORDER BY updatedAt DESC, id DESC").all().map((row) => rowToOffcut(row as Record<string, unknown>));
}

export function getOffcut(db: DatabaseSync, id: number) {
  const row = db.prepare("SELECT * FROM offcuts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToOffcut(row) : null;
}

export function addOffcut(
  db: DatabaseSync,
  input: Omit<OffcutRecord, "id" | "usableArea" | "createdAt" | "updatedAt" | "reservedJobId"> & { reservedJobId?: string | null }
) {
  const width = positiveNumber(input.width, "width");
  const height = positiveNumber(input.height, "height");
  const thickness = positiveNumber(input.thickness, "thickness");
  const area = usableArea(width, height);
  const now = nowIso();
  const inserted = db.prepare(`
    INSERT INTO offcuts (
      parentSheetId, material, thickness, width, height, shapeData, usableArea, location, status, reservedJobId, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.parentSheetId ?? null,
    input.material.trim(),
    thickness,
    width,
    height,
    stringOrNull(input.shapeData),
    area,
    stringOrNull(input.location),
    input.status,
    stringOrNull(input.reservedJobId),
    now,
    now
  );
  const row = getOffcut(db, Number(inserted.lastInsertRowid));
  if (row) {
    addMovement(db, {
      type: "offcut_created",
      material: row.material,
      thickness: row.thickness,
      sheetId: row.parentSheetId,
      offcutId: row.id,
      jobId: row.reservedJobId,
      quantity: 1,
      notes: "Offcut added to stock"
    });
  }
  return row;
}

export function updateOffcut(
  db: DatabaseSync,
  id: number,
  input: Partial<Omit<OffcutRecord, "id" | "usableArea" | "createdAt" | "updatedAt">>
) {
  const current = getOffcut(db, id);
  if (!current) return null;
  if (current.status === "reserved" && input.status === "available" && current.reservedJobId) {
    throw new Error("Use releaseStockReservation to release reserved offcuts");
  }
  const width = input.width === undefined ? current.width : positiveNumber(input.width, "width");
  const height = input.height === undefined ? current.height : positiveNumber(input.height, "height");
  const next = {
    ...current,
    ...input,
    width,
    height,
    usableArea: usableArea(width, height)
  };
  db.prepare(`
    UPDATE offcuts
    SET parentSheetId = ?, material = ?, thickness = ?, width = ?, height = ?, shapeData = ?, usableArea = ?, location = ?, status = ?, reservedJobId = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    next.parentSheetId ?? null,
    next.material.trim(),
    positiveNumber(next.thickness, "thickness"),
    width,
    height,
    stringOrNull(next.shapeData),
    next.usableArea,
    stringOrNull(next.location),
    next.status,
    stringOrNull(next.reservedJobId),
    nowIso(),
    id
  );
  addMovement(db, {
    type: "adjusted",
    material: next.material,
    thickness: next.thickness,
    sheetId: next.parentSheetId,
    offcutId: id,
    jobId: next.reservedJobId,
    quantity: 1,
    notes: "Offcut adjusted"
  });
  return getOffcut(db, id);
}

export function deleteOffcut(db: DatabaseSync, id: number, force = false) {
  const current = getOffcut(db, id);
  if (!current) return;
  if (!force && current.status === "reserved" && current.reservedJobId) {
    throw new Error("Cannot delete reserved offcut without force");
  }
  db.prepare("DELETE FROM offcuts WHERE id = ?").run(id);
}

export function listStockMovements(db: DatabaseSync) {
  return db.prepare("SELECT * FROM stock_movements ORDER BY createdAt DESC, id DESC").all().map((row) => rowToMovement(row as Record<string, unknown>));
}

export function getAvailableStock(db: DatabaseSync, material?: string, thickness?: number | null) {
  return listStockSheets(db).filter((sheet) => {
    if (sheet.status !== "available") return false;
    if (material && materialKey(sheet.material) !== materialKey(material)) return false;
    if (typeof thickness === "number" && !thicknessEqual(sheet.thickness, thickness)) return false;
    return sheet.quantity > 0;
  });
}

export function getAvailableOffcuts(
  db: DatabaseSync,
  input?: { material?: string; thickness?: number | null; minimumWidth?: number | null; minimumHeight?: number | null }
) {
  return listOffcuts(db).filter((offcut) => {
    if (offcut.status !== "available") return false;
    if (input?.material && materialKey(offcut.material) !== materialKey(input.material)) return false;
    if (typeof input?.thickness === "number" && !thicknessEqual(offcut.thickness, input.thickness)) return false;
    if (typeof input?.minimumWidth === "number" && offcut.width < input.minimumWidth && offcut.height < input.minimumWidth) return false;
    if (typeof input?.minimumHeight === "number" && offcut.height < input.minimumHeight && offcut.width < input.minimumHeight) return false;
    return true;
  });
}

export function findBestOffcutMatch(
  db: DatabaseSync,
  material: string,
  thickness: number,
  requiredWidth: number,
  requiredHeight: number
) {
  const candidates = sortBySmallestWaste(requiredWidth, requiredHeight, getAvailableOffcuts(db, { material, thickness }));
  for (const offcut of candidates) {
    const fit = computeFit(offcut.width, offcut.height, requiredWidth, requiredHeight);
    if (fit.fitsNormal || fit.fitsRotated) {
      return { offcut, fit };
    }
  }
  return null;
}

export function findBestStockMatch(
  db: DatabaseSync,
  material: string,
  thickness: number,
  requiredWidth: number,
  requiredHeight: number
) {
  const candidates = sortBySmallestWaste(requiredWidth, requiredHeight, getAvailableStock(db, material, thickness));
  for (const sheet of candidates) {
    const fit = computeFit(sheet.width, sheet.height, requiredWidth, requiredHeight, sheet.costPerSheet ?? 0);
    if (fit.fitsNormal || fit.fitsRotated) {
      return { sheet, fit };
    }
  }
  return null;
}

export function buildQuoteStockSuggestion(
  db: DatabaseSync,
  input: {
    material: string;
    thickness: number;
    requiredWidth: number;
    requiredHeight: number;
  }
): QuoteStockSuggestion {
  const bestOffcut = findBestOffcutMatch(db, input.material, input.thickness, input.requiredWidth, input.requiredHeight);
  const bestSheet = findBestStockMatch(db, input.material, input.thickness, input.requiredWidth, input.requiredHeight);
  if (bestOffcut) {
    return {
      bestOffcut: { ...bestOffcut.offcut, fit: bestOffcut.fit },
      bestSheet: bestSheet ? { ...bestSheet.sheet, fit: bestSheet.fit } : null,
      materialRequired: false,
      estimatedSaving: bestOffcut.fit.savingEstimate || Math.max(0, (bestSheet?.sheet.costPerSheet ?? 0) * 0.15),
      message: "Use offcut"
    };
  }
  if (bestSheet) {
    return {
      bestOffcut: null,
      bestSheet: { ...bestSheet.sheet, fit: bestSheet.fit },
      materialRequired: false,
      estimatedSaving: 0,
      message: "Use full sheet"
    };
  }
  return {
    bestOffcut: null,
    bestSheet: null,
    materialRequired: true,
    estimatedSaving: 0,
    message: "Need to order material"
  };
}

function splitSheetForReservation(db: DatabaseSync, sheet: StockSheetRecord, jobId: string) {
  if (sheet.status !== "available") throw new Error("Cannot reserve non-available sheet");
  if (sheet.quantity < 1) throw new Error("Sheet quantity is empty");
  const now = nowIso();
  if (sheet.quantity === 1) {
    db.prepare(`
      UPDATE stock_sheets
      SET status = 'reserved', reservedJobId = ?, updatedAt = ?
      WHERE id = ?
    `).run(jobId, now, sheet.id);
    return getStockSheet(db, sheet.id);
  }
  db.prepare(`
    UPDATE stock_sheets
    SET quantity = ?, updatedAt = ?
    WHERE id = ?
  `).run(sheet.quantity - 1, now, sheet.id);
  const inserted = db.prepare(`
    INSERT INTO stock_sheets (
      material, thickness, width, height, quantity, supplier, costPerSheet, costPerKg, location, status, reservedJobId, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'reserved', ?, ?, ?)
  `).run(
    sheet.material,
    sheet.thickness,
    sheet.width,
    sheet.height,
    sheet.supplier,
    sheet.costPerSheet,
    sheet.costPerKg,
    sheet.location,
    jobId,
    now,
    now
  );
  return getStockSheet(db, Number(inserted.lastInsertRowid));
}

export function reserveStockForJob(
  db: DatabaseSync,
  jobId: string,
  material: string,
  thickness: number,
  requiredWidth: number,
  requiredHeight: number
) {
  if (!jobId.trim()) throw new Error("jobId is required");
  releaseStockReservation(db, jobId);
  const offcut = findBestOffcutMatch(db, material, thickness, requiredWidth, requiredHeight);
  if (offcut) {
    db.prepare(`
      UPDATE offcuts
      SET status = 'reserved', reservedJobId = ?, updatedAt = ?
      WHERE id = ? AND status = 'available'
    `).run(jobId, nowIso(), offcut.offcut.id);
    addMovement(db, {
      type: "reserved",
      material,
      thickness,
      sheetId: offcut.offcut.parentSheetId,
      offcutId: offcut.offcut.id,
      jobId,
      quantity: 1,
      notes: "Reserved offcut for job"
    });
    return {
      type: "offcut" as const,
      sheet: null,
      offcut: getOffcut(db, offcut.offcut.id),
      fit: offcut.fit
    };
  }
  const sheet = findBestStockMatch(db, material, thickness, requiredWidth, requiredHeight);
  if (sheet) {
    const reservedSheet = splitSheetForReservation(db, sheet.sheet, jobId);
    addMovement(db, {
      type: "reserved",
      material,
      thickness,
      sheetId: reservedSheet?.id ?? null,
      offcutId: null,
      jobId,
      quantity: 1,
      notes: "Reserved full sheet for job"
    });
    return {
      type: "sheet" as const,
      sheet: reservedSheet,
      offcut: null,
      fit: sheet.fit
    };
  }
  return {
    type: null,
    sheet: null,
    offcut: null,
    fit: null
  };
}

export function reserveSpecificOffcut(db: DatabaseSync, offcutId: number, reservationId: string) {
  const offcut = getOffcut(db, offcutId);
  if (!offcut) return null;
  if (offcut.status !== "available") {
    throw new Error("Cannot reserve non-available offcut");
  }
  const trimmedReservationId = reservationId.trim();
  if (!trimmedReservationId) {
    throw new Error("reservationId is required");
  }
  db.prepare(`
    UPDATE offcuts
    SET status = 'reserved', reservedJobId = ?, updatedAt = ?
    WHERE id = ? AND status = 'available'
  `).run(trimmedReservationId, nowIso(), offcutId);
  addMovement(db, {
    type: "reserved",
    material: offcut.material,
    thickness: offcut.thickness,
    sheetId: offcut.parentSheetId,
    offcutId: offcut.id,
    jobId: trimmedReservationId,
    quantity: 1,
    notes: "Reserved specific offcut"
  });
  return getOffcut(db, offcutId);
}

export function releaseStockReservation(db: DatabaseSync, jobId: string) {
  const reservedSheets = listStockSheets(db).filter((sheet) => sheet.status === "reserved" && sheet.reservedJobId === jobId);
  const reservedOffcuts = listOffcuts(db).filter((offcut) => offcut.status === "reserved" && offcut.reservedJobId === jobId);
  for (const sheet of reservedSheets) {
    db.prepare(`
      UPDATE stock_sheets
      SET status = 'available', reservedJobId = NULL, updatedAt = ?
      WHERE id = ?
    `).run(nowIso(), sheet.id);
    addMovement(db, {
      type: "released",
      material: sheet.material,
      thickness: sheet.thickness,
      sheetId: sheet.id,
      offcutId: null,
      jobId,
      quantity: sheet.quantity,
      notes: "Released reserved sheet"
    });
  }
  for (const offcut of reservedOffcuts) {
    db.prepare(`
      UPDATE offcuts
      SET status = 'available', reservedJobId = NULL, updatedAt = ?
      WHERE id = ?
    `).run(nowIso(), offcut.id);
    addMovement(db, {
      type: "released",
      material: offcut.material,
      thickness: offcut.thickness,
      sheetId: offcut.parentSheetId,
      offcutId: offcut.id,
      jobId,
      quantity: 1,
      notes: "Released reserved offcut"
    });
  }
}

export function markStockUsed(db: DatabaseSync, jobId: string) {
  const reservedSheets = listStockSheets(db).filter((sheet) => sheet.status === "reserved" && sheet.reservedJobId === jobId);
  const reservedOffcuts = listOffcuts(db).filter((offcut) => offcut.status === "reserved" && offcut.reservedJobId === jobId);
  for (const sheet of reservedSheets) {
    db.prepare(`
      UPDATE stock_sheets
      SET status = 'used', reservedJobId = NULL, updatedAt = ?
      WHERE id = ?
    `).run(nowIso(), sheet.id);
    addMovement(db, {
      type: "used",
      material: sheet.material,
      thickness: sheet.thickness,
      sheetId: sheet.id,
      offcutId: null,
      jobId,
      quantity: sheet.quantity,
      notes: "Reserved sheet used by job"
    });
  }
  for (const offcut of reservedOffcuts) {
    db.prepare(`
      UPDATE offcuts
      SET status = 'used', reservedJobId = NULL, updatedAt = ?
      WHERE id = ?
    `).run(nowIso(), offcut.id);
    addMovement(db, {
      type: "used",
      material: offcut.material,
      thickness: offcut.thickness,
      sheetId: offcut.parentSheetId,
      offcutId: offcut.id,
      jobId,
      quantity: 1,
      notes: "Reserved offcut used by job"
    });
  }
}

export function markSpecificOffcutUsed(db: DatabaseSync, offcutId: number, jobId?: string | null) {
  const offcut = getOffcut(db, offcutId);
  if (!offcut) return null;
  if (offcut.status !== "available" && offcut.status !== "reserved") {
    throw new Error("Cannot use offcut that is not available or reserved");
  }
  const effectiveJobId = jobId?.trim() || offcut.reservedJobId || null;
  db.prepare(`
    UPDATE offcuts
    SET status = 'used', reservedJobId = NULL, updatedAt = ?
    WHERE id = ?
  `).run(nowIso(), offcutId);
  addMovement(db, {
    type: "used",
    material: offcut.material,
    thickness: offcut.thickness,
    sheetId: offcut.parentSheetId,
    offcutId: offcut.id,
    jobId: effectiveJobId,
    quantity: 1,
    notes: "Specific offcut used"
  });
  return getOffcut(db, offcutId);
}

export function createOffcutFromJob(
  db: DatabaseSync,
  jobId: string,
  parentSheetId: number | null,
  width: number,
  height: number,
  shapeData?: string | null
) {
  const parentSheet = parentSheetId ? getStockSheet(db, parentSheetId) : null;
  if (!parentSheet) throw new Error("Parent sheet not found");
  const offcut = addOffcut(db, {
    parentSheetId,
    material: parentSheet.material,
    thickness: parentSheet.thickness,
    width,
    height,
    shapeData: shapeData ?? null,
    location: parentSheet.location,
    status: "available"
  });
  addMovement(db, {
    type: "offcut_created",
    material: parentSheet.material,
    thickness: parentSheet.thickness,
    sheetId: parentSheet.id,
    offcutId: offcut?.id ?? null,
    jobId,
    quantity: 1,
    notes: "Offcut created after job completion"
  });
  return offcut;
}

export function getLowStockWarnings(db: DatabaseSync, minimumQuantity = 2) {
  const available = getAvailableStock(db);
  const grouped = new Map<string, { material: string; thickness: number; quantity: number }>();
  for (const sheet of available) {
    const key = `${materialKey(sheet.material)}|${sheet.thickness}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { material: sheet.material, thickness: sheet.thickness, quantity: sheet.quantity });
    } else {
      current.quantity += sheet.quantity;
    }
  }
  return Array.from(grouped.values())
    .filter((entry) => entry.quantity < minimumQuantity)
    .map((entry) => ({
      material: entry.material,
      thickness: entry.thickness,
      availableQuantity: entry.quantity,
      minimumQuantity,
      message: `${entry.material} ${entry.thickness}mm has only ${entry.quantity} sheet${entry.quantity === 1 ? "" : "s"} available.`
    }));
}

export function searchStock(
  db: DatabaseSync,
  input: { material?: string; thickness?: number | null; width: number; height: number }
) {
  const material = input.material?.trim() ?? "";
  const thickness = input.thickness ?? null;
  if (!material || thickness === null) {
    return buildQuoteStockSuggestion(db, {
      material,
      thickness: thickness ?? 0,
      requiredWidth: input.width,
      requiredHeight: input.height
    });
  }
  return buildQuoteStockSuggestion(db, {
    material,
    thickness,
    requiredWidth: positiveNumber(input.width, "width"),
    requiredHeight: positiveNumber(input.height, "height")
  });
}

export class StockService {
  constructor(private readonly db: DatabaseSync) {}

  addStockSheet(input: Parameters<typeof addStockSheet>[1]) {
    return addStockSheet(this.db, input);
  }

  reserveStockForJob(jobId: string, material: string, thickness: number, requiredWidth: number, requiredHeight: number) {
    return reserveStockForJob(this.db, jobId, material, thickness, requiredWidth, requiredHeight);
  }

  releaseStockReservation(jobId: string) {
    return releaseStockReservation(this.db, jobId);
  }

  markStockUsed(jobId: string) {
    return markStockUsed(this.db, jobId);
  }

  createOffcutFromJob(jobId: string, parentSheetId: number | null, width: number, height: number, shapeData?: string | null) {
    return createOffcutFromJob(this.db, jobId, parentSheetId, width, height, shapeData);
  }

  findBestStockMatch(material: string, thickness: number, requiredWidth: number, requiredHeight: number) {
    return findBestStockMatch(this.db, material, thickness, requiredWidth, requiredHeight);
  }

  findBestOffcutMatch(material: string, thickness: number, requiredWidth: number, requiredHeight: number) {
    return findBestOffcutMatch(this.db, material, thickness, requiredWidth, requiredHeight);
  }

  reserveSpecificOffcut(offcutId: number, reservationId: string) {
    return reserveSpecificOffcut(this.db, offcutId, reservationId);
  }

  markSpecificOffcutUsed(offcutId: number, jobId?: string | null) {
    return markSpecificOffcutUsed(this.db, offcutId, jobId);
  }

  getAvailableStock(material?: string, thickness?: number | null) {
    return getAvailableStock(this.db, material, thickness);
  }

  getLowStockWarnings() {
    return getLowStockWarnings(this.db);
  }
}

export function getStockSnapshot(db: DatabaseSync): StockSnapshot {
  return {
    materials: listMaterials(db),
    sheets: listStockSheets(db),
    offcuts: listOffcuts(db),
    movements: listStockMovements(db),
    lowStockWarnings: getLowStockWarnings(db)
  };
}
