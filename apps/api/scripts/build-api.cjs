const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");

const packageRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(packageRoot, "src");
const outdir = path.join(packageRoot, "dist");

function collectEntryPoints(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectEntryPoints(entryPath);
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) return [];
    return [entryPath];
  });
}

const entryPoints = collectEntryPoints(sourceDir);

fs.rmSync(outdir, { recursive: true, force: true });

build({
  entryPoints,
  outdir,
  outbase: sourceDir,
  platform: "node",
  format: "esm",
  target: "node20",
  bundle: false,
  packages: "external",
  logLevel: "info",
  sourcemap: true
}).catch((error) => {
  console.error("[api build] failed", error);
  process.exit(1);
});
