export type ChatMsg = { roomId: string; text: string; user: string };

export type SupportMessage = {
  id: string;
  workspaceId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  text: string;
  fromOwner: boolean;
  createdAt: string;
};

export type SupportThread = {
  threadKey: string;
  workspaceId: string;
  workspaceName: string;
  userId: string;
  userEmail: string;
  userName?: string;
  lastMessageAt: string | null;
  unreadCount: number;
  messages: SupportMessage[];
};

export type BillingStatus = {
  status: string | null;
  currentPeriodEnd: number | null;
  hasAccess: boolean | null;
  limitedAccess?: boolean;
  graceUntil?: string | null;
  paymentReference?: string | null;
  companyId?: string | null;
};

export type BillingCompanyRecord = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  manualPaymentReference: string;
  subscriptionStatus: "pending" | "trial" | "active" | "expired" | "suspended" | "cancelled";
  planName: string;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  graceUntil: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingPaymentRecord = {
  id: number;
  companyId: string;
  paymentReference: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  proofFilePath: string | null;
  notes: string | null;
  confirmedByAdmin: boolean;
  confirmedAt: string | null;
  createdAt: string;
};

export type BillingDeviceRecord = {
  id: number;
  companyId: string;
  deviceId: string;
  deviceName: string;
  lastSeenAt: string;
  isAllowed: boolean;
  createdAt: string;
};

export type BillingCompanyResponse = {
  company: BillingCompanyRecord | null;
  status: string | null;
  hasAccess: boolean;
  limitedAccess: boolean;
  currentPeriodEnd: number | null;
  graceUntil: string | null;
  paymentReference: string | null;
  role: "main_admin" | "company_admin" | "operator";
  payments: BillingPaymentRecord[];
  devices: BillingDeviceRecord[];
};

export type AdminSubscriptionCompanyRow = BillingCompanyRecord & {
  resolvedStatus: "pending" | "trial" | "active" | "expired" | "suspended" | "cancelled";
  hasAccess: boolean;
  limitedAccess: boolean;
  expiresInDays: number;
  expiredDays: number;
  graceDaysRemaining: number;
  lastSeenAt: string | null;
  pendingPaymentCount: number;
};

export type AccountRequestRecord = {
  id: number;
  companyId: string | null;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  deviceId: string;
  deviceName: string;
  platform: "macos" | "windows" | "linux" | "unknown";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type AdminSubscriptionDashboard = {
  companies: AdminSubscriptionCompanyRow[];
  activeAccounts: number;
  expiredAccounts: number;
  expiringSoon: number;
  suspendedAccounts: number;
  pendingPaymentProofs: number;
  devices: BillingDeviceRecord[];
  pendingRequests?: AccountRequestRecord[];
  notifications?: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    createdAt: string;
    request?: AccountRequestRecord;
  }>;
};

export type RoleRecord = { id: string; name: string; color?: string };

export type ChannelRecord = { id: string; name: string };

export type ServerRecord = {
  id: string;
  name: string;
  channels: ChannelRecord[];
  roles: RoleRecord[];
};

export type FileRecord = {
  id: string;
  name: string;
  path?: string;
  size?: number;
  uploadedBy?: string;
  createdAt: string;
};

export type JobRecord = {
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
  checkedBy?: string;
  checkedAt?: string;
  repeatCount?: number;
  lastRepeatPrice?: number;
  shortageNotePath?: string;
  lastFileOpenedAt?: string;
  jobCardPath?: string;
  fileLinks?: Array<{ fileName: string; originalPath: string; linkPath: string }>;
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
    sourceSegments?: DxfSegment[];
    sourceBounds?: DxfBounds;
  }>;
  createdAt: string;
};

export type ScanPartRecord = {
  id: string;
  name: string;
  layer: string;
  material?: string;
  thicknessMm?: number;
  quantity: number;
  widthMm: number;
  heightMm: number;
  cutLengthMm: number;
  pierceCount: number;
  thumbnailDataUrl?: string;
};

export type ScanJobRecord = {
  id: string;
  jobNumber: string;
  title: string;
  status: "open" | "in_progress" | "incomplete" | "done";
  customerName?: string;
  quoteNumber?: string;
  assignedTo?: string;
  quantityExpected?: number;
  quantityChecked?: number;
  checkedBy?: string;
  checkedAt?: string;
  createdAt: string;
  fileLinks: Array<{ fileName: string }>;
  jobDxfParts: ScanPartRecord[];
};

export type LedgerSummary = {
  income: number;
  expense: number;
  profit: number;
};

export type SyncState = {
  lastSyncAt?: string;
  lastDeviceId?: string;
};

export type UserSummary = { id: string; email: string; name?: string; accountRef?: string };

export type WorkspaceSummary = { id: string; name: string };
export type CompanyProfile = {
  name?: string;
  logoDataUrl?: string;
  accentColor?: string;
  email?: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
  registrationNumber?: string;
};
export type WorkspaceUser = {
  id: string;
  email: string;
  name?: string;
  role: string;
  userRef?: string;
  isLoggedIn?: boolean;
  sessionCount?: number;
  lastSessionAt?: string | null;
  manualPaidUntil?: number | null;
  ownerLocked?: boolean;
  subscriptionState?: "active" | "inactive" | "locked";
};
export type StorageOverview = {
  jobnestRoot: string;
  customersRoot: string;
  jobsActiveRoot: string;
  jobsCompletedRoot: string;
  customers: Array<{ name: string; path: string }>;
  jobsActive: Array<{ name: string; path: string }>;
  jobsCompleted: Array<{ name: string; path: string }>;
  jobCount: number;
};
export type CustomerRecord = { id: string; name: string; email?: string; phone?: string; address?: string; notes?: string };
export type CustomerSummary = { id: string; name: string; billed: number; paid: number; balance: number; jobCount: number };
export type WorkerRecord = { id: string; name: string; email?: string; roleIds: string[]; active: boolean };
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
  weightKg?: number;
};

export type QuoteSection = {
  description?: string;
  amount?: number;
  parts?: QuotePart[];
  vatRate?: number;
  totals?: { subTotal: number; vat: number; total: number };
};
export type QuoteRecord = {
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
    rolling: QuoteSection;
  };
  total?: number;
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
  quotePdfPath?: string;
  createdAt: string;
};

export type BusinessDocRecord = {
  id: string;
  number: string;
  title: string;
  customerName: string;
  amount?: number;
  notes?: string;
  quoteId?: string;
  createdAt: string;
};

export type InvoiceDocRecord = BusinessDocRecord & {
  source: "quote" | "manual";
  quoteId?: string;
  quoteStatus?: QuoteRecord["status"];
};

export type EmailSettingsRecord = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
  fromName: string;
  fromEmail: string;
  autoNotifyJobDone: boolean;
};

export type EmailDetectionResult = {
  fromEmail?: string;
  customer?: { id: string; name: string; email?: string };
  quote?: { id: string; quoteNumber: string; title: string; customerName?: string };
  quoteCandidates: string[];
  purchaseOrderCandidates: string[];
  tags: string[];
};

export type InboxMessage = {
  uid: number;
  id?: number;
  graphMessageId?: string;
  folder?: string;
  subject: string;
  from: string;
  senderName?: string;
  senderEmail?: string;
  date: string;
  snippet: string;
  body?: string;
  bodyHtml?: string;
  hasAttachments?: boolean;
  isRead?: boolean;
  importance?: string;
  detectedType?: "unknown" | "normal_email" | "quote_request" | "purchase_order" | "possible_quote_or_po" | "needs_review";
  detectionConfidence?: number;
  detectionReasons?: string[];
  extractedPoNumber?: string;
  extractedQuoteReference?: string;
  extractedMaterial?: string;
  extractedThicknessMm?: number;
  extractedQuantity?: number;
  customerId?: number;
  quoteId?: string;
  purchaseOrderId?: string;
  attachments?: Array<{ part: string; id?: number; graphAttachmentId?: string; name: string; contentType: string; sizeBytes?: number; localPath?: string; attachmentType?: string; importedToDxfReader?: boolean }>;
};

export type OutlookFolderRecord = {
  id: string;
  displayName: string;
  unreadItemCount?: number;
  totalItemCount?: number;
  lastSyncedAt?: string;
};

export type StoredGraphAuth = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountEmail?: string;
};

export type InboxAttachmentPreview = {
  loading: boolean;
  error?: string;
  contentType: string;
  name: string;
  sizeBytes?: number;
  dataUrl?: string;
  dxfPreviewDataUrl?: string;
};

export type PartDnaHistory = {
  id: number;
  quoteId?: string | null;
  fileName: string;
  customerName?: string | null;
  quotedPrice?: number | null;
  actualCutTime?: number | null;
  operatorNotes?: string | null;
  createdAt: string;
};

export type PartDnaNearMatch = {
  id: number;
  brainPartDnaId?: number | null;
  partCode: string;
  partName?: string | null;
  material?: string | null;
  thickness?: number | null;
  similarityPercent: number;
  timesQuoted: number;
  timesSeen?: number;
  boundingWidth: number;
  boundingHeight: number;
  cutLength: number;
  pierceCount: number;
  holeCount: number;
  complexityScore?: number | null;
  previousQuotedPrice?: number | null;
  previousActualCutTimeMinutes?: number | null;
  lastSeenAt?: string;
};

export type PartDnaCustomerHistory = {
  id: number;
  workspaceId: string;
  partDnaId: number;
  entityType: string;
  entityId: string;
  customerId?: string | null;
  customerName?: string | null;
  material?: string | null;
  thickness?: number | null;
  quotedPrice?: number | null;
  actualCutTimeMinutes?: number | null;
  operatorNotes?: string | null;
  createdAt: string;
};

export type PartDnaAnalysisResult = {
  partId: number;
  brainPartDnaId?: number;
  partCode: string;
  geometryHash: string;
  softHash: string;
  isExistingPart: boolean;
  complexityScore?: number;
  exactMatchPart: {
    id: number;
    partCode: string;
    partName?: string | null;
    material?: string | null;
    thickness?: number | null;
    timesQuoted: number;
    notes?: string | null;
  };
  nearMatches: PartDnaNearMatch[];
  boundingBox: { width: number; height: number; outsideWidth: number; outsideHeight: number };
  cutLength: number;
  pierceCount: number;
  holeCount: number;
  timesQuoted: number;
  previousHistory: PartDnaHistory[];
  previousQuotedPrice?: number | null;
  previousActualCutTime?: number | null;
  previousOperatorNotes?: string | null;
  customerHistory?: PartDnaCustomerHistory[];
  intelligenceRecommendations?: Array<{
    id: number;
    moduleName: string;
    recommendationType: string;
    title: string;
    message: string;
    confidence: number;
    impactScore: number;
    status: "open" | "accepted" | "dismissed";
    payloadJson: string;
    createdAt: string;
  }>;
  previewSvg: string;
  savedFiles?: { folderPath: string; dxfPath: string; previewPath: string };
};

export type PartDnaPreviousPricePopup = {
  entries: Array<{
    partName: string;
    partCode: string;
    previousQuotedPrice: number;
    previousQuotedAt?: string | null;
  }>;
};

export type PartDnaLibraryEntry = {
  id: number;
  partCode: string;
  partName?: string | null;
  customerName?: string | null;
  material?: string | null;
  thickness?: number | null;
  timesQuoted: number;
  boundingWidth: number;
  boundingHeight: number;
  cutLength: number;
  pierceCount: number;
  holeCount: number;
  previewSvg?: string | null;
  previousQuotedPrice?: number | null;
  previousQuotedAt?: string | null;
  lastSeenAt: string;
};

export type SmartQueueJob = {
  id: number;
  workspaceId: string;
  legacyJobId?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  jobNumber: string;
  quoteId?: string | null;
  title: string;
  status: "pending" | "ready" | "cutting" | "paused" | "completed" | "cancelled";
  priority: "low" | "normal" | "urgent";
  dueDate?: string | null;
  material: string;
  thickness?: number | null;
  sheetSize?: string | null;
  estimatedCutTimeMinutes: number;
  estimatedSetupTimeMinutes: number;
  estimatedPierceCount: number;
  estimatedCutLength: number;
  dxfFilePath?: string | null;
  partDnaId?: number | null;
  manualSortOrder?: number | null;
  actualCutTimeMinutes?: number | null;
  manuallyMarkedReady?: boolean;
  createdAt: string;
  updatedAt: string;
  queueScore: number;
  queueReasons: string[];
  ready: boolean;
  warnings: string[];
};

export type SmartQueueGroupItem = {
  id: number;
  groupId: number;
  jobId: number;
  sortOrder: number;
  createdAt: string;
};

export type SmartQueueGroup = {
  id: number;
  workspaceId: string;
  groupName: string;
  material: string;
  thickness?: number | null;
  sheetSize?: string | null;
  status: "planned" | "active" | "completed";
  estimatedTotalCutTimeMinutes: number;
  estimatedSetupSavingMinutes: number;
  totalPierces: number;
  totalCutLength: number;
  urgencyWarning?: string | null;
  recommendedRunOrder: number;
  createdAt: string;
  updatedAt: string;
  items: SmartQueueGroupItem[];
  jobs: SmartQueueJob[];
};

export type SmartQueueRecommendation = {
  id: string;
  kind: "run_next" | "combine" | "urgent_first" | "missing_dxf" | "shared_material" | "manual_override";
  severity: "info" | "warning" | "urgent";
  title: string;
  detail: string;
  relatedJobIds: number[];
  relatedGroupIds: number[];
};

export type StockSheetRecord = {
  id: number;
  material: string;
  thickness: number;
  width: number;
  height: number;
  quantity: number;
  supplier?: string | null;
  costPerSheet?: number | null;
  costPerKg?: number | null;
  location?: string | null;
  status: "available" | "reserved" | "used" | "scrapped";
  reservedJobId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OffcutRecord = {
  id: number;
  parentSheetId?: number | null;
  material: string;
  thickness: number;
  width: number;
  height: number;
  shapeData?: string | null;
  usableArea: number;
  location?: string | null;
  status: "available" | "reserved" | "used" | "scrapped";
  reservedJobId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StockMovementRecord = {
  id: number;
  type: "received" | "reserved" | "released" | "used" | "offcut_created" | "adjusted" | "scrapped";
  material: string;
  thickness: number;
  sheetId?: number | null;
  offcutId?: number | null;
  jobId?: string | null;
  quantity: number;
  notes?: string | null;
  createdAt: string;
};

export type StockWarning = {
  material: string;
  thickness: number;
  availableQuantity: number;
  minimumQuantity: number;
  message: string;
};

export type StockSuggestion = {
  bestOffcut: (OffcutRecord & {
    fit: {
      fitsNormal: boolean;
      fitsRotated: boolean;
      wasteArea: number;
      savingEstimate: number;
    };
  }) | null;
  bestSheet: (StockSheetRecord & {
    fit: {
      fitsNormal: boolean;
      fitsRotated: boolean;
      wasteArea: number;
      savingEstimate: number;
    };
  }) | null;
  materialRequired: boolean;
  estimatedSaving: number;
  message: string;
};

export type OffcutBrainIntelligenceRecord = {
  id: number;
  offcutId: number;
  material: string;
  thickness: number;
  width: number;
  height: number;
  usableArea: number;
  shapeJson?: string | null;
  location?: string | null;
  timesSuggested: number;
  timesUsed: number;
  createdAt: string;
};

export type OffcutBrainMatchRecord = {
  id: number;
  offcutId: number;
  jobId?: string | null;
  quoteId?: string | null;
  partDnaId?: number | null;
  fitType: "normal" | "rotated" | "partial";
  wasteArea: number;
  savingEstimate: number;
  confidence: number;
  createdAt: string;
};

export type OffcutBrainMatchResult = {
  offcut: OffcutRecord | null;
  intelligence: OffcutBrainIntelligenceRecord | null;
  match: OffcutBrainMatchRecord | null;
  recommendation: BrainRecommendationRecord | null;
  fitType: "normal" | "rotated" | "partial" | null;
  wasteArea: number;
  savingEstimate: number;
  confidence: number;
  fullSheetFallback: StockSheetRecord | null;
  message: string;
};

export type OffcutBrainRecommendation = {
  recommendation: BrainRecommendationRecord;
  offcut: OffcutRecord | null;
  intelligence: OffcutBrainIntelligenceRecord | null;
  latestMatch: OffcutBrainMatchRecord | null;
};

export type CloudSyncSettingsRecord = {
  enabled: boolean;
  companyId: string;
  deviceName: string;
  role: "admin" | "operator" | "sales" | "viewer";
  adminMode: boolean;
  updatedAt: string;
};

export type CloudSyncEventRecord = {
  id: number;
  eventType:
    | "app_started"
    | "quote_created"
    | "job_created"
    | "job_started"
    | "job_completed"
    | "dxf_imported"
    | "part_dna_detected"
    | "purchase_order_detected"
    | "email_quote_request_detected"
    | "stock_reserved"
    | "stock_used"
    | "subscription_status_checked"
    | "payment_proof_uploaded"
    | "payment_confirmed"
    | "subscription_renewed"
    | "subscription_expired"
    | "account_suspended"
    | "error_report";
  payloadJson: string;
  status: "pending" | "sent" | "failed";
  retryCount: number;
  createdAt: string;
  sentAt?: string | null;
  lastError?: string | null;
};

export type CloudSyncDeviceRecord = {
  id: number;
  deviceId: string;
  deviceName: string;
  userName: string;
  role: "admin" | "operator" | "sales" | "viewer";
  lastSeenAt: string;
  createdAt: string;
};

export type CompanyDashboardRecord = {
  devices: CloudSyncDeviceRecord[];
  jobsCompletedToday: number;
  quotesCreatedToday: number;
  errors: CloudSyncEventRecord[];
  recentDxfImports: CloudSyncEventRecord[];
  purchaseOrdersDetected: CloudSyncEventRecord[];
  recentEvents: CloudSyncEventRecord[];
};

export type BrainEventRecord = {
  id: number;
  eventType:
    | "quote_created"
    | "quote_accepted"
    | "job_created"
    | "job_started"
    | "job_completed"
    | "dxf_imported"
    | "part_dna_detected"
    | "material_reserved"
    | "material_used"
    | "offcut_created"
    | "offcut_recommended"
    | "offcut_selected"
    | "nesting_completed"
    | "nesting_heat_warning"
    | "purchase_order_detected"
    | "payment_received"
    | "error_detected";
  entityType: string;
  entityId: string;
  payloadJson: string;
  createdAt: string;
};

export type BrainRecommendationRecord = {
  id: number;
  moduleName: string;
  recommendationType: string;
  title: string;
  message: string;
  confidence: number;
  impactScore: number;
  status: "open" | "accepted" | "dismissed";
  payloadJson: string;
  createdAt: string;
};

export type BrainDashboardRecord = {
  topRecommendations: BrainRecommendationRecord[];
  recentEvents: BrainEventRecord[];
  profitSummary: {
    profitToday: number;
    profitMonth: number;
    bestCustomers: Array<{ customerId: string; revenue: number; grossProfit: number; marginPercent: number; jobCount: number }>;
    worstCustomers: Array<{ customerId: string; revenue: number; grossProfit: number; marginPercent: number; jobCount: number }>;
    underpricedJobs: Array<{ id: number; jobId?: string | null; customerId?: string | null; grossProfit: number; marginPercent: number; material: string; thickness?: number | null }>;
    recommendedPriceIncreases: Array<{ id: number; title: string; message: string; confidence: number; createdAt: string }>;
  };
  profitWarnings: Array<{ id: number; jobId?: string | null; customerId?: string | null; grossProfit: number; marginPercent: number; material: string; thickness?: number | null }>;
  profitInsights: Array<{ id: number; insightType: string; title: string; message: string; confidence: number; createdAt: string }>;
  materialForecasts: Array<{ id: number; material: string; thickness: number; forecastPeriodDays: number; predictedSheetsNeeded: number; predictedKgNeeded: number; confidence: number }>;
  materialShortages: Array<{ material: string; thickness: number; forecastPeriodDays: number; predictedSheetsNeeded: number; availableEquivalentSheets: number; shortageSheets: number; recommendedBuySheets: number; confidence: number }>;
  purchaseRecommendations: Array<{ id: number; material: string; thickness: number; recommendedQuantity: number; unit: string; urgency: "low" | "normal" | "urgent"; estimatedCost: number; reason: string; preferredSupplier?: string | null }>;
  offcutOpportunities: Array<{
    recommendation: BrainRecommendationRecord;
    offcut?: { id: number; material: string; thickness: number; width: number; height: number; location?: string | null } | null;
    latestMatch?: { fitType: "normal" | "rotated" | "partial"; savingEstimate: number; confidence: number } | null;
  }>;
  queuePlan: {
    id: number;
    title: string;
    status: "draft" | "active" | "completed";
    totalEstimatedMinutes: number;
    setupSavingMinutes: number;
    materialSavingEstimate: number;
    items: Array<{ jobId: number; reason: string }>;
  } | null;
  leadTimeRisks: Array<{ id: number; jobId?: number | null; estimatedFinishAt: string; confidence: number; riskWarnings: string[]; reasons: string[] }>;
  dxfErrors: Array<{ dxfFileId: string; criticalCount: number; warningCount: number; infoCount: number; latestAt: string }>;
  nestingPlans: Array<{ id: number; material: string; thickness: number; wastePercent: number; estimatedSaving: number; status: "draft" | "approved" | "completed" }>;
  syncHealth: {
    cloudSyncEnabled: boolean;
    pendingSyncEvents: number;
    failedSyncEvents: number;
    recentDeviceCount: number;
    recentErrorCount: number;
    activeAccounts: number;
    expiredAccounts: number;
    pendingPaymentProofs: number;
  };
};

export type ManufacturingMemoryRecord = {
  id: number;
  memoryType: string;
  title: string;
  summary: string;
  entityType: string;
  entityId: string;
  importanceScore: number;
  payloadJson: string;
  createdAt: string;
};

export type KnownPatternRecord = {
  id: number;
  patternType: string;
  title: string;
  description: string;
  confidence: number;
  payloadJson: string;
  createdAt: string;
};

export type ProfitRecord = {
  id: number;
  jobId?: string | null;
  quoteId?: string | null;
  customerId?: string | null;
  partDnaId?: number | null;
  material: string;
  thickness?: number | null;
  revenue: number;
  materialCost: number;
  cuttingCost: number;
  gasCost: number;
  laborCost: number;
  setupCost: number;
  scrapCost: number;
  deliveryCost: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  createdAt: string;
};

export type ProfitInsight = {
  id: number;
  insightType: string;
  title: string;
  message: string;
  confidence: number;
  payloadJson: string;
  createdAt: string;
};

export type ProfitSummary = {
  profitToday: number;
  profitMonth: number;
  bestCustomers: Array<{ customerId: string; revenue: number; grossProfit: number; marginPercent: number; jobCount: number }>;
  worstCustomers: Array<{ customerId: string; revenue: number; grossProfit: number; marginPercent: number; jobCount: number }>;
  underpricedJobs: ProfitRecord[];
  recommendedPriceIncreases: ProfitInsight[];
};

export type MaterialUsageForecastRecord = {
  id: number;
  workspaceId: string;
  material: string;
  thickness: number;
  forecastPeriodDays: number;
  predictedSheetsNeeded: number;
  predictedKgNeeded: number;
  confidence: number;
  basedOnJobsCount: number;
  basedOnQuoteCount: number;
  createdAt: string;
};

export type MaterialShortageRecord = {
  material: string;
  thickness: number;
  forecastPeriodDays: number;
  predictedSheetsNeeded: number;
  predictedKgNeeded: number;
  availableEquivalentSheets: number;
  availableSheets: number;
  minimumSheets: number;
  shortageSheets: number;
  confidence: number;
  leadTimeDays: number;
  recommendedBuySheets: number;
  preferredSupplier?: string | null;
  recommendation: string;
};

export type PurchaseRecommendationRecord = {
  id: number;
  workspaceId: string;
  material: string;
  thickness: number;
  recommendedQuantity: number;
  unit: string;
  reason: string;
  urgency: "low" | "normal" | "urgent";
  estimatedCost: number;
  preferredSupplier?: string | null;
  status: "open" | "ordered" | "dismissed";
  createdAt: string;
};

export type ProductionQueueScoreRecord = {
  id: number;
  workspaceId: string;
  jobId: number;
  score: number;
  reasonsJson: string;
  createdAt: string;
};

export type ProductionQueuePlanItemRecord = {
  id: number;
  queuePlanId: number;
  jobId: number;
  sortOrder: number;
  reason: string;
  createdAt: string;
};

export type ProductionQueuePlanRecord = {
  id: number;
  workspaceId: string;
  title: string;
  status: "draft" | "active" | "completed";
  totalEstimatedMinutes: number;
  setupSavingMinutes: number;
  materialSavingEstimate: number;
  createdAt: string;
  items: ProductionQueuePlanItemRecord[];
};

export type LeadTimePredictionRecord = {
  id: number;
  workspaceId: string;
  jobId?: number | null;
  quoteId?: string | null;
  estimatedStartAt: string;
  estimatedFinishAt: string;
  confidence: number;
  reasonsJson: string;
  createdAt: string;
  reasons: string[];
  riskWarnings: string[];
  queueLoadMinutes: number;
  stockDelayDays: number;
  adjustedCutTimeMinutes: number;
  setupMinutes: number;
  operatorCapacityMinutesPerDay: number;
  similarHistorySamples: number;
};

export type SheetOptimizationResultRecord = {
  id: number;
  workspaceId: string;
  jobId?: string | null;
  quoteId?: string | null;
  material: string;
  thickness: number;
  requiredWidth: number;
  requiredHeight: number;
  recommendedSourceType: "offcut" | "sheet" | "order_required";
  sourceId?: number | null;
  wastePercent: number;
  savingEstimate: number;
  confidence: number;
  createdAt: string;
  recommendation: string;
  sourceLabel: string;
  fitType: "normal" | "rotated" | "none";
  betterSheetWarning?: string | null;
  stockMessage: string;
};

export type NestingPlanItemRecord = {
  id: number;
  nestingPlanId: number;
  jobId?: number | null;
  quoteId?: string | null;
  partDnaId?: number | null;
  quantity: number;
  x: number;
  y: number;
  rotation: number;
  createdAt: string;
};

export type NestingPlanRecord = {
  id: number;
  workspaceId: string;
  material: string;
  thickness: number;
  sheetSourceType: "sheet" | "offcut";
  sheetSourceId?: number | null;
  width: number;
  height: number;
  wastePercent: number;
  estimatedCutTimeMinutes: number;
  estimatedSaving: number;
  status: "draft" | "approved" | "completed";
  createdAt: string;
  items: NestingPlanItemRecord[];
};

export type NestingSkippedGroupRecord = {
  material: string;
  thickness: number;
  reason: string;
  jobIds: number[];
};

export type AdvancedNestingPlanRecord = {
  jobId?: number;
  status: "draft" | "optimized" | "approved" | "exported";
  material: string;
  thickness: number;
  sheetWidth: number;
  sheetHeight: number;
  kerf: number;
  border: number;
  spacing: number;
  placements: Array<{ id: string; nestingItemId: number; x: number; y: number; width: number; height: number; rotation: number; isCommonLine: boolean }>;
  wastePercent: number;
  usagePercent: number;
  estimatedCutLength: number;
  estimatedPierceCount: number;
  estimatedCutTimeMinutes: number;
  commonLineSavingEstimate: number;
  heatScore?: number;
  heatZones?: Array<{ x: number; y: number; width: number; height: number; score: number; pierces: number }>;
  microJoins: Array<{ placementId: string; x: number; y: number; tabWidth: number; reason: string }>;
  warnings: Array<{ severity: "info" | "warning" | "critical"; message: string; payload?: Record<string, unknown> }>;
  dxfExportPath?: string | null;
};

export type NestingStudioResult = {
  placements: Array<{
    partId: string;
    name: string;
    x: number;
    y: number;
    rotation: number;
    cutOrder?: number;
    polygon: Array<{ x: number; y: number }>;
    microJoins: Array<{ x: number; y: number }>;
    leadIn: { start: { x: number; y: number }; end: { x: number; y: number } };
  }>;
  unplaced: Array<{ id: string; name: string; quantity: number }>;
  usagePercent: number;
  wastePercent: number;
  commonLineSaving: number;
  cutOrder?: Array<{ cutOrder: number; placementId: string; partId?: string; operation: "hole" | "outer"; x: number; y: number }>;
  heatScore?: number;
  heatZones?: Array<{ x: number; y: number; width: number; height: number; score: number; pierces: number }>;
  nfpDebug?: {
    boundaries: Array<Array<{ x: number; y: number }>>;
    collisionZones: Array<Array<{ x: number; y: number }>>;
    validPoints: Array<{ x: number; y: number }>;
  };
  optimizationProgress?: { attemptsCompleted: number; bestWastePercent: number; bestUsagePercent: number; placedPartsCount: number; timeLimitMs: number; returnedBestSoFar: boolean };
  warnings: string[];
  dxf: string;
};

export type NestingWorkspacePartRecord = {
  id: number;
  workspaceId: number;
  dxfFileId?: string | null;
  jobId?: string | null;
  quoteId?: string | null;
  partDnaId?: number | null;
  fileName: string;
  quantity: number;
  width: number;
  height: number;
  cutLength: number;
  pierceCount: number;
  geometryJson: string;
  previewGeometry?: NestingPreviewGeometry | null;
  createdAt: string;
};

export type NestingPreviewGeometry = {
  outerContours?: Array<Array<{ x: number; y: number }>>;
  innerHoles?: Array<Array<{ x: number; y: number }>>;
  circles?: Array<{ cx: number; cy: number; r: number }>;
  arcs?: Array<{ cx: number; cy: number; r: number; startAngle: number; endAngle: number }>;
  outerContour?: Array<{ x: number; y: number }>;
  holes?: Array<Array<{ x: number; y: number }>>;
  simplifiedPolygon?: Array<{ x: number; y: number }>;
  preview?: Array<{ x: number; y: number }>;
  segments?: Array<{ x1: number; y1: number; x2: number; y2: number; kind?: "line" | "arc" | "circle" }>;
};

export type NestingWorkspacePlacementRecord = {
  id: number;
  workspaceId: number;
  partId: number;
  fileName?: string | null;
  previewGeometry?: NestingPreviewGeometry;
  sheetIndex: number;
  x: number;
  y: number;
  rotation: number;
  mirrored: boolean;
  isManual: boolean;
  hasCollision: boolean;
  isOutsideSheet: boolean;
  createdAt: string;
};

export type NestingWorkspaceRecord = {
  id: number;
  workspaceId?: string | null;
  customerId?: string | null;
  customerName: string;
  nestName: string;
  material: string;
  thickness: number;
  sourceType: "sheet" | "offcut";
  sourceId?: number | null;
  sheetWidth: number;
  sheetHeight: number;
  border: number;
  kerf: number;
  spacing: number;
  allowRotation: boolean;
  allowCommonLine: boolean;
  enableMicroJoins: boolean;
  leadInType: "line" | "arc";
  leadInLength: number;
  status: "draft" | "nested" | "exported" | "completed";
  wastePercent?: number | null;
  usagePercent?: number | null;
  estimatedCutLength?: number | null;
  estimatedPierceCount?: number | null;
  exportedDxfPath?: string | null;
  createdAt: string;
  updatedAt: string;
  parts: NestingWorkspacePartRecord[];
  placements: NestingWorkspacePlacementRecord[];
  warnings: Array<{ severity: "info" | "warning" | "critical"; message: string; payload?: Record<string, unknown> }>;
};

export type NestingOffcutRecord = {
  id: number;
  sourceWorkspaceId?: number | null;
  sourceJobId?: string | null;
  sourceCustomerId?: string | null;
  material: string;
  thickness: number;
  width: number;
  height: number;
  shapeJson?: string | null;
  previewJson?: string | null;
  usableArea: number;
  location?: string | null;
  status: "available" | "reserved" | "used" | "scrapped";
  createdAt: string;
  updatedAt: string;
};

export type NestingOffcutRecommendation = {
  source: "nesting" | "stock" | "sheet" | "order";
  offcutId: number | null;
  material: string;
  thickness: number;
  width: number;
  height: number;
  fitsNormal: boolean;
  fitsRotated: boolean;
  wastePercent: number;
  estimatedSaving: number;
  message: string;
  previewJson?: string | null;
};

export type NestingStudioOffcutRecommendation = {
  offcut: NestingOffcutRecord;
  rotatedFit: boolean;
  wastePercent: number;
  estimatedSaving: number;
};

export type NestingStudioExportRecord = {
  exportPath: string;
  exportFolder: string;
  exportFileName: string;
};

export type DxfErrorReportRecord = {
  id: number;
  workspaceId: string;
  dxfFileId: string;
  partDnaId?: number | null;
  severity: "info" | "warning" | "critical";
  errorType: string;
  message: string;
  entityRef?: string | null;
  payloadJson: string;
  createdAt: string;
};

export type DxfErrorCheckResult = {
  dxfFileId: string;
  partDnaId?: number | null;
  reports: DxfErrorReportRecord[];
  summary: {
    criticalCount: number;
    warningCount: number;
    infoCount: number;
  };
  recommendedFixes: string[];
};

export type ProductionAssistantAction = {
  id: string;
  label: string;
  actionType:
    | "open_ai_queue"
    | "open_material_prediction"
    | "open_profit_intelligence"
    | "open_dxf_errors"
    | "open_stock"
    | "open_part_dna"
    | "open_quotes"
    | "refresh";
  payload?: Record<string, unknown>;
};

export type ProductionAssistantResponse = {
  answer: string;
  sourceModules: string[];
  recommendations: Array<{
    title: string;
    message: string;
    confidence?: number;
  }>;
  suggestedActions: ProductionAssistantAction[];
};

export type AiChatMessage = {
  role: "user" | "assistant";
  text: string;
  at: string;
};

export type InboxAttachmentMeta = { part: string; name: string; contentType: string; sizeBytes?: number };

export type AppFeatureId =
  | "chat"
  | "jobs"
  | "part_dna"
  | "quotes"
  | "email"
  | "tank"
  | "documents"
  | "customers"
  | "image_dxf"
  | "ai_assistant"
  | "brain_center"
  | "manufacturing_memory"
  | "profit_intelligence"
  | "material_prediction"
  | "ai_production_queue"
  | "lead_time_intelligence"
  | "sheet_optimizer"
  | "nesting_intelligence"
  | "nesting_workspace"
  | "nesting_studio"
  | "dxf_error_detection"
  | "production_assistant"
  | "files"
  | "qr";

export type DeviceAccessResponse = {
  restricted: boolean;
  allowedFeatures: AppFeatureId[];
  updatedAt?: string | null;
};


export type ProcessedEmailRecord = {
  processedAt: string;
  actions: string[];
};

export type DetectionBoardEntry = {
  message: InboxMessage;
  kind: "quote" | "purchase_order";
  refs: string[];
  attachmentNames: string[];
};

export type PoPartInsight = {
  quantity?: number;
  material?: string;
  thicknessMm?: number;
};

export type ParsedPurchaseOrderInsights = {
  byToken: Map<string, PoPartInsight>;
  defaultMaterial?: string;
  defaultThicknessMm?: number;
  totalQuantity?: number;
};

export type DxfSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
  entityId: string;
};
export type DxfBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type DxfReaderPartPreview = {
  id: string;
  name: string;
  layer: string;
  quantity: number;
  widthMm: number;
  heightMm: number;
  cutLengthMm: number;
  pierceCount: number;
  segmentCount: number;
  thumbnailDataUrl: string;
  printDataUrl: string;
  sourceSegments: DxfSegment[];
  sourceBounds: DxfBounds;
};
export type JobDxfPartPreview = {
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
  sourceSegments?: DxfSegment[];
  sourceBounds?: DxfBounds;
};
export type JobDxfSourceFile = {
  id: string;
  fileName: string;
  segments: DxfSegment[];
  layers: string[];
  previewDataUrl?: string;
  parts: JobDxfPartPreview[];
  fixedParts?: JobDxfPartPreview[];
};
export type QuoteDxfSourceFile = {
  id: string;
  fileName: string;
  segments: DxfSegment[];
  layers: string[];
  previewDataUrl?: string;
  parts: DxfReaderPartPreview[];
};
export type PdfReaderPartPreview = {
  id: string;
  name: string;
  fileName: string;
  pageNumber: number;
  quantity: number;
  widthMm: number;
  heightMm: number;
  thumbnailDataUrl: string;
  printDataUrl: string;
};
export type PdfReaderSourcePage = {
  id: string;
  fileName: string;
  pageNumber: number;
  previewDataUrl: string;
  parts: PdfReaderPartPreview[];
};
export type NestingPlateInput = {
  name: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  sourceSegments?: DxfSegment[];
  sourceBounds?: DxfBounds;
};
export type NestingPlacement = {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  name: string;
  rotationDeg: 0 | 90 | 180;
  sourceSegments?: DxfSegment[];
  sourceBounds?: DxfBounds;
};
export type NestingPlateLayout = { placements: NestingPlacement[] };
export type NestingResult = {
  plateWidthMm: number;
  plateHeightMm: number;
  plateCount: number;
  totalParts: number;
  usedAreaMm2: number;
  totalPlateAreaMm2: number;
  wastePercent: number;
  utilizationPercent: number;
  layouts: NestingPlateLayout[];
};

export type ViewMode =
  | "chat"
  | "billing"
  | "jobs"
  | "brain_center"
  | "manufacturing_memory"
  | "profit_intelligence"
  | "material_prediction"
  | "ai_production_queue"
  | "lead_time_intelligence"
  | "sheet_optimizer"
  | "nesting_intelligence"
  | "nesting_workspace"
  | "nesting_studio"
  | "dxf_error_detection"
  | "production_assistant"
  | "part_dna"
  | "qr"
  | "files"
  | "customers"
  | "ai_assistant"
  | "company_live"
  | "admin_subscriptions"
  | "settings"
  | "quotes"
  | "documents"
  | "tank"
  | "email"
  | "image_dxf";
