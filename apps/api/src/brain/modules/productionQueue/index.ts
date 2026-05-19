import { createEventModule } from "../createModule.js";

export const productionQueueModule = createEventModule("production_queue", ["job_created", "job_started", "job_completed", "stock_reserved", "stock_used"]);
