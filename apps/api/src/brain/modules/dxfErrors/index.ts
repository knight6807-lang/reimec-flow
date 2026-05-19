import { createEventModule } from "../createModule.js";

export const dxfErrorsModule = createEventModule("dxf_errors", ["dxf_imported", "dxf_error_detected"]);
