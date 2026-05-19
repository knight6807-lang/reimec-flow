import { Worker } from "node:worker_threads";

export function runBrainWorker<TInput, TResult>(workerUrl: URL, input: TInput, timeoutMs = 60_000): Promise<TResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { workerData: input });
    const timeout = setTimeout(() => {
      worker.terminate().catch(() => undefined);
      reject(new Error("Brain worker timed out"));
    }, timeoutMs);
    worker.once("message", (message) => {
      clearTimeout(timeout);
      resolve(message as TResult);
    });
    worker.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.once("exit", (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Brain worker exited with code ${code}`));
      }
    });
  });
}
