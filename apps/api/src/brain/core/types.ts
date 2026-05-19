import type { BrainRecommendationRecord } from "../../brain-core.js";

export type BrainEventType =
  | "dxf_imported"
  | "part_dna_analyzed"
  | "part_dna_detected"
  | "quote_created"
  | "quote_approved"
  | "quote_accepted"
  | "job_created"
  | "job_started"
  | "job_completed"
  | "stock_reserved"
  | "stock_used"
  | "material_reserved"
  | "material_used"
  | "offcut_created"
  | "nesting_workspace_created"
  | "nesting_parts_added"
  | "nesting_completed"
  | "nesting_heat_warning"
  | "nesting_exported"
  | "dxf_error_detected"
  | "error_detected"
  | "profit_calculated"
  | "material_forecast_updated"
  | "purchase_order_detected"
  | "payment_received"
  | "subscription_updated";

export type BrainEvent = {
  id: number;
  eventType: BrainEventType;
  entityType: string;
  entityId: string;
  payloadJson: string;
  createdAt: string;
};

export type BrainOutboxEvent = BrainEvent & {
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  lastError: string | null;
  processedAt: string | null;
};

export type BrainRecommendationPriority = "low" | "normal" | "high" | "urgent";
export type BrainRecommendationStatus = "open" | "accepted" | "dismissed" | "completed";

export type BrainModuleResult = {
  eventsCreated: number;
  recommendationsCreated: number;
  warnings: string[];
  metrics: Record<string, number | string | boolean | null>;
};

export type BrainModule = {
  name: string;
  supportedEvents: BrainEventType[];
  handleEvent(event: BrainOutboxEvent): Promise<BrainModuleResult>;
  rebuild?(input?: { workspaceId?: string; entityType?: string; entityId?: string }): Promise<BrainModuleResult>;
  getRecommendations?(): Promise<BrainRecommendationRecord[]>;
};

export type BrainRunMode = "quick" | "full" | "module" | "entity";

export type BrainTask = {
  id: number;
  taskType: string;
  status: "queued" | "running" | "completed" | "failed";
  progressPercent: number;
  message: string;
  resultJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export function emptyModuleResult(metrics: BrainModuleResult["metrics"] = {}): BrainModuleResult {
  return { eventsCreated: 0, recommendationsCreated: 0, warnings: [], metrics };
}
