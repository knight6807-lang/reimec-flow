const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, Menu, ipcMain, safeStorage, shell } = require("electron");
let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error("[updater] electron-updater unavailable:", detail);
}

const DEV_URL = process.env.DESKTOP_URL || "http://localhost:5173";
const APP_TITLE = "Qouter X";
const WINDOW_ICON_PATH = path.join(__dirname, "build", "icon.png");
const PACKAGED_RENDERER_ENTRY = path.join(__dirname, "renderer", "index.html");
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const API_PORT = Number(process.env.PORT ?? 3001);
const API_HOST = "127.0.0.1";
const API_HEALTH_URL = `http://${API_HOST}:${API_PORT}/health`;
const API_START_TIMEOUT_MS = 25000;
const API_MAX_RESTARTS = 3;
let mainWindow = null;
let isQuitting = false;
let updateCheckTimer = null;
let updateDownloadInProgress = false;
let apiProcess = null;
let apiStatus = {
  running: false,
  url: `http://${API_HOST}:${API_PORT}`,
  error: null,
  logPath: null
};
let apiRestartAttempts = 0;
let updateStatus = {
  state: "idle",
  currentVersion: app.getVersion(),
  latestVersion: null,
  percent: null,
  message: null
};

function sendUpdateStatus(patch = {}) {
  updateStatus = {
    ...updateStatus,
    ...patch,
    currentVersion: app.getVersion()
  };
  mainWindow?.webContents.send("desktop:update-status", updateStatus);
}

function hasAutoUpdater() {
  return Boolean(autoUpdater && typeof autoUpdater.checkForUpdates === "function");
}

function isApiReachable() {
  return new Promise((resolve) => {
    const req = http.get(API_HEALTH_URL, (res) => {
      res.resume();
      resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 500));
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForApiReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isApiReachable()) {
      apiStatus = {
        running: true,
        url: `http://${API_HOST}:${API_PORT}`,
        error: null
      };
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

function getApiLogPath() {
  return path.join(app.getPath("userData"), "backend", "api.log");
}

function appendApiLog(line) {
  try {
    fs.appendFileSync(getApiLogPath(), `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    // ignore log write failures
  }
}

function getBundledApiPaths() {
  const bootstrapEntry = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar", "api-bootstrap.cjs")
    : path.join(__dirname, "api-bootstrap.cjs");
  const apiEntry = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar", "api-dist", "src", "index.js")
    : path.join(__dirname, "api-dist", "src", "index.js");
  return { bootstrapEntry, apiEntry };
}

async function ensureBundledApiRunning() {
  if (!app.isPackaged) return;

  if (await isApiReachable()) {
    apiStatus = {
      running: true,
      url: `http://${API_HOST}:${API_PORT}`,
      error: null,
      logPath: getApiLogPath()
    };
    return;
  }

  const { bootstrapEntry, apiEntry } = getBundledApiPaths();
  const apiEntryUrl = pathToFileURL(apiEntry).href;
  if (!fs.existsSync(apiEntry) || !fs.existsSync(bootstrapEntry)) {
    apiStatus = {
      running: false,
      url: `http://${API_HOST}:${API_PORT}`,
      error: `Bundled API launcher missing (${bootstrapEntry}) or entry missing (${apiEntry})`,
      logPath: getApiLogPath()
    };
    console.error("[api] bundled API launcher or entry missing", { bootstrapEntry, apiEntry });
    appendApiLog(`[api] bundled API launcher or entry missing: bootstrap=${bootstrapEntry} entry=${apiEntry}`);
    return;
  }

  const dataRoot = path.join(app.getPath("userData"), "backend");
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(getApiLogPath(), "", { encoding: "utf8", flag: "a" });

  console.error("[api] starting bundled API", { bootstrapEntry, apiEntryUrl });
  appendApiLog(`[api] starting bundled API bootstrap=${bootstrapEntry} entry=${apiEntryUrl}`);
  apiProcess = spawn(process.execPath, [bootstrapEntry, apiEntryUrl], {
    cwd: app.isPackaged ? process.resourcesPath : __dirname,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(API_PORT),
      HOST: API_HOST,
      CLIENT_ORIGIN: "http://localhost:5173,http://localhost:5174,null,file://",
      APP_URL: `http://${API_HOST}:${API_PORT}`,
      API_PUBLIC_URL: `http://${API_HOST}:${API_PORT}`,
      QOUTERX_DATA_DIR: dataRoot,
      ENABLE_FILE_ACTIVITY_WATCHER: "0"
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  apiProcess.stdout?.on("data", (chunk) => {
    const text = String(chunk).trimEnd();
    console.error(`[api stdout] ${text}`);
    appendApiLog(`[stdout] ${text}`);
  });
  apiProcess.stderr?.on("data", (chunk) => {
    const text = String(chunk).trimEnd();
    console.error(`[api stderr] ${text}`);
    appendApiLog(`[stderr] ${text}`);
  });
  apiProcess.on("exit", (code, signal) => {
    const wasExpected = isQuitting;
    apiStatus = {
      running: false,
      url: `http://${API_HOST}:${API_PORT}`,
      error: `Bundled API exited (${signal ?? code ?? "unknown"})`,
      logPath: getApiLogPath()
    };
    console.error("[api] bundled API exited", { code, signal });
    appendApiLog(`[api] bundled API exited code=${code ?? "unknown"} signal=${signal ?? "none"}`);
    apiProcess = null;
    if (!wasExpected && apiRestartAttempts < API_MAX_RESTARTS) {
      apiRestartAttempts += 1;
      appendApiLog(`[api] restart attempt ${apiRestartAttempts} of ${API_MAX_RESTARTS}`);
      setTimeout(() => {
        void ensureBundledApiRunning();
      }, 1000);
    }
  });

  const ready = await waitForApiReady(API_START_TIMEOUT_MS);
  if (!ready) {
    apiStatus = {
      running: false,
      url: `http://${API_HOST}:${API_PORT}`,
      error: "Timed out waiting for bundled API to start",
      logPath: getApiLogPath()
    };
    console.error("[api] timed out waiting for bundled API");
    appendApiLog("[api] timed out waiting for bundled API");
  }
  if (ready) {
    apiRestartAttempts = 0;
  }
}

function getSecureStorePath() {
  return path.join(app.getPath("userData"), "secure-store.json");
}

function loadSecureStore() {
  try {
    const filePath = getSecureStorePath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSecureStore(store) {
  const filePath = getSecureStorePath();
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
}

function secureEncrypt(value) {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString("base64");
  }
  return Buffer.from(value, "utf8").toString("base64");
}

function secureDecrypt(value) {
  if (!value) return null;
  try {
    const buffer = Buffer.from(value, "base64");
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buffer);
    }
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

// Avoid GPU/renderer instability on some systems during Electron dev runs.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

function createWindow() {
  console.error("[desktop-shell] createWindow");
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1280,
    height: 800,
    backgroundColor: "#1e1f22",
    icon: WINDOW_ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("did-fail-load", code, desc, url);
    setTimeout(() => {
      mainWindow?.loadURL(DEV_URL);
    }, 1500);
  });

  mainWindow.webContents.on("crashed", () => {
    console.error("webContents crashed");
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("render-process-gone", details.reason, details.exitCode);
  });

  mainWindow.on("closed", () => {
    console.error("[desktop-shell] window closed");
    mainWindow = null;
  });

  if (app.isPackaged && fs.existsSync(PACKAGED_RENDERER_ENTRY)) {
    void mainWindow.loadFile(PACKAGED_RENDERER_ENTRY);
  } else {
    void mainWindow.loadURL(DEV_URL);
  }
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.setTitle(APP_TITLE);
    sendUpdateStatus();
  });
}

function buildApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Check for Updates",
                click: () => {
                  void checkForUpdates({ manual: true });
                }
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" }
            ]
          }
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }]
    },
    {
      label: "View",
      submenu: [
        {
          label: "Check for Updates",
          click: () => {
            void checkForUpdates({ manual: true });
          }
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, ...(isMac ? [{ role: "front" }] : [{ role: "close" }])]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function wireAutoUpdater() {
  // In development, update checks are noisy and not useful.
  if (!app.isPackaged) {
    sendUpdateStatus({
      state: "dev-mode",
      message: "Auto updates are only available in packaged builds."
    });
    return;
  }

  if (!hasAutoUpdater()) {
    sendUpdateStatus({
      state: "disabled",
      percent: null,
      message: "Auto updates are unavailable in this build."
    });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    console.error("[updater] checking-for-update");
    sendUpdateStatus({
      state: "checking-for-update",
      percent: null,
      message: null
    });
  });

  autoUpdater.on("update-available", (info) => {
    updateDownloadInProgress = true;
    console.error("[updater] update-available", info?.version);
    sendUpdateStatus({
      state: "update-available",
      latestVersion: info?.version ?? null,
      percent: 0,
      message: "Update found. Downloading now."
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    updateDownloadInProgress = false;
    console.error("[updater] update-not-available", info?.version);
    sendUpdateStatus({
      state: "update-not-available",
      latestVersion: info?.version ?? app.getVersion(),
      percent: null,
      message: "You are on the latest version."
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus({
      state: "download-progress",
      percent: Number.isFinite(progress?.percent) ? Number(progress.percent) : null,
      message: "Downloading update..."
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateDownloadInProgress = false;
    console.error("[updater] update-downloaded", info?.version);
    sendUpdateStatus({
      state: "update-downloaded",
      latestVersion: info?.version ?? null,
      percent: 100,
      message: "Update ready. Restart and install when you are ready."
    });
  });

  autoUpdater.on("error", (error) => {
    updateDownloadInProgress = false;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[updater] error", message);
    sendUpdateStatus({
      state: "error",
      percent: null,
      message
    });
  });
}

async function checkForUpdates(options = {}) {
  const manual = options && options.manual === true;
  if (!app.isPackaged || updateDownloadInProgress) {
    if (manual) {
      sendUpdateStatus({
        state: "error",
        message: !app.isPackaged ? "Updates are only available in packaged builds." : "Update download already in progress."
      });
    }
    return;
  }
  if (!hasAutoUpdater()) {
    if (manual) {
      sendUpdateStatus({
        state: "error",
        message: "Auto update module is unavailable in this build."
      });
    }
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[updater] check failed", message);
    sendUpdateStatus({
      state: "error",
      message
    });
  }
}

app.whenReady().then(async () => {
  console.error("[desktop-shell] app ready");
  app.setName(APP_TITLE);
  await ensureBundledApiRunning();
  buildApplicationMenu();
  createWindow();
  wireAutoUpdater();
  void checkForUpdates();
  updateCheckTimer = setInterval(() => {
    void checkForUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  console.error("[desktop-shell] before-quit");
});

app.on("window-all-closed", () => {
  console.error("[desktop-shell] window-all-closed", process.platform, "isQuitting=", isQuitting);
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill();
  }
});

app.on("child-process-gone", (_event, details) => {
  console.error("child-process-gone", details.type, details.reason, details.exitCode);
});

process.on("uncaughtException", (err) => {
  console.error("[desktop-shell] uncaughtException", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[desktop-shell] unhandledRejection", reason);
});

ipcMain.handle("desktop:pick-dxf", async () => {
  try {
    const win = mainWindow ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win ?? undefined, {
      title: "Select DXF file",
      properties: ["openFile"],
      filters: [
        { name: "DXF Files", extensions: ["dxf"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths.length) {
      return { ok: false, canceled: true };
    }

    const filePath = result.filePaths[0];
    const contentBase64 = fs.readFileSync(filePath).toString("base64");
    return {
      ok: true,
      canceled: false,
      fileName: path.basename(filePath),
      filePath,
      contentBase64
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, canceled: false, error: detail };
  }
});

ipcMain.handle("desktop:check-updates", async () => {
  if (!app.isPackaged) {
    sendUpdateStatus({
      state: "dev-mode",
      message: "Updates are only available in packaged builds."
    });
    return { ok: false, error: "Updates are only available in packaged builds." };
  }
  try {
    await checkForUpdates({ manual: true });
    return {
      ok: true,
      updateAvailable: updateStatus.latestVersion ? updateStatus.latestVersion !== app.getVersion() : false,
      currentVersion: app.getVersion(),
      latestVersion: updateStatus.latestVersion ?? null
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: detail };
  }
});

ipcMain.handle("desktop:install-update", async () => {
  if (!app.isPackaged) {
    return { ok: false, error: "Updates are only available in packaged builds." };
  }
  if (!hasAutoUpdater()) {
    return { ok: false, error: "Auto update module is unavailable in this build." };
  }
  if (updateStatus.state !== "update-downloaded") {
    return { ok: false, error: "No downloaded update is ready to install." };
  }
  sendUpdateStatus({
    state: "installing",
    message: "Closing app and installing update..."
  });
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

ipcMain.handle("desktop:get-app-version", async () => {
  return {
    ok: true,
    version: app.getVersion(),
    packaged: app.isPackaged,
    updateStatus
  };
});

ipcMain.handle("desktop:get-api-status", async () => {
  return {
    ok: true,
    packaged: app.isPackaged,
    running: apiStatus.running,
    url: apiStatus.url,
    error: apiStatus.error,
    logPath: apiStatus.logPath ?? null
  };
});

ipcMain.handle("desktop:open-external", async (_event, url) => {
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, error: "url required" };
  }
  try {
    await shell.openExternal(url.trim());
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: detail };
  }
});

ipcMain.handle("desktop:secure-store-get", async (_event, key) => {
  if (typeof key !== "string" || !key.trim()) {
    return { ok: false, error: "key required" };
  }
  const store = loadSecureStore();
  const value = secureDecrypt(store[key.trim()]);
  return { ok: true, value };
});

ipcMain.handle("desktop:secure-store-set", async (_event, key, value) => {
  if (typeof key !== "string" || !key.trim()) {
    return { ok: false, error: "key required" };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "value must be a string" };
  }
  const store = loadSecureStore();
  store[key.trim()] = secureEncrypt(value);
  saveSecureStore(store);
  return { ok: true };
});

ipcMain.handle("desktop:secure-store-delete", async (_event, key) => {
  if (typeof key !== "string" || !key.trim()) {
    return { ok: false, error: "key required" };
  }
  const store = loadSecureStore();
  delete store[key.trim()];
  saveSecureStore(store);
  return { ok: true };
});
