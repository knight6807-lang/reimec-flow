import { app, BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";

const DEV_URL = process.env.DESKTOP_URL || "http://localhost:5173";
const APP_TITLE = "Qouter X";
const WINDOW_ICON_PATH = path.join(import.meta.dirname, "build", "icon.png");
const PACKAGED_RENDERER_ENTRY = path.join(import.meta.dirname, "renderer", "index.html");
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1280,
    height: 800,
    backgroundColor: "#1e1f22",
    icon: WINDOW_ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (app.isPackaged && fs.existsSync(PACKAGED_RENDERER_ENTRY)) {
    void mainWindow.loadFile(PACKAGED_RENDERER_ENTRY);
  } else {
    void mainWindow.loadURL(DEV_URL);
  }
}

app.whenReady().then(() => {
  app.setName(APP_TITLE);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
