import { createEventModule } from "../createModule.js";

export const materialPredictionModule = createEventModule("material_prediction", ["job_completed", "stock_used", "material_used", "quote_created"]);
