import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkerOptions } from "node:worker_threads";

export type NestingWorkerLaunch = {
  filename: string;
  options?: Pick<WorkerOptions, "execArgv">;
};

/**
 * Nesting workers must load compiled `.js` from `dist/`.
 * Under `tsx` (`import.meta.url` in `src/`), `./foo.js` does not exist and a `.ts`
 * worker still fails because worker imports use `.js` specifiers Node won't remap.
 */
export function resolveNestingWorkerEntry(basename: string): NestingWorkerLaunch {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const inSrc = path.basename(here) === "src";
  const candidates = inSrc
    ? [path.join(here, "..", "dist", `${basename}.js`), path.join(here, `${basename}.js`)]
    : [path.join(here, `${basename}.js`), path.join(here, "..", "dist", `${basename}.js`)];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { filename: candidate };
    }
  }

  throw new Error(
    `Nesting worker ${basename}.js not found (looked in ${candidates.join(", ")}). Run \`npm run build\` in apps/api first.`
  );
}
