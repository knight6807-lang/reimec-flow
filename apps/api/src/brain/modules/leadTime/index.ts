import { createEventModule } from "../createModule.js";

export const leadTimeModule = createEventModule("lead_time", ["quote_created", "job_created", "job_started", "job_completed", "stock_reserved"]);
