const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const targets = [
  path.join(projectRoot, "build"),
  path.join(projectRoot, "renderer"),
];

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  if (process.platform !== "darwin") continue;

  const result = spawnSync("xattr", ["-cr", target], { stdio: "pipe" });
  if (result.status !== 0) {
    const error = result.stderr?.toString().trim() || "unknown xattr failure";
    if (/Invalid argument/i.test(error)) {
      console.warn(`[prepare-assets] ignoring xattr warning for ${target}: ${error}`);
      continue;
    }
    throw new Error(`[prepare-assets] failed to clear extended attributes for ${target}: ${error}`);
  }
}

console.log("[prepare-assets] build assets ready");
