import type { BrainCoreService, BrainEventRecord, BrainRecommendationRecord } from "./brain-core.js";
import type { PartDnaBrainService } from "./brain-part-dna.js";
import type { DxfErrorCheckResult, DxfErrorDetectionService, DxfErrorWorkspaceSummary } from "./dxf-error-detection.js";
import type { LeadTimeIntelligenceService, LeadTimePredictionResult } from "./lead-time-intelligence.js";
import type { ManufacturingMemoryService } from "./manufacturing-memory.js";
import type { MaterialPredictionService, MaterialShortageRecord, MaterialUsageForecastRecord } from "./material-prediction.js";
import type { NestingIntelligenceService, NestingPartCandidate, NestingPlanRecord } from "./nesting-intelligence.js";
import type { OffcutIntelligenceService, OffcutMatchResult, OffcutRecommendationView } from "./offcut-intelligence.js";
import type { ProfitCalculationInput, ProfitIntelligenceService, ProfitInsight, ProfitRecord, ProfitSummary } from "./profit-intelligence.js";
import type { ProductionQueueBrainService, ProductionQueueScoredJob, QueuePlanRecord } from "./production-queue-brain.js";
import type { PurchasingIntelligenceService, PurchaseRecommendationRecord } from "./purchasing-intelligence.js";
import type { SheetOptimizationResultView, SheetOptimizerService } from "./sheet-optimizer.js";
import type { SmartJobRecord, SmartQueueServices } from "./smart-job-queue.js";
import type { CloudSyncService, SyncEventRecord } from "./cloud-sync.js";
import type { ManualSubscriptionService } from "./manual-subscriptions.js";
import type { QuoteRecord } from "./store.js";
import type { StockSnapshot } from "./stock-material.js";

export type BrainModuleName =
  | "part_dna"
  | "dxf_errors"
  | "offcuts"
  | "sheet_optimizer"
  | "profit"
  | "materials"
  | "purchasing"
  | "queue"
  | "lead_time"
  | "manufacturing_memory"
  | "nesting";

export type BrainRunMode = "quick" | "full" | "module-specific";

export type BrainSyncHealth = {
  cloudSyncEnabled: boolean;
  pendingSyncEvents: number;
  failedSyncEvents: number;
  recentDeviceCount: number;
  recentErrorCount: number;
  activeAccounts: number;
  expiredAccounts: number;
  pendingPaymentProofs: number;
};

export type BrainDashboard = {
  topRecommendations: BrainRecommendationRecord[];
  recentEvents: BrainEventRecord[];
  profitSummary: ProfitSummary;
  profitWarnings: ProfitRecord[];
  profitInsights: ProfitInsight[];
  materialForecasts: MaterialUsageForecastRecord[];
  materialShortages: MaterialShortageRecord[];
  purchaseRecommendations: PurchaseRecommendationRecord[];
  offcutOpportunities: OffcutRecommendationView[];
  queuePlan: QueuePlanRecord | null;
  leadTimeRisks: LeadTimePredictionResult[];
  dxfErrors: DxfErrorWorkspaceSummary[];
  nestingPlans: NestingPlanRecord[];
  syncHealth: BrainSyncHealth;
};

export type BrainRunInput = {
  workspaceId: string;
  mode: BrainRunMode;
  modules?: BrainModuleName[];
  jobs?: SmartJobRecord[];
  quotes?: QuoteRecord[];
  stockSnapshot?: StockSnapshot;
  services?: SmartQueueServices;
  nestingParts?: NestingPartCandidate[];
  leadTimeTargetJobId?: number | null;
  profitInput?: ProfitCalculationInput | null;
  dxfInput?: {
    fileId: string;
    rawDxf: string;
    fileName?: string;
    partName?: string | null;
    material?: string | null;
    thickness?: number | null;
    customerId?: string | null;
    customerName?: string | null;
    quoteId?: string | null;
    quotedPrice?: number | null;
    entityType?: string | null;
    entityId?: string | null;
  } | null;
  offcutRequest?: {
    material: string;
    thickness: number;
    requiredWidth: number;
    requiredHeight: number;
    jobId?: string | null;
    quoteId?: string | null;
    partDnaId?: number | null;
    entityLabel?: string | null;
  } | null;
  sheetRequest?: {
    material: string;
    thickness: number;
    requiredWidth: number;
    requiredHeight: number;
    jobId?: string | null;
    quoteId?: string | null;
  } | null;
  triggerEventType?: string | null;
};

export type BrainRunResult = {
  workspaceId: string;
  mode: BrainRunMode;
  modulesRun: BrainModuleName[];
  createdRecommendations: number;
  results: Partial<Record<BrainModuleName, unknown>>;
};

type BrainOrchestratorDeps = {
  brainCore: BrainCoreService;
  partDna: PartDnaBrainService;
  dxfErrors: DxfErrorDetectionService;
  offcuts: OffcutIntelligenceService;
  sheetOptimizer: SheetOptimizerService;
  profit: ProfitIntelligenceService;
  materialPrediction: MaterialPredictionService;
  purchasing: PurchasingIntelligenceService;
  queue: ProductionQueueBrainService;
  leadTime: LeadTimeIntelligenceService;
  manufacturingMemory: ManufacturingMemoryService;
  nesting: NestingIntelligenceService;
  cloudSync: CloudSyncService;
  manualSubscriptions: ManualSubscriptionService;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function hasStockContext(input: BrainRunInput) {
  return Boolean(input.stockSnapshot);
}

function hasQueueContext(input: BrainRunInput) {
  return Boolean(input.jobs?.length && input.stockSnapshot);
}

function getDefaultModules(input: BrainRunInput): BrainModuleName[] {
  if (input.mode === "module-specific") return Array.from(new Set(input.modules ?? []));
  if (input.mode === "quick") {
    return ["queue", "lead_time", "offcuts", "materials", "purchasing"];
  }
  return ["part_dna", "dxf_errors", "offcuts", "sheet_optimizer", "profit", "materials", "purchasing", "queue", "lead_time", "manufacturing_memory", "nesting"];
}

function buildModulesForEvent(input: BrainRunInput, modules: BrainModuleName[]) {
  const eventType = input.triggerEventType?.trim();
  if (!eventType) return modules;
  const preferred = new Set<BrainModuleName>();
  if (eventType === "dxf_imported") {
    preferred.add("part_dna");
    preferred.add("dxf_errors");
  }
  if (eventType === "quote_created" || eventType === "job_created") {
    preferred.add("offcuts");
    preferred.add("queue");
    preferred.add("lead_time");
  }
  if (eventType === "quote_accepted") {
    preferred.add("sheet_optimizer");
    preferred.add("lead_time");
    preferred.add("materials");
    preferred.add("purchasing");
  }
  if (eventType === "job_completed") {
    preferred.add("profit");
    preferred.add("manufacturing_memory");
    preferred.add("materials");
    preferred.add("purchasing");
  }
  if (eventType === "job_started") {
    preferred.add("queue");
    preferred.add("lead_time");
  }
  if (eventType === "purchase_order_detected") {
    preferred.add("queue");
    preferred.add("materials");
    preferred.add("purchasing");
  }
  if (preferred.size === 0) return modules;
  return modules.filter((moduleName) => preferred.has(moduleName));
}

function countOpenRecommendations(recommendations: Array<BrainRecommendationRecord | null | undefined>) {
  return recommendations.filter((entry) => entry?.status === "open").length;
}

export class QouterXBrainOrchestrator {
  constructor(private readonly deps: BrainOrchestratorDeps) {}

  run(input: BrainRunInput): BrainRunResult {
    const requestedModules = getDefaultModules(input);
    const modules = buildModulesForEvent(input, requestedModules);
    const results: BrainRunResult["results"] = {};
    let createdRecommendations = 0;

    for (const moduleName of modules) {
      if (moduleName === "part_dna" && input.dxfInput?.rawDxf) {
        const result = this.deps.partDna.analyzeDxf({
          workspaceId: input.workspaceId,
          fileName: input.dxfInput.fileName?.trim() || input.dxfInput.fileId,
          rawDxf: input.dxfInput.rawDxf,
          partName: input.dxfInput.partName?.trim() || input.dxfInput.fileName?.trim() || input.dxfInput.fileId,
          material: input.dxfInput.material?.trim() || undefined,
          thickness: input.dxfInput.thickness ?? undefined,
          customerId: input.dxfInput.customerId ?? undefined,
          customerName: input.dxfInput.customerName ?? undefined,
          quoteId: input.dxfInput.quoteId ?? undefined,
          quotedPrice: input.dxfInput.quotedPrice ?? undefined,
          entityType: input.dxfInput.entityType ?? "dxf",
          entityId: input.dxfInput.entityId ?? input.dxfInput.fileId
        });
        this.recordModuleEvent("part_dna_detected", input.workspaceId, "dxf", input.dxfInput.fileId, {
          geometryHash: result.geometryHash,
          brainPartDnaId: result.brainPartDnaId,
          exactMatchPartCode: result.exactMatchPart.partCode
        });
        createdRecommendations += countOpenRecommendations(result.intelligenceRecommendations);
        results.part_dna = result;
        continue;
      }

      if (moduleName === "dxf_errors" && input.dxfInput?.rawDxf) {
        const result = this.deps.dxfErrors.checkDxf({
          workspaceId: input.workspaceId,
          dxfFileId: input.dxfInput.fileId,
          rawDxf: input.dxfInput.rawDxf,
          thickness: input.dxfInput.thickness ?? null,
          partDnaId: null
        });
        this.recordModuleEvent("error_detected", input.workspaceId, "dxf", input.dxfInput.fileId, {
          criticalCount: result.summary.criticalCount,
          warningCount: result.summary.warningCount,
          infoCount: result.summary.infoCount
        });
        if (result.summary.criticalCount > 0) {
          this.deps.brainCore.recommendationService.createRecommendation({
            moduleName: "qouterx_brain_orchestrator",
            recommendationType: "critical_dxf_errors",
            title: "Critical DXF issues detected",
            message: `${input.dxfInput.fileName?.trim() || input.dxfInput.fileId} has ${result.summary.criticalCount} critical issue(s).`,
            confidence: 0.94,
            impactScore: clamp(75 + result.summary.criticalCount * 6, 75, 98),
            payload: {
              workspaceId: input.workspaceId,
              dxfFileId: input.dxfInput.fileId
            }
          });
          createdRecommendations += 1;
        }
        results.dxf_errors = result;
        continue;
      }

      if (moduleName === "offcuts" && input.offcutRequest) {
        const result = this.deps.offcuts.findMatch({
          workspaceId: input.workspaceId,
          ...input.offcutRequest
        });
        this.recordModuleEvent("material_reserved", input.workspaceId, input.offcutRequest.jobId ? "job" : "quote", input.offcutRequest.jobId ?? input.offcutRequest.quoteId ?? "offcut-match", {
          fitType: result.fitType,
          savingEstimate: result.savingEstimate,
          offcutId: result.offcut?.id ?? null
        });
        createdRecommendations += result.recommendation?.status === "open" ? 1 : 0;
        results.offcuts = result;
        continue;
      }

      if (moduleName === "sheet_optimizer" && input.sheetRequest) {
        const result = this.deps.sheetOptimizer.optimize({
          workspaceId: input.workspaceId,
          ...input.sheetRequest
        });
        this.recordModuleEvent("material_reserved", input.workspaceId, input.sheetRequest.jobId ? "job" : "quote", input.sheetRequest.jobId ?? input.sheetRequest.quoteId ?? "sheet-optimization", {
          sourceType: result.recommendedSourceType,
          wastePercent: result.wastePercent,
          savingEstimate: result.savingEstimate
        });
        results.sheet_optimizer = result;
        continue;
      }

      if (moduleName === "profit" && input.profitInput) {
        const result = this.deps.profit.calculateForJob(input.profitInput);
        createdRecommendations += result.insights.filter((entry) => entry.insightType === "underpriced_job" || entry.insightType === "price_increase_suggestion").length;
        results.profit = result;
        continue;
      }

      if (moduleName === "materials" && input.jobs && input.quotes && hasStockContext(input)) {
        const result = this.deps.materialPrediction.rebuildForecast({
          workspaceId: input.workspaceId,
          jobs: input.jobs,
          quotes: input.quotes,
          stockSnapshot: input.stockSnapshot!
        });
        this.recordModuleEvent("material_used", input.workspaceId, "workspace", input.workspaceId, {
          forecasts: result.forecasts.length,
          shortages: result.shortages.length
        });
        createdRecommendations += result.recommendations.length;
        results.materials = result;
        continue;
      }

      if (moduleName === "purchasing" && hasStockContext(input)) {
        const result = this.deps.purchasing.syncRecommendations({
          workspaceId: input.workspaceId,
          stockSnapshot: input.stockSnapshot!
        });
        this.recordModuleEvent("material_reserved", input.workspaceId, "workspace", input.workspaceId, {
          purchaseRecommendations: result.recommendations.length
        });
        createdRecommendations += result.brainRecommendations.length;
        results.purchasing = result;
        continue;
      }

      if (moduleName === "queue" && hasQueueContext(input)) {
        const result = this.deps.queue.createPlan({
          workspaceId: input.workspaceId,
          jobs: input.jobs!,
          stockSnapshot: input.stockSnapshot!,
          services: input.services
        });
        this.recordModuleEvent("job_started", input.workspaceId, "queue_plan", String(result.plan?.id ?? "0"), {
          queuePlanId: result.plan?.id ?? null,
          jobs: result.scoredJobs.length,
          setupSavingMinutes: result.plan?.setupSavingMinutes ?? 0
        });
        createdRecommendations += result.recommendation?.status === "open" ? 1 : 0;
        results.queue = result;
        continue;
      }

      if (moduleName === "lead_time" && hasQueueContext(input)) {
        const target =
          input.jobs!.find((job) => job.id === input.leadTimeTargetJobId) ??
          input.jobs!.find((job) => job.status !== "completed" && job.status !== "cancelled") ??
          null;
        if (!target) continue;
        const queueScores = new Map(
          this.deps.queue.listScores(input.workspaceId).map((entry) => [entry.jobId, entry])
        );
        const jobsWithScores = input.jobs!.map((job) => ({
          ...job,
          queueScore: queueScores.get(job.id)?.score ?? job.queueScore,
          queueReasons: queueScores.get(job.id)?.reasonsJson ? JSON.parse(queueScores.get(job.id)!.reasonsJson) as string[] : job.queueReasons
        }));
        const result = this.deps.leadTime.predict({
          workspaceId: input.workspaceId,
          target: jobsWithScores.find((job) => job.id === target.id) ?? target,
          jobs: jobsWithScores,
          stockSnapshot: input.stockSnapshot!
        });
        this.recordModuleEvent("job_started", input.workspaceId, "job", String(target.id), {
          estimatedFinishAt: result.estimatedFinishAt,
          confidence: result.confidence,
          riskWarnings: result.riskWarnings
        });
        if (result.riskWarnings.length) createdRecommendations += 1;
        results.lead_time = result;
        continue;
      }

      if (moduleName === "manufacturing_memory") {
        const result = this.deps.manufacturingMemory.rebuildFromBrainEvents(input.workspaceId);
        this.recordModuleEvent("job_completed", input.workspaceId, "workspace", input.workspaceId, {
          memories: result.memories.length,
          patterns: result.patterns.length
        });
        results.manufacturing_memory = result;
        continue;
      }

      if (moduleName === "nesting" && hasQueueContext(input) && input.nestingParts?.length) {
        const queueScores = new Map(
          this.deps.queue.listScores(input.workspaceId).map((entry) => [entry.jobId, entry])
        );
        const scoredJobs: ProductionQueueScoredJob[] = input.jobs!
          .map((job) => {
            const score = queueScores.get(job.id);
            return {
              ...job,
              brainScore: score?.score ?? job.queueScore,
              brainReasons: score?.reasonsJson ? JSON.parse(score.reasonsJson) as string[] : job.queueReasons,
              stockAvailable: Boolean(input.stockSnapshot!.sheets.find((sheet) => sheet.material.trim().toLowerCase() === job.material.trim().toLowerCase())),
              offcutSavingEstimate: 0,
              blocked: !job.ready
            };
          });
        const result = this.deps.nesting.recommend({
          workspaceId: input.workspaceId,
          jobs: scoredJobs,
          parts: input.nestingParts,
          stockSnapshot: input.stockSnapshot!
        });
        this.recordModuleEvent("nesting_completed", input.workspaceId, "workspace", input.workspaceId, {
          plans: result.plans.length,
          skippedGroups: result.skippedGroups.length
        });
        if (result.skippedGroups.length) {
          createdRecommendations += result.skippedGroups.length;
        }
        results.nesting = result;
      }
    }

    return {
      workspaceId: input.workspaceId,
      mode: input.mode,
      modulesRun: modules,
      createdRecommendations,
      results
    };
  }

  buildDashboard(input: {
    workspaceId: string;
    jobs: SmartJobRecord[];
    stockSnapshot: StockSnapshot;
    syncHealth: BrainSyncHealth;
  }): BrainDashboard {
    const topRecommendations = this.deps.brainCore.recommendationService.listRecommendations({
      workspaceId: input.workspaceId,
      status: "open",
      limit: 12
    });
    const recentEvents = this.deps.brainCore.eventService.listEvents({
      workspaceId: input.workspaceId,
      limit: 20
    });
    const profitSummary = this.deps.profit.getSummary();
    const materialForecasts = this.deps.materialPrediction.listForecasts({ workspaceId: input.workspaceId, limit: 20 });
    const materialShortages = this.deps.materialPrediction.getShortages({
      workspaceId: input.workspaceId,
      stockSnapshot: input.stockSnapshot
    });
    const purchaseRecommendations = this.deps.purchasing.listRecommendations({
      workspaceId: input.workspaceId,
      status: "open",
      limit: 12
    });
    const offcutOpportunities = this.deps.offcuts.listRecommendations(input.workspaceId, 8);
    const queuePlan = this.deps.queue.getCurrentPlan(input.workspaceId);
    const leadTimeRisks = input.jobs
      .map((job) => this.deps.leadTime.getLatestForJob(input.workspaceId, job.id))
      .filter((entry): entry is LeadTimePredictionResult => Boolean(entry))
      .filter((entry) => entry.riskWarnings.length > 0)
      .sort((left, right) => right.riskWarnings.length - left.riskWarnings.length || right.confidence - left.confidence)
      .slice(0, 8);
    const dxfErrors = this.deps.dxfErrors.listRecentProblemFiles(input.workspaceId, 8);
    const nestingPlans = this.deps.nesting.listPlans(input.workspaceId).slice(0, 6);

    return {
      topRecommendations,
      recentEvents,
      profitSummary,
      profitWarnings: profitSummary.underpricedJobs.slice(0, 8),
      profitInsights: this.deps.profit.listInsights(12),
      materialForecasts,
      materialShortages,
      purchaseRecommendations,
      offcutOpportunities,
      queuePlan,
      leadTimeRisks,
      dxfErrors,
      nestingPlans,
      syncHealth: input.syncHealth
    };
  }

  buildSyncHealth(): BrainSyncHealth {
    const cloudEvents = this.deps.cloudSync.listEvents(200);
    const pendingSyncEvents = cloudEvents.filter((event) => event.status === "pending").length;
    const failedSyncEvents = cloudEvents.filter((event) => event.status === "failed").length;
    const cloudDashboard = this.deps.cloudSync.getCompanyDashboard();
    const subscriptionDashboard = this.deps.manualSubscriptions.getAdminDashboard();
    return {
      cloudSyncEnabled: this.deps.cloudSync.getSettings().enabled,
      pendingSyncEvents,
      failedSyncEvents,
      recentDeviceCount: cloudDashboard.devices.length,
      recentErrorCount: cloudDashboard.errors.length,
      activeAccounts: subscriptionDashboard.activeAccounts,
      expiredAccounts: subscriptionDashboard.expiredAccounts,
      pendingPaymentProofs: subscriptionDashboard.pendingPaymentProofs
    };
  }

  private recordModuleEvent(
    eventType: BrainEventRecord["eventType"],
    workspaceId: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>
  ) {
    this.deps.brainCore.eventService.recordEvent({
      eventType,
      entityType,
      entityId,
      payload: {
        workspaceId,
        ...payload
      }
    });
  }
}
