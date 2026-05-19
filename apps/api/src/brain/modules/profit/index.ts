import { createEventModule } from "../createModule.js";

export const profitModule = createEventModule("profit", ["job_completed", "quote_approved"]);
