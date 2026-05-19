import { DatabaseSync } from "../../db.js";
import type { BrainRecommendationPriority, BrainRecommendationStatus } from "./types.js";

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function clampScore(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

export class CentralBrainRecommendationService {
  constructor(private readonly db: DatabaseSync) {}

  create(input: {
    moduleName: string;
    recommendationType: string;
    title: string;
    message: string;
    confidence: number;
    impactScore: number;
    priority?: BrainRecommendationPriority;
    status?: BrainRecommendationStatus;
    entityType?: string | null;
    entityId?: string | null;
    payload?: Record<string, unknown>;
  }) {
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;
    const payloadJson = JSON.stringify(input.payload ?? {});
    const duplicate = this.db.prepare(
      `SELECT * FROM brain_recommendations
       WHERE moduleName = ? AND recommendationType = ? AND title = ? AND status = 'open' AND payloadJson = ?
       LIMIT 1`
    ).get(input.moduleName, input.recommendationType, input.title, payloadJson);
    if (duplicate) return duplicate;
    return this.db.prepare(
      `INSERT INTO brain_recommendations
       (moduleName, recommendationType, title, message, confidence, impactScore, priority, status, entityType, entityId, payloadJson, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.moduleName,
      input.recommendationType,
      input.title,
      input.message,
      clamp01(input.confidence),
      clampScore(input.impactScore),
      input.priority ?? "normal",
      input.status ?? "open",
      input.entityType ?? null,
      input.entityId ?? null,
      payloadJson,
      createdAt,
      updatedAt
    );
  }

  updateStatus(id: number, status: BrainRecommendationStatus) {
    this.db.prepare(`UPDATE brain_recommendations SET status = ?, updatedAt = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), id);
  }
}
