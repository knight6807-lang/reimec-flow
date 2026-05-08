const { spawn } = require("node:child_process");
const path = require("node:path");

const electronBinary = require("electron");
const appPath = path.resolve(__dirname, "..", ".");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [appPath], {
  stdio: "inherit",
  env
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
