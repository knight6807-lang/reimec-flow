const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");

const sourceDir = path.resolve(__dirname, "..", "..", "api", "src");
const targetRoot = path.resolve(__dirname, "..", "api-dist");
const targetDir = path.join(targetRoot, "src");

if (!fs.existsSync(sourceDir)) {
  throw new Error(`[prepare-api] source directory missing: ${sourceDir}`);
}

const entryPoints = fs
  .readdirSync(sourceDir)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => path.join(sourceDir, name));

fs.rmSync(targetRoot, { recursive: true, force: true });
fs.mkdirSync(targetRoot, { recursive: true });

build({
  entryPoints,
  outdir: targetDir,
  outbase: sourceDir,
  platform: "node",
  format: "esm",
  target: "node16",
  bundle: false,
  packages: "external",
  logLevel: "silent"
})
  .then(() => {
    fs.writeFileSync(
      path.join(targetRoot, "package.json"),
      JSON.stringify({ type: "module" }, null, 2),
      "utf8"
    );
    console.log(`[prepare-api] compiled ${entryPoints.length} API files into ${targetRoot}`);
  })
  .catch((error) => {
    console.error("[prepare-api] compile failed", error);
    process.exit(1);
  });
