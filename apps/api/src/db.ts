import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

type BetterSqlite3Module = typeof import("better-sqlite3");
type BetterDatabase = InstanceType<BetterSqlite3Module["default"]>;
type BetterStatement = ReturnType<BetterDatabase["prepare"]>;
type RunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

const require = createRequire(import.meta.url);
let betterSqliteFactory: BetterSqlite3Module["default"] | null = null;

function loadBetterSqlite() {
  if (betterSqliteFactory) return betterSqliteFactory;
  try {
    const mod = require("better-sqlite3") as BetterSqlite3Module;
    betterSqliteFactory = mod.default ?? (mod as unknown as BetterSqlite3Module["default"]);
    return betterSqliteFactory;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`SQLite engine unavailable: ${detail}`);
  }
}

function buildBackupTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}-${hours}${minutes}`;
}

function resolveBackupDir(filePath: string) {
  const configuredUserData = process.env.QOUTERX_USER_DATA_DIR?.trim();
  if (configuredUserData) {
    return path.join(path.resolve(configuredUserData), "backups");
  }
  return path.join(path.dirname(filePath), "backups");
}

export function backupDatabaseBeforeMigration(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) return null;
  const backupDir = resolveBackupDir(filePath);
  fs.mkdirSync(backupDir, { recursive: true });
  const baseName = path.basename(filePath, path.extname(filePath));
  const backupPath = path.join(backupDir, `app-${buildBackupTimestamp()}-${baseName}.db`);
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
  }
  return backupPath;
}

export class StatementSync {
  constructor(private readonly statement: BetterStatement) {}

  run(...params: unknown[]) {
    return this.statement.run(...params) as RunResult;
  }

  get(...params: unknown[]) {
    return this.statement.get(...params) as unknown;
  }

  all(...params: unknown[]) {
    return this.statement.all(...params) as unknown[];
  }
}

export class DatabaseSync {
  private readonly db: BetterDatabase;

  constructor(filePath: string) {
    const BetterSqlite3 = loadBetterSqlite();
    this.db = new BetterSqlite3(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("foreign_keys = ON");
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  prepare(sql: string) {
    return new StatementSync(this.db.prepare(sql));
  }

  close() {
    this.db.close();
  }
}
