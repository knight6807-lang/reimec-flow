import type { DxfErrorDetectionService, DxfErrorWorkspaceSummary } from "./dxf-error-detection.js";
import type { OffcutIntelligenceService } from "./offcut-intelligence.js";
import type { ProfitIntelligenceService } from "./profit-intelligence.js";
import type { MaterialPredictionService, MaterialShortageRecord } from "./material-prediction.js";
import type { ProductionQueueBrainService } from "./production-queue-brain.js";
import type { SmartQueueSnapshot } from "./smart-job-queue.js";
import type { StockSnapshot } from "./stock-material.js";
import type { BrainRecommendationRecord } from "./brain-core.js";
import type { QuoteRecord, CustomerRecord } from "./store.js";

export type ProductionAssistantAction = {
  id: string;
  label: string;
  actionType:
    | "open_ai_queue"
    | "open_material_prediction"
    | "open_profit_intelligence"
    | "open_dxf_errors"
    | "open_stock"
    | "open_part_dna"
    | "open_quotes"
    | "refresh";
  payload?: Record<string, unknown>;
};

export type ProductionAssistantResponse = {
  answer: string;
  sourceModules: string[];
  recommendations: Array<{
    title: string;
    message: string;
    confidence?: number;
  }>;
  suggestedActions: ProductionAssistantAction[];
};

type CustomerSummary = {
  id: string;
  name: string;
  billed: number;
  paid: number;
  balance: number;
  jobCount: number;
};

type AssistantContext = {
  workspaceId: string;
  question: string;
  queueSnapshot: SmartQueueSnapshot;
  stockSnapshot: StockSnapshot;
  currentPlan: ReturnType<ProductionQueueBrainService["getCurrentPlan"]>;
  shortages: MaterialShortageRecord[];
  profitService: ProfitIntelligenceService;
  offcutService: OffcutIntelligenceService;
  dxfErrorService: DxfErrorDetectionService;
  customers: CustomerRecord[];
  quotes: QuoteRecord[];
};

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function formatMoney(value: number) {
  return `R${value.toFixed(2)}`;
}

function daysFromNow(iso: string | null | undefined, now = new Date()) {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return Math.ceil((parsed - now.getTime()) / 86_400_000);
}

function buildCustomerSummaries(customers: CustomerRecord[], quotes: QuoteRecord[]) {
  return customers
    .map((customer) => {
      const relatedQuotes = quotes.filter(
        (quote) =>
          quote.status === "accepted" &&
          normalize(quote.customerName ?? "") === normalize(customer.name)
      );
      const billed = relatedQuotes.reduce((sum, quote) => sum + (Number(quote.total) || 0), 0);
      const paid = (customer.payments ?? []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
      return {
        id: customer.id,
        name: customer.name,
        billed,
        paid,
        balance: billed - paid,
        jobCount: relatedQuotes.length
      } satisfies CustomerSummary;
    })
    .sort((left, right) => right.balance - left.balance);
}

function topRecommendations(records: BrainRecommendationRecord[], limit = 3) {
  return records.slice(0, limit).map((entry) => ({
    title: entry.title,
    message: entry.message,
    confidence: entry.confidence
  }));
}

export class ProductionAssistantService {
  constructor(
    private readonly queueService: ProductionQueueBrainService,
    private readonly materialPrediction: MaterialPredictionService,
    private readonly profitService: ProfitIntelligenceService,
    private readonly offcutService: OffcutIntelligenceService,
    private readonly dxfErrorService: DxfErrorDetectionService
  ) {}

  ask(input: AssistantContext): ProductionAssistantResponse {
    const question = normalize(input.question);
    if (!question) {
      return this.helpResponse();
    }
    if (includesAny(question, ["what jobs are late", "which jobs are late", "late jobs", "overdue jobs"])) {
      return this.answerLateJobs(input);
    }
    if (includesAny(question, ["what should we cut next", "what should i cut next", "cut next", "run next"])) {
      return this.answerCutNext(input);
    }
    if (includesAny(question, ["which jobs can combine", "combine jobs", "jobs can run together", "shared material"])) {
      return this.answerCombinableJobs(input);
    }
    if (includesAny(question, ["what material must we buy", "what material should we buy", "buy material", "shortage"])) {
      return this.answerMaterialBuying(input);
    }
    if (includesAny(question, ["which jobs are low profit", "low profit jobs", "underpriced jobs", "profit problem"])) {
      return this.answerLowProfit(input);
    }
    if (includesAny(question, ["which customer owes money", "customer owes", "who owes money", "outstanding customer"])) {
      return this.answerCustomerDebt(input);
    }
    if (includesAny(question, ["which dxfs have errors", "dxf errors", "bad dxf", "problem dxf"])) {
      return this.answerDxfErrors(input);
    }
    if (includesAny(question, ["which offcuts can be used", "usable offcuts", "offcut match", "use offcuts"])) {
      return this.answerOffcuts(input);
    }
    return this.helpResponse();
  }

  private answerLateJobs(input: AssistantContext): ProductionAssistantResponse {
    const lateJobs = input.queueSnapshot.jobs
      .filter((job) => job.status !== "completed" && job.status !== "cancelled")
      .map((job) => ({ job, days: daysFromNow(job.dueDate) }))
      .filter((entry) => entry.days !== null && entry.days! < 0)
      .sort((left, right) => (left.days ?? 0) - (right.days ?? 0))
      .slice(0, 5);

    const answer = lateJobs.length
      ? `Late jobs: ${lateJobs
          .map((entry) => `${entry.job.jobNumber} (${Math.abs(entry.days ?? 0)} day${Math.abs(entry.days ?? 0) === 1 ? "" : "s"} late)`)
          .join(", ")}.`
      : "No queued jobs are currently late based on their due dates.";

    return {
      answer,
      sourceModules: ["smart_job_queue", "production_queue_brain"],
      recommendations: lateJobs.map((entry) => ({
        title: `${entry.job.jobNumber} is late`,
        message: entry.job.queueReasons.slice(0, 3).join(" • ") || "Review this late job in the queue."
      })),
      suggestedActions: [
        { id: "late-open-queue", label: "Open AI Queue", actionType: "open_ai_queue" },
        { id: "late-refresh", label: "Refresh Queue", actionType: "refresh" }
      ]
    };
  }

  private answerCutNext(input: AssistantContext): ProductionAssistantResponse {
    const plan = input.currentPlan;
    const topJob = input.queueSnapshot.jobs[0] ?? null;
    const planItems = plan?.items ?? [];
    const answer = plan && planItems.length
      ? `Cut next: ${planItems
          .slice(0, 3)
          .map((item) => input.queueSnapshot.jobs.find((job) => job.id === item.jobId)?.jobNumber ?? `#${item.jobId}`)
          .join(", ")} from ${plan.title}.`
      : topJob
      ? `Best next cut is ${topJob.jobNumber} because it scores highest in the AI queue.`
      : "There are no queued jobs ready for an AI production recommendation yet.";
    const topJobs = input.queueSnapshot.jobs.slice(0, 3);
    return {
      answer,
      sourceModules: ["production_queue_brain", "smart_job_queue"],
      recommendations: topJobs.map((job) => ({
        title: `${job.jobNumber} · Score ${Math.round(job.queueScore)}`,
        message: job.queueReasons.slice(0, 3).join(" • ") || "Top AI queue candidate."
      })),
      suggestedActions: [
        { id: "cut-open-queue", label: "Open AI Queue", actionType: "open_ai_queue" },
        { id: "cut-open-nesting", label: "Open Materials", actionType: "open_material_prediction" }
      ]
    };
  }

  private answerCombinableJobs(input: AssistantContext): ProductionAssistantResponse {
    const combinable = input.queueSnapshot.recommendations.filter(
      (entry) => entry.kind === "combine" || entry.kind === "shared_material"
    );
    const answer = combinable.length
      ? `Jobs that can combine: ${combinable
          .slice(0, 4)
          .map((entry) => entry.title)
          .join("; ")}.`
      : "No strong combine opportunities are flagged right now.";
    return {
      answer,
      sourceModules: ["smart_job_queue", "production_queue_brain", "nesting_intelligence"],
      recommendations: combinable.slice(0, 4).map((entry) => ({
        title: entry.title,
        message: entry.detail
      })),
      suggestedActions: [
        { id: "combine-open-queue", label: "Open AI Queue", actionType: "open_ai_queue" },
        { id: "combine-refresh", label: "Refresh Queue", actionType: "refresh" }
      ]
    };
  }

  private answerMaterialBuying(input: AssistantContext): ProductionAssistantResponse {
    const shortages = input.shortages.slice(0, 5);
    const purchaseRecs = this.materialPrediction
      ? shortages.map((entry) => ({
          title: `${entry.material} ${entry.thickness}mm`,
          message: entry.recommendation,
          confidence: entry.confidence
        }))
      : [];
    const answer = shortages.length
      ? `Buy soon: ${shortages
          .map((entry) => `${entry.material} ${entry.thickness}mm (${entry.recommendedBuySheets} sheet${entry.recommendedBuySheets === 1 ? "" : "s"})`)
          .join(", ")}.`
      : "No immediate material shortages are predicted from current jobs, quotes, and stock.";
    return {
      answer,
      sourceModules: ["material_prediction", "purchasing_intelligence", "stock_material"],
      recommendations: purchaseRecs,
      suggestedActions: [
        { id: "buy-open-materials", label: "Open Material Prediction", actionType: "open_material_prediction" },
        { id: "buy-open-stock", label: "Open Stock", actionType: "open_stock" }
      ]
    };
  }

  private answerLowProfit(input: AssistantContext): ProductionAssistantResponse {
    const summary = this.profitService.getSummary();
    const lowProfit = summary.underpricedJobs.slice(0, 5);
    const answer = lowProfit.length
      ? `Low profit jobs: ${lowProfit
          .map((entry) => `${entry.jobId ?? `record-${entry.id}`} (${entry.marginPercent.toFixed(1)}% margin)`)
          .join(", ")}.`
      : "No underpriced jobs are currently flagged by Profit Intelligence.";
    return {
      answer,
      sourceModules: ["profit_intelligence", "manufacturing_memory"],
      recommendations: lowProfit.map((entry) => ({
        title: `${entry.jobId ?? `Record ${entry.id}`} is under target`,
        message: `${entry.material}${entry.thickness !== null ? ` ${entry.thickness}mm` : ""} returned ${entry.marginPercent.toFixed(1)}% margin.`
      })),
      suggestedActions: [
        { id: "profit-open", label: "Open Profit Intelligence", actionType: "open_profit_intelligence" },
        { id: "profit-refresh", label: "Refresh Profit", actionType: "refresh" }
      ]
    };
  }

  private answerCustomerDebt(input: AssistantContext): ProductionAssistantResponse {
    const summaries = buildCustomerSummaries(input.customers, input.quotes).filter((entry) => entry.balance > 0).slice(0, 5);
    const answer = summaries.length
      ? `Outstanding customers: ${summaries.map((entry) => `${entry.name} (${formatMoney(entry.balance)})`).join(", ")}.`
      : "No customers currently show an outstanding balance from accepted quotes versus recorded payments.";
    return {
      answer,
      sourceModules: ["workspace_quotes", "workspace_customers", "billing"],
      recommendations: summaries.map((entry) => ({
        title: `${entry.name} owes ${formatMoney(entry.balance)}`,
        message: `Billed ${formatMoney(entry.billed)} · Paid ${formatMoney(entry.paid)} · ${entry.jobCount} accepted quote(s).`
      })),
      suggestedActions: [
        { id: "debt-open-quotes", label: "Open Quotes", actionType: "open_quotes" },
        { id: "debt-open-billing", label: "Open Materials", actionType: "open_material_prediction" }
      ]
    };
  }

  private answerDxfErrors(input: AssistantContext): ProductionAssistantResponse {
    const problemFiles = this.dxfErrorService.listRecentProblemFiles(input.workspaceId, 8);
    const answer = problemFiles.length
      ? `DXFs with issues: ${problemFiles
          .slice(0, 5)
          .map((entry) => `${entry.dxfFileId} (${entry.criticalCount} critical, ${entry.warningCount} warning)`)
          .join(", ")}.`
      : "No recent DXF files are flagged with warning or critical errors.";
    return {
      answer,
      sourceModules: ["dxf_error_detection", "part_dna"],
      recommendations: problemFiles.slice(0, 5).map((entry) => ({
        title: entry.dxfFileId,
        message: `${entry.criticalCount} critical, ${entry.warningCount} warning, ${entry.infoCount} info issues.`
      })),
      suggestedActions: [
        { id: "dxf-open-errors", label: "Open DXF Errors", actionType: "open_dxf_errors" },
        { id: "dxf-open-part-dna", label: "Open Part DNA", actionType: "open_part_dna" }
      ]
    };
  }

  private answerOffcuts(input: AssistantContext): ProductionAssistantResponse {
    const recommendations = this.offcutService.listRecommendations(input.workspaceId, 8).slice(0, 5);
    const answer = recommendations.length
      ? `Usable offcuts: ${recommendations
          .map((entry) => `${entry.offcut?.material ?? "Offcut"} ${entry.offcut?.thickness ?? "?"}mm${entry.offcut?.location ? ` at ${entry.offcut.location}` : ""}`)
          .join(", ")}.`
      : "No strong offcut reuse recommendations are open right now.";
    return {
      answer,
      sourceModules: ["offcut_intelligence", "stock_material", "sheet_optimizer"],
      recommendations: recommendations.map((entry) => ({
        title: entry.recommendation.title,
        message: entry.recommendation.message,
        confidence: entry.recommendation.confidence
      })),
      suggestedActions: [
        { id: "offcut-open-stock", label: "Open Stock", actionType: "open_stock" },
        { id: "offcut-open-materials", label: "Open Materials", actionType: "open_material_prediction" }
      ]
    };
  }

  private helpResponse(): ProductionAssistantResponse {
    return {
      answer:
        "Ask about late jobs, what to cut next, jobs that can combine, material shortages, low profit jobs, customers owing money, DXF errors, or offcuts that can be used.",
      sourceModules: ["brain_core"],
      recommendations: [
        { title: "Try a factory question", message: "Examples: What jobs are late? What material must we buy? Which DXFs have errors?" }
      ],
      suggestedActions: [
        { id: "help-open-queue", label: "Open AI Queue", actionType: "open_ai_queue" },
        { id: "help-open-materials", label: "Open Material Prediction", actionType: "open_material_prediction" },
        { id: "help-open-profit", label: "Open Profit Intelligence", actionType: "open_profit_intelligence" }
      ]
    };
  }
}
