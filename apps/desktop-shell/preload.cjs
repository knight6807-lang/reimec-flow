const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopShell", {
  pickDxfFile: () => ipcRenderer.invoke("desktop:pick-dxf"),
  pickFile: (input) => ipcRenderer.invoke("desktop:pick-file", input),
  saveDxfFile: (input) => ipcRenderer.invoke("desktop:save-dxf", input),
  getAppVersion: () => ipcRenderer.invoke("desktop:get-app-version"),
  getApiBaseUrl: () => ipcRenderer.invoke("desktop:get-api-base-url"),
  restartApi: () => ipcRenderer.invoke("desktop:restart-api"),
  openApiLogs: () => ipcRenderer.invoke("desktop:open-api-logs"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  installUpdateNow: () => ipcRenderer.invoke("desktop:install-update"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  openPath: (targetPath) => ipcRenderer.invoke("desktop:open-path", targetPath),
  getApiConfig: () => ipcRenderer.invoke("desktop:get-api-config"),
  setApiConfig: (config) => ipcRenderer.invoke("desktop:set-api-config", config),
  secureStoreGet: (key) => ipcRenderer.invoke("desktop:secure-store-get", key),
  secureStoreSet: (key, value) => ipcRenderer.invoke("desktop:secure-store-set", key, value),
  secureStoreDelete: (key) => ipcRenderer.invoke("desktop:secure-store-delete", key),
  getApiStatus: () => ipcRenderer.invoke("desktop:get-api-status"),
  onUpdateStatus: (listener) => {
    if (typeof listener !== "function") return () => {};
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("desktop:update-status", wrapped);
    return () => ipcRenderer.removeListener("desktop:update-status", wrapped);
  },
  onApiStatusChange: (listener) => {
    if (typeof listener !== "function") return () => {};
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("qouterx:api-status", wrapped);
    return () => ipcRenderer.removeListener("qouterx:api-status", wrapped);
  }
});

contextBridge.exposeInMainWorld("qouterx", {
  getApiBaseUrl: () => ipcRenderer.invoke("desktop:get-api-base-url"),
  onApiStatusChange: (listener) => {
    if (typeof listener !== "function") return () => {};
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("qouterx:api-status", wrapped);
    return () => ipcRenderer.removeListener("qouterx:api-status", wrapped);
  },
  restartApi: () => ipcRenderer.invoke("desktop:restart-api")
});
