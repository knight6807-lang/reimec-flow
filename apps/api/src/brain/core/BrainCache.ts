import { DatabaseSync } from "../../db.js";

export class BrainCache {
  constructor(private readonly db: DatabaseSync) {}

  get<T>(key: string): T | null {
    const row = this.db.prepare(
      `SELECT valueJson, expiresAt FROM brain_cache WHERE cacheKey = ? LIMIT 1`
    ).get(key) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (row.expiresAt && Date.parse(String(row.expiresAt)) < Date.now()) {
      this.delete(key);
      return null;
    }
    try {
      return JSON.parse(String(row.valueJson)) as T;
    } catch {
      return null;
    }
  }

  set(key: string, value: unknown, ttlMs = 5 * 60 * 1000, tags: string[] = []) {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    this.db.prepare(
      `INSERT INTO brain_cache (cacheKey, valueJson, tagsJson, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cacheKey) DO UPDATE SET valueJson = excluded.valueJson, tagsJson = excluded.tagsJson, createdAt = excluded.createdAt, expiresAt = excluded.expiresAt`
    ).run(key, JSON.stringify(value), JSON.stringify(tags), now, expiresAt);
  }

  delete(key: string) {
    this.db.prepare(`DELETE FROM brain_cache WHERE cacheKey = ?`).run(key);
  }

  invalidateByEvent(eventType: string, entityType?: string, entityId?: string) {
    const eventTag = `event:${eventType}`;
    const entityTag = entityType && entityId ? `entity:${entityType}:${entityId}` : null;
    const rows = this.db.prepare(`SELECT cacheKey, tagsJson FROM brain_cache`).all() as Record<string, unknown>[];
    for (const row of rows) {
      try {
        const tags = JSON.parse(String(row.tagsJson ?? "[]")) as string[];
        if (tags.includes(eventTag) || (entityTag && tags.includes(entityTag))) this.delete(String(row.cacheKey));
      } catch {
        this.delete(String(row.cacheKey));
      }
    }
  }
}
