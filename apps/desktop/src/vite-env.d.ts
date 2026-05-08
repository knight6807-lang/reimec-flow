/// <reference types="vite/client" />

type DesktopPickDxfResult =
  | { ok: true; canceled: false; fileName: string; filePath: string; contentBase64: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error?: string };

type DesktopSaveDxfResult =
  | { ok: true; canceled: false; filePath: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error?: string };

type DesktopCheckUpdatesResult =
  | { ok: true; updateAvailable: boolean; currentVersion: string; latestVersion: string | null }
  | { ok: false; error?: string };

type DesktopUpdateStatusPayload = {
  state:
    | "idle"
    | "dev-mode"
    | "checking-for-update"
    | "update-available"
    | "update-not-available"
    | "download-progress"
    | "update-downloaded"
    | "installing"
    | "error";
  currentVersion?: string;
  latestVersion?: string | null;
  percent?: number | null;
  message?: string | null;
};

type DesktopApiStatusPayload = {
  ok?: boolean;
  packaged?: boolean;
  running?: boolean;
  url?: string;
  mode?: "local" | "gateway";
  error?: string | null;
  logPath?: string | null;
};

interface Window {
  desktopShell?: {
    pickDxfFile: () => Promise<DesktopPickDxfResult>;
    saveDxfFile: (input: { defaultFileName: string; contentBase64?: string; contentText?: string }) => Promise<DesktopSaveDxfResult>;
    getAppVersion: () => Promise<{
      ok: boolean;
      version?: string;
      packaged?: boolean;
      updateStatus?: DesktopUpdateStatusPayload;
      error?: string;
    }>;
    getApiBaseUrl: () => Promise<{
      ok: boolean;
      url?: string;
      packaged?: boolean;
      running?: boolean;
      mode?: "local" | "gateway";
      error?: string;
    }>;
    restartApi: () => Promise<{ ok: boolean; error?: string; status?: DesktopApiStatusPayload }>;
    openApiLogs: () => Promise<{ ok: boolean; path?: string; error?: string }>;
    checkForUpdates: () => Promise<DesktopCheckUpdatesResult>;
    installUpdate: () => Promise<{ ok: boolean; error?: string }>;
    installUpdateNow: () => Promise<{ ok: boolean; error?: string }>;
    openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
    getApiConfig: () => Promise<{
      ok: boolean;
      gatewayApiUrl?: string | null;
      activeApiUrl?: string;
      error?: string;
    }>;
    setApiConfig: (config: {
      gatewayApiUrl?: string | null;
    }) => Promise<{
      ok: boolean;
      gatewayApiUrl?: string | null;
      activeApiUrl?: string;
      error?: string;
    }>;
    secureStoreGet: (key: string) => Promise<{ ok: boolean; value?: string | null; error?: string }>;
    secureStoreSet: (key: string, value: string) => Promise<{ ok: boolean; error?: string }>;
    secureStoreDelete: (key: string) => Promise<{ ok: boolean; error?: string }>;
    getApiStatus: () => Promise<DesktopApiStatusPayload>;
    onApiStatusChange: (listener: (payload: DesktopApiStatusPayload) => void) => () => void;
    onUpdateStatus: (listener: (payload: DesktopUpdateStatusPayload) => void) => () => void;
  };
  qouterx?: {
    getApiBaseUrl: () => Promise<{
      ok: boolean;
      url?: string;
      packaged?: boolean;
      running?: boolean;
      mode?: "local" | "gateway";
      error?: string;
    }>;
    restartApi: () => Promise<{ ok: boolean; error?: string; status?: DesktopApiStatusPayload }>;
    onApiStatusChange: (listener: (payload: DesktopApiStatusPayload) => void) => () => void;
  };
}
