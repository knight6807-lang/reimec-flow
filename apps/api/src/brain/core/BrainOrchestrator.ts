import { BrainEventBus } from "./BrainEventBus.js";
import { BrainCache } from "./BrainCache.js";
import { BrainTaskService } from "./BrainTaskService.js";
import type { BrainModule, BrainModuleResult, BrainRunMode } from "./types.js";
import { emptyModuleResult } from "./types.js";

export class BrainOrchestrator {
  private running = false;

  constructor(
    private readonly eventBus: BrainEventBus,
    private readonly modules: BrainModule[],
    private readonly cache: BrainCache,
    private readonly tasks: BrainTaskService
  ) {}

  async run(input: {
    mode: BrainRunMode;
    moduleName?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    workspaceId?: string | null;
  }) {
    const task = this.tasks.create(`brain:${input.mode}`, "Brain run queued");
    this.tasks.update(task.id, { status: "running", progressPercent: 5, message: "Brain run started" });
    try {
      let result: Record<string, unknown>;
      if (input.mode === "quick") {
        result = await this.processPendingEvents();
      } else if (input.mode === "module") {
        result = await this.rebuildModule(input.moduleName ?? "");
      } else if (input.mode === "entity") {
        result = await this.rebuildEntity(input.entityType ?? "", input.entityId ?? "", input.workspaceId ?? "");
      } else {
        result = await this.rebuildAll(input.workspaceId ?? "");
      }
      this.tasks.update(task.id, {
        status: "completed",
        progressPercent: 100,
        message: "Brain run completed",
        resultJson: JSON.stringify(result)
      });
      return { taskId: task.id, ...result };
    } catch (error) {
      this.tasks.update(task.id, {
        status: "failed",
        progressPercent: 100,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async processPendingEvents(limit = 25) {
    if (this.running) return { skipped: true, reason: "brain already running" };
    this.running = true;
    const moduleResults: Array<{ eventId: number; moduleName: string; result: BrainModuleResult }> = [];
    let completed = 0;
    let failed = 0;
    try {
      const events = this.eventBus.listPending(limit);
      for (const event of events) {
        if (!this.eventBus.claim(event.id)) continue;
        try {
          this.cache.invalidateByEvent(event.eventType, event.entityType, event.entityId);
          const matchingModules = this.modules.filter((module) => module.supportedEvents.includes(event.eventType));
          for (const module of matchingModules) {
            moduleResults.push({ eventId: event.id, moduleName: module.name, result: await module.handleEvent(event) });
          }
          this.eventBus.complete(event.id);
          completed += 1;
        } catch (error) {
          this.eventBus.fail(event.id, error);
          failed += 1;
        }
      }
      return {
        processed: completed + failed,
        completed,
        failed,
        modulesRun: moduleResults.map((entry) => entry.moduleName),
        moduleResults
      };
    } finally {
      this.running = false;
    }
  }

  private async rebuildAll(workspaceId: string) {
    const results: Record<string, BrainModuleResult> = {};
    for (const module of this.modules) {
      results[module.name] = module.rebuild ? await module.rebuild({ workspaceId }) : emptyModuleResult();
    }
    return { modulesRun: Object.keys(results), results };
  }

  private async rebuildModule(moduleName: string) {
    const module = this.modules.find((entry) => entry.name === moduleName);
    if (!module) throw new Error(`Unknown brain module: ${moduleName}`);
    return { modulesRun: [module.name], results: { [module.name]: module.rebuild ? await module.rebuild() : emptyModuleResult() } };
  }

  private async rebuildEntity(entityType: string, entityId: string, workspaceId: string) {
    if (!entityType || !entityId) throw new Error("entityType and entityId are required for entity mode");
    const results: Record<string, BrainModuleResult> = {};
    for (const module of this.modules) {
      results[module.name] = module.rebuild ? await module.rebuild({ workspaceId, entityType, entityId }) : emptyModuleResult();
    }
    return { entityType, entityId, modulesRun: Object.keys(results), results };
  }
}
