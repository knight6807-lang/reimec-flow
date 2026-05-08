const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");

const packageRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(packageRoot, "src");
const outdir = path.join(packageRoot, "dist");

const entryPoints = fs
  .readdirSync(sourceDir)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => path.join(sourceDir, name));

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
