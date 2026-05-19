import { createEventModule } from "../createModule.js";

export const manufacturingMemoryModule = createEventModule("manufacturing_memory", ["job_completed", "profit_calculated", "dxf_error_detected"]);
