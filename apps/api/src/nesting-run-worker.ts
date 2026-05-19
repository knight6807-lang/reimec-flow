import { parentPort, workerData } from "node:worker_threads";
import { runAdvancedNesting, type NestPart, type SheetSource } from "./QouterXNestingEngine.js";

try {
  const data = workerData as {
    parts: NestPart[];
    sheet: SheetSource;
    customerName: string;
    nestName: string;
    maxOptimizationMs: number;
    angleStepDegrees?: number;
  };
  const result = runAdvancedNesting(data.parts, data.sheet, {
    customerName: data.customerName,
    nestName: data.nestName,
    maxOptimizationMs: data.maxOptimizationMs,
    angleStepDegrees: data.angleStepDegrees
  });
  parentPort?.postMessage({ result });
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
