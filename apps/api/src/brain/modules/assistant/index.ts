import { createEventModule } from "../createModule.js";

export const assistantModule = createEventModule("assistant", ["dxf_error_detected", "nesting_completed", "nesting_heat_warning", "profit_calculated", "material_forecast_updated"]);
