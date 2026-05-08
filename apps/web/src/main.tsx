import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, Socket } from "socket.io-client";
import { QRCodeCanvas } from "qrcode.react";

type ChatMsg = { roomId: string; text: string; user: string };

type BillingStatus = {
  status: string | null;
  currentPeriodEnd: number | null;
  hasAccess: boolean | null;
};

type RoleRecord = { id: string; name: string; color?: string };

type ChannelRecord = { id: string; name: string };

type ServerRecord = {
  id: string;
  name: string;
  channels: ChannelRecord[];
  roles: RoleRecord[];
};

type FileRecord = {
  id: string;
  name: string;
  path?: string;
  size?: number;
  uploadedBy?: string;
  createdAt: string;
};

type JobRecord = {
  id: string;
  jobNumber: string;
  qrToken: string;
  title: string;
  status: "open" | "in_progress" | "incomplete" | "done";
  customerName?: string;
  assignedTo?: string;
  price?: number;
  cost?: number;
  quantityExpected?: number;
  quantityChecked?: number;
  repeatCount?: number;
  lastRepeatPrice?: number;
  jobCardPath?: string;
  fileLinks?: Array<{ fileName: string; originalPath: string; linkPath: string }>;
  createdAt: string;
};

type LedgerSummary = {
  income: number;
  expense: number;
  profit: number;
};

type SyncState = {
  lastSyncAt?: string;
  lastDeviceId?: string;
};

type UserSummary = { id: string; email: string; name?: string };

type WorkspaceSummary = { id: string; name: string };
type WorkspaceUser = { id: string; email: string; name?: string; role: string; userRef?: string };
type StorageOverview = {
  jobnestRoot: string;
  customersRoot: string;
  jobsActiveRoot: string;
  jobsCompletedRoot: string;
  customers: Array<{ name: string; path: string }>;
  jobsActive: Array<{ name: string; path: string }>;
  jobsCompleted: Array<{ name: string; path: string }>;
  jobCount: number;
};
type CustomerRecord = { id: string; name: string; email?: string; phone?: string; notes?: string };
type CustomerSummary = { id: string; name: string; billed: number; paid: number; balance: number; jobCount: number };
type WorkerRecord = { id: string; name: string; email?: string; roleIds: string[]; active: boolean };
type QuotePart = {
  name: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  material: string;
  quantity: number;
  cutLengthMm: number;
  pierceCount: number;
  bendCount: number;
  unitPrice: number;
  lineTotal: number;
  weightKg?: number;
};

type QuoteSection = {
  description?: string;
  amount?: number;
  parts?: QuotePart[];
  vatRate?: number;
  totals?: { subTotal: number; vat: number; total: number };
};
type QuoteRecord = {
  id: string;
  quoteNumber: string;
  title: string;
  status: "draft" | "sent" | "accepted" | "rejected";
  customerName?: string;
  sections: {
    laserCutting: QuoteSection;
    punching: QuoteSection;
    fabrication: QuoteSection;
    laserWelding: QuoteSection;
    tankManufacturing: QuoteSection;
    bending: QuoteSection;
  };
  total?: number;
  companyName?: string;
  logoDataUrl?: string;
  quotePdfPath?: string;
  createdAt: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const APP_URL = import.meta.env.VITE_APP_URL ?? window.location.origin;

const MASTER_MATERIALS: Array<{ name: string; density: number }> = [
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

const SANITARY_FITTING_GROUPS: Array<{ group: string; fittings: string[] }> = [
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

const SANITARY_STANDARD_SIZES = [
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

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("authToken"));
  const [user, setUser] = useState<UserSummary | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authWorkspaceName, setAuthWorkspaceName] = useState("Qouterx");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [scanToken, setScanToken] = useState("");
  const [scanQuantity, setScanQuantity] = useState("");
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  const [chatUser] = useState("Shaun");
  const [text, setText] = useState("");
  const [log, setLog] = useState<Array<string | ChatMsg>>([]);
  const [billingEmail, setBillingEmail] = useState("owner@reimec.co.za");
  const [billing, setBilling] = useState<BillingStatus>({ status: null, currentPeriodEnd: null, hasAccess: null });
  const [billingBusy, setBillingBusy] = useState(false);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [ledger, setLedger] = useState<LedgerSummary>({ income: 0, expense: 0, profit: 0 });
  const [syncState, setSyncState] = useState<SyncState>({});
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [storageOverview, setStorageOverview] = useState<StorageOverview | null>(null);
  const [viewMode, setViewMode] = useState<
    "chat" | "jobs" | "qr" | "files" | "customers" | "settings" | "quotes"
  >("jobs");
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [customerSummaries, setCustomerSummaries] = useState<CustomerSummary[]>([]);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);

  const [jobTitle, setJobTitle] = useState("");
  const [jobCustomer, setJobCustomer] = useState("");
  const [jobAssignedTo, setJobAssignedTo] = useState("");
  const [jobQuantity, setJobQuantity] = useState("");
  const [jobPrice, setJobPrice] = useState("");
  const [jobCost, setJobCost] = useState("");
  const [jobFiles, setJobFiles] = useState<FileList | null>(null);
  const [jobSearch, setJobSearch] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newWorkerName, setNewWorkerName] = useState("");
  const [selectedQuote, setSelectedQuote] = useState("");
  const [quoteSeed, setQuoteSeed] = useState("");
  const [quoteTitle, setQuoteTitle] = useState("");
  const [quoteCustomer, setQuoteCustomer] = useState("");
  const [quoteCompanyName, setQuoteCompanyName] = useState("Qouterx");
  const [quoteLogoDataUrl, setQuoteLogoDataUrl] = useState<string | undefined>(undefined);
  const [quoteVatRate, setQuoteVatRate] = useState("15");
  const [costPerPierce, setCostPerPierce] = useState("0");
  const [costPerCutMm, setCostPerCutMm] = useState("0");
  const [costPerBend, setCostPerBend] = useState("0");
  const [quoteParts, setQuoteParts] = useState<QuotePart[]>([]);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materials, setMaterials] = useState<
    Array<{ name: string; density: number; ratePerKg: number }>
  >([
    { name: "Mild Steel", density: 7850, ratePerKg: 0 },
    { name: "Aluminium", density: 2700, ratePerKg: 0 },
    { name: "Stainless Steel", density: 8000, ratePerKg: 0 },
    { name: "Galvanise", density: 7850, ratePerKg: 0 },
    { name: "3CR12", density: 7700, ratePerKg: 0 }
  ]);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialDensity, setNewMaterialDensity] = useState("");
  const [thicknessRates, setThicknessRates] = useState<
    Array<{ thicknessMm: number; ratePerKg: number }>
  >([]);
  const [newThicknessMm, setNewThicknessMm] = useState("");
  const [newThicknessRate, setNewThicknessRate] = useState("");
  const [quickPartName, setQuickPartName] = useState("");
  const [quickPartLength, setQuickPartLength] = useState("");
  const [quickPartWidth, setQuickPartWidth] = useState("");
  const [quickPartThickness, setQuickPartThickness] = useState("");
  const [quickPartQuantity, setQuickPartQuantity] = useState("");
  const [quickPartMaterial, setQuickPartMaterial] = useState("Mild Steel");
  const [copiedPart, setCopiedPart] = useState<QuotePart | null>(null);
  const [quoteLaserCutting, setQuoteLaserCutting] = useState("");
  const [quoteLaserCuttingAmount, setQuoteLaserCuttingAmount] = useState("");
  const [quotePunching, setQuotePunching] = useState("");
  const [quotePunchingAmount, setQuotePunchingAmount] = useState("");
  const [quoteFabrication, setQuoteFabrication] = useState("");
  const [quoteFabricationAmount, setQuoteFabricationAmount] = useState("");
  const [quoteLaserWelding, setQuoteLaserWelding] = useState("");
  const [quoteLaserWeldingAmount, setQuoteLaserWeldingAmount] = useState("");
  const [quoteTankManufacturing, setQuoteTankManufacturing] = useState("");
  const [quoteTankManufacturingAmount, setQuoteTankManufacturingAmount] = useState("");
  const [selectedFittingGroup, setSelectedFittingGroup] = useState(SANITARY_FITTING_GROUPS[0]?.group ?? "");
  const [selectedFitting, setSelectedFitting] = useState(SANITARY_FITTING_GROUPS[0]?.fittings[0] ?? "");
  const [selectedFittingSize, setSelectedFittingSize] = useState("");
  const [quoteBending, setQuoteBending] = useState("");
  const [quoteBendingAmount, setQuoteBendingAmount] = useState("");
  const [punchParts, setPunchParts] = useState<
    Array<{
      name: string;
      lengthMm: number;
      widthMm: number;
      thicknessMm: number;
      material: string;
      quantity: number;
      pricePerSqm: number;
      discountPercent: number;
      plateType: "tread" | "perforation";
      holeSizeMm: number;
    }>
  >([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  const socket: Socket = useMemo(() => {
    return io(API_URL, { transports: ["websocket"], auth: token ? { token } : undefined });
  }, [token]);

  const isScanPage = window.location.pathname.startsWith("/scan");

  const activeServer = servers.find((server) => server.id === activeServerId) ?? servers[0];
  const activeChannel =
    activeServer?.channels.find((channel) => channel.id === activeChannelId) ??
    activeServer?.channels[0];
  const roomId = activeChannel?.name ?? "general";
  const fittingsForSelectedGroup =
    SANITARY_FITTING_GROUPS.find((entry) => entry.group === selectedFittingGroup)?.fittings ?? [];

  function apiFetch(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers ?? undefined);
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, { ...options, headers });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      localStorage.setItem("authToken", tokenParam);
      setToken(tokenParam);
      params.delete("token");
      const next = window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", next);
    }
  }, []);

  useEffect(() => {
    if (!isScanPage) return;
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) setScanToken(tokenParam);
  }, [isScanPage]);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 402) {
            setAuthError("Payment is required before login. Once the subscription is paid, sign in again.");
          }
          throw new Error("Unauthorized");
        }
        return res.json();
      })
      .then((data: { user: UserSummary; workspaces: WorkspaceSummary[] }) => {
        setUser(data.user);
        setWorkspaces(data.workspaces);
        if (!workspaceId && data.workspaces[0]) {
          setWorkspaceId(data.workspaces[0].id);
        }
      })
      .catch(() => {
        setToken(null);
        localStorage.removeItem("authToken");
      });
  }, [token, workspaceId]);

  useEffect(() => {
    socket.on("connect", () => {
      setLog((l) => [`✅ connected ${socket.id}`, ...l]);
      socket.emit("join", roomId);
    });

    socket.on("system", (msg: string) => setLog((l) => [msg, ...l]));
    socket.on("message", (msg: ChatMsg) => setLog((l) => [msg, ...l]));
    socket.on("disconnect", () => setLog((l) => ["⚠️ disconnected", ...l]));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    if (!roomId) return;
    socket.emit("join", roomId);
    setLog((l) => [`# ${roomId}`, ...l]);
  }, [roomId, socket]);

  useEffect(() => {
    if (!workspaceId) return;
    refreshBilling();
    refreshServers();
    refreshFiles();
    refreshLedger();
    refreshSyncStatus();
    refreshUsers();
    refreshJobs();
    refreshQuotes();
    refreshStorage();
    refreshCustomers();
    refreshWorkers();
    refreshCustomerSummary();
  }, [workspaceId]);

  async function refreshServers() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/servers`);
      if (!res.ok) return;
      const data = (await res.json()) as { servers: ServerRecord[] };
      setServers(data.servers);
      if (!activeServerId && data.servers[0]) {
        setActiveServerId(data.servers[0].id);
      }
      if (!activeChannelId && data.servers[0]?.channels[0]) {
        setActiveChannelId(data.servers[0].channels[0].id);
      }
    } catch {
      // ignore
    }
  }

  async function refreshFiles() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/files`);
      if (!res.ok) return;
      const data = (await res.json()) as { files: FileRecord[] };
      setFiles(data.files);
    } catch {
      // ignore
    }
  }

  async function refreshLedger() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/reports/summary`);
      if (!res.ok) return;
      const data = (await res.json()) as LedgerSummary;
      setLedger(data);
    } catch {
      // ignore
    }
  }

  async function refreshUsers() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/users`);
      if (!res.ok) return;
      const data = (await res.json()) as { users: WorkspaceUser[] };
      setWorkspaceUsers(data.users);
    } catch {
      // ignore
    }
  }

  async function refreshJobs() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/jobs`);
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: JobRecord[] };
      setJobs(data.jobs);
    } catch {
      // ignore
    }
  }

  async function refreshQuotes() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/quotes`);
      if (!res.ok) return;
      const data = (await res.json()) as { quotes: QuoteRecord[] };
      setQuotes(data.quotes);
    } catch {
      // ignore
    }
  }

  async function refreshStorage() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/storage/overview`);
      if (!res.ok) return;
      const data = (await res.json()) as StorageOverview;
      setStorageOverview(data);
    } catch {
      // ignore
    }
  }

  async function refreshCustomers() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/customers`);
      if (!res.ok) return;
      const data = (await res.json()) as { customers: CustomerRecord[] };
      setCustomers(data.customers);
    } catch {
      // ignore
    }
  }

  async function refreshCustomerSummary() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/customers/summary`);
      if (!res.ok) return;
      const data = (await res.json()) as { customers: CustomerSummary[] };
      setCustomerSummaries(data.customers);
    } catch {
      // ignore
    }
  }

  async function refreshWorkers() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/workers`);
      if (!res.ok) return;
      const data = (await res.json()) as { workers: WorkerRecord[] };
      setWorkers(data.workers);
    } catch {
      // ignore
    }
  }

  async function refreshBilling() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/billing/status?workspaceId=${workspaceId}`);
      if (!res.ok) {
        if (res.status === 402) {
          logout();
          setAuthError("Payment is required before login. Once the subscription is paid, sign in again.");
        }
        return;
      }
      const data = (await res.json()) as BillingStatus;
      setBilling(data);
      if (data.hasAccess === false) {
        logout();
        setAuthError("Payment is required before login. Once the subscription is paid, sign in again.");
      }
    } catch {
      // Ignore fetch errors for now
    }
  }

  async function refreshSyncStatus() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/sync/status`);
      if (!res.ok) return;
      const data = (await res.json()) as { syncState: SyncState };
      setSyncState(data.syncState ?? {});
    } catch {
      // ignore
    }
  }

  async function createServer() {
    if (!workspaceId) return;
    const name = window.prompt("New server name?");
    if (!name) return;
    await apiFetch(`/api/workspaces/${workspaceId}/servers`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
    await refreshServers();
  }

  async function createChannel() {
    if (!workspaceId || !activeServer) return;
    const name = window.prompt("New channel name?");
    if (!name) return;
    await apiFetch(`/api/workspaces/${workspaceId}/servers/${activeServer.id}/channels`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
    await refreshServers();
  }

  async function createRole() {
    if (!workspaceId || !activeServer) return;
    const name = window.prompt("New role name?");
    if (!name) return;
    const color = window.prompt("Role color hex (optional)?") ?? undefined;
    await apiFetch(`/api/workspaces/${workspaceId}/servers/${activeServer.id}/roles`, {
      method: "POST",
      body: JSON.stringify({ name, color })
    });
    await refreshServers();
  }

  async function createFile() {
    if (!workspaceId) return;
    const name = window.prompt("File name?");
    if (!name) return;
    const path = window.prompt("File path (optional)?") ?? undefined;
    const sizeText = window.prompt("File size in bytes (optional)?") ?? "";
    const size = sizeText ? Number(sizeText) : undefined;
    await apiFetch(`/api/workspaces/${workspaceId}/files`, {
      method: "POST",
      body: JSON.stringify({ name, path, size, uploadedBy: chatUser })
    });
    await refreshFiles();
  }

  async function createLedgerEntry() {
    if (!workspaceId) return;
    const type = (window.prompt("Entry type: income or expense?") ?? "income").toLowerCase();
    const amountText = window.prompt("Amount?") ?? "";
    const amount = Number(amountText);
    if (!Number.isFinite(amount)) return;
    const category = window.prompt("Category (optional)?") ?? undefined;
    const description = window.prompt("Description (optional)?") ?? undefined;
    await apiFetch(`/api/workspaces/${workspaceId}/ledger`, {
      method: "POST",
      body: JSON.stringify({ type, amount, category, description })
    });
    await refreshLedger();
  }

  async function syncLocalFiles() {
    if (!workspaceId) return;
    await apiFetch(`/api/workspaces/${workspaceId}/sync/local`, {
      method: "POST",
      body: JSON.stringify({ deviceId: "desktop", files })
    });
    await refreshSyncStatus();
  }

  async function completeJobViaQr() {
    if (!workspaceId) return;
    const jobId = window.prompt("Job ID (from QR)?");
    if (!jobId) return;
    const quantity = window.prompt("Quantity checked?");
    if (!quantity) return;
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed)) return;
    await apiFetch(`/api/workspaces/${workspaceId}/jobs/${jobId}/quantity-check`, {
      method: "POST",
      body: JSON.stringify({ quantity: parsed, roomId })
    });
    await refreshJobs();
  }

  async function createWorkspaceUser() {
    if (!workspaceId) return;
    const email = window.prompt("User email?");
    if (!email) return;
    const password = window.prompt("Temporary password?");
    if (!password) return;
    const name = window.prompt("Name (optional)?") ?? undefined;
    const roleInput = (window.prompt("Role: admin or member?") ?? "member").toLowerCase();
    const role = roleInput === "admin" ? "admin" : "member";
    const res = await apiFetch(`/api/workspaces/${workspaceId}/users`, {
      method: "POST",
      body: JSON.stringify({ email, password, name, role })
    });
    if (!res.ok) return;
    await refreshUsers();
  }

  async function createJob() {
    if (!workspaceId) return;
    if (!jobTitle.trim()) return;
    const quantityExpected = jobQuantity ? Number(jobQuantity) : undefined;
    const price = jobPrice ? Number(jobPrice) : undefined;
    const cost = jobCost ? Number(jobCost) : undefined;
    const fileNames = jobFiles ? Array.from(jobFiles).map((file) => file.name) : [];
    const res = await apiFetch(`/api/workspaces/${workspaceId}/jobs`, {
      method: "POST",
      body: JSON.stringify({
        title: jobTitle.trim(),
        customerName: jobCustomer.trim(),
        assignedTo: jobAssignedTo.trim(),
        quantityExpected: Number.isFinite(quantityExpected) ? quantityExpected : undefined,
        price: Number.isFinite(price) ? price : undefined,
        cost: Number.isFinite(cost) ? cost : undefined,
        fileNames,
        quoteNumber: selectedQuote || undefined
      })
    });
    if (!res.ok) return;
    const data = (await res.json()) as { job: JobRecord };
    if (jobFiles && jobFiles.length > 0) {
      const formData = new FormData();
      Array.from(jobFiles).forEach((file) => formData.append("files", file));
      await fetch(`${API_URL}/api/workspaces/${workspaceId}/jobs/${data.job.id}/files`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
    }
    setJobTitle("");
    setJobCustomer("");
    setJobAssignedTo("");
    setJobQuantity("");
    setJobPrice("");
    setJobCost("");
    setJobFiles(null);
    setSelectedQuote("");
    await refreshJobs();
    await refreshCustomerSummary();
  }

  async function markJobDone(jobId: string) {
    if (!workspaceId) return;
    await apiFetch(`/api/workspaces/${workspaceId}/jobs/${jobId}/complete`, {
      method: "POST",
      body: JSON.stringify({ roomId })
    });
    await refreshJobs();
    await refreshCustomerSummary();
  }

  async function runQuantityCheck(jobId: string, expected?: number) {
    if (!workspaceId) return;
    const quantity = window.prompt("Quantity checked?", expected?.toString() ?? "");
    if (!quantity) return;
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed)) return;
    await apiFetch(`/api/workspaces/${workspaceId}/jobs/${jobId}/quantity-check`, {
      method: "POST",
      body: JSON.stringify({ quantity: parsed, roomId })
    });
    await refreshJobs();
    await refreshCustomerSummary();
  }

  function openJobCard(jobId: string) {
    if (!workspaceId) return;
    window.open(`${API_URL}/api/workspaces/${workspaceId}/jobs/${jobId}/jobcard`, "_blank");
  }

  function openJobFile(jobId: string, fileName: string) {
    if (!workspaceId) return;
    window.open(`${API_URL}/api/workspaces/${workspaceId}/jobs/${jobId}/files/${encodeURIComponent(fileName)}`, "_blank");
  }

  function printJobCard(jobId: string) {
    if (!workspaceId) return;
    const url = `${API_URL}/api/workspaces/${workspaceId}/jobs/${jobId}/jobcard`;
    const win = window.open(url, "_blank");
    if (!win) return;
    win.onload = () => {
      win.focus();
      win.print();
    };
  }

  function printJobFile(jobId: string, fileName: string) {
    if (!workspaceId) return;
    const url = `${API_URL}/api/workspaces/${workspaceId}/jobs/${jobId}/files/${encodeURIComponent(fileName)}`;
    const win = window.open(url, "_blank");
    if (!win) return;
    win.onload = () => {
      win.focus();
      win.print();
    };
  }

  async function submitScan() {
    const tokenValue = scanToken.trim();
    const quantityValue = Number(scanQuantity);
    if (!tokenValue || !Number.isFinite(quantityValue)) {
      setScanStatus("Enter a valid token and quantity.");
      return;
    }
    const res = await fetch(`${API_URL}/api/scan/quantity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenValue, quantity: quantityValue })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setScanStatus(err.error ?? "Scan failed");
      return;
    }
    const data = (await res.json()) as { status?: string; jobNumber?: string };
    setScanStatus(`Status: ${data.status ?? "updated"} ${data.jobNumber ?? ""}`);
  }

  async function createCustomer() {
    if (!workspaceId) return;
    const name = newCustomerName.trim();
    if (!name) return;
    const res = await apiFetch(`/api/workspaces/${workspaceId}/customers`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
    if (!res.ok) return;
    setNewCustomerName("");
    await refreshCustomers();
    await refreshCustomerSummary();
  }

  async function createWorker() {
    if (!workspaceId) return;
    const name = newWorkerName.trim();
    if (!name) return;
    const res = await apiFetch(`/api/workspaces/${workspaceId}/workers`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
    if (!res.ok) return;
    setNewWorkerName("");
    await refreshWorkers();
  }

  async function addPayment(customerId: string) {
    if (!workspaceId) return;
    const amountText = window.prompt("Payment amount?");
    if (!amountText) return;
    const amount = Number(amountText);
    if (!Number.isFinite(amount)) return;
    const note = window.prompt("Note (optional)?") ?? undefined;
    const res = await apiFetch(`/api/workspaces/${workspaceId}/customers/${customerId}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount, note })
    });
    if (!res.ok) return;
    await refreshCustomerSummary();
  }

  function addQuotePart() {
    setQuoteParts((parts) => [
      ...parts,
      {
        name: `Part ${parts.length + 1}`,
        lengthMm: 0,
        widthMm: 0,
        thicknessMm: 0,
        material: materials[0]?.name ?? "Mild Steel",
        quantity: 1,
        cutLengthMm: 0,
        pierceCount: 0,
        bendCount: 0,
        unitPrice: 0,
        lineTotal: 0
      }
    ]);
  }

  function updateQuotePart(index: number, next: Partial<QuotePart>) {
    setQuoteParts((parts) =>
      parts.map((part, i) => (i === index ? { ...part, ...next } : part))
    );
  }

  function removeQuotePart(index: number) {
    setQuoteParts((parts) => parts.filter((_part, i) => i !== index));
  }

  function addMaterial() {
    const name = newMaterialName.trim();
    const density = Number(newMaterialDensity);
    if (!name || !Number.isFinite(density) || density <= 0) return;
    setMaterials((list) => {
      if (list.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
        return list;
      }
      return [...list, { name, density, ratePerKg: 0 }];
    });
    setNewMaterialName("");
    setNewMaterialDensity("");
  }

  function addMaterialFromLibrary(material: { name: string; density: number }) {
    setMaterials((list) => {
      if (list.some((item) => item.name.toLowerCase() === material.name.toLowerCase())) {
        return list;
      }
      return [...list, { name: material.name, density: material.density, ratePerKg: 0 }];
    });
  }

  function addThicknessRate() {
    const thicknessMm = Number(newThicknessMm);
    const ratePerKg = Number(newThicknessRate);
    if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) return;
    if (!Number.isFinite(ratePerKg) || ratePerKg <= 0) return;
    setThicknessRates((list) => {
      const existing = list.find((item) => item.thicknessMm === thicknessMm);
      if (existing) {
        return list.map((item) => (item.thicknessMm === thicknessMm ? { thicknessMm, ratePerKg } : item));
      }
      return [...list, { thicknessMm, ratePerKg }].sort((a, b) => a.thicknessMm - b.thicknessMm);
    });
    setNewThicknessMm("");
    setNewThicknessRate("");
  }

  function addQuickPart() {
    const name = quickPartName.trim() || `Part ${quoteParts.length + 1}`;
    const lengthMm = Number(quickPartLength) || 0;
    const widthMm = Number(quickPartWidth) || 0;
    const thicknessMm = Number(quickPartThickness) || 0;
    const quantity = Math.max(1, Number(quickPartQuantity) || 1);
    setQuoteParts((parts) => [
      ...parts,
      {
        name,
        lengthMm,
        widthMm,
        thicknessMm,
        material: quickPartMaterial as QuotePart["material"],
        quantity,
        cutLengthMm: 0,
        pierceCount: 0,
        bendCount: 0,
        unitPrice: 0,
        lineTotal: 0
      }
    ]);
    setQuickPartName("");
    setQuickPartLength("");
    setQuickPartWidth("");
    setQuickPartThickness("");
    setQuickPartQuantity("");
  }

  function addPunchPart() {
    setPunchParts((parts) => [
      ...parts,
      {
        name: `Part ${parts.length + 1}`,
        lengthMm: 0,
        widthMm: 0,
        thicknessMm: 0,
        material: materials[0]?.name ?? "Mild Steel",
        quantity: 1,
        pricePerSqm: 0,
        discountPercent: 0,
        plateType: "tread",
        holeSizeMm: 1
      }
    ]);
  }

  function updatePunchPart(index: number, next: Partial<(typeof punchParts)[number]>) {
    setPunchParts((parts) => parts.map((part, i) => (i === index ? { ...part, ...next } : part)));
  }

  function removePunchPart(index: number) {
    setPunchParts((parts) => parts.filter((_part, i) => i !== index));
  }

  function focusCell(row: number, col: string) {
    const el = document.querySelector(
      `[data-row="${row}"][data-col="${col}"]`
    ) as HTMLInputElement | HTMLSelectElement | null;
    el?.focus();
  }

  function handleCellKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    colIndex: number
  ) {
    const cols = [
      "name",
      "lengthMm",
      "widthMm",
      "thicknessMm",
      "material",
      "quantity",
      "cutLengthMm",
      "pierceCount",
      "bendCount"
    ];
    const isCmd = e.metaKey || e.ctrlKey;
    if (isCmd && e.key.toLowerCase() === "c") {
      e.preventDefault();
      setCopiedPart(calculatedParts[rowIndex]);
      return;
    }
    if (isCmd && e.key.toLowerCase() === "v") {
      e.preventDefault();
      if (copiedPart) {
        updateQuotePart(rowIndex, {
          name: copiedPart.name,
          lengthMm: copiedPart.lengthMm,
          widthMm: copiedPart.widthMm,
          thicknessMm: copiedPart.thicknessMm,
          material: copiedPart.material,
          quantity: copiedPart.quantity,
          cutLengthMm: copiedPart.cutLengthMm,
          pierceCount: copiedPart.pierceCount,
          bendCount: copiedPart.bendCount
        });
      }
      return;
    }

    const move = (nextRow: number, nextColIndex: number) => {
      const col = cols[nextColIndex];
      if (!col) return;
      focusCell(nextRow, col);
    };

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const nextCol = colIndex + 1;
      if (nextCol < cols.length) {
        move(rowIndex, nextCol);
      } else {
        const nextRow = rowIndex + 1;
        if (nextRow >= calculatedParts.length) {
          addQuotePart();
          setTimeout(() => focusCell(nextRow, cols[0]), 0);
        } else {
          move(nextRow, 0);
        }
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      move(rowIndex, Math.min(colIndex + 1, cols.length - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(rowIndex, Math.max(colIndex - 1, 0));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(Math.min(rowIndex + 1, calculatedParts.length - 1), colIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(Math.max(rowIndex - 1, 0), colIndex);
    }
  }

  async function saveQuoteSeed() {
    if (!workspaceId) return;
    const seed = Number(quoteSeed);
    if (!Number.isFinite(seed) || seed <= 0) return;
    const res = await apiFetch(`/api/workspaces/${workspaceId}/quotes/seed`, {
      method: "POST",
      body: JSON.stringify({ seed })
    });
    if (!res.ok) return;
    await refreshQuotes();
  }

  async function createQuote() {
    if (!workspaceId) return;
    if (!quoteTitle.trim()) return;
    const sections = {
      laserCutting: {
        description: quoteLaserCutting.trim(),
        amount: Number(quoteLaserCuttingAmount) || 0,
        parts: calculatedParts,
        vatRate: parsedVatRate,
        totals: { subTotal: laserSubTotal, vat: laserVat, total: laserTotal }
      },
      punching: { description: quotePunching.trim(), amount: Number(quotePunchingAmount) || 0 },
      fabrication: { description: quoteFabrication.trim(), amount: Number(quoteFabricationAmount) || 0 },
      laserWelding: { description: quoteLaserWelding.trim(), amount: Number(quoteLaserWeldingAmount) || 0 },
      tankManufacturing: {
        description: quoteTankManufacturing.trim(),
        amount: Number(quoteTankManufacturingAmount) || 0
      },
      bending: { description: quoteBending.trim(), amount: Number(quoteBendingAmount) || 0 }
    };
    const res = await apiFetch(`/api/workspaces/${workspaceId}/quotes`, {
      method: "POST",
      body: JSON.stringify({
        title: quoteTitle.trim(),
        customerName: quoteCustomer.trim(),
        sections,
        companyName: quoteCompanyName.trim(),
        logoDataUrl: quoteLogoDataUrl
      })
    });
    if (!res.ok) return;
    setQuoteTitle("");
    setQuoteCustomer("");
    setQuoteLaserCutting("");
    setQuoteLaserCuttingAmount("");
    setQuotePunching("");
    setQuotePunchingAmount("");
    setQuoteFabrication("");
    setQuoteFabricationAmount("");
    setQuoteLaserWelding("");
    setQuoteLaserWeldingAmount("");
    setQuoteTankManufacturing("");
    setQuoteTankManufacturingAmount("");
    setQuoteBending("");
    setQuoteBendingAmount("");
    setQuoteParts([]);
    await refreshQuotes();
  }

  function addTankFittingToDescription() {
    const fitting = selectedFitting.trim();
    if (!fitting) return;
    const nextDetail = [selectedFittingGroup, fitting, selectedFittingSize].filter(Boolean).join(" - ");
    setQuoteTankManufacturing((prev) => (prev.trim() ? `${prev.trim()}, ${nextDetail}` : nextDetail));
  }

  function openQuotePdf(quoteId: string) {
    if (!workspaceId) return;
    window.open(`${API_URL}/api/workspaces/${workspaceId}/quotes/${quoteId}/pdf`, "_blank");
  }

  function printQuotePdf(quoteId: string) {
    if (!workspaceId) return;
    const url = `${API_URL}/api/workspaces/${workspaceId}/quotes/${quoteId}/pdf`;
    const win = window.open(url, "_blank");
    if (!win) return;
    win.onload = () => {
      win.focus();
      win.print();
    };
  }

  async function startSubscription() {
    if (!workspaceId) return;
    setBillingBusy(true);
    try {
      const res = await apiFetch(`/api/billing/checkout`, {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          customerEmail: billingEmail,
          successUrl: `${window.location.origin}/?checkout=success`,
          cancelUrl: `${window.location.origin}/?checkout=cancel`
        })
      });
      if (!res.ok) return;
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setBillingBusy(false);
    }
  }

  async function openBillingPortal() {
    if (!workspaceId) return;
    setBillingBusy(true);
    try {
      const res = await apiFetch(`/api/billing/portal`, {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          returnUrl: window.location.origin
        })
      });
      if (!res.ok) return;
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setBillingBusy(false);
    }
  }

  async function startPreloginSubscription() {
    if (!authEmail.trim() || !authPassword) {
      setAuthError("Enter your email and password first, then start payment.");
      return;
    }
    setBillingBusy(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_URL}/api/billing/prelogin-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword,
          customerEmail: authEmail.trim(),
          successUrl: `${window.location.origin}/?checkout=success`,
          cancelUrl: `${window.location.origin}/?checkout=cancel`
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; url?: string } | null;
      if (!res.ok) {
        setAuthError(data?.error ?? "Unable to start payment.");
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } finally {
      setBillingBusy(false);
    }
  }

  async function openPreloginBillingPortal() {
    if (!authEmail.trim() || !authPassword) {
      setAuthError("Enter your email and password first, then open billing.");
      return;
    }
    setBillingBusy(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_URL}/api/billing/prelogin-portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword,
          returnUrl: window.location.origin
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; url?: string } | null;
      if (!res.ok) {
        setAuthError(data?.error ?? "Unable to open billing.");
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } finally {
      setBillingBusy(false);
    }
  }

  async function handleAuth() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const path = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        authMode === "login"
          ? { email: authEmail, password: authPassword }
          : { email: authEmail, password: authPassword, name: authName, workspaceName: authWorkspaceName };
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 402) {
          logout();
          setAuthError("Payment is required before login. Once the subscription is paid, sign in again.");
          return;
        }
        setAuthError(err.error ?? "Authentication failed");
        return;
      }
      const data = (await res.json()) as { token: string; user: UserSummary; workspaces: WorkspaceSummary[] };
      localStorage.setItem("authToken", data.token);
      setToken(data.token);
      setUser(data.user);
      setWorkspaces(data.workspaces);
      setWorkspaceId(data.workspaces[0]?.id ?? null);
    } finally {
      setAuthBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("authToken");
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setWorkspaceId(null);
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    socket.emit("message", { roomId, text: t, user: chatUser });
    setText("");
  }

  function formatPeriodEnd(seconds: number | null) {
    if (!seconds) return "—";
    const date = new Date(seconds * 1000);
    return date.toLocaleDateString();
  }

  const statusLabel = billing.status ?? "not subscribed";
  const workspaceLocked = Boolean(workspaceId) && billing.hasAccess === false;
  const query = jobSearch.trim().toLowerCase();
  const filteredJobs = jobs.filter((job) => {
    if (!query) return true;
    return (
      job.jobNumber.toLowerCase().includes(query) ||
      job.title.toLowerCase().includes(query) ||
      (job.customerName ?? "").toLowerCase().includes(query)
    );
  });
  const jobsOpen = filteredJobs.filter((job) => job.status === "open");
  const jobsInProgress = filteredJobs.filter((job) => job.status === "in_progress");
  const jobsIncomplete = filteredJobs.filter((job) => job.status === "incomplete");
  const jobsDone = filteredJobs.filter((job) => job.status === "done");
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const densityByMaterial = Object.fromEntries(
    materials.map((material) => [material.name, material.density])
  ) as Record<string, number>;
  const rateByMaterial = Object.fromEntries(
    materials.map((material) => [material.name, material.ratePerKg])
  ) as Record<string, number>;
  const parsedVatRate = Number(quoteVatRate) || 0;
  const parsedCostPerPierce = Number(costPerPierce) || 0;
  const parsedCostPerCutMm = Number(costPerCutMm) || 0;
  const parsedCostPerBend = Number(costPerBend) || 0;
  const punchPriceByThickness = Object.fromEntries(
    thicknessRates.map((item) => [item.thicknessMm, item.ratePerKg])
  ) as Record<number, number>;

  const punchCalculatedParts = punchParts.map((part) => {
    const areaSqm = (part.lengthMm * part.widthMm) / 1_000_000;
    const volumeM3 = areaSqm * (part.thicknessMm / 1000);
    const density = densityByMaterial[part.material] ?? 7850;
    const weightKg = volumeM3 * density;
    const thicknessOverride = punchPriceByThickness[part.thicknessMm];
    const pricePerSqm = Number.isFinite(thicknessOverride) ? thicknessOverride : part.pricePerSqm;
    const subTotal = areaSqm * pricePerSqm * part.quantity;
    const discountPercent = Math.min(100, Math.max(0, part.discountPercent || 0));
    const discountValue = (subTotal * discountPercent) / 100;
    const lineTotal = subTotal - discountValue;
    return { ...part, areaSqm, weightKg, lineTotal, subTotal, discountValue };
  });
  const punchPartsWeight = punchCalculatedParts.reduce((sum, part) => sum + part.weightKg * part.quantity, 0);
  const punchPartsTotal = punchCalculatedParts.reduce((sum, part) => sum + part.lineTotal, 0);
  const punchPartsVat = (punchPartsTotal * parsedVatRate) / 100;
  const punchPartsFinal = punchPartsTotal + punchPartsVat;

  const calculatedParts = quoteParts.map((part) => {
    const volumeM3 = (part.lengthMm * part.widthMm * part.thicknessMm) / 1e9;
    const density = densityByMaterial[part.material] ?? 0;
    const weightKg = volumeM3 * density;
    const materialRate = rateByMaterial[part.material] ?? 0;
    const unitPrice =
      weightKg * materialRate +
      part.pierceCount * parsedCostPerPierce +
      part.cutLengthMm * parsedCostPerCutMm +
      part.bendCount * parsedCostPerBend;
    const lineTotal = unitPrice * part.quantity;
    return { ...part, unitPrice, lineTotal, weightKg };
  });

  const laserSubTotal = calculatedParts.reduce((sum, part) => sum + part.lineTotal, 0);
  const laserVat = (laserSubTotal * parsedVatRate) / 100;
  const laserTotal = laserSubTotal + laserVat;

  if (isScanPage) {
    return (
      <div
        style={{
          background: "#0f1115",
          color: "white",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20
        }}
      >
        <div style={{ width: 420, background: "#1e1f22", padding: 24, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Qouterx Scan</h2>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
            Scan a QR or paste the token to complete a job.
          </div>
          <input
            value={scanToken}
            onChange={(e) => setScanToken(e.target.value)}
            placeholder="QR token"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #333",
              background: "#111",
              color: "white",
              marginBottom: 10
            }}
          />
          <input
            value={scanQuantity}
            onChange={(e) => setScanQuantity(e.target.value)}
            placeholder="Quantity checked"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #333",
              background: "#111",
              color: "white",
              marginBottom: 12
            }}
          />
          <button
            onClick={submitScan}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#5865f2",
              color: "white",
              cursor: "pointer"
            }}
          >
            Submit Quantity Check
          </button>
          {scanStatus ? <div style={{ marginTop: 10, fontSize: 12 }}>{scanStatus}</div> : null}
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div
        style={{
          background: "#0f1115",
          color: "white",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20
        }}
      >
        <div style={{ width: 360, background: "#1e1f22", padding: 24, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>{authMode === "login" ? "Sign in" : "Create account"}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
            />
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
            />
            {authMode === "register" ? (
              <>
                <input
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Your name"
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #333",
                    background: "#111",
                    color: "white"
                  }}
                />
                <input
                  value={authWorkspaceName}
                  onChange={(e) => setAuthWorkspaceName(e.target.value)}
                  placeholder="Company name"
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #333",
                    background: "#111",
                    color: "white"
                  }}
                />
              </>
            ) : null}
            {authError ? <div style={{ color: "#f87171", fontSize: 12 }}>{authError}</div> : null}
            <button
              onClick={handleAuth}
              disabled={authBusy}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #444",
                background: "#5865f2",
                color: "white",
                cursor: "pointer"
              }}
            >
              {authMode === "login" ? "Sign in" : "Create account"}
            </button>
            {authMode === "login" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  onClick={() => {
                    void startPreloginSubscription();
                  }}
                  disabled={billingBusy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #3f4f71",
                    background: "#1d4ed8",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Pay Subscription
                </button>
                <button
                  onClick={() => {
                    void openPreloginBillingPortal();
                  }}
                  disabled={billingBusy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #444",
                    background: "#2b2d31",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Manage Billing
                </button>
              </div>
            ) : null}
            <button
              onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #333",
                background: "transparent",
                color: "#9ca3af",
                cursor: "pointer"
              }}
            >
              {authMode === "login" ? "Need an account?" : "Already have an account?"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (workspaceLocked) {
    return (
      <div
        style={{
          background: "#0f1115",
          color: "white",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20
        }}
      >
        <div style={{ width: 420, background: "#1e1f22", padding: 24, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Subscription Required</h2>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 16 }}>
            This workspace unlocks after payment is received and stays active while the subscription renews every 30 days.
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Workspace</div>
          <select
            value={workspaceId ?? ""}
            onChange={(e) => setWorkspaceId(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #333",
              background: "#111",
              color: "white",
              marginBottom: 12
            }}
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            Status: <b style={{ textTransform: "capitalize" }}>{statusLabel}</b>
          </div>
          <div style={{ fontSize: 12, marginBottom: 12 }}>Renewal: {formatPeriodEnd(billing.currentPeriodEnd)}</div>
          <input
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            placeholder="Billing email"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #333",
              background: "#111",
              color: "white",
              marginBottom: 12
            }}
          />
          <div style={{ display: "grid", gap: 8 }}>
            <button
              onClick={startSubscription}
              disabled={billingBusy}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #444",
                background: "#5865f2",
                color: "white",
                cursor: "pointer"
              }}
            >
              Pay And Unlock
            </button>
            <button
              onClick={openBillingPortal}
              disabled={billingBusy}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #444",
                background: "#2b2d31",
                color: "white",
                cursor: "pointer"
              }}
            >
              Manage Billing
            </button>
            <button
              onClick={refreshBilling}
              disabled={billingBusy}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #333",
                background: "transparent",
                color: "#d1d5db",
                cursor: "pointer"
              }}
            >
              Check Payment Status
            </button>
            <button
              onClick={logout}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #333",
                background: "transparent",
                color: "#9ca3af",
                cursor: "pointer"
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#1e1f22", color: "white", height: "100vh", display: "flex" }}>
      <div style={{ width: 80, background: "#111", padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { id: "settings", label: "Settings" },
          { id: "chat", label: "Chat" },
          { id: "jobs", label: "Jobs" },
          { id: "quotes", label: "Quotes" },
          { id: "customers", label: "Cust" },
          { id: "files", label: "Files" },
          { id: "qr", label: "QR" }
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setViewMode(item.id as typeof viewMode)}
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              border: viewMode === item.id ? "2px solid #5865f2" : "1px solid #222",
              background: "#2b2d31",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 11
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {viewMode === "settings" ? (
      <div style={{ width: 320, background: "#2b2d31", padding: 12, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>{activeServer?.name ?? "Qouterx"}</div>
          <button
            onClick={logout}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1f2023",
              color: "white",
              cursor: "pointer",
              fontSize: 12
            }}
          >
            Log out
          </button>
        </div>

        <div style={{ opacity: 0.9, marginBottom: 6 }}>Workspace</div>
        <select
          value={workspaceId ?? ""}
          onChange={(e) => setWorkspaceId(e.target.value)}
          style={{
            padding: 8,
            borderRadius: 6,
            border: "1px solid #3b3d43",
            background: "#232428",
            color: "white",
            marginBottom: 16
          }}
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>

        <div style={{ opacity: 0.9, marginBottom: 16 }}>Workspace Panel</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>
          Channels and settings are in the Settings page.
        </div>

        <div style={{ opacity: 0.9, marginBottom: 8 }}>Roles</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {activeServer?.roles.map((role) => (
            <div key={role.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: role.color ?? "#9ca3af" }} />
              <span style={{ fontSize: 13 }}>{role.name}</span>
            </div>
          ))}
          <button
            onClick={createRole}
            style={{
              textAlign: "left",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px dashed #444",
              background: "transparent",
              color: "#9ca3af",
              cursor: "pointer"
            }}
          >
            + Add Role
          </button>
        </div>

        <div style={{ opacity: 0.9, marginBottom: 8 }}>Files</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {files.slice(0, 6).map((file) => (
            <div key={file.id} style={{ fontSize: 12, opacity: 0.9 }}>
              {file.name}
            </div>
          ))}
          <button
            onClick={createFile}
            style={{
              textAlign: "left",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px dashed #444",
              background: "transparent",
              color: "#9ca3af",
              cursor: "pointer"
            }}
          >
            + Add File
          </button>
        </div>

        <div style={{ opacity: 0.9, marginBottom: 8 }}>Profit & Expenses</div>
        <div style={{ fontSize: 12, marginBottom: 6 }}>Income: {ledger.income.toFixed(2)}</div>
        <div style={{ fontSize: 12, marginBottom: 6 }}>Expense: {ledger.expense.toFixed(2)}</div>
        <div style={{ fontSize: 12, marginBottom: 10 }}>Profit: {ledger.profit.toFixed(2)}</div>
        <button
          onClick={createLedgerEntry}
          style={{
            textAlign: "left",
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px dashed #444",
            background: "transparent",
            color: "#9ca3af",
            cursor: "pointer",
            marginBottom: 16
          }}
        >
          + Add Ledger Entry
        </button>

        <div style={{ opacity: 0.9, marginBottom: 8 }}>Users</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {workspaceUsers.slice(0, 6).map((member) => (
            <div key={member.id} style={{ fontSize: 12 }}>
              {member.name ?? member.email} <span style={{ opacity: 0.6 }}>({member.role})</span>
            </div>
          ))}
        </div>
        <button
          onClick={createWorkspaceUser}
          style={{
            textAlign: "left",
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px dashed #444",
            background: "transparent",
            color: "#9ca3af",
            cursor: "pointer",
            marginBottom: 16
          }}
        >
          + Add User
        </button>

        <div style={{ opacity: 0.9, marginBottom: 8 }}>Local Sync</div>
        <div style={{ fontSize: 12, marginBottom: 6 }}>Last Sync: {syncState.lastSyncAt ?? "—"}</div>
        <div style={{ fontSize: 12, marginBottom: 10 }}>Device: {syncState.lastDeviceId ?? "—"}</div>
        <button
          onClick={syncLocalFiles}
          style={{
            textAlign: "left",
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px dashed #444",
            background: "transparent",
            color: "#9ca3af",
            cursor: "pointer",
            marginBottom: 16
          }}
        >
          Sync Local Files
        </button>

        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Billing (Company)</div>
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          Status: <b style={{ textTransform: "capitalize" }}>{statusLabel}</b>
        </div>
        <div style={{ fontSize: 12, marginBottom: 10 }}>Renewal: {formatPeriodEnd(billing.currentPeriodEnd)}</div>

        <input
          value={billingEmail}
          onChange={(e) => setBillingEmail(e.target.value)}
          placeholder="Billing email"
          style={{
            padding: 8,
            borderRadius: 6,
            border: "1px solid #3b3d43",
            background: "#232428",
            color: "white",
            marginBottom: 8
          }}
        />
        <button
          onClick={startSubscription}
          disabled={billingBusy}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "#5865f2",
            color: "white",
            cursor: "pointer",
            marginBottom: 6
          }}
        >
          Start Subscription
        </button>
        <button
          onClick={openBillingPortal}
          disabled={billingBusy}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "#3b3d43",
            color: "white",
            cursor: "pointer"
          }}
        >
          Manage Billing
        </button>
      </div>
      ) : null}

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {viewMode === "chat"
              ? `# ${roomId}`
              : viewMode === "jobs"
              ? "Job Board"
              : viewMode === "quotes"
              ? "Quotes"
              : viewMode === "customers"
              ? "Customers"
              : viewMode === "files"
              ? "File Organizer"
              : viewMode === "settings"
              ? "Settings"
              : "QR Station"}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                refreshBilling();
                refreshFiles();
                refreshLedger();
                refreshJobs();
                refreshStorage();
                refreshCustomerSummary();
              }}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid #444",
                background: "#232428",
                color: "white",
                cursor: "pointer",
                fontSize: 12
              }}
            >
              Refresh
            </button>
            <button
              onClick={completeJobViaQr}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid #444",
                background: "#2f3136",
                color: "white",
                cursor: "pointer",
                fontSize: 12
              }}
            >
              QR Complete Job
            </button>
          </div>
        </div>

        {viewMode === "settings" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Channels</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {activeServer?.channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setActiveChannelId(channel.id)}
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #2b2d31",
                      background: channel.id === activeChannel?.id ? "#3b3d43" : "transparent",
                      color: "white",
                      cursor: "pointer"
                    }}
                  >
                    # {channel.name}
                  </button>
                ))}
                <button
                  onClick={createChannel}
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px dashed #444",
                    background: "transparent",
                    color: "#9ca3af",
                    cursor: "pointer"
                  }}
                >
                  + Add Channel
                </button>
              </div>
            </div>

            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Roles</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {activeServer?.roles.map((role) => (
                  <div key={role.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: role.color ?? "#9ca3af" }} />
                    <span style={{ fontSize: 13 }}>{role.name}</span>
                  </div>
                ))}
                <button
                  onClick={createRole}
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px dashed #444",
                    background: "transparent",
                    color: "#9ca3af",
                    cursor: "pointer"
                  }}
                >
                  + Add Role
                </button>
              </div>
            </div>
          </div>
        ) : viewMode === "chat" ? (
          <>
            <div style={{ flex: 1, padding: 12, overflow: "auto", display: "flex", flexDirection: "column-reverse" }}>
              {log.map((item, i) => {
                if (typeof item === "string") {
                  return (
                    <div key={i} style={{ opacity: 0.8, marginBottom: 6 }}>
                      {item}
                    </div>
                  );
                }
                return (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <b>{item.user}:</b> {item.text}
                  </div>
                );
              })}
            </div>

            <div style={{ padding: 12, borderTop: "1px solid #333", display: "flex", gap: 8 }}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
                placeholder={`Message #${roomId}`}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #444",
                  background: "#313338",
                  color: "white",
                  outline: "none"
                }}
              />
              <button
                onClick={send}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #444",
                  background: "#5865f2",
                  color: "white",
                  cursor: "pointer"
                }}
              >
                Send
              </button>
            </div>
          </>
        ) : viewMode === "jobs" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Create Job</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Job title"
                    style={{
                      gridColumn: "span 2",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <select
                    value={jobCustomer}
                    onChange={(e) => setJobCustomer(e.target.value)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.name}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={jobAssignedTo}
                    onChange={(e) => setJobAssignedTo(e.target.value)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  >
                    <option value="">Select employee</option>
                    {workers.map((worker) => (
                      <option key={worker.id} value={worker.name}>
                        {worker.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={jobQuantity}
                    onChange={(e) => setJobQuantity(e.target.value)}
                    placeholder="Quantity"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <select
                    value={selectedQuote}
                    onChange={(e) => setSelectedQuote(e.target.value)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  >
                    <option value="">Select quote</option>
                    {quotes.slice(0, 20).map((quote) => (
                      <option key={quote.id} value={quote.quoteNumber}>
                        {quote.quoteNumber} · {quote.title}
                      </option>
                    ))}
                  </select>
                  <input
                    value={jobPrice}
                    onChange={(e) => setJobPrice(e.target.value)}
                    placeholder="Price"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <input
                    value={jobCost}
                    onChange={(e) => setJobCost(e.target.value)}
                    placeholder="Cost"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setJobFiles(e.target.files)}
                    style={{ gridColumn: "span 2" }}
                  />
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files) setJobFiles(e.dataTransfer.files);
                    }}
                    style={{
                      gridColumn: "span 2",
                      border: "1px dashed #444",
                      borderRadius: 8,
                      padding: 12,
                      textAlign: "center",
                      color: "#9ca3af"
                    }}
                  >
                    Drag & drop files here {jobFiles?.length ? `(${jobFiles.length} selected)` : ""}
                  </div>
                </div>
                <button
                  onClick={createJob}
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #444",
                    background: "#5865f2",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Create Job
                </button>
              </div>

              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Search</div>
                <input
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                  placeholder="Search by job number, title, customer"
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #333",
                    background: "#111",
                    color: "white"
                  }}
                />
                <div style={{ fontSize: 12, marginTop: 10, opacity: 0.7 }}>
                  Showing {filteredJobs.length} of {jobs.length} jobs
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[{ title: "Open", data: jobsOpen, color: "#22c55e" },
                { title: "In Progress", data: jobsInProgress, color: "#38bdf8" },
                { title: "Incomplete", data: jobsIncomplete, color: "#f97316" },
                { title: "Done", data: jobsDone, color: "#a3e635" }].map((column) => (
                <div key={column.title} style={{ background: "#232428", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: column.color }}>
                    {column.title} ({column.data.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {column.data.map((job) => (
                      <div key={job.id} style={{ padding: 12, borderRadius: 10, background: "#1b1c1f" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <div>
                            <b>{job.jobNumber}</b>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>{job.status}</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>{job.title}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {job.customerName ?? "No customer"} · {job.assignedTo ?? "Unassigned"}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Qty {job.quantityExpected ?? "-"}</div>
                        {job.repeatCount && job.repeatCount > 1 ? (
                          <div style={{ fontSize: 12, color: "#fbbf24" }}>
                            Repeat x{job.repeatCount} · Last charge {job.lastRepeatPrice ?? "-"}
                          </div>
                        ) : null}
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => setSelectedJobId(job.id)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #444",
                              background: "#1f2023",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => printJobCard(job.id)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #444",
                              background: "#5865f2",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Print Card
                          </button>
                          <button
                            onClick={() => openJobCard(job.id)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #444",
                              background: "#232428",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Job Card
                          </button>
                          <button
                            onClick={() => runQuantityCheck(job.id, job.quantityExpected)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #444",
                              background: "#2f3136",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Quantity
                          </button>
                          <button
                            onClick={() => markJobDone(job.id)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #444",
                              background: "#16a34a",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              </div>
              <div style={{ background: "#232428", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700 }}>Job Card Preview</div>
                  {selectedJob ? (
                    <button
                      onClick={() => printJobCard(selectedJob.id)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid #444",
                        background: "#5865f2",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 12
                      }}
                    >
                      Print Card
                    </button>
                  ) : null}
                </div>
                {selectedJob ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedJob.jobNumber}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{selectedJob.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Customer: {selectedJob.customerName ?? "-"}
                    </div>
                    {selectedJob.quoteNumber ? (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Quote: {selectedJob.quoteNumber}</div>
                    ) : null}
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Assigned: {selectedJob.assignedTo ?? "-"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Quantity: {selectedJob.quantityExpected ?? "-"}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <QRCodeCanvas
                        value={`${APP_URL}/scan?token=${selectedJob.qrToken}`}
                        size={140}
                        bgColor="#ffffff"
                        fgColor="#111827"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => openJobCard(selectedJob.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid #444",
                          background: "#2f3136",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        Open Job Card
                      </button>
                      <button
                        onClick={() => printJobCard(selectedJob.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid #444",
                          background: "#5865f2",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        Print Job Card
                      </button>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Files</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(selectedJob.fileLinks ?? []).map((file) => (
                        <div
                          key={file.fileName}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                        >
                          <div style={{ fontSize: 12 }}>{file.fileName}</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => openJobFile(selectedJob.id, file.fileName)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "1px solid #444",
                                background: "#2f3136",
                                color: "white",
                                cursor: "pointer",
                                fontSize: 12
                              }}
                            >
                              Open
                            </button>
                            <button
                              onClick={() => printJobFile(selectedJob.id, file.fileName)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "1px solid #444",
                                background: "#16a34a",
                                color: "white",
                                cursor: "pointer",
                                fontSize: 12
                              }}
                            >
                              Print
                            </button>
                          </div>
                        </div>
                      ))}
                      {(!selectedJob.fileLinks || selectedJob.fileLinks.length === 0) && (
                        <div style={{ fontSize: 12, opacity: 0.6 }}>No files added.</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.6 }}>Select a job to preview.</div>
                )}
              </div>
            </div>
          </div>
        ) : viewMode === "quotes" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Quote Settings</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                  Set the starting quote number once (e.g. 1001). It will auto-increment.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={quoteSeed}
                    onChange={(e) => setQuoteSeed(e.target.value)}
                    placeholder="Start number"
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <button
                    onClick={saveQuoteSeed}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: "#5865f2",
                      color: "white",
                      cursor: "pointer"
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>

              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Create Quote</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input
                    value={quoteTitle}
                    onChange={(e) => setQuoteTitle(e.target.value)}
                    placeholder="Quote title"
                    style={{
                      gridColumn: "span 2",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <input
                    value={quoteCustomer}
                    onChange={(e) => setQuoteCustomer(e.target.value)}
                    placeholder="Customer name"
                    style={{
                      gridColumn: "span 2",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <input
                    value={quoteCompanyName}
                    onChange={(e) => setQuoteCompanyName(e.target.value)}
                    placeholder="Company name"
                    style={{
                      gridColumn: "span 2",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setQuoteLogoDataUrl(String(reader.result));
                      };
                      reader.readAsDataURL(file);
                    }}
                    style={{ gridColumn: "span 2" }}
                  />
                </div>
              </div>
            </div>

            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Laser Quote Calculator</div>
              <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Pricing Inputs</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>VAT %</div>
                    <input
                      value={quoteVatRate}
                      onChange={(e) => setQuoteVatRate(e.target.value)}
                      placeholder="VAT %"
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Cost per pierce</div>
                    <input
                      value={costPerPierce}
                      onChange={(e) => setCostPerPierce(e.target.value)}
                      placeholder="Cost per pierce"
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Cost per cut mm</div>
                    <input
                      value={costPerCutMm}
                      onChange={(e) => setCostPerCutMm(e.target.value)}
                      placeholder="Cost per cut mm"
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Cost per bend</div>
                    <input
                      value={costPerBend}
                      onChange={(e) => setCostPerBend(e.target.value)}
                      placeholder="Cost per bend"
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginBottom: 16 }}>
                <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Active Materials (Price + Density)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 28px", gap: 6, fontSize: 11 }}>
                    <div>Name</div>
                    <div>Density</div>
                    <div>R/kg</div>
                    <div></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {materials.map((material, index) => (
                      <div
                        key={`${material.name}-${index}`}
                        style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 28px", gap: 6 }}
                      >
                        <div style={{ fontSize: 11 }}>{material.name}</div>
                        <div style={{ fontSize: 11 }}>{material.density}</div>
                        <input
                          value={material.ratePerKg}
                          onChange={(e) => {
                            const next = Number(e.target.value) || 0;
                            setMaterials((list) =>
                              list.map((item, i) => (i === index ? { ...item, ratePerKg: next } : item))
                            );
                          }}
                          style={{
                            padding: 6,
                            borderRadius: 6,
                            border: "1px solid #333",
                            background: "#111",
                            color: "white"
                          }}
                        />
                        <button
                          onClick={() => setMaterials((list) => list.filter((_item, i) => i !== index))}
                          style={{
                            borderRadius: 6,
                            border: "1px solid #333",
                            background: "#111",
                            color: "white",
                            cursor: "pointer"
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {materials.length === 0 && (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Add materials from the library.</div>
                    )}
                  </div>
                </div>

                <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Material Library</div>
                  <input
                    value={materialSearch}
                    onChange={(e) => setMaterialSearch(e.target.value)}
                    placeholder="Search materials"
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white",
                      marginBottom: 8
                    }}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 60px", gap: 6, fontSize: 11 }}>
                    <div>Name</div>
                    <div>Density</div>
                    <div></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, maxHeight: 180, overflow: "auto" }}>
                    {MASTER_MATERIALS.filter((material) =>
                      material.name.toLowerCase().includes(materialSearch.toLowerCase())
                    ).map((material) => (
                      <div
                        key={material.name}
                        style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 60px", gap: 6 }}
                      >
                        <div style={{ fontSize: 11 }}>{material.name}</div>
                        <div style={{ fontSize: 11 }}>{material.density}</div>
                        <button
                          onClick={() => addMaterialFromLibrary(material)}
                          style={{
                            padding: "4px 6px",
                            borderRadius: 6,
                            border: "1px solid #444",
                            background: "#2b2d31",
                            color: "white",
                            cursor: "pointer"
                          }}
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12, borderTop: "1px solid #2a2b2f", paddingTop: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Add Custom Material</div>
                    <input
                      value={newMaterialName}
                      onChange={(e) => setNewMaterialName(e.target.value)}
                      placeholder="Material name"
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 8,
                        border: "1px solid #333",
                        background: "#111",
                        color: "white",
                        marginBottom: 8
                      }}
                    />
                    <input
                      value={newMaterialDensity}
                      onChange={(e) => setNewMaterialDensity(e.target.value)}
                      placeholder="Density kg/m³"
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 8,
                        border: "1px solid #333",
                        background: "#111",
                        color: "white",
                        marginBottom: 8
                      }}
                    />
                    <button
                      onClick={addMaterial}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #444",
                        background: "#5865f2",
                        color: "white",
                        cursor: "pointer"
                      }}
                    >
                      Add Material
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Quick Add Part (Length, Breadth, Qty)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  <input
                    value={quickPartName}
                    onChange={(e) => setQuickPartName(e.target.value)}
                    placeholder="Part name"
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <input
                    value={quickPartLength}
                    onChange={(e) => setQuickPartLength(e.target.value)}
                    placeholder="Length (mm)"
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <input
                    value={quickPartWidth}
                    onChange={(e) => setQuickPartWidth(e.target.value)}
                    placeholder="Breadth (mm)"
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <input
                    value={quickPartThickness}
                    onChange={(e) => setQuickPartThickness(e.target.value)}
                    placeholder="Thickness (mm)"
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <input
                    value={quickPartQuantity}
                    onChange={(e) => setQuickPartQuantity(e.target.value)}
                    placeholder="Quantity"
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <select
                    value={quickPartMaterial}
                    onChange={(e) => setQuickPartMaterial(e.target.value)}
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  >
                    {materials.map((material) => (
                      <option key={material.name} value={material.name}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addQuickPart}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: "#16a34a",
                      color: "white",
                      cursor: "pointer"
                    }}
                  >
                    Add Part
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                Laser Cutting Parts (mm). Materials: steel / stainless / aluminium.
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 860 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(140px, 1.4fr) repeat(10, minmax(70px, 1fr))",
                      gap: 8,
                      fontSize: 11
                    }}
                  >
                    <div style={{ textAlign: "left" }}>Part</div>
                    <div style={{ textAlign: "center" }}>L</div>
                    <div style={{ textAlign: "center" }}>W</div>
                    <div style={{ textAlign: "center" }}>T</div>
                    <div style={{ textAlign: "center" }}>Mat</div>
                    <div style={{ textAlign: "center" }}>Qty</div>
                    <div style={{ textAlign: "center" }}>Cut mm</div>
                    <div style={{ textAlign: "center" }}>Pierce</div>
                    <div style={{ textAlign: "center" }}>Bends</div>
                    <div style={{ textAlign: "center" }}>kg</div>
                    <div style={{ textAlign: "center" }}>Price</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                    {calculatedParts.map((part, index) => (
                      <div
                        key={`${part.name}-${index}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(140px, 1.4fr) repeat(10, minmax(70px, 1fr))",
                          gap: 8,
                          alignItems: "center"
                        }}
                      >
                    <input
                      value={part.name}
                      onChange={(e) => updateQuotePart(index, { name: e.target.value })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, 0)}
                      data-row={index}
                      data-col="name"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                    <input
                      value={part.lengthMm}
                      onChange={(e) => updateQuotePart(index, { lengthMm: Number(e.target.value) || 0 })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, 1)}
                      data-row={index}
                      data-col="lengthMm"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                    <input
                      value={part.widthMm}
                      onChange={(e) => updateQuotePart(index, { widthMm: Number(e.target.value) || 0 })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, 2)}
                      data-row={index}
                      data-col="widthMm"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                    <input
                      value={part.thicknessMm}
                      onChange={(e) => updateQuotePart(index, { thicknessMm: Number(e.target.value) || 0 })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, 3)}
                      data-row={index}
                      data-col="thicknessMm"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                    <select
                      value={part.material}
                      onChange={(e) => updateQuotePart(index, { material: e.target.value as QuotePart["material"] })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, 4)}
                      data-row={index}
                      data-col="material"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                    >
                      {materials.map((material) => (
                        <option key={material.name} value={material.name}>
                          {material.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={part.quantity}
                      onChange={(e) => updateQuotePart(index, { quantity: Number(e.target.value) || 0 })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, 5)}
                      data-row={index}
                      data-col="quantity"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                    <input
                      value={part.cutLengthMm}
                      onChange={(e) => updateQuotePart(index, { cutLengthMm: Number(e.target.value) || 0 })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, 6)}
                      data-row={index}
                      data-col="cutLengthMm"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                    <input
                      value={part.pierceCount}
                      onChange={(e) => updateQuotePart(index, { pierceCount: Number(e.target.value) || 0 })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, 7)}
                      data-row={index}
                      data-col="pierceCount"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                    <input
                      value={part.bendCount}
                      onChange={(e) => updateQuotePart(index, { bendCount: Number(e.target.value) || 0 })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, 8)}
                      data-row={index}
                      data-col="bendCount"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                    />
                    <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {part.weightKg?.toFixed(2) ?? "0.00"}
                    </div>
                    <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {part.lineTotal.toFixed(2)}
                    </div>
                    <button
                      onClick={() => removeQuotePart(index)}
                      style={{
                        gridColumn: "span 11",
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px dashed #444",
                        background: "transparent",
                        color: "#9ca3af",
                        cursor: "pointer"
                      }}
                    >
                      Remove Part
                    </button>
                      </div>
                    ))}
                    <button
                      onClick={addQuotePart}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px dashed #444",
                        background: "transparent",
                        color: "#9ca3af",
                        cursor: "pointer"
                      }}
                    >
                      + Add Part
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr", gap: 16, marginTop: 16, alignItems: "start" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
                  <input
                    value={quoteLaserCutting}
                    onChange={(e) => setQuoteLaserCutting(e.target.value)}
                    placeholder="Laser cutting details"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={quoteLaserCuttingAmount}
                  onChange={(e) => setQuoteLaserCuttingAmount(e.target.value)}
                  placeholder="Amount"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={quotePunching}
                  onChange={(e) => setQuotePunching(e.target.value)}
                  placeholder="Punching details"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={quotePunchingAmount}
                  onChange={(e) => setQuotePunchingAmount(e.target.value)}
                  placeholder="Amount"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={quoteFabrication}
                  onChange={(e) => setQuoteFabrication(e.target.value)}
                  placeholder="Fabrication details"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={quoteFabricationAmount}
                  onChange={(e) => setQuoteFabricationAmount(e.target.value)}
                  placeholder="Amount"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={quoteLaserWelding}
                  onChange={(e) => setQuoteLaserWelding(e.target.value)}
                  placeholder="Laser welding details"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={quoteLaserWeldingAmount}
                  onChange={(e) => setQuoteLaserWeldingAmount(e.target.value)}
                  placeholder="Amount"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 6 }}>
                    <select
                      value={selectedFittingGroup}
                      onChange={(e) => {
                        const group = e.target.value;
                        const firstFitting =
                          SANITARY_FITTING_GROUPS.find((entry) => entry.group === group)?.fittings[0] ?? "";
                        setSelectedFittingGroup(group);
                        setSelectedFitting(firstFitting);
                      }}
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                    >
                      {SANITARY_FITTING_GROUPS.map((entry) => (
                        <option key={entry.group} value={entry.group}>
                          {entry.group}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedFitting}
                      onChange={(e) => setSelectedFitting(e.target.value)}
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                    >
                      {fittingsForSelectedGroup.map((fitting) => (
                        <option key={fitting} value={fitting}>
                          {fitting}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedFittingSize}
                      onChange={(e) => setSelectedFittingSize(e.target.value)}
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                    >
                      <option value="">Size (optional)</option>
                      {SANITARY_STANDARD_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={addTankFittingToDescription}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #444",
                        background: "#2b2d31",
                        color: "white",
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      Add Fitting
                    </button>
                  </div>
                  <input
                    value={quoteTankManufacturing}
                    onChange={(e) => setQuoteTankManufacturing(e.target.value)}
                    placeholder="Tank manufacturing details"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                </div>
                <input
                  value={quoteTankManufacturingAmount}
                  onChange={(e) => setQuoteTankManufacturingAmount(e.target.value)}
                  placeholder="Amount"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={quoteBending}
                  onChange={(e) => setQuoteBending(e.target.value)}
                  placeholder="Bending details"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={quoteBendingAmount}
                  onChange={(e) => setQuoteBendingAmount(e.target.value)}
                  placeholder="Amount"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                </div>
                <div
                  style={{
                    background: "#1b1c1f",
                    borderRadius: 10,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Totals</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Sub total: {laserSubTotal.toFixed(2)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>VAT: {laserVat.toFixed(2)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Total: {laserTotal.toFixed(2)}</div>
                </div>
              </div>
              <button
                onClick={createQuote}
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #444",
                  background: "#16a34a",
                  color: "white",
                  cursor: "pointer"
                }}
              >
                Create Quote
              </button>
            </div>

            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Punching Calculator</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 12, marginBottom: 6 }}>
                Punching Parts (mm). Uses price per m² (with thickness override if set).
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 760 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(140px, 1.4fr) repeat(12, minmax(70px, 1fr))",
                      gap: 8,
                      fontSize: 11
                    }}
                  >
                    <div style={{ textAlign: "left" }}>Part</div>
                    <div style={{ textAlign: "center" }}>L</div>
                    <div style={{ textAlign: "center" }}>W</div>
                    <div style={{ textAlign: "center" }}>T</div>
                    <div style={{ textAlign: "center" }}>Mat</div>
                    <div style={{ textAlign: "center" }}>Type</div>
                    <div style={{ textAlign: "center" }}>Hole</div>
                    <div style={{ textAlign: "center" }}>R/m²</div>
                    <div style={{ textAlign: "center" }}>Qty</div>
                    <div style={{ textAlign: "center" }}>Disc %</div>
                    <div style={{ textAlign: "center" }}>m²</div>
                    <div style={{ textAlign: "center" }}>kg</div>
                    <div style={{ textAlign: "center" }}>Price</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                    {punchCalculatedParts.map((part, index) => (
                      <div
                        key={`${part.name}-${index}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(140px, 1.4fr) repeat(12, minmax(70px, 1fr))",
                          gap: 8,
                          alignItems: "center"
                        }}
                      >
                        <input
                          value={part.name}
                          onChange={(e) => updatePunchPart(index, { name: e.target.value })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.lengthMm}
                          onChange={(e) => updatePunchPart(index, { lengthMm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.widthMm}
                          onChange={(e) => updatePunchPart(index, { widthMm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        {thicknessRates.length > 0 ? (
                          <select
                            value={part.thicknessMm}
                            onChange={(e) => updatePunchPart(index, { thicknessMm: Number(e.target.value) || 0 })}
                            style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                          >
                            <option value={0}>Thickness</option>
                            {thicknessRates.map((rate) => (
                              <option key={rate.thicknessMm} value={rate.thicknessMm}>
                                {rate.thicknessMm}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={part.thicknessMm}
                            onChange={(e) => updatePunchPart(index, { thicknessMm: Number(e.target.value) || 0 })}
                            placeholder="Thickness"
                            style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                          />
                        )}
                        <select
                          value={part.material}
                          onChange={(e) => updatePunchPart(index, { material: e.target.value })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        >
                          {materials.map((material) => (
                            <option key={material.name} value={material.name}>
                              {material.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={part.plateType}
                          onChange={(e) => updatePunchPart(index, { plateType: e.target.value as "tread" | "perforation" })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        >
                          <option value="tread">Tread</option>
                          <option value="perforation">Perforation</option>
                        </select>
                        <select
                          value={part.holeSizeMm}
                          onChange={(e) => updatePunchPart(index, { holeSizeMm: Number(e.target.value) || 1 })}
                          disabled={part.plateType !== "perforation"}
                          style={{
                            padding: 6,
                            borderRadius: 6,
                            border: "1px solid #333",
                            background: part.plateType === "perforation" ? "#111" : "#1f2126",
                            color: "white"
                          }}
                        >
                          {Array.from({ length: 10 }, (_val, idx) => idx + 1).map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                        <input
                          value={part.pricePerSqm}
                          onChange={(e) => updatePunchPart(index, { pricePerSqm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.quantity}
                          onChange={(e) => updatePunchPart(index, { quantity: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.discountPercent}
                          onChange={(e) => updatePunchPart(index, { discountPercent: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {part.areaSqm.toFixed(3)}
                        </div>
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {part.weightKg.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {part.lineTotal.toFixed(2)}
                        </div>
                        <button
                          onClick={() => removePunchPart(index)}
                          style={{
                            gridColumn: "span 13",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px dashed #444",
                            background: "transparent",
                            color: "#9ca3af",
                            cursor: "pointer"
                          }}
                        >
                          Remove Part
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addPunchPart}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px dashed #444",
                        background: "transparent",
                        color: "#9ca3af",
                        cursor: "pointer"
                      }}
                    >
                      + Add Part
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr", gap: 16, marginTop: 16 }}>
                <div />
                <div
                  style={{
                    background: "#1b1c1f",
                    borderRadius: 10,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Punching Totals</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Sub total: {punchPartsTotal.toFixed(2)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>VAT: {punchPartsVat.toFixed(2)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total: {punchPartsFinal.toFixed(2)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total weight: {punchPartsWeight.toFixed(2)} kg</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginTop: 12 }}>
                <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Thickness Pricing (per m²)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px", gap: 6, fontSize: 11 }}>
                    <div>Thickness (mm)</div>
                    <div>Price / m²</div>
                    <div></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {thicknessRates.map((rate) => (
                      <div
                        key={rate.thicknessMm}
                        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px", gap: 6, alignItems: "center" }}
                      >
                        <div style={{ fontSize: 12 }}>{rate.thicknessMm}</div>
                        <input
                          value={rate.ratePerKg}
                          onChange={(e) => {
                            const next = Number(e.target.value) || 0;
                            setThicknessRates((list) =>
                              list.map((item) =>
                                item.thicknessMm === rate.thicknessMm ? { ...item, ratePerKg: next } : item
                              )
                            );
                          }}
                          style={{
                            padding: 6,
                            borderRadius: 6,
                            border: "1px solid #333",
                            background: "#111",
                            color: "white"
                          }}
                        />
                        <button
                          onClick={() =>
                            setThicknessRates((list) => list.filter((item) => item.thicknessMm !== rate.thicknessMm))
                          }
                          style={{
                            padding: "4px 6px",
                            borderRadius: 6,
                            border: "1px solid #444",
                            background: "#2b2d31",
                            color: "white",
                            cursor: "pointer"
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {thicknessRates.length === 0 && (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Add thickness pricing overrides below.</div>
                    )}
                  </div>
                </div>

                <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Add Thickness Price</div>
                  <input
                    value={newThicknessMm}
                    onChange={(e) => setNewThicknessMm(e.target.value)}
                    placeholder="Thickness (mm)"
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white",
                      marginBottom: 8
                    }}
                  />
                  <input
                    value={newThicknessRate}
                    onChange={(e) => setNewThicknessRate(e.target.value)}
                    placeholder="Price per m²"
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white",
                      marginBottom: 8
                    }}
                  />
                  <button
                    onClick={addThicknessRate}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: "#5865f2",
                      color: "white",
                      cursor: "pointer"
                    }}
                  >
                    Add Thickness
                  </button>
                </div>
              </div>
            </div>

            <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Recent Quotes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {quotes.slice(0, 10).map((quote) => (
                  <div key={quote.id} style={{ background: "#1b1c1f", padding: 10, borderRadius: 8 }}>
                    <div style={{ fontWeight: 700 }}>{quote.quoteNumber}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{quote.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {quote.customerName ?? "-"} · Total {quote.total?.toFixed(2) ?? "0.00"}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => openQuotePdf(quote.id)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid #444",
                          background: "#2f3136",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        Open PDF
                      </button>
                      <button
                        onClick={() => printQuotePdf(quote.id)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid #444",
                          background: "#5865f2",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        Print PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : viewMode === "qr" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>QR Quantity Check</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Scan or enter a job ID, then confirm quantity to complete.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {jobs.map((job) => (
                <div key={job.id} style={{ background: "#1b1c1f", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>{job.jobNumber}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{job.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{job.customerName ?? "No customer"}</div>
                  <div style={{ margin: "12px 0" }}>
                    <QRCodeCanvas
                      value={`${APP_URL}/scan?token=${job.qrToken}`}
                      size={120}
                      bgColor="#ffffff"
                      fgColor="#111827"
                    />
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>QR Token: {job.qrToken}</div>
                  <button
                    onClick={() => runQuantityCheck(job.id, job.quantityExpected)}
                    style={{
                      marginTop: 8,
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #444",
                      background: "#5865f2",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 12
                    }}
                  >
                    Check Quantity
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : viewMode === "files" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>File Organizer</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Root: {storageOverview?.jobnestRoot ?? "Detecting OneDrive..."}
              </div>
              <button
                onClick={refreshStorage}
                style={{
                  marginTop: 10,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #444",
                  background: "#232428",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 12
                }}
              >
                Refresh Folders
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div style={{ background: "#1b1c1f", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Customers</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                  {storageOverview?.customersRoot ?? "-"}
                </div>
                {storageOverview?.customers.map((entry) => (
                  <div key={entry.path} style={{ fontSize: 12, marginBottom: 4 }}>
                    {entry.name}
                  </div>
                ))}
              </div>
              <div style={{ background: "#1b1c1f", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Active Jobs</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                  {storageOverview?.jobsActiveRoot ?? "-"}
                </div>
                {storageOverview?.jobsActive.map((entry) => (
                  <div key={entry.path} style={{ fontSize: 12, marginBottom: 4 }}>
                    {entry.name}
                  </div>
                ))}
              </div>
              <div style={{ background: "#1b1c1f", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Completed Jobs</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                  {storageOverview?.jobsCompletedRoot ?? "-"}
                </div>
                {storageOverview?.jobsCompleted.map((entry) => (
                  <div key={entry.path} style={{ fontSize: 12, marginBottom: 4 }}>
                    {entry.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Add Customer</div>
                <input
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Customer name"
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #333",
                    background: "#111",
                    color: "white",
                    marginBottom: 10
                  }}
                />
                <button
                  onClick={createCustomer}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #444",
                    background: "#5865f2",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Add Customer
                </button>
              </div>

              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Add Employee</div>
                <input
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                  placeholder="Employee name"
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #333",
                    background: "#111",
                    color: "white",
                    marginBottom: 10
                  }}
                />
                <button
                  onClick={createWorker}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #444",
                    background: "#16a34a",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Add Employee
                </button>
              </div>
            </div>

            <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Customer Accounts</div>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr", gap: 8, fontSize: 12 }}>
                <div style={{ opacity: 0.6 }}>Customer</div>
                <div style={{ opacity: 0.6 }}>Jobs</div>
                <div style={{ opacity: 0.6 }}>Billed</div>
                <div style={{ opacity: 0.6 }}>Paid</div>
                <div style={{ opacity: 0.6 }}>Balance</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {customerSummaries.map((customer) => (
                  <div
                    key={customer.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr auto",
                      gap: 8,
                      background: "#1b1c1f",
                      padding: 10,
                      borderRadius: 8,
                      alignItems: "center"
                    }}
                  >
                    <div>{customer.name}</div>
                    <div>{customer.jobCount}</div>
                    <div>{customer.billed.toFixed(2)}</div>
                    <div>{customer.paid.toFixed(2)}</div>
                    <div style={{ color: customer.balance > 0 ? "#f97316" : "#22c55e" }}>
                      {customer.balance.toFixed(2)}
                    </div>
                    <button
                      onClick={() => addPayment(customer.id)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid #444",
                        background: "#2f3136",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 12
                      }}
                    >
                      Add Payment
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
