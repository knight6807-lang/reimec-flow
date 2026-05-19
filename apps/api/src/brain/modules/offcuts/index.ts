import { createEventModule } from "../createModule.js";

export const offcutsModule = createEventModule("offcuts", ["quote_created", "job_created", "offcut_created", "stock_used"]);
