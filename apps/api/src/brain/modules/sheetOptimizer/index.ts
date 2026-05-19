import { createEventModule } from "../createModule.js";

export const sheetOptimizerModule = createEventModule("sheet_optimizer", ["dxf_imported", "quote_created", "job_created"]);
