import { createEventModule } from "../createModule.js";

export const purchasingModule = createEventModule("purchasing", ["material_forecast_updated", "stock_used", "job_completed"]);
