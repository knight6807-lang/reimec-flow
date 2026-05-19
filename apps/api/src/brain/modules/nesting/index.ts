import { createEventModule } from "../createModule.js";

export const nestingModule = createEventModule("nesting", [
  "job_created",
  "stock_reserved",
  "nesting_workspace_created",
  "nesting_parts_added",
  "nesting_completed",
  "nesting_heat_warning",
  "nesting_exported",
  "offcut_created"
]);
