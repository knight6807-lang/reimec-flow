import { GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { AppFeatureId } from "./types";
export const QOUTER_X_RELEASE_URL = "https://github.com/knight6807-lang/qouter-x-updates/releases/latest";
export const QOUTER_X_WINDOWS_DOWNLOAD_URL = "https://github.com/knight6807-lang/qouter-x-updates/releases/latest/download/Qouter-X-Setup.exe";
export const QOUTER_X_MAC_ARM64_DOWNLOAD_URL = "https://github.com/knight6807-lang/qouter-x-updates/releases/latest/download/Qouter-X-arm64.dmg";
export const QOUTER_X_MAC_INTEL_DOWNLOAD_URL = "https://github.com/knight6807-lang/qouter-x-updates/releases/latest/download/Qouter-X-x64.dmg";

export const DESKTOP_GATEWAY_API_URL_KEY = "qouterx.gatewayApiUrl";
export const FORCED_API_URL = import.meta.env.DEV ? "http://127.0.0.1:3001" : "https://qouterx-api.onrender.com";
export const DEFAULT_API_URL = FORCED_API_URL;

export function getStoredGatewayApiUrl() {
  return FORCED_API_URL;
}

export function buildApiUrlCandidates(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  const list = [normalized];
  if (normalized.includes("localhost")) list.push(normalized.replace("localhost", "127.0.0.1"));
  if (normalized.includes("127.0.0.1")) list.push(normalized.replace("127.0.0.1", "localhost"));
  return Array.from(new Set(list));
}

export const APP_URL = import.meta.env.VITE_APP_URL ?? window.location.origin;
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
export const AUTH_REMEMBER_KEY = "authRemember";
export const AUTH_EMAIL_KEY = "authEmail";
export const AUTH_PASSWORD_KEY = "authPassword";
export const AUTH_PASSWORD_STORE_KEY = "authPassword";
export const CLOUD_DEVICE_TOKEN_STORE_PREFIX = "cloudDeviceToken";
export const APP_OWNER_EMAIL = "knight6807@gmail.com";
export const EMAIL_OAUTH_STORE_PREFIX = "msgraph";
export const SUBSCRIPTION_BANK_NAME = "Capitec";
export const SUBSCRIPTION_ACCOUNT_NUMBER = "1607030940";

export function deriveAccountRef(email: string) {
  const compact = email.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const suffix = compact.slice(-8).padStart(8, "0");
  return `QX-${suffix}`;
}
export const DEVICE_ID_KEY = "reimecDeviceId";
export const EMAIL_PROCESSED_KEY_PREFIX = "emailProcessedByWorkspace";
export const EMAIL_READ_KEY_PREFIX = "emailReadByWorkspace";
export const GMAIL_EMAIL_PRESET = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecure: true,
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapSecure: true
};
export const ZAR_FORMATTER = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
export const JOB_DXF_THICKNESS_OPTIONS = [0.9, 1.2, 1.5, 1.6, 2, 3, 4, 4.5, 5, 6, 8, 10, 12, 15, 20, 25, 30];
export const APP_FEATURE_OPTIONS: Array<{ id: AppFeatureId; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "jobs", label: "Jobs" },
  { id: "part_dna", label: "Part DNA" },
  { id: "quotes", label: "Quotes" },
  { id: "email", label: "Email" },
  { id: "tank", label: "Tank" },
  { id: "documents", label: "Documents" },
  { id: "customers", label: "Customers" },
  { id: "image_dxf", label: "Image DXF" },
  { id: "ai_assistant", label: "Smart Job Queue" },
  { id: "brain_center", label: "Brain Center" },
  { id: "manufacturing_memory", label: "Manufacturing Memory" },
  { id: "profit_intelligence", label: "Profit Intelligence" },
  { id: "material_prediction", label: "Material Prediction" },
  { id: "ai_production_queue", label: "AI Production Queue" },
  { id: "lead_time_intelligence", label: "Lead Time Intelligence" },
  { id: "sheet_optimizer", label: "Sheet Optimizer" },
  { id: "nesting_workspace", label: "Nesting" },
  { id: "dxf_error_detection", label: "DXF Error Detection" },
  { id: "production_assistant", label: "Production Assistant" },
  { id: "files", label: "Files" },
  { id: "qr", label: "QR Station" }
];

export function normalizeJobDxfThickness(value?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return JOB_DXF_THICKNESS_OPTIONS[0];
  return JOB_DXF_THICKNESS_OPTIONS.reduce((closest, option) =>
    Math.abs(option - numeric) < Math.abs(closest - numeric) ? option : closest
  );
}
export const DEFAULT_MACHINE_OPTIONS = [
  "Laser Cutting",
  "Punching",
  "Fabrication",
  "Laser Welding",
  "Tank Manufacturing",
  "Bending"
];
export const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}qouterx-logo-v2.png`;

export function formatMachineLabelFromKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && existing.trim()) return existing.trim();
  const randomPart = () => Math.random().toString(36).slice(2, 10);
  const generated =
    typeof window !== "undefined" && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `device-${randomPart()}${randomPart()}`;
  localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}

export async function pickAccentFromLogo(dataUrl: string) {
  return new Promise<string | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        const sampleSize = 64;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        ctx.drawImage(image, 0, 0, sampleSize, sampleSize);
        const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const buckets = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 180) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = (r + g + b) / 3;
          if (brightness > 235 || brightness < 15) continue;
          const quant = (value: number) => Math.round(value / 16) * 16;
          const key = `${quant(r)},${quant(g)},${quant(b)}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        const best = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!best) {
          resolve(null);
          return;
        }
        const [r, g, b] = best.split(",").map((v) => Number(v));
        const toHex = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
        resolve(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

export const MASTER_MATERIALS: Array<{ name: string; density: number }> = [
  { name: "Mild Steel", density: 7850 },
  { name: "Stainless Steel 304", density: 8000 },
  { name: "Stainless Steel 316", density: 8000 },
  { name: "Stainless Steel 430", density: 7750 },
  { name: "Aluminium 6061", density: 2700 },
  { name: "Aluminium 5052", density: 2680 },
  { name: "Aluminium 6082", density: 2700 },
  { name: "Galvanised Steel", density: 7850 },
  { name: "3CR12", density: 7700 },
  { name: "Hardox 400", density: 7850 },
  { name: "Hardox 500", density: 7850 },
  { name: "EN8 (1040)", density: 7850 },
  { name: "EN24 (4340)", density: 7850 },
  { name: "A36 Steel", density: 7850 },
  { name: "A572 Steel", density: 7850 },
  { name: "Corten Steel", density: 7850 },
  { name: "Tool Steel D2", density: 7700 },
  { name: "Tool Steel O1", density: 7700 },
  { name: "Copper", density: 8960 },
  { name: "Brass", density: 8500 },
  { name: "Bronze", density: 8800 },
  { name: "Titanium Grade 2", density: 4510 },
  { name: "Titanium Grade 5", density: 4430 },
  { name: "Inconel 625", density: 8440 },
  { name: "Inconel 718", density: 8190 },
  { name: "Monel 400", density: 8800 },
  { name: "Nickel 200", density: 8900 },
  { name: "Zinc", density: 7130 },
  { name: "Magnesium", density: 1740 },
  { name: "Cast Iron", density: 7200 },
  { name: "Manganese Steel", density: 7850 }
];

export const SANITARY_FITTING_GROUPS: Array<{ group: string; fittings: string[] }> = [
  {
    group: "1. Pipes & Tubing",
    fittings: [
      "Straight Tube (SS 304 / SS 316 / SS 316L)",
      "Welded Tube",
      "Seamless Tube",
      "Polished Tube (interior finish for hygiene)",
      "Custom Length Cut Tube"
    ]
  },
  {
    group: "2. Clamps & Connection Hardware",
    fittings: [
      "Sanitary Tri-Clamp / Quick-Clamp Fittings",
      "Clamp Ferrules (plain ends for clamps)",
      "Clamp Gaskets (EPDM / Silicone / PTFE)",
      "Clamp Bolts & Nuts"
    ]
  },
  {
    group: "3. Unions & Couplings",
    fittings: ["Sanitary Unions", "Clamp Couplings", "Butt-Weld Couplings", "Split Sleeve Couplings"]
  },
  {
    group: "4. Elbows (change direction)",
    fittings: ["90° Elbow", "45° Elbow", "180° Bend", "Long Radius Elbow", "Short Radius Elbow"]
  },
  {
    group: "5. Tees & Crosses",
    fittings: [
      "Sanitary Tee (equal)",
      "Sanitary Reducing Tee",
      "Sanitary Cross (4-port)",
      "Sanitary Reducing Cross"
    ]
  },
  {
    group: "6. Reducers (change diameter)",
    fittings: ["Concentric Reducer", "Eccentric Reducer"]
  },
  {
    group: "7. Reducers & Expander Fittings",
    fittings: ["Concentric Reducer", "Eccentric Reducer", "Straight Reducer", "Expander / Swage Fittings"]
  },
  {
    group: "8. Adaptors & Transitions",
    fittings: [
      "Threaded Adaptor (NPT / BSP)",
      "Weld-On Adaptor",
      "Pipe-To-Clamp Adaptors",
      "BSP / NPT Male & Female Adaptors"
    ]
  },
  {
    group: "9. End Caps & Plugs",
    fittings: ["Sanitary End Cap", "Weld-On Cap", "Pipe Plug (threaded)"]
  },
  {
    group: "10. Valves (fluid control)",
    fittings: [
      "Ball Valve (sanitary)",
      "Butterfly Valve",
      "Non-Return / Check Valve",
      "Diaphragm Valve",
      "Sampling Valve",
      "Pressure Relief Valve",
      "Sight Glass / Sight Flow Indicator"
    ]
  },
  {
    group: "11. Clean-In-Place (CIP) Components",
    fittings: ["Spray Balls / CIP Spray Heads", "CIP Nozzles", "CIP Return Bend", "CIP Branch Fittings"]
  },
  {
    group: "12. Specialised Hygienic Fittings",
    fittings: [
      "Instrument Fittings (for sensors / probes)",
      "Sight Ports",
      "Vacuum Breaker / Air Vent",
      "Hygienic Flow Meter Connections"
    ]
  },
  {
    group: "13. Flanges & Gasketed Fittings",
    fittings: [
      "Raised Face Flange",
      "Sanitary Flange",
      "Braised Flange",
      "Flange Spacer",
      "Flange Gaskets (PTFE / EPDM / Viton)"
    ]
  },
  {
    group: "14. Flexible & Expansion Components",
    fittings: ["Sanitary Flexible Hose", "Bellows Expansion Joints", "Vibration Dampener (sanitary)"]
  },
  {
    group: "15. Accessories & Mountings",
    fittings: ["Pipe Hangers & Clamps", "Support Brackets", "Wall / Floor Mounts", "Drip Trays", "Standoffs"]
  },
  {
    group: "16. Instrumentation & Process Control",
    fittings: ["Thermowells", "Temperature Sensors / RTDs", "Pressure Transmitters", "Flowmeters", "Sampling Probes"]
  }
];

export const SANITARY_STANDARD_SIZES = [
  "DN10 / 3/8″",
  "DN15 / 1/2″",
  "DN20 / 3/4″",
  "DN25 / 1″",
  "DN32 / 1¼″",
  "DN40 / 1½″",
  "DN50 / 2″",
  "DN65 / 2½″",
  "DN80 / 3″",
  "DN100 / 4″"
];

