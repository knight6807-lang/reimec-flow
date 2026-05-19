import { DatabaseSync } from "../../db.js";
import type { BrainTask } from "./types.js";

function rowToTask(row: Record<string, unknown>): BrainTask {
  return {
    id: Number(row.id),
    taskType: String(row.taskType ?? ""),
    status: String(row.status ?? "queued") as BrainTask["status"],
    progressPercent: Number(row.progressPercent ?? 0),
    message: String(row.message ?? ""),
    resultJson: row.resultJson ? String(row.resultJson) : null,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? "")
  };
}

export class BrainTaskService {
  constructor(private readonly db: DatabaseSync) {}

  create(taskType: string, message = "Queued") {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      `INSERT INTO brain_tasks (taskType, status, progressPercent, message, createdAt, updatedAt)
       VALUES (?, 'queued', 0, ?, ?, ?)`
    ).run(taskType, message, now, now);
    return this.get(Number(result.lastInsertRowid))!;
  }

  update(id: number, patch: Partial<Pick<BrainTask, "status" | "progressPercent" | "message" | "resultJson">>) {
    const current = this.get(id);
    if (!current) return null;
    this.db.prepare(
      `UPDATE brain_tasks SET status = ?, progressPercent = ?, message = ?, resultJson = ?, updatedAt = ? WHERE id = ?`
    ).run(
      patch.status ?? current.status,
      patch.progressPercent ?? current.progressPercent,
      patch.message ?? current.message,
      patch.resultJson ?? current.resultJson,
      new Date().toISOString(),
      id
    );
    return this.get(id);
  }

  get(id: number) {
    const row = this.db.prepare(`SELECT * FROM brain_tasks WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? rowToTask(row) : null;
  }
}
