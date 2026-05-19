import fs from "node:fs";
import path from "node:path";

export type WorkspaceRecord = {
  id: string;
  name: string;
  ownerUserId?: string;
  accessControl?: {
    activationCodes?: Array<{
      code: string;
      allowedFeatures: string[];
      createdAt: string;
      createdByUserId: string;
      usedAt?: string;
      usedByUserId?: string;
      usedByDeviceId?: string;
    }>;
    deviceAccess?: Array<{
      deviceId: string;
      allowedFeatures: string[];
      updatedAt: string;
      assignedByUserId: string;
      sourceCode?: string;
    }>;
  };
  companyProfile?: {
    name?: string;
    logoDataUrl?: string;
    accentColor?: string;
    email?: string;
    phone?: string;
    address?: string;
    vatNumber?: string;
    registrationNumber?: string;
  };
  emailSettings?: {
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
    imapUser?: string;
    imapPass?: string;
    fromName?: string;
    fromEmail?: string;
    autoNotifyJobDone?: boolean;
  };
  servers: ServerRecord[];
  jobs: JobRecord[];
  quotes: QuoteRecord[];
  quoteSeed?: number;
  customers: CustomerRecord[];
  workers: WorkerRecord[];
  files: FileRecord[];
  ledger: LedgerEntry[];
  syncState: SyncState;
  supportMessages?: SupportMessageRecord[];
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: number | null;
  manualBillingPaidUntil?: number | null;
  lastBillingPaymentAt?: string;
};

export type SupportMessageRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  text: string;
  fromOwner: boolean;
  createdAt: string;
};

export type UserRecord = {
  id: string;
  email: string;
  name?: string;
  accountRef?: string;
  manualAccountPaidUntil?: number | null;
  ownerLocked?: boolean;
  passwordHash?: string;
  provider: "local" | "google";
  createdAt: string;
};

export type SessionRecord = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt?: string;
};

export type MembershipRecord = {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "member";
};

export type RoleRecord = {
  id: string;
  name: string;
  color?: string;
};

export type ChannelRecord = {
  id: string;
  name: string;
};

export type ServerRecord = {
  id: string;
  name: string;
  channels: ChannelRecord[];
  roles: RoleRecord[];
};

export type JobRecord = {
  id: string;
  jobNumber: string;
  qrToken: string;
  title: string;
  status: "open" | "in_progress" | "incomplete" | "done";
  customerName?: string;
  quoteNumber?: string;
  customerFolder?: string;
  jobFolder?: string;
  assignedTo?: string;
  price?: number;
  cost?: number;
  quantityExpected?: number;
  quantityChecked?: number;
  checkedBy?: string;
  checkedAt?: string;
  repeatCount?: number;
  repeatOfJobId?: string;
  lastRepeatPrice?: number;
  shortageNotePath?: string;
  lastFileActivityAtMs?: number;
  lastFileOpenedAt?: string;
  fileLinks?: Array<{
    fileName: string;
    originalPath: string;
    linkPath: string;
  }>;
  jobDxfParts?: Array<{
    id: string;
    name: string;
    partCode?: string;
    partDnaId?: number;
    geometryHash?: string;
    softHash?: string;
    layer: string;
    material?: string;
    thicknessMm?: number;
    quantity: number;
    widthMm: number;
    heightMm: number;
    cutLengthMm: number;
    pierceCount: number;
    segmentCount: number;
    thumbnailDataUrl?: string;
    printDataUrl?: string;
  }>;
  jobCardPath?: string;
  createdAt: string;
};

export type QuoteRecord = {
  id: string;
  quoteNumber: string;
  title: string;
  status: "draft" | "sent" | "accepted" | "rejected";
  customerName?: string;
  companyName?: string;
  logoDataUrl?: string;
  companyDetails?: {
    email?: string;
    phone?: string;
    address?: string;
    vatNumber?: string;
    registrationNumber?: string;
    accentColor?: string;
  };
  customerDetails?: {
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  sections: QuoteSections;
  total?: number;
  quotePdfPath?: string;
  invoicePdfPath?: string;
  quoteDxfPath?: string;
  createdAt: string;
};

export type QuotePart = {
  name: string;
  partCode?: string;
  partDnaId?: number;
  geometryHash?: string;
  softHash?: string;
  dxfName?: string;
  thumbnailDataUrl?: string;
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
};

export type QuoteSection = {
  description?: string;
  amount?: number;
  parts?: QuotePart[];
  vatRate?: number;
  totals?: {
    subTotal: number;
    vat: number;
    total: number;
  };
};

export type QuoteSections = {
  laserCutting: QuoteSection;
  punching: QuoteSection;
  fabrication: QuoteSection;
  laserWelding: QuoteSection;
  tankManufacturing: QuoteSection;
  bending: QuoteSection;
  rolling: QuoteSection;
};

export type CustomerRecord = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  payments?: PaymentRecord[];
  createdAt: string;
};

export type PaymentRecord = {
  id: string;
  amount: number;
  note?: string;
  createdAt: string;
};

export type WorkerRecord = {
  id: string;
  name: string;
  email?: string;
  roleIds: string[];
  active: boolean;
  createdAt: string;
};

export type FileRecord = {
  id: string;
  name: string;
  path?: string;
  size?: number;
  uploadedBy?: string;
  createdAt: string;
};

export type LedgerEntry = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category?: string;
  description?: string;
  createdAt: string;
};

export type SyncState = {
  lastSyncAt?: string;
  lastDeviceId?: string;
};

type StoreShape = {
  workspaces: Record<string, WorkspaceRecord>;
  users: Record<string, UserRecord>;
  sessions: Record<string, SessionRecord>;
  memberships: MembershipRecord[];
};

export type WorkspaceMemberRecord = {
  user: UserRecord;
  role: MembershipRecord["role"];
};

export interface StoreRepository {
  getWorkspace(id: string): WorkspaceRecord;
  upsertWorkspace(workspace: WorkspaceRecord): void;
  findWorkspaceByCustomer(customerId: string): WorkspaceRecord | undefined;
  updateWorkspaceServers(workspaceId: string, servers: ServerRecord[]): void;
  updateWorkspaceJobs(workspaceId: string, jobs: JobRecord[]): void;
  updateWorkspaceQuotes(workspaceId: string, quotes: QuoteRecord[]): void;
  updateWorkspaceCustomers(workspaceId: string, customers: CustomerRecord[]): void;
  updateWorkspaceWorkers(workspaceId: string, workers: WorkerRecord[]): void;
  updateWorkspaceFiles(workspaceId: string, files: FileRecord[]): void;
  updateWorkspaceLedger(workspaceId: string, ledger: LedgerEntry[]): void;
  updateWorkspaceSyncState(workspaceId: string, syncState: SyncState): void;
  upsertUser(user: UserRecord): void;
  getUserByEmail(email: string): UserRecord | undefined;
  getUserById(userId: string): UserRecord | undefined;
  getAllSessions(): SessionRecord[];
  createSession(session: SessionRecord): void;
  getSession(token: string): SessionRecord | undefined;
  addMembership(membership: MembershipRecord): void;
  getUserWorkspaces(userId: string): WorkspaceRecord[];
  hasMembership(userId: string, workspaceId: string): boolean;
  getMembershipRole(userId: string, workspaceId: string): MembershipRecord["role"] | undefined;
  getWorkspaceMembers(workspaceId: string): WorkspaceMemberRecord[];
  getAllWorkspaces(): WorkspaceRecord[];
}

function createEmptyStore(): StoreShape {
  return { workspaces: {}, users: {}, sessions: {}, memberships: [] };
}

function createDefaultServerSet(): ServerRecord[] {
  return [
    {
      id: "server-general",
      name: "General",
      channels: [{ id: "channel-general", name: "general" }],
      roles: [{ id: "role-owner", name: "Owner", color: "#fbbf24" }]
    }
  ];
}

function ensureWorkspaceDefaults(workspace: WorkspaceRecord): WorkspaceRecord {
  const year = new Date().getFullYear();
  return {
    ...workspace,
    companyProfile: workspace.companyProfile ?? {},
    emailSettings: workspace.emailSettings ?? { autoNotifyJobDone: true },
    servers: workspace.servers?.length ? workspace.servers : createDefaultServerSet(),
    jobs: (workspace.jobs ?? []).map((job, index) => ({
      ...job,
      jobNumber: job.jobNumber ?? `JOB-${year}-${String(index + 1).padStart(3, "0")}`,
      qrToken: job.qrToken ?? `token-${Math.random().toString(36).slice(2, 10)}`,
      status: job.status ?? "open",
      fileLinks: job.fileLinks ?? [],
      jobDxfParts: job.jobDxfParts ?? []
    })),
    quotes: (workspace.quotes ?? []).map((quote, index) => ({
      ...quote,
      quoteNumber: quote.quoteNumber ?? `Q-${year}-${String(index + 1).padStart(3, "0")}`,
      sections: {
        laserCutting: quote.sections?.laserCutting ?? {},
        punching: quote.sections?.punching ?? {},
        fabrication: quote.sections?.fabrication ?? {},
        laserWelding: quote.sections?.laserWelding ?? {},
        tankManufacturing: quote.sections?.tankManufacturing ?? {},
        bending: quote.sections?.bending ?? {},
        rolling: quote.sections?.rolling ?? {}
      },
      quotePdfPath: quote.quotePdfPath,
      invoicePdfPath: quote.invoicePdfPath,
      quoteDxfPath: quote.quoteDxfPath,
      companyDetails: quote.companyDetails,
      customerDetails: quote.customerDetails
    })),
    customers: (workspace.customers ?? []).map((customer) => ({
      ...customer,
      payments: customer.payments ?? []
    })),
    workers: workspace.workers ?? [],
    files: workspace.files ?? [],
    ledger: workspace.ledger ?? [],
    syncState: workspace.syncState ?? {},
    supportMessages: workspace.supportMessages ?? []
  };
}

function createWorkspaceRecord(id: string): WorkspaceRecord {
  return ensureWorkspaceDefaults({
    id,
    name: id,
    companyProfile: {},
    emailSettings: { autoNotifyJobDone: true },
    servers: createDefaultServerSet(),
    jobs: [],
    quotes: [],
    quoteSeed: undefined,
    customers: [],
    workers: [],
    files: [],
    ledger: [],
    syncState: {}
  });
}

function resolveStoreRoot() {
  const configuredRoot = process.env.QOUTERX_DATA_DIR?.trim();
  if (configuredRoot) return path.resolve(configuredRoot);
  return process.cwd();
}

export class JsonFileStoreRepository implements StoreRepository {
  private readonly dataPath: string;

  constructor(dataPath = path.resolve(resolveStoreRoot(), "data.json")) {
    this.dataPath = dataPath;
  }

  private readStore(): StoreShape {
    if (!fs.existsSync(this.dataPath)) return createEmptyStore();
    const raw = fs.readFileSync(this.dataPath, "utf-8");
    try {
      const parsed = JSON.parse(raw) as StoreShape;
      return {
        workspaces: parsed.workspaces ?? {},
        users: parsed.users ?? {},
        sessions: parsed.sessions ?? {},
        memberships: parsed.memberships ?? []
      };
    } catch {
      return createEmptyStore();
    }
  }

  private writeStore(next: StoreShape) {
    fs.writeFileSync(this.dataPath, JSON.stringify(next, null, 2));
  }

  private getWorkspaceFromStore(store: StoreShape, id: string) {
    const existing = store.workspaces[id];
    if (existing) {
      const normalized = ensureWorkspaceDefaults(existing);
      store.workspaces[id] = normalized;
      return normalized;
    }
    const created = createWorkspaceRecord(id);
    store.workspaces[id] = created;
    return created;
  }

  getWorkspace(id: string): WorkspaceRecord {
    const store = this.readStore();
    const workspace = this.getWorkspaceFromStore(store, id);
    this.writeStore(store);
    return workspace;
  }

  upsertWorkspace(workspace: WorkspaceRecord) {
    const store = this.readStore();
    store.workspaces[workspace.id] = ensureWorkspaceDefaults(workspace);
    this.writeStore(store);
  }

  findWorkspaceByCustomer(customerId: string) {
    const store = this.readStore();
    return Object.values(store.workspaces).find((workspace) => workspace.stripeCustomerId === customerId);
  }

  updateWorkspaceServers(workspaceId: string, servers: ServerRecord[]) {
    const store = this.readStore();
    const workspace = this.getWorkspaceFromStore(store, workspaceId);
    workspace.servers = servers;
    store.workspaces[workspaceId] = workspace;
    this.writeStore(store);
  }

  updateWorkspaceJobs(workspaceId: string, jobs: JobRecord[]) {
    const store = this.readStore();
    const workspace = this.getWorkspaceFromStore(store, workspaceId);
    workspace.jobs = jobs;
    store.workspaces[workspaceId] = workspace;
    this.writeStore(store);
  }

  updateWorkspaceQuotes(workspaceId: string, quotes: QuoteRecord[]) {
    const store = this.readStore();
    const workspace = this.getWorkspaceFromStore(store, workspaceId);
    workspace.quotes = quotes;
    store.workspaces[workspaceId] = workspace;
    this.writeStore(store);
  }

  updateWorkspaceCustomers(workspaceId: string, customers: CustomerRecord[]) {
    const store = this.readStore();
    const workspace = this.getWorkspaceFromStore(store, workspaceId);
    workspace.customers = customers;
    store.workspaces[workspaceId] = workspace;
    this.writeStore(store);
  }

  updateWorkspaceWorkers(workspaceId: string, workers: WorkerRecord[]) {
    const store = this.readStore();
    const workspace = this.getWorkspaceFromStore(store, workspaceId);
    workspace.workers = workers;
    store.workspaces[workspaceId] = workspace;
    this.writeStore(store);
  }

  updateWorkspaceFiles(workspaceId: string, files: FileRecord[]) {
    const store = this.readStore();
    const workspace = this.getWorkspaceFromStore(store, workspaceId);
    workspace.files = files;
    store.workspaces[workspaceId] = workspace;
    this.writeStore(store);
  }

  updateWorkspaceLedger(workspaceId: string, ledger: LedgerEntry[]) {
    const store = this.readStore();
    const workspace = this.getWorkspaceFromStore(store, workspaceId);
    workspace.ledger = ledger;
    store.workspaces[workspaceId] = workspace;
    this.writeStore(store);
  }

  updateWorkspaceSyncState(workspaceId: string, syncState: SyncState) {
    const store = this.readStore();
    const workspace = this.getWorkspaceFromStore(store, workspaceId);
    workspace.syncState = syncState;
    store.workspaces[workspaceId] = workspace;
    this.writeStore(store);
  }

  upsertUser(user: UserRecord) {
    const store = this.readStore();
    store.users[user.id] = user;
    this.writeStore(store);
  }

  getUserByEmail(email: string) {
    const store = this.readStore();
    return Object.values(store.users).find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  getUserById(userId: string) {
    const store = this.readStore();
    return store.users[userId];
  }

  getAllSessions() {
    const store = this.readStore();
    return Object.values(store.sessions);
  }

  createSession(session: SessionRecord) {
    const store = this.readStore();
    store.sessions[session.token] = session;
    this.writeStore(store);
  }

  getSession(token: string) {
    const store = this.readStore();
    return store.sessions[token];
  }

  addMembership(membership: MembershipRecord) {
    const store = this.readStore();
    const exists = store.memberships.some((entry) => entry.userId === membership.userId && entry.workspaceId === membership.workspaceId);
    if (!exists) {
      store.memberships.push(membership);
      this.writeStore(store);
    }
  }

  getUserWorkspaces(userId: string) {
    const store = this.readStore();
    const workspaceIds = store.memberships.filter((entry) => entry.userId === userId).map((entry) => entry.workspaceId);
    let changed = false;
    const workspaces = workspaceIds.map((workspaceId) => {
      const existing = store.workspaces[workspaceId];
      if (existing) {
        const normalized = ensureWorkspaceDefaults(existing);
        store.workspaces[workspaceId] = normalized;
        if (normalized !== existing) changed = true;
        return normalized;
      }
      changed = true;
      return this.getWorkspaceFromStore(store, workspaceId);
    });
    if (changed) this.writeStore(store);
    return workspaces;
  }

  hasMembership(userId: string, workspaceId: string) {
    const store = this.readStore();
    return store.memberships.some((entry) => entry.userId === userId && entry.workspaceId === workspaceId);
  }

  getMembershipRole(userId: string, workspaceId: string) {
    const store = this.readStore();
    return store.memberships.find((entry) => entry.userId === userId && entry.workspaceId === workspaceId)?.role;
  }

  getWorkspaceMembers(workspaceId: string) {
    const store = this.readStore();
    return store.memberships
      .filter((entry) => entry.workspaceId === workspaceId)
      .map((entry) => {
        const user = store.users[entry.userId];
        return user ? { user, role: entry.role } : undefined;
      })
      .filter((entry): entry is WorkspaceMemberRecord => Boolean(entry));
  }

  getAllWorkspaces() {
    const store = this.readStore();
    let changed = false;
    const workspaces = Object.values(store.workspaces).map((workspace) => {
      const normalized = ensureWorkspaceDefaults(workspace);
      if (normalized !== workspace) changed = true;
      return normalized;
    });
    if (changed) {
      store.workspaces = Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace]));
      this.writeStore(store);
    }
    return workspaces;
  }
}

export class PlaceholderCloudStoreRepository implements StoreRepository {
  private readonly reason: string;

  constructor(reason = "Cloud store repository is not configured yet.") {
    this.reason = reason;
  }

  private unsupported(): never {
    throw new Error(this.reason);
  }

  getWorkspace(): WorkspaceRecord { return this.unsupported(); }
  upsertWorkspace(): void { this.unsupported(); }
  findWorkspaceByCustomer(): WorkspaceRecord | undefined { return this.unsupported(); }
  updateWorkspaceServers(): void { this.unsupported(); }
  updateWorkspaceJobs(): void { this.unsupported(); }
  updateWorkspaceQuotes(): void { this.unsupported(); }
  updateWorkspaceCustomers(): void { this.unsupported(); }
  updateWorkspaceWorkers(): void { this.unsupported(); }
  updateWorkspaceFiles(): void { this.unsupported(); }
  updateWorkspaceLedger(): void { this.unsupported(); }
  updateWorkspaceSyncState(): void { this.unsupported(); }
  upsertUser(): void { this.unsupported(); }
  getUserByEmail(): UserRecord | undefined { return this.unsupported(); }
  getUserById(): UserRecord | undefined { return this.unsupported(); }
  getAllSessions(): SessionRecord[] { return this.unsupported(); }
  createSession(): void { this.unsupported(); }
  getSession(): SessionRecord | undefined { return this.unsupported(); }
  addMembership(): void { this.unsupported(); }
  getUserWorkspaces(): WorkspaceRecord[] { return this.unsupported(); }
  hasMembership(): boolean { return this.unsupported(); }
  getMembershipRole(): MembershipRecord["role"] | undefined { return this.unsupported(); }
  getWorkspaceMembers(): WorkspaceMemberRecord[] { return this.unsupported(); }
  getAllWorkspaces(): WorkspaceRecord[] { return this.unsupported(); }
}

let activeStoreRepository: StoreRepository = new JsonFileStoreRepository();

export function setStoreRepository(repository: StoreRepository) {
  activeStoreRepository = repository;
}

export function getStoreRepository() {
  return activeStoreRepository;
}

export function getWorkspace(id: string): WorkspaceRecord {
  return activeStoreRepository.getWorkspace(id);
}

export function upsertWorkspace(workspace: WorkspaceRecord) {
  activeStoreRepository.upsertWorkspace(workspace);
}

export function findWorkspaceByCustomer(customerId: string): WorkspaceRecord | undefined {
  return activeStoreRepository.findWorkspaceByCustomer(customerId);
}

export function updateWorkspaceServers(workspaceId: string, servers: ServerRecord[]) {
  activeStoreRepository.updateWorkspaceServers(workspaceId, servers);
}

export function updateWorkspaceJobs(workspaceId: string, jobs: JobRecord[]) {
  activeStoreRepository.updateWorkspaceJobs(workspaceId, jobs);
}

export function updateWorkspaceQuotes(workspaceId: string, quotes: QuoteRecord[]) {
  activeStoreRepository.updateWorkspaceQuotes(workspaceId, quotes);
}

export function updateWorkspaceCustomers(workspaceId: string, customers: CustomerRecord[]) {
  activeStoreRepository.updateWorkspaceCustomers(workspaceId, customers);
}

export function updateWorkspaceWorkers(workspaceId: string, workers: WorkerRecord[]) {
  activeStoreRepository.updateWorkspaceWorkers(workspaceId, workers);
}

export function updateWorkspaceFiles(workspaceId: string, files: FileRecord[]) {
  activeStoreRepository.updateWorkspaceFiles(workspaceId, files);
}

export function updateWorkspaceLedger(workspaceId: string, ledger: LedgerEntry[]) {
  activeStoreRepository.updateWorkspaceLedger(workspaceId, ledger);
}

export function updateWorkspaceSyncState(workspaceId: string, syncState: SyncState) {
  activeStoreRepository.updateWorkspaceSyncState(workspaceId, syncState);
}

export function upsertUser(user: UserRecord) {
  activeStoreRepository.upsertUser(user);
}

export function getUserByEmail(email: string): UserRecord | undefined {
  return activeStoreRepository.getUserByEmail(email);
}

export function getUserById(userId: string): UserRecord | undefined {
  return activeStoreRepository.getUserById(userId);
}

export function getAllSessions(): SessionRecord[] {
  return activeStoreRepository.getAllSessions();
}

export function createSession(session: SessionRecord) {
  activeStoreRepository.createSession(session);
}

export function getSession(token: string): SessionRecord | undefined {
  return activeStoreRepository.getSession(token);
}

export function addMembership(membership: MembershipRecord) {
  activeStoreRepository.addMembership(membership);
}

export function getUserWorkspaces(userId: string): WorkspaceRecord[] {
  return activeStoreRepository.getUserWorkspaces(userId);
}

export function hasMembership(userId: string, workspaceId: string): boolean {
  return activeStoreRepository.hasMembership(userId, workspaceId);
}

export function getMembershipRole(userId: string, workspaceId: string): MembershipRecord["role"] | undefined {
  return activeStoreRepository.getMembershipRole(userId, workspaceId);
}

export function getWorkspaceMembers(workspaceId: string): WorkspaceMemberRecord[] {
  return activeStoreRepository.getWorkspaceMembers(workspaceId);
}

export function getAllWorkspaces(): WorkspaceRecord[] {
  return activeStoreRepository.getAllWorkspaces();
}
