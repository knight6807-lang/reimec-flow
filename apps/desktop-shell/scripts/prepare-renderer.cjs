const fs = require("node:fs");
const path = require("node:path");

const sourceDir = path.resolve(__dirname, "../../desktop/dist");
const targetDir = path.resolve(__dirname, "../renderer");

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Renderer build not found at ${sourceDir}. Run the desktop build first.`);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });

console.log(`[prepare-renderer] copied ${sourceDir} -> ${targetDir}`);
