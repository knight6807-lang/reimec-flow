import type { BrainModule, BrainModuleResult, BrainEventType } from "../core/types.js";
import { emptyModuleResult } from "../core/types.js";

export function createEventModule(
  name: string,
  supportedEvents: BrainEventType[],
  handler?: (eventType: BrainEventType) => Partial<BrainModuleResult>
): BrainModule {
  return {
    name,
    supportedEvents,
    async handleEvent(event) {
      const handled = handler?.(event.eventType) ?? {};
      return {
        ...emptyModuleResult({ handled: true, eventId: event.id }),
        ...handled,
        warnings: handled.warnings ?? [],
        metrics: { handled: true, eventId: event.id, ...(handled.metrics ?? {}) }
      };
    },
    async rebuild() {
      return emptyModuleResult({ rebuilt: true });
    }
  };
}
