const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const UI_PORT = 5173;
const API_PORT = 3001;
const RESTART_DELAY_MS = 1000;
const PORT_WAIT_TIMEOUT_MS = 60000;
const PORT_WAIT_INTERVAL_MS = 400;
const PORT_RELEASE_TIMEOUT_MS = 3000;
const PID_FILE = path.join("/tmp", "reimec-desktop-supervisor.pid");
const MANAGED_API_BY_XPC = process.env.XPC_SERVICE_NAME === "com.reimec.desktop.app";

let shuttingDown = false;
let apiProc = null;
let uiProc = null;
let electronProc = null;
let electronStartRequested = false;

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquirePidLock() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const existingPid = Number.parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
      if (Number.isInteger(existingPid) && existingPid > 1 && isProcessAlive(existingPid)) {
        console.error(`[dev-supervisor] already running (pid=${existingPid}).`);
        process.exit(0);
      }
    }
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch (err) {
    console.error("[dev-supervisor] failed to acquire pid lock:", err.message);
  }
}

function releasePidLock() {
  try {
    if (!fs.existsSync(PID_FILE)) return;
    const filePid = Number.parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
    if (filePid === process.pid) fs.unlinkSync(PID_FILE);
  } catch {}
}

function killProc(proc) {
  if (!proc || proc.killed) return;
  proc.kill("SIGTERM");
}

function spawnNpmScript(scriptName) {
  return spawn("npm", ["run", scriptName], {
    stdio: "inherit",
    env: process.env
  });
}

function getListeningPids(port) {
  try {
    const out = execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (!out) return [];
    return out
      .split("\n")
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 1 && pid !== process.pid);
  } catch (err) {
    if (typeof err.status === "number" && err.status === 1) return [];
    console.error(`[dev-supervisor] failed to inspect port ${port}:`, err.message);
    return [];
  }
}

async function freePort(port) {
  let pids = getListeningPids(port);
  if (!pids.length) return;

  console.error(`[dev-supervisor] releasing port ${port} from pid(s): ${pids.join(", ")}`);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }

  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!getListeningPids(port).length) return;
    await wait(150);
  }

  pids = getListeningPids(port);
  if (!pids.length) return;

  console.error(`[dev-supervisor] force killing pid(s) on port ${port}: ${pids.join(", ")}`);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

async function waitForPort(port, timeoutMs) {
  const hosts = ["127.0.0.1", "::1", "localhost"];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (shuttingDown) return false;
    for (const host of hosts) {
      if (await canConnect(port, host)) return true;
    }
    await wait(PORT_WAIT_INTERVAL_MS);
  }
  return false;
}

function scheduleRestart(fn, label) {
  if (shuttingDown) return;
  console.error(`[dev-supervisor] ${label} exited. Restarting in ${RESTART_DELAY_MS}ms...`);
  setTimeout(() => {
    if (!shuttingDown) fn();
  }, RESTART_DELAY_MS);
}

async function startUi() {
  await freePort(UI_PORT);
  if (shuttingDown) return;

  console.error("[dev-supervisor] starting desktop ui...");
  uiProc = spawnNpmScript("dev:desktop");
  uiProc.on("exit", (code, signal) => {
    uiProc = null;
    if (shuttingDown) return;
    console.error(`[dev-supervisor] desktop ui exited (code=${code}, signal=${signal}).`);
    scheduleRestart(startUi, "desktop ui");
  });
}

async function startApi() {
  await freePort(API_PORT);
  if (shuttingDown) return;

  console.error("[dev-supervisor] starting api...");
  apiProc = spawnNpmScript("dev:api");
  apiProc.on("exit", (code, signal) => {
    apiProc = null;
    if (shuttingDown) return;
    console.error(`[dev-supervisor] api exited (code=${code}, signal=${signal}).`);
    scheduleRestart(startApi, "api");
  });
}

async function ensureApiReadyOrStartFallback() {
  if (!MANAGED_API_BY_XPC) {
    await startApi();
    return;
  }
  console.error("[dev-supervisor] using managed XPC API service (skip local api spawn).");
  const ready = await waitForPort(API_PORT, 12000);
  if (ready || shuttingDown) return;
  console.error("[dev-supervisor] managed API not ready; starting local api fallback.");
  await startApi();
}

async function startElectronWhenReady() {
  if (electronStartRequested || shuttingDown) return;
  electronStartRequested = true;

  const ready = await waitForPort(UI_PORT, PORT_WAIT_TIMEOUT_MS);
  if (!ready) {
    electronStartRequested = false;
    if (!shuttingDown) {
      console.error(`[dev-supervisor] ui port ${UI_PORT} not ready in time.`);
      scheduleRestart(startElectronWhenReady, "electron start");
    }
    return;
  }

  if (shuttingDown) return;

  console.error("[dev-supervisor] starting electron...");
  electronProc = spawnNpmScript("dev:electron");
  electronStartRequested = false;
  electronProc.on("exit", (code, signal) => {
    electronProc = null;
    electronStartRequested = false;
    if (shuttingDown) return;
    if (code === 0 && signal == null) {
      console.error("[dev-supervisor] electron closed normally. Stopping supervisor.");
      shutdown();
      return;
    }
    console.error(`[dev-supervisor] electron exited (code=${code}, signal=${signal}).`);
    scheduleRestart(startElectronWhenReady, "electron");
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error("[dev-supervisor] shutting down...");
  killProc(apiProc);
  killProc(electronProc);
  killProc(uiProc);
  releasePidLock();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => {
  killProc(apiProc);
  killProc(electronProc);
  killProc(uiProc);
  releasePidLock();
});

acquirePidLock();
ensureApiReadyOrStartFallback();
startUi();
startElectronWhenReady();
