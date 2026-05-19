import { DatabaseSync } from "../../db.js";
import type { BrainEventType, BrainOutboxEvent } from "./types.js";

function now() {
  return new Date().toISOString();
}

function parseEventType(value: unknown): BrainEventType {
  return String(value || "error_detected") as BrainEventType;
}

function rowToOutbox(row: Record<string, unknown>): BrainOutboxEvent {
  return {
    id: Number(row.id),
    eventType: parseEventType(row.eventType),
    entityType: String(row.entityType ?? ""),
    entityId: String(row.entityId ?? ""),
    payloadJson: String(row.payloadJson ?? "{}"),
    status: String(row.status ?? "pending") as BrainOutboxEvent["status"],
    attempts: Number(row.attempts ?? 0),
    lastError: row.lastError ? String(row.lastError) : null,
    createdAt: String(row.createdAt ?? ""),
    processedAt: row.processedAt ? String(row.processedAt) : null
  };
}

export class BrainEventBus {
  constructor(private readonly db: DatabaseSync) {}

  publish(input: {
    eventType: BrainEventType;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }) {
    const createdAt = now();
    const payloadJson = JSON.stringify(input.payload ?? {});
    const eventInsert = this.db.prepare(
      `INSERT INTO brain_events (eventType, entityType, entityId, payloadJson, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    ).run(input.eventType, input.entityType, input.entityId, payloadJson, createdAt);
    const outboxInsert = this.db.prepare(
      `INSERT INTO brain_event_outbox
       (eventType, entityType, entityId, payloadJson, status, attempts, createdAt)
       VALUES (?, ?, ?, ?, 'pending', 0, ?)`
    ).run(input.eventType, input.entityType, input.entityId, payloadJson, createdAt);
    return {
      eventId: Number(eventInsert.lastInsertRowid ?? 0),
      outboxId: Number(outboxInsert.lastInsertRowid ?? 0),
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      payloadJson,
      createdAt
    };
  }

  listPending(limit = 25) {
    const rows = this.db.prepare(
      `SELECT * FROM brain_event_outbox
       WHERE status IN ('pending', 'failed') AND attempts < 5
       ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, createdAt ASC
       LIMIT ?`
    ).all(Math.max(1, Math.min(200, limit))) as Record<string, unknown>[];
    return rows.map(rowToOutbox);
  }

  claim(id: number) {
    const result = this.db.prepare(
      `UPDATE brain_event_outbox
       SET status = 'processing', attempts = attempts + 1
       WHERE id = ? AND status IN ('pending', 'failed')`
    ).run(id);
    return result.changes > 0;
  }

  complete(id: number) {
    this.db.prepare(
      `UPDATE brain_event_outbox
       SET status = 'completed', processedAt = ?, lastError = NULL
       WHERE id = ?`
    ).run(now(), id);
  }

  fail(id: number, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.db.prepare(
      `UPDATE brain_event_outbox
       SET status = 'failed', lastError = ?
       WHERE id = ?`
    ).run(message.slice(0, 2000), id);
  }

  stats() {
    const rows = this.db.prepare(
      `SELECT status, COUNT(*) AS count FROM brain_event_outbox GROUP BY status`
    ).all() as Record<string, unknown>[];
    return Object.fromEntries(rows.map((row) => [String(row.status), Number(row.count ?? 0)]));
  }
}
