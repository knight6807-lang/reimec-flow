const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
const env = {
  ...process.env,
  GH_OWNER: process.env.GH_OWNER || "local",
  GH_REPO: process.env.GH_REPO || "qouter-x"
};

const result = spawnSync("electron-builder", args, {
  stdio: "inherit",
  shell: true,
  env
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
