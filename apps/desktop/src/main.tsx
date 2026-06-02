import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, Socket } from "socket.io-client";
import { QRCodeCanvas } from "qrcode.react";
import { getDocument } from "pdfjs-dist";
import type {
  AccountRequestRecord, AdminSubscriptionCompanyRow, AdminSubscriptionDashboard,
  AdvancedNestingPlanRecord, AiChatMessage, AppFeatureId,
  BillingCompanyRecord, BillingCompanyResponse, BillingDeviceRecord, BillingPaymentRecord, BillingStatus,
  BrainDashboardRecord, BrainEventRecord, BrainRecommendationRecord,
  BusinessDocRecord, ChannelRecord, ChatMsg,
  CloudSyncDeviceRecord, CloudSyncEventRecord, CloudSyncSettingsRecord,
  CompanyDashboardRecord, CompanyProfile,
  CustomerRecord, CustomerSummary,
  DetectionBoardEntry, DeviceAccessResponse,
  DxfBounds, DxfErrorCheckResult, DxfErrorReportRecord,
  DxfReaderPartPreview, DxfSegment,
  EmailDetectionResult, EmailSettingsRecord,
  FileRecord,
  InboxAttachmentMeta, InboxAttachmentPreview, InboxMessage, InvoiceDocRecord,
  JobDxfPartPreview, JobDxfSourceFile, JobRecord,
  KnownPatternRecord, LeadTimePredictionRecord, LedgerSummary,
  ManufacturingMemoryRecord, MaterialShortageRecord, MaterialUsageForecastRecord,
  NestingOffcutRecommendation, NestingOffcutRecord, NestingPlacement,
  NestingPlanItemRecord, NestingPlanRecord, NestingPlateInput, NestingPlateLayout,
  NestingPreviewGeometry, NestingResult,
  NestingSkippedGroupRecord, NestingStudioExportRecord, NestingStudioOffcutRecommendation,
  NestingStudioResult, NestingWorkspacePartRecord, NestingWorkspacePlacementRecord, NestingWorkspaceRecord,
  OffcutBrainIntelligenceRecord, OffcutBrainMatchRecord, OffcutBrainMatchResult, OffcutBrainRecommendation,
  OffcutRecord, OutlookFolderRecord,
  ParsedPurchaseOrderInsights, PartDnaAnalysisResult, PartDnaCustomerHistory, PartDnaHistory,
  PartDnaLibraryEntry, PartDnaNearMatch, PartDnaPreviousPricePopup,
  PdfReaderPartPreview, PdfReaderSourcePage, PoPartInsight,
  ProcessedEmailRecord, ProductionAssistantAction, ProductionAssistantResponse,
  ProductionQueuePlanItemRecord, ProductionQueuePlanRecord, ProductionQueueScoreRecord,
  ProfitInsight, ProfitRecord, ProfitSummary,
  PurchaseRecommendationRecord,
  QuoteDxfSourceFile, QuotePart, QuoteRecord, QuoteSection,
  RoleRecord, ScanJobRecord, ScanPartRecord, ServerRecord,
  SheetOptimizationResultRecord,
  SmartQueueGroup, SmartQueueGroupItem, SmartQueueJob, SmartQueueRecommendation,
  StockMovementRecord, StockSheetRecord, StockSuggestion, StockWarning,
  StorageOverview, StoredGraphAuth,
  SupportMessage, SupportThread, SyncState,
  UserSummary, ViewMode,
  WorkerRecord, WorkspaceSummary, WorkspaceUser,
} from "./types";
import {
  QOUTER_X_RELEASE_URL,
  DEFAULT_API_URL,
  DESKTOP_GATEWAY_API_URL_KEY,
  FORCED_API_URL,
  APP_URL,
  AUTH_REMEMBER_KEY,
  AUTH_EMAIL_KEY,
  AUTH_PASSWORD_KEY,
  AUTH_PASSWORD_STORE_KEY,
  CLOUD_DEVICE_TOKEN_STORE_PREFIX,
  APP_OWNER_EMAIL,
  EMAIL_OAUTH_STORE_PREFIX,
  SUBSCRIPTION_BANK_NAME,
  SUBSCRIPTION_ACCOUNT_NUMBER,
  DEVICE_ID_KEY,
  EMAIL_PROCESSED_KEY_PREFIX,
  EMAIL_READ_KEY_PREFIX,
  GMAIL_EMAIL_PRESET,
  ZAR_FORMATTER,
  JOB_DXF_THICKNESS_OPTIONS,
  APP_FEATURE_OPTIONS,
  DEFAULT_MACHINE_OPTIONS,
  BRAND_LOGO_SRC,
  MASTER_MATERIALS,
  SANITARY_FITTING_GROUPS,
  SANITARY_STANDARD_SIZES,
  normalizeJobDxfThickness,
  formatMachineLabelFromKey,
  getOrCreateDeviceId,
  pickAccentFromLogo,
  buildApiUrlCandidates,
  getStoredGatewayApiUrl,
  deriveAccountRef,
} from "./constants";
import {
  parseDxfSegments,
  getDxfBounds,
  createSegmentThumbnailDataUrl,
  createSegmentSvgDataUrl,
  createNestingPartPreviewDataUrl,
  parseNestingPreviewGeometry,
  nestingWorkspaceGeometryPaths,
  nestingStudioBounds,
  nestingStudioOffsetPolygon,
  buildNestingStudioHeat,
  buildNestingStudioCutOrder,
  buildNestingStudioDxf,
  recalculateNestingStudioResult,
  getNestingStudioFootprint,
  createOffcutPreviewDataUrl,
  detectPdfDrawingPartsFromCanvas,
  createRectangleSegments,
  createCircleSegments,
  createRegularPolygonSegments,
  createSlotSegments,
  buildDxfFromSegments,
  appendDxfSegments,
  splitSegmentsIntoParts,
  mergeContainedComponents,
  groupComponentsByDrawingIslands,
  mergeComponentsByProximity,
  estimatePierceCount,
  getPartSignature,
  estimateNestingForPlate,
  readDxfText,
  decodeDxfArrayBuffer,
  decodeBase64ToArrayBuffer,
  createDxfThumbnailDataUrl,
  segmentLength,
} from "./dxf-utils";
import {
  BrandWordmark,
  UI,
  DesignSystemStyles,
  PageContainer,
  Card,
  SectionHeader,
  Button,
  Input,
  StatusBadge,
  UpdateStatusCard,
  DownloadPage,
} from "./ui";
import { JobsView } from "./views/JobsView";
import { QuotesView } from "./views/QuotesView";

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(DEFAULT_API_URL);
  const [apiRuntimeStatus, setApiRuntimeStatus] = useState<DesktopApiStatusPayload>({
    ok: true,
    packaged: window.location.protocol === "file:",
    running: window.location.protocol !== "file:",
    url: DEFAULT_API_URL,
    mode: "local",
    error: null,
    logPath: null
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("authToken"));
  const [user, setUser] = useState<UserSummary | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [offlineBootMode, setOfflineBootMode] = useState(false);
  const [gatewayApiUrl, setGatewayApiUrl] = useState<string>(() => getStoredGatewayApiUrl() ?? "");
  const [gatewayApiSaveStatus, setGatewayApiSaveStatus] = useState<string | null>(null);
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [platformLabel] = useState<"macos" | "windows" | "linux" | "unknown">(() => {
    const value = navigator.platform?.toLowerCase?.() ?? "";
    if (value.includes("mac")) return "macos";
    if (value.includes("win")) return "windows";
    if (value.includes("linux")) return "linux";
    return "unknown";
  });
  const [deviceAllowedFeatures, setDeviceAllowedFeatures] = useState<AppFeatureId[] | null>(null);
  const [deviceAccessStatus, setDeviceAccessStatus] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [generatorUnlocked, setGeneratorUnlocked] = useState(false);
  const [generatorBusy, setGeneratorBusy] = useState(false);
  const [generatorStatus, setGeneratorStatus] = useState<string | null>(null);
  const [generatorSelectedFeatures, setGeneratorSelectedFeatures] = useState<AppFeatureId[]>(
    APP_FEATURE_OPTIONS.map((entry) => entry.id)
  );
  const [generatedAccessCode, setGeneratedAccessCode] = useState("");
  const [redeemAccessCode, setRedeemAccessCode] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemStatus, setRedeemStatus] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authRemember, setAuthRemember] = useState<boolean>(() => localStorage.getItem(AUTH_REMEMBER_KEY) !== "0");
  const [authEmail, setAuthEmail] = useState(() => localStorage.getItem(AUTH_EMAIL_KEY) ?? "");
  const [authPassword, setAuthPassword] = useState("");
  const [autoSignInAttempted, setAutoSignInAttempted] = useState(false);
  const [authName, setAuthName] = useState("");
  const [authWorkspaceName, setAuthWorkspaceName] = useState("Qouterx");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [scanToken, setScanToken] = useState("");
  const [scanQuantity, setScanQuantity] = useState("");
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [scanJob, setScanJob] = useState<ScanJobRecord | null>(null);
  const [scanPartQuantities, setScanPartQuantities] = useState<Record<string, string>>({});
  const [scanShortageNoteUrl, setScanShortageNoteUrl] = useState<string | null>(null);

  const [chatUser] = useState("Shaun");
  const [text, setText] = useState("");
  const [log, setLog] = useState<Array<string | ChatMsg>>([]);
  const [supportThreads, setSupportThreads] = useState<SupportThread[]>([]);
  const [selectedSupportThreadKey, setSelectedSupportThreadKey] = useState<string | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportStatus, setSupportStatus] = useState<string | null>(null);
  const [billingEmail, setBillingEmail] = useState("owner@reimec.co.za");
  const [billing, setBilling] = useState<BillingStatus>({ status: null, currentPeriodEnd: null, hasAccess: null });
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingCompany, setBillingCompany] = useState<BillingCompanyRecord | null>(null);
  const [billingPayments, setBillingPayments] = useState<BillingPaymentRecord[]>([]);
  const [billingDevices, setBillingDevices] = useState<BillingDeviceRecord[]>([]);
  const [billingRole, setBillingRole] = useState<BillingCompanyResponse["role"]>("operator");
  const [billingStatusMessage, setBillingStatusMessage] = useState<string | null>(null);
  const [billingProofAmount, setBillingProofAmount] = useState("");
  const [billingProofNotes, setBillingProofNotes] = useState("");
  const [billingProofFile, setBillingProofFile] = useState<File | null>(null);
  const [adminSubscriptions, setAdminSubscriptions] = useState<AdminSubscriptionDashboard | null>(null);
  const [pendingAccountRequests, setPendingAccountRequests] = useState<AccountRequestRecord[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AdminSubscriptionDashboard["notifications"]>([]);
  const [accountRequestToast, setAccountRequestToast] = useState<string | null>(null);
  const [accountRequestPopup, setAccountRequestPopup] = useState<AccountRequestRecord | null>(null);
  const [adminSubscriptionDetail, setAdminSubscriptionDetail] = useState<{
    companyId: string;
    payments: BillingPaymentRecord[];
    auditLog: Array<{
      id: number;
      action: string;
      oldStatus?: string | null;
      newStatus?: string | null;
      oldEndDate?: string | null;
      newEndDate?: string | null;
      adminNote?: string | null;
      createdAt: string;
    }>;
  } | null>(null);
  const [paymentCopyStatus, setPaymentCopyStatus] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("Unknown");
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatusPayload | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateActionError, setUpdateActionError] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [ledger, setLedger] = useState<LedgerSummary>({ income: 0, expense: 0, profit: 0 });
  const [syncState, setSyncState] = useState<SyncState>({});
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [storageOverview, setStorageOverview] = useState<StorageOverview | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("jobs");
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
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerNotes, setNewCustomerNotes] = useState("");
  const [paymentCustomerId, setPaymentCustomerId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [newWorkerName, setNewWorkerName] = useState("");
  const [selectedQuote, setSelectedQuote] = useState("");
  const [quoteSeed, setQuoteSeed] = useState("");
  const [quoteTitle, setQuoteTitle] = useState("");
  const [quoteCustomerId, setQuoteCustomerId] = useState("");
  const [quoteCompanyName, setQuoteCompanyName] = useState("Qouterx");
  const [quoteCompanyEmail, setQuoteCompanyEmail] = useState("");
  const [quoteCompanyPhone, setQuoteCompanyPhone] = useState("");
  const [quoteCompanyAddress, setQuoteCompanyAddress] = useState("");
  const [quoteCompanyVatNumber, setQuoteCompanyVatNumber] = useState("");
  const [quoteCompanyRegistrationNumber, setQuoteCompanyRegistrationNumber] = useState("");
  const [quoteAccentColor, setQuoteAccentColor] = useState("#0f172a");
  const [quoteLogoDataUrl, setQuoteLogoDataUrl] = useState<string | undefined>(undefined);
  const [companyProfileSaving, setCompanyProfileSaving] = useState(false);
  const [quoteVatRate, setQuoteVatRate] = useState("15");
  const [costPerPierce, setCostPerPierce] = useState("0");
  const [costPerCutMm, setCostPerCutMm] = useState("0");
  const [costPerBend, setCostPerBend] = useState("0");
  const [quoteParts, setQuoteParts] = useState<QuotePart[]>([]);
  const [dxfReaderFileName, setDxfReaderFileName] = useState("");
  const [dxfReaderSegments, setDxfReaderSegments] = useState<DxfSegment[]>([]);
  const [dxfReaderLayers, setDxfReaderLayers] = useState<string[]>([]);
  const [dxfReaderSelectedLayers, setDxfReaderSelectedLayers] = useState<string[]>([]);
  const [dxfReaderPreviewDataUrl, setDxfReaderPreviewDataUrl] = useState<string | undefined>(undefined);
  const [dxfReaderParts, setDxfReaderParts] = useState<DxfReaderPartPreview[]>([]);
  const [dxfReaderSourceFiles, setDxfReaderSourceFiles] = useState<QuoteDxfSourceFile[]>([]);
  const [dxfReaderSelectedPartIds, setDxfReaderSelectedPartIds] = useState<string[]>([]);
  const [dxfReaderStatus, setDxfReaderStatus] = useState<string | null>(null);
  const [dxfReaderTextInput, setDxfReaderTextInput] = useState("");
  const [partDnaResultsByPartId, setPartDnaResultsByPartId] = useState<Record<string, PartDnaAnalysisResult>>({});
  const [partDnaLibrary, setPartDnaLibrary] = useState<PartDnaLibraryEntry[]>([]);
  const [partDnaLibraryLoading, setPartDnaLibraryLoading] = useState(false);
  const [partDnaPreviousPricePopup, setPartDnaPreviousPricePopup] = useState<PartDnaPreviousPricePopup | null>(null);
  const [partDnaBusy, setPartDnaBusy] = useState(false);
  const [partDnaStatus, setPartDnaStatus] = useState<string | null>(null);
  const [pdfReaderSourcePages, setPdfReaderSourcePages] = useState<PdfReaderSourcePage[]>([]);
  const [pdfReaderParts, setPdfReaderParts] = useState<PdfReaderPartPreview[]>([]);
  const [pdfReaderSelectedPartIds, setPdfReaderSelectedPartIds] = useState<string[]>([]);
  const [pdfReaderStatus, setPdfReaderStatus] = useState<string | null>(null);
  const [jobDxfFileName, setJobDxfFileName] = useState("");
  const [jobDxfSegments, setJobDxfSegments] = useState<DxfSegment[]>([]);
  const [jobDxfLayers, setJobDxfLayers] = useState<string[]>([]);
  const [jobDxfSelectedLayers, setJobDxfSelectedLayers] = useState<string[]>([]);
  const [jobDxfPreviewDataUrl, setJobDxfPreviewDataUrl] = useState<string | undefined>(undefined);
  const [jobDxfParts, setJobDxfParts] = useState<JobDxfPartPreview[]>([]);
  const [jobDxfSourceFiles, setJobDxfSourceFiles] = useState<JobDxfSourceFile[]>([]);
  const [jobDxfSelectedPartIds, setJobDxfSelectedPartIds] = useState<string[]>([]);
  const [jobDxfStatus, setJobDxfStatus] = useState<string | null>(null);
  const [jobDxfSaving, setJobDxfSaving] = useState(false);
  const [manualPlateShape, setManualPlateShape] = useState<"square" | "round">("square");
  const [manualPlateName, setManualPlateName] = useState("");
  const [manualPlateWidthMm, setManualPlateWidthMm] = useState("");
  const [manualPlateHeightMm, setManualPlateHeightMm] = useState("");
  const [manualPlateDiameterMm, setManualPlateDiameterMm] = useState("");
  const [manualPlateQuantity, setManualPlateQuantity] = useState("1");
  const [perfPartName, setPerfPartName] = useState("");
  const [perfPlateWidthMm, setPerfPlateWidthMm] = useState("1000");
  const [perfPlateHeightMm, setPerfPlateHeightMm] = useState("2000");
  const [perfQuantity, setPerfQuantity] = useState("1");
  const [perfHoleType, setPerfHoleType] = useState<"round" | "square" | "hex" | "slot">("round");
  const [perfPatternType, setPerfPatternType] = useState<"square" | "staggered">("square");
  const [perfSpacingMode, setPerfSpacingMode] = useState<"pitch" | "web">("pitch");
  const [perfPitchMm, setPerfPitchMm] = useState("12");
  const [perfWebMm, setPerfWebMm] = useState("2");
  const [perfHoleSizeMm, setPerfHoleSizeMm] = useState("10");
  const [perfSlotLengthMm, setPerfSlotLengthMm] = useState("16");
  const [perfSlotWidthMm, setPerfSlotWidthMm] = useState("6");
  const [perfBorderXMm, setPerfBorderXMm] = useState("15");
  const [perfBorderYMm, setPerfBorderYMm] = useState("15");
  const [perfPreviewZoom, setPerfPreviewZoom] = useState("1");
  const [dxfMergeToleranceMm, setDxfMergeToleranceMm] = useState("8");
  const [nestingGapMm, setNestingGapMm] = useState("5");
  const [nestingResults, setNestingResults] = useState<NestingResult[]>([]);
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
  const [quoteTankManufacturing, setQuoteTankManufacturing] = useState("");
  const [quoteTankManufacturingAmount, setQuoteTankManufacturingAmount] = useState("");
  const [tankMaterial, setTankMaterial] = useState("Mild Steel");
  const [tankLengthMm, setTankLengthMm] = useState("");
  const [tankWidthMm, setTankWidthMm] = useState("");
  const [tankHeightMm, setTankHeightMm] = useState("");
  const [tankThicknessMm, setTankThicknessMm] = useState("3");
  const [tankQuantity, setTankQuantity] = useState("1");
  const [tankFabRatePerKg, setTankFabRatePerKg] = useState("0");
  const [tankFittingGroup, setTankFittingGroup] = useState(SANITARY_FITTING_GROUPS[0]?.group ?? "");
  const [tankFitting, setTankFitting] = useState(SANITARY_FITTING_GROUPS[0]?.fittings[0] ?? "");
  const [tankFittingSize, setTankFittingSize] = useState("");
  const [tankFittingSelections, setTankFittingSelections] = useState<string[]>([]);
  const [quoteBending, setQuoteBending] = useState("");
  const [quoteRolling, setQuoteRolling] = useState("");
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatBusy, setAiChatBusy] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>([
    {
      role: "assistant",
      text: "Ask me anything, or tell me to do something: create quote, create job, create quote and job, send email, open quotes/jobs/email/dxf.",
      at: new Date().toISOString()
    }
  ]);
  const [smartQueueSearch, setSmartQueueSearch] = useState("");
  const [smartQueueFilter, setSmartQueueFilter] = useState<"all" | "pending" | "ready" | "urgent" | "missing_dxf" | "completed">("all");
  const [smartQueueSection, setSmartQueueSection] = useState<"queue" | "stock">("queue");
  const [smartQueueJobs, setSmartQueueJobs] = useState<SmartQueueJob[]>([]);
  const [smartQueueGroups, setSmartQueueGroups] = useState<SmartQueueGroup[]>([]);
  const [smartQueueRecommendations, setSmartQueueRecommendations] = useState<SmartQueueRecommendation[]>([]);
  const [smartQueueLoading, setSmartQueueLoading] = useState(false);
  const [smartQueuePlanning, setSmartQueuePlanning] = useState(false);
  const [smartQueueError, setSmartQueueError] = useState<string | null>(null);
  const [smartQueueSelectedJobId, setSmartQueueSelectedJobId] = useState<number | null>(null);
  const [smartQueueDraggingJobId, setSmartQueueDraggingJobId] = useState<number | null>(null);
  const [stockSheets, setStockSheets] = useState<StockSheetRecord[]>([]);
  const [stockOffcuts, setStockOffcuts] = useState<OffcutRecord[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovementRecord[]>([]);
  const [stockWarnings, setStockWarnings] = useState<StockWarning[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockSearch, setStockSearch] = useState("");
  const [stockMaterialFilter, setStockMaterialFilter] = useState("");
  const [stockThicknessFilter, setStockThicknessFilter] = useState("");
  const [stockViewFilter, setStockViewFilter] = useState<"all" | "available" | "reserved" | "low_stock" | "offcuts_only">("all");
  const [stockAddMode, setStockAddMode] = useState<"sheet" | "offcut" | null>(null);
  const [stockAddForm, setStockAddForm] = useState({
    material: "Mild Steel",
    thickness: "3",
    width: "3000",
    height: "1500",
    quantity: "1",
    location: "Rack",
    supplier: "",
    costPerSheet: ""
  });
  const [stockQuoteSuggestion, setStockQuoteSuggestion] = useState<StockSuggestion | null>(null);
  const [stockJobSuggestion, setStockJobSuggestion] = useState<StockSuggestion | null>(null);
  const [stockQuoteOffcutMatch, setStockQuoteOffcutMatch] = useState<OffcutBrainMatchResult | null>(null);
  const [stockJobOffcutMatch, setStockJobOffcutMatch] = useState<OffcutBrainMatchResult | null>(null);
  const [offcutRecommendations, setOffcutRecommendations] = useState<OffcutBrainRecommendation[]>([]);
  const [selectedQuotePartIndex, setSelectedQuotePartIndex] = useState<number | null>(null);
  const [jobsPage, setJobsPage] = useState<"create_job" | "job_process" | "job_dxf_reader">("job_process");
  const [quotesPage, setQuotesPage] = useState<"calculator" | "dxf_reader" | "pdf_reader" | "recent_quotes">("calculator");
  const [docsPage, setDocsPage] = useState<"purchase_orders" | "invoices" | "delivery_notes" | "recent_quotes">("purchase_orders");
  const [purchaseOrders, setPurchaseOrders] = useState<BusinessDocRecord[]>([]);
  const [invoicesDocs, setInvoicesDocs] = useState<BusinessDocRecord[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<BusinessDocRecord[]>([]);
  const [emailSettings, setEmailSettings] = useState<EmailSettingsRecord>({
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    imapUser: "",
    imapPass: "",
    fromName: "",
    fromEmail: "",
    autoNotifyJobDone: true
  });
  const [emailSettingsSaving, setEmailSettingsSaving] = useState(false);
  const [emailLinkingInbox, setEmailLinkingInbox] = useState(false);
  const [emailImapLinkStatus, setEmailImapLinkStatus] = useState<string | null>(null);
  const [emailFromInput, setEmailFromInput] = useState("");
  const [emailSubjectInput, setEmailSubjectInput] = useState("");
  const [emailBodyInput, setEmailBodyInput] = useState("");
  const [emailDetecting, setEmailDetecting] = useState(false);
  const [emailDetection, setEmailDetection] = useState<EmailDetectionResult | null>(null);
  const [emailDetectionUpdatedAt, setEmailDetectionUpdatedAt] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [autoImportedEmailDxfByUid, setAutoImportedEmailDxfByUid] = useState<Record<number, true>>({});
  const [processedEmailMap, setProcessedEmailMap] = useState<Record<number, ProcessedEmailRecord>>({});
  const [readEmailMap, setReadEmailMap] = useState<Record<number, true>>({});
  const [readEmailSeeded, setReadEmailSeeded] = useState(false);
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxLimit, setInboxLimit] = useState(100);
  const [inboxSearch, setInboxSearch] = useState("");
  const [outlookFolders, setOutlookFolders] = useState<OutlookFolderRecord[]>([]);
  const [selectedOutlookFolder, setSelectedOutlookFolder] = useState("inbox");
  const [selectedOutlookFilter, setSelectedOutlookFilter] = useState("all");
  const [graphEmailConnected, setGraphEmailConnected] = useState(false);
  const [graphEmailAuthBusy, setGraphEmailAuthBusy] = useState(false);
  const [graphEmailSyncing, setGraphEmailSyncing] = useState(false);
  const [graphEmailAccountEmail, setGraphEmailAccountEmail] = useState("");
  const [graphDeviceFlow, setGraphDeviceFlow] = useState<{
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
    message: string;
  } | null>(null);
  const [inboxTab, setInboxTab] = useState<"focused" | "other">("focused");
  const [inboxHistoryLoaded, setInboxHistoryLoaded] = useState(false);
  const [selectedInboxUid, setSelectedInboxUid] = useState<number | null>(null);
  const [selectedDetectionUid, setSelectedDetectionUid] = useState<number | null>(null);
  const [boardDetectionsByUid, setBoardDetectionsByUid] = useState<Record<number, EmailDetectionResult | null>>({});
  const boardDetectionSignatureRef = useRef<Record<number, string>>({});
  const detectionRuleVersion = "2026-02-16-email-detect-v2";
  const autoPoJobStatusRef = useRef<Record<number, "processing" | "done" | "failed">>({});
  const autoPoBaselineUidRef = useRef<number | null>(null);
  const [selectedInboxBody, setSelectedInboxBody] = useState("");
  const [selectedInboxDetailLoading, setSelectedInboxDetailLoading] = useState(false);
  const [selectedInboxDetailError, setSelectedInboxDetailError] = useState<string | null>(null);
  const [selectedInboxAttachments, setSelectedInboxAttachments] = useState<InboxMessage["attachments"]>([]);
  const [proofOfPaymentBusy, setProofOfPaymentBusy] = useState(false);
  const [inboxAttachmentPreviews, setInboxAttachmentPreviews] = useState<Record<string, InboxAttachmentPreview>>({});
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [emailComposerPreviewOpen, setEmailComposerPreviewOpen] = useState(false);
  const [emailComposerPolishing, setEmailComposerPolishing] = useState(false);
  const [emailSendTo, setEmailSendTo] = useState("");
  const [emailSendSubject, setEmailSendSubject] = useState("");
  const [emailSendBody, setEmailSendBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [poTitle, setPoTitle] = useState("");
  const [poCustomerId, setPoCustomerId] = useState("");
  const [poAmount, setPoAmount] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [invoiceCustomerId, setInvoiceCustomerId] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState("");
  const [quoteSearchTerm, setQuoteSearchTerm] = useState("");
  const [selectedInvoiceDocId, setSelectedInvoiceDocId] = useState<string | null>(null);
  const [invoicePreviewUrl, setInvoicePreviewUrl] = useState<string | null>(null);
  const [invoicePreviewLoading, setInvoicePreviewLoading] = useState(false);
  const [selectedRecentQuoteId, setSelectedRecentQuoteId] = useState<string | null>(null);
  const [quotePreviewUrl, setQuotePreviewUrl] = useState<string | null>(null);
  const [quotePreviewLoading, setQuotePreviewLoading] = useState(false);
  const [imageToDxfFile, setImageToDxfFile] = useState<File | null>(null);
  const [imageToDxfThreshold, setImageToDxfThreshold] = useState("170");
  const [imageToDxfCurveSteps, setImageToDxfCurveSteps] = useState("60");
  const [imageToDxfMmPerPixel, setImageToDxfMmPerPixel] = useState("1");
  const [imageToDxfLayer, setImageToDxfLayer] = useState("OUTLINE");
  const [imageToDxfBusy, setImageToDxfBusy] = useState(false);
  const [imageToDxfStatus, setImageToDxfStatus] = useState<string | null>(null);
  const [imageToDxfResultFileName, setImageToDxfResultFileName] = useState<string | null>(null);
  const [imageToDxfResultBase64, setImageToDxfResultBase64] = useState<string | null>(null);
  const [imageToDxfPreviewDataUrl, setImageToDxfPreviewDataUrl] = useState<string | null>(null);
  const [imageToDxfResultStats, setImageToDxfResultStats] = useState<{
    polylineCount?: number;
    segmentCount?: number;
  } | null>(null);
  const [deliveryTitle, setDeliveryTitle] = useState("");
  const [deliveryCustomerId, setDeliveryCustomerId] = useState("");
  const [deliveryNotesText, setDeliveryNotesText] = useState("");
  const [deliveryQuoteId, setDeliveryQuoteId] = useState("");
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
  const [weldParts, setWeldParts] = useState<
    Array<{
      name: string;
      weldLengthMm: number;
      thicknessMm: number;
      material: string;
      quantity: number;
      pricePerMeter: number;
    }>
  >([]);
  const [weldingRates, setWeldingRates] = useState<
    Array<{ material: string; thicknessMm: number; pricePerMeter: number }>
  >([]);
  const [newWeldingRateMaterial, setNewWeldingRateMaterial] = useState("Mild Steel");
  const [newWeldingRateThickness, setNewWeldingRateThickness] = useState("");
  const [newWeldingRatePrice, setNewWeldingRatePrice] = useState("");
  const [bendParts, setBendParts] = useState<
    Array<{
      name: string;
      bendLengthMm: number;
      thicknessMm: number;
      material: string;
      quantity: number;
      bendCount: number;
      shortPricePerBend: number;
      longPricePerBend: number;
    }>
  >([]);
  const [bendingRates, setBendingRates] = useState<
    Array<{ material: string; thicknessMm: number; shortPricePerBend: number; longPricePerBend: number }>
  >([]);
  const [newBendingRateMaterial, setNewBendingRateMaterial] = useState("Mild Steel");
  const [newBendingRateThickness, setNewBendingRateThickness] = useState("");
  const [newBendingShortPrice, setNewBendingShortPrice] = useState("");
  const [newBendingLongPrice, setNewBendingLongPrice] = useState("");
  const [rollingParts, setRollingParts] = useState<
    Array<{
      name: string;
      diameterMm: number;
      heightMm: number;
      rollingLengthMm: number;
      thicknessMm: number;
      material: string;
      quantity: number;
      pricePerMeter: number;
    }>
  >([]);
  const [rollingRates, setRollingRates] = useState<
    Array<{ material: string; thicknessMm: number; pricePerMeter: number }>
  >([]);
  const [newRollingRateMaterial, setNewRollingRateMaterial] = useState("Mild Steel");
  const [newRollingRateThickness, setNewRollingRateThickness] = useState("");
  const [newRollingRatePrice, setNewRollingRatePrice] = useState("");
  const [cloudSyncSettings, setCloudSyncSettings] = useState<CloudSyncSettingsRecord>({
    enabled: false,
    companyId: "",
    deviceName: deviceId,
    role: "operator",
    adminMode: false,
    updatedAt: ""
  });
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string | null>(null);
  const [cloudDashboard, setCloudDashboard] = useState<CompanyDashboardRecord | null>(null);
  const [cloudEvents, setCloudEvents] = useState<CloudSyncEventRecord[]>([]);
  const [brainEvents, setBrainEvents] = useState<BrainEventRecord[]>([]);
  const [brainRecommendations, setBrainRecommendations] = useState<BrainRecommendationRecord[]>([]);
  const [brainDashboard, setBrainDashboard] = useState<BrainDashboardRecord | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);
  const [brainError, setBrainError] = useState<string | null>(null);
  const [brainCenterDetail, setBrainCenterDetail] = useState<
    | "profit"
    | "materials"
    | "offcuts"
    | "queue"
    | "lead_time"
    | "dxf_errors"
    | "events"
    | "nesting_purchasing"
    | "production_assistant"
    | null
  >(null);
  const [manufacturingMemories, setManufacturingMemories] = useState<ManufacturingMemoryRecord[]>([]);
  const [manufacturingPatterns, setManufacturingPatterns] = useState<KnownPatternRecord[]>([]);
  const [manufacturingMemoryLoading, setManufacturingMemoryLoading] = useState(false);
  const [manufacturingMemoryError, setManufacturingMemoryError] = useState<string | null>(null);
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);
  const [profitRecords, setProfitRecords] = useState<ProfitRecord[]>([]);
  const [profitInsights, setProfitInsights] = useState<ProfitInsight[]>([]);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitError, setProfitError] = useState<string | null>(null);
  const [materialForecasts, setMaterialForecasts] = useState<MaterialUsageForecastRecord[]>([]);
  const [materialShortages, setMaterialShortages] = useState<MaterialShortageRecord[]>([]);
  const [purchaseRecommendations, setPurchaseRecommendations] = useState<PurchaseRecommendationRecord[]>([]);
  const [materialPredictionLoading, setMaterialPredictionLoading] = useState(false);
  const [materialPredictionError, setMaterialPredictionError] = useState<string | null>(null);
  const [productionQueuePlan, setProductionQueuePlan] = useState<ProductionQueuePlanRecord | null>(null);
  const [productionQueueScores, setProductionQueueScores] = useState<ProductionQueueScoreRecord[]>([]);
  const [productionQueueLoading, setProductionQueueLoading] = useState(false);
  const [productionQueueError, setProductionQueueError] = useState<string | null>(null);
  const [leadTimePrediction, setLeadTimePrediction] = useState<LeadTimePredictionRecord | null>(null);
  const [leadTimeLoading, setLeadTimeLoading] = useState(false);
  const [leadTimeError, setLeadTimeError] = useState<string | null>(null);
  const [sheetOptimizerMaterial, setSheetOptimizerMaterial] = useState("Mild Steel");
  const [sheetOptimizerThickness, setSheetOptimizerThickness] = useState("1.5");
  const [sheetOptimizerWidth, setSheetOptimizerWidth] = useState("1000");
  const [sheetOptimizerHeight, setSheetOptimizerHeight] = useState("800");
  const [sheetOptimizerResult, setSheetOptimizerResult] = useState<SheetOptimizationResultRecord | null>(null);
  const [sheetOptimizerLoading, setSheetOptimizerLoading] = useState(false);
  const [sheetOptimizerError, setSheetOptimizerError] = useState<string | null>(null);
  const [nestingPlans, setNestingPlans] = useState<NestingPlanRecord[]>([]);
  const [nestingSkippedGroups, setNestingSkippedGroups] = useState<NestingSkippedGroupRecord[]>([]);
  const [nestingLoading, setNestingLoading] = useState(false);
  const [nestingError, setNestingError] = useState<string | null>(null);
  const [advancedNestMaterial, setAdvancedNestMaterial] = useState("Mild Steel");
  const [advancedNestThickness, setAdvancedNestThickness] = useState("3");
  const [advancedNestSheetWidth, setAdvancedNestSheetWidth] = useState("3000");
  const [advancedNestSheetHeight, setAdvancedNestSheetHeight] = useState("1500");
  const [advancedNestKerf, setAdvancedNestKerf] = useState("0.2");
  const [advancedNestBorder, setAdvancedNestBorder] = useState("10");
  const [advancedNestSpacing, setAdvancedNestSpacing] = useState("5");
  const [advancedNestAllowCommonLine, setAdvancedNestAllowCommonLine] = useState(true);
  const [advancedNestEnableMicroJoins, setAdvancedNestEnableMicroJoins] = useState(true);
  const [advancedNestLeadInType, setAdvancedNestLeadInType] = useState<"line" | "arc">("line");
  const [advancedNestLeadInLength, setAdvancedNestLeadInLength] = useState("3");
  const [advancedNestResult, setAdvancedNestResult] = useState<AdvancedNestingPlanRecord | null>(null);
  const [nestingStudioCustomer, setNestingStudioCustomer] = useState("Walk-in");
  const [nestingStudioNestName, setNestingStudioNestName] = useState("Nesting Studio");
  const [nestingStudioMaterial, setNestingStudioMaterial] = useState("Mild Steel");
  const [nestingStudioThickness, setNestingStudioThickness] = useState("3");
  const [nestingStudioSheetWidth, setNestingStudioSheetWidth] = useState("3000");
  const [nestingStudioSheetHeight, setNestingStudioSheetHeight] = useState("1500");
  const [nestingStudioKerf, setNestingStudioKerf] = useState("0.2");
  const [nestingStudioSpacing, setNestingStudioSpacing] = useState("5");
  const [nestingStudioBorder, setNestingStudioBorder] = useState("10");
  const [nestingStudioResult, setNestingStudioResult] = useState<NestingStudioResult | null>(null);
  const [nestingStudioExportPath, setNestingStudioExportPath] = useState<string | null>(null);
  const [nestingStudioExport, setNestingStudioExport] = useState<NestingStudioExportRecord | null>(null);
  const [nestingStudioLoading, setNestingStudioLoading] = useState(false);
  const [nestingStudioError, setNestingStudioError] = useState<string | null>(null);
  const [nestingStudioSelectedPartId, setNestingStudioSelectedPartId] = useState<string | null>(null);
  const [nestingStudioSnapToGrid, setNestingStudioSnapToGrid] = useState(true);
  const [nestingStudioShowSpacingBoundary, setNestingStudioShowSpacingBoundary] = useState(true);
  const [nestingStudioShowNfpDebug, setNestingStudioShowNfpDebug] = useState(false);
  const [nestingStudioOffcuts, setNestingStudioOffcuts] = useState<NestingOffcutRecord[]>([]);
  const [nestingStudioSelectedOffcutId, setNestingStudioSelectedOffcutId] = useState<number | null>(null);
  const [nestingStudioOffcutRecommendation, setNestingStudioOffcutRecommendation] = useState<NestingStudioOffcutRecommendation | null>(null);
  const nestingStudioCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nestingStudioDragRef = useRef<{ partId: string; offsetX: number; offsetY: number } | null>(null);
  const [nestingWorkspaceItems, setNestingWorkspaceItems] = useState<NestingWorkspaceRecord[]>([]);
  const [nestingWorkspaceActive, setNestingWorkspaceActive] = useState<NestingWorkspaceRecord | null>(null);
  const [nestingWorkspaceOffcuts, setNestingWorkspaceOffcuts] = useState<NestingOffcutRecord[]>([]);
  const [nestingWorkspaceHistory, setNestingWorkspaceHistory] = useState<NestingWorkspaceRecord[]>([]);
  const [nestingWorkspaceRecommendation, setNestingWorkspaceRecommendation] = useState<NestingOffcutRecommendation | null>(null);
  const [nestingWorkspaceLoading, setNestingWorkspaceLoading] = useState(false);
  const [nestingWorkspaceError, setNestingWorkspaceError] = useState<string | null>(null);
  const [nestingWorkspaceCustomerId, setNestingWorkspaceCustomerId] = useState("");
  const [nestingWorkspaceCustomerName, setNestingWorkspaceCustomerName] = useState("Walk-in");
  const [nestingWorkspaceNestName, setNestingWorkspaceNestName] = useState("New Nest");
  const [nestingWorkspaceMaterial, setNestingWorkspaceMaterial] = useState("Mild Steel");
  const [nestingWorkspaceThickness, setNestingWorkspaceThickness] = useState("3");
  const [nestingWorkspaceSheetWidth, setNestingWorkspaceSheetWidth] = useState("3000");
  const [nestingWorkspaceSheetHeight, setNestingWorkspaceSheetHeight] = useState("1500");
  const [nestingWorkspaceBorder, setNestingWorkspaceBorder] = useState("10");
  const [nestingWorkspaceKerf, setNestingWorkspaceKerf] = useState("0.2");
  const [nestingWorkspaceSpacing, setNestingWorkspaceSpacing] = useState("5");
  const [nestingWorkspaceAllowRotation, setNestingWorkspaceAllowRotation] = useState(true);
  const [nestingWorkspaceAllowCommonLine, setNestingWorkspaceAllowCommonLine] = useState(true);
  const [nestingWorkspaceEnableMicroJoins, setNestingWorkspaceEnableMicroJoins] = useState(true);
  const [nestingWorkspaceLeadInType, setNestingWorkspaceLeadInType] = useState<"line" | "arc">("line");
  const [nestingWorkspaceLeadInLength, setNestingWorkspaceLeadInLength] = useState("3");
  const [nestingWorkspaceSelectedPlacementId, setNestingWorkspaceSelectedPlacementId] = useState<number | null>(null);
  const [nestingWorkspaceManualMode, setNestingWorkspaceManualMode] = useState(false);
  const [nestingWorkspaceShowGrid, setNestingWorkspaceShowGrid] = useState(true);
  const [nestingWorkspaceShowCollision, setNestingWorkspaceShowCollision] = useState(true);
  const [nestingWorkspaceShowBorder, setNestingWorkspaceShowBorder] = useState(true);
  const [nestingWorkspaceShowBoundingBoxes, setNestingWorkspaceShowBoundingBoxes] = useState(false);
  const [nestingWorkspaceZoom, setNestingWorkspaceZoom] = useState(1);
  const [productionAssistantMessages, setProductionAssistantMessages] = useState<
    Array<{ role: "user" | "assistant"; text: string; at: string; response?: ProductionAssistantResponse | null }>
  >([]);
  const [productionAssistantInput, setProductionAssistantInput] = useState("");
  const [productionAssistantLoading, setProductionAssistantLoading] = useState(false);
  const [productionAssistantError, setProductionAssistantError] = useState<string | null>(null);
  const [dxfErrorFile, setDxfErrorFile] = useState<File | null>(null);
  const [dxfErrorThickness, setDxfErrorThickness] = useState("1.5");
  const [dxfErrorResult, setDxfErrorResult] = useState<DxfErrorCheckResult | null>(null);
  const [dxfErrorLoading, setDxfErrorLoading] = useState(false);
  const [dxfErrorError, setDxfErrorError] = useState<string | null>(null);
  const [regeneratingJobCards, setRegeneratingJobCards] = useState(false);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const autoJobCardBaselineRef = useRef<Set<string>>(new Set());
  const autoJobCardBaselineReadyRef = useRef(false);
  const autoJobCardStartTimeRef = useRef<number>(Date.now());
  const seenAccountRequestIdsRef = useRef<Set<number>>(new Set());
  const effectiveApiUrl = apiBaseUrl;
  const apiUrlCandidates = useMemo(() => buildApiUrlCandidates(effectiveApiUrl), [effectiveApiUrl]);

  const socket: Socket = useMemo(() => {
    return io(effectiveApiUrl, {
      transports: ["websocket"],
      auth: token ? { token } : undefined,
      autoConnect: !offlineBootMode
    });
  }, [token, offlineBootMode, effectiveApiUrl]);

  const isScanPage = window.location.pathname.startsWith("/scan");

  const activeServer = servers.find((server) => server.id === activeServerId) ?? servers[0];
  const activeChannel =
    activeServer?.channels.find((channel) => channel.id === activeChannelId) ??
    activeServer?.channels[0];
  const roomId = activeChannel?.name ?? "general";
  const canManageAccounts = user?.email?.trim().toLowerCase() === APP_OWNER_EMAIL;
  const selectedSupportThread =
    supportThreads.find((thread) => thread.threadKey === selectedSupportThreadKey) ?? supportThreads[0] ?? null;
  const workspaceLocked = Boolean(workspaceId) && billing.hasAccess === false && !canManageAccounts;
  const allowedFeatureSet = useMemo(() => {
    if (!deviceAllowedFeatures || deviceAllowedFeatures.length === 0) return null;
    return new Set<AppFeatureId>(deviceAllowedFeatures);
  }, [deviceAllowedFeatures]);
  const canOpenViewMode = (mode: ViewMode) => {
    if (workspaceLocked) {
      return mode === "billing" || mode === "settings";
    }
    if (mode === "billing") return true;
    if (mode === "admin_subscriptions") return canManageAccounts;
    if (mode === "settings") return true;
    if (!allowedFeatureSet) return true;
    if (mode === "nesting_workspace" && (allowedFeatureSet.has("nesting_studio") || allowedFeatureSet.has("nesting_intelligence"))) return true;
    if (mode === "nesting_studio" && (allowedFeatureSet.has("nesting_workspace") || allowedFeatureSet.has("nesting_intelligence"))) return true;
    if (mode === "production_assistant" && allowedFeatureSet.has("brain_center")) return true;
    return allowedFeatureSet.has(mode as AppFeatureId);
  };
  const sidebarItems: Array<{ id: ViewMode; label: string }> = [
    { id: "billing", label: "Bill" },
    { id: "settings", label: "Settings" },
    { id: "brain_center", label: "Brain" },
    { id: "chat", label: "Chat" },
    { id: "jobs", label: "Jobs" },
    { id: "email", label: "Email" },
    { id: "part_dna", label: "Part DNA" },
    { id: "quotes", label: "Quotes" },
    { id: "documents", label: "Docs" },
    { id: "customers", label: "Cust" },
    { id: "image_dxf", label: "ImgDXF" },
    { id: "ai_assistant", label: "Queue" },
    { id: "nesting_workspace", label: "Nest" },
    { id: "company_live", label: "Live" },
    { id: "admin_subscriptions", label: "Subs" }
  ];
  const visibleSidebarItems = sidebarItems.filter((item) => canOpenViewMode(item.id));
  const currentCloudDeviceRecord =
    cloudDashboard?.devices.find((device) => device.deviceId === deviceId) ?? null;
  const tankFittingsForSelectedGroup =
    SANITARY_FITTING_GROUPS.find((entry) => entry.group === tankFittingGroup)?.fittings ?? [];
  const emailSearchMatchesByUid = useMemo(() => {
    const query = inboxSearch.trim().toLowerCase();
    const map = new Map<number, { matched: boolean; attachmentMatches: string[] }>();
    if (!query) {
      inboxMessages.forEach((message) => {
        map.set(message.uid, { matched: true, attachmentMatches: [] });
      });
      return map;
    }
    inboxMessages.forEach((message) => {
      const plainHaystack = `${message.from} ${message.subject} ${message.snippet}`.toLowerCase();
      const attachments = message.attachments ?? [];
      const attachmentMatches = attachments
        .map((attachment) => attachment.name)
        .filter((name) => name.toLowerCase().includes(query) || isSimilarTextMatch(query, name));
      const matched = plainHaystack.includes(query) || attachmentMatches.length > 0;
      if (matched) {
        map.set(message.uid, { matched: true, attachmentMatches });
      }
    });
    return map;
  }, [inboxMessages, inboxSearch]);
  const filteredInboxMessages = useMemo(() => {
    if (!inboxSearch.trim()) return inboxMessages;
    return inboxMessages.filter((message) => emailSearchMatchesByUid.get(message.uid)?.matched);
  }, [inboxMessages, inboxSearch, emailSearchMatchesByUid]);
  const hasImapEmailConfigured = useMemo(
    () => Boolean(emailSettings.imapHost.trim() && emailSettings.imapUser.trim() && emailSettings.imapPass.trim()),
    [emailSettings.imapHost, emailSettings.imapUser, emailSettings.imapPass]
  );
  const isUsingGraphEmail = graphEmailConnected && !hasImapEmailConfigured;
  const emailFolderEntries = useMemo(
    () =>
      isUsingGraphEmail
        ? (outlookFolders.length
            ? outlookFolders
            : [
                { id: "inbox", displayName: "Inbox" },
                { id: "sent", displayName: "Sent" },
                { id: "drafts", displayName: "Drafts" },
                { id: "quote_requests", displayName: "Quote Requests" },
                { id: "purchase_orders", displayName: "Purchase Orders" },
                { id: "attachments", displayName: "Attachments" }
              ])
        : [
            { id: "inbox", displayName: "Inbox" },
            { id: "quote_requests", displayName: "Quote Requests" },
            { id: "purchase_orders", displayName: "Purchase Orders" },
            { id: "attachments", displayName: "Attachments" },
            { id: "customers", displayName: "Customers" }
          ],
    [isUsingGraphEmail, outlookFolders]
  );
  const focusedInboxMessages = useMemo(() => {
    const focusedKeywords = ["quote", "quotation", "rfq", "purchase order", "po", "invoice", "order", "job"];
    return filteredInboxMessages.filter((message) => {
      const text = `${message.subject} ${message.snippet}`.toLowerCase();
      return focusedKeywords.some((keyword) => text.includes(keyword));
    });
  }, [filteredInboxMessages]);
  const otherInboxMessages = useMemo(
    () => filteredInboxMessages.filter((message) => !focusedInboxMessages.some((entry) => entry.uid === message.uid)),
    [filteredInboxMessages, focusedInboxMessages]
  );
  const localFolderInboxMessages = useMemo(() => {
    const source =
      selectedOutlookFolder === "quote_requests"
        ? filteredInboxMessages.filter((message) => {
            const detection = boardDetectionsByUid[message.uid];
            return (
              message.detectedType === "quote_request" ||
              Boolean(detection?.quote) ||
              detection?.tags.includes("quote") ||
              Boolean(detection?.quoteCandidates.length)
            );
          })
        : selectedOutlookFolder === "purchase_orders"
          ? filteredInboxMessages.filter((message) => {
              const detection = boardDetectionsByUid[message.uid];
              return (
                message.detectedType === "purchase_order" ||
                detection?.tags.includes("purchase_order") ||
                Boolean(detection?.purchaseOrderCandidates.length)
              );
            })
          : selectedOutlookFolder === "attachments"
            ? filteredInboxMessages.filter((message) => (message.attachments ?? []).length > 0)
            : selectedOutlookFolder === "customers"
              ? filteredInboxMessages.filter((message) => Boolean(getInboxSenderName(message.from).trim()))
              : selectedOutlookFolder === "sent" || selectedOutlookFolder === "drafts"
                ? []
                : filteredInboxMessages;
    if (selectedOutlookFilter === "unread") {
      return source.filter((message) => !readEmailMap[message.uid]);
    }
    if (selectedOutlookFilter === "needs_review") {
      return source.filter((message) => message.detectedType === "needs_review");
    }
    return source;
  }, [filteredInboxMessages, selectedOutlookFolder, selectedOutlookFilter, boardDetectionsByUid, readEmailMap]);
  const activeInboxMessages = isUsingGraphEmail
    ? filteredInboxMessages
    : localFolderInboxMessages;
  const detectionBoardEntries = useMemo(() => {
    const results: DetectionBoardEntry[] = [];

    for (const message of inboxMessages) {
      const detection = boardDetectionsByUid[message.uid];
      if (!detection) continue;
      const attachmentNames = (message.attachments ?? []).map((attachment) => attachment.name);
      const looksLikeQuote = Boolean(detection.quote) || detection.tags.includes("quote") || detection.quoteCandidates.length > 0;
      const looksLikePo = detection.tags.includes("purchase_order") || detection.purchaseOrderCandidates.length > 0;

      if (looksLikeQuote) {
        results.push({
          message,
          kind: "quote",
          refs: detection.quoteCandidates,
          attachmentNames
        });
      }
      if (looksLikePo) {
        results.push({
          message,
          kind: "purchase_order",
          refs: detection.purchaseOrderCandidates,
          attachmentNames
        });
      }
    }

    return results.sort((a, b) => new Date(b.message.date).getTime() - new Date(a.message.date).getTime());
  }, [inboxMessages, boardDetectionsByUid]);
  const quoteDetectionEntries = useMemo(
    () => detectionBoardEntries.filter((entry) => entry.kind === "quote" && !processedEmailMap[entry.message.uid]),
    [detectionBoardEntries, processedEmailMap]
  );
  const purchaseOrderDetectionEntries = useMemo(
    () => detectionBoardEntries.filter((entry) => entry.kind === "purchase_order" && !processedEmailMap[entry.message.uid]),
    [detectionBoardEntries, processedEmailMap]
  );
  const doneDetectionEntries = useMemo(
    () =>
      detectionBoardEntries.reduce<Array<{ message: InboxMessage; kinds: string[]; refs: string[]; processedAt: string; actions: string[] }>>((acc, entry) => {
        const processed = processedEmailMap[entry.message.uid];
        if (!processed) return acc;
        const existing = acc.find((item) => item.message.uid === entry.message.uid);
        if (existing) {
          if (!existing.kinds.includes(entry.kind)) existing.kinds.push(entry.kind);
          existing.refs = [...new Set([...existing.refs, ...entry.refs])];
          existing.actions = [...new Set([...existing.actions, ...processed.actions])];
          return acc;
        }
        acc.push({
          message: entry.message,
          kinds: [entry.kind],
          refs: [...entry.refs],
          processedAt: processed.processedAt,
          actions: [...processed.actions]
        });
        return acc;
      }, []),
    [detectionBoardEntries, processedEmailMap]
  );
  const selectedInboxMessage = useMemo(() => {
    if (selectedInboxUid != null) {
      const selectedFromActive = activeInboxMessages.find((message) => message.uid === selectedInboxUid);
      if (selectedFromActive) return selectedFromActive;
      const selectedFromAll = inboxMessages.find((message) => message.uid === selectedInboxUid);
      if (selectedFromAll) return selectedFromAll;
    }
    if (activeInboxMessages.length) return activeInboxMessages[0];
    return inboxMessages[0] ?? null;
  }, [activeInboxMessages, inboxMessages, selectedInboxUid]);
  const selectedInboxMessageAttachments = mergeInboxAttachments(selectedInboxMessage?.attachments ?? [], selectedInboxAttachments);
  const selectedInboxDisplayBody = selectedInboxBody || selectedInboxMessage?.body || selectedInboxMessage?.snippet || "";
  const emailSendPreviewHtml = buildEmailPreviewHtml({
    subject: emailSendSubject,
    body: emailSendBody,
    fromName: emailSettings.fromName || "Qouterx",
    fromEmail: emailSettings.fromEmail || "you@company.com",
    to: emailSendTo
  });
  const selectedDetectionMessage = useMemo(() => {
    if (selectedDetectionUid != null) {
      const selected = inboxMessages.find((message) => message.uid === selectedDetectionUid) ?? null;
      if (selected) return selected;
    }
    const firstDetected = detectionBoardEntries[0]?.message ?? null;
    return firstDetected;
  }, [inboxMessages, selectedDetectionUid, detectionBoardEntries]);
  const autoInvoiceDocs = useMemo<InvoiceDocRecord[]>(
    () =>
      quotes
        .filter((quote) => quote.status === "accepted")
        .map((quote) => ({
          id: `inv-quote-${quote.id}`,
          number: `INV-${quote.quoteNumber}`,
          title: quote.title?.trim() || "Invoice",
          customerName: quote.customerName?.trim() || "-",
          amount: quote.total ?? 0,
          notes: `Source Quote: ${quote.quoteNumber}`,
          createdAt: quote.createdAt,
          source: "quote",
          quoteId: quote.id,
          quoteStatus: quote.status
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [quotes]
  );
  const mergedInvoiceDocs = useMemo<InvoiceDocRecord[]>(
    () => {
      const merged = new Map<string, InvoiceDocRecord>();
      autoInvoiceDocs.forEach((doc) => merged.set(doc.number, doc));
      invoicesDocs.forEach((doc) => {
        if (merged.has(doc.number)) return;
        merged.set(doc.number, {
          ...doc,
          source: doc.quoteId ? "quote" : "manual",
          quoteId: doc.quoteId
        });
      });
      return Array.from(merged.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    [autoInvoiceDocs, invoicesDocs]
  );
  const filteredInvoiceDocs = useMemo<InvoiceDocRecord[]>(() => {
    const query = invoiceSearchTerm.trim().toLowerCase();
    if (!query) return mergedInvoiceDocs;
    return mergedInvoiceDocs.filter((doc) => {
      const haystack = `${doc.number} ${doc.title} ${doc.customerName} ${doc.notes ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [mergedInvoiceDocs, invoiceSearchTerm]);
  const selectedInvoiceDoc = useMemo(
    () => filteredInvoiceDocs.find((doc) => doc.id === selectedInvoiceDocId) ?? filteredInvoiceDocs[0] ?? null,
    [filteredInvoiceDocs, selectedInvoiceDocId]
  );
  const groupedInvoiceDocs = useMemo(
    () =>
      Array.from(
        filteredInvoiceDocs.reduce((map, doc) => {
          const key = doc.customerName?.trim() || "Unassigned";
          const list = map.get(key) ?? [];
          list.push(doc);
          map.set(key, list);
          return map;
        }, new Map<string, InvoiceDocRecord[]>())
      ),
    [filteredInvoiceDocs]
  );
  const selectedInvoiceQuoteId = useMemo(() => {
    if (!selectedInvoiceDoc) return null;
    if (selectedInvoiceDoc.quoteId) return selectedInvoiceDoc.quoteId;
    const quoteNumberGuess = selectedInvoiceDoc.number.replace(/^INV-/, "");
    const matched = quotes.find((quote) => quote.quoteNumber === quoteNumberGuess);
    return matched?.id ?? null;
  }, [selectedInvoiceDoc, quotes]);
  const filteredRecentQuotes = useMemo(() => {
    const query = quoteSearchTerm.trim().toLowerCase();
    if (!query) return quotes;
    return quotes.filter((quote) => {
      const haystack = `${quote.quoteNumber} ${quote.title} ${quote.customerName ?? ""} ${quote.status} ${quote.total ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [quotes, quoteSearchTerm]);
  const groupedRecentQuotes = useMemo(
    () =>
      Array.from(
        filteredRecentQuotes.reduce((map, quote) => {
          const key = quote.customerName?.trim() || "Unassigned";
          const list = map.get(key) ?? [];
          list.push(quote);
          map.set(key, list);
          return map;
        }, new Map<string, QuoteRecord[]>())
      ),
    [filteredRecentQuotes]
  );
  const groupedPartDnaLibrary = useMemo(
    () =>
      Array.from(
        partDnaLibrary.reduce((map, part) => {
          const key = part.customerName?.trim() || "Unassigned Customer";
          const list = map.get(key) ?? [];
          list.push(part);
          map.set(key, list);
          return map;
        }, new Map<string, PartDnaLibraryEntry[]>())
      ),
    [partDnaLibrary]
  );
  const selectedRecentQuote = useMemo(
    () => filteredRecentQuotes.find((quote) => quote.id === selectedRecentQuoteId) ?? filteredRecentQuotes[0] ?? null,
    [filteredRecentQuotes, selectedRecentQuoteId]
  );

  useEffect(() => {
    if (docsPage !== "invoices") return;
    if (!filteredInvoiceDocs.length) {
      setSelectedInvoiceDocId(null);
      return;
    }
    if (selectedInvoiceDocId && filteredInvoiceDocs.some((doc) => doc.id === selectedInvoiceDocId)) return;
    setSelectedInvoiceDocId(filteredInvoiceDocs[0].id);
  }, [docsPage, filteredInvoiceDocs, selectedInvoiceDocId]);

  useEffect(() => {
    if (quotesPage !== "recent_quotes") return;
    if (!filteredRecentQuotes.length) {
      setSelectedRecentQuoteId(null);
      return;
    }
    if (selectedRecentQuoteId && filteredRecentQuotes.some((quote) => quote.id === selectedRecentQuoteId)) return;
    setSelectedRecentQuoteId(filteredRecentQuotes[0].id);
  }, [quotesPage, filteredRecentQuotes, selectedRecentQuoteId]);

  useEffect(() => {
    if (viewMode !== "part_dna" || !workspaceId) return;
    void loadPartDnaLibrary();
  }, [viewMode, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setInvoicePreviewUrl(null);
    if (!selectedInvoiceDoc || !selectedInvoiceQuoteId) {
      setInvoicePreviewLoading(false);
      return () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }
    setInvoicePreviewLoading(true);
    void (async () => {
      const file = await fetchQuotePdfBlob(selectedInvoiceQuoteId, { download: false, documentType: "invoice" });
      if (cancelled) return;
      if (!file) {
        setInvoicePreviewLoading(false);
        return;
      }
      objectUrl = URL.createObjectURL(file.blob);
      setInvoicePreviewUrl(objectUrl);
      setInvoicePreviewLoading(false);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedInvoiceDoc, selectedInvoiceQuoteId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setQuotePreviewUrl(null);
    if (!selectedRecentQuote) {
      setQuotePreviewLoading(false);
      return () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }
    setQuotePreviewLoading(true);
    void (async () => {
      const file = await fetchQuotePdfBlob(selectedRecentQuote.id, { download: false, documentType: "quote" });
      if (cancelled) return;
      if (!file) {
        setQuotePreviewLoading(false);
        return;
      }
      objectUrl = URL.createObjectURL(file.blob);
      setQuotePreviewUrl(objectUrl);
      setQuotePreviewLoading(false);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedRecentQuote]);

  function getInboxSenderName(from: string) {
    const trimmed = from.trim();
    if (!trimmed) return "Unknown Sender";
    const match = trimmed.match(/^"?([^"<]+)"?\s*<[^>]+>$/);
    if (match?.[1]) return match[1].trim();
    const emailMatch = trimmed.match(/<([^>]+)>/);
    return (emailMatch?.[1] ?? trimmed).trim();
  }

  function getInboxTimeLabel(dateValue: string) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit" });
  }

  function getInboxInitials(from: string) {
    const name = getInboxSenderName(from);
    const words = name
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!words.length) return "EM";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }

  function setMessageAsDetectionPreview(message: InboxMessage) {
    setSelectedInboxUid(message.uid);
    setSelectedDetectionUid(message.uid);
    markInboxEmailRead(message.uid);
    setEmailFromInput(message.from);
    setEmailSubjectInput(message.subject);
    setEmailBodyInput(cleanEmailDisplayText(message.snippet || ""));
  }

  function normalizeSearchText(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function isSimilarTextMatch(query: string, target: string) {
    const q = normalizeSearchText(query);
    const t = normalizeSearchText(target);
    if (!q || !t) return false;
    if (t.includes(q) || q.includes(t)) return true;
    if (q.length >= 3 && t.startsWith(q.slice(0, Math.min(q.length, 6)))) return true;
    return false;
  }


  function getAttachmentPreviewKey(uid: number, part: string) {
    return `${uid}:${part}`;
  }

  function mergeInboxAttachments(...groups: Array<InboxAttachmentMeta[] | undefined>) {
    const merged: InboxAttachmentMeta[] = [];
    const seen = new Set<string>();
    groups.forEach((group) => {
      (group ?? []).forEach((attachment) => {
        const key = `${attachment.part}:${attachment.name}:${attachment.contentType}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(attachment);
      });
    });
    return merged;
  }

  function isPngAttachment(attachment: { name: string; contentType: string }) {
    const name = attachment.name.toLowerCase();
    const contentType = attachment.contentType.toLowerCase();
    return contentType.includes("image/png") || name.endsWith(".png");
  }

  function isPdfAttachment(attachment: { name: string; contentType: string }) {
    const name = attachment.name.toLowerCase();
    const contentType = attachment.contentType.toLowerCase();
    return contentType.includes("application/pdf") || name.endsWith(".pdf");
  }

  function isDxfAttachment(attachment: { name: string; contentType: string }) {
    const name = attachment.name.toLowerCase();
    const contentType = attachment.contentType.toLowerCase();
    return contentType.includes("dxf") || name.endsWith(".dxf");
  }

  function isPreviewableAttachment(attachment: { name: string; contentType: string }) {
    return isPngAttachment(attachment) || isPdfAttachment(attachment) || isDxfAttachment(attachment);
  }

  function getAttachmentOpenContentType(attachment: { name: string; contentType: string }) {
    const contentType = attachment.contentType?.trim().toLowerCase() || "";
    if (contentType && contentType !== "application/octet-stream") return contentType;
    if (isPdfAttachment(attachment)) return "application/pdf";
    if (isPngAttachment(attachment)) return "image/png";
    if (isDxfAttachment(attachment)) return "application/dxf";
    return attachment.contentType || "application/octet-stream";
  }

  function decodeBase64Text(base64: string) {
    try {
      return atob(base64);
    } catch {
      return "";
    }
  }

  function decodeQuotedPrintableText(input: string) {
    return input
      .replace(/=\r?\n/g, "")
      .replace(/=([A-Fa-f0-9]{2})/g, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  }

  function stripHtmlForDisplay(input: string) {
    return input
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  function cleanEmailDisplayText(input: string) {
    let text = input.replace(/\r/g, "");
    text = decodeQuotedPrintableText(text);
    if (/<html|<body|<div|<span|<meta|<head|<font/i.test(text)) {
      text = stripHtmlForDisplay(text);
    }
    text = text
      .replace(/^--[^\n]+$/gm, "")
      .replace(/^\s*boundary\s*=\s*["']?[^"'\n]+["']?\s*;?\s*$/gim, "")
      .replace(/^\s*type\s*=\s*["']?[^"'\n]+["']?\s*;?\s*$/gim, "")
      .replace(/^\s*charset\s*=\s*["']?[^"'\n]+["']?\s*;?\s*$/gim, "")
      .replace(/^\s*name\s*=\s*["']?[^"'\n]+["']?\s*;?\s*$/gim, "")
      .replace(/^\s*filename\s*=\s*["']?[^"'\n]+["']?\s*;?\s*$/gim, "")
      .replace(/^\s*content-disposition\s*:\s*[^\n]+$/gim, "")
      .replace(/^\s*content-transfer-encoding\s*:\s*[^\n]+$/gim, "")
      .replace(/^\s*content-[^\n]+$/gim, "")
      .replace(/^\s*meta\s+[^=\n]+=[^\n]+$/gim, "")
      .replace(/^\s*\[cid:[^\]]+\]\s*$/gim, "")
      .replace(/\bcid:[^\s>\]]+/gim, "")
      .replace(/(?:^|\n)(?:[A-Za-z0-9+\/]{80,}={0,2}\n?){2,}/g, "\n")
      .replace(/^\s*[A-Za-z0-9+\/]{120,}={0,2}\s*$/gm, "")
      .replace(/^\s*(?:mime-version|x-[a-z0-9-]+)\s*:\s*[^\n]+$/gim, "")
      .trim();

    const lines = text
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (/^(?:charset|name|filename|boundary|content-type|content-transfer-encoding|content-disposition)\b/i.test(trimmed)) {
          return false;
        }
        const compact = trimmed.replace(/\s+/g, "");
        const base64Chars = (compact.match(/[A-Za-z0-9+/=]/g) ?? []).length;
        const nonBase64Chars = compact.length - base64Chars;
        const base64Ratio = compact.length ? base64Chars / compact.length : 0;
        if (compact.length >= 80 && base64Ratio > 0.92 && nonBase64Chars <= 4) return false;
        if (compact.length >= 140 && /^[A-Za-z0-9+/=]+$/.test(compact)) return false;
        return true;
      });

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function titleCaseWords(value: string) {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function inferRecipientNameFromEmailAddress(value: string) {
    const match = value.match(/<?([A-Z0-9._%+-]+)@/i);
    const localPart = match?.[1] ?? value.trim();
    const cleaned = localPart.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    return titleCaseWords(cleaned);
  }

  function normalizeEmailDraftText(value: string) {
    let text = value.replace(/\r/g, "");
    const replacements: Array<[RegExp, string]> = [
      [/\bi\b/g, "I"],
      [/\bim\b/gi, "I'm"],
      [/\bid\b/gi, "I'd"],
      [/\bill\b/gi, "I'll"],
      [/\bdont\b/gi, "don't"],
      [/\bcant\b/gi, "can't"],
      [/\bwont\b/gi, "won't"],
      [/\bdoesnt\b/gi, "doesn't"],
      [/\bdidnt\b/gi, "didn't"],
      [/\bthx\b/gi, "Thanks"],
      [/\bpls\b/gi, "please"],
      [/\bpls\.\b/gi, "please"],
      [/\bu\b/gi, "you"]
    ];
    replacements.forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });
    text = text
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    text = text.replace(/(^|[.!?]\s+)([a-z])/g, (_m, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
    return text;
  }

  function polishEmailSubject(value: string) {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  function polishEmailBody(value: string, options?: { to?: string; fromName?: string }) {
    const cleaned = normalizeEmailDraftText(value);
    const recipientName = inferRecipientNameFromEmailAddress(options?.to ?? "");
    const hasGreeting = /^(dear|hello|hi|good day|good morning|good afternoon)\b/i.test(cleaned);
    const hasClosing = /(kind regards|regards|sincerely|best regards|thank you)[,\s]*$/i.test(cleaned);
    const greeting = recipientName ? `Dear ${recipientName},` : "Good day,";
    const senderName = options?.fromName?.trim() || "Qouterx";
    const bodyWithGreeting = hasGreeting ? cleaned : [greeting, "", cleaned].filter(Boolean).join("\n");
    return hasClosing ? bodyWithGreeting : [bodyWithGreeting, "", "Kind regards,", senderName].join("\n");
  }

  function buildEmailPreviewHtml(options: { subject: string; body: string; fromName: string; fromEmail: string; to: string }) {
    const escapedSubject = escapeHtml(options.subject || "(no subject)");
    const escapedTo = escapeHtml(options.to || "-");
    const escapedFromName = escapeHtml(options.fromName || "Qouterx");
    const escapedFromEmail = escapeHtml(options.fromEmail || "-");
    const paragraphs = options.body
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => `<p style="margin:0 0 14px;line-height:1.65;color:#1f2937;font-size:15px;">${escapeHtml(chunk).replace(/\n/g, "<br/>")}</p>`)
      .join("");
    return `
      <div style="background:#eef2f7;padding:24px;font-family:Georgia,'Times New Roman',serif;">
        <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #d7dee8;border-radius:18px;overflow:hidden;box-shadow:0 20px 50px rgba(15,23,42,0.12);">
          <div style="padding:24px 28px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);color:#ffffff;">
            <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:0.78;margin-bottom:10px;">Email Preview</div>
            <div style="font-size:30px;font-weight:700;line-height:1.15;">${escapedSubject}</div>
          </div>
          <div style="padding:20px 28px;border-bottom:1px solid #e5e7eb;background:#f8fafc;color:#334155;font-size:13px;line-height:1.7;">
            <div><strong>From:</strong> ${escapedFromName} &lt;${escapedFromEmail}&gt;</div>
            <div><strong>To:</strong> ${escapedTo}</div>
          </div>
          <div style="padding:28px;">${paragraphs || '<p style="margin:0;color:#64748b;">(empty email)</p>'}</div>
        </div>
      </div>
    `.trim();
  }

  function splitEmailIntoThreadSegments(input: string) {
    const cleaned = cleanEmailDisplayText(input);
    if (!cleaned) return [] as Array<{ title: string; body: string }>;

    const markerPattern =
      /(?:^|\n)(?:-{2,}\s*Original Message\s*-{2,}|On .+ wrote:|From:\s.+\nSent:\s.+\nTo:\s.+\nSubject:\s.+)/gim;

    const markers = Array.from(cleaned.matchAll(markerPattern)).map((match) => ({
      index: match.index ?? 0,
      marker: match[0].trim()
    }));

    if (!markers.length) {
      return [{ title: "Latest Message", body: cleaned }];
    }

    const segments: Array<{ title: string; body: string }> = [];
    const firstMarkerIndex = markers[0].index;
    const latestBody = cleaned.slice(0, firstMarkerIndex).trim();
    if (latestBody) {
      segments.push({ title: "Latest Message", body: latestBody });
    }

    for (let i = 0; i < markers.length; i += 1) {
      const start = markers[i].index;
      const end = i < markers.length - 1 ? markers[i + 1].index : cleaned.length;
      const chunk = cleaned.slice(start, end).trim();
      if (!chunk) continue;
      const header = markers[i].marker.startsWith("On ")
        ? markers[i].marker
        : `Previous Reply ${segments.length}`;
      segments.push({ title: header, body: chunk });
    }

    return segments;
  }

  function formatAttachmentSize(sizeBytes?: number) {
    const size = Number(sizeBytes);
    if (!Number.isFinite(size) || size <= 0) return "";
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${Math.floor(size)} B`;
  }

  function markInboxEmailProcessed(uid: number, action: string) {
    const normalizedAction = action.trim();
    if (!normalizedAction) return;
    setProcessedEmailMap((current) => {
      const existing = current[uid];
      const actions = existing ? Array.from(new Set([...existing.actions, normalizedAction])) : [normalizedAction];
      return {
        ...current,
        [uid]: {
          processedAt: new Date().toISOString(),
          actions
        }
      };
    });
  }

  function formatProcessedTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-ZA");
  }

  function formatSentTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-ZA");
  }

  function markInboxEmailRead(uid: number) {
    if (!Number.isFinite(uid) || uid <= 0) return;
    setReadEmailMap((current) => (current[uid] ? current : { ...current, [uid]: true }));
  }

  function normalizePartToken(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function parsePoQuantitiesFromText(source: string) {
    const text = source.replace(/\r/g, " ");
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const result = new Map<string, number>();
    const patterns = [
      /([A-Z0-9_.-]+\.(?:dxf|pdf|png))\s*(?:x|qty|quantity|q)\s*[:=]?\s*(\d+)/i,
      /(qty|quantity|q)\s*[:=]?\s*(\d+)\s*([A-Z0-9_.-]+\.(?:dxf|pdf|png))/i,
      /\b([A-Z0-9_.-]+)\s*[-:]\s*(\d+)\b/i
    ];
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (!match) continue;
        const candidateName = match[1]?.toLowerCase() === "qty" || match[1]?.toLowerCase() === "quantity" || match[1]?.toLowerCase() === "q"
          ? (match[3] ?? "")
          : match[1] ?? "";
        const candidateQty = Number(match[2]);
        if (!candidateName || !Number.isFinite(candidateQty) || candidateQty <= 0) continue;
        const token = normalizePartToken(candidateName);
        if (!token) continue;
        result.set(token, Math.max(1, Math.round(candidateQty)));
      }
    }
    return result;
  }

  function parsePoMaterialFromLine(line: string, materialOptions: string[]) {
    const lowered = line.toLowerCase();
    const normalizedOptions = [...new Set(materialOptions.map((entry) => entry.trim()).filter(Boolean))].sort(
      (a, b) => b.length - a.length
    );
    for (const option of normalizedOptions) {
      if (lowered.includes(option.toLowerCase())) return option;
    }
    if (/stainless\s*steel|ss\s*304|ss\s*316/i.test(line)) return "Stainless Steel";
    if (/mild\s*steel|ms\b/i.test(line)) return "Mild Steel";
    if (/aluminium|aluminum/i.test(line)) return "Aluminium";
    if (/galvanized|galvanised|galv\b/i.test(line)) return "Galvanized Steel";
    return undefined;
  }

  function parsePoThicknessFromLine(line: string) {
    const labeled = line.match(/\b(?:thickness|thk|th)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\b/i);
    const mm = line.match(/\b(\d+(?:[.,]\d+)?)\s*mm\b/i);
    const picked = labeled?.[1] ?? mm?.[1];
    const parsed = picked ? Number(picked.replace(",", ".")) : NaN;
    return Number.isFinite(parsed) ? normalizeJobDxfThickness(parsed) : undefined;
  }

  function parsePoQuantityFromLine(line: string) {
    const quantityPatterns = [
      /\b(?:qty|quantity|q)\s*[:=]?\s*(\d+)\b/i,
      /\bx\s*[:=]?\s*(\d+)\b/i,
      /\b(\d+)\s*(?:pcs?|pieces?|ea|each)\b/i
    ];
    for (const pattern of quantityPatterns) {
      const match = line.match(pattern);
      if (!match) continue;
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed));
    }
    return undefined;
  }

  function parsePurchaseOrderInsights(source: string, materialOptions: string[]): ParsedPurchaseOrderInsights {
    const lines = source
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const byToken = new Map<string, PoPartInsight>();
    let defaultMaterial: string | undefined;
    let defaultThicknessMm: number | undefined;
    let totalQuantity: number | undefined;

    for (const line of lines) {
      const tokenMatch = line.match(/([A-Z0-9_.-]+\.(?:dxf|pdf|png))\b/i);
      const quantity = parsePoQuantityFromLine(line);
      const material = parsePoMaterialFromLine(line, materialOptions);
      const thicknessMm = parsePoThicknessFromLine(line);

      if (!defaultMaterial && material) defaultMaterial = material;
      if (defaultThicknessMm === undefined && thicknessMm !== undefined) defaultThicknessMm = thicknessMm;

      const totalMatch = line.match(/\b(?:total|overall)\b.*\b(?:qty|quantity)\b[^0-9]*(\d+)\b/i);
      if (totalQuantity === undefined && totalMatch?.[1]) {
        const parsed = Number(totalMatch[1]);
        if (Number.isFinite(parsed) && parsed > 0) totalQuantity = Math.round(parsed);
      }

      if (!tokenMatch) continue;
      const token = normalizePartToken(tokenMatch[1]);
      if (!token) continue;
      const current = byToken.get(token) ?? {};
      byToken.set(token, {
        quantity: quantity ?? current.quantity,
        material: material ?? current.material,
        thicknessMm: thicknessMm ?? current.thicknessMm
      });
    }

    if (totalQuantity === undefined && byToken.size > 0) {
      const sum = Array.from(byToken.values()).reduce((acc, detail) => acc + (detail.quantity ?? 0), 0);
      if (sum > 0) totalQuantity = sum;
    }

    return { byToken, defaultMaterial, defaultThicknessMm, totalQuantity };
  }

  function pickPoInsightForPart(part: { name: string }, insights: ParsedPurchaseOrderInsights) {
    const candidates = [
      normalizePartToken(part.name),
      normalizePartToken(part.name.replace(/\.(dxf|pdf|png)$/i, "")),
      normalizePartToken(part.name.replace(/-part-\d+$/i, ""))
    ].filter(Boolean);
    for (const candidate of candidates) {
      const exact = insights.byToken.get(candidate);
      if (exact) return exact;
      for (const [token, detail] of insights.byToken.entries()) {
        if (token.includes(candidate) || candidate.includes(token)) {
          return detail;
        }
      }
    }
    return undefined;
  }

  async function extractTextFromPdfArrayBuffer(fileBuffer: ArrayBuffer) {
    const loadingTask = getDocument({ data: fileBuffer });
    const pdf = await loadingTask.promise;
    const chunks: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      chunks.push(pageText);
    }
    return chunks.join("\n");
  }

  function normalizePaymentRef(value: string) {
    return value.replace(/[^A-Z0-9-]/gi, "").toUpperCase();
  }

  function parseAmountToken(token: string) {
    const cleaned = token.replace(/[^\d,.-]/g, "").trim();
    if (!cleaned) return null;
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    let normalized = cleaned;
    if (lastComma >= 0 && lastDot >= 0) {
      normalized =
        lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
    } else if (lastComma >= 0) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function extractPaymentAmounts(text: string) {
    const matches = text.match(/(?:R|ZAR)\s*[\d][\d\s,.\-]*/gi) ?? [];
    const values = matches
      .map((token) => parseAmountToken(token))
      .filter((value): value is number => value !== null);
    return Array.from(new Set(values));
  }

  async function apiFetch(path: string, options: RequestInit = {}) {
    if (offlineBootMode) {
      throw new Error("Offline UI mode is active. Start the bundled API to use online features.");
    }
    const headers = new Headers(options.headers ?? undefined);
    if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const method = String(options.method ?? "GET").toUpperCase();
    const extraRetries = method === "GET" || method === "HEAD" ? 1 : 0;
    let lastError: unknown;
    for (let attempt = 0; attempt <= extraRetries; attempt += 1) {
      for (const baseUrl of apiUrlCandidates) {
        try {
          return await fetch(`${baseUrl}${path}`, { ...options, headers });
        } catch (error) {
          lastError = error;
        }
      }
      if (attempt < extraRetries) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Failed to fetch");
  }

  async function loadSupportThreads() {
    if (!token) return;
    if (!canManageAccounts && !workspaceId) return;
    setSupportLoading(true);
    setSupportStatus(null);
    try {
      const query = canManageAccounts ? "" : `?workspaceId=${encodeURIComponent(workspaceId ?? "")}`;
      const res = await apiFetch(`/api/support/threads${query}`);
      const data = (await res.json().catch(() => null)) as { error?: string; threads?: SupportThread[] } | null;
      if (!res.ok) {
        setSupportStatus(data?.error ?? "Failed to load support chats.");
        return;
      }
      const threads = data?.threads ?? [];
      setSupportThreads(threads);
      setSelectedSupportThreadKey((current) =>
        current && threads.some((thread) => thread.threadKey === current)
          ? current
          : threads[0]?.threadKey ?? null
      );
    } catch (error) {
      setSupportStatus(error instanceof Error ? error.message : "Failed to load support chats.");
    } finally {
      setSupportLoading(false);
    }
  }

  async function sendSupportMessage() {
    const messageText = text.trim();
    if (!messageText) return;
    const targetThread = selectedSupportThread;
    const targetWorkspaceId = canManageAccounts ? targetThread?.workspaceId : workspaceId;
    if (!targetWorkspaceId) {
      setSupportStatus(canManageAccounts ? "Select a user chat first." : "No workspace selected.");
      return;
    }
    if (canManageAccounts && !targetThread?.userId) {
      setSupportStatus("Select a user chat first.");
      return;
    }
    setSupportStatus(null);
    try {
      const res = await apiFetch("/api/support/messages", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: targetWorkspaceId,
          threadUserId: canManageAccounts ? targetThread?.userId : undefined,
          text: messageText
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setSupportStatus(data?.error ?? "Failed to send message.");
        return;
      }
      setText("");
      await loadSupportThreads();
    } catch (error) {
      setSupportStatus(error instanceof Error ? error.message : "Failed to send message.");
    }
  }

  async function getApiFailureDetail() {
    if (!window.desktopShell?.getApiStatus) return null;
    try {
      const status = await window.desktopShell.getApiStatus();
      if (!status.ok || !status.packaged) return null;
      const detailParts: string[] = [];
      if (status.error) detailParts.push(status.error);
      if (status.logPath) detailParts.push(`Backend log: ${status.logPath}`);
      return detailParts.length ? detailParts.join(" ") : null;
    } catch {
      return null;
    }
  }

  async function refreshRuntimeApiBaseUrl() {
    const loader = window.qouterx?.getApiBaseUrl ?? window.desktopShell?.getApiBaseUrl;
    if (!loader) return;
    try {
      const result = await loader();
      if (!result.ok || !result.url) return;
      setApiBaseUrl(result.url);
      setApiRuntimeStatus((current) => ({
        ...current,
        ok: true,
        packaged: result.packaged,
        running: result.running,
        mode: result.mode,
        url: result.url,
        error: result.running ? null : current.error
      }));
    } catch {
      // keep fallback
    }
  }

  async function loadGatewayApiConfig() {
    if (!window.desktopShell?.getApiConfig) return;
    try {
      const result = await window.desktopShell.getApiConfig();
      if (!result.ok) return;
      const nextUrl = result.gatewayApiUrl?.trim() ?? "";
      setGatewayApiUrl(nextUrl);
      if (nextUrl) {
        localStorage.setItem(DESKTOP_GATEWAY_API_URL_KEY, nextUrl);
      } else {
        localStorage.removeItem(DESKTOP_GATEWAY_API_URL_KEY);
      }
      if (result.activeApiUrl?.trim()) {
        setApiBaseUrl(result.activeApiUrl.trim());
      }
    } catch {
      // keep local fallback
    }
  }

  async function saveGatewayApiConfig() {
    const normalized = gatewayApiUrl.trim().replace(/\/+$/, "");
    setGatewayApiSaveStatus("Saving gateway...");
    try {
      if (window.desktopShell?.setApiConfig) {
        const result = await window.desktopShell.setApiConfig({ gatewayApiUrl: normalized || null });
        if (!result.ok) {
          setGatewayApiSaveStatus(result.error ?? "Failed to save gateway.");
          return;
        }
        if (result.activeApiUrl?.trim()) {
          setApiBaseUrl(result.activeApiUrl.trim());
        }
      }
      if (normalized) {
        localStorage.setItem(DESKTOP_GATEWAY_API_URL_KEY, normalized);
      } else {
        localStorage.removeItem(DESKTOP_GATEWAY_API_URL_KEY);
      }
      setGatewayApiUrl(normalized);
      setGatewayApiSaveStatus(normalized ? "Gateway saved. Restart the app to fully switch over." : "Gateway cleared. App will use local API again.");
    } catch (error) {
      setGatewayApiSaveStatus(error instanceof Error ? error.message : "Failed to save gateway.");
    }
  }

  async function restartRuntimeApi() {
    const restarter = window.qouterx?.restartApi ?? window.desktopShell?.restartApi;
    if (!restarter) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const result = await restarter();
      if (!result.ok) {
        setAuthError(result.error ?? "Failed to restart API.");
      }
      await refreshRuntimeApiBaseUrl();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to restart API.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function openRuntimeApiLogs() {
    if (!window.desktopShell?.openApiLogs) return;
    await window.desktopShell.openApiLogs();
  }

  function enterOfflineBootMode(message?: string) {
    localStorage.removeItem("authToken");
    setOfflineBootMode(true);
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setWorkspaceId(null);
    setBilling({ status: null, currentPeriodEnd: null, hasAccess: null });
    setViewMode("settings");
    setAuthError(message ?? "Opened app without API. Backend features stay unavailable until the local API starts.");
  }

  function getEmailOAuthStoreKey(targetWorkspaceId?: string | null) {
    return `${EMAIL_OAUTH_STORE_PREFIX}:${targetWorkspaceId ?? "default"}`;
  }

  async function getStoredGraphAuth(targetWorkspaceId?: string | null) {
    const key = getEmailOAuthStoreKey(targetWorkspaceId ?? workspaceId);
    if (!window.desktopShell?.secureStoreGet) return null;
    const result = await window.desktopShell.secureStoreGet(key);
    if (!result.ok || !result.value) return null;
    try {
      return JSON.parse(result.value) as StoredGraphAuth;
    } catch {
      return null;
    }
  }

  async function setStoredGraphAuth(value: StoredGraphAuth | null, targetWorkspaceId?: string | null) {
    const key = getEmailOAuthStoreKey(targetWorkspaceId ?? workspaceId);
    if (!window.desktopShell?.secureStoreSet || !window.desktopShell?.secureStoreDelete) return;
    if (!value) {
      await window.desktopShell.secureStoreDelete(key);
      return;
    }
    await window.desktopShell.secureStoreSet(key, JSON.stringify(value));
  }

  function getCloudDeviceTokenStoreKey(companyId?: string) {
    return `${CLOUD_DEVICE_TOKEN_STORE_PREFIX}:${companyId?.trim() || "default"}:${deviceId}`;
  }

  async function getSecureString(key: string) {
    if (!window.desktopShell?.secureStoreGet) return null;
    const result = await window.desktopShell.secureStoreGet(key);
    return result.ok && typeof result.value === "string" ? result.value : null;
  }

  async function setSecureString(key: string, value: string | null) {
    if (!window.desktopShell?.secureStoreSet || !window.desktopShell?.secureStoreDelete) return;
    if (!value) {
      await window.desktopShell.secureStoreDelete(key);
      return;
    }
    await window.desktopShell.secureStoreSet(key, value);
  }

  async function getOrCreateCloudDeviceToken(companyId?: string) {
    const key = getCloudDeviceTokenStoreKey(companyId);
    const existing = await getSecureString(key);
    if (existing) return existing;
    const tokenValue = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `device-token-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await setSecureString(key, tokenValue);
    return tokenValue;
  }

  async function ensureGraphAccessToken(targetWorkspaceId?: string | null) {
    const auth = await getStoredGraphAuth(targetWorkspaceId);
    if (!auth?.accessToken) return null;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if ((auth.expiresAt ?? 0) > nowSeconds + 60) {
      return auth.accessToken;
    }
    if (!auth.refreshToken) return auth.accessToken;
    const refreshResponse = await apiFetch("/api/email/oauth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: auth.refreshToken })
    });
    const refreshData = (await refreshResponse.json().catch(() => null)) as
      | { ok?: boolean; error?: string; tokens?: Record<string, unknown> }
      | null;
    if (!refreshResponse.ok || !refreshData?.tokens) {
      throw new Error(refreshData?.error ?? "Failed to refresh Microsoft token.");
    }
    const nextAuth: StoredGraphAuth = {
      accessToken: String(refreshData.tokens.access_token ?? auth.accessToken),
      refreshToken: String(refreshData.tokens.refresh_token ?? auth.refreshToken),
      expiresAt: nowSeconds + Number(refreshData.tokens.expires_in ?? 3600),
      accountEmail: auth.accountEmail
    };
    await setStoredGraphAuth(nextAuth, targetWorkspaceId);
    setGraphEmailAccountEmail(nextAuth.accountEmail ?? "");
    return nextAuth.accessToken;
  }

  async function graphApiFetch(path: string, options: RequestInit = {}, targetWorkspaceId?: string | null) {
    const accessToken = await ensureGraphAccessToken(targetWorkspaceId);
    if (!accessToken) {
      throw new Error("Microsoft Outlook is not connected yet.");
    }
    const headers = new Headers(options.headers ?? undefined);
    headers.set("x-ms-access-token", accessToken);
    return apiFetch(path, { ...options, headers });
  }

  async function refreshDeviceAccess() {
    if (!workspaceId || !token) {
      setDeviceAllowedFeatures(null);
      setDeviceAccessStatus(null);
      return;
    }
    try {
      const res = await apiFetch(
        `/api/workspaces/${workspaceId}/access/device?deviceId=${encodeURIComponent(deviceId)}`
      );
      const data = (await res.json().catch(() => null)) as
        | { error?: string; restricted?: boolean; allowedFeatures?: AppFeatureId[] }
        | null;
      if (!res.ok) {
        setDeviceAllowedFeatures(null);
        setDeviceAccessStatus(data?.error ?? "Failed to load device access.");
        return;
      }
      const payload = data as DeviceAccessResponse;
      setDeviceAllowedFeatures(payload.restricted ? payload.allowedFeatures : null);
      setDeviceAccessStatus(payload.restricted ? "This computer is restricted by access code." : "Full access on this computer.");
    } catch (error) {
      setDeviceAllowedFeatures(null);
      setDeviceAccessStatus(error instanceof Error ? error.message : "Failed to load device access.");
    }
  }

  async function unlockCodeGenerator() {
    const password = unlockPassword.trim();
    if (!password) {
      setGeneratorStatus("Enter your login password.");
      return;
    }
    setGeneratorBusy(true);
    setGeneratorStatus(null);
    try {
      const res = await apiFetch("/api/auth/verify-password", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setGeneratorUnlocked(false);
        setGeneratorStatus(data?.error ?? "Password verification failed.");
        return;
      }
      setGeneratorUnlocked(true);
      setGeneratorStatus("Generator unlocked.");
    } catch (error) {
      setGeneratorUnlocked(false);
      setGeneratorStatus(error instanceof Error ? error.message : "Password verification failed.");
    } finally {
      setGeneratorBusy(false);
    }
  }

  async function generateAccessCode() {
    if (!workspaceId) return;
    if (!generatorUnlocked) {
      setGeneratorStatus("Unlock generator first.");
      return;
    }
    if (!generatorSelectedFeatures.length) {
      setGeneratorStatus("Select at least one feature.");
      return;
    }
    setGeneratorBusy(true);
    setGeneratorStatus(null);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/access-codes`, {
        method: "POST",
        body: JSON.stringify({ allowedFeatures: generatorSelectedFeatures })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (!res.ok || !data?.code) {
        setGeneratorStatus(data?.error ?? "Failed to generate code.");
        return;
      }
      setGeneratedAccessCode(data.code);
      setGeneratorStatus("Access code generated.");
    } catch (error) {
      setGeneratorStatus(error instanceof Error ? error.message : "Failed to generate code.");
    } finally {
      setGeneratorBusy(false);
    }
  }

  async function redeemDeviceAccessCode() {
    if (!workspaceId) return;
    const code = redeemAccessCode.trim().toUpperCase();
    if (!code) {
      setRedeemStatus("Enter access code.");
      return;
    }
    setRedeemBusy(true);
    setRedeemStatus(null);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/access-codes/redeem`, {
        method: "POST",
        body: JSON.stringify({ code, deviceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setRedeemStatus(data?.error ?? "Failed to activate code.");
        return;
      }
      setRedeemStatus("Code activated on this computer.");
      setRedeemAccessCode("");
      await refreshDeviceAccess();
    } catch (error) {
      setRedeemStatus(error instanceof Error ? error.message : "Failed to activate code.");
    } finally {
      setRedeemBusy(false);
    }
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
    if (tokenParam) {
      setScanToken(tokenParam);
      void loadScanJob(tokenParam);
    }
  }, [isScanPage]);

  useEffect(() => {
    if (offlineBootMode) return;
    if (!token) return;
    void apiFetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401 || res.status === 403 || res.status === 402) {
            setToken(null);
            localStorage.removeItem("authToken");
            if (res.status === 402) {
              setAuthError("Payment is required before login. Once the subscription is paid, sign in again.");
            }
          }
          return null;
        }
        return (await res.json()) as { user: UserSummary; workspaces: WorkspaceSummary[] };
      })
      .then((data) => {
        if (!data) return;
        setUser(data.user);
        setWorkspaces(data.workspaces);
        if (!workspaceId && data.workspaces[0]) {
          setWorkspaceId(data.workspaces[0].id);
        }
      })
      .catch(() => {
        // Keep token on transient API/network errors.
      });
  }, [token, workspaceId, offlineBootMode]);

  useEffect(() => {
    if (offlineBootMode) return;
    void refreshDeviceAccess();
  }, [workspaceId, token, deviceId, offlineBootMode]);

  useEffect(() => {
    if (canOpenViewMode(viewMode)) return;
    setViewMode(workspaceLocked ? "billing" : "settings");
  }, [viewMode, deviceAllowedFeatures, workspaceLocked, canManageAccounts]);

  useEffect(() => {
    if (viewMode === "nesting_intelligence" || viewMode === "nesting_studio") {
      setViewMode("nesting_workspace");
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "nesting_studio" && viewMode !== "nesting_workspace") return;
    void loadNestingStudioOffcuts();
  }, [viewMode]);

  useEffect(() => {
    recommendNestingStudioOffcut();
  }, [nestingStudioResult, nestingStudioOffcuts, nestingStudioMaterial, nestingStudioThickness]);

  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0 });
      document.querySelectorAll<HTMLElement>('[data-page-container="true"]').forEach((element) => {
        element.scrollTop = 0;
        element.scrollLeft = 0;
      });
    };
    window.requestAnimationFrame(resetScroll);
    const shortTimer = window.setTimeout(resetScroll, 80);
    const settledTimer = window.setTimeout(resetScroll, 300);
    return () => {
      window.clearTimeout(shortTimer);
      window.clearTimeout(settledTimer);
    };
  }, [viewMode]);

  useEffect(() => {
    const canvas = nestingStudioCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sheetWidth = Math.max(1, Number(nestingStudioSheetWidth) || 3000);
    const sheetHeight = Math.max(1, Number(nestingStudioSheetHeight) || 1500);
    const scale = Math.min((canvas.width - 24) / sheetWidth, (canvas.height - 24) / sheetHeight);
    const offsetX = (canvas.width - sheetWidth * scale) / 2;
    const offsetY = (canvas.height - sheetHeight * scale) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#07111f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, sheetWidth * scale, sheetHeight * scale);
    const border = Math.max(0, Number(nestingStudioBorder) || 0);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(110,231,183,0.7)";
    ctx.strokeRect(offsetX + border * scale, offsetY + border * scale, Math.max(0, (sheetWidth - border * 2) * scale), Math.max(0, (sheetHeight - border * 2) * scale));
    ctx.setLineDash([]);
    const spacingBoundaryOffset = Math.max(0, (Number(nestingStudioSpacing) || 0) + (Number(nestingStudioKerf) || 0)) / 2;
    for (const zone of nestingStudioResult?.heatZones ?? []) {
      const alpha = Math.min(0.42, 0.08 + (zone.score / 100) * 0.34);
      ctx.fillStyle = `rgba(248,113,113,${alpha})`;
      ctx.fillRect(offsetX + zone.x * scale, offsetY + zone.y * scale, zone.width * scale, zone.height * scale);
      if (zone.score >= 45) {
        ctx.strokeStyle = "rgba(251,191,36,0.55)";
        ctx.lineWidth = 1;
        ctx.strokeRect(offsetX + zone.x * scale, offsetY + zone.y * scale, zone.width * scale, zone.height * scale);
      }
    }
    if (nestingStudioShowNfpDebug && nestingStudioResult?.nfpDebug) {
      const drawPolygon = (polygon: Array<{ x: number; y: number }>, strokeStyle: string, fillStyle?: string) => {
        if (polygon.length < 2) return;
        ctx.beginPath();
        polygon.forEach((point, index) => {
          const x = offsetX + point.x * scale;
          const y = offsetY + point.y * scale;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        if (fillStyle) {
          ctx.fillStyle = fillStyle;
          ctx.fill();
        }
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
      };
      ctx.setLineDash([8, 6]);
      nestingStudioResult.nfpDebug.collisionZones.slice(-24).forEach((zone) => drawPolygon(zone, "rgba(248,113,113,0.42)", "rgba(248,113,113,0.06)"));
      nestingStudioResult.nfpDebug.boundaries.slice(-24).forEach((boundary) => drawPolygon(boundary, "rgba(168,85,247,0.48)"));
      ctx.setLineDash([]);
      for (const point of nestingStudioResult.nfpDebug.validPoints.slice(0, 300)) {
        ctx.fillStyle = "rgba(56,189,248,0.86)";
        ctx.beginPath();
        ctx.arc(offsetX + point.x * scale, offsetY + point.y * scale, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const placement of nestingStudioResult?.placements ?? []) {
      if (nestingStudioShowSpacingBoundary && spacingBoundaryOffset > 0) {
        const boundary = nestingStudioOffsetPolygon(placement.polygon, spacingBoundaryOffset);
        ctx.beginPath();
        boundary.forEach((point, index) => {
          const x = offsetX + point.x * scale;
          const y = offsetY + point.y * scale;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = "rgba(251,191,36,0.72)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      placement.polygon.forEach((point, index) => {
        const x = offsetX + point.x * scale;
        const y = offsetY + point.y * scale;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(110,231,183,0.22)";
      ctx.strokeStyle = placement.partId === nestingStudioSelectedPartId ? "#facc15" : "#6ee7b7";
      ctx.lineWidth = placement.partId === nestingStudioSelectedPartId ? 3 : 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText(placement.name, offsetX + placement.x * scale + 4, offsetY + placement.y * scale + 14);
      ctx.strokeStyle = "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(offsetX + placement.leadIn.start.x * scale, offsetY + placement.leadIn.start.y * scale);
      ctx.lineTo(offsetX + placement.leadIn.end.x * scale, offsetY + placement.leadIn.end.y * scale);
      ctx.stroke();
    }
    for (const operation of nestingStudioResult?.cutOrder ?? []) {
      const x = offsetX + operation.x * scale;
      const y = offsetY + operation.y * scale;
      ctx.fillStyle = "rgba(250,204,21,0.9)";
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111827";
      ctx.font = "bold 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(operation.cutOrder), x, y + 0.5);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }, [nestingStudioResult, nestingStudioSheetWidth, nestingStudioSheetHeight, nestingStudioBorder, nestingStudioSpacing, nestingStudioKerf, nestingStudioShowSpacingBoundary, nestingStudioShowNfpDebug, nestingStudioSelectedPartId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const legacyPassword = localStorage.getItem(AUTH_PASSWORD_KEY);
      if (legacyPassword) {
        await setSecureString(AUTH_PASSWORD_STORE_KEY, legacyPassword);
        localStorage.removeItem(AUTH_PASSWORD_KEY);
      }
      const securePassword = await getSecureString(AUTH_PASSWORD_STORE_KEY);
      if (cancelled) return;
      if (securePassword) {
        setAuthPassword((current) => current || securePassword);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(AUTH_REMEMBER_KEY, authRemember ? "1" : "0");
    void (async () => {
      if (!authRemember) {
        localStorage.removeItem(AUTH_EMAIL_KEY);
        localStorage.removeItem(AUTH_PASSWORD_KEY);
        await setSecureString(AUTH_PASSWORD_STORE_KEY, null);
        return;
      }
      localStorage.setItem(AUTH_EMAIL_KEY, authEmail);
      if (authPassword) {
        await setSecureString(AUTH_PASSWORD_STORE_KEY, authPassword);
      }
    })();
  }, [authRemember, authEmail, authPassword, authMode]);

  useEffect(() => {
    if (offlineBootMode) return;
    if (token || authBusy || autoSignInAttempted) return;
    if (!authRemember || !authEmail.trim() || !authPassword) return;
    setAutoSignInAttempted(true);
    setAuthBusy(true);
    setAuthError(null);
    void (async () => {
      try {
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: authEmail.trim(),
            password: authPassword
          })
        });
        if (!res.ok) return;
        const data = (await res.json()) as { token: string; user: UserSummary; workspaces: WorkspaceSummary[] };
        localStorage.setItem("authToken", data.token);
        setToken(data.token);
        setUser(data.user);
        setWorkspaces(data.workspaces);
        setWorkspaceId((current) => current ?? data.workspaces[0]?.id ?? null);
      } catch {
        // keep manual sign-in available
      } finally {
        setAuthBusy(false);
      }
    })();
  }, [token, authBusy, autoSignInAttempted, authRemember, authEmail, authPassword, offlineBootMode]);

  useEffect(() => {
    socket.on("connect", () => {
      setLog((l) => [`✅ connected ${socket.id}`, ...l]);
      socket.emit("join", roomId);
    });

    socket.on("system", (msg: string) => setLog((l) => [msg, ...l]));
    socket.on("message", (msg: ChatMsg) => setLog((l) => [msg, ...l]));
    socket.on("support:message", () => {
      if (viewMode === "chat") void loadSupportThreads();
    });
    socket.on("disconnect", () => setLog((l) => ["⚠️ disconnected", ...l]));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [socket, viewMode, token, workspaceId, canManageAccounts, selectedSupportThreadKey]);

  useEffect(() => {
    if (viewMode !== "chat") return;
    void loadSupportThreads();
  }, [viewMode, token, workspaceId, canManageAccounts]);

  useEffect(() => {
    if (!roomId) return;
    socket.emit("join", roomId);
    setLog((l) => [`# ${roomId}`, ...l]);
  }, [roomId, socket]);

  useEffect(() => {
    if (!dxfReaderSegments.length || !dxfReaderFileName) return;
    if (!dxfReaderSelectedLayers.length) {
      setDxfReaderParts([]);
      setDxfReaderSelectedPartIds([]);
      setDxfReaderPreviewDataUrl(undefined);
      setDxfReaderStatus("No geometry in selected layer filter.");
      return;
    }
    if (dxfReaderSourceFiles.length > 0) {
      rebuildDxfReaderFromSourceFiles(dxfReaderSourceFiles, dxfReaderSelectedLayers, true);
      return;
    }
    const rebuilt = rebuildDxfReaderParts(dxfReaderSegments, dxfReaderFileName, dxfReaderSelectedLayers, true);
    setDxfReaderPreviewDataUrl(rebuilt.previewDataUrl);
    setDxfReaderParts(rebuilt.parts);
    setDxfReaderSelectedPartIds((prev) => {
      const valid = prev.filter((id) => rebuilt.parts.some((part) => part.id === id));
      return valid.length ? valid : rebuilt.parts.map((part) => part.id);
    });
  }, [dxfReaderSegments, dxfReaderFileName, dxfReaderSelectedLayers, dxfMergeToleranceMm]);

  useEffect(() => {
    if (!jobDxfSegments.length || !jobDxfFileName) return;
    if (!jobDxfSelectedLayers.length) {
      setJobDxfSourceFiles((files) => files.map((file) => ({ ...file, parts: [], previewDataUrl: undefined })));
      setJobDxfParts([]);
      setJobDxfPreviewDataUrl(undefined);
      setJobDxfStatus("No geometry in selected layer filter.");
      return;
    }
    if (jobDxfSourceFiles.length > 0) {
      rebuildJobDxfFromSourceFiles(jobDxfSourceFiles, jobDxfSelectedLayers, true);
      return;
    }
    const rebuilt = rebuildJobDxfParts(jobDxfSegments, jobDxfFileName, jobDxfSelectedLayers, true);
    setJobDxfPreviewDataUrl(rebuilt.previewDataUrl);
    setJobDxfParts(rebuilt.parts);
  }, [jobDxfSegments, jobDxfFileName, jobDxfSelectedLayers, dxfMergeToleranceMm]);

  useEffect(() => {
    setJobDxfSelectedPartIds((selected) =>
      selected.filter((partId) => jobDxfParts.some((part) => part.id === partId))
    );
  }, [jobDxfParts]);

  useEffect(() => {
    setNestingResults([]);
  }, [dxfReaderParts, dxfReaderSelectedPartIds, dxfReaderSelectedLayers, nestingGapMm, dxfMergeToleranceMm]);

  useEffect(() => {
    const activeJob = jobs.find((job) => job.id === selectedJobId) ?? null;
    if (!activeJob) {
      setJobDxfFileName("");
      setJobDxfSegments([]);
      setJobDxfLayers([]);
      setJobDxfSelectedLayers([]);
      setJobDxfPreviewDataUrl(undefined);
      setJobDxfParts([]);
      setJobDxfSourceFiles([]);
      setJobDxfSelectedPartIds([]);
      setJobDxfStatus(null);
      return;
    }
    const saved = (activeJob.jobDxfParts ?? []).map((part) => ({
      id: part.id,
      name: part.name,
      layer: part.layer,
      material: part.material ?? "Mild Steel",
      thicknessMm: normalizeJobDxfThickness(part.thicknessMm),
      quantity: part.quantity,
      widthMm: part.widthMm,
      heightMm: part.heightMm,
      cutLengthMm: part.cutLengthMm,
      pierceCount: part.pierceCount,
      segmentCount: part.segmentCount,
      thumbnailDataUrl: part.thumbnailDataUrl,
      printDataUrl: part.printDataUrl,
      sourceSegments: part.sourceSegments,
      sourceBounds: part.sourceBounds
    }));
    setJobDxfParts(saved);
    setJobDxfSourceFiles(
      saved.length
        ? [
            {
              id: "saved-job-dxf",
              fileName: "Saved Job DXF Parts",
              segments: [],
              layers: [],
              previewDataUrl: saved[0]?.thumbnailDataUrl,
              parts: saved
            }
          ]
        : []
    );
    setJobDxfSelectedPartIds([]);
    if (saved.length) {
      setJobDxfStatus(`Loaded ${saved.length} saved DXF part${saved.length === 1 ? "" : "s"} for this job.`);
    }
  }, [selectedJobId, jobs]);

  useEffect(() => {
    if (offlineBootMode) return;
    if (!workspaceId) return;
    refreshBilling();
    refreshBillingCompany();
    refreshSyncStatus();
    refreshUsers();
    refreshCloudSyncSettings();
    refreshCloudDashboard();
    refreshCloudEvents();
    refreshEmailSettings();
    if (canManageAccounts) {
      refreshAdminSubscriptions();
    }
    void sendBillingDeviceHeartbeat();
    if (!workspaceLocked) {
      refreshBrainCenter();
      refreshManufacturingMemory();
      refreshProfitIntelligence();
      refreshMaterialPrediction();
      refreshProductionQueueBrain();
      refreshNestingPlans();
      refreshServers();
      refreshFiles();
      refreshLedger();
      refreshJobs();
      refreshSmartQueue();
      refreshStock();
      refreshOffcutRecommendations();
      refreshQuotes();
      refreshCompanyProfile();
      refreshStorage();
      refreshCustomers();
      refreshWorkers();
      refreshCustomerSummary();
    }
    setInboxHistoryLoaded(false);
  }, [workspaceId, offlineBootMode, canManageAccounts, workspaceLocked]);

  useEffect(() => {
    if (offlineBootMode || !workspaceId || viewMode !== "brain_center" || workspaceLocked) return;
    void refreshBrainCenter();
  }, [offlineBootMode, workspaceId, viewMode, workspaceLocked]);

  useEffect(() => {
    if (offlineBootMode || !workspaceId || viewMode !== "manufacturing_memory" || workspaceLocked) return;
    void refreshManufacturingMemory();
  }, [offlineBootMode, workspaceId, viewMode, workspaceLocked]);

  useEffect(() => {
    if (offlineBootMode || !workspaceId || viewMode !== "profit_intelligence" || workspaceLocked) return;
    void refreshProfitIntelligence();
  }, [offlineBootMode, workspaceId, viewMode, workspaceLocked]);

  useEffect(() => {
    if (offlineBootMode || !workspaceId || viewMode !== "material_prediction" || workspaceLocked) return;
    void refreshMaterialPrediction();
  }, [offlineBootMode, workspaceId, viewMode, workspaceLocked]);

  useEffect(() => {
    if (offlineBootMode || !workspaceId || viewMode !== "ai_production_queue" || workspaceLocked) return;
    void refreshProductionQueueBrain();
  }, [offlineBootMode, workspaceId, viewMode, workspaceLocked]);

  useEffect(() => {
    if (offlineBootMode || !workspaceId || viewMode !== "lead_time_intelligence" || workspaceLocked) return;
    if (smartQueueJobs.length === 0) {
      void refreshSmartQueue();
      return;
    }
    const targetJobId = smartQueueSelectedJobId ?? smartQueueJobs[0]?.id ?? null;
    if (!targetJobId) return;
    void predictLeadTime(targetJobId);
  }, [offlineBootMode, workspaceId, viewMode, workspaceLocked, smartQueueJobs, smartQueueSelectedJobId]);

  useEffect(() => {
    if (offlineBootMode || !workspaceId || viewMode !== "nesting_intelligence" || workspaceLocked) return;
    void refreshNestingPlans();
  }, [offlineBootMode, workspaceId, viewMode, workspaceLocked]);

  useEffect(() => {
    if (offlineBootMode || !workspaceId || viewMode !== "nesting_workspace" || workspaceLocked) return;
    void refreshNestingWorkspaceData();
  }, [offlineBootMode, workspaceId, viewMode, workspaceLocked]);

  useEffect(() => {
    if (!nestingWorkspaceActive || viewMode !== "nesting_workspace") return;
    nestingWorkspaceActive.parts.forEach((part) => {
      const geometry = parseNestingPreviewGeometry(part);
      const outerContoursCount = geometry?.outerContours?.length ?? (geometry?.outerContour?.length ? 1 : 0);
      const innerHolesCount = geometry?.innerHoles?.length ?? geometry?.holes?.length ?? 0;
      const hasPreviewGeometry = Boolean(part.previewGeometry);
      const fallbackToBoundingBox = !outerContoursCount && !innerHolesCount && !(geometry?.circles?.length) && !(geometry?.arcs?.length);
      console.debug("[Nesting Preview Geometry]", {
        fileName: part.fileName,
        hasPreviewGeometry,
        outerContoursCount,
        innerHolesCount,
        fallbackToBoundingBox
      });
    });
  }, [nestingWorkspaceActive?.id, nestingWorkspaceActive?.parts.length, nestingWorkspaceActive?.placements.length, viewMode]);

  useEffect(() => {
    if (offlineBootMode || !workspaceId || viewMode !== "production_assistant" || workspaceLocked) return;
    if (productionAssistantMessages.length > 0) return;
    setProductionAssistantMessages([
      {
        role: "assistant",
        text: "Ask about late jobs, what to cut next, material shortages, low profit jobs, customer debt, DXF errors, or offcuts.",
        at: new Date().toISOString(),
        response: null
      }
    ]);
  }, [offlineBootMode, workspaceId, viewMode, workspaceLocked, productionAssistantMessages.length]);

  useEffect(() => {
    if (offlineBootMode || !canManageAccounts || !workspaceId) return;
    const intervalId = window.setInterval(() => {
      void refreshAdminSubscriptions();
    }, 10000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [offlineBootMode, canManageAccounts, workspaceId]);

  useEffect(() => {
    if (offlineBootMode) return;
    if (!effectiveApiUrl) return;
    void pushCloudEvent("app_started", {
      apiUrl: effectiveApiUrl,
      mode: apiRuntimeStatus.mode ?? "local",
      deviceId
    });
  }, [offlineBootMode, effectiveApiUrl]);

  useEffect(() => {
    if (offlineBootMode) return;
    if (!cloudSyncSettings.enabled || !cloudSyncSettings.companyId.trim()) return;
    let cancelled = false;
    const run = async () => {
      try {
        await sendCloudHeartbeat();
        if (!cancelled) {
          await refreshCloudDashboard();
        }
      } catch {
        // keep app usable when heartbeat fails
      }
    };
    void run();
    const timer = window.setInterval(() => {
      void run();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    offlineBootMode,
    cloudSyncSettings.enabled,
    cloudSyncSettings.companyId,
    cloudSyncSettings.deviceName,
    cloudSyncSettings.role,
    user?.email,
    user?.name
  ]);

  useEffect(() => {
    if (offlineBootMode || !workspaceId || !user) return;
    void sendBillingDeviceHeartbeat();
    const timer = window.setInterval(() => {
      void sendBillingDeviceHeartbeat();
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [offlineBootMode, workspaceId, user?.id, deviceId, cloudSyncSettings.deviceName]);

  useEffect(() => {
    if (!workspaceId || viewMode !== "ai_assistant") return;
    void refreshSmartQueue();
    void refreshStock();
  }, [workspaceId, viewMode]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      const auth = await getStoredGraphAuth(workspaceId);
      if (cancelled) return;
      setGraphEmailConnected(Boolean(auth?.accessToken));
      setGraphEmailAccountEmail(auth?.accountEmail ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    void loadGatewayApiConfig();
    void refreshRuntimeApiBaseUrl();
    void getApiFailureDetail().then((detail) => {
      if (!detail) return;
      setApiRuntimeStatus((current) => ({ ...current, error: detail, running: false }));
    });
    const unsubscribe = window.qouterx?.onApiStatusChange?.((payload) => {
      setApiRuntimeStatus(payload);
      if (payload.url) {
        setApiBaseUrl(payload.url);
      }
    }) ?? window.desktopShell?.onApiStatusChange?.((payload) => {
      setApiRuntimeStatus(payload);
      if (payload.url) {
        setApiBaseUrl(payload.url);
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    void refreshDesktopUpdateState();
    const unsubscribe = window.desktopShell?.onUpdateStatus?.((payload) => {
      setUpdateStatus(payload);
      if (payload.currentVersion) setAppVersion(payload.currentVersion);
      if (payload.state !== "error") {
        setUpdateActionError(null);
      } else if (payload.message) {
        setUpdateActionError(payload.message);
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    if (viewMode !== "email") return;
    if (inboxMessages.length > 0 && isUsingGraphEmail) return;
    void refreshInboxEmails();
  }, [workspaceId, viewMode, isUsingGraphEmail]);

  useEffect(() => {
    if (!workspaceId) return;
    if (viewMode !== "email") return;
    const interval = window.setInterval(() => {
      void refreshInboxEmails();
    }, 45000);
    return () => {
      window.clearInterval(interval);
    };
  }, [workspaceId, viewMode]);

  useEffect(() => {
    if (!workspaceId) return;
    if (viewMode !== "email") return;
    if (!isUsingGraphEmail) return;
    void refreshInboxEmails();
  }, [workspaceId, viewMode, selectedOutlookFolder, selectedOutlookFilter, isUsingGraphEmail]);

  useEffect(() => {
    if (isUsingGraphEmail) return;
    if (["inbox", "quote_requests", "purchase_orders", "attachments", "customers"].includes(selectedOutlookFolder)) return;
    setSelectedOutlookFolder("inbox");
  }, [isUsingGraphEmail, selectedOutlookFolder]);

  useEffect(() => {
    if (isUsingGraphEmail) return;
    if (inboxMessages.length === 0) return;
    if (activeInboxMessages.length > 0) return;
    if (selectedOutlookFolder !== "inbox") {
      setSelectedOutlookFolder("inbox");
    }
    if (selectedOutlookFilter !== "all") {
      setSelectedOutlookFilter("all");
    }
  }, [isUsingGraphEmail, inboxMessages.length, activeInboxMessages.length, selectedOutlookFolder, selectedOutlookFilter]);

  useEffect(() => {
    if (!workspaceId) {
      setProcessedEmailMap({});
      return;
    }
    try {
      const raw = localStorage.getItem(`${EMAIL_PROCESSED_KEY_PREFIX}:${workspaceId}`);
      if (!raw) {
        setProcessedEmailMap({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, ProcessedEmailRecord>;
      const normalized: Record<number, ProcessedEmailRecord> = {};
      Object.entries(parsed).forEach(([uidKey, value]) => {
        const uid = Number(uidKey);
        if (!Number.isFinite(uid) || uid <= 0) return;
        if (!value || typeof value !== "object") return;
        const processedAt = typeof value.processedAt === "string" ? value.processedAt : "";
        const actions = Array.isArray(value.actions) ? value.actions.filter((entry) => typeof entry === "string") : [];
        if (!processedAt) return;
        normalized[uid] = { processedAt, actions };
      });
      setProcessedEmailMap(normalized);
    } catch {
      setProcessedEmailMap({});
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    localStorage.setItem(`${EMAIL_PROCESSED_KEY_PREFIX}:${workspaceId}`, JSON.stringify(processedEmailMap));
  }, [workspaceId, processedEmailMap]);

  useEffect(() => {
    if (!workspaceId) {
      setReadEmailMap({});
      setReadEmailSeeded(false);
      return;
    }
    try {
      const raw = localStorage.getItem(`${EMAIL_READ_KEY_PREFIX}:${workspaceId}`);
      if (!raw) {
        setReadEmailMap({});
        setReadEmailSeeded(false);
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      const normalized: Record<number, true> = {};
      Object.entries(parsed).forEach(([uidKey, value]) => {
        const uid = Number(uidKey);
        if (!Number.isFinite(uid) || uid <= 0 || !value) return;
        normalized[uid] = true;
      });
      setReadEmailMap(normalized);
      setReadEmailSeeded(Object.keys(normalized).length > 0);
    } catch {
      setReadEmailMap({});
      setReadEmailSeeded(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    localStorage.setItem(`${EMAIL_READ_KEY_PREFIX}:${workspaceId}`, JSON.stringify(readEmailMap));
  }, [workspaceId, readEmailMap]);

  useEffect(() => {
    if (!workspaceId || !selectedInboxMessage) {
      setSelectedInboxBody("");
      setSelectedInboxDetailLoading(false);
      setSelectedInboxDetailError(null);
      setSelectedInboxAttachments([]);
      return;
    }
    let cancelled = false;
    setSelectedInboxBody(selectedInboxMessage.body ?? "");
    setSelectedInboxDetailLoading(true);
    setSelectedInboxDetailError(null);
    setSelectedInboxAttachments(selectedInboxMessage.attachments ?? []);

    void (async () => {
      try {
        const detail = await fetchInboxMessageDetail(selectedInboxMessage.uid);
        if (cancelled || !detail) return;
        setSelectedInboxBody(detail.body ?? "");
        setSelectedInboxAttachments(mergeInboxAttachments(selectedInboxMessage.attachments ?? [], detail.attachments ?? []));
        setInboxMessages((current) =>
          current.map((message) =>
            message.uid === detail.uid
              ? {
                  ...message,
                  body: detail.body ?? message.body,
                  snippet: detail.snippet?.trim() ? detail.snippet : message.snippet,
                  attachments: mergeInboxAttachments(message.attachments ?? [], detail.attachments ?? [])
                }
              : message
          )
        );
      } catch (error) {
        if (cancelled) return;
        setSelectedInboxDetailError(error instanceof Error ? error.message : "Failed to load full email.");
      } finally {
        if (!cancelled) setSelectedInboxDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, selectedInboxMessage?.uid]);

  useEffect(() => {
    if (!workspaceId || !selectedInboxMessage) {
      setInboxAttachmentPreviews({});
      return;
    }
    const attachments = selectedInboxMessageAttachments.filter((attachment) =>
      attachment.part && isPreviewableAttachment(attachment)
    );
    if (!attachments.length) {
      setInboxAttachmentPreviews({});
      return;
    }

    let cancelled = false;
    setInboxAttachmentPreviews((current) => {
      const next: Record<string, InboxAttachmentPreview> = {};
      attachments.forEach((attachment) => {
        const key = getAttachmentPreviewKey(selectedInboxMessage.uid, attachment.part);
        next[key] = current[key] ?? {
          loading: true,
          contentType: attachment.contentType,
          name: attachment.name,
          sizeBytes: attachment.sizeBytes
        };
      });
      return next;
    });

    void Promise.all(
      attachments.map(async (attachment) => {
        const key = getAttachmentPreviewKey(selectedInboxMessage.uid, attachment.part);
        try {
          const res = await apiFetch(
            `/api/workspaces/${workspaceId}/email/inbox/${selectedInboxMessage.uid}/attachment?part=${encodeURIComponent(
              attachment.part
            )}`
          );
          const data = (await res.json().catch(() => null)) as
            | {
                error?: string;
                details?: string;
                attachment?: {
                  name: string;
                  contentType: string;
                  sizeBytes?: number;
                  base64: string;
                };
              }
            | null;
          if (!res.ok || !data?.attachment) {
            throw new Error(data?.details ? `${data?.error ?? "Attachment failed"}: ${data.details}` : (data?.error ?? "Attachment failed"));
          }

          const payload = data.attachment;
          const normalized = {
            name: payload.name || attachment.name,
            contentType: payload.contentType || attachment.contentType,
            sizeBytes: payload.sizeBytes ?? attachment.sizeBytes
          };
          let dataUrl: string | undefined;
          let dxfPreviewDataUrl: string | undefined;
          if (isPngAttachment(normalized) || isPdfAttachment(normalized)) {
            dataUrl = `data:${normalized.contentType};base64,${payload.base64}`;
          } else if (isDxfAttachment(normalized)) {
            const dxfRaw = decodeBase64Text(payload.base64);
            const segments = parseDxfSegments(dxfRaw);
            dxfPreviewDataUrl = createSegmentThumbnailDataUrl(segments, 420, "#0b1220", "#67e8f9");
          }

          if (cancelled) return;
          setInboxAttachmentPreviews((current) => ({
            ...current,
            [key]: {
              loading: false,
              contentType: normalized.contentType,
              name: normalized.name,
              sizeBytes: normalized.sizeBytes,
              dataUrl,
              dxfPreviewDataUrl
            }
          }));
        } catch (error) {
          if (cancelled) return;
          setInboxAttachmentPreviews((current) => ({
            ...current,
            [key]: {
              loading: false,
              contentType: attachment.contentType,
              name: attachment.name,
              sizeBytes: attachment.sizeBytes,
              error: error instanceof Error ? error.message : "Failed to load preview"
            }
          }));
        }
      })
    );

    return () => {
      cancelled = true;
    };
  }, [
    workspaceId,
    selectedInboxMessage?.uid,
    selectedInboxMessageAttachments.map((attachment) => `${attachment.part}:${attachment.name}`).join("|")
  ]);

  useEffect(() => {
    if (!workspaceId || !selectedInboxMessage) return;
    let cancelled = false;
    const cleanedSnippet = cleanEmailDisplayText(selectedInboxDisplayBody);
    const attachmentNames = selectedInboxMessageAttachments.map((entry) => entry.name).join("\n");
    const baseBody = [cleanedSnippet, attachmentNames].filter(Boolean).join("\n");
    setEmailFromInput(selectedInboxMessage.from);
    setEmailSubjectInput(selectedInboxMessage.subject);
    setEmailBodyInput(baseBody);

    const run = async () => {
      const combinedBody = await buildEmailDetectionBody(selectedInboxMessage, { maxPdfAttachments: 2, maxPdfChars: 15000 });
      if (cancelled) return;
      setEmailBodyInput(combinedBody);
      void detectEmailContent({
        fromEmail: selectedInboxMessage.from,
        subject: selectedInboxMessage.subject,
        body: combinedBody,
        silent: true
      });
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, selectedInboxMessage?.uid, selectedInboxDisplayBody, selectedInboxMessageAttachments.map((entry) => `${entry.part}:${entry.name}`).join("|")]);

  useEffect(() => {
    if (!workspaceId || viewMode !== "email" || !inboxMessages.length) return;
    let cancelled = false;
    const fourDaysAgoMs = Date.now() - 4 * 24 * 60 * 60 * 1000;
    const messagesToScan = inboxMessages
      .filter((message) => {
        const sentMs = new Date(message.date).getTime();
        return Number.isFinite(sentMs) && sentMs >= fourDaysAgoMs;
      })
      .slice(0, 200);

    const run = async () => {
      for (const message of messagesToScan) {
        if (cancelled) return;
        const signature = `${detectionRuleVersion}|${message.date}|${message.subject}|${(message.attachments ?? [])
          .map((attachment) => `${attachment.part}:${attachment.name}:${attachment.sizeBytes ?? ""}`)
          .join("|")}`;
        if (boardDetectionSignatureRef.current[message.uid] === signature) continue;
        boardDetectionSignatureRef.current[message.uid] = signature;

        const combinedBody = await buildEmailDetectionBody(message, { maxPdfAttachments: 2, maxPdfChars: 15000 });
        const detection = await detectEmailContentFromSource({
          fromEmail: message.from,
          subject: message.subject,
          body: combinedBody
        });

        if (cancelled) return;
        setBoardDetectionsByUid((current) => ({ ...current, [message.uid]: detection }));
      }

      if (cancelled) return;
      const validUids = new Set(messagesToScan.map((entry) => entry.uid));
      setBoardDetectionsByUid((current) => {
        const next: Record<number, EmailDetectionResult | null> = {};
        for (const [uidRaw, detection] of Object.entries(current)) {
          const uid = Number(uidRaw);
          if (validUids.has(uid)) next[uid] = detection;
        }
        return next;
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, viewMode, inboxMessages, detectionRuleVersion]);

  useEffect(() => {
    // Email attachments are imported only by explicit user action.
  }, [selectedInboxMessage?.uid, selectedInboxMessageAttachments, emailDetection]);

  useEffect(() => {
    autoPoBaselineUidRef.current = null;
    autoPoJobStatusRef.current = {};
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !inboxMessages.length) return;
    if (autoPoBaselineUidRef.current !== null) return;
    autoPoBaselineUidRef.current = inboxMessages.reduce((max, message) => Math.max(max, message.uid), 0);
  }, [workspaceId, inboxMessages]);

  useEffect(() => {
    // Purchase-order emails no longer auto-create job cards.
  }, [workspaceId, viewMode, purchaseOrderDetectionEntries, processedEmailMap]);

  useEffect(() => {
    autoJobCardBaselineRef.current = new Set();
    autoJobCardBaselineReadyRef.current = false;
    autoJobCardStartTimeRef.current = Date.now();
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    if (!autoJobCardBaselineReadyRef.current) return;
    const known = autoJobCardBaselineRef.current;
    const newJobs = jobs.filter((job) => {
      if (known.has(job.id)) return false;
      const createdMs = Date.parse(job.createdAt);
      if (!Number.isFinite(createdMs)) return false;
      return createdMs >= autoJobCardStartTimeRef.current;
    });
    newJobs.forEach((job) => known.add(job.id));
    if (!newJobs.length) return;
    newJobs.forEach((job) => {
      void createAndPrintJobCardSet(job.id);
    });
  }, [workspaceId, jobs]);

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
      if (!res.ok) {
        setWorkspaceUsers([]);
        return;
      }
      const data = (await res.json()) as { users: WorkspaceUser[] };
      setWorkspaceUsers(data.users);
    } catch {
      // ignore
    }
  }

  async function updateUserBillingAccess(targetUserId: string, mode: "unlock" | "lock") {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/users/${targetUserId}/billing-access`, {
        method: "POST",
        body: JSON.stringify({ mode, days: 30 })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setAuthError(data?.error ?? `Failed to ${mode} account.`);
        return;
      }
      await refreshUsers();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : `Failed to ${mode} account.`);
    }
  }

  async function refreshJobs() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/jobs`);
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: JobRecord[] };
      if (!autoJobCardBaselineReadyRef.current) {
        autoJobCardBaselineRef.current = new Set(data.jobs.map((job) => job.id));
        autoJobCardBaselineReadyRef.current = true;
      }
      setJobs(data.jobs);
    } catch {
      // ignore
    }
  }

  async function refreshSmartQueue() {
    if (!workspaceId) return;
    setSmartQueueLoading(true);
    setSmartQueueError(null);
    try {
      const res = await apiFetch(`/api/job-queue?workspaceId=${encodeURIComponent(workspaceId)}`);
      const data = (await res.json().catch(() => null)) as
        | { error?: string; jobs?: SmartQueueJob[]; groups?: SmartQueueGroup[]; recommendations?: SmartQueueRecommendation[] }
        | null;
      if (!res.ok) {
        setSmartQueueError(data?.error ?? "Failed to load smart queue.");
        return;
      }
      setSmartQueueJobs(data?.jobs ?? []);
      setSmartQueueGroups(data?.groups ?? []);
      setSmartQueueRecommendations(data?.recommendations ?? []);
      setSmartQueueSelectedJobId((current) =>
        current && (data?.jobs ?? []).some((job) => job.id === current) ? current : ((data?.jobs ?? [])[0]?.id ?? null)
      );
    } catch (error) {
      setSmartQueueError(error instanceof Error ? error.message : "Failed to load smart queue.");
    } finally {
      setSmartQueueLoading(false);
    }
  }

  async function refreshStock() {
    setStockLoading(true);
    setStockError(null);
    try {
      const res = await apiFetch("/api/stock");
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            sheets?: StockSheetRecord[];
            offcuts?: OffcutRecord[];
            movements?: StockMovementRecord[];
            lowStockWarnings?: StockWarning[];
          }
        | null;
      if (!res.ok) {
        setStockError(data?.error ?? "Failed to load stock.");
        return;
      }
      setStockSheets(data?.sheets ?? []);
      setStockOffcuts(data?.offcuts ?? []);
      setStockMovements(data?.movements ?? []);
      setStockWarnings(data?.lowStockWarnings ?? []);
      void refreshOffcutRecommendations();
    } catch (error) {
      setStockError(error instanceof Error ? error.message : "Failed to load stock.");
    } finally {
      setStockLoading(false);
    }
  }

  async function saveStockItem(kind: "sheet" | "offcut") {
    setStockError(null);
    const material = stockAddForm.material.trim();
    const thickness = Number(stockAddForm.thickness);
    const width = Number(stockAddForm.width);
    const height = Number(stockAddForm.height);
    const quantity = kind === "sheet" ? Number(stockAddForm.quantity) : 1;
    const costPerSheet = stockAddForm.costPerSheet.trim() ? Number(stockAddForm.costPerSheet) : null;
    if (!material || !Number.isFinite(thickness) || thickness <= 0 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      setStockError("Enter material, thickness, width, and height before saving stock.");
      return;
    }
    if (kind === "sheet" && (!Number.isFinite(quantity) || quantity <= 0)) {
      setStockError("Enter a valid sheet quantity.");
      return;
    }
    if (costPerSheet !== null && (!Number.isFinite(costPerSheet) || costPerSheet < 0)) {
      setStockError("Enter a valid cost per sheet.");
      return;
    }
    try {
      const path = kind === "sheet" ? "/api/stock/sheets" : "/api/stock/offcuts";
      const payload =
        kind === "sheet"
          ? {
              material,
              thickness,
              width,
              height,
              quantity,
              location: stockAddForm.location.trim() || null,
              supplier: stockAddForm.supplier.trim() || null,
              costPerSheet,
              status: "available"
            }
          : {
              material,
              thickness,
              width,
              height,
              location: stockAddForm.location.trim() || null,
              status: "available"
            };
      const res = await apiFetch(path, { method: "POST", body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setStockError(data?.error ?? `Failed to add ${kind}.`);
        return;
      }
      setStockAddMode(null);
      await refreshStock();
    } catch (error) {
      setStockError(error instanceof Error ? error.message : `Failed to add ${kind}.`);
    }
  }

  async function refreshCloudSyncSettings() {
    const res = await apiFetch("/api/cloud/settings");
    if (!res.ok) return;
    const data = (await res.json()) as { settings: CloudSyncSettingsRecord };
    setCloudSyncSettings(data.settings);
  }

  async function refreshCloudDashboard() {
    const res = await apiFetch("/api/cloud/dashboard");
    if (!res.ok) return;
    const data = (await res.json()) as { dashboard: CompanyDashboardRecord };
    setCloudDashboard(data.dashboard);
  }

  async function refreshCloudEvents() {
    const res = await apiFetch("/api/cloud/events");
    if (!res.ok) return;
    const data = (await res.json()) as { events: CloudSyncEventRecord[] };
    setCloudEvents(data.events);
  }

  async function refreshBrainCenter() {
    if (!workspaceId) return;
    setBrainLoading(true);
    setBrainError(null);
    try {
      const [eventsRes, recommendationsRes, dashboardRes] = await Promise.all([
        apiFetch(`/api/brain/events?workspaceId=${encodeURIComponent(workspaceId)}&limit=80`),
        apiFetch(`/api/brain/recommendations?workspaceId=${encodeURIComponent(workspaceId)}&status=all&limit=80`),
        apiFetch(`/api/brain/dashboard?workspaceId=${encodeURIComponent(workspaceId)}`)
      ]);
      const eventsData = (await eventsRes.json().catch(() => null)) as { error?: string; events?: BrainEventRecord[] } | null;
      const recommendationsData = (await recommendationsRes.json().catch(() => null)) as { error?: string; recommendations?: BrainRecommendationRecord[] } | null;
      const dashboardData = (await dashboardRes.json().catch(() => null)) as { error?: string; dashboard?: BrainDashboardRecord } | null;
      if (!eventsRes.ok) {
        setBrainError(eventsData?.error ?? "Failed to load brain events.");
        return;
      }
      if (!recommendationsRes.ok) {
        setBrainError(recommendationsData?.error ?? "Failed to load brain recommendations.");
        return;
      }
      if (!dashboardRes.ok) {
        setBrainError(dashboardData?.error ?? "Failed to load brain dashboard.");
        return;
      }
      setBrainEvents(eventsData?.events ?? []);
      setBrainRecommendations(recommendationsData?.recommendations ?? []);
      setBrainDashboard(dashboardData?.dashboard ?? null);
    } catch (error) {
      setBrainError(error instanceof Error ? error.message : "Failed to load Brain Center.");
    } finally {
      setBrainLoading(false);
    }
  }

  async function runBrainOrchestrator(mode: "quick" | "full") {
    if (!workspaceId) return;
    setBrainLoading(true);
    setBrainError(null);
    try {
      const res = await apiFetch("/api/brain/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, mode })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; dashboard?: BrainDashboardRecord } | null;
      if (!res.ok) {
        setBrainError(data?.error ?? "Failed to run Qouter X Brain.");
        return;
      }
      if (data?.dashboard) setBrainDashboard(data.dashboard);
      await refreshBrainCenter();
    } catch (error) {
      setBrainError(error instanceof Error ? error.message : "Failed to run Qouter X Brain.");
    } finally {
      setBrainLoading(false);
    }
  }

  async function openBrainCenterDetail(
    section: "profit" | "materials" | "offcuts" | "queue" | "lead_time" | "dxf_errors" | "events" | "nesting_purchasing" | "production_assistant"
  ) {
    const openDetailPanel = () => {
      setBrainCenterDetail(section);
      window.setTimeout(() => {
        document.querySelector<HTMLElement>('[data-brain-detail="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    };

    if (!workspaceId) return;
    if (section === "profit") {
      setBrainCenterDetail(null);
      setViewMode("profit_intelligence");
      void refreshProfitIntelligence();
      return;
    }
    if (section === "materials") {
      setBrainCenterDetail(null);
      setViewMode("material_prediction");
      void refreshMaterialPrediction();
      return;
    }
    if (section === "offcuts") {
      setBrainCenterDetail(null);
      setViewMode("nesting_workspace");
      void refreshNestingWorkspaceData();
      return;
    }
    if (section === "queue") {
      setBrainCenterDetail(null);
      setViewMode("ai_production_queue");
      void refreshProductionQueueBrain();
      return;
    }
    if (section === "lead_time") {
      setBrainCenterDetail(null);
      setViewMode("lead_time_intelligence");
      if (activeLeadTimeJob) {
        void predictLeadTime(activeLeadTimeJob.id);
      }
      return;
    }
    if (section === "dxf_errors") {
      setBrainCenterDetail(null);
      setViewMode("dxf_error_detection");
      return;
    }
    if (section === "nesting_purchasing") {
      setBrainCenterDetail(null);
      setViewMode("nesting_workspace");
      void Promise.all([refreshMaterialPrediction(), refreshNestingPlans(), refreshNestingWorkspaceData()]);
      return;
    }
    if (section === "production_assistant") {
      setBrainCenterDetail(null);
      setViewMode("production_assistant");
      return;
    }
    openDetailPanel();
  }

  async function refreshManufacturingMemory() {
    if (!workspaceId) return;
    setManufacturingMemoryLoading(true);
    setManufacturingMemoryError(null);
    try {
      const [memoriesRes, patternsRes] = await Promise.all([
        apiFetch(`/api/brain/memory?workspaceId=${encodeURIComponent(workspaceId)}&limit=120`),
        apiFetch(`/api/brain/patterns?workspaceId=${encodeURIComponent(workspaceId)}&limit=120`)
      ]);
      const memoriesData = (await memoriesRes.json().catch(() => null)) as { error?: string; memories?: ManufacturingMemoryRecord[] } | null;
      const patternsData = (await patternsRes.json().catch(() => null)) as { error?: string; patterns?: KnownPatternRecord[] } | null;
      if (!memoriesRes.ok) {
        setManufacturingMemoryError(memoriesData?.error ?? "Failed to load manufacturing memories.");
        return;
      }
      if (!patternsRes.ok) {
        setManufacturingMemoryError(patternsData?.error ?? "Failed to load known patterns.");
        return;
      }
      setManufacturingMemories(memoriesData?.memories ?? []);
      setManufacturingPatterns(patternsData?.patterns ?? []);
    } catch (error) {
      setManufacturingMemoryError(error instanceof Error ? error.message : "Failed to load Manufacturing Memory.");
    } finally {
      setManufacturingMemoryLoading(false);
    }
  }

  async function rebuildManufacturingMemory() {
    if (!workspaceId) return;
    setManufacturingMemoryLoading(true);
    setManufacturingMemoryError(null);
    try {
      const res = await apiFetch("/api/brain/memory/rebuild", {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setManufacturingMemoryError(data?.error ?? "Failed to rebuild manufacturing memory.");
        return;
      }
      await refreshManufacturingMemory();
    } catch (error) {
      setManufacturingMemoryError(error instanceof Error ? error.message : "Failed to rebuild Manufacturing Memory.");
    } finally {
      setManufacturingMemoryLoading(false);
    }
  }

  async function refreshProfitIntelligence() {
    if (!workspaceId) return;
    setProfitLoading(true);
    setProfitError(null);
    try {
      const [summaryRes, recordsRes, insightsRes] = await Promise.all([
        apiFetch(`/api/brain/profit/summary?workspaceId=${encodeURIComponent(workspaceId)}`),
        apiFetch(`/api/brain/profit/records?workspaceId=${encodeURIComponent(workspaceId)}&limit=120`),
        apiFetch(`/api/brain/profit/insights?workspaceId=${encodeURIComponent(workspaceId)}&limit=120`)
      ]);
      const summaryData = (await summaryRes.json().catch(() => null)) as ({ error?: string } & Partial<ProfitSummary>) | null;
      const recordsData = (await recordsRes.json().catch(() => null)) as { error?: string; records?: ProfitRecord[] } | null;
      const insightsData = (await insightsRes.json().catch(() => null)) as { error?: string; insights?: ProfitInsight[] } | null;
      if (!summaryRes.ok) {
        setProfitError(summaryData?.error ?? "Failed to load profit summary.");
        return;
      }
      if (!recordsRes.ok) {
        setProfitError(recordsData?.error ?? "Failed to load profit records.");
        return;
      }
      if (!insightsRes.ok) {
        setProfitError(insightsData?.error ?? "Failed to load profit insights.");
        return;
      }
      setProfitSummary(summaryData as ProfitSummary);
      setProfitRecords(recordsData?.records ?? []);
      setProfitInsights(insightsData?.insights ?? []);
    } catch (error) {
      setProfitError(error instanceof Error ? error.message : "Failed to load Profit Intelligence.");
    } finally {
      setProfitLoading(false);
    }
  }

  async function calculateProfitForJob(jobId: string) {
    if (!workspaceId || !jobId) return;
    setProfitLoading(true);
    setProfitError(null);
    try {
      const res = await apiFetch(`/api/brain/profit/calculate/${encodeURIComponent(jobId)}`, {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setProfitError(data?.error ?? "Failed to calculate job profit.");
        return;
      }
      await refreshProfitIntelligence();
    } catch (error) {
      setProfitError(error instanceof Error ? error.message : "Failed to calculate job profit.");
    } finally {
      setProfitLoading(false);
    }
  }

  async function refreshMaterialPrediction() {
    if (!workspaceId) return;
    setMaterialPredictionLoading(true);
    setMaterialPredictionError(null);
    try {
      const [forecastRes, shortageRes, purchasingRes] = await Promise.all([
        apiFetch(`/api/brain/materials/forecast?workspaceId=${encodeURIComponent(workspaceId)}&limit=200`),
        apiFetch(`/api/brain/materials/shortages?workspaceId=${encodeURIComponent(workspaceId)}`),
        apiFetch(`/api/brain/purchasing/recommendations?workspaceId=${encodeURIComponent(workspaceId)}&status=open&limit=120`)
      ]);
      const forecastData = (await forecastRes.json().catch(() => null)) as { error?: string; forecasts?: MaterialUsageForecastRecord[] } | null;
      const shortageData = (await shortageRes.json().catch(() => null)) as { error?: string; shortages?: MaterialShortageRecord[] } | null;
      const purchasingData = (await purchasingRes.json().catch(() => null)) as { error?: string; recommendations?: PurchaseRecommendationRecord[] } | null;
      if (!forecastRes.ok) {
        setMaterialPredictionError(forecastData?.error ?? "Failed to load material forecasts.");
        return;
      }
      if (!shortageRes.ok) {
        setMaterialPredictionError(shortageData?.error ?? "Failed to load material shortages.");
        return;
      }
      if (!purchasingRes.ok) {
        setMaterialPredictionError(purchasingData?.error ?? "Failed to load purchasing recommendations.");
        return;
      }
      setMaterialForecasts(forecastData?.forecasts ?? []);
      setMaterialShortages(shortageData?.shortages ?? []);
      setPurchaseRecommendations(purchasingData?.recommendations ?? []);
    } catch (error) {
      setMaterialPredictionError(error instanceof Error ? error.message : "Failed to load Material Prediction.");
    } finally {
      setMaterialPredictionLoading(false);
    }
  }

  async function rebuildMaterialPrediction() {
    if (!workspaceId) return;
    setMaterialPredictionLoading(true);
    setMaterialPredictionError(null);
    try {
      const res = await apiFetch("/api/brain/materials/rebuild-forecast", {
        method: "POST",
        body: JSON.stringify({ workspaceId, forecastPeriodsDays: [7, 30] })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMaterialPredictionError(data?.error ?? "Failed to rebuild material forecast.");
        return;
      }
      await refreshMaterialPrediction();
    } catch (error) {
      setMaterialPredictionError(error instanceof Error ? error.message : "Failed to rebuild Material Prediction.");
    } finally {
      setMaterialPredictionLoading(false);
    }
  }

  async function updatePurchaseRecommendation(id: number, action: "mark-ordered" | "dismiss") {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/brain/purchasing/recommendations/${encodeURIComponent(String(id))}/${action}`, {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMaterialPredictionError(data?.error ?? "Failed to update purchase recommendation.");
        return;
      }
      await refreshMaterialPrediction();
    } catch (error) {
      setMaterialPredictionError(error instanceof Error ? error.message : "Failed to update purchase recommendation.");
    }
  }

  async function refreshProductionQueueBrain() {
    if (!workspaceId) return;
    setProductionQueueLoading(true);
    setProductionQueueError(null);
    try {
      const res = await apiFetch(`/api/brain/queue/current?workspaceId=${encodeURIComponent(workspaceId)}`);
      const data = (await res.json().catch(() => null)) as { error?: string; plan?: ProductionQueuePlanRecord | null; scores?: ProductionQueueScoreRecord[] } | null;
      if (!res.ok) {
        setProductionQueueError(data?.error ?? "Failed to load AI Production Queue.");
        return;
      }
      setProductionQueuePlan(data?.plan ?? null);
      setProductionQueueScores(data?.scores ?? []);
    } catch (error) {
      setProductionQueueError(error instanceof Error ? error.message : "Failed to load AI Production Queue.");
    } finally {
      setProductionQueueLoading(false);
    }
  }

  async function createProductionQueuePlan() {
    if (!workspaceId) return;
    setProductionQueueLoading(true);
    setProductionQueueError(null);
    try {
      const res = await apiFetch("/api/brain/queue/plan", {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; plan?: ProductionQueuePlanRecord | null; scoredJobs?: ProductionQueueScoreRecord[] } | null;
      if (!res.ok) {
        setProductionQueueError(data?.error ?? "Failed to create AI queue plan.");
        return;
      }
      await refreshProductionQueueBrain();
    } catch (error) {
      setProductionQueueError(error instanceof Error ? error.message : "Failed to create AI queue plan.");
    } finally {
      setProductionQueueLoading(false);
    }
  }

  async function updateProductionQueuePlan(id: number, action: "start" | "complete") {
    if (!workspaceId) return;
    setProductionQueueLoading(true);
    setProductionQueueError(null);
    try {
      const res = await apiFetch(`/api/brain/queue/plans/${encodeURIComponent(String(id))}/${action}`, {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setProductionQueueError(data?.error ?? `Failed to ${action} AI queue plan.`);
        return;
      }
      await refreshProductionQueueBrain();
    } catch (error) {
      setProductionQueueError(error instanceof Error ? error.message : `Failed to ${action} AI queue plan.`);
    } finally {
      setProductionQueueLoading(false);
    }
  }

  async function predictLeadTime(jobId: number) {
    if (!workspaceId || !Number.isFinite(jobId)) return;
    setLeadTimeLoading(true);
    setLeadTimeError(null);
    try {
      const res = await apiFetch("/api/brain/lead-time/predict", {
        method: "POST",
        body: JSON.stringify({ workspaceId, jobId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; prediction?: LeadTimePredictionRecord } | null;
      if (!res.ok) {
        setLeadTimeError(data?.error ?? "Failed to predict lead time.");
        return;
      }
      setLeadTimePrediction(data?.prediction ?? null);
    } catch (error) {
      setLeadTimeError(error instanceof Error ? error.message : "Failed to predict lead time.");
    } finally {
      setLeadTimeLoading(false);
    }
  }

  async function runSheetOptimization() {
    if (!workspaceId) return;
    setSheetOptimizerLoading(true);
    setSheetOptimizerError(null);
    try {
      const res = await apiFetch("/api/brain/sheets/optimize", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          material: sheetOptimizerMaterial,
          thickness: Number(sheetOptimizerThickness),
          requiredWidth: Number(sheetOptimizerWidth),
          requiredHeight: Number(sheetOptimizerHeight),
          jobId: activeSheetOptimizerJob ? String(activeSheetOptimizerJob.id) : null
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; result?: SheetOptimizationResultRecord } | null;
      if (!res.ok) {
        setSheetOptimizerError(data?.error ?? "Failed to optimize sheet source.");
        return;
      }
      setSheetOptimizerResult(data?.result ?? null);
    } catch (error) {
      setSheetOptimizerError(error instanceof Error ? error.message : "Failed to optimize sheet source.");
    } finally {
      setSheetOptimizerLoading(false);
    }
  }

  async function refreshNestingPlans() {
    if (!workspaceId) return;
    setNestingLoading(true);
    setNestingError(null);
    try {
      const res = await apiFetch(`/api/brain/nesting/plans?workspaceId=${encodeURIComponent(workspaceId)}`);
      const data = (await res.json().catch(() => null)) as { error?: string; plans?: NestingPlanRecord[] } | null;
      if (!res.ok) {
        setNestingError(data?.error ?? "Failed to load nesting plans.");
        return;
      }
      setNestingPlans(data?.plans ?? []);
    } catch (error) {
      setNestingError(error instanceof Error ? error.message : "Failed to load nesting plans.");
    } finally {
      setNestingLoading(false);
    }
  }

  async function createNestingRecommendations() {
    if (!workspaceId) return;
    setNestingLoading(true);
    setNestingError(null);
    try {
      const res = await apiFetch("/api/brain/nesting/recommend", {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        plans?: NestingPlanRecord[];
        skippedGroups?: NestingSkippedGroupRecord[];
      } | null;
      if (!res.ok) {
        setNestingError(data?.error ?? "Failed to create nesting recommendations.");
        return;
      }
      setNestingSkippedGroups(data?.skippedGroups ?? []);
      await refreshNestingPlans();
    } catch (error) {
      setNestingError(error instanceof Error ? error.message : "Failed to create nesting recommendations.");
    } finally {
      setNestingLoading(false);
    }
  }

  async function approveNestingPlan(id: number) {
    if (!workspaceId) return;
    setNestingLoading(true);
    setNestingError(null);
    try {
      const res = await apiFetch(`/api/brain/nesting/plans/${encodeURIComponent(String(id))}/approve`, {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setNestingError(data?.error ?? "Failed to approve nesting plan.");
        return;
      }
      await refreshNestingPlans();
    } catch (error) {
      setNestingError(error instanceof Error ? error.message : "Failed to approve nesting plan.");
    } finally {
      setNestingLoading(false);
    }
  }

  function parseSheetSizeInput(value?: string | null) {
    const match = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  async function runAdvancedNestingEngine() {
    if (!workspaceId) return;
    setNestingLoading(true);
    setNestingError(null);
    try {
      const material = advancedNestMaterial.trim();
      const thickness = Number(advancedNestThickness);
      const candidateJobs = smartQueueJobs.filter((job) =>
        job.material.trim().toLowerCase() === material.toLowerCase() &&
        Math.abs(Number(job.thickness ?? 0) - thickness) < 0.001 &&
        job.status !== "completed"
      );
      const parts = candidateJobs.flatMap((job) => {
        const size = parseSheetSizeInput(job.sheetSize);
        if (!size) return [];
        return [{
          jobId: job.id,
          quoteId: job.quoteId ?? null,
          partDnaId: job.partDnaId ?? null,
          dxfFileId: job.dxfFilePath ?? null,
          quantity: 1,
          width: size.width,
          height: size.height,
          cutLength: job.estimatedCutLength,
          pierceCount: job.estimatedPierceCount
        }];
      });
      if (!parts.length) {
        setNestingError("No queued parts with a usable Width x Height sheet size match these nesting settings.");
        return;
      }
      const createRes = await apiFetch("/api/nesting/create", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          material,
          thickness,
          sheetWidth: Number(advancedNestSheetWidth),
          sheetHeight: Number(advancedNestSheetHeight),
          kerf: Number(advancedNestKerf),
          border: Number(advancedNestBorder),
          spacing: Number(advancedNestSpacing),
          allowedRotations: [0, 90, 180, 270],
          allowCommonLine: advancedNestAllowCommonLine,
          allowCommonLineCutting: advancedNestAllowCommonLine,
          allowMicroJoins: advancedNestEnableMicroJoins,
          enableMicroJoins: advancedNestEnableMicroJoins,
          leadInType: advancedNestLeadInType,
          leadInLength: Number(advancedNestLeadInLength),
          parts
        })
      });
      const created = (await createRes.json().catch(() => null)) as { error?: string; plan?: AdvancedNestingPlanRecord } | null;
      if (!createRes.ok || !created?.plan?.jobId) {
        setNestingError(created?.error ?? "Failed to create advanced nesting job.");
        return;
      }
      const optimizeRes = await apiFetch(`/api/nesting/${encodeURIComponent(String(created.plan.jobId))}/optimize`, { method: "POST" });
      const optimized = (await optimizeRes.json().catch(() => null)) as { error?: string; plan?: AdvancedNestingPlanRecord } | null;
      if (!optimizeRes.ok || !optimized?.plan) {
        setNestingError(optimized?.error ?? "Failed to optimize advanced nesting job.");
        return;
      }
      setAdvancedNestResult(optimized.plan);
      await refreshBrainCenter();
    } catch (error) {
      setNestingError(error instanceof Error ? error.message : "Failed to run advanced nesting engine.");
    } finally {
      setNestingLoading(false);
    }
  }

  async function exportAdvancedNestingDxf() {
    if (!advancedNestResult?.jobId) return;
    setNestingLoading(true);
    setNestingError(null);
    try {
      const res = await apiFetch(`/api/nesting/${encodeURIComponent(String(advancedNestResult.jobId))}/export-dxf`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string; plan?: AdvancedNestingPlanRecord } | null;
      if (!res.ok || !data?.plan) {
        setNestingError(data?.error ?? "Failed to export nested DXF.");
        return;
      }
      setAdvancedNestResult(data.plan);
    } catch (error) {
      setNestingError(error instanceof Error ? error.message : "Failed to export nested DXF.");
    } finally {
      setNestingLoading(false);
    }
  }

  async function runNestingStudio(maxOptimizationMs = 10000) {
    setNestingStudioLoading(true);
    setNestingStudioError(null);
    setNestingStudioExportPath(null);
    setNestingStudioExport(null);
    try {
      const selectedOffcut = nestingStudioOffcuts.find((offcut) => offcut.id === nestingStudioSelectedOffcutId) ?? null;
      const res = await apiFetch("/api/nesting/run", {
        method: "POST",
        body: JSON.stringify({
          customerName: nestingStudioCustomer,
          nestName: nestingStudioNestName,
          sheet: {
            id: selectedOffcut ? String(selectedOffcut.id) : undefined,
            type: selectedOffcut ? "offcut" : "sheet",
            width: selectedOffcut?.width ?? Number(nestingStudioSheetWidth),
            height: selectedOffcut?.height ?? Number(nestingStudioSheetHeight),
            kerf: Number(nestingStudioKerf),
            spacing: Number(nestingStudioSpacing),
            border: Number(nestingStudioBorder)
          },
          maxOptimizationMs
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; result?: NestingStudioResult } | null;
      if (!res.ok || !data?.result) {
        setNestingStudioError(data?.error ?? "Failed to run nesting.");
        return;
      }
      const sheetWidth = Math.max(1, Number(selectedOffcut?.width ?? nestingStudioSheetWidth) || 3000);
      const sheetHeight = Math.max(1, Number(selectedOffcut?.height ?? nestingStudioSheetHeight) || 1500);
      const nextResult = recalculateNestingStudioResult(
        data.result,
        sheetWidth,
        sheetHeight,
        Math.max(0, Number(nestingStudioBorder) || 0),
        Math.max(0, Number(nestingStudioSpacing) || 0),
        Math.max(0, Number(nestingStudioKerf) || 0),
        nestingStudioCustomer
      );
      setNestingStudioResult(nextResult);
      setNestingStudioSelectedPartId(nextResult.placements[0]?.partId ?? null);
      void saveNestingStudioManualResult(nextResult);
      if (selectedOffcut) void recordNestingStudioOffcutEvent("offcut_selected", selectedOffcut.id, nestingStudioOffcutRecommendation);
    } catch (error) {
      setNestingStudioError(error instanceof Error ? error.message : "Failed to run nesting.");
    } finally {
      setNestingStudioLoading(false);
    }
  }

  async function loadNestingStudioOffcuts() {
    try {
      const res = await apiFetch("/api/nesting/offcuts");
      const data = (await res.json().catch(() => null)) as { offcuts?: NestingOffcutRecord[] } | null;
      if (res.ok) setNestingStudioOffcuts((data?.offcuts ?? []).filter((offcut) => offcut.status === "available"));
    } catch {
      setNestingStudioOffcuts([]);
    }
  }

  function recommendNestingStudioOffcut() {
    const footprint = getNestingStudioFootprint(nestingStudioResult);
    const material = nestingStudioMaterial.trim().toLowerCase();
    const thickness = Number(nestingStudioThickness);
    if (!footprint.area || !material || !Number.isFinite(thickness)) {
      setNestingStudioOffcutRecommendation(null);
      return;
    }
    const recommendation = nestingStudioOffcuts
      .filter((offcut) => offcut.status === "available")
      .filter((offcut) => offcut.material.trim().toLowerCase() === material && Math.abs(Number(offcut.thickness) - thickness) < 0.001)
      .map((offcut) => {
        const fitsNormal = footprint.width <= offcut.width && footprint.height <= offcut.height;
        const fitsRotated = footprint.height <= offcut.width && footprint.width <= offcut.height;
        if (!fitsNormal && !fitsRotated) return null;
        const usableArea = Math.max(1, Number(offcut.usableArea) || offcut.width * offcut.height);
        return {
          offcut,
          rotatedFit: !fitsNormal && fitsRotated,
          wastePercent: Number((Math.max(0, usableArea - footprint.area) / usableArea * 100).toFixed(2)),
          estimatedSaving: Number((footprint.area * 0.00012).toFixed(2))
        };
      })
      .filter((entry): entry is NestingStudioOffcutRecommendation => Boolean(entry))
      .sort((a, b) => a.wastePercent - b.wastePercent)[0] ?? null;
    setNestingStudioOffcutRecommendation(recommendation);
    if (recommendation) void recordNestingStudioOffcutEvent("offcut_recommended", recommendation.offcut.id, recommendation);
  }

  async function recordNestingStudioOffcutEvent(eventType: "offcut_recommended" | "offcut_selected", offcutId: number, recommendation: NestingStudioOffcutRecommendation | null) {
    try {
      await apiFetch("/api/nesting/studio/offcut-event", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          eventType,
          offcutId,
          wastePercent: recommendation?.wastePercent ?? 0,
          estimatedSaving: recommendation?.estimatedSaving ?? 0,
          rotatedFit: recommendation?.rotatedFit ?? false
        })
      });
    } catch {
      // Recommendation events are advisory; do not interrupt nesting.
    }
  }

  function selectNestingStudioOffcut(offcut: NestingOffcutRecord) {
    setNestingStudioSelectedOffcutId(offcut.id);
    setNestingStudioSheetWidth(String(offcut.width));
    setNestingStudioSheetHeight(String(offcut.height));
    void recordNestingStudioOffcutEvent("offcut_selected", offcut.id, nestingStudioOffcutRecommendation);
  }

  function getNestingStudioCanvasPoint(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = nestingStudioCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sheetWidth = Math.max(1, Number(nestingStudioSheetWidth) || 3000);
    const sheetHeight = Math.max(1, Number(nestingStudioSheetHeight) || 1500);
    const scale = Math.min((canvas.width - 24) / sheetWidth, (canvas.height - 24) / sheetHeight);
    const offsetX = (canvas.width - sheetWidth * scale) / 2;
    const offsetY = (canvas.height - sheetHeight * scale) / 2;
    const canvasX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const canvasY = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return { x: (canvasX - offsetX) / scale, y: (canvasY - offsetY) / scale };
  }

  function applyNestingStudioManualResult(result: NestingStudioResult) {
    const next = recalculateNestingStudioResult(
      result,
      Math.max(1, Number(nestingStudioSheetWidth) || 3000),
      Math.max(1, Number(nestingStudioSheetHeight) || 1500),
      Math.max(0, Number(nestingStudioBorder) || 0),
      Math.max(0, Number(nestingStudioSpacing) || 0),
      Math.max(0, Number(nestingStudioKerf) || 0),
      nestingStudioCustomer
    );
    setNestingStudioResult(next);
    setNestingStudioExportPath(null);
    void saveNestingStudioManualResult(next);
  }

  async function saveNestingStudioManualResult(result: NestingStudioResult) {
    try {
      await apiFetch("/api/nesting/studio/save", {
        method: "POST",
        body: JSON.stringify({ workspaceId, customerName: nestingStudioCustomer, selectedOffcutId: nestingStudioSelectedOffcutId, result })
      });
    } catch {
      // Manual edits still remain on screen if the background save fails.
    }
  }

  function moveNestingStudioPlacement(partId: string, nextX: number, nextY: number) {
    if (!nestingStudioResult) return;
    const grid = nestingStudioSnapToGrid ? 10 : 1;
    const snappedX = Math.round(nextX / grid) * grid;
    const snappedY = Math.round(nextY / grid) * grid;
    const nextPlacements = nestingStudioResult.placements.map((placement) => {
      if (placement.partId !== partId) return placement;
      const dx = snappedX - placement.x;
      const dy = snappedY - placement.y;
      return {
        ...placement,
        x: snappedX,
        y: snappedY,
        polygon: placement.polygon.map((point) => ({ x: point.x + dx, y: point.y + dy })),
        microJoins: placement.microJoins.map((point) => ({ x: point.x + dx, y: point.y + dy })),
        leadIn: {
          start: { x: placement.leadIn.start.x + dx, y: placement.leadIn.start.y + dy },
          end: { x: placement.leadIn.end.x + dx, y: placement.leadIn.end.y + dy }
        }
      };
    });
    applyNestingStudioManualResult({ ...nestingStudioResult, placements: nextPlacements });
  }

  function rotateSelectedNestingStudioPlacement() {
    if (!nestingStudioResult || !nestingStudioSelectedPartId) return;
    const nextPlacements = nestingStudioResult.placements.map((placement) => {
      if (placement.partId !== nestingStudioSelectedPartId) return placement;
      const box = nestingStudioBounds(placement.polygon);
      const rotated = placement.polygon.map((point) => ({
        x: placement.x + (box.height - (point.y - box.minY)),
        y: placement.y + (point.x - box.minX)
      }));
      const nextBox = nestingStudioBounds(rotated);
      const dx = placement.x - nextBox.minX;
      const dy = placement.y - nextBox.minY;
      const polygon = rotated.map((point) => ({ x: point.x + dx, y: point.y + dy }));
      const finalBox = nestingStudioBounds(polygon);
      return {
        ...placement,
        rotation: (placement.rotation + 90) % 360,
        polygon,
        microJoins: [
          { x: finalBox.minX + finalBox.width / 2, y: finalBox.minY },
          { x: finalBox.minX + finalBox.width / 2, y: finalBox.maxY }
        ],
        leadIn: { start: { x: finalBox.minX - 4, y: finalBox.minY + 4 }, end: { x: finalBox.minX, y: finalBox.minY + 4 } }
      };
    });
    applyNestingStudioManualResult({ ...nestingStudioResult, placements: nextPlacements });
  }

  function deleteSelectedNestingStudioPlacement() {
    if (!nestingStudioResult || !nestingStudioSelectedPartId) return;
    const selected = nestingStudioResult.placements.find((placement) => placement.partId === nestingStudioSelectedPartId);
    const nextPlacements = nestingStudioResult.placements.filter((placement) => placement.partId !== nestingStudioSelectedPartId);
    const nextUnplaced = selected
      ? [...nestingStudioResult.unplaced, { id: selected.partId, name: selected.name, quantity: 1 }]
      : nestingStudioResult.unplaced;
    setNestingStudioSelectedPartId(nextPlacements[0]?.partId ?? null);
    applyNestingStudioManualResult({ ...nestingStudioResult, placements: nextPlacements, unplaced: nextUnplaced });
  }

  function handleNestingStudioCanvasMouseDown(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!nestingStudioResult) return;
    const point = getNestingStudioCanvasPoint(event);
    if (!point) return;
    const selected = [...nestingStudioResult.placements].reverse().find((placement) => {
      const box = nestingStudioBounds(placement.polygon);
      return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
    });
    setNestingStudioSelectedPartId(selected?.partId ?? null);
    if (selected) nestingStudioDragRef.current = { partId: selected.partId, offsetX: point.x - selected.x, offsetY: point.y - selected.y };
  }

  function handleNestingStudioCanvasMouseMove(event: React.MouseEvent<HTMLCanvasElement>) {
    const drag = nestingStudioDragRef.current;
    if (!drag) return;
    const point = getNestingStudioCanvasPoint(event);
    if (!point) return;
    moveNestingStudioPlacement(drag.partId, point.x - drag.offsetX, point.y - drag.offsetY);
  }

  function stopNestingStudioDrag() {
    nestingStudioDragRef.current = null;
  }

  async function exportNestingStudioDxf() {
    if (!nestingStudioResult?.dxf) return;
    setNestingStudioLoading(true);
    setNestingStudioError(null);
    try {
      const res = await apiFetch("/api/nesting/export", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          customerName: nestingStudioCustomer,
          nestName: nestingStudioNestName,
          dxf: nestingStudioResult.dxf
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; exportPath?: string; exportFolder?: string; exportFileName?: string } | null;
      if (!res.ok || !data?.exportPath) {
        setNestingStudioError(data?.error ?? "Failed to export DXF.");
        return;
      }
      setNestingStudioExportPath(data.exportPath);
      setNestingStudioExport({
        exportPath: data.exportPath,
        exportFolder: data.exportFolder ?? data.exportPath.split("/").slice(0, -1).join("/"),
        exportFileName: data.exportFileName ?? data.exportPath.split("/").pop() ?? "nesting.dxf"
      });
    } catch (error) {
      setNestingStudioError(error instanceof Error ? error.message : "Failed to export DXF.");
    } finally {
      setNestingStudioLoading(false);
    }
  }

  async function openNestingStudioExportFolder() {
    if (!nestingStudioExport?.exportFolder) return;
    const result = await window.desktopShell?.openPath?.(nestingStudioExport.exportFolder);
    if (result && !result.ok) setNestingStudioError(result.error ?? "Failed to open export folder.");
  }

  function calculateNestingStudioLeftover() {
    if (!nestingStudioResult?.placements.length) return null;
    const sheetWidth = Math.max(1, Number(nestingStudioSheetWidth) || 3000);
    const sheetHeight = Math.max(1, Number(nestingStudioSheetHeight) || 1500);
    const border = Math.max(0, Number(nestingStudioBorder) || 0);
    const used = nestingStudioBounds(nestingStudioResult.placements.flatMap((placement) => placement.polygon));
    const right = { width: Math.max(0, sheetWidth - used.maxX - border), height: Math.max(0, sheetHeight - border * 2) };
    const top = { width: Math.max(0, sheetWidth - border * 2), height: Math.max(0, sheetHeight - used.maxY - border) };
    const best = right.width * right.height >= top.width * top.height ? right : top;
    if (best.width < 50 || best.height < 50) return null;
    return best;
  }

  async function createNestingStudioLeftoverOffcut() {
    const leftover = calculateNestingStudioLeftover();
    if (!leftover) {
      setNestingStudioError("No usable leftover offcut found.");
      return;
    }
    setNestingStudioLoading(true);
    setNestingStudioError(null);
    try {
      const shapeJson = JSON.stringify({ type: "rect", width: leftover.width, height: leftover.height });
      const previewJson = JSON.stringify({
        outline: [{ x: 0, y: 0 }, { x: leftover.width, y: 0 }, { x: leftover.width, y: leftover.height }, { x: 0, y: leftover.height }],
        cutouts: [],
        width: leftover.width,
        height: leftover.height
      });
      const res = await apiFetch("/api/nesting/studio/create-leftover-offcut", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          material: nestingStudioMaterial,
          thickness: Number(nestingStudioThickness),
          width: leftover.width,
          height: leftover.height,
          sourceJobId: nestingStudioExport?.exportFileName ?? "nesting-studio",
          sourceCustomerId: nestingStudioCustomer,
          shapeJson,
          previewJson
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; offcut?: NestingOffcutRecord } | null;
      if (!res.ok || !data?.offcut) {
        setNestingStudioError(data?.error ?? "Failed to create leftover offcut.");
        return;
      }
      await loadNestingStudioOffcuts();
    } catch (error) {
      setNestingStudioError(error instanceof Error ? error.message : "Failed to create leftover offcut.");
    } finally {
      setNestingStudioLoading(false);
    }
  }

  async function refreshNestingWorkspaceData(activeId = nestingWorkspaceActive?.id ?? null) {
    if (!workspaceId) return;
    setNestingWorkspaceLoading(true);
    setNestingWorkspaceError(null);
    try {
      const loadJson = async <T,>(request: Promise<Response>, fallback: T) => {
        try {
          const response = await request;
          const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
          return response.ok ? { data: data ?? fallback, error: null } : { data: fallback, error: data?.error ?? "Request failed" };
        } catch (error) {
          return { data: fallback, error: error instanceof Error ? error.message : "Request failed" };
        }
      };
      const [workspacesResult, offcutsResult, historyResult] = await Promise.all([
        loadJson<{ workspaces?: NestingWorkspaceRecord[] }>(apiFetch(`/api/nesting/workspaces?workspaceId=${encodeURIComponent(workspaceId)}`), { workspaces: [] }),
        loadJson<{ offcuts?: NestingOffcutRecord[] }>(apiFetch("/api/nesting/offcuts"), { offcuts: [] }),
        loadJson<{ history?: NestingWorkspaceRecord[] }>(apiFetch(`/api/nesting/history?workspaceId=${encodeURIComponent(workspaceId)}`), { history: [] })
      ]);
      const loadErrors = [workspacesResult.error, offcutsResult.error, historyResult.error].filter((value): value is string => Boolean(value));
      const nextWorkspaces = workspacesResult.data.workspaces ?? [];
      setNestingWorkspaceItems(nextWorkspaces);
      setNestingWorkspaceOffcuts(offcutsResult.data.offcuts ?? []);
      setNestingWorkspaceHistory(historyResult.data.history ?? []);
      if (loadErrors.length) setNestingWorkspaceError(loadErrors.join(" · "));
      const selected = nextWorkspaces.find((entry) => entry.id === activeId) ?? nextWorkspaces[0] ?? null;
      setNestingWorkspaceActive(selected);
      if (selected) {
        setNestingWorkspaceCustomerName(selected.customerName);
        setNestingWorkspaceCustomerId(selected.customerId ?? "");
        setNestingWorkspaceNestName(selected.nestName);
        setNestingWorkspaceMaterial(selected.material);
        setNestingWorkspaceThickness(String(selected.thickness));
        setNestingWorkspaceSheetWidth(String(selected.sheetWidth));
        setNestingWorkspaceSheetHeight(String(selected.sheetHeight));
        setNestingWorkspaceBorder(String(selected.border));
        setNestingWorkspaceKerf(String(selected.kerf));
        setNestingWorkspaceSpacing(String(selected.spacing));
        setNestingWorkspaceAllowRotation(selected.allowRotation);
        setNestingWorkspaceAllowCommonLine(selected.allowCommonLine);
        setNestingWorkspaceEnableMicroJoins(selected.enableMicroJoins);
        setNestingWorkspaceLeadInType(selected.leadInType);
        setNestingWorkspaceLeadInLength(String(selected.leadInLength));
      }
    } catch (error) {
      setNestingWorkspaceError(error instanceof Error ? error.message : "Failed to load nesting workspace.");
    } finally {
      setNestingWorkspaceLoading(false);
    }
  }

  function buildNestingWorkspacePayload() {
    const selectedCustomer = customers.find((customer) => customer.id === nestingWorkspaceCustomerId);
    return {
      workspaceId,
      customerId: selectedCustomer?.id ?? (nestingWorkspaceCustomerId || null),
      customerName: selectedCustomer?.name ?? nestingWorkspaceCustomerName,
      nestName: nestingWorkspaceNestName,
      material: nestingWorkspaceMaterial,
      thickness: Number(nestingWorkspaceThickness),
      sheetWidth: Number(nestingWorkspaceSheetWidth),
      sheetHeight: Number(nestingWorkspaceSheetHeight),
      border: Number(nestingWorkspaceBorder),
      kerf: Number(nestingWorkspaceKerf),
      spacing: Number(nestingWorkspaceSpacing),
      allowRotation: nestingWorkspaceAllowRotation,
      allowCommonLine: nestingWorkspaceAllowCommonLine,
      enableMicroJoins: nestingWorkspaceEnableMicroJoins,
      leadInType: nestingWorkspaceLeadInType,
      leadInLength: Number(nestingWorkspaceLeadInLength)
    };
  }

  async function ensureNestingWorkspace(): Promise<NestingWorkspaceRecord | null> {
    if (nestingWorkspaceActive) return nestingWorkspaceActive;
    if (!workspaceId) return null;
    const res = await apiFetch("/api/nesting/workspaces", {
      method: "POST",
      body: JSON.stringify(buildNestingWorkspacePayload())
    });
    const data = (await res.json().catch(() => null)) as { error?: string; workspace?: NestingWorkspaceRecord } | null;
    if (!res.ok || !data?.workspace) {
      setNestingWorkspaceError(data?.error ?? "Failed to create nesting workspace.");
      return null;
    }
    setNestingWorkspaceActive(data.workspace);
    await refreshNestingWorkspaceData(data.workspace.id);
    return data.workspace;
  }

  async function saveNestingWorkspaceSettings() {
    if (!workspaceId) return;
    setNestingWorkspaceLoading(true);
    setNestingWorkspaceError(null);
    const payload = buildNestingWorkspacePayload();
    try {
      const res = await apiFetch(nestingWorkspaceActive ? `/api/nesting/workspaces/${nestingWorkspaceActive.id}` : "/api/nesting/workspaces", {
        method: nestingWorkspaceActive ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      const data = (await res.json().catch(() => null)) as { error?: string; workspace?: NestingWorkspaceRecord } | null;
      if (!res.ok || !data?.workspace) {
        setNestingWorkspaceError(data?.error ?? "Failed to save nesting workspace.");
        return;
      }
      await refreshNestingWorkspaceData(data.workspace.id);
    } catch (error) {
      setNestingWorkspaceError(error instanceof Error ? error.message : "Failed to save nesting workspace.");
    } finally {
      setNestingWorkspaceLoading(false);
    }
  }

  async function addDxfToNestingWorkspace(file: File | null) {
    if (!file) return;
    setNestingWorkspaceLoading(true);
    setNestingWorkspaceError(null);
    try {
      const workspace = await ensureNestingWorkspace();
      if (!workspace) return;
      const rawDxf = await file.text();
      const res = await apiFetch(`/api/nesting/workspaces/${workspace.id}/parts`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, dxfFileId: file.name, rawDxf, quantity: 1 })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; workspace?: NestingWorkspaceRecord } | null;
      if (!res.ok) {
        setNestingWorkspaceError(data?.error ?? "Failed to add DXF.");
        return;
      }
      await refreshNestingWorkspaceData(workspace.id);
      await recommendNestingWorkspaceOffcuts(workspace);
    } catch (error) {
      setNestingWorkspaceError(error instanceof Error ? error.message : "Failed to add DXF.");
    } finally {
      setNestingWorkspaceLoading(false);
    }
  }

  async function addDxfToNestingWorkspaceFromDesktopPicker() {
    if (!window.desktopShell?.pickFile) {
      setNestingWorkspaceError("Desktop picker is unavailable. Use Choose file or restart the desktop app.");
      return;
    }
    setNestingWorkspaceLoading(true);
    setNestingWorkspaceError(null);
    try {
      const result = await window.desktopShell.pickFile({ title: "Select DXF file", extensions: ["dxf"] });
      if (!result.ok) {
        if (!result.canceled) setNestingWorkspaceError(`DXF import failed. ${result.error ?? "Unknown error"}`);
        return;
      }
      const workspace = await ensureNestingWorkspace();
      if (!workspace) return;
      const rawDxf = decodeDxfArrayBuffer(decodeBase64ToArrayBuffer(result.contentBase64));
      const res = await apiFetch(`/api/nesting/workspaces/${workspace.id}/parts`, {
        method: "POST",
        body: JSON.stringify({ fileName: result.fileName, dxfFileId: result.fileName, rawDxf, quantity: 1 })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; workspace?: NestingWorkspaceRecord } | null;
      if (!res.ok) {
        setNestingWorkspaceError(data?.error ?? "Failed to add DXF.");
        return;
      }
      await refreshNestingWorkspaceData(workspace.id);
      await recommendNestingWorkspaceOffcuts(workspace);
    } catch (error) {
      setNestingWorkspaceError(error instanceof Error ? error.message : "Failed to add DXF.");
    } finally {
      setNestingWorkspaceLoading(false);
    }
  }

  async function updateNestingWorkspacePartQuantity(partId: number, quantity: number) {
    if (!nestingWorkspaceActive) return;
    const nextQuantity = Math.max(1, Math.round(Number(quantity) || 1));
    setNestingWorkspaceLoading(true);
    setNestingWorkspaceError(null);
    try {
      const res = await apiFetch(`/api/nesting/workspaces/${nestingWorkspaceActive.id}/parts/${partId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: nextQuantity })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; workspace?: NestingWorkspaceRecord } | null;
      if (!res.ok || !data?.workspace) {
        setNestingWorkspaceError(data?.error ?? "Failed to update quantity.");
        return;
      }
      setNestingWorkspaceActive(data.workspace);
      await refreshNestingWorkspaceData(data.workspace.id);
    } catch (error) {
      setNestingWorkspaceError(error instanceof Error ? error.message : "Failed to update quantity.");
    } finally {
      setNestingWorkspaceLoading(false);
    }
  }

  async function addJobToNestingWorkspace(job: JobRecord | null) {
    if (!job) return;
    setNestingWorkspaceLoading(true);
    setNestingWorkspaceError(null);
    const workspace = await ensureNestingWorkspace();
    if (!workspace) {
      setNestingWorkspaceLoading(false);
      return;
    }
    const part = job.jobDxfParts?.[0];
    try {
      await apiFetch(`/api/nesting/workspaces/${workspace.id}/parts`, {
        method: "POST",
        body: JSON.stringify({
          jobId: job.id,
          fileName: part?.name ?? job.title,
          quantity: part?.quantity ?? 1,
          width: part?.widthMm ?? 100,
          height: part?.heightMm ?? 100,
          cutLength: part?.cutLengthMm ?? 400,
          pierceCount: part?.pierceCount ?? 1,
          partDnaId: part?.partDnaId ?? null
        })
      });
      await refreshNestingWorkspaceData(workspace.id);
    } finally {
      setNestingWorkspaceLoading(false);
    }
  }

  async function addQuoteToNestingWorkspace(quote: QuoteRecord | null) {
    if (!quote) return;
    setNestingWorkspaceLoading(true);
    setNestingWorkspaceError(null);
    const workspace = await ensureNestingWorkspace();
    if (!workspace) {
      setNestingWorkspaceLoading(false);
      return;
    }
    const part = Object.values(quote.sections ?? {}).flatMap((section) => section.parts ?? [])[0];
    try {
      await apiFetch(`/api/nesting/workspaces/${workspace.id}/parts`, {
        method: "POST",
        body: JSON.stringify({
          quoteId: quote.id,
          fileName: part?.name ?? quote.title,
          quantity: part?.quantity ?? 1,
          width: part?.lengthMm ?? 100,
          height: part?.widthMm ?? 100,
          cutLength: ((part?.lengthMm ?? 100) + (part?.widthMm ?? 100)) * 2,
          pierceCount: 1,
          partDnaId: part?.partDnaId ?? null
        })
      });
      await refreshNestingWorkspaceData(workspace.id);
    } finally {
      setNestingWorkspaceLoading(false);
    }
  }

  async function recommendNestingWorkspaceOffcuts(workspaceOverride?: NestingWorkspaceRecord) {
    const workspace = workspaceOverride ?? nestingWorkspaceActive;
    if (!workspace) return;
    const res = await apiFetch("/api/nesting/offcuts/recommend", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: workspace.id,
        material: workspace.material,
        thickness: workspace.thickness
      })
    });
    const data = (await res.json().catch(() => null)) as { error?: string; best?: NestingOffcutRecommendation | null } | null;
    if (!res.ok) {
      setNestingWorkspaceError(data?.error ?? "Failed to recommend offcuts.");
      return;
    }
    setNestingWorkspaceRecommendation(data?.best ?? null);
  }

  async function useNestingWorkspaceOffcut(offcut: NestingOffcutRecord | NestingOffcutRecommendation) {
    if (!nestingWorkspaceActive) return;
    const width = Number(offcut.width);
    const height = Number(offcut.height);
    const sourceId = "offcutId" in offcut ? offcut.offcutId : offcut.id;
    const res = await apiFetch(`/api/nesting/workspaces/${nestingWorkspaceActive.id}`, {
      method: "PATCH",
      body: JSON.stringify({ sourceType: "offcut", sourceId, sheetWidth: width, sheetHeight: height })
    });
    const data = (await res.json().catch(() => null)) as { error?: string; workspace?: NestingWorkspaceRecord } | null;
    if (!res.ok || !data?.workspace) {
      setNestingWorkspaceError(data?.error ?? "Failed to use offcut.");
      return;
    }
    await refreshNestingWorkspaceData(data.workspace.id);
  }

  async function runNestingWorkspaceAutoNest() {
    if (!nestingWorkspaceActive) return;
    setNestingWorkspaceLoading(true);
    setNestingWorkspaceError(null);
    try {
      const res = await apiFetch(`/api/nesting/workspaces/${nestingWorkspaceActive.id}/auto-nest`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string; workspace?: NestingWorkspaceRecord } | null;
      if (!res.ok) {
        setNestingWorkspaceError(data?.error ?? "Failed to auto nest.");
        return;
      }
      await refreshNestingWorkspaceData(nestingWorkspaceActive.id);
      await refreshBrainCenter();
    } catch (error) {
      setNestingWorkspaceError(error instanceof Error ? error.message : "Failed to auto nest.");
    } finally {
      setNestingWorkspaceLoading(false);
    }
  }

  async function moveNestingWorkspacePlacement(dx: number, dy: number, rotationDelta = 0) {
    if (!nestingWorkspaceActive || nestingWorkspaceSelectedPlacementId === null) return;
    const placements = nestingWorkspaceActive.placements.map((placement) =>
      placement.id === nestingWorkspaceSelectedPlacementId
        ? { ...placement, x: Math.max(0, placement.x + dx), y: Math.max(0, placement.y + dy), rotation: (placement.rotation + rotationDelta + 360) % 360, isManual: true }
        : placement
    );
    const res = await apiFetch(`/api/nesting/workspaces/${nestingWorkspaceActive.id}/placements`, {
      method: "PATCH",
      body: JSON.stringify({ placements })
    });
    const data = (await res.json().catch(() => null)) as { error?: string; workspace?: NestingWorkspaceRecord } | null;
    if (!res.ok) {
      setNestingWorkspaceError(data?.error ?? "Failed to save placement.");
      return;
    }
    await refreshNestingWorkspaceData(nestingWorkspaceActive.id);
  }

  async function exportNestingWorkspaceDxf() {
    if (!nestingWorkspaceActive) return;
    setNestingWorkspaceLoading(true);
    setNestingWorkspaceError(null);
    try {
      const res = await apiFetch(`/api/nesting/workspaces/${nestingWorkspaceActive.id}/export-dxf`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string; workspace?: NestingWorkspaceRecord; exportPath?: string } | null;
      if (!res.ok) {
        setNestingWorkspaceError(data?.error ?? "Failed to export nested DXF.");
        return;
      }
      await refreshNestingWorkspaceData(nestingWorkspaceActive.id);
    } catch (error) {
      setNestingWorkspaceError(error instanceof Error ? error.message : "Failed to export nested DXF.");
    } finally {
      setNestingWorkspaceLoading(false);
    }
  }

  async function createNestingWorkspaceOffcuts() {
    if (!nestingWorkspaceActive) return;
    const res = await apiFetch(`/api/nesting/workspaces/${nestingWorkspaceActive.id}/create-offcuts`, { method: "POST" });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setNestingWorkspaceError(data?.error ?? "Failed to create offcuts.");
      return;
    }
    await refreshNestingWorkspaceData(nestingWorkspaceActive.id);
  }

  async function runDxfErrorCheck() {
    if (!workspaceId) return;
    if (!dxfErrorFile) {
      setDxfErrorError("Choose a DXF file first.");
      return;
    }
    setDxfErrorLoading(true);
    setDxfErrorError(null);
    try {
      const formData = new FormData();
      formData.append("workspaceId", workspaceId);
      formData.append("thickness", dxfErrorThickness);
      formData.append("file", dxfErrorFile);
      const res = await apiFetch("/api/brain/dxf/check", {
        method: "POST",
        body: formData
      });
      const data = (await res.json().catch(() => null)) as { error?: string; result?: DxfErrorCheckResult } | null;
      if (!res.ok) {
        setDxfErrorError(data?.error ?? "Failed to check DXF.");
        return;
      }
      setDxfErrorResult(data?.result ?? null);
    } catch (error) {
      setDxfErrorError(error instanceof Error ? error.message : "Failed to check DXF.");
    } finally {
      setDxfErrorLoading(false);
    }
  }

  async function pickDxfErrorFileFromDesktop() {
    if (!window.desktopShell?.pickFile) {
      setDxfErrorError("Desktop picker unavailable. Use file upload.");
      return;
    }
    try {
      const result = await window.desktopShell.pickFile({ title: "Select DXF file", extensions: ["dxf"] });
      if (!result.ok) {
        if (!result.canceled) setDxfErrorError(`DXF import failed. ${result.error ?? "Unknown error"}`);
        return;
      }
      setDxfErrorFile(new File([decodeBase64ToArrayBuffer(result.contentBase64)], result.fileName, { type: "application/dxf" }));
      setDxfErrorError(null);
    } catch (error) {
      setDxfErrorError(error instanceof Error ? error.message : "DXF import failed.");
    }
  }

  async function askProductionAssistant(questionInput?: string) {
    if (!workspaceId) return;
    const question = (questionInput ?? productionAssistantInput).trim();
    if (!question) return;
    const askedAt = new Date().toISOString();
    setProductionAssistantLoading(true);
    setProductionAssistantError(null);
    setProductionAssistantMessages((messages) => [...messages, { role: "user", text: question, at: askedAt }]);
    if (!questionInput) setProductionAssistantInput("");
    try {
      const res = await apiFetch("/api/brain/assistant/ask", {
        method: "POST",
        body: JSON.stringify({ workspaceId, question })
      });
      const data = (await res.json().catch(() => null)) as ({ error?: string } & Partial<ProductionAssistantResponse>) | null;
      if (!res.ok || !data?.answer) {
        setProductionAssistantError(data?.error ?? "Failed to get Production Assistant answer.");
        return;
      }
      const response: ProductionAssistantResponse = {
        answer: data.answer,
        sourceModules: data.sourceModules ?? [],
        recommendations: data.recommendations ?? [],
        suggestedActions: data.suggestedActions ?? []
      };
      setProductionAssistantMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          text: response.answer,
          at: new Date().toISOString(),
          response
        }
      ]);
    } catch (error) {
      setProductionAssistantError(error instanceof Error ? error.message : "Failed to get Production Assistant answer.");
    } finally {
      setProductionAssistantLoading(false);
    }
  }

  async function handleProductionAssistantAction(action: ProductionAssistantAction) {
    if (action.actionType === "open_ai_queue") {
      setViewMode("brain_center");
      return;
    }
    if (action.actionType === "open_material_prediction" || action.actionType === "open_stock") {
      setViewMode("brain_center");
      return;
    }
    if (action.actionType === "open_profit_intelligence") {
      setViewMode("brain_center");
      return;
    }
    if (action.actionType === "open_dxf_errors") {
      setViewMode("brain_center");
      return;
    }
    if (action.actionType === "open_part_dna") {
      setViewMode("part_dna");
      return;
    }
    if (action.actionType === "open_quotes") {
      setViewMode("quotes");
      return;
    }
    if (action.actionType === "refresh") {
      const lastUserQuestion = [...productionAssistantMessages].reverse().find((entry) => entry.role === "user")?.text ?? "";
      if (lastUserQuestion) {
        await askProductionAssistant(lastUserQuestion);
      }
    }
  }

  async function updateBrainRecommendationStatus(id: number, status: BrainRecommendationRecord["status"]) {
    if (!workspaceId || !Number.isFinite(id)) return;
    try {
      const res = await apiFetch(`/api/brain/recommendations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ workspaceId, status })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBrainError(data?.error ?? "Failed to update recommendation.");
        return;
      }
      await refreshBrainCenter();
    } catch (error) {
      setBrainError(error instanceof Error ? error.message : "Failed to update recommendation.");
    }
  }

  async function logBrainEvent(input: {
    eventType: BrainEventRecord["eventType"];
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }) {
    if (!workspaceId) return;
    try {
      await apiFetch("/api/brain/events", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          eventType: input.eventType,
          entityType: input.entityType,
          entityId: input.entityId,
          payload: input.payload ?? {}
        })
      });
    } catch {
      // non-blocking
    }
  }

  async function registerCloudDevice() {
    const deviceToken = await getOrCreateCloudDeviceToken(cloudSyncSettings.companyId);
    await apiFetch("/api/cloud/register-device", {
      method: "POST",
      body: JSON.stringify({
        deviceId,
        deviceName: cloudSyncSettings.deviceName || deviceId,
        userName: user?.email ?? user?.name ?? "",
        role: cloudSyncSettings.role,
        companyId: cloudSyncSettings.companyId,
        deviceToken
      })
    });
  }

  async function sendCloudHeartbeat() {
    const deviceToken = await getOrCreateCloudDeviceToken(cloudSyncSettings.companyId);
    await apiFetch("/api/cloud/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        deviceId,
        userName: user?.email ?? user?.name ?? "",
        role: cloudSyncSettings.role,
        companyId: cloudSyncSettings.companyId,
        deviceToken
      })
    });
  }

  async function syncCloudNow() {
    setCloudSyncStatus("Syncing cloud events...");
    try {
      await registerCloudDevice();
      const res = await apiFetch("/api/cloud/sync-now", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { sent?: number; skipped?: boolean } | null;
      setCloudSyncStatus(data?.skipped ? "Cloud reporting is disabled." : `Cloud sync complete. Sent ${data?.sent ?? 0} event(s).`);
      await refreshCloudEvents();
      await refreshCloudDashboard();
    } catch (error) {
      setCloudSyncStatus(error instanceof Error ? error.message : "Cloud sync failed.");
    }
  }

  async function saveCloudSyncSettings() {
    setCloudSyncStatus("Saving cloud sync settings...");
    try {
      const res = await apiFetch("/api/cloud/settings", {
        method: "POST",
        body: JSON.stringify(cloudSyncSettings)
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setCloudSyncStatus(data?.error ?? "Failed to save cloud settings.");
        return;
      }
      const data = (await res.json()) as { settings: CloudSyncSettingsRecord };
      setCloudSyncSettings(data.settings);
      await registerCloudDevice();
      setCloudSyncStatus("Cloud sync settings saved.");
    } catch (error) {
      setCloudSyncStatus(error instanceof Error ? error.message : "Failed to save cloud settings.");
    }
  }

  async function pushCloudEvent(eventType: CloudSyncEventRecord["eventType"], payload: Record<string, unknown>) {
    try {
      await apiFetch("/api/cloud/events", {
        method: "POST",
        body: JSON.stringify({
          eventType,
          payload: {
            ...payload,
            companyId: cloudSyncSettings.companyId,
            deviceId
          }
        })
      });
      if (cloudSyncSettings.enabled) {
        void syncCloudNow();
      } else {
        void refreshCloudEvents();
      }
    } catch {
      // keep app usable when cloud reporting is offline
    }
  }

  async function fetchStockSuggestion(
    params: { material: string; thickness: number; width: number; height: number },
    target: "quote" | "job"
  ) {
    try {
      const query = new URLSearchParams({
        material: params.material,
        thickness: String(params.thickness),
        width: String(params.width),
        height: String(params.height)
      });
      const res = await apiFetch(`/api/stock/search?${query.toString()}`);
      const data = (await res.json().catch(() => null)) as { error?: string; suggestion?: StockSuggestion } | null;
      if (!res.ok) {
        if (target === "quote") setStockQuoteSuggestion(null);
        else setStockJobSuggestion(null);
        return;
      }
      if (target === "quote") setStockQuoteSuggestion(data?.suggestion ?? null);
      else setStockJobSuggestion(data?.suggestion ?? null);
    } catch {
      if (target === "quote") setStockQuoteSuggestion(null);
      else setStockJobSuggestion(null);
    }
  }

  async function refreshOffcutRecommendations() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/brain/offcuts/recommendations?workspaceId=${encodeURIComponent(workspaceId)}&limit=40`);
      const data = (await res.json().catch(() => null)) as { error?: string; recommendations?: OffcutBrainRecommendation[] } | null;
      if (!res.ok) return;
      setOffcutRecommendations(data?.recommendations ?? []);
    } catch {
      // keep stock UI usable when recommendations fail
    }
  }

  async function fetchOffcutIntelligenceMatch(
    params: {
      material: string;
      thickness: number;
      width: number;
      height: number;
      jobId?: string | null;
      quoteId?: string | null;
      partDnaId?: number | null;
      entityLabel?: string | null;
    },
    target: "quote" | "job"
  ) {
    try {
      const res = await apiFetch("/api/brain/offcuts/find-match", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          material: params.material,
          thickness: params.thickness,
          requiredWidth: params.width,
          requiredHeight: params.height,
          jobId: params.jobId ?? null,
          quoteId: params.quoteId ?? null,
          partDnaId: params.partDnaId ?? null,
          entityLabel: params.entityLabel ?? null
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; result?: OffcutBrainMatchResult } | null;
      if (!res.ok) {
        if (target === "quote") setStockQuoteOffcutMatch(null);
        else setStockJobOffcutMatch(null);
        return;
      }
      if (target === "quote") setStockQuoteOffcutMatch(data?.result ?? null);
      else setStockJobOffcutMatch(data?.result ?? null);
    } catch {
      if (target === "quote") setStockQuoteOffcutMatch(null);
      else setStockJobOffcutMatch(null);
    }
  }

  async function useSuggestedOffcut(input: {
    offcutId: number;
    action?: "reserve" | "use";
    jobId?: string | null;
    quoteId?: string | null;
    partDnaId?: number | null;
    width?: number | null;
    height?: number | null;
  }) {
    if (!workspaceId) return false;
    try {
      const res = await apiFetch(`/api/brain/offcuts/${encodeURIComponent(String(input.offcutId))}/use`, {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          action: input.action ?? "reserve",
          jobId: input.jobId ?? null,
          quoteId: input.quoteId ?? null,
          partDnaId: input.partDnaId ?? null,
          requiredWidth: input.width ?? null,
          requiredHeight: input.height ?? null
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setStockError(data?.error ?? "Failed to use suggested offcut.");
        return false;
      }
      await refreshStock();
      await refreshOffcutRecommendations();
      await refreshSmartQueue();
      return true;
    } catch (error) {
      setStockError(error instanceof Error ? error.message : "Failed to use suggested offcut.");
      return false;
    }
  }

  async function reserveStockForTarget(input: {
    jobId: string;
    material: string;
    thickness: number;
    width: number;
    height: number;
  }) {
    try {
      const res = await apiFetch("/api/stock/reserve", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          jobId: input.jobId,
          material: input.material,
          thickness: input.thickness,
          requiredWidth: input.width,
          requiredHeight: input.height
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setStockError(data?.error ?? "Failed to reserve stock.");
        return false;
      }
      await refreshStock();
      await refreshSmartQueue();
      await refreshOffcutRecommendations();
      void pushCloudEvent("stock_reserved", input);
      return true;
    } catch (error) {
      setStockError(error instanceof Error ? error.message : "Failed to reserve stock.");
      return false;
    }
  }

  async function markTargetStockUsed(jobId: string) {
    try {
      const res = await apiFetch("/api/stock/use", {
        method: "POST",
        body: JSON.stringify({ workspaceId, jobId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setStockError(data?.error ?? "Failed to mark stock used.");
        return;
      }
      await refreshStock();
      await refreshOffcutRecommendations();
      void pushCloudEvent("stock_used", { jobId });
    } catch (error) {
      setStockError(error instanceof Error ? error.message : "Failed to mark stock used.");
    }
  }

  async function autoPlanSmartQueue() {
    if (!workspaceId) return;
    setSmartQueuePlanning(true);
    setSmartQueueError(null);
    try {
      const res = await apiFetch("/api/job-queue/groups", {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setSmartQueueError(data?.error ?? "Failed to auto-plan queue.");
        return;
      }
      await refreshSmartQueue();
    } catch (error) {
      setSmartQueueError(error instanceof Error ? error.message : "Failed to auto-plan queue.");
    } finally {
      setSmartQueuePlanning(false);
    }
  }

  async function updateSmartQueueJob(jobId: number, payload: Record<string, unknown>) {
    if (!workspaceId) return false;
    try {
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ workspaceId, ...payload })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setSmartQueueError(data?.error ?? "Failed to update smart queue job.");
        return false;
      }
      await refreshJobs();
      await refreshSmartQueue();
      return true;
    } catch (error) {
      setSmartQueueError(error instanceof Error ? error.message : "Failed to update smart queue job.");
      return false;
    }
  }

  async function runSmartQueueJobAction(jobId: number, action: "start" | "pause" | "complete", actualMinutes?: number) {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/jobs/${jobId}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          actualMinutes: typeof actualMinutes === "number" ? actualMinutes : undefined
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setSmartQueueError(data?.error ?? `Failed to ${action} job.`);
        return;
      }
      await refreshJobs();
      await refreshSmartQueue();
      if (action === "start") {
        void pushCloudEvent("job_started", { jobId, actualMinutes: actualMinutes ?? null });
      } else if (action === "complete") {
        void pushCloudEvent("job_completed", { jobId, actualMinutes: actualMinutes ?? null });
      }
    } catch (error) {
      setSmartQueueError(error instanceof Error ? error.message : `Failed to ${action} job.`);
    }
  }

  async function startSmartQueueGroup(groupId: number) {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/job-queue/groups/${groupId}/start`, {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setSmartQueueError(data?.error ?? "Failed to start queue group.");
        return;
      }
      await refreshJobs();
      await refreshSmartQueue();
    } catch (error) {
      setSmartQueueError(error instanceof Error ? error.message : "Failed to start queue group.");
    }
  }

  async function completeSmartQueueGroup(groupId: number) {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/job-queue/groups/${groupId}/complete`, {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setSmartQueueError(data?.error ?? "Failed to complete queue group.");
        return;
      }
      await refreshSmartQueue();
    } catch (error) {
      setSmartQueueError(error instanceof Error ? error.message : "Failed to complete queue group.");
    }
  }

  async function saveSmartQueueGroupOrder(groupId: number, jobIds: number[]) {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/job-queue/groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({
          workspaceId,
          jobIds,
          orderedJobIds: jobIds
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setSmartQueueError(data?.error ?? "Failed to save manual queue order.");
        return;
      }
      await refreshSmartQueue();
    } catch (error) {
      setSmartQueueError(error instanceof Error ? error.message : "Failed to save manual queue order.");
    }
  }

  async function moveSmartQueueJobBetweenGroups(jobId: number, fromGroupId: number, toGroupId: number) {
    const fromGroup = smartQueueGroups.find((group) => group.id === fromGroupId);
    const toGroup = smartQueueGroups.find((group) => group.id === toGroupId);
    if (!fromGroup || !toGroup || fromGroup.id === toGroup.id) return;
    const nextFromIds = fromGroup.jobs.filter((job) => job.id !== jobId).map((job) => job.id);
    const nextToIds = [...toGroup.jobs.map((job) => job.id), jobId];
    await saveSmartQueueGroupOrder(fromGroup.id, nextFromIds);
    await saveSmartQueueGroupOrder(toGroup.id, nextToIds);
  }

  async function handleSmartQueueDrop(targetGroupId: number, targetJobId?: number) {
    if (smartQueueDraggingJobId === null) return;
    const sourceGroup = smartQueueGroups.find((group) => group.jobs.some((job) => job.id === smartQueueDraggingJobId));
    const targetGroup = smartQueueGroups.find((group) => group.id === targetGroupId);
    if (!targetGroup) return;

    if (sourceGroup && sourceGroup.id !== targetGroup.id && targetJobId === undefined) {
      await moveSmartQueueJobBetweenGroups(smartQueueDraggingJobId, sourceGroup.id, targetGroup.id);
      setSmartQueueDraggingJobId(null);
      return;
    }

    const nextTargetIds = targetGroup.jobs.map((job) => job.id).filter((id) => id !== smartQueueDraggingJobId);
    const insertAt = targetJobId ? nextTargetIds.indexOf(targetJobId) : nextTargetIds.length;
    nextTargetIds.splice(insertAt < 0 ? nextTargetIds.length : insertAt, 0, smartQueueDraggingJobId);

    if (sourceGroup && sourceGroup.id !== targetGroup.id) {
      const nextSourceIds = sourceGroup.jobs.map((job) => job.id).filter((id) => id !== smartQueueDraggingJobId);
      await saveSmartQueueGroupOrder(sourceGroup.id, nextSourceIds);
    }

    await saveSmartQueueGroupOrder(targetGroup.id, nextTargetIds);
    setSmartQueueDraggingJobId(null);
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

  async function refreshCompanyProfile() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/company-profile`);
      if (!res.ok) return;
      const data = (await res.json()) as { companyProfile: CompanyProfile };
      const profile = data.companyProfile ?? {};
      setQuoteCompanyName(profile.name ?? "Qouterx");
      setQuoteCompanyEmail(profile.email ?? "");
      setQuoteCompanyPhone(profile.phone ?? "");
      setQuoteCompanyAddress(profile.address ?? "");
      setQuoteCompanyVatNumber(profile.vatNumber ?? "");
      setQuoteCompanyRegistrationNumber(profile.registrationNumber ?? "");
      setQuoteLogoDataUrl(profile.logoDataUrl);
      setQuoteAccentColor(profile.accentColor ?? "#0f172a");
    } catch {
      // ignore
    }
  }

  async function saveCompanyProfile() {
    if (!workspaceId) return;
    setCompanyProfileSaving(true);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/company-profile`, {
        method: "PUT",
        body: JSON.stringify({
          name: quoteCompanyName.trim(),
          email: quoteCompanyEmail.trim(),
          phone: quoteCompanyPhone.trim(),
          address: quoteCompanyAddress.trim(),
          vatNumber: quoteCompanyVatNumber.trim(),
          registrationNumber: quoteCompanyRegistrationNumber.trim(),
          accentColor: quoteAccentColor,
          logoDataUrl: quoteLogoDataUrl
        })
      });
      if (!res.ok) {
        const errorPayload = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
        const message = errorPayload?.details
          ? `${errorPayload.error ?? "Failed to save company profile"}: ${errorPayload.details}`
          : (errorPayload?.error ?? "Failed to save company profile.");
        alert(message);
        return;
      }
      alert("Company profile saved. It will be used for all new quotes.");
    } finally {
      setCompanyProfileSaving(false);
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

  async function refreshEmailSettings() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/email/settings`);
      if (!res.ok) return;
      const data = (await res.json()) as { emailSettings: EmailSettingsRecord };
      setEmailSettings((current) => ({
        ...current,
        ...data.emailSettings
      }));
    } catch {
      // ignore
    }
  }

  async function refreshBilling() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(
        `/api/local/subscription/status?workspaceId=${encodeURIComponent(workspaceId)}&deviceId=${encodeURIComponent(deviceId)}&deviceName=${encodeURIComponent(cloudSyncSettings.deviceName || deviceId)}&platform=${encodeURIComponent(platformLabel)}`
      );
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as BillingStatus;
      setBilling(data);
      void pushCloudEvent("subscription_status_checked", {
        workspaceId,
        status: data.status,
        hasAccess: data.hasAccess,
        limitedAccess: data.limitedAccess ?? false
      });
    } catch {
      // Ignore fetch errors for now
    }
  }

  async function refreshBillingCompany() {
    if (!workspaceId) return;
    try {
      const res = await apiFetch(`/api/billing/company?workspaceId=${encodeURIComponent(workspaceId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as BillingCompanyResponse;
      setBillingCompany(data.company);
      setBillingPayments(data.payments ?? []);
      setBillingDevices(data.devices ?? []);
      setBillingRole(data.role ?? "operator");
    } catch {
      // ignore
    }
  }

  async function createLocalAccountRequest(overrides?: {
    workspaceId?: string | null;
    user?: UserSummary | null;
    companyName?: string;
    contactName?: string;
  }) {
    const targetWorkspaceId = overrides?.workspaceId ?? workspaceId;
    const targetUser = overrides?.user ?? user;
    if (!targetWorkspaceId || !token || !targetUser) return;
    try {
      const res = await apiFetch("/api/local/account/create-request", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: targetWorkspaceId,
          deviceId,
          deviceName: cloudSyncSettings.deviceName || deviceId,
          platform: platformLabel,
          companyName: overrides?.companyName ?? authWorkspaceName.trim() ?? workspaces.find((entry) => entry.id === targetWorkspaceId)?.name ?? "Qouter X Company",
          contactName: overrides?.contactName ?? authName.trim() ?? targetUser.name ?? "",
          email: targetUser.email,
          phone: ""
        })
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setBillingStatusMessage(payload?.error ?? "Failed to send account request.");
        return;
      }
      setBillingStatusMessage("Your account request has been sent. Waiting for admin approval.");
      await refreshBilling();
      await refreshBillingCompany();
    } catch (error) {
      setBillingStatusMessage(error instanceof Error ? error.message : "Failed to send account request.");
    }
  }

  async function sendBillingDeviceHeartbeat() {
    if (!workspaceId || !user) return;
    try {
      await apiFetch("/api/local/device/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          deviceId,
          deviceName: cloudSyncSettings.deviceName || deviceId,
          platform: platformLabel,
          appVersion
        })
      });
    } catch {
      // keep the app usable
    }
  }

  async function uploadBillingProof() {
    if (!workspaceId) return;
    setBillingBusy(true);
    setBillingStatusMessage("Uploading proof of payment...");
    try {
      const formData = new FormData();
      formData.append("workspaceId", workspaceId);
      formData.append("amount", billingProofAmount || "0");
      formData.append("paymentMethod", "eft");
      formData.append("notes", billingProofNotes);
      if (billingProofFile) {
        formData.append("proof", billingProofFile);
      }
      const res = await fetch(`${effectiveApiUrl.replace(/\/+$/, "")}/api/billing/payment-proof`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBillingStatusMessage(data?.error ?? "Failed to upload proof.");
        return;
      }
      setBillingProofAmount("");
      setBillingProofNotes("");
      setBillingProofFile(null);
      setBillingStatusMessage("Proof uploaded. Your account will be reactivated once payment is confirmed.");
      await refreshBillingCompany();
      void pushCloudEvent("payment_proof_uploaded", {
        workspaceId,
        paymentReference: billing.paymentReference ?? billingCompany?.manualPaymentReference ?? null
      });
    } catch (error) {
      setBillingStatusMessage(error instanceof Error ? error.message : "Failed to upload proof.");
    } finally {
      setBillingBusy(false);
    }
  }

  async function refreshAdminSubscriptions() {
    if (!canManageAccounts) return;
    try {
      const res = await apiFetch("/api/billing/admin/dashboard");
      if (!res.ok) return;
      const data = (await res.json()) as {
        dashboard: AdminSubscriptionDashboard;
        pendingRequests?: AccountRequestRecord[];
        notifications?: AdminSubscriptionDashboard["notifications"];
      };
      setAdminSubscriptions(data.dashboard);
      const nextPendingRequests = data.pendingRequests ?? data.dashboard.pendingRequests ?? [];
      setPendingAccountRequests(nextPendingRequests);
      setAdminNotifications(data.notifications ?? data.dashboard.notifications ?? []);
      const newRequests = nextPendingRequests.filter((request) => !seenAccountRequestIdsRef.current.has(request.id));
      if (newRequests.length > 0) {
        newRequests.forEach((request) => {
          seenAccountRequestIdsRef.current.add(request.id);
        });
        const newest = newRequests[0];
        const message = `New Qouter X account request: ${newest.companyName} / ${newest.contactName || newest.deviceName}`;
        setAccountRequestToast(message);
        setAccountRequestPopup(newest);
        void showNativeAccountRequestNotification(newest);
      } else if (nextPendingRequests.length > 0 && !accountRequestPopup) {
        setAccountRequestToast((current) => current ?? `Pending account requests: ${nextPendingRequests.length}`);
      } else if (nextPendingRequests.length === 0) {
        setAccountRequestToast(null);
      }
    } catch {
      // ignore
    }
  }

  async function showNativeAccountRequestNotification(request: AccountRequestRecord) {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    try {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
      if (Notification.permission !== "granted") return;
      const notification = new Notification("New Qouter X account request", {
        body: `${request.companyName} · ${request.contactName || request.deviceName}`,
        tag: `qouterx-account-request-${request.id}`,
        requireInteraction: true
      });
      notification.onclick = () => {
        window.focus();
        setViewMode("admin_subscriptions");
        setAccountRequestPopup(request);
      };
    } catch {
      // ignore notification failures
    }
  }

  async function approveAccountRequest(requestId: number, months = 1) {
    if (requestId <= 0) return;
    try {
      const res = await apiFetch(`/api/admin/account-requests/${requestId}/approve`, {
        method: "POST",
        body: JSON.stringify({ months })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBillingStatusMessage(data?.error ?? "Failed to approve account request.");
        return;
      }
      setBillingStatusMessage("Account request approved.");
      setAccountRequestToast(null);
      await refreshAdminSubscriptions();
    } catch (error) {
      setBillingStatusMessage(error instanceof Error ? error.message : "Failed to approve account request.");
    }
  }

  async function rejectAccountRequest(requestId: number) {
    if (requestId <= 0) return;
    try {
      const res = await apiFetch(`/api/admin/account-requests/${requestId}/reject`, {
        method: "POST"
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBillingStatusMessage(data?.error ?? "Failed to reject account request.");
        return;
      }
      setBillingStatusMessage("Account request rejected.");
      await refreshAdminSubscriptions();
    } catch (error) {
      setBillingStatusMessage(error instanceof Error ? error.message : "Failed to reject account request.");
    }
  }

  async function loadAdminSubscriptionDetail(companyId: string) {
    if (!canManageAccounts) return;
    try {
      const res = await apiFetch(`/api/billing/admin/companies/${companyId}/payments`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        payments: BillingPaymentRecord[];
        auditLog: Array<{
          id: number;
          action: string;
          oldStatus?: string | null;
          newStatus?: string | null;
          oldEndDate?: string | null;
          newEndDate?: string | null;
          adminNote?: string | null;
          createdAt: string;
        }>;
      };
      setAdminSubscriptionDetail({ companyId, payments: data.payments ?? [], auditLog: data.auditLog ?? [] });
    } catch {
      // ignore
    }
  }

  async function adminRenewSubscription(companyId: string, months: number) {
    setBillingStatusMessage(`Renewing ${months} month${months === 1 ? "" : "s"}...`);
    try {
      const res = await apiFetch(`/api/admin/companies/${companyId}/renew`, {
        method: "POST",
        body: JSON.stringify({ months })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBillingStatusMessage(data?.error ?? "Renewal failed.");
        return;
      }
      setBillingStatusMessage("Subscription renewed.");
      await refreshAdminSubscriptions();
      await refreshBilling();
      await refreshBillingCompany();
      await loadAdminSubscriptionDetail(companyId);
    } catch (error) {
      setBillingStatusMessage(error instanceof Error ? error.message : "Renewal failed.");
    }
  }

  async function adminStartSubscriptionCycle(companyId: string, months: number) {
    setBillingStatusMessage("Starting subscription cycle...");
    try {
      const res = await apiFetch(`/api/admin/companies/${companyId}/start-cycle`, {
        method: "POST",
        body: JSON.stringify({ months })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBillingStatusMessage(data?.error ?? "Failed to start subscription cycle.");
        return;
      }
      setBillingStatusMessage("Subscription cycle started.");
      await refreshAdminSubscriptions();
      await refreshBilling();
      await refreshBillingCompany();
      await loadAdminSubscriptionDetail(companyId);
    } catch (error) {
      setBillingStatusMessage(error instanceof Error ? error.message : "Failed to start subscription cycle.");
    }
  }

  async function adminUpdateSubscriptionStatus(companyId: string, status: "suspended" | "cancelled" | "active" | "expired") {
    setBillingStatusMessage(`Updating company status to ${status}...`);
    try {
      const route =
        status === "suspended"
          ? `/api/admin/companies/${companyId}/suspend`
          : status === "cancelled"
            ? `/api/admin/companies/${companyId}/cancel`
            : `/api/admin/companies/${companyId}/unlock`;
      const res = await apiFetch(route, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBillingStatusMessage(data?.error ?? "Status update failed.");
        return;
      }
      setBillingStatusMessage("Company status updated.");
      await refreshAdminSubscriptions();
      await refreshBilling();
      await refreshBillingCompany();
      await loadAdminSubscriptionDetail(companyId);
    } catch (error) {
      setBillingStatusMessage(error instanceof Error ? error.message : "Status update failed.");
    }
  }

  async function adminAddSubscriptionNote(companyId: string, currentNote?: string | null) {
    const note = window.prompt("Admin note", currentNote ?? "");
    if (note === null) return;
    setBillingStatusMessage("Saving company note...");
    try {
      const res = await apiFetch(`/api/billing/admin/companies/${companyId}/note`, {
        method: "PATCH",
        body: JSON.stringify({ note })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBillingStatusMessage(data?.error ?? "Failed to save note.");
        return;
      }
      setBillingStatusMessage("Company note saved.");
      await refreshAdminSubscriptions();
      await refreshBillingCompany();
    } catch (error) {
      setBillingStatusMessage(error instanceof Error ? error.message : "Failed to save note.");
    }
  }

  async function adminConfirmPayment(paymentId: number, companyId: string) {
    setBillingStatusMessage("Confirming payment...");
    try {
      const res = await apiFetch(`/api/billing/admin/payments/${paymentId}/confirm`, {
        method: "POST"
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBillingStatusMessage(data?.error ?? "Payment confirmation failed.");
        return;
      }
      setBillingStatusMessage("Payment confirmed.");
      await refreshAdminSubscriptions();
      await refreshBillingCompany();
      await loadAdminSubscriptionDetail(companyId);
    } catch (error) {
      setBillingStatusMessage(error instanceof Error ? error.message : "Payment confirmation failed.");
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

  async function createJob(overrides?: { title?: string; customerName?: string }) {
    if (!workspaceId) return false;
    const titleValue = (overrides?.title ?? jobTitle).trim();
    const customerValue = (overrides?.customerName ?? jobCustomer).trim();
    if (!titleValue) return false;
    const quantityExpected = jobQuantity ? Number(jobQuantity) : undefined;
    const price = jobPrice ? Number(jobPrice) : undefined;
    const cost = jobCost ? Number(jobCost) : undefined;
    const fileNames = jobFiles ? Array.from(jobFiles).map((file) => file.name) : [];
    const selectedQuoteRecord = quotes.find((entry) => entry.quoteNumber === selectedQuote);
    const quoteDerivedJobDxfParts =
      jobDxfParts.length === 0
        ? (selectedQuoteRecord?.sections?.laserCutting?.parts ?? []).map((part, index) => ({
            id: `quote-part-${selectedQuoteRecord?.id ?? "selected"}-${index + 1}`,
            name: part.name,
            partCode: part.partCode,
            partDnaId: part.partDnaId,
            geometryHash: part.geometryHash,
            softHash: part.softHash,
            layer: "0",
            material: part.material ?? "Mild Steel",
            thicknessMm: normalizeJobDxfThickness(part.thicknessMm),
            quantity: Math.max(0, Math.round(part.quantity || 0)),
            widthMm: Math.max(0, Math.round(part.lengthMm || 0)),
            heightMm: Math.max(0, Math.round(part.widthMm || 0)),
            cutLengthMm: Math.max(0, Math.round(part.cutLengthMm || 0)),
            pierceCount: Math.max(0, Math.round(part.pierceCount || 0)),
            segmentCount: 0,
            thumbnailDataUrl: part.thumbnailDataUrl,
            printDataUrl: part.thumbnailDataUrl
          }))
        : [];
    const sourceJobDxfParts = jobDxfParts.length > 0 ? jobDxfParts : quoteDerivedJobDxfParts;
    const jobDxfPartsPayload = sourceJobDxfParts.map((part) => ({
      id: part.id,
      name: part.name,
      partCode: part.partCode,
      partDnaId: part.partDnaId,
      geometryHash: part.geometryHash,
      softHash: part.softHash,
      layer: part.layer,
      material: part.material ?? "Mild Steel",
      thicknessMm: normalizeJobDxfThickness(part.thicknessMm),
      quantity: Math.max(0, Math.round(part.quantity || 0)),
      widthMm: part.widthMm,
      heightMm: part.heightMm,
      cutLengthMm: part.cutLengthMm,
      pierceCount: part.pierceCount,
      segmentCount: part.segmentCount,
      thumbnailDataUrl: part.thumbnailDataUrl,
      printDataUrl: part.printDataUrl,
      sourceSegments: part.sourceSegments,
      sourceBounds: part.sourceBounds
    }));
    const res = await apiFetch(`/api/workspaces/${workspaceId}/jobs`, {
      method: "POST",
      body: JSON.stringify({
        title: titleValue,
        customerName: customerValue,
        assignedTo: jobAssignedTo.trim(),
        quantityExpected: Number.isFinite(quantityExpected) ? quantityExpected : undefined,
        price: Number.isFinite(price) ? price : undefined,
        cost: Number.isFinite(cost) ? cost : undefined,
        fileNames,
        quoteNumber: selectedQuote || undefined,
        jobDxfParts: jobDxfPartsPayload
      })
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { job: JobRecord };
    if (jobFiles && jobFiles.length > 0) {
      const formData = new FormData();
      Array.from(jobFiles).forEach((file) => formData.append("files", file));
      await fetch(`${effectiveApiUrl}/api/workspaces/${workspaceId}/jobs/${data.job.id}/files`, {
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
    setJobDxfParts([]);
    setJobDxfSourceFiles([]);
    setJobDxfFileName("");
    setJobDxfSegments([]);
    setJobDxfLayers([]);
    setJobDxfSelectedLayers([]);
    setJobDxfPreviewDataUrl(undefined);
    setJobDxfStatus(null);
    setJobDxfSelectedPartIds([]);
    setSelectedJobId(data.job.id);
    await refreshJobs();
    await refreshCustomerSummary();
    void pushCloudEvent("job_created", {
      jobId: data.job.id,
      jobNumber: data.job.jobNumber,
      title: data.job.title,
      customerName: data.job.customerName ?? customerValue
    });
    return true;
  }

  async function createAutoJobCardFromQuote(quote: QuoteRecord) {
    if (!workspaceId) return false;
    const laserParts = quote.sections?.laserCutting?.parts ?? [];
    if (!laserParts.length) {
      window.alert("This quote has no laser cutting DXF parts to send to Job Cards.");
      return false;
    }

    const jobDxfPartsPayload = laserParts.map((part, index) => ({
      id: `quote-part-${quote.id}-${index + 1}`,
      name: part.name,
      partCode: part.partCode,
      partDnaId: part.partDnaId,
      geometryHash: part.geometryHash,
      softHash: part.softHash,
      layer: "0",
      material: part.material ?? "Mild Steel",
      thicknessMm: normalizeJobDxfThickness(part.thicknessMm),
      quantity: Math.max(0, Math.round(part.quantity || 0)),
      widthMm: Math.max(0, Math.round(part.lengthMm || 0)),
      heightMm: Math.max(0, Math.round(part.widthMm || 0)),
      cutLengthMm: Math.max(0, Math.round(part.cutLengthMm || 0)),
      pierceCount: Math.max(0, Math.round(part.pierceCount || 0)),
      segmentCount: 0,
      thumbnailDataUrl: part.thumbnailDataUrl,
      printDataUrl: part.thumbnailDataUrl
    }));

    const quantityExpected = jobDxfPartsPayload.reduce((sum, part) => sum + Math.max(0, part.quantity || 0), 0) || undefined;
    const res = await apiFetch(`/api/workspaces/${workspaceId}/jobs`, {
      method: "POST",
      body: JSON.stringify({
        title: quote.title?.trim() || `Job for ${quote.quoteNumber}`,
        customerName: quote.customerName?.trim() || "",
        quantityExpected,
        price: Number.isFinite(Number(quote.total)) ? Number(quote.total) : undefined,
        quoteNumber: quote.quoteNumber,
        jobDxfParts: jobDxfPartsPayload
      })
    });
    if (!res.ok) {
      window.alert("Failed to create auto job card from quote.");
      return false;
    }

    const data = (await res.json()) as { job: JobRecord };
    setSelectedJobId(data.job.id);
    await refreshJobs();
    await refreshCustomerSummary();
    setViewMode("jobs");
    setJobsPage("job_process");
    return true;
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

  async function fetchJobCardBlob(
    jobId: string,
    options?: { includePricing?: boolean; includeDriverSignoff?: boolean; copyLabel?: string }
  ) {
    if (!workspaceId) return null;
    const query = new URLSearchParams();
    if (options?.includePricing) query.set("includePricing", "1");
    if (options?.includeDriverSignoff) query.set("includeDriverSignoff", "1");
    if (options?.copyLabel) query.set("copyLabel", options.copyLabel);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await apiFetch(`/api/workspaces/${workspaceId}/jobs/${jobId}/jobcard${suffix}`);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
      alert(payload?.details ? `${payload.error ?? "Failed to load job card"}: ${payload.details}` : (payload?.error ?? "Failed to load job card"));
      return null;
    }
    return res.blob();
  }

  async function openJobCard(jobId: string) {
    const preview = window.open("", "_blank");
    if (!preview) {
      alert("Pop-up blocked. Please allow pop-ups to open the job card.");
      return;
    }
    preview.document.write("<p style='font-family: sans-serif; padding: 16px'>Loading job card...</p>");
    const blob = await fetchJobCardBlob(jobId);
    if (!blob) {
      preview.close();
      return;
    }
    const url = URL.createObjectURL(blob);
    preview.location.href = url;
    preview.addEventListener(
      "beforeunload",
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );
  }

  function openJobFile(jobId: string, fileName: string) {
    if (!workspaceId) return;
    window.open(`${effectiveApiUrl}/api/workspaces/${workspaceId}/jobs/${jobId}/files/${encodeURIComponent(fileName)}`, "_blank");
  }

  async function printJobCard(jobId: string) {
    const preview = window.open("", "_blank");
    if (!preview) {
      alert("Pop-up blocked. Please allow pop-ups to print the job card.");
      return;
    }
    preview.document.write("<p style='font-family: sans-serif; padding: 16px'>Preparing job card for print...</p>");
    const blob = await fetchJobCardBlob(jobId);
    if (!blob) {
      preview.close();
      return;
    }
    const url = URL.createObjectURL(blob);
    preview.location.href = url;
    preview.onload = () => {
      preview.focus();
      preview.print();
    };
    preview.addEventListener(
      "beforeunload",
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );
  }

  async function printJobCardVariant(
    jobId: string,
    options?: { includePricing?: boolean; includeDriverSignoff?: boolean; copyLabel?: string }
  ) {
    const preview = window.open("", "_blank");
    if (!preview) {
      alert("Pop-up blocked. Please allow pop-ups to print the job card.");
      return false;
    }
    preview.document.write("<p style='font-family: sans-serif; padding: 16px'>Preparing job card for print...</p>");
    const blob = await fetchJobCardBlob(jobId, options);
    if (!blob) {
      preview.close();
      return false;
    }
    const url = URL.createObjectURL(blob);
    preview.location.href = url;
    preview.onload = () => {
      preview.focus();
      preview.print();
    };
    preview.addEventListener(
      "beforeunload",
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );
    return true;
  }

  async function createAndPrintJobCardSet(jobId: string) {
    await printJobCardVariant(jobId, { includeDriverSignoff: true, copyLabel: "Driver Copy 1 (No Prices)" });
    await printJobCardVariant(jobId, { includeDriverSignoff: true, copyLabel: "Driver Copy 2 (No Prices)" });
  }

  function printJobFile(jobId: string, fileName: string) {
    if (!workspaceId) return;
    const url = `${effectiveApiUrl}/api/workspaces/${workspaceId}/jobs/${jobId}/files/${encodeURIComponent(fileName)}`;
    const win = window.open(url, "_blank");
    if (!win) return;
    win.onload = () => {
      win.focus();
      win.print();
    };
  }

  async function regenerateAllJobCards() {
    if (!workspaceId || regeneratingJobCards) return;
    setRegeneratingJobCards(true);
    const res = await apiFetch(`/api/workspaces/${workspaceId}/jobs/regenerate-cards`, { method: "POST" });
    const payload = (await res.json().catch(() => null)) as
      | {
          regeneratedCount?: number;
          failedCount?: number;
          failures?: Array<{ jobNumber: string; error: string }>;
          error?: string;
        }
      | null;
    if (!res.ok) {
      alert(payload?.error ?? "Failed to regenerate job cards");
      setRegeneratingJobCards(false);
      return;
    }
    const regeneratedCount = payload?.regeneratedCount ?? 0;
    const failedCount = payload?.failedCount ?? 0;
    const sampleError = payload?.failures?.[0];
    if (failedCount > 0) {
      alert(
        `Regenerated ${regeneratedCount} job card(s), ${failedCount} failed.${sampleError ? ` Example: ${sampleError.jobNumber} (${sampleError.error})` : ""}`
      );
    } else {
      alert(`Regenerated ${regeneratedCount} job card(s).`);
    }
    await refreshJobs();
    setRegeneratingJobCards(false);
  }

  async function loadScanJob(tokenValue: string) {
    const tokenTrimmed = tokenValue.trim();
    if (!tokenTrimmed) return;
    setScanLoading(true);
    setScanStatus(null);
    setScanShortageNoteUrl(null);
    await fetch(`${effectiveApiUrl}/api/scan/start?token=${encodeURIComponent(tokenTrimmed)}`).catch(() => null);
    const res = await fetch(`${effectiveApiUrl}/api/scan/job?token=${encodeURIComponent(tokenTrimmed)}`);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setScanJob(null);
      setScanPartQuantities({});
      setScanStatus(err.error ?? "Failed to load job from token.");
      setScanLoading(false);
      return;
    }
    const data = (await res.json()) as { job: ScanJobRecord; shortageNoteUrl?: string };
    setScanJob(data.job);
    setScanQuantity(
      Number.isFinite(Number(data.job.quantityExpected)) ? String(Math.round(Number(data.job.quantityExpected))) : ""
    );
    setScanPartQuantities(
      Object.fromEntries((data.job.jobDxfParts ?? []).map((part) => [part.id, String(Math.max(0, Math.round(part.quantity || 0)))]))
    );
    setScanShortageNoteUrl(data.shortageNoteUrl ? `${effectiveApiUrl}${data.shortageNoteUrl}` : null);
    setScanStatus(`Loaded ${data.job.jobNumber}. Enter checked quantities and click Done.`);
    setScanLoading(false);
  }

  async function submitScan() {
    const tokenValue = scanToken.trim();
    const quantityValue = Number(scanQuantity);
    if (!tokenValue) {
      setScanStatus("Enter a valid QR token.");
      return;
    }
    if (!Number.isFinite(quantityValue)) {
      setScanStatus("Enter overall checked quantity.");
      return;
    }
    const payloadParts = (scanJob?.jobDxfParts ?? []).map((part) => ({
      id: part.id,
      name: part.name,
      quantity: Math.max(0, Math.round(Number(scanPartQuantities[part.id]) || 0))
    }));
    setScanSubmitting(true);
    const res = await fetch(`${effectiveApiUrl}/api/scan/quantity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenValue, quantity: quantityValue, partQuantities: payloadParts })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
      setScanStatus(err.details ? `${err.error ?? "Scan failed"}: ${err.details}` : (err.error ?? "Scan failed"));
      setScanSubmitting(false);
      return;
    }
    const data = (await res.json()) as {
      status?: string;
      jobNumber?: string;
      shortages?: Array<{ name: string; expected: number; checked: number; shortBy: number }>;
      shortageNoteUrl?: string;
    };
    if (data.status === "done") {
      setScanShortageNoteUrl(null);
      setScanStatus(`Done: ${data.jobNumber ?? "job"} quantities correct. Files moved to completed folders.`);
    } else {
      setScanShortageNoteUrl(data.shortageNoteUrl ? `${effectiveApiUrl}${data.shortageNoteUrl}` : null);
      const shortageText = (data.shortages ?? [])
        .map((item) => `${item.name} short by ${item.shortBy}`)
        .join(", ");
      setScanStatus(
        `Incomplete: ${(data.jobNumber ?? "job")} has shortages.${shortageText ? ` ${shortageText}.` : ""} Shortage note PDF generated.`
      );
    }
    await loadScanJob(tokenValue);
    setScanSubmitting(false);
  }

  async function createCustomer() {
    if (!workspaceId) return;
    const name = newCustomerName.trim();
    if (!name) return;
    const res = await apiFetch(`/api/workspaces/${workspaceId}/customers`, {
      method: "POST",
      body: JSON.stringify({
        name,
        email: newCustomerEmail.trim(),
        phone: newCustomerPhone.trim(),
        address: newCustomerAddress.trim(),
        notes: newCustomerNotes.trim()
      })
    });
    if (!res.ok) return;
    setNewCustomerName("");
    setNewCustomerEmail("");
    setNewCustomerPhone("");
    setNewCustomerAddress("");
    setNewCustomerNotes("");
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

  async function addPayment(customerId?: string) {
    if (!workspaceId) return;
    const resolvedCustomerId = customerId ?? paymentCustomerId;
    if (!resolvedCustomerId) {
      setPaymentStatus("Select a customer before adding a payment.");
      return;
    }
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentStatus("Enter a valid payment amount.");
      return;
    }
    const note = paymentNote.trim() || undefined;
    setPaymentBusy(true);
    setPaymentStatus(null);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/customers/${resolvedCustomerId}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount, note })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setPaymentStatus(data?.error ?? "Failed to add payment.");
        return;
      }
      setPaymentCustomerId(resolvedCustomerId);
      setPaymentAmount("");
      setPaymentNote("");
      await refreshCustomers();
      await refreshCustomerSummary();
      const paidCustomer = customers.find((entry) => entry.id === resolvedCustomerId);
      setPaymentStatus(`Payment added${paidCustomer ? ` for ${paidCustomer.name}` : ""}.`);
    } finally {
      setPaymentBusy(false);
    }
  }

  async function applyProofOfPaymentFromSelectedEmail() {
    if (!workspaceId || !selectedInboxMessage) return;
    const pdfAttachments = selectedInboxMessageAttachments.filter((attachment) => isPdfAttachment(attachment));
    if (!pdfAttachments.length) {
      setEmailStatus("No PDF proof of payment found on this email.");
      return;
    }
    const processedActions = processedEmailMap[selectedInboxMessage.uid]?.actions ?? [];
    if (processedActions.some((entry) => entry.toLowerCase().includes("payment applied"))) {
      setEmailStatus("This email already has a payment applied.");
      return;
    }

    setProofOfPaymentBusy(true);
    try {
      const textChunks = [
        selectedInboxMessage.subject,
        cleanEmailDisplayText(selectedInboxMessage.body ?? selectedInboxMessage.snippet ?? "")
      ];
      for (const attachment of pdfAttachments.slice(0, 3)) {
        try {
          const payload = await fetchInboxAttachmentPayload(selectedInboxMessage.uid, attachment.part);
          if (!payload) continue;
          const pdfText = await extractTextFromPdfArrayBuffer(decodeBase64ToArrayBuffer(payload.base64));
          if (pdfText.trim()) textChunks.push(pdfText);
        } catch {
          // continue scanning remaining PDFs
        }
      }

      const combinedText = textChunks.join("\n");
      const normalizedText = normalizePaymentRef(combinedText);
      const matchedInvoice =
        mergedInvoiceDocs
          .slice()
          .sort((a, b) => b.number.length - a.number.length)
          .find((invoice) => {
            const invoiceRef = normalizePaymentRef(invoice.number);
            const quoteRef = normalizePaymentRef(invoice.number.replace(/^INV-/, ""));
            return normalizedText.includes(invoiceRef) || (quoteRef && normalizedText.includes(quoteRef));
          }) ?? null;
      if (!matchedInvoice) {
        setEmailStatus("No invoice reference from this proof of payment matched an invoice.");
        return;
      }

      const customer = customers.find(
        (entry) => normalizePaymentRef(entry.name) === normalizePaymentRef(matchedInvoice.customerName)
      );
      if (!customer) {
        setEmailStatus(`Matched ${matchedInvoice.number}, but could not find the customer record.`);
        return;
      }

      const amountCandidates = extractPaymentAmounts(combinedText);
      const invoiceAmount = Number(matchedInvoice.amount ?? 0) || 0;
      const amount =
        amountCandidates.find((value) => Math.abs(value - invoiceAmount) < 0.01) ??
        amountCandidates.sort((a, b) => Math.abs(a - invoiceAmount) - Math.abs(b - invoiceAmount))[0] ??
        invoiceAmount;
      if (!Number.isFinite(amount) || amount <= 0) {
        setEmailStatus(`Matched ${matchedInvoice.number}, but could not determine the payment amount.`);
        return;
      }

      const res = await apiFetch(`/api/workspaces/${workspaceId}/customers/${customer.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          note: `POP email ${selectedInboxMessage.uid} · ${matchedInvoice.number}`
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setEmailStatus(data?.error ?? "Failed to apply proof of payment.");
        return;
      }
      await refreshCustomerSummary();
      markInboxEmailProcessed(selectedInboxMessage.uid, `POP payment applied (${matchedInvoice.number})`);
      setEmailStatus(`Applied payment ${formatRand(amount)} to ${matchedInvoice.number} for ${customer.name}.`);
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Failed to apply proof of payment.");
    } finally {
      setProofOfPaymentBusy(false);
    }
  }

  function addQuotePart() {
    setQuoteParts((parts) => [
      ...parts,
      {
        name: `Part ${parts.length + 1}`,
        dxfName: undefined,
        thumbnailDataUrl: undefined,
        lengthMm: 0,
        widthMm: 0,
        thicknessMm: JOB_DXF_THICKNESS_OPTIONS[0],
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
      parts.map((part, i) =>
        i === index
          ? {
              ...part,
              ...next,
              thicknessMm:
                next.thicknessMm !== undefined
                  ? normalizeJobDxfThickness(next.thicknessMm)
                  : normalizeJobDxfThickness(part.thicknessMm)
            }
          : part
      )
    );
  }

  function removeQuotePart(index: number) {
    setQuoteParts((parts) => parts.filter((_part, i) => i !== index));
  }

  function rebuildDxfReaderParts(
    allSegments: DxfSegment[],
    fileName: string,
    selectedLayers: string[],
    keepCurrentSelection = false,
    fileIdPrefix = "dxf"
  ) {
    const mergeTolerance = Math.max(0, Number(dxfMergeToleranceMm) || 0);
    const visibleSegments = allSegments.filter((seg) => selectedLayers.includes(seg.layer));
    if (!visibleSegments.length) {
      return {
        parts: [] as DxfReaderPartPreview[],
        previewDataUrl: undefined as string | undefined,
        componentCount: 0
      };
    }

    const components = groupComponentsByDrawingIslands(
      mergeContainedComponents(
        mergeComponentsByProximity(splitSegmentsIntoParts(visibleSegments), mergeTolerance)
      )
    );
    const groups = new Map<
      string,
      { segments: DxfSegment[]; quantity: number; layer: string; signature: string }
    >();
    for (const component of components) {
      const signature = getPartSignature(component);
      const key = signature;
      const layer = Array.from(new Set(component.map((seg) => seg.layer))).sort((a, b) => a.localeCompare(b)).join(", ");
      const existing = groups.get(key);
      if (existing) existing.quantity += 1;
      else groups.set(key, { segments: component, quantity: 1, layer, signature });
    }

    const baseName = fileName.replace(/\.dxf$/i, "");
    const detected: DxfReaderPartPreview[] = Array.from(groups.values())
      .map((group, index) => {
        const bounds = getDxfBounds(group.segments);
        if (!bounds) return null;
        const thumbnailDataUrl = createSegmentThumbnailDataUrl(group.segments, 110);
        const printDataUrl = createSegmentSvgDataUrl(group.segments, 720);
        if (!thumbnailDataUrl || !printDataUrl) return null;
        const cutLengthMm = group.segments.reduce((sum, seg) => sum + segmentLength(seg), 0);
        return {
          id: `${fileIdPrefix}-part-${index + 1}`,
          name: `${baseName}-part-${index + 1}`,
          layer: group.layer,
          quantity: group.quantity,
          widthMm: Math.max(1, Math.round(bounds.maxX - bounds.minX)),
          heightMm: Math.max(1, Math.round(bounds.maxY - bounds.minY)),
          cutLengthMm: Math.round(cutLengthMm),
          pierceCount: estimatePierceCount(group.segments),
          segmentCount: group.segments.length,
          thumbnailDataUrl,
          printDataUrl,
          sourceSegments: group.segments,
          sourceBounds: bounds
        };
      })
      .filter((entry): entry is DxfReaderPartPreview => Boolean(entry));

    return {
      parts: detected,
      previewDataUrl: createSegmentThumbnailDataUrl(visibleSegments, 220, "#0b1220", "#67e8f9"),
      componentCount: components.length
    };
  }

  function rebuildDxfReaderFromSourceFiles(
    sourceFiles: QuoteDxfSourceFile[],
    selectedLayers: string[],
    keepCurrentSelection = false
  ) {
    const nextSourceFiles = sourceFiles.map((source) => {
      const rebuilt = rebuildDxfReaderParts(source.segments, source.fileName, selectedLayers, keepCurrentSelection, source.id);
      return { ...source, parts: rebuilt.parts, previewDataUrl: rebuilt.previewDataUrl };
    });
    const mergedParts = nextSourceFiles.flatMap((source) => source.parts);
    const visibleSegments = nextSourceFiles.flatMap((source) =>
      source.segments.filter((segment) => selectedLayers.includes(segment.layer))
    );
    setDxfReaderSourceFiles(nextSourceFiles);
    setDxfReaderParts(mergedParts);
    setDxfReaderPreviewDataUrl(createSegmentThumbnailDataUrl(visibleSegments, 220, "#0b1220", "#67e8f9"));
    setDxfReaderSelectedPartIds((prev) => {
      if (!keepCurrentSelection) return mergedParts.map((part) => part.id);
      const valid = prev.filter((id) => mergedParts.some((part) => part.id === id));
      return valid.length ? valid : mergedParts.map((part) => part.id);
    });
    const componentCount = nextSourceFiles.reduce((sum, source) => sum + source.parts.length, 0);
    setDxfReaderStatus(
      `Loaded ${nextSourceFiles.length} file${nextSourceFiles.length === 1 ? "" : "s"}: ${componentCount} unique part type${
        componentCount === 1 ? "" : "s"
      }.`
    );
  }

  function ingestDxfRaw(raw: string, sourceName: string, append = false) {
    if (!append) {
      setPartDnaResultsByPartId({});
      setPartDnaStatus(null);
    }
    const segments = parseDxfSegments(raw);
    if (!segments.length) {
      setDxfReaderStatus("No drawable entities found in this DXF.");
      if (!append) {
        setDxfReaderSegments([]);
        setDxfReaderLayers([]);
        setDxfReaderSelectedLayers([]);
        setDxfReaderParts([]);
        setDxfReaderSourceFiles([]);
        setDxfReaderSelectedPartIds([]);
        setDxfReaderPreviewDataUrl(undefined);
      }
      return false;
    }
    const layers = Array.from(new Set(segments.map((seg) => seg.layer))).sort((a, b) => a.localeCompare(b));
    const sourceEntry: QuoteDxfSourceFile = {
      id: `quote-dxf-source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fileName: sourceName,
      segments,
      layers,
      parts: []
    };
    const nextSourceFiles = append ? [...dxfReaderSourceFiles, sourceEntry] : [sourceEntry];
    const nextSegments = nextSourceFiles.flatMap((source) => source.segments);
    const nextLayers = Array.from(new Set(nextSegments.map((seg) => seg.layer))).sort((a, b) => a.localeCompare(b));
    const nextSelectedLayers = append
      ? Array.from(new Set([...dxfReaderSelectedLayers, ...layers])).sort((a, b) => a.localeCompare(b))
      : layers;
    setDxfReaderFileName(append ? "DXF Import" : sourceName);
    setDxfReaderSegments(nextSegments);
    setDxfReaderLayers(nextLayers);
    setDxfReaderSelectedLayers(nextSelectedLayers);
    rebuildDxfReaderFromSourceFiles(nextSourceFiles, nextSelectedLayers, true);
    return true;
  }

  async function loadDxfReaderFiles(fileList?: FileList | File[]) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const dxfFiles = files.filter((file) => file.name.toLowerCase().endsWith(".dxf"));
    if (!dxfFiles.length) {
      setDxfReaderStatus("Please choose a .dxf file.");
      return;
    }
    let loaded = 0;
    for (const file of dxfFiles) {
      try {
        const raw = await readDxfText(file);
        const ok = ingestDxfRaw(raw, file.name, dxfReaderSourceFiles.length + loaded > 0);
        if (ok) loaded += 1;
      } catch (error) {
        const err = error as { name?: string; message?: string };
        const name = err?.name ?? "";
        const detail = err?.message ?? String(error);
        if (name.includes("NotAllowed") || name.includes("Security") || detail.toLowerCase().includes("permission")) {
          setDxfReaderStatus("Permission blocked reading this file. Copy the DXF to Desktop/Documents and retry, or paste DXF text below and load from text.");
        } else if (name.includes("NotReadable")) {
          setDxfReaderStatus("DXF file is not readable right now (possibly cloud-only). Download it locally, then retry.");
        } else {
          setDxfReaderStatus(`Failed to read DXF file. ${detail}`);
        }
      }
    }
    if (loaded > 0) {
      setDxfReaderStatus(`Loaded ${loaded} DXF file${loaded === 1 ? "" : "s"} and split into parts.`);
    }
  }

  async function importDxfFromDesktopPicker() {
    if (!window.desktopShell?.pickDxfFile) {
      setDxfReaderStatus("Desktop picker is unavailable in browser mode. Use file upload or run the desktop app.");
      return;
    }
    try {
      const result = await window.desktopShell.pickDxfFile();
      if (!result.ok) {
        if (result.canceled) {
          setDxfReaderStatus("DXF import canceled.");
          return;
        }
        setDxfReaderStatus(`DXF import failed. ${result.error ?? "Unknown error"}`);
        return;
      }
      const raw = decodeDxfArrayBuffer(decodeBase64ToArrayBuffer(result.contentBase64));
      ingestDxfRaw(raw, result.fileName, dxfReaderSourceFiles.length > 0 || dxfReaderSegments.length > 0);
      setDxfReaderStatus(`Loaded ${result.fileName} via desktop picker.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setDxfReaderStatus(`DXF import failed. ${detail}`);
    }
  }

  function toggleDxfReaderLayer(layer: string) {
    setDxfReaderSelectedLayers((layers) =>
      layers.includes(layer) ? layers.filter((entry) => entry !== layer) : [...layers, layer]
    );
  }

  function toggleDxfReaderPart(partId: string) {
    setDxfReaderSelectedPartIds((ids) =>
      ids.includes(partId) ? ids.filter((id) => id !== partId) : [...ids, partId]
    );
  }

  function renameDxfReaderPart(partId: string, name: string) {
    setDxfReaderParts((parts) =>
      parts.map((part) => (part.id === partId ? { ...part, name: name.trim() || part.name } : part))
    );
    setDxfReaderSourceFiles((files) =>
      files.map((file) => ({
        ...file,
        parts: file.parts.map((part) => (part.id === partId ? { ...part, name: name.trim() || part.name } : part))
      }))
    );
  }

  function updateDxfReaderPartQuantity(partId: string, quantity: number) {
    const nextQuantity = Math.max(0, Math.round(quantity || 0));
    setDxfReaderParts((parts) => parts.map((part) => (part.id === partId ? { ...part, quantity: nextQuantity } : part)));
    setDxfReaderSourceFiles((files) =>
      files.map((file) => ({
        ...file,
        parts: file.parts.map((part) => (part.id === partId ? { ...part, quantity: nextQuantity } : part))
      }))
    );
  }

  function toggleSelectAllDxfReaderParts() {
    setDxfReaderSelectedPartIds((selected) =>
      selected.length === dxfReaderParts.length ? [] : dxfReaderParts.map((part) => part.id)
    );
  }

  function deleteSelectedDxfReaderParts() {
    if (!dxfReaderSelectedPartIds.length) {
      setDxfReaderStatus("Select one or more parts to delete.");
      return;
    }
    setDxfReaderParts((parts) => parts.filter((part) => !dxfReaderSelectedPartIds.includes(part.id)));
    setDxfReaderSourceFiles((files) =>
      files.map((file) => ({
        ...file,
        parts: file.parts.filter((part) => !dxfReaderSelectedPartIds.includes(part.id))
      }))
    );
    setDxfReaderSelectedPartIds([]);
    setDxfReaderStatus("Selected parts deleted.");
  }

  function clearDxfReader() {
    setDxfReaderFileName("");
    setDxfReaderSegments([]);
    setDxfReaderLayers([]);
    setDxfReaderSelectedLayers([]);
    setDxfReaderPreviewDataUrl(undefined);
    setDxfReaderParts([]);
    setDxfReaderSourceFiles([]);
    setDxfReaderSelectedPartIds([]);
    setDxfReaderTextInput("");
    setNestingResults([]);
    setPartDnaResultsByPartId({});
    setPartDnaStatus(null);
    setDxfReaderStatus("Cleared DXF reader.");
  }

  async function loadPdfReaderFiles(fileList?: FileList | File[]) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const pdfFiles = files.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
    if (!pdfFiles.length) {
      setPdfReaderStatus("Please choose one or more PDF files.");
      return;
    }

    const nextPages: PdfReaderSourcePage[] = [...pdfReaderSourcePages];
    let detectedCount = 0;
    for (const file of pdfFiles) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const loadingTask = getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const renderScale = 2;
          const viewport = page.getViewport({ scale: renderScale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          const context = canvas.getContext("2d");
          if (!context) continue;
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport }).promise;

          const pageId = `quote-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${pageNumber}`;
          const parts = detectPdfDrawingPartsFromCanvas(canvas, file.name, pageNumber, pageId, renderScale);
          detectedCount += parts.length;
          nextPages.push({
            id: pageId,
            fileName: file.name,
            pageNumber,
            previewDataUrl: canvas.toDataURL("image/png"),
            parts
          });
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        setPdfReaderStatus(`Failed to read ${file.name}. ${detail}`);
      }
    }
    const mergedParts = nextPages.flatMap((page) => page.parts);
    setPdfReaderSourcePages(nextPages);
    setPdfReaderParts(mergedParts);
    setPdfReaderSelectedPartIds(mergedParts.map((part) => part.id));
    setPdfReaderStatus(
      `Loaded ${pdfFiles.length} PDF file${pdfFiles.length === 1 ? "" : "s"}: detected ${detectedCount} drawing part${
        detectedCount === 1 ? "" : "s"
      }.`
    );
  }

  async function importPdfFromDesktopPicker() {
    if (!window.desktopShell?.pickFile) {
      setPdfReaderStatus("Desktop picker is unavailable in browser mode. Use file upload or run the desktop app.");
      return;
    }
    try {
      const result = await window.desktopShell.pickFile({ title: "Select PDF drawing", extensions: ["pdf"] });
      if (!result.ok) {
        setPdfReaderStatus(result.canceled ? "PDF import canceled." : `PDF import failed. ${result.error ?? "Unknown error"}`);
        return;
      }
      const file = new File([decodeBase64ToArrayBuffer(result.contentBase64)], result.fileName, { type: "application/pdf" });
      await loadPdfReaderFiles([file]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setPdfReaderStatus(`PDF import failed. ${detail}`);
    }
  }

  function togglePdfReaderPart(partId: string) {
    setPdfReaderSelectedPartIds((ids) => (ids.includes(partId) ? ids.filter((id) => id !== partId) : [...ids, partId]));
  }

  function renamePdfReaderPart(partId: string, name: string) {
    setPdfReaderParts((parts) =>
      parts.map((part) => (part.id === partId ? { ...part, name: name.trim() || part.name } : part))
    );
    setPdfReaderSourcePages((pages) =>
      pages.map((page) => ({
        ...page,
        parts: page.parts.map((part) => (part.id === partId ? { ...part, name: name.trim() || part.name } : part))
      }))
    );
  }

  function toggleSelectAllPdfReaderParts() {
    setPdfReaderSelectedPartIds((selected) =>
      selected.length === pdfReaderParts.length ? [] : pdfReaderParts.map((part) => part.id)
    );
  }

  function deleteSelectedPdfReaderParts() {
    if (!pdfReaderSelectedPartIds.length) {
      setPdfReaderStatus("Select one or more PDF parts to delete.");
      return;
    }
    setPdfReaderParts((parts) => parts.filter((part) => !pdfReaderSelectedPartIds.includes(part.id)));
    setPdfReaderSourcePages((pages) =>
      pages.map((page) => ({
        ...page,
        parts: page.parts.filter((part) => !pdfReaderSelectedPartIds.includes(part.id))
      }))
    );
    setPdfReaderSelectedPartIds([]);
    setPdfReaderStatus("Selected PDF parts deleted.");
  }

  function clearPdfReader() {
    setPdfReaderSourcePages([]);
    setPdfReaderParts([]);
    setPdfReaderSelectedPartIds([]);
    setPdfReaderStatus("Cleared PDF reader.");
  }

  function addSelectedPdfPartsToQuote() {
    const selected = pdfReaderParts.filter((part) => pdfReaderSelectedPartIds.includes(part.id));
    if (!selected.length) {
      setPdfReaderStatus("No PDF parts selected.");
      return;
    }
    setQuoteParts((parts) => [
      ...parts,
      ...selected.map((part) => ({
        name: part.name,
        dxfName: `${part.fileName} (page ${part.pageNumber})`,
        thumbnailDataUrl: part.thumbnailDataUrl,
        lengthMm: part.widthMm,
        widthMm: part.heightMm,
        thicknessMm: 0,
        material: materials[0]?.name ?? "Mild Steel",
        quantity: Math.max(1, part.quantity),
        cutLengthMm: 0,
        pierceCount: 0,
        bendCount: 0,
        unitPrice: 0,
        lineTotal: 0
      }))
    ]);
    setPdfReaderStatus(`Added ${selected.length} PDF part${selected.length === 1 ? "" : "s"} to Laser Quote parts.`);
  }

  function runNestingEstimate() {
    const selected = dxfReaderParts.filter((part) => dxfReaderSelectedPartIds.includes(part.id));
    if (!selected.length) {
      setDxfReaderStatus("Select at least one part before nesting.");
      setNestingResults([]);
      return;
    }
    const gap = Math.max(0, Number(nestingGapMm) || 0);
    const input: NestingPlateInput[] = selected.map((part) => ({
      name: part.name,
      widthMm: part.widthMm,
      heightMm: part.heightMm,
      quantity: Math.max(1, part.quantity),
      sourceSegments: part.sourceSegments,
      sourceBounds: part.sourceBounds
    }));
    const results = [
      estimateNestingForPlate(input, 3000, 1500, gap),
      estimateNestingForPlate(input, 2500, 1250, gap)
    ];
    setNestingResults(results);
    setDxfReaderStatus(
      `Nesting estimate ready for ${results[0].totalParts} part instance${results[0].totalParts === 1 ? "" : "s"} with ${gap}mm spacing.`
    );
  }

  async function analyzeDxfPartForPartDna(part: DxfReaderPartPreview) {
    if (!workspaceId) return null;
    const existing = partDnaResultsByPartId[part.id];
    if (existing) return existing;

    const dxfText = buildDxfFromSegments(part.sourceSegments);
    const blob = new Blob([dxfText], { type: "application/dxf" });
    const formData = new FormData();
    formData.append("workspaceId", workspaceId);
    formData.append("fileName", `${part.name}.dxf`);
    formData.append("partName", part.name);
    formData.append("material", materials[0]?.name ?? "Mild Steel");
    formData.append("thickness", "0");
    if (selectedQuoteCustomer?.id) formData.append("customerId", selectedQuoteCustomer.id);
    if (selectedQuoteCustomer?.name) formData.append("customerName", selectedQuoteCustomer.name);
    formData.append("entityType", "dxf");
    formData.append("entityId", part.id);
    formData.append("file", blob, `${part.name}.dxf`);

    const res = await apiFetch("/api/brain/part-dna/analyze", {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || `Failed to analyze ${part.name}`);
    }
    return (await res.json()) as PartDnaAnalysisResult;
  }

  async function addSelectedDxfPartsToQuote() {
    const selected = dxfReaderParts.filter((part) => dxfReaderSelectedPartIds.includes(part.id));
    if (!selected.length) {
      setDxfReaderStatus("No DXF parts selected.");
      return;
    }

    setPartDnaBusy(true);
    setDxfReaderStatus(`Creating Part DNA for ${selected.length} selected part${selected.length === 1 ? "" : "s"}...`);
    try {
      const dnaEntries = await Promise.all(
        selected.map(async (part) => ({
          part,
          dna: await analyzeDxfPartForPartDna(part)
        }))
      );

      const nextResults = Object.fromEntries(
        dnaEntries
          .filter((entry) => entry.dna)
          .map((entry) => [entry.part.id, entry.dna as PartDnaAnalysisResult])
      ) as Record<string, PartDnaAnalysisResult>;

      if (Object.keys(nextResults).length) {
        setPartDnaResultsByPartId((current) => ({ ...current, ...nextResults }));
      }
      if (dnaEntries.length) {
        void pushCloudEvent("part_dna_detected", {
          count: dnaEntries.length,
          partCodes: dnaEntries.map((entry) => entry.dna?.partCode).filter(Boolean)
        });
        void logBrainEvent({
          eventType: "part_dna_detected",
          entityType: "workspace",
          entityId: workspaceId ?? "workspace",
          payload: {
            count: dnaEntries.length,
            partCodes: dnaEntries.map((entry) => entry.dna?.partCode).filter(Boolean)
          }
        });
      }
      maybeShowPreviousPartPricePopup(dnaEntries.map(({ part, dna }) => ({ partName: part.name, result: dna })));
      void loadPartDnaLibrary();

      setQuoteParts((parts) => [
        ...parts,
        ...dnaEntries.map(({ part, dna }) => ({
          name: dna?.partCode || part.name,
          partCode: dna?.partCode,
          partDnaId: dna?.partId,
          geometryHash: dna?.geometryHash,
          softHash: dna?.softHash,
          dxfName: dxfReaderFileName || part.name,
          thumbnailDataUrl: part.thumbnailDataUrl,
          lengthMm: part.widthMm,
          widthMm: part.heightMm,
          thicknessMm: 0,
          material: materials[0]?.name ?? "Mild Steel",
          quantity: Math.max(1, part.quantity),
          cutLengthMm: part.cutLengthMm,
          pierceCount: part.pierceCount,
          bendCount: 0,
          unitPrice: 0,
          lineTotal: 0
        }))
      ]);
      setPartDnaStatus(`Part DNA analyzed ${selected.length} part${selected.length === 1 ? "" : "s"} successfully.`);
      setDxfReaderStatus(`Added ${selected.length} part${selected.length === 1 ? "" : "s"} to Laser Quote parts with DNA codes.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setPartDnaStatus(`Part DNA analysis failed. ${detail}`);
      setDxfReaderStatus(`Could not add selected DXF parts to quote. ${detail}`);
    } finally {
      setPartDnaBusy(false);
    }
  }

  async function analyzeSelectedDxfPartsForPartDna() {
    if (!workspaceId) return;
    const selected = dxfReaderParts.filter((part) =>
      dxfReaderSelectedPartIds.length ? dxfReaderSelectedPartIds.includes(part.id) : true
    );
    if (!selected.length) {
      setPartDnaStatus("Load a DXF and select at least one part first.");
      return;
    }

    setPartDnaBusy(true);
    setPartDnaStatus(`Analyzing ${selected.length} part${selected.length === 1 ? "" : "s"}...`);
    const nextResults: Record<string, PartDnaAnalysisResult> = {};
    let successCount = 0;
    try {
      for (const part of selected) {
        const data = await analyzeDxfPartForPartDna(part);
        if (!data) throw new Error(`Failed to analyze ${part.name}`);
        nextResults[part.id] = data;
        successCount += 1;
      }
      setPartDnaResultsByPartId((current) => ({ ...current, ...nextResults }));
      if (successCount > 0) {
        void pushCloudEvent("part_dna_detected", {
          count: successCount,
          partCodes: Object.values(nextResults).map((result) => result.partCode).filter(Boolean)
        });
        void logBrainEvent({
          eventType: "part_dna_detected",
          entityType: "workspace",
          entityId: workspaceId ?? "workspace",
          payload: {
            count: successCount,
            partCodes: Object.values(nextResults).map((result) => result.partCode).filter(Boolean)
          }
        });
      }
      maybeShowPreviousPartPricePopup(selected.map((part) => ({ partName: part.name, result: nextResults[part.id] ?? null })));
      void loadPartDnaLibrary();
      setPartDnaStatus(`Part DNA analyzed ${successCount} part${successCount === 1 ? "" : "s"} successfully.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setPartDnaStatus(`Part DNA analysis failed. ${detail}`);
    } finally {
      setPartDnaBusy(false);
    }
  }

  function printSelectedDxfParts() {
    const selected = dxfReaderParts.filter((part) => dxfReaderSelectedPartIds.includes(part.id));
    if (!selected.length) {
      setDxfReaderStatus("No DXF parts selected for printing.");
      return;
    }
    const win = window.open("", "_blank");
    if (!win) {
      setDxfReaderStatus("Pop-up blocked. Please allow pop-ups to print drawings.");
      return;
    }
    const html = selected
      .map(
        (part) => `
          <section class="sheet">
            <h2>${part.name}</h2>
            <div class="meta">Layer: ${part.layer} · Qty: ${part.quantity} · Size: ${part.widthMm}mm x ${part.heightMm}mm</div>
            <div class="meta">Cut length: ${part.cutLengthMm} mm · Pierce: ${part.pierceCount}</div>
            <img src="${part.printDataUrl}" alt="${part.name}" />
          </section>
        `
      )
      .join("");
    win.document.write(`<!doctype html><html><head><title>DXF Drawings</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 16px; color: #111; }
        .sheet { page-break-after: always; margin-bottom: 28px; }
        .sheet:last-child { page-break-after: auto; }
        .meta { margin-bottom: 8px; font-size: 12px; color: #374151; }
        img { width: 700px; max-width: 100%; border: 1px solid #cbd5e1; }
      </style></head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  }

  function rebuildJobDxfParts(
    allSegments: DxfSegment[],
    fileName: string,
    selectedLayers: string[],
    keepExistingQuantities = false,
    fileIdPrefix = "job-dxf"
  ) {
    const mergeTolerance = Math.max(0, Number(dxfMergeToleranceMm) || 0);
    const visibleSegments = allSegments.filter((seg) => selectedLayers.includes(seg.layer));
    if (!visibleSegments.length) {
      return {
        parts: [] as JobDxfPartPreview[],
        previewDataUrl: undefined as string | undefined,
        componentCount: 0
      };
    }

    const components = groupComponentsByDrawingIslands(
      mergeContainedComponents(
        mergeComponentsByProximity(splitSegmentsIntoParts(visibleSegments), mergeTolerance)
      )
    );
    const groups = new Map<
      string,
      { segments: DxfSegment[]; quantity: number; layer: string; signature: string }
    >();
    for (const component of components) {
      const signature = getPartSignature(component);
      const layer = Array.from(new Set(component.map((seg) => seg.layer))).sort((a, b) => a.localeCompare(b)).join(", ");
      const existing = groups.get(signature);
      if (existing) existing.quantity += 1;
      else groups.set(signature, { segments: component, quantity: 1, layer, signature });
    }

    const baseName = fileName.replace(/\.dxf$/i, "");
    const detected: JobDxfPartPreview[] = Array.from(groups.values())
      .map((group, index) => {
        const bounds = getDxfBounds(group.segments);
        if (!bounds) return null;
        const thumbnailDataUrl = createSegmentThumbnailDataUrl(group.segments, 110);
        const printDataUrl = createSegmentSvgDataUrl(group.segments, 720);
        if (!thumbnailDataUrl || !printDataUrl) return null;
        const cutLengthMm = group.segments.reduce((sum, seg) => sum + segmentLength(seg), 0);
        const existingPart = jobDxfParts.find((part) => part.name === `${baseName}-part-${index + 1}`);
        const quantity = keepExistingQuantities && existingPart ? existingPart.quantity : group.quantity;
        return {
          id: `${fileIdPrefix}-part-${index + 1}`,
          name: `${baseName}-part-${index + 1}`,
          layer: group.layer,
          material: existingPart?.material ?? "Mild Steel",
          thicknessMm: normalizeJobDxfThickness(existingPart?.thicknessMm),
          quantity: Math.max(1, quantity),
          widthMm: Math.max(1, Math.round(bounds.maxX - bounds.minX)),
          heightMm: Math.max(1, Math.round(bounds.maxY - bounds.minY)),
          cutLengthMm: Math.round(cutLengthMm),
          pierceCount: estimatePierceCount(group.segments),
          segmentCount: group.segments.length,
          thumbnailDataUrl,
          printDataUrl,
          sourceSegments: group.segments,
          sourceBounds: bounds
        };
      })
      .filter((entry): entry is JobDxfPartPreview => Boolean(entry));

    return {
      parts: detected,
      previewDataUrl: createSegmentThumbnailDataUrl(visibleSegments, 220, "#0b1220", "#67e8f9"),
      componentCount: components.length
    };
  }

  function createGeneratedJobDxfPartPreview(options: {
    fileIdPrefix: string;
    fileName: string;
    layer: string;
    quantity: number;
    widthMm: number;
    heightMm: number;
    segments: DxfSegment[];
  }) {
    const { fileIdPrefix, fileName, layer, quantity, widthMm, heightMm, segments } = options;
    const thumbnailDataUrl = createSegmentThumbnailDataUrl(segments, 110);
    const printDataUrl = createSegmentSvgDataUrl(segments, 720);
    const bounds = getDxfBounds(segments);
    const cutLengthMm = segments.reduce((sum, seg) => sum + segmentLength(seg), 0);
    return {
      id: `${fileIdPrefix}-part-1`,
      name: `${fileName.replace(/\.dxf$/i, "")}-part-1`,
      layer,
      material: "Mild Steel",
      thicknessMm: normalizeJobDxfThickness(0),
      quantity: Math.max(1, quantity),
      widthMm: Math.max(1, Math.round(widthMm)),
      heightMm: Math.max(1, Math.round(heightMm)),
      cutLengthMm: Math.round(cutLengthMm),
      pierceCount: estimatePierceCount(segments),
      segmentCount: segments.length,
      thumbnailDataUrl,
      printDataUrl,
      sourceSegments: segments,
      sourceBounds: bounds
    } satisfies JobDxfPartPreview;
  }

  function rebuildJobDxfFromSourceFiles(
    sourceFiles: JobDxfSourceFile[],
    selectedLayers: string[],
    keepExistingQuantities = false
  ) {
    const nextSourceFiles = sourceFiles.map((source) => {
      if (source.fixedParts?.length) {
        const visibleSegments = source.segments.filter((segment) => selectedLayers.includes(segment.layer));
        return {
          ...source,
          previewDataUrl: createSegmentThumbnailDataUrl(
            visibleSegments.length ? visibleSegments : source.segments,
            220,
            "#0b1220",
            "#67e8f9"
          ),
          parts: visibleSegments.length ? source.fixedParts : []
        };
      }
      const result = rebuildJobDxfParts(
        source.segments,
        source.fileName,
        selectedLayers,
        keepExistingQuantities,
        source.id
      );
      return {
        ...source,
        previewDataUrl: result.previewDataUrl,
        parts: result.parts
      };
    });
    const mergedParts = nextSourceFiles.flatMap((source) => source.parts);
    const visibleSegments = sourceFiles.flatMap((source) =>
      source.segments.filter((segment) => selectedLayers.includes(segment.layer))
    );
    setJobDxfSourceFiles(nextSourceFiles);
    setJobDxfParts(mergedParts);
    setJobDxfPreviewDataUrl(createSegmentThumbnailDataUrl(visibleSegments, 220, "#0b1220", "#67e8f9"));
    const totalDetected = nextSourceFiles.reduce((sum, source) => sum + source.parts.length, 0);
    setJobDxfStatus(
      `Loaded ${nextSourceFiles.length} file${nextSourceFiles.length === 1 ? "" : "s"} with ${totalDetected} part type${
        totalDetected === 1 ? "" : "s"
      }.`
    );
  }

  function ingestJobDxfRaw(raw: string, sourceName: string, append = false) {
    const segments = parseDxfSegments(raw);
    if (!segments.length) {
      setJobDxfStatus("No drawable entities found in this DXF.");
      if (!append) {
        setJobDxfSegments([]);
        setJobDxfLayers([]);
        setJobDxfSelectedLayers([]);
        setJobDxfParts([]);
        setJobDxfSourceFiles([]);
        setJobDxfPreviewDataUrl(undefined);
      }
      return false;
    }
    const layers = Array.from(new Set(segments.map((seg) => seg.layer))).sort((a, b) => a.localeCompare(b));
    const sourceEntry: JobDxfSourceFile = {
      id: `job-dxf-source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fileName: sourceName,
      segments,
      layers,
      parts: [],
      previewDataUrl: createSegmentThumbnailDataUrl(segments, 140, "#0b1220", "#67e8f9")
    };
    const nextSourceFiles = append ? [...jobDxfSourceFiles, sourceEntry] : [sourceEntry];
    const nextSegments = nextSourceFiles.flatMap((source) => source.segments);
    const nextLayers = Array.from(new Set(nextSegments.map((seg) => seg.layer))).sort((a, b) => a.localeCompare(b));
    const nextSelectedLayers = append
      ? Array.from(new Set([...jobDxfSelectedLayers, ...layers])).sort((a, b) => a.localeCompare(b))
      : layers;
    setJobDxfFileName(append ? "DXF Import" : sourceName);
    setJobDxfSegments(nextSegments);
    setJobDxfLayers(nextLayers);
    setJobDxfSelectedLayers(nextSelectedLayers);
    rebuildJobDxfFromSourceFiles(nextSourceFiles, nextSelectedLayers, true);
    return true;
  }

  async function loadJobDxfFiles(fileList?: FileList | File[]) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const dxfFiles = files.filter((file) => file.name.toLowerCase().endsWith(".dxf"));
    if (!dxfFiles.length) {
      setJobDxfStatus("Please choose a .dxf file.");
      return;
    }
    const nextSourceFiles = [...jobDxfSourceFiles];
    const importedNames: string[] = [];
    let failedCount = 0;
    for (const file of dxfFiles) {
      try {
        const raw = await readDxfText(file);
        const parsed = parseDxfSegments(raw);
        if (!parsed.length) {
          failedCount += 1;
          continue;
        }
        const layers = Array.from(new Set(parsed.map((seg) => seg.layer))).sort((a, b) => a.localeCompare(b));
        nextSourceFiles.push({
          id: `job-dxf-source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${nextSourceFiles.length}`,
          fileName: file.name,
          segments: parsed,
          layers,
          parts: [],
          previewDataUrl: createSegmentThumbnailDataUrl(parsed, 140, "#0b1220", "#67e8f9")
        });
        importedNames.push(file.name);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        setJobDxfStatus(`Failed to read ${file.name}. ${detail}`);
        failedCount += 1;
      }
    }
    if (!importedNames.length) {
      setJobDxfStatus("No drawable entities found in selected DXF files.");
      return;
    }
    const nextSegments = nextSourceFiles.flatMap((source) => source.segments);
    const nextLayers = Array.from(new Set(nextSegments.map((seg) => seg.layer))).sort((a, b) => a.localeCompare(b));
    const nextSelectedLayers = Array.from(new Set([...jobDxfSelectedLayers, ...nextLayers])).sort((a, b) => a.localeCompare(b));
    const sourceLabel = importedNames.length === 1 && nextSourceFiles.length === 1 ? importedNames[0] : "DXF Import";
    setJobDxfFileName(sourceLabel);
    setJobDxfSegments(nextSegments);
    setJobDxfLayers(nextLayers);
    setJobDxfSelectedLayers(nextSelectedLayers);
    rebuildJobDxfFromSourceFiles(nextSourceFiles, nextSelectedLayers, true);
    setJobDxfStatus(
      `Loaded ${importedNames.length} DXF file${importedNames.length === 1 ? "" : "s"}${
        failedCount > 0 ? ` (${failedCount} skipped)` : ""
      }.`
    );
  }

  async function importJobDxfFromDesktopPicker() {
    if (!window.desktopShell?.pickDxfFile) {
      setJobDxfStatus("Desktop picker unavailable. Use file upload.");
      return;
    }
    try {
      const result = await window.desktopShell.pickDxfFile();
      if (!result.ok) {
        setJobDxfStatus(result.canceled ? "DXF import canceled." : `DXF import failed. ${result.error ?? "Unknown error"}`);
        return;
      }
      const raw = decodeDxfArrayBuffer(decodeBase64ToArrayBuffer(result.contentBase64));
      ingestJobDxfRaw(raw, result.fileName, jobDxfSourceFiles.length > 0 || jobDxfSegments.length > 0);
      setJobDxfStatus(`Loaded ${result.fileName} via desktop picker.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setJobDxfStatus(`DXF import failed. ${detail}`);
    }
  }

  function addManualJobPlate() {
    const quantity = Math.max(1, Math.round(Number(manualPlateQuantity) || 1));
    const width = Math.max(1, Number(manualPlateWidthMm) || 0);
    const height = Math.max(1, Number(manualPlateHeightMm) || 0);
    const diameter = Math.max(1, Number(manualPlateDiameterMm) || 0);
    if (manualPlateShape === "square" && (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)) {
      setJobDxfStatus("Enter valid width and height for the square/rectangle plate.");
      return;
    }
    if (manualPlateShape === "round" && (!Number.isFinite(diameter) || diameter <= 0)) {
      setJobDxfStatus("Enter a valid diameter for the round plate.");
      return;
    }

    const partName = manualPlateName.trim() || `manual-${manualPlateShape}-${Date.now()}`;
    const fileName = `${partName}.dxf`;
    const sourceId = `job-manual-source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const layer = "MANUAL";
    const partWidth = manualPlateShape === "square" ? width : diameter;
    const partHeight = manualPlateShape === "square" ? height : diameter;
    const spacing = Math.max(20, Math.round(Math.max(partWidth, partHeight) * 0.2));
    const segments: DxfSegment[] = [];

    for (let i = 0; i < quantity; i += 1) {
      const offsetX = i * (partWidth + spacing);
      const entityPrefix = `${sourceId}-inst-${i + 1}`;
      const shapeSegments =
        manualPlateShape === "square"
          ? createRectangleSegments(partWidth, partHeight, layer, entityPrefix, offsetX, 0)
          : createCircleSegments(partWidth, layer, entityPrefix, offsetX, 0);
      segments.push(...shapeSegments);
    }

    const sourceEntry: JobDxfSourceFile = {
      id: sourceId,
      fileName,
      segments,
      layers: [layer],
      parts: [],
      previewDataUrl: createSegmentThumbnailDataUrl(segments, 140, "#0b1220", "#67e8f9")
    };
    const nextSourceFiles = [...jobDxfSourceFiles, sourceEntry];
    const nextSegments = nextSourceFiles.flatMap((source) => source.segments);
    const nextLayers = Array.from(new Set(nextSegments.map((segment) => segment.layer))).sort((a, b) => a.localeCompare(b));
    const nextSelectedLayers = Array.from(new Set([...jobDxfSelectedLayers, layer])).sort((a, b) => a.localeCompare(b));

    setJobDxfFileName(nextSourceFiles.length === 1 ? fileName : "DXF Import");
    setJobDxfSegments(nextSegments);
    setJobDxfLayers(nextLayers);
    setJobDxfSelectedLayers(nextSelectedLayers);
    rebuildJobDxfFromSourceFiles(nextSourceFiles, nextSelectedLayers, true);
    setJobDxfSelectedPartIds((current) =>
      Array.from(new Set([...current, `${sourceId}-part-1`]))
    );
    setJobDxfStatus(
      `Added manual ${manualPlateShape === "square" ? "square/rectangle" : "round"} plate (${partWidth} x ${partHeight} mm, qty ${quantity}).`
    );
  }

  function addManualPerforatedPlate() {
    if (perforationPreview.error) {
      setJobDxfStatus(perforationPreview.error);
      return;
    }
    if (!perforationPreview.segments.length) {
      setJobDxfStatus("Perforation preview is empty.");
      return;
    }

    const quantity = Math.max(1, Math.round(Number(perfQuantity) || 1));
    const plateWidth = Math.max(1, Number(perfPlateWidthMm) || 0);
    const plateHeight = Math.max(1, Number(perfPlateHeightMm) || 0);
    const spacing = Math.max(20, Math.round(Math.max(plateWidth, plateHeight) * 0.2));
    const partName = perfPartName.trim() || `perforated-${perfHoleType}-${Date.now()}`;
    const fileName = `${partName}.dxf`;
    const sourceId = `job-perf-source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const layer = "PERF";
    const singlePlateSegments = buildPerforationSegments({
      plateWidth,
      plateHeight,
      holeType: perfHoleType,
      patternType: perfPatternType,
      spacingMode: perfSpacingMode,
      pitch: Math.max(0, Number(perfPitchMm) || 0),
      web: Math.max(0, Number(perfWebMm) || 0),
      holeSize: Math.max(0, Number(perfHoleSizeMm) || 0),
      slotLength: Math.max(0, Number(perfSlotLengthMm) || 0),
      slotWidth: Math.max(0, Number(perfSlotWidthMm) || 0),
      borderX: Math.max(0, Number(perfBorderXMm) || 0),
      borderY: Math.max(0, Number(perfBorderYMm) || 0),
      layer,
      entityPrefix: `${sourceId}-template`,
      offsetX: 0,
      offsetY: 0
    });
    const segments: DxfSegment[] = [];

    for (let i = 0; i < quantity; i += 1) {
      appendDxfSegments(
        segments,
        buildPerforationSegments({
          plateWidth,
          plateHeight,
          holeType: perfHoleType,
          patternType: perfPatternType,
          spacingMode: perfSpacingMode,
          pitch: Math.max(0, Number(perfPitchMm) || 0),
          web: Math.max(0, Number(perfWebMm) || 0),
          holeSize: Math.max(0, Number(perfHoleSizeMm) || 0),
          slotLength: Math.max(0, Number(perfSlotLengthMm) || 0),
          slotWidth: Math.max(0, Number(perfSlotWidthMm) || 0),
          borderX: Math.max(0, Number(perfBorderXMm) || 0),
          borderY: Math.max(0, Number(perfBorderYMm) || 0),
          layer,
          entityPrefix: `${sourceId}-inst-${i + 1}`,
          offsetX: i * (plateWidth + spacing),
          offsetY: 0
        })
      );
    }

    const sourceEntry: JobDxfSourceFile = {
      id: sourceId,
      fileName,
      segments,
      layers: [layer],
      parts: [],
      fixedParts: [
        createGeneratedJobDxfPartPreview({
          fileIdPrefix: sourceId,
          fileName,
          layer,
          quantity,
          widthMm: plateWidth,
          heightMm: plateHeight,
          segments: singlePlateSegments
        })
      ],
      previewDataUrl: createSegmentThumbnailDataUrl(segments, 140, "#0b1220", "#67e8f9")
    };
    const nextSourceFiles = [...jobDxfSourceFiles, sourceEntry];
    const nextSegments = nextSourceFiles.flatMap((source) => source.segments);
    const nextLayers = Array.from(new Set(nextSegments.map((segment) => segment.layer))).sort((a, b) => a.localeCompare(b));
    const nextSelectedLayers = Array.from(new Set([...jobDxfSelectedLayers, layer])).sort((a, b) => a.localeCompare(b));

    setJobDxfFileName(nextSourceFiles.length === 1 ? fileName : "DXF Import");
    setJobDxfSegments(nextSegments);
    setJobDxfLayers(nextLayers);
    setJobDxfSelectedLayers(nextSelectedLayers);
    rebuildJobDxfFromSourceFiles(nextSourceFiles, nextSelectedLayers, true);
    setJobDxfSelectedPartIds((current) => Array.from(new Set([...current, `${sourceId}-part-1`])));
    setJobDxfStatus(
      `Added perforated plate (${plateWidth} x ${plateHeight} mm, qty ${quantity}, ${perfHoleType}, ${perfPatternType}).`
    );
  }

  async function exportPerforationDxf() {
    try {
      if (perforationPreview.error) {
        setJobDxfStatus(perforationPreview.error);
        return;
      }
      if (!perforationPreview.segments.length) {
        setJobDxfStatus("Perforation preview is empty.");
        return;
      }

      const quantity = Math.max(1, Math.round(Number(perfQuantity) || 1));
      const plateWidth = Math.max(1, Number(perfPlateWidthMm) || 0);
      const plateHeight = Math.max(1, Number(perfPlateHeightMm) || 0);
      const spacing = Math.max(20, Math.round(Math.max(plateWidth, plateHeight) * 0.2));
      const partName = perfPartName.trim() || `perforated-${perfHoleType}-${Date.now()}`;
      const layer = "PERF";
      const segments: DxfSegment[] = [];

      for (let i = 0; i < quantity; i += 1) {
        appendDxfSegments(
          segments,
          buildPerforationSegments({
            plateWidth,
            plateHeight,
            holeType: perfHoleType,
            patternType: perfPatternType,
            spacingMode: perfSpacingMode,
            pitch: Math.max(0, Number(perfPitchMm) || 0),
            web: Math.max(0, Number(perfWebMm) || 0),
            holeSize: Math.max(0, Number(perfHoleSizeMm) || 0),
            slotLength: Math.max(0, Number(perfSlotLengthMm) || 0),
            slotWidth: Math.max(0, Number(perfSlotWidthMm) || 0),
            borderX: Math.max(0, Number(perfBorderXMm) || 0),
            borderY: Math.max(0, Number(perfBorderYMm) || 0),
            layer,
            entityPrefix: `perf-export-${i + 1}`,
            offsetX: i * (plateWidth + spacing),
            offsetY: 0
          })
        );
      }

      if (!segments.length) {
        setJobDxfStatus("Could not build perforation DXF.");
        return;
      }

      const dxf = buildDxfFromSegments(segments);
      const result = await window.desktopShell?.saveDxfFile?.({
        defaultFileName: `${partName}.dxf`,
        contentText: dxf
      });

      if (!result) {
        const blob = new Blob([dxf], { type: "application/dxf;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${partName}.dxf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setJobDxfStatus(`Exported perforation DXF: ${partName}.dxf`);
        return;
      }
      if (!result.ok) {
        if (!result.canceled) {
          setJobDxfStatus(result.error ?? "Failed to export perforation DXF.");
        }
        return;
      }
      setJobDxfStatus(
        result.autoSavedToOneDrive
          ? `Exported perforation DXF to OneDrive: ${result.filePath}.`
          : `Exported perforation DXF to ${result.filePath}.`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setJobDxfStatus(`Failed to export perforation DXF. ${detail}`);
    }
  }

  async function exportSelectedJobDxfAsCutDxf() {
    const selectedParts = jobDxfParts.filter((part) => jobDxfSelectedPartIds.includes(part.id));
    if (!selectedParts.length) {
      setJobDxfStatus("Select one or more parts to export as DXF.");
      return;
    }

    const arrangedSegments: DxfSegment[] = [];
    const gap = 20;
    const rowLimit = 3000;
    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;

    for (const part of selectedParts) {
      const fallback = createRectangleSegments(
        Math.max(1, part.widthMm),
        Math.max(1, part.heightMm),
        part.layer || "PARTS",
        `${part.id}-fallback`
      );
      const source = part.sourceSegments && part.sourceSegments.length ? part.sourceSegments : fallback;
      const bounds = getDxfBounds(source);
      if (!bounds) continue;
      const width = Math.max(1, bounds.maxX - bounds.minX);
      const height = Math.max(1, bounds.maxY - bounds.minY);

      const quantity = Math.max(1, Math.round(part.quantity || 0));
      for (let instance = 0; instance < quantity; instance += 1) {
        if (cursorX + width > rowLimit) {
          cursorX = 0;
          cursorY += rowHeight + gap;
          rowHeight = 0;
        }
        const dx = cursorX - bounds.minX;
        const dy = cursorY - bounds.minY;
        source.forEach((segment, index) => {
          arrangedSegments.push({
            x1: segment.x1 + dx,
            y1: segment.y1 + dy,
            x2: segment.x2 + dx,
            y2: segment.y2 + dy,
            layer: segment.layer || "PARTS",
            entityId: `${part.id}-inst-${instance + 1}-${index + 1}`
          });
        });
        cursorX += width + gap;
        rowHeight = Math.max(rowHeight, height);
      }
    }

    if (!arrangedSegments.length) {
      setJobDxfStatus("Could not build DXF from selected parts.");
      return;
    }

    const dxf = buildDxfFromSegments(arrangedSegments);
    const fileBase = selectedJob?.jobNumber ?? "job-card";
    const result = await window.desktopShell?.saveDxfFile?.({
      defaultFileName: `${fileBase}-cut-layout.dxf`,
      contentText: dxf
    });
    if (!result) {
      const blob = new Blob([dxf], { type: "application/dxf;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileBase}-cut-layout.dxf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setJobDxfStatus(`Exported cut DXF with ${selectedParts.length} selected part type${selectedParts.length === 1 ? "" : "s"}.`);
      return;
    }
    if (!result.ok) {
      if (!result.canceled) {
        setJobDxfStatus(result.error ?? "Failed to export cut DXF.");
      }
      return;
    }
    setJobDxfStatus(
      result.autoSavedToOneDrive
        ? `Exported cut DXF to OneDrive: ${result.filePath}.`
        : `Exported cut DXF to ${result.filePath}.`
    );
  }

  function toggleJobDxfLayer(layer: string) {
    setJobDxfSelectedLayers((layers) =>
      layers.includes(layer) ? layers.filter((entry) => entry !== layer) : [...layers, layer]
    );
  }

  function updateJobDxfPartQuantity(partId: string, quantity: number) {
    setJobDxfParts((parts) =>
      parts.map((part) => (part.id === partId ? { ...part, quantity: Math.max(0, Math.round(quantity || 0)) } : part))
    );
    setJobDxfSourceFiles((files) =>
      files.map((file) => ({
        ...file,
        parts: file.parts.map((part) =>
          part.id === partId ? { ...part, quantity: Math.max(0, Math.round(quantity || 0)) } : part
        )
      }))
    );
  }

  function updateJobDxfPartMeta(partId: string, updates: Partial<Pick<JobDxfPartPreview, "material" | "thicknessMm">>) {
    setJobDxfParts((parts) =>
      parts.map((part) =>
        part.id === partId
          ? {
              ...part,
              material: updates.material ?? part.material ?? "Mild Steel",
              thicknessMm:
                updates.thicknessMm !== undefined
                  ? normalizeJobDxfThickness(updates.thicknessMm)
                  : normalizeJobDxfThickness(part.thicknessMm)
            }
          : part
      )
    );
    setJobDxfSourceFiles((files) =>
      files.map((file) => ({
        ...file,
        parts: file.parts.map((part) =>
          part.id === partId
            ? {
                ...part,
                material: updates.material ?? part.material ?? "Mild Steel",
                thicknessMm:
                  updates.thicknessMm !== undefined
                    ? normalizeJobDxfThickness(updates.thicknessMm)
                    : normalizeJobDxfThickness(part.thicknessMm)
              }
            : part
        )
      }))
    );
  }

  function toggleJobDxfPartSelected(partId: string) {
    setJobDxfSelectedPartIds((selected) =>
      selected.includes(partId) ? selected.filter((id) => id !== partId) : [...selected, partId]
    );
  }

  function toggleSelectAllJobDxfParts() {
    setJobDxfSelectedPartIds((selected) =>
      selected.length === jobDxfParts.length ? [] : jobDxfParts.map((part) => part.id)
    );
  }

  function deleteSelectedJobDxfParts() {
    if (!jobDxfSelectedPartIds.length) {
      setJobDxfStatus("Select one or more parts to delete.");
      return;
    }
    setJobDxfParts((parts) => parts.filter((part) => !jobDxfSelectedPartIds.includes(part.id)));
    setJobDxfSourceFiles((files) =>
      files.map((file) => ({
        ...file,
        parts: file.parts.filter((part) => !jobDxfSelectedPartIds.includes(part.id))
      }))
    );
    setJobDxfSelectedPartIds([]);
    setJobDxfStatus("Selected parts deleted.");
  }

  async function saveJobDxfParts() {
    if (!workspaceId) return;
    if (!selectedJobId) {
      setJobDxfStatus("Select a job card first so DXF parts can be assigned.");
      return;
    }
    setJobDxfSaving(true);
    try {
      const payloadParts = jobDxfParts.map((part) => ({
        id: part.id,
        name: part.name,
        partCode: part.partCode,
        partDnaId: part.partDnaId,
        geometryHash: part.geometryHash,
        softHash: part.softHash,
        layer: part.layer,
        material: part.material ?? "Mild Steel",
        thicknessMm: normalizeJobDxfThickness(part.thicknessMm),
        quantity: Math.max(0, Math.round(part.quantity || 0)),
        widthMm: part.widthMm,
        heightMm: part.heightMm,
        cutLengthMm: part.cutLengthMm,
        pierceCount: part.pierceCount,
        segmentCount: part.segmentCount,
        thumbnailDataUrl: part.thumbnailDataUrl,
        printDataUrl: part.printDataUrl,
        sourceSegments: part.sourceSegments,
        sourceBounds: part.sourceBounds
      }));
      const res = await apiFetch(`/api/workspaces/${workspaceId}/jobs/${selectedJobId}`, {
        method: "PATCH",
        body: JSON.stringify({ jobDxfParts: payloadParts })
      });
      if (!res.ok) {
        const errorPayload = (await res.json().catch(() => null)) as { error?: string } | null;
        setJobDxfStatus(errorPayload?.error ?? "Failed to save job DXF parts.");
        return;
      }
      setJobDxfStatus("Job DXF parts saved.");
      await refreshJobs();
    } finally {
      setJobDxfSaving(false);
    }
  }

  function clearJobDxfReader() {
    setJobDxfFileName("");
    setJobDxfSegments([]);
    setJobDxfLayers([]);
    setJobDxfSelectedLayers([]);
    setJobDxfPreviewDataUrl(undefined);
    setJobDxfParts([]);
    setJobDxfSourceFiles([]);
    setJobDxfSelectedPartIds([]);
    setJobDxfStatus("Cleared Job DXF reader.");
  }

  async function uploadQuotePartDxf(index: number, file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".dxf")) {
      window.alert("Please upload a .dxf file.");
      return;
    }
    try {
      const raw = await readDxfText(file);
      const segments = parseDxfSegments(raw);
      const thumbnailDataUrl = createSegmentThumbnailDataUrl(segments);
      if (!thumbnailDataUrl || !segments.length) {
        window.alert("Could not generate a thumbnail from this DXF.");
        return;
      }
      const components = groupComponentsByDrawingIslands(
        mergeContainedComponents(
          mergeComponentsByProximity(splitSegmentsIntoParts(segments), Math.max(0, Number(dxfMergeToleranceMm) || 0))
        )
      );
      const primary = components[0] ?? segments;
      const bounds = getDxfBounds(primary);
      const cutLengthMm = Math.round(primary.reduce((sum, seg) => sum + segmentLength(seg), 0));
      const pierceCount = estimatePierceCount(primary);
      setQuoteParts((parts) =>
        parts.map((part, i) =>
          i === index
            ? {
                ...part,
                dxfName: file.name,
                thumbnailDataUrl,
                cutLengthMm: cutLengthMm || part.cutLengthMm,
                pierceCount: pierceCount || part.pierceCount,
                lengthMm: part.lengthMm > 0 ? part.lengthMm : Math.max(1, Math.round((bounds?.maxX ?? 0) - (bounds?.minX ?? 0))),
                widthMm: part.widthMm > 0 ? part.widthMm : Math.max(1, Math.round((bounds?.maxY ?? 0) - (bounds?.minY ?? 0)))
              }
            : part
        )
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      window.alert(`Failed to read DXF file. ${detail}`);
    }
  }

  async function uploadQuotePartDxfFromDesktopPicker(index: number) {
    if (!window.desktopShell?.pickFile) {
      window.alert("Desktop picker unavailable. Use file upload.");
      return;
    }
    try {
      const result = await window.desktopShell.pickFile({ title: "Select DXF file", extensions: ["dxf"] });
      if (!result.ok) {
        if (!result.canceled) window.alert(`DXF import failed. ${result.error ?? "Unknown error"}`);
        return;
      }
      const file = new File([decodeBase64ToArrayBuffer(result.contentBase64)], result.fileName, { type: "application/dxf" });
      await uploadQuotePartDxf(index, file);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      window.alert(`Failed to read DXF file. ${detail}`);
    }
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
    const thicknessMm = normalizeJobDxfThickness(Number(newThicknessMm));
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
    const thicknessMm = normalizeJobDxfThickness(Number(quickPartThickness));
    const quantity = Math.max(1, Number(quickPartQuantity) || 1);
    setQuoteParts((parts) => [
      ...parts,
      {
        name,
        dxfName: undefined,
        thumbnailDataUrl: undefined,
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
        thicknessMm: JOB_DXF_THICKNESS_OPTIONS[0],
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
    setPunchParts((parts) =>
      parts.map((part, i) =>
        i === index
          ? {
              ...part,
              ...next,
              thicknessMm:
                next.thicknessMm !== undefined
                  ? normalizeJobDxfThickness(next.thicknessMm)
                  : normalizeJobDxfThickness(part.thicknessMm)
            }
          : part
      )
    );
  }

  function removePunchPart(index: number) {
    setPunchParts((parts) => parts.filter((_part, i) => i !== index));
  }

  function addWeldPart() {
    setWeldParts((parts) => [
      ...parts,
      {
        name: `Weld ${parts.length + 1}`,
        weldLengthMm: 0,
        thicknessMm: JOB_DXF_THICKNESS_OPTIONS[0],
        material: materials[0]?.name ?? "Mild Steel",
        quantity: 1,
        pricePerMeter: 0
      }
    ]);
  }

  function updateWeldPart(index: number, next: Partial<(typeof weldParts)[number]>) {
    setWeldParts((parts) =>
      parts.map((part, i) =>
        i === index
          ? {
              ...part,
              ...next,
              thicknessMm:
                next.thicknessMm !== undefined
                  ? normalizeJobDxfThickness(next.thicknessMm)
                  : normalizeJobDxfThickness(part.thicknessMm)
            }
          : part
      )
    );
  }

  function removeWeldPart(index: number) {
    setWeldParts((parts) => parts.filter((_part, i) => i !== index));
  }

  function addWeldingRate() {
    const material = newWeldingRateMaterial;
    const thicknessMm = normalizeJobDxfThickness(Number(newWeldingRateThickness));
    const pricePerMeter = Number(newWeldingRatePrice);
    if (!material) return;
    if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) return;
    if (!Number.isFinite(pricePerMeter) || pricePerMeter <= 0) return;
    setWeldingRates((list) => {
      const existing = list.find(
        (rate) => rate.material === material && rate.thicknessMm === thicknessMm
      );
      if (existing) {
        return list.map((rate) =>
          rate.material === material && rate.thicknessMm === thicknessMm
            ? { ...rate, pricePerMeter }
            : rate
        );
      }
      return [...list, { material, thicknessMm, pricePerMeter }].sort((a, b) =>
        a.material === b.material
          ? a.thicknessMm - b.thicknessMm
          : a.material.localeCompare(b.material)
      );
    });
    setNewWeldingRateThickness("");
    setNewWeldingRatePrice("");
  }

  function addBendPart() {
    setBendParts((parts) => [
      ...parts,
      {
        name: `Bend ${parts.length + 1}`,
        bendLengthMm: 0,
        thicknessMm: JOB_DXF_THICKNESS_OPTIONS[0],
        material: materials[0]?.name ?? "Mild Steel",
        quantity: 1,
        bendCount: 1,
        shortPricePerBend: 0,
        longPricePerBend: 0
      }
    ]);
  }

  function updateBendPart(index: number, next: Partial<(typeof bendParts)[number]>) {
    setBendParts((parts) =>
      parts.map((part, i) =>
        i === index
          ? {
              ...part,
              ...next,
              thicknessMm:
                next.thicknessMm !== undefined
                  ? normalizeJobDxfThickness(next.thicknessMm)
                  : normalizeJobDxfThickness(part.thicknessMm)
            }
          : part
      )
    );
  }

  function removeBendPart(index: number) {
    setBendParts((parts) => parts.filter((_part, i) => i !== index));
  }

  function addBendingRate() {
    const material = newBendingRateMaterial;
    const thicknessMm = normalizeJobDxfThickness(Number(newBendingRateThickness));
    const shortPricePerBend = Number(newBendingShortPrice);
    const longPricePerBend = Number(newBendingLongPrice);
    if (!material) return;
    if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) return;
    if (!Number.isFinite(shortPricePerBend) || shortPricePerBend < 0) return;
    if (!Number.isFinite(longPricePerBend) || longPricePerBend < 0) return;
    setBendingRates((list) => {
      const existing = list.find(
        (rate) => rate.material === material && rate.thicknessMm === thicknessMm
      );
      if (existing) {
        return list.map((rate) =>
          rate.material === material && rate.thicknessMm === thicknessMm
            ? { ...rate, shortPricePerBend, longPricePerBend }
            : rate
        );
      }
      return [...list, { material, thicknessMm, shortPricePerBend, longPricePerBend }].sort((a, b) =>
        a.material === b.material
          ? a.thicknessMm - b.thicknessMm
          : a.material.localeCompare(b.material)
      );
    });
    setNewBendingRateThickness("");
    setNewBendingShortPrice("");
    setNewBendingLongPrice("");
  }

  function addRollingPart() {
    setRollingParts((parts) => [
      ...parts,
      {
        name: `Rolling ${parts.length + 1}`,
        diameterMm: 0,
        heightMm: 0,
        rollingLengthMm: 0,
        thicknessMm: JOB_DXF_THICKNESS_OPTIONS[0],
        material: materials[0]?.name ?? "Mild Steel",
        quantity: 1,
        pricePerMeter: 0
      }
    ]);
  }

  function updateRollingPart(index: number, next: Partial<(typeof rollingParts)[number]>) {
    setRollingParts((parts) =>
      parts.map((part, i) =>
        i === index
          ? {
              ...part,
              ...next,
              thicknessMm:
                next.thicknessMm !== undefined
                  ? normalizeJobDxfThickness(next.thicknessMm)
                  : normalizeJobDxfThickness(part.thicknessMm)
            }
          : part
      )
    );
  }

  function removeRollingPart(index: number) {
    setRollingParts((parts) => parts.filter((_part, i) => i !== index));
  }

  function addRollingRate() {
    const material = newRollingRateMaterial;
    const thicknessMm = normalizeJobDxfThickness(Number(newRollingRateThickness));
    const pricePerMeter = Number(newRollingRatePrice);
    if (!material) return;
    if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) return;
    if (!Number.isFinite(pricePerMeter) || pricePerMeter <= 0) return;
    setRollingRates((list) => {
      const existing = list.find(
        (rate) => rate.material === material && rate.thicknessMm === thicknessMm
      );
      if (existing) {
        return list.map((rate) =>
          rate.material === material && rate.thicknessMm === thicknessMm
            ? { ...rate, pricePerMeter }
            : rate
        );
      }
      return [...list, { material, thicknessMm, pricePerMeter }].sort((a, b) =>
        a.material === b.material
          ? a.thicknessMm - b.thicknessMm
          : a.material.localeCompare(b.material)
      );
    });
    setNewRollingRateThickness("");
    setNewRollingRatePrice("");
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
          dxfName: copiedPart.dxfName,
          thumbnailDataUrl: copiedPart.thumbnailDataUrl,
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
    if (!workspaceId) return false;
    if (!quoteTitle.trim()) {
      alert("Quote title is required.");
      return false;
    }
    if (!quoteCustomerId) {
      alert("Select a customer from the list.");
      return false;
    }

    const validLaserParts = calculatedParts.filter(
      (part) =>
        part.name.trim().length > 0 &&
        part.lengthMm > 0 &&
        part.widthMm > 0 &&
        part.thicknessMm > 0 &&
        part.quantity > 0
    );
    const invalidLaserParts = calculatedParts.filter(
      (part) =>
        part.name.trim().length === 0 ||
        part.lengthMm <= 0 ||
        part.widthMm <= 0 ||
        part.thicknessMm <= 0 ||
        part.quantity <= 0
    );
    if (invalidLaserParts.length > 0) {
      alert("Some laser calculator rows are incomplete. Fill in name, size, thickness, and quantity.");
      return false;
    }

    const laserCutTotalMm = validLaserParts.reduce((sum, part) => sum + (part.cutLengthMm || 0) * part.quantity, 0);
    const laserPierceTotal = validLaserParts.reduce((sum, part) => sum + (part.pierceCount || 0) * part.quantity, 0);
    const laserBendTotal = validLaserParts.reduce((sum, part) => sum + (part.bendCount || 0) * part.quantity, 0);
    const laserWeightTotal = validLaserParts.reduce((sum, part) => sum + (part.weightKg || 0) * part.quantity, 0);

    const punchingRows = punchCalculatedParts.filter(
      (part) =>
        part.name.trim().length > 0 &&
        part.lengthMm > 0 &&
        part.widthMm > 0 &&
        part.thicknessMm > 0 &&
        part.quantity > 0
    );
    const weldingRows = weldCalculatedParts.filter(
      (part) =>
        part.name.trim().length > 0 &&
        part.weldLengthMm > 0 &&
        part.thicknessMm > 0 &&
        part.quantity > 0 &&
        part.effectiveRate > 0
    );
    const bendingRows = bendCalculatedParts.filter(
      (part) =>
        part.name.trim().length > 0 &&
        part.bendLengthMm > 0 &&
        part.thicknessMm > 0 &&
        part.quantity > 0 &&
        part.bendCount > 0 &&
        part.effectivePricePerBend > 0
    );
    const rollingRows = rollingCalculatedParts.filter(
      (part) =>
        part.name.trim().length > 0 &&
        part.effectiveRollingLengthMm > 0 &&
        part.thicknessMm > 0 &&
        part.quantity > 0 &&
        part.effectiveRate > 0
    );

    const manualLaserAmount = Number(quoteLaserCuttingAmount) || 0;
    const manualPunchAmount = Number(quotePunchingAmount) || 0;
    const manualFabricationAmount = Number(quoteFabricationAmount) || 0;
    const manualWeldingAmount = 0;
    const manualTankAmount = Number(quoteTankManufacturingAmount) || 0;
    const manualBendingAmount = 0;
    const manualRollingAmount = 0;

    const laserAmount = validLaserParts.length > 0 ? laserTotal : manualLaserAmount;
    const punchingAmount = punchingRows.length > 0 ? punchPartsFinal : manualPunchAmount;
    const weldingAmount = weldingRows.length > 0 ? weldingTotal : manualWeldingAmount;
    const bendingAmount = bendingRows.length > 0 ? bendingTotal : manualBendingAmount;
    const rollingAmount = rollingRows.length > 0 ? rollingTotal : manualRollingAmount;

    const hasAnyAmount =
      laserAmount > 0 ||
      punchingAmount > 0 ||
      weldingAmount > 0 ||
      manualFabricationAmount > 0 ||
      manualTankAmount > 0 ||
      bendingAmount > 0 ||
      rollingAmount > 0;
    if (!hasAnyAmount) {
      alert("Add calculator data or enter at least one section amount before creating a quote.");
      return false;
    }

    const laserSummary = validLaserParts.length
      ? `Auto from calculator: ${validLaserParts.length} parts, cut ${Math.round(
          laserCutTotalMm
        )} mm, pierces ${laserPierceTotal}, bends ${laserBendTotal}, weight ${laserWeightTotal.toFixed(2)} kg.`
      : "";
    const punchSummary = punchingRows.length
      ? `Auto from calculator: ${punchingRows.length} parts, weight ${punchPartsWeight.toFixed(2)} kg, VAT ${parsedVatRate.toFixed(
          2
        )}%.`
      : "";
    const weldingSummary = weldingRows.length
      ? `Auto from calculator: ${weldingRows.length} weld items, total length ${weldingTotalMeters.toFixed(
          2
        )} m, VAT ${parsedVatRate.toFixed(2)}%.`
      : "";
    const bendingSummary = bendingRows.length
      ? `Auto from calculator: ${bendingRows.length} bend items, total bends ${bendingTotalBends.toFixed(
          0
        )}, VAT ${parsedVatRate.toFixed(2)}%.`
      : "";
    const rollingSummary = rollingRows.length
      ? `Auto from calculator: ${rollingRows.length} rolling items, total length ${rollingTotalMeters.toFixed(2)} m, plate area ${rollingTotalAreaSqm.toFixed(3)} m², weight ${rollingTotalWeightKg.toFixed(2)} kg, VAT ${parsedVatRate.toFixed(2)}%.`
      : "";

    const sections = {
      laserCutting: {
        description: [quoteLaserCutting.trim(), laserSummary].filter(Boolean).join(" "),
        amount: laserAmount,
        parts: validLaserParts,
        vatRate: parsedVatRate,
        totals: validLaserParts.length > 0 ? { subTotal: laserSubTotal, vat: laserVat, total: laserTotal } : undefined
      },
      punching: {
        description: [quotePunching.trim(), punchSummary].filter(Boolean).join(" "),
        amount: punchingAmount
      },
      fabrication: { description: quoteFabrication.trim(), amount: manualFabricationAmount },
      laserWelding: { description: [quoteLaserWelding.trim(), weldingSummary].filter(Boolean).join(" "), amount: weldingAmount },
      tankManufacturing: {
        description: quoteTankManufacturing.trim(),
        amount: manualTankAmount
      },
      bending: { description: [quoteBending.trim(), bendingSummary].filter(Boolean).join(" "), amount: bendingAmount },
      rolling: { description: [quoteRolling.trim(), rollingSummary].filter(Boolean).join(" "), amount: rollingAmount }
    };
    const res = await apiFetch(`/api/workspaces/${workspaceId}/quotes`, {
      method: "POST",
      body: JSON.stringify({
        title: quoteTitle.trim(),
        customerName: selectedQuoteCustomer?.name ?? "",
        customerDetails: {
          contactName: selectedQuoteCustomer?.name ?? "",
          email: selectedQuoteCustomer?.email ?? "",
          phone: selectedQuoteCustomer?.phone ?? "",
          address: selectedQuoteCustomer?.address ?? selectedQuoteCustomer?.notes ?? ""
        },
        sections,
        companyName: quoteCompanyName.trim(),
        companyDetails: {
          email: quoteCompanyEmail.trim(),
          phone: quoteCompanyPhone.trim(),
          address: quoteCompanyAddress.trim(),
          vatNumber: quoteCompanyVatNumber.trim(),
          registrationNumber: quoteCompanyRegistrationNumber.trim(),
          accentColor: quoteAccentColor
        },
        logoDataUrl: quoteLogoDataUrl
      })
    });
    if (!res.ok) {
      const errorPayload = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
      const message = errorPayload?.details
        ? `${errorPayload.error ?? "Failed to create quote"}: ${errorPayload.details}`
        : (errorPayload?.error ?? "Failed to create quote");
      alert(message);
      return false;
    }
    setQuoteTitle("");
    setQuoteCustomerId("");
    setQuoteLaserCutting("");
    setQuoteLaserCuttingAmount("");
    setQuotePunching("");
    setQuotePunchingAmount("");
    setQuoteFabrication("");
    setQuoteFabricationAmount("");
    setQuoteLaserWelding("");
    setQuoteTankManufacturing("");
    setQuoteTankManufacturingAmount("");
    setQuoteBending("");
    setQuoteParts([]);
    setWeldParts([]);
    setBendParts([]);
    await refreshQuotes();
    void pushCloudEvent("quote_created", {
      title: quoteTitle.trim(),
      customerName: selectedQuoteCustomer?.name ?? "",
      total: quoteGrandTotal
    });
    return true;
  }

  async function runSimpleAiCommand(raw: string) {
    const prompt = raw.trim();
    const lower = prompt.toLowerCase();
    if (!prompt) return "Type a question or command.";

    if (lower.includes("create quote and job") || (lower.includes("create quote") && lower.includes("create job"))) {
      setViewMode("quotes");
      setQuotesPage("calculator");
      const quoteOk = await createQuote();
      if (!quoteOk) return "Quote was not created. Check required fields in Quotes.";
      setViewMode("jobs");
      setJobsPage("create_job");
      const jobOk = await createJob({ title: quoteTitle || "AI Job", customerName: selectedQuoteCustomer?.name ?? jobCustomer });
      return jobOk ? "Created quote and job." : "Quote created, but job was not created.";
    }

    if (lower.includes("create quote")) {
      setViewMode("quotes");
      setQuotesPage("calculator");
      const ok = await createQuote();
      return ok ? "Quote created." : "Quote was not created. Check required fields in Quotes.";
    }

    if (lower.includes("create job")) {
      setViewMode("jobs");
      setJobsPage("create_job");
      const ok = await createJob({ title: quoteTitle || jobTitle || "AI Job", customerName: selectedQuoteCustomer?.name ?? jobCustomer });
      return ok ? "Job created." : "Job was not created. Check Create Job fields.";
    }

    if (lower.includes("send email")) {
      setViewMode("email");
      const ok = await sendEmailMessage();
      return ok ? "Email sent." : "Email was not sent. Check To/Subject/Message and email settings.";
    }

    if (lower.includes("open quotes")) {
      setViewMode("quotes");
      setQuotesPage("calculator");
      return "Opened Quotes.";
    }
    if (lower.includes("open jobs")) {
      setViewMode("jobs");
      setJobsPage("create_job");
      return "Opened Jobs.";
    }
    if (lower.includes("open email")) {
      setViewMode("email");
      return "Opened Email.";
    }
    if (lower.includes("open dxf")) {
      setViewMode("quotes");
      setQuotesPage("dxf_reader");
      return "Opened DXF Reader.";
    }

    if (lower.includes("status")) {
      const quoted = quotes.filter((quote) => quote.status === "draft" || quote.status === "sent").length;
      const approved = quotes.filter((quote) => quote.status === "accepted").length;
      const openJobs = jobs.filter((job) => job.status === "open").length;
      const inProgress = jobs.filter((job) => job.status === "in_progress").length;
      return `Status: quoted ${quoted}, approved ${approved}, open jobs ${openJobs}, in-progress jobs ${inProgress}.`;
    }

    return "I can answer and run actions. Try: create quote, create job, create quote and job, send email, open quotes/jobs/email/dxf, status.";
  }

  async function submitSimpleAiPrompt() {
    const prompt = aiChatInput.trim();
    if (!prompt || aiChatBusy) return;
    setAiChatMessages((current) => [...current, { role: "user", text: prompt, at: new Date().toISOString() }]);
    setAiChatInput("");
    setAiChatBusy(true);
    try {
      const reply = await runSimpleAiCommand(prompt);
      setAiChatMessages((current) => [...current, { role: "assistant", text: reply, at: new Date().toISOString() }]);
    } catch (error) {
      setAiChatMessages((current) => [
        ...current,
        { role: "assistant", text: error instanceof Error ? error.message : "Action failed.", at: new Date().toISOString() }
      ]);
    } finally {
      setAiChatBusy(false);
    }
  }

  async function saveEmailSettings() {
    if (!workspaceId) return;
    setEmailSettingsSaving(true);
    setEmailStatus(null);
    try {
      const payload = {
        smtpHost: emailSettings.smtpHost.trim(),
        smtpPort: Number(emailSettings.smtpPort) || 587,
        smtpSecure: Boolean(emailSettings.smtpSecure),
        smtpUser: emailSettings.smtpUser.trim(),
        smtpPass: emailSettings.smtpPass,
        imapHost: emailSettings.imapHost.trim(),
        imapPort: Number(emailSettings.imapPort) || 993,
        imapSecure: Boolean(emailSettings.imapSecure),
        imapUser: emailSettings.imapUser.trim(),
        imapPass: emailSettings.imapPass,
        fromName: emailSettings.fromName.trim(),
        fromEmail: emailSettings.fromEmail.trim(),
        autoNotifyJobDone: Boolean(emailSettings.autoNotifyJobDone)
      };
      const res = await apiFetch(`/api/workspaces/${workspaceId}/email/settings`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; emailSettings?: EmailSettingsRecord }
        | null;
      if (!res.ok) {
        setEmailStatus(data?.error ?? "Failed to save email settings.");
        return;
      }
      if (data?.emailSettings) {
        setEmailSettings((current) => ({ ...current, ...data.emailSettings }));
      }
      setEmailStatus("Email settings saved.");
      if (viewMode === "email") {
        void refreshInboxEmails();
      }
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Failed to save email settings.");
    } finally {
      setEmailSettingsSaving(false);
    }
  }

  function applyGmailEmailPreset() {
    setEmailSettings((current) => {
      const accountEmail = current.fromEmail.trim() || current.smtpUser.trim() || current.imapUser.trim();
      return {
        ...current,
        ...GMAIL_EMAIL_PRESET,
        smtpUser: accountEmail || current.smtpUser,
        imapUser: accountEmail || current.imapUser,
        fromEmail: accountEmail || current.fromEmail,
        imapPass: current.imapPass || current.smtpPass
      };
    });
    setEmailStatus("Gmail settings filled. Enter your Gmail address and Gmail app password, then Save or Link Inbox.");
    setEmailImapLinkStatus("Gmail uses an app password. In Google Account, enable 2-Step Verification, create an App password, and paste it into both password fields.");
  }

  async function linkInboxWithImapSettings() {
    if (!workspaceId) return;
    setEmailLinkingInbox(true);
    setEmailImapLinkStatus(null);
    try {
      await saveEmailSettings();
      const testRes = await apiFetch(`/api/workspaces/${workspaceId}/email/test-imap`, { method: "POST" });
      const testData = (await testRes.json().catch(() => null)) as
        | { error?: string; details?: string; messageCount?: number; latestSubject?: string | null }
        | null;
      if (!testRes.ok) {
        const message = testData?.details
          ? `${testData.error ?? "Inbox link failed"}: ${testData.details}`
          : (testData?.error ?? "Inbox link failed");
        setEmailStatus(message);
        setEmailImapLinkStatus(message);
        return;
      }
      setSelectedOutlookFolder("inbox");
      setSelectedOutlookFilter("all");
      setInboxSearch("");
      setInboxTab("focused");
      setViewMode("email");
      await refreshInboxEmails();
      const successMessage = `IMAP inbox linked. ${testData?.messageCount ?? 0} recent email${testData?.messageCount === 1 ? "" : "s"} found${testData?.latestSubject ? ` · Latest: ${testData.latestSubject}` : ""}.`;
      setEmailStatus(successMessage);
      setEmailImapLinkStatus(successMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to link inbox with IMAP.";
      setEmailStatus(message);
      setEmailImapLinkStatus(message);
    } finally {
      setEmailLinkingInbox(false);
    }
  }

  async function detectEmailContentFromSource(payload: { fromEmail: string; subject: string; body: string }) {
    if (!workspaceId) return null;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/email/detect`, {
        method: "POST",
        body: JSON.stringify({
          fromEmail: payload.fromEmail,
          subject: payload.subject,
          body: payload.body
        })
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; detection?: EmailDetectionResult }
        | null;
      if (!res.ok) {
        return null;
      }
      return data?.detection ?? null;
    } catch {
      return null;
    }
  }

  async function detectEmailContent(override?: { fromEmail?: string; subject?: string; body?: string; silent?: boolean }) {
    if (!workspaceId) return null;
    setEmailDetecting(true);
    if (!override?.silent) setEmailStatus(null);
    setEmailDetection(null);
    setEmailDetectionUpdatedAt(null);
    try {
      const fromEmail = (override?.fromEmail ?? emailFromInput).trim();
      const subject = (override?.subject ?? emailSubjectInput).trim();
      const body = (override?.body ?? emailBodyInput).trim();
      const detection = await detectEmailContentFromSource({ fromEmail, subject, body });
      setEmailDetection(detection);
      setEmailDetectionUpdatedAt(new Date().toISOString());
      if (!override?.silent) setEmailStatus(detection ? "Email analyzed." : "No quote/PO detected.");
      return detection;
    } catch (error) {
      if (!override?.silent) setEmailStatus(error instanceof Error ? error.message : "Failed to detect email content.");
      return null;
    } finally {
      setEmailDetecting(false);
    }
  }

  async function fetchInboxAttachmentPayload(uid: number, part: string) {
    if (!workspaceId) return null;
    if (isUsingGraphEmail) {
      const attachmentId = Number(part);
      const res = await graphApiFetch(`/api/email/attachments/${attachmentId}/download`, {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            payload?: {
              name: string;
              contentType: string;
              localPath?: string;
              base64: string;
            };
          }
        | null;
      if (!res.ok || !data?.payload) {
        throw new Error(data?.error ?? "Attachment failed");
      }
      return {
        name: data.payload.name,
        contentType: data.payload.contentType,
        base64: data.payload.base64
      };
    }
    const res = await apiFetch(`/api/workspaces/${workspaceId}/email/inbox/${uid}/attachment?part=${encodeURIComponent(part)}`);
    const data = (await res.json().catch(() => null)) as
      | { error?: string; details?: string; attachment?: { name: string; contentType: string; sizeBytes?: number; base64: string } }
      | null;
    if (!res.ok || !data?.attachment) {
      throw new Error(data?.details ? `${data?.error ?? "Attachment failed"}: ${data.details}` : (data?.error ?? "Attachment failed"));
    }
    return data.attachment;
  }

  async function fetchInboxMessageDetail(uid: number) {
    if (!workspaceId) return null;
    if (isUsingGraphEmail) {
      const res = await graphApiFetch(`/api/email/messages/${uid}?workspaceId=${encodeURIComponent(workspaceId)}`);
      const data = (await res.json().catch(() => null)) as { error?: string; message?: InboxMessage } | null;
      if (!res.ok || !data?.message) {
        throw new Error(data?.error ?? "Email failed");
      }
      return data.message;
    }
    const res = await apiFetch(`/api/workspaces/${workspaceId}/email/inbox/${uid}`);
    const data = (await res.json().catch(() => null)) as
      | {
          error?: string;
          details?: string;
          message?: InboxMessage;
        }
      | null;
    if (!res.ok || !data?.message) {
      throw new Error(data?.details ? `${data?.error ?? "Email failed"}: ${data.details}` : (data?.error ?? "Email failed"));
    }
    return data.message;
  }

  async function openInboxAttachment(uid: number, attachment: { part: string; name: string; contentType: string; sizeBytes?: number }) {
    const payload = await fetchInboxAttachmentPayload(uid, attachment.part);
    if (!payload) throw new Error("Attachment unavailable.");
    const blob = new Blob([decodeBase64ToArrayBuffer(payload.base64)], {
      type: getAttachmentOpenContentType({
        name: payload.name || attachment.name,
        contentType: payload.contentType || attachment.contentType
      })
    });
    const objectUrl = URL.createObjectURL(blob);
    const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      URL.revokeObjectURL(objectUrl);
      throw new Error("Pop-up blocked while opening attachment.");
    }
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60_000);
  }

  async function buildEmailDetectionBody(
    message: InboxMessage,
    options?: { maxPdfAttachments?: number; maxPdfChars?: number }
  ) {
    const maxPdfAttachments = Math.max(0, options?.maxPdfAttachments ?? 2);
    const maxPdfChars = Math.max(1000, options?.maxPdfChars ?? 15000);
    const cleanedSnippet = cleanEmailDisplayText(message.body ?? message.snippet ?? "");
    const attachmentNames = (message.attachments ?? []).map((entry) => entry.name).join("\n");
    const baseBody = [cleanedSnippet, attachmentNames].filter(Boolean).join("\n").trim();
    const pdfAttachments = (message.attachments ?? []).filter((attachment) => isPdfAttachment(attachment)).slice(0, maxPdfAttachments);
    if (!pdfAttachments.length) return baseBody;

    const pdfTextChunks: string[] = [];
    let usedChars = 0;
    for (const attachment of pdfAttachments) {
      if (usedChars >= maxPdfChars) break;
      try {
        const payload = await fetchInboxAttachmentPayload(message.uid, attachment.part);
        if (!payload) continue;
        const text = (await extractTextFromPdfArrayBuffer(decodeBase64ToArrayBuffer(payload.base64))).trim();
        if (!text) continue;
        const remainingChars = maxPdfChars - usedChars;
        if (remainingChars <= 0) break;
        const clipped = text.slice(0, remainingChars);
        if (!clipped.trim()) continue;
        pdfTextChunks.push(clipped);
        usedChars += clipped.length;
      } catch {
        // Continue scanning remaining attachments.
      }
    }

    if (!pdfTextChunks.length) return baseBody;
    return [baseBody, pdfTextChunks.join("\n")].filter(Boolean).join("\n");
  }

  async function printSelectedEmailWithAttachments() {
    if (!selectedInboxMessage) return;
    const win = window.open("", "_blank");
    if (!win) {
      window.alert("Pop-up blocked. Please allow pop-ups to print emails.");
      return;
    }
    win.document.write("<p style='font-family:Arial,sans-serif;padding:16px'>Preparing print layout...</p>");
    win.document.close();

    const threadSegments = splitEmailIntoThreadSegments(selectedInboxDisplayBody);
    const attachmentBlocks: string[] = [];
    const attachments = selectedInboxMessageAttachments;

    for (const attachment of attachments) {
      if (!isPngAttachment(attachment) && !isPdfAttachment(attachment)) continue;
      try {
        const payload = await fetchInboxAttachmentPayload(selectedInboxMessage.uid, attachment.part);
        if (!payload) continue;
        if (isPngAttachment(attachment)) {
          const dataUrl = `data:${payload.contentType || "image/png"};base64,${payload.base64}`;
          attachmentBlocks.push(
            `<section class="att-block"><h4>${escapeHtml(payload.name || attachment.name)}</h4><img src="${dataUrl}" alt="${escapeHtml(
              payload.name || attachment.name
            )}" /></section>`
          );
          continue;
        }
        if (isPdfAttachment(attachment)) {
          const fileBuffer = decodeBase64ToArrayBuffer(payload.base64);
          const loadingTask = getDocument({ data: fileBuffer });
          const pdf = await loadingTask.promise;
          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1.4 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            await page.render({ canvasContext: ctx, viewport }).promise;
            const imageDataUrl = canvas.toDataURL("image/png");
            attachmentBlocks.push(
              `<section class="att-block"><h4>${escapeHtml(payload.name || attachment.name)} - Page ${pageNumber}</h4><img src="${imageDataUrl}" alt="${escapeHtml(
                payload.name || attachment.name
              )} page ${pageNumber}" /></section>`
            );
          }
        }
      } catch (error) {
        attachmentBlocks.push(
          `<section class="att-block"><h4>${escapeHtml(attachment.name)}</h4><p class="error">Failed to load attachment for print: ${escapeHtml(
            error instanceof Error ? error.message : "unknown error"
          )}</p></section>`
        );
      }
    }

    const threadHtml = (threadSegments.length ? threadSegments : [{ title: "Message", body: cleanEmailDisplayText(selectedInboxDisplayBody) }])
      .map(
        (segment, index) => `
          <section class="thread ${index === 0 ? "latest" : "older"}">
            <div class="thread-title">${escapeHtml(segment.title)}</div>
            <div class="thread-body">${escapeHtml(segment.body).replace(/\n/g, "<br/>")}</div>
          </section>
        `
      )
      .join("");

    win.document.open();
    win.document.write(`<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(selectedInboxMessage.subject || "Email Print")}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
          .meta { margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #ddd; }
          .meta h2 { margin: 0 0 6px 0; font-size: 20px; }
          .meta div { font-size: 12px; margin-bottom: 2px; }
          .thread { border: 1px solid #d4d4d8; border-radius: 8px; padding: 12px; margin-bottom: 10px; page-break-inside: avoid; }
          .thread.latest { border-color: #93c5fd; background: #eff6ff; }
          .thread.older { background: #fafafa; }
          .thread-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #334155; margin-bottom: 8px; }
          .thread-body { font-size: 13px; line-height: 1.5; }
          h3 { margin: 18px 0 10px; font-size: 14px; }
          .att-grid { display: flex; flex-direction: column; gap: 12px; }
          .att-block { border: 1px solid #d4d4d8; border-radius: 8px; padding: 10px; page-break-inside: avoid; }
          .att-block h4 { margin: 0 0 8px 0; font-size: 12px; }
          .att-block img { max-width: 100%; border: 1px solid #e4e4e7; }
          .error { color: #b91c1c; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="meta">
          <h2>${escapeHtml(selectedInboxMessage.subject || "(no subject)")}</h2>
          <div><strong>From:</strong> ${escapeHtml(selectedInboxMessage.from)}</div>
          <div><strong>Date:</strong> ${escapeHtml(new Date(selectedInboxMessage.date).toLocaleString("en-ZA"))}</div>
        </div>
        ${threadHtml}
        ${
          attachmentBlocks.length
            ? `<h3>Attachments (PNG/PDF)</h3><div class="att-grid">${attachmentBlocks.join("")}</div>`
            : ""
        }
      </body>
      </html>`);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
  }

  async function addSelectedEmailDxfToQuoteReader(sourceMessage?: InboxMessage, options?: { navigate?: boolean; suppressStatus?: boolean }) {
    const message = sourceMessage ?? selectedInboxMessage;
    if (!message) return;
    const dxfAttachments = (message.attachments ?? []).filter((attachment) => isDxfAttachment(attachment));
    if (!dxfAttachments.length) {
      if (!options?.suppressStatus) setEmailStatus("No DXF attachments found on this email.");
      return;
    }
    let loaded = 0;
    for (let index = 0; index < dxfAttachments.length; index += 1) {
      const attachment = dxfAttachments[index];
      try {
        const payload = await fetchInboxAttachmentPayload(message.uid, attachment.part);
        if (!payload) continue;
        const dxfRaw = decodeBase64Text(payload.base64);
        if (!dxfRaw.trim()) continue;
        const ok = ingestDxfRaw(dxfRaw, payload.name || attachment.name, dxfReaderSourceFiles.length + loaded > 0 || index > 0);
        if (ok) {
          loaded += 1;
          if (isUsingGraphEmail && attachment.id && workspaceId) {
            void graphApiFetch(`/api/email/attachments/${attachment.id}/import-dxf`, {
              method: "POST",
              body: JSON.stringify({ workspaceId })
            }).catch(() => undefined);
          }
        }
      } catch (error) {
        if (!options?.suppressStatus) setEmailStatus(error instanceof Error ? error.message : "Failed to import DXF attachment.");
      }
    }
    if (options?.navigate !== false) {
      setViewMode("quotes");
      setQuotesPage("dxf_reader");
    }
    if (loaded > 0 && !options?.suppressStatus) {
      setEmailStatus(`Imported ${loaded} DXF attachment${loaded === 1 ? "" : "s"} into Quote DXF Reader.`);
    }
    if (loaded > 0) {
      markInboxEmailProcessed(message.uid, "DXF imported to Quote Reader");
      void pushCloudEvent("dxf_imported", {
        source: "email_quote_reader",
        attachmentCount: loaded,
        messageUid: message.uid
      });
      void logBrainEvent({
        eventType: "dxf_imported",
        entityType: "email",
        entityId: String(message.uid),
        payload: {
          source: "email_quote_reader",
          attachmentCount: loaded,
          messageUid: message.uid
        }
      });
    }
  }

  async function addSelectedEmailDxfToJobReader(sourceMessage?: InboxMessage) {
    const message = sourceMessage ?? selectedInboxMessage;
    if (!message) return;
    const dxfAttachments = (message.attachments ?? []).filter((attachment) => isDxfAttachment(attachment));
    if (!dxfAttachments.length) {
      setEmailStatus("No DXF attachments found on this email.");
      return;
    }
    let loaded = 0;
    for (const attachment of dxfAttachments) {
      try {
        const payload = await fetchInboxAttachmentPayload(message.uid, attachment.part);
        if (!payload) continue;
        const dxfRaw = decodeBase64Text(payload.base64);
        if (!dxfRaw.trim()) continue;
        const ok = ingestJobDxfRaw(dxfRaw, payload.name || attachment.name, jobDxfSourceFiles.length + loaded > 0);
        if (ok) {
          loaded += 1;
          if (isUsingGraphEmail && attachment.id && workspaceId) {
            void graphApiFetch(`/api/email/attachments/${attachment.id}/import-dxf`, {
              method: "POST",
              body: JSON.stringify({ workspaceId })
            }).catch(() => undefined);
          }
        }
      } catch (error) {
        setEmailStatus(error instanceof Error ? error.message : "Failed to import DXF attachment to job reader.");
      }
    }
    setViewMode("jobs");
    setJobsPage("job_dxf_reader");
    if (loaded > 0) {
      setEmailStatus(`Imported ${loaded} DXF attachment${loaded === 1 ? "" : "s"} into Job DXF Reader.`);
      markInboxEmailProcessed(message.uid, "DXF imported to Job Reader");
      void pushCloudEvent("dxf_imported", {
        source: "email_job_reader",
        attachmentCount: loaded,
        messageUid: message.uid
      });
      void logBrainEvent({
        eventType: "dxf_imported",
        entityType: "email",
        entityId: String(message.uid),
        payload: {
          source: "email_job_reader",
          attachmentCount: loaded,
          messageUid: message.uid
        }
      });
    }
  }

  function inferCustomerNameFromPoEmail(message: InboxMessage, detection?: EmailDetectionResult | null) {
    const detectedName = detection?.customer?.name?.trim();
    if (detectedName) return detectedName;
    const senderName = getInboxSenderName(message.from)
      .replace(/\|.*$/, "")
      .replace(/<.*$/, "")
      .trim();
    return senderName || "Email Customer";
  }

  async function extractCustomerFromEmail(message: InboxMessage, detectionOverride?: EmailDetectionResult | null) {
    if (!workspaceId) return false;
    const detection = detectionOverride ?? boardDetectionsByUid[message.uid] ?? null;
    const detectedName = detection?.customer?.name?.trim();
    const senderName = getInboxSenderName(message.from).trim();
    const customerName = detectedName || senderName || "Email Customer";
    const customerEmail =
      detection?.customer?.email?.trim() ||
      message.senderEmail?.trim() ||
      "";
    const existingCustomer =
      customers.find((customer) => customer.email?.trim().toLowerCase() && customer.email.trim().toLowerCase() === customerEmail.toLowerCase()) ??
      customers.find((customer) => customer.name.trim().toLowerCase() === customerName.toLowerCase()) ??
      null;
    if (existingCustomer) {
      setViewMode("customers");
      setEmailStatus(`Customer already exists: ${existingCustomer.name}.`);
      return true;
    }
    const res = await apiFetch(`/api/workspaces/${workspaceId}/customers`, {
      method: "POST",
      body: JSON.stringify({
        name: customerName,
        email: customerEmail,
        phone: "",
        address: "",
        notes: `Created from email ${message.uid}`
      })
    });
    const data = (await res.json().catch(() => null)) as { error?: string; customer?: CustomerRecord } | null;
    if (!res.ok) {
      setEmailStatus(data?.error ?? "Failed to extract customer from email.");
      return false;
    }
    await refreshCustomers();
    await refreshCustomerSummary();
    setViewMode("customers");
    setEmailStatus(`Customer extracted: ${customerName}.`);
    markInboxEmailProcessed(message.uid, "Customer extracted manually");
    return true;
  }

  async function prepareJobFromPurchaseOrderEmail(message: InboxMessage) {
    if (!workspaceId) return false;
    const detection = boardDetectionsByUid[message.uid];
    const customerName = inferCustomerNameFromPoEmail(message, detection);

    const sourceChunks = [message.subject, cleanEmailDisplayText(message.snippet ?? "")];
    const pdfAttachments = (message.attachments ?? []).filter((attachment) => isPdfAttachment(attachment));
    for (const attachment of pdfAttachments) {
      try {
        const payload = await fetchInboxAttachmentPayload(message.uid, attachment.part);
        if (!payload) continue;
        const pdfText = await extractTextFromPdfArrayBuffer(decodeBase64ToArrayBuffer(payload.base64));
        if (pdfText.trim()) sourceChunks.push(pdfText);
      } catch {
        // Continue if one PDF fails.
      }
    }
    const poInsights = parsePurchaseOrderInsights(sourceChunks.join("\n"), quoteMaterialOptions);

    const dxfAttachments = (message.attachments ?? []).filter((attachment) => isDxfAttachment(attachment));
    const dxfUploadPayloads: Array<{ name: string; contentType: string; base64: string }> = [];
    const allAutoParts: JobDxfPartPreview[] = [];

    for (let index = 0; index < dxfAttachments.length; index += 1) {
      const attachment = dxfAttachments[index];
      try {
        const payload = await fetchInboxAttachmentPayload(message.uid, attachment.part);
        if (!payload) continue;
        const dxfRaw = decodeBase64Text(payload.base64);
        if (!dxfRaw.trim()) continue;
        const segments = parseDxfSegments(dxfRaw);
        if (!segments.length) continue;
        const layers = Array.from(new Set(segments.map((seg) => seg.layer))).sort((a, b) => a.localeCompare(b));
        const rebuilt = rebuildJobDxfParts(
          segments,
          payload.name || attachment.name,
          layers,
          false,
          `auto-po-${message.uid}-${index + 1}`
        );
        const enriched = rebuilt.parts.map((part) => {
          const partInsight = pickPoInsightForPart(part, poInsights);
          const quantity = partInsight?.quantity ?? part.quantity ?? poInsights.totalQuantity ?? 1;
          const material = partInsight?.material ?? poInsights.defaultMaterial ?? part.material ?? quoteMaterialOptions[0] ?? "Mild Steel";
          const thicknessMm = normalizeJobDxfThickness(
            partInsight?.thicknessMm ?? poInsights.defaultThicknessMm ?? part.thicknessMm
          );
          return {
            ...part,
            quantity: Math.max(1, Math.round(quantity)),
            material,
            thicknessMm
          };
        });
        allAutoParts.push(...enriched);
        dxfUploadPayloads.push({
          name: payload.name || attachment.name,
          contentType: payload.contentType || "application/dxf",
          base64: payload.base64
        });
      } catch {
        // Skip a single malformed DXF and continue.
      }
    }

    const quantityExpectedFromParts = allAutoParts.reduce((sum, part) => sum + Math.max(1, Math.round(part.quantity || 0)), 0);
    const quantityExpected =
      quantityExpectedFromParts > 0
        ? quantityExpectedFromParts
        : (Number.isFinite(poInsights.totalQuantity) && (poInsights.totalQuantity ?? 0) > 0
            ? Math.round(poInsights.totalQuantity as number)
            : undefined);

    const jobTitle = `PO: ${message.subject?.trim() || customerName}`.slice(0, 120);

    setJobTitle(jobTitle);
    setJobCustomer(customerName);
    if (quantityExpected && Number.isFinite(quantityExpected)) {
      setJobQuantity(String(Math.max(1, Math.round(quantityExpected))));
    }
    if (allAutoParts.length > 0) {
      setJobDxfParts(allAutoParts);
      setJobsPage("job_dxf_reader");
      setViewMode("jobs");
    } else {
      setJobsPage("create_job");
      setViewMode("jobs");
    }

    markInboxEmailProcessed(message.uid, "PO job prepared manually");

    setEmailStatus(
      `Prepared job draft from PO email${dxfUploadPayloads.length ? " with DXF loaded into Job DXF Reader" : ""}. Review and create the job manually.`
    );
    void pushCloudEvent("purchase_order_detected", {
      messageUid: message.uid,
      dxfAttachmentCount: dxfUploadPayloads.length
    });
    void logBrainEvent({
      eventType: "purchase_order_detected",
      entityType: "email",
      entityId: String(message.uid),
      payload: {
        customerName,
        dxfAttachmentCount: dxfUploadPayloads.length,
        quantityExpected: quantityExpected ?? null
      }
    });
    return true;
  }

  async function addSelectedEmailPdfToQuoteReader(sourceMessage?: InboxMessage) {
    const message = sourceMessage ?? selectedInboxMessage;
    if (!message) return;
    const pdfAttachments = (message.attachments ?? []).filter((attachment) => isPdfAttachment(attachment));
    if (!pdfAttachments.length) {
      setEmailStatus("No PDF attachments found on this email.");
      return;
    }
    const nextPages: PdfReaderSourcePage[] = [...pdfReaderSourcePages];
    let detectedCount = 0;
    for (const attachment of pdfAttachments) {
      try {
        const payload = await fetchInboxAttachmentPayload(message.uid, attachment.part);
        if (!payload) continue;
        const fileBuffer = decodeBase64ToArrayBuffer(payload.base64);
        const loadingTask = getDocument({ data: fileBuffer });
        const pdf = await loadingTask.promise;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          const partPreviews = detectPdfDrawingPartsFromCanvas(canvas, payload.name || attachment.name, pageNumber);
          detectedCount += partPreviews.length;
          nextPages.push({
            id: `email-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${pageNumber}`,
            fileName: payload.name || attachment.name,
            pageNumber,
            previewDataUrl: canvas.toDataURL("image/png"),
            parts: partPreviews
          });
        }
      } catch (error) {
        setEmailStatus(error instanceof Error ? error.message : "Failed to import PDF attachment.");
      }
    }
    const mergedParts = nextPages.flatMap((page) => page.parts);
    setPdfReaderSourcePages(nextPages);
    setPdfReaderParts(mergedParts);
    setPdfReaderSelectedPartIds(mergedParts.map((part) => part.id));
    setPdfReaderStatus(
      `Loaded email PDFs: detected ${detectedCount} drawing part${detectedCount === 1 ? "" : "s"}.`
    );
    setViewMode("quotes");
    setQuotesPage("pdf_reader");
    setEmailStatus("PDF attachments added to Quote PDF Reader.");
    if (detectedCount > 0 || pdfAttachments.length > 0) {
      markInboxEmailProcessed(message.uid, "PDF imported to Quote Reader");
    }
  }

  async function applyPurchaseOrderQuantitiesToQuote(sourceMessage?: InboxMessage) {
    const message = sourceMessage ?? selectedInboxMessage;
    if (!message) return;
    const sourceChunks = [message.subject, cleanEmailDisplayText(message.snippet ?? "")];
    const pdfAttachments = (message.attachments ?? []).filter((attachment) => isPdfAttachment(attachment));
    for (const attachment of pdfAttachments) {
      try {
        const payload = await fetchInboxAttachmentPayload(message.uid, attachment.part);
        if (!payload) continue;
        const pdfText = await extractTextFromPdfArrayBuffer(decodeBase64ToArrayBuffer(payload.base64));
        sourceChunks.push(pdfText);
      } catch {
        // Skip one failed PDF and continue parsing available content.
      }
    }
    const parsed = parsePoQuantitiesFromText(sourceChunks.join("\n"));
    if (!parsed.size) {
      setEmailStatus("No purchase-order quantities detected in email/PDF.");
      return;
    }
    let updatedCount = 0;
    setQuoteParts((current) =>
      current.map((part) => {
        const candidates = [
          normalizePartToken(part.dxfName ?? ""),
          normalizePartToken(part.name),
          normalizePartToken((part.dxfName ?? "").replace(/\.(dxf|pdf|png)$/i, "")),
          normalizePartToken(part.name.replace(/\.(dxf|pdf|png)$/i, ""))
        ].filter(Boolean);
        let qty: number | undefined;
        for (const candidate of candidates) {
          if (parsed.has(candidate)) {
            qty = parsed.get(candidate);
            break;
          }
          for (const [key, value] of parsed.entries()) {
            if (key.includes(candidate) || candidate.includes(key)) {
              qty = value;
              break;
            }
          }
          if (qty) break;
        }
        if (!qty) return part;
        updatedCount += 1;
        return { ...part, quantity: Math.max(1, qty) };
      })
    );
    if (updatedCount > 0) {
      setViewMode("quotes");
      setQuotesPage("calculator");
      setEmailStatus(`Updated quantities for ${updatedCount} quote part${updatedCount === 1 ? "" : "s"} from PO.`);
      markInboxEmailProcessed(message.uid, "PO quantities applied");
    } else {
      setEmailStatus("Detected PO quantities, but no matching quote parts were found.");
    }
  }

  function addDetectedQuoteToCalculator(detectionOverride?: EmailDetectionResult | null, sourceMessage?: InboxMessage) {
    const detection = detectionOverride ?? emailDetection;
    if (!detection?.quote) {
      setEmailStatus("No quote detected from this email.");
      return;
    }
    const matchedQuote = quotes.find((quote) => quote.id === detection.quote?.id);
    setViewMode("quotes");
    setQuotesPage("calculator");
    if (matchedQuote) {
      setQuoteTitle(matchedQuote.title ?? "");
      const customer = customers.find((entry) => entry.name.trim().toLowerCase() === (matchedQuote.customerName ?? "").trim().toLowerCase());
      if (customer) setQuoteCustomerId(customer.id);
    } else {
      setQuoteTitle(detection.quote.title ?? "");
    }
    setEmailStatus(`Loaded detected quote ${detection.quote.quoteNumber} in Quote Calculator.`);
    const source = sourceMessage ?? selectedInboxMessage;
    if (source) {
      markInboxEmailProcessed(source.uid, "Quote loaded in Calculator");
    }
  }

  async function loadOutlookFolders() {
    if (!workspaceId) return;
    const res = await graphApiFetch(`/api/email/folders?workspaceId=${encodeURIComponent(workspaceId)}`);
    const data = (await res.json().catch(() => null)) as
      | {
          error?: string;
          folders?: Array<{ id: string; displayName: string; unreadItemCount?: number; totalItemCount?: number }>;
          syncState?: Array<{ folder: string; lastSyncedAt: string }>;
        }
      | null;
    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load Outlook folders.");
    }
    const syncMap = new Map((data?.syncState ?? []).map((entry) => [entry.folder.toLowerCase(), entry.lastSyncedAt]));
    setOutlookFolders(
      (data?.folders ?? []).map((folder) => ({
        ...folder,
        lastSyncedAt: syncMap.get(folder.id.toLowerCase())
      }))
    );
  }

  async function startMicrosoftEmailSignIn() {
    if (!workspaceId) return;
    setGraphEmailAuthBusy(true);
    setEmailStatus(null);
    try {
      const res = await apiFetch("/api/email/oauth/device-code/start", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; flow?: { deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number; message: string } }
        | null;
      if (!res.ok || !data?.flow) {
        throw new Error(data?.error ?? "Failed to start Microsoft sign-in.");
      }
      setGraphDeviceFlow(data.flow);
      if (window.desktopShell?.openExternal) {
        await window.desktopShell.openExternal(data.flow.verificationUri);
      }
      setEmailStatus(`Enter code ${data.flow.userCode} in Microsoft sign-in to connect Outlook.`);

      const expiresAtMs = Date.now() + data.flow.expiresIn * 1000;
      while (Date.now() < expiresAtMs) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(4, data.flow.interval) * 1000));
        const pollRes = await apiFetch("/api/email/oauth/device-code/poll", {
          method: "POST",
          body: JSON.stringify({ deviceCode: data.flow.deviceCode })
        });
        const pollData = (await pollRes.json().catch(() => null)) as
          | { ok?: boolean; error?: string; tokens?: Record<string, unknown> }
          | null;
        if (!pollRes.ok) {
          const errorMessage = pollData?.error ?? "Microsoft sign-in failed.";
          if (errorMessage.toLowerCase().includes("authorization_pending") || errorMessage.toLowerCase().includes("slow_down")) {
            continue;
          }
          throw new Error(errorMessage);
        }
        if (!pollData?.tokens) continue;
        const nowSeconds = Math.floor(Date.now() / 1000);
        const auth: StoredGraphAuth = {
          accessToken: String(pollData.tokens.access_token ?? ""),
          refreshToken: typeof pollData.tokens.refresh_token === "string" ? pollData.tokens.refresh_token : undefined,
          expiresAt: nowSeconds + Number(pollData.tokens.expires_in ?? 3600),
          accountEmail: authEmail.trim() || undefined
        };
        await setStoredGraphAuth(auth, workspaceId);
        setGraphEmailAccountEmail(auth.accountEmail ?? "");
        setGraphEmailConnected(true);
        setGraphDeviceFlow(null);
        setEmailStatus("Outlook connected. Syncing inbox...");
        await loadOutlookFolders();
        await refreshInboxEmails();
        return;
      }
      throw new Error("Microsoft sign-in timed out.");
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Failed to connect Outlook.");
    } finally {
      setGraphEmailAuthBusy(false);
    }
  }

  async function refreshInboxEmails() {
    if (!workspaceId) return;
    setInboxLoading(true);
    setEmailStatus(null);

    const applyInboxMessages = (messages: InboxMessage[], options?: { seedRead?: boolean }) => {
      setInboxMessages(messages);
      if (options?.seedRead && !readEmailSeeded && Object.keys(readEmailMap).length === 0 && messages.length > 0) {
        const seeded: Record<number, true> = {};
        messages.forEach((message) => {
          if (message.isRead !== false) seeded[message.uid] = true;
        });
        setReadEmailMap(seeded);
        setReadEmailSeeded(true);
      }
      setSelectedInboxUid((current) =>
        current != null && messages.some((message) => message.uid === current) ? current : (messages[0]?.uid ?? null)
      );
    };

    try {
      const storedAuth = await getStoredGraphAuth(workspaceId);
      if (!hasImapEmailConfigured && storedAuth?.accessToken) {
        setGraphEmailConnected(true);
        setGraphEmailAccountEmail(storedAuth.accountEmail ?? "");
        setGraphEmailSyncing(true);
        await graphApiFetch("/api/email/sync", {
          method: "POST",
          body: JSON.stringify({ workspaceId, folder: selectedOutlookFolder, top: inboxLimit })
        });
        await loadOutlookFolders();

        const folderParam =
          selectedOutlookFolder === "quote_requests" || selectedOutlookFolder === "purchase_orders" || selectedOutlookFolder === "attachments" || selectedOutlookFolder === "customers"
            ? "all"
            : selectedOutlookFolder;
        const derivedFilter =
          selectedOutlookFolder === "quote_requests"
            ? "quote_requests"
            : selectedOutlookFolder === "purchase_orders"
              ? "purchase_orders"
              : selectedOutlookFolder === "attachments"
                ? "has_attachments"
                : (selectedOutlookFilter === "all" ? "" : selectedOutlookFilter);
        const query = new URLSearchParams({
          workspaceId,
          folder: folderParam,
          page: "1"
        });
        if (derivedFilter) query.set("filter", derivedFilter);
        if (inboxSearch.trim()) query.set("search", inboxSearch.trim());
        const res = await graphApiFetch(`/api/email/messages?${query.toString()}`);
        const data = (await res.json().catch(() => null)) as { error?: string; messages?: InboxMessage[] } | null;
        if (!res.ok) {
          setEmailStatus(data?.error ?? "Failed to load Outlook inbox.");
          return;
        }
        const messages = data?.messages ?? [];
        applyInboxMessages(messages, { seedRead: true });
        setInboxHistoryLoaded(true);
        setEmailStatus(messages.length ? `Outlook inbox loaded (${messages.length} emails).` : "Outlook inbox loaded. No emails found.");
        return;
      }

      if (hasImapEmailConfigured) {
        setGraphEmailConnected(false);
        setGraphEmailAccountEmail("");
      }
      setOutlookFolders([]);
      if (!hasImapEmailConfigured) {
        setInboxMessages([]);
        setEmailStatus("Add IMAP email settings or connect Outlook to load emails.");
        return;
      }

      const query = new URLSearchParams({ limit: String(inboxLimit) });
      const res = await apiFetch(`/api/workspaces/${workspaceId}/email/inbox?${query.toString()}`);
      const data = (await res.json().catch(() => null)) as
        | { error?: string; details?: string; messages?: InboxMessage[] }
        | null;
      if (!res.ok) {
        setEmailStatus(data?.details ? `${data?.error ?? "Failed to load inbox"}: ${data.details}` : (data?.error ?? "Failed to load inbox."));
        return;
      }
      const messages = data?.messages ?? [];
      applyInboxMessages(messages, { seedRead: true });
      setInboxHistoryLoaded(true);
      setEmailStatus(messages.length ? `Inbox loaded (${messages.length} emails).` : "Inbox loaded. No emails found.");
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Failed to load inbox.");
    } finally {
      setGraphEmailSyncing(false);
      setInboxLoading(false);
    }
  }

  async function createQuoteFromSelectedEmail() {
    if (!workspaceId || !selectedInboxMessage) return;
    if (isUsingGraphEmail && selectedInboxMessage.id) {
      const res = await graphApiFetch(`/api/email/messages/${selectedInboxMessage.id}/create-quote`, {
        method: "POST",
        body: JSON.stringify({ workspaceId })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; quote?: QuoteRecord } | null;
      if (!res.ok || !data?.quote) {
        throw new Error(data?.error ?? "Failed to create quote.");
      }
      await refreshQuotes();
      setEmailStatus(`Quote ${data.quote.quoteNumber} created from email.`);
      return;
    }
    const message = selectedInboxMessage;
    const detectedBody = await buildEmailDetectionBody(message, { maxPdfAttachments: 2, maxPdfChars: 12000 });
    const detection =
      boardDetectionsByUid[message.uid] ??
      (await detectEmailContentFromSource({
        fromEmail: message.senderEmail || message.from,
        subject: message.subject,
        body: detectedBody
      }));
    if (detection) {
      setBoardDetectionsByUid((current) => ({ ...current, [message.uid]: detection }));
    }

    const matchedCustomer =
      customers.find((customer) => detection?.customer?.id && customer.id === detection.customer.id) ??
      customers.find((customer) => {
        const customerEmail = customer.email?.trim().toLowerCase();
        const senderEmail = (message.senderEmail || "").trim().toLowerCase();
        return Boolean(customerEmail && senderEmail && customerEmail === senderEmail);
      }) ??
      customers.find((customer) => customer.name.trim().toLowerCase() === getInboxSenderName(message.from).trim().toLowerCase()) ??
      null;

    setQuoteTitle(detection?.quote?.title?.trim() || message.subject.trim() || "Email Quote");
    if (matchedCustomer) {
      setQuoteCustomerId(matchedCustomer.id);
    }

    const hasDxf = (message.attachments ?? []).some((attachment) => isDxfAttachment(attachment));
    const hasPdf = (message.attachments ?? []).some((attachment) => isPdfAttachment(attachment));
    if (hasDxf) {
      await addSelectedEmailDxfToQuoteReader(message, { navigate: false, suppressStatus: true });
      setQuotesPage("dxf_reader");
    } else if (hasPdf) {
      await addSelectedEmailPdfToQuoteReader(message);
    } else {
      setQuotesPage("calculator");
    }
    setViewMode("quotes");
    setEmailStatus(hasDxf || hasPdf ? "Email loaded into Quotes." : "Email prepared for quote creation.");
    markInboxEmailProcessed(message.uid, "Quote draft prepared");
    void pushCloudEvent("email_quote_request_detected", {
      messageUid: message.uid,
      hasDxf,
      hasPdf
    });
  }

  async function createJobFromSelectedPurchaseOrder() {
    if (!workspaceId || !selectedInboxMessage) return;
    const ok = await prepareJobFromPurchaseOrderEmail(selectedInboxMessage);
    if (!ok) {
      throw new Error("Failed to prepare job from purchase-order email.");
    }
  }

  async function sendEmailMessage() {
    if (!workspaceId) return false;
    setEmailSending(true);
    setEmailStatus(null);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/email/send`, {
        method: "POST",
        body: JSON.stringify({
          to: emailSendTo.trim(),
          subject: emailSendSubject.trim(),
          body: emailSendBody.trim(),
          html: emailSendPreviewHtml
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
      if (!res.ok) {
        setEmailStatus(data?.details ? `${data?.error ?? "Failed to send email"}: ${data.details}` : (data?.error ?? "Failed to send email"));
        return false;
      }
      setEmailStatus("Email sent successfully.");
      setEmailSendTo("");
      setEmailSendSubject("");
      setEmailSendBody("");
      setEmailComposerPreviewOpen(false);
      setEmailComposerOpen(false);
      void refreshInboxEmails();
      return true;
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Failed to send email.");
      return false;
    } finally {
      setEmailSending(false);
    }
  }

  async function polishCurrentEmailDraft() {
    if (emailComposerPolishing) return;
    setEmailComposerPolishing(true);
    try {
      const polishedSubject = polishEmailSubject(emailSendSubject);
      const polishedBody = polishEmailBody(emailSendBody, {
        to: emailSendTo,
        fromName: emailSettings.fromName || "Qouterx"
      });
      setEmailSendSubject(polishedSubject);
      setEmailSendBody(polishedBody);
      setEmailComposerPreviewOpen(true);
      setEmailStatus("Email polished and preview updated.");
    } finally {
      setEmailComposerPolishing(false);
    }
  }

  function createPurchaseOrderDoc() {
    const customer = customers.find((entry) => entry.id === poCustomerId);
    const amount = Number(poAmount) || 0;
    if (!poTitle.trim() || !customer) {
      alert("Enter purchase order title and select customer.");
      return;
    }
    const nextIndex = purchaseOrders.length + 1;
    setPurchaseOrders((current) => [
      {
        id: `po-${Date.now()}`,
        number: `PO-${new Date().getFullYear()}-${String(nextIndex).padStart(3, "0")}`,
        title: poTitle.trim(),
        customerName: customer.name,
        amount,
        notes: poNotes.trim(),
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
    setPoTitle("");
    setPoCustomerId("");
    setPoAmount("");
    setPoNotes("");
  }

  function createInvoiceDoc() {
    const customer = customers.find((entry) => entry.id === invoiceCustomerId);
    const amount = Number(invoiceAmount) || 0;
    if (!invoiceTitle.trim() || !customer) {
      alert("Enter invoice title and select customer.");
      return;
    }
    const nextIndex = invoicesDocs.length + 1;
    setInvoicesDocs((current) => [
      {
        id: `inv-${Date.now()}`,
        number: `INV-${new Date().getFullYear()}-${String(nextIndex).padStart(3, "0")}`,
        title: invoiceTitle.trim(),
        customerName: customer.name,
        amount,
        notes: invoiceNotes.trim(),
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
    setInvoiceTitle("");
    setInvoiceCustomerId("");
    setInvoiceAmount("");
    setInvoiceNotes("");
  }

  function createDeliveryNoteDoc() {
    const customer = customers.find((entry) => entry.id === deliveryCustomerId);
    const selectedQuote = quotes.find((entry) => entry.id === deliveryQuoteId);
    if (!deliveryTitle.trim() || !customer) {
      alert("Enter delivery note title and select customer.");
      return;
    }
    const nextIndex = deliveryNotes.length + 1;
    setDeliveryNotes((current) => [
      {
        id: `dn-${Date.now()}`,
        number: `DN-${new Date().getFullYear()}-${String(nextIndex).padStart(3, "0")}`,
        title: deliveryTitle.trim(),
        customerName: customer.name,
        amount: selectedQuote?.total,
        notes: deliveryNotesText.trim(),
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
    setDeliveryTitle("");
    setDeliveryCustomerId("");
    setDeliveryNotesText("");
    setDeliveryQuoteId("");
  }

  function applyQuoteToDeliveryNote(quoteId: string) {
    setDeliveryQuoteId(quoteId);
    const quote = quotes.find((entry) => entry.id === quoteId);
    if (!quote) return;
    const customer = customers.find(
      (entry) => entry.name.trim().toLowerCase() === (quote.customerName ?? "").trim().toLowerCase()
    );
    if (customer) setDeliveryCustomerId(customer.id);
    if (!deliveryTitle.trim()) {
      setDeliveryTitle(`${quote.quoteNumber} Delivery`);
    }
    const sections = quote.sections as Record<string, QuoteSection>;
    const sectionLines = Object.entries(sections)
      .map(([sectionKey, section]) => {
        const amount = Number(section?.amount ?? 0);
        if (amount <= 0) return "";
        const label = sectionKey.replace(/([A-Z])/g, " $1").replace(/^./, (v) => v.toUpperCase());
        const desc = section?.description?.trim() || "";
        return `${label}: ${formatRand(amount)}${desc ? ` - ${desc}` : ""}`;
      })
      .filter(Boolean);
    const lines = [
      `Quote: ${quote.quoteNumber}`,
      `Quote Title: ${quote.title}`,
      `Customer: ${quote.customerName ?? "-"}`,
      `Quote Total: ${formatRand(quote.total ?? 0)}`,
      sectionLines.length ? "Sections:" : "",
      ...sectionLines
    ].filter(Boolean);
    setDeliveryNotesText(lines.join("\n"));
  }

  async function fetchQuotePdfBlob(
    quoteId: string,
    options?: { download?: boolean; documentType?: "quote" | "invoice" }
  ) {
    if (!workspaceId) return null;
    const download = options?.download ?? false;
    const endpoint = download ? "pdf/download" : "pdf";
    const query = new URLSearchParams();
    if (options?.documentType === "invoice") query.set("documentType", "invoice");
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await apiFetch(`/api/workspaces/${workspaceId}/quotes/${quoteId}/${endpoint}${suffix}`);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
      alert(payload?.details ? `${payload.error ?? "Failed to load PDF"}: ${payload.details}` : (payload?.error ?? "Failed to load PDF"));
      return null;
    }
    const blob = await res.blob();
    const contentDisposition = res.headers.get("content-disposition") ?? "";
    const match = contentDisposition.match(/filename="?([^"]+)"?/i);
    return { blob, filename: match?.[1] ?? "quote.pdf" };
  }

  async function openQuotePdf(quoteId: string) {
    const preview = window.open("", "_blank");
    if (!preview) {
      alert("Pop-up blocked. Please allow pop-ups to open the quote PDF.");
      return;
    }
    preview.document.write("<p style='font-family: sans-serif; padding: 16px'>Loading PDF...</p>");
    const file = await fetchQuotePdfBlob(quoteId, { download: false, documentType: "quote" });
    if (!file) {
      preview.close();
      return;
    }
    const url = URL.createObjectURL(file.blob);
    preview.location.href = url;
    preview.addEventListener(
      "beforeunload",
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );
  }

  async function printQuotePdf(quoteId: string) {
    const preview = window.open("", "_blank");
    if (!preview) {
      alert("Pop-up blocked. Please allow pop-ups to print the quote PDF.");
      return;
    }
    preview.document.write("<p style='font-family: sans-serif; padding: 16px'>Preparing PDF for print...</p>");
    const file = await fetchQuotePdfBlob(quoteId, { download: false, documentType: "quote" });
    if (!file) {
      preview.close();
      return;
    }
    const url = URL.createObjectURL(file.blob);
    preview.location.href = url;
    preview.onload = () => {
      preview.focus();
      preview.print();
    };
    preview.addEventListener(
      "beforeunload",
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );
  }

  async function exportQuotePdf(quoteId: string) {
    const file = await fetchQuotePdfBlob(quoteId, { download: true, documentType: "quote" });
    if (!file) return;
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function printInvoicePdf(quoteId: string) {
    const preview = window.open("", "_blank");
    if (!preview) {
      alert("Pop-up blocked. Please allow pop-ups to print the invoice PDF.");
      return;
    }
    preview.document.write("<p style='font-family: sans-serif; padding: 16px'>Preparing invoice for print...</p>");
    const file = await fetchQuotePdfBlob(quoteId, { download: false, documentType: "invoice" });
    if (!file) {
      preview.close();
      return;
    }
    const url = URL.createObjectURL(file.blob);
    preview.location.href = url;
    preview.onload = () => {
      preview.focus();
      preview.print();
    };
    preview.addEventListener(
      "beforeunload",
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );
  }

  async function openInvoicePdf(quoteId: string) {
    const preview = window.open("", "_blank");
    if (!preview) {
      alert("Pop-up blocked. Please allow pop-ups to open the invoice PDF.");
      return;
    }
    preview.document.write("<p style='font-family: sans-serif; padding: 16px'>Loading invoice...</p>");
    const file = await fetchQuotePdfBlob(quoteId, { download: false, documentType: "invoice" });
    if (!file) {
      preview.close();
      return;
    }
    const url = URL.createObjectURL(file.blob);
    preview.location.href = url;
    preview.addEventListener(
      "beforeunload",
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );
  }

  async function convertImageToOutlineDxf() {
    if (!workspaceId) return;
    if (!imageToDxfFile) {
      setImageToDxfStatus("Select an image first.");
      return;
    }
    const nameLower = imageToDxfFile.name.toLowerCase();
    const hasImageMime = (imageToDxfFile.type || "").toLowerCase().startsWith("image/");
    const isHeicLike = nameLower.endsWith(".heic") || nameLower.endsWith(".heif");
    if (!hasImageMime && !isHeicLike) {
      setImageToDxfStatus("Selected file is not an image. Use PNG/JPG/WEBP/BMP/TIFF/HEIC.");
      return;
    }
    if (imageToDxfFile.size <= 0) {
      setImageToDxfStatus("Image is not downloaded locally yet (cloud-only). Download it first, then retry.");
      return;
    }
    setImageToDxfBusy(true);
    setImageToDxfResultFileName(null);
    setImageToDxfResultBase64(null);
    setImageToDxfPreviewDataUrl(null);
    setImageToDxfResultStats(null);
    setImageToDxfStatus("Converting image to high-precision outline DXF...");
    try {
      const requestPath = `/api/workspaces/${workspaceId}/tools/image-outline-dxf`;
      const buildFormData = () => {
        const formData = new FormData();
        formData.append("image", imageToDxfFile);
        formData.append("threshold", imageToDxfThreshold || "170");
        formData.append("curveSteps", imageToDxfCurveSteps || "60");
        formData.append("mmPerPixel", imageToDxfMmPerPixel || "1");
        formData.append("layer", imageToDxfLayer || "OUTLINE");
        formData.append("maxEdgePx", "3200");
        formData.append("optTolerance", "0.42");
        formData.append("turdSize", "2");
        return formData;
      };

      const maxAttempts = 3;
      let res: Response | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          res = await apiFetch(requestPath, {
            method: "POST",
            body: buildFormData()
          });
          if (res.ok) break;
          if (res.status >= 500 && attempt < maxAttempts) {
            setImageToDxfStatus(`Server busy (attempt ${attempt}/${maxAttempts}). Retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
            continue;
          }
          break;
        } catch (error) {
          if (attempt >= maxAttempts) {
            throw error;
          }
          setImageToDxfStatus(`Connection issue (attempt ${attempt}/${maxAttempts}). Retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }

      if (!res) {
        setImageToDxfStatus("Conversion request did not complete.");
        return;
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string; details?: string } | null;
        setImageToDxfStatus(
          payload?.details ? `${payload.error ?? "Conversion failed"}: ${payload.details}` : (payload?.error ?? "Conversion failed")
        );
        return;
      }
      const data = (await res.json()) as {
        fileName: string;
        dxfBase64: string;
        stats?: { polylineCount?: number; segmentCount?: number };
      };
      const raw = decodeDxfArrayBuffer(decodeBase64ToArrayBuffer(data.dxfBase64));
      const segments = parseDxfSegments(raw);
      const previewDataUrl = createSegmentSvgDataUrl(segments, 980) ?? null;
      const resolvedFileName = data.fileName || `${imageToDxfFile.name.replace(/\.[a-z0-9]+$/i, "")}-outline.dxf`;
      setImageToDxfResultFileName(resolvedFileName);
      setImageToDxfResultBase64(data.dxfBase64);
      setImageToDxfPreviewDataUrl(previewDataUrl);
      setImageToDxfResultStats({
        polylineCount: data.stats?.polylineCount,
        segmentCount: data.stats?.segmentCount ?? segments.length
      });
      setImageToDxfStatus(
        `DXF created: ${resolvedFileName}${data.stats ? ` (${data.stats.polylineCount ?? 0} outlines, ${data.stats.segmentCount ?? segments.length} segments)` : ""}`
      );
    } catch (error) {
      setImageToDxfStatus(error instanceof Error ? error.message : "Failed to convert image.");
    } finally {
      setImageToDxfBusy(false);
    }
  }

  function exportImageToDxf() {
    if (!imageToDxfResultBase64) {
      setImageToDxfStatus("Convert an image first, then export the DXF.");
      return;
    }
    const blob = new Blob([decodeBase64ToArrayBuffer(imageToDxfResultBase64)], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = imageToDxfResultFileName || `${imageToDxfFile?.name.replace(/\.[a-z0-9]+$/i, "") ?? "outline"}-outline.dxf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function createInvoiceFromQuote(quote: QuoteRecord) {
    const invoiceNumber = `INV-${quote.quoteNumber}`;
    const existing = invoicesDocs.find((doc) => doc.number === invoiceNumber || doc.quoteId === quote.id);
    if (workspaceId && quote.status !== "accepted") {
      await apiFetch(`/api/workspaces/${workspaceId}/quotes/${quote.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "accepted" })
      });
      await refreshQuotes();
      await refreshCustomerSummary();
    }
    if (existing) {
      setViewMode("docs");
      setDocsPage("invoices");
      setInvoiceSearchTerm(invoiceNumber);
      setSelectedInvoiceDocId(existing.id);
      return;
    }
    const next: BusinessDocRecord = {
      id: `inv-quote-${quote.id}-${Date.now()}`,
      number: invoiceNumber,
      title: quote.title?.trim() || "Invoice",
      customerName: quote.customerName?.trim() || "-",
      amount: quote.total ?? 0,
      notes: `Source Quote: ${quote.quoteNumber}`,
      quoteId: quote.id,
      createdAt: new Date().toISOString()
    };
    setInvoicesDocs((current) => [next, ...current]);
    void refreshCustomerSummary();
    setViewMode("docs");
    setDocsPage("invoices");
    setInvoiceSearchTerm(invoiceNumber);
    setSelectedInvoiceDocId(next.id);
  }

  async function startSubscription() {
    if (!workspaceId) return;
    setBillingBusy(true);
    try {
      const res = await apiFetch(`/api/billing/checkout`, {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          customerEmail: user?.email?.trim() || billingEmail,
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

  async function copyPaymentValue(label: string, value: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const area = document.createElement("textarea");
        area.value = value;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.focus();
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setPaymentCopyStatus(`${label} copied`);
      window.setTimeout(() => {
        setPaymentCopyStatus((current) => (current === `${label} copied` ? null : current));
      }, 2200);
    } catch {
      setPaymentCopyStatus(`Could not copy ${label.toLowerCase()}`);
    }
  }

  async function refreshDesktopUpdateState() {
    if (!window.desktopShell?.getAppVersion) return;
    try {
      const result = await window.desktopShell.getAppVersion();
      if (!result.ok) {
        setUpdateActionError(result.error ?? "Could not load app version.");
        return;
      }
      setAppVersion(result.version ?? "Unknown");
      setUpdateStatus(result.updateStatus ?? null);
    } catch (error) {
      setUpdateActionError(error instanceof Error ? error.message : "Could not load app version.");
    }
  }

  async function requestDesktopUpdateCheck() {
    if (!window.desktopShell?.checkForUpdates) {
      setUpdateActionError("Desktop update checks are only available in the packaged app.");
      return;
    }
    setUpdateBusy(true);
    setUpdateActionError(null);
    try {
      const result = await window.desktopShell.checkForUpdates();
      if (!result.ok) {
        setUpdateActionError(result.error ?? "Could not check for updates.");
      } else {
        setAppVersion(result.currentVersion);
      }
    } catch (error) {
      setUpdateActionError(error instanceof Error ? error.message : "Could not check for updates.");
    } finally {
      setUpdateBusy(false);
    }
  }

  async function installDesktopUpdateNow() {
    if (!window.desktopShell?.installUpdateNow && !window.desktopShell?.installUpdate) {
      setUpdateActionError("Desktop updates are only available in the packaged app.");
      return;
    }
    setUpdateBusy(true);
    setUpdateActionError(null);
    try {
      const installer = window.desktopShell.installUpdateNow ?? window.desktopShell.installUpdate;
      const result = await installer();
      if (!result.ok) {
        setUpdateActionError(result.error ?? "Could not start update install.");
      }
    } catch (error) {
      setUpdateActionError(error instanceof Error ? error.message : "Could not start update install.");
    } finally {
      setUpdateBusy(false);
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
      const res = await apiFetch(`/api/billing/prelogin-checkout`, {
        method: "POST",
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
      const res = await apiFetch(`/api/billing/prelogin-portal`, {
        method: "POST",
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
      const res = await apiFetch(path, {
        method: "POST",
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
      if (authRemember) {
        localStorage.setItem(AUTH_EMAIL_KEY, authEmail);
        await setSecureString(AUTH_PASSWORD_STORE_KEY, authPassword);
      }
      setOfflineBootMode(false);
      setToken(data.token);
      setUser(data.user);
      setWorkspaces(data.workspaces);
      const nextWorkspaceId = data.workspaces[0]?.id ?? null;
      setWorkspaceId(nextWorkspaceId);
      if (authMode === "register" && nextWorkspaceId && data.user.email.trim().toLowerCase() !== APP_OWNER_EMAIL) {
        window.setTimeout(() => {
          void createLocalAccountRequest({
            workspaceId: nextWorkspaceId,
            user: data.user,
            companyName: authWorkspaceName.trim() || data.workspaces[0]?.name || "Qouter X Company",
            contactName: authName.trim() || data.user.name || ""
          });
        }, 150);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      const apiDetail = await getApiFailureDetail();
      setAuthError(
        `Unable to reach API (${apiUrlCandidates.join(" or ")}). ${apiDetail ? `${apiDetail} ` : ""}${message}`.trim()
      );
    } finally {
      setAuthBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("authToken");
    void setSecureString(AUTH_PASSWORD_STORE_KEY, authRemember ? authPassword : null);
    setOfflineBootMode(false);
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setWorkspaceId(null);
    setDeviceAllowedFeatures(null);
    setGeneratorUnlocked(false);
    setGeneratedAccessCode("");
    setGeneratorStatus(null);
    setRedeemStatus(null);
  }

  function send() {
    void sendSupportMessage();
  }

  function formatPeriodEnd(seconds: number | null) {
    if (!seconds) return "—";
    const date = new Date(seconds * 1000);
    return date.toLocaleDateString();
  }

  function formatRand(value: number | null | undefined) {
    return ZAR_FORMATTER.format(value ?? 0);
  }

  function formatDateTime(value: string | null | undefined) {
    if (!value) return "Unknown date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-ZA");
  }

  function normalizePartDnaPreviewSvg(svg: string | null | undefined) {
    if (!svg) return "";
    return svg.replace(
      /<svg\b([^>]*)>/i,
      (_match, attrs) =>
        `<svg${attrs} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;">`
    );
  }

  function maybeShowPreviousPartPricePopup(entries: Array<{ partName: string; result: PartDnaAnalysisResult | null }>) {
    const popupEntries = entries
      .map(({ partName, result }) => {
        if (!result) return null;
        const previousQuote = result.previousHistory.find((entry) => entry.quotedPrice !== null && entry.quotedPrice !== undefined);
        const previousQuotedPrice = previousQuote?.quotedPrice ?? result.previousQuotedPrice ?? null;
        if (previousQuotedPrice === null || previousQuotedPrice === undefined) return null;
        return {
          partName,
          partCode: result.partCode,
          previousQuotedPrice,
          previousQuotedAt: previousQuote?.createdAt ?? null
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (!popupEntries.length) return;
    setPartDnaPreviousPricePopup({ entries: popupEntries });
  }

  async function loadPartDnaLibrary() {
    if (!workspaceId) return;
    setPartDnaLibraryLoading(true);
    try {
      const res = await apiFetch(`/api/part-dna/library?workspaceId=${encodeURIComponent(workspaceId)}`);
      const data = (await res.json()) as { parts?: PartDnaLibraryEntry[]; error?: string };
      if (!res.ok) throw new Error(data?.error ?? "Failed to load Part DNA library.");
      setPartDnaLibrary(Array.isArray(data.parts) ? data.parts : []);
    } catch (error) {
      setPartDnaStatus(error instanceof Error ? error.message : "Failed to load Part DNA library.");
    } finally {
      setPartDnaLibraryLoading(false);
    }
  }

  function addTankFittingSelection() {
    const fitting = tankFitting.trim();
    if (!fitting) return;
    const item = [tankFittingGroup, fitting, tankFittingSize].filter(Boolean).join(" - ");
    setTankFittingSelections((prev) => (prev.includes(item) ? prev : [...prev, item]));
  }

  function removeTankFittingSelection(index: number) {
    setTankFittingSelections((prev) => prev.filter((_entry, i) => i !== index));
  }

  function buildPerforationSegments(options: {
    plateWidth: number;
    plateHeight: number;
    holeType: "round" | "square" | "hex" | "slot";
    patternType: "square" | "staggered";
    spacingMode: "pitch" | "web";
    pitch: number;
    web: number;
    holeSize: number;
    slotLength: number;
    slotWidth: number;
    borderX: number;
    borderY: number;
    layer: string;
    entityPrefix: string;
    offsetX?: number;
    offsetY?: number;
  }) {
    const {
      plateWidth,
      plateHeight,
      holeType,
      patternType,
      spacingMode,
      pitch,
      web,
      holeSize,
      slotLength,
      slotWidth,
      borderX,
      borderY,
      layer,
      entityPrefix,
      offsetX = 0,
      offsetY = 0
    } = options;

    const segments = createRectangleSegments(plateWidth, plateHeight, layer, `${entityPrefix}-outline`, offsetX, offsetY);
    const holeWidth = holeType === "slot" ? Math.max(1, slotLength) : Math.max(1, holeSize);
    const holeHeight = holeType === "slot" ? Math.max(1, slotWidth) : Math.max(1, holeSize);
    const pitchX = spacingMode === "pitch" ? Math.max(0.5, pitch) : Math.max(0.5, holeWidth + web);
    const pitchY = spacingMode === "pitch" ? Math.max(0.5, pitch) : Math.max(0.5, holeHeight + web);
    const startY = borderY + holeHeight / 2;
    const maxY = plateHeight - borderY - holeHeight / 2;
    const minX = borderX + holeWidth / 2;
    const maxX = plateWidth - borderX - holeWidth / 2;
    if (minX > maxX || startY > maxY) return segments;

    let holeIndex = 0;
    for (let row = 0, centerY = startY; centerY <= maxY + 0.001; row += 1, centerY += pitchY) {
      const rowOffset = patternType === "staggered" && row % 2 === 1 ? pitchX / 2 : 0;
      for (let centerX = minX + rowOffset; centerX <= maxX + 0.001; centerX += pitchX) {
        if (centerX > maxX + 0.001) break;
        const holeOffsetX = offsetX + centerX - holeWidth / 2;
        const holeOffsetY = offsetY + centerY - holeHeight / 2;
        const holePrefix = `${entityPrefix}-hole-${++holeIndex}`;
        if (holeType === "round") {
          segments.push(...createCircleSegments(holeSize, layer, holePrefix, holeOffsetX, holeOffsetY, 36));
        } else if (holeType === "square") {
          segments.push(...createRectangleSegments(holeSize, holeSize, layer, holePrefix, holeOffsetX, holeOffsetY));
        } else if (holeType === "hex") {
          const radius = holeSize / Math.sqrt(3);
          segments.push(...createRegularPolygonSegments(6, radius, layer, holePrefix, offsetX + centerX - radius, offsetY + centerY - radius, Math.PI / 6));
        } else {
          segments.push(...createSlotSegments(slotLength, slotWidth, layer, holePrefix, holeOffsetX, holeOffsetY, 14));
        }
      }
    }
    return segments;
  }

  const perforationPreview = useMemo(() => {
    const plateWidth = Number(perfPlateWidthMm) || 0;
    const plateHeight = Number(perfPlateHeightMm) || 0;
    const borderX = Math.max(0, Number(perfBorderXMm) || 0);
    const borderY = Math.max(0, Number(perfBorderYMm) || 0);
    const holeSize = Math.max(0, Number(perfHoleSizeMm) || 0);
    const slotLength = Math.max(0, Number(perfSlotLengthMm) || 0);
    const slotWidth = Math.max(0, Number(perfSlotWidthMm) || 0);
    const pitch = Math.max(0, Number(perfPitchMm) || 0);
    const web = Math.max(0, Number(perfWebMm) || 0);
    if (plateWidth <= 0 || plateHeight <= 0) return { segments: [] as DxfSegment[], previewDataUrl: undefined as string | undefined, error: "Enter valid plate width and height." };
    if (perfHoleType === "slot") {
      if (slotLength <= 0 || slotWidth <= 0) return { segments: [] as DxfSegment[], previewDataUrl: undefined as string | undefined, error: "Enter valid slot length and width." };
    } else if (holeSize <= 0) {
      return { segments: [] as DxfSegment[], previewDataUrl: undefined as string | undefined, error: "Enter a valid hole size." };
    }
    if (perfSpacingMode === "pitch" && pitch <= 0) return { segments: [] as DxfSegment[], previewDataUrl: undefined as string | undefined, error: "Enter a valid pitch." };
    if (perfSpacingMode === "web" && web < 0) return { segments: [] as DxfSegment[], previewDataUrl: undefined as string | undefined, error: "Enter a valid web." };

    const segments = buildPerforationSegments({
      plateWidth,
      plateHeight,
      holeType: perfHoleType,
      patternType: perfPatternType,
      spacingMode: perfSpacingMode,
      pitch,
      web,
      holeSize,
      slotLength,
      slotWidth,
      borderX,
      borderY,
      layer: "PERF",
      entityPrefix: "perf-preview"
    });
    return {
      segments,
      previewDataUrl: createSegmentSvgDataUrl(segments, 1200, "#020617", "#4ade80"),
      error: null as string | null
    };
  }, [
    perfPlateWidthMm,
    perfPlateHeightMm,
    perfBorderXMm,
    perfBorderYMm,
    perfHoleType,
    perfPatternType,
    perfSpacingMode,
    perfPitchMm,
    perfWebMm,
    perfHoleSizeMm,
    perfSlotLengthMm,
    perfSlotWidthMm
  ]);

  function applyTankCalcToQuote() {
    const baseSummary = `Tank ${tankLengthMm || 0}x${tankWidthMm || 0}x${tankHeightMm || 0} mm · ${tankThicknessMm || 0} mm · ${
      tankMaterial || "Mild Steel"
    } · Qty ${tankQuantity || 1}`;
    const fittingsSummary = tankFittingSelections.length ? ` · Fittings: ${tankFittingSelections.join(", ")}` : "";
    const summary = `${baseSummary}${fittingsSummary}`;
    setQuoteTankManufacturing(summary);
    setQuoteTankManufacturingAmount(String(Math.max(0, tankTotal)));
    setViewMode("quotes");
    setQuotesPage("calculator");
  }

  const statusLabel = billing.status ?? "not subscribed";
  const isAppOwner = user?.email?.trim().toLowerCase() === "knight6807@gmail.com";
  const loginPaymentReference = authEmail.trim() ? deriveAccountRef(authEmail) : "Enter email to generate ref";
  const accountPaymentReference = user?.accountRef ?? "No ref available";
  const renderSubscriptionPaymentDetails = (paymentReference: string) => (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        border: "1px solid rgba(59, 130, 246, 0.22)",
        background: "rgba(15, 23, 42, 0.68)",
        marginBottom: 12
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Payment Details</div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>Bank: <b>{SUBSCRIPTION_BANK_NAME}</b></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12 }}>
          Account Number: <b>{SUBSCRIPTION_ACCOUNT_NUMBER}</b>
        </div>
        <button
          onClick={() => {
            void copyPaymentValue("Account number", SUBSCRIPTION_ACCOUNT_NUMBER);
          }}
          style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "white", cursor: "pointer", fontSize: 11 }}
        >
          Copy
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12 }}>
          Reference: <b>{paymentReference}</b>
        </div>
        <button
          onClick={() => {
            if (!paymentReference || paymentReference === "Enter email to generate ref" || paymentReference === "No ref available") return;
            void copyPaymentValue("Reference", paymentReference);
          }}
          disabled={!paymentReference || paymentReference === "Enter email to generate ref" || paymentReference === "No ref available"}
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#1e293b",
            color: "white",
            cursor: "pointer",
            fontSize: 11,
            opacity: !paymentReference || paymentReference === "Enter email to generate ref" || paymentReference === "No ref available" ? 0.5 : 1
          }}
        >
          Copy
        </button>
      </div>
      <div style={{ fontSize: 11, color: "#fde68a", lineHeight: 1.5 }}>
        Note: Use the ref provided exactly when making payment.
      </div>
      {paymentCopyStatus ? <div style={{ fontSize: 11, color: "#86efac", marginTop: 8 }}>{paymentCopyStatus}</div> : null}
    </div>
  );
  const query = jobSearch.trim().toLowerCase();
  const filteredJobs = jobs.filter((job) => {
    if (!query) return true;
    const fileNames = (job.fileLinks ?? []).map((file) => file.fileName).join(" ").toLowerCase();
    return (
      job.jobNumber.toLowerCase().includes(query) ||
      job.title.toLowerCase().includes(query) ||
      (job.customerName ?? "").toLowerCase().includes(query) ||
      (job.quoteNumber ?? "").toLowerCase().includes(query) ||
      fileNames.includes(query)
    );
  });
  const jobsOpen = filteredJobs.filter((job) => job.status === "open");
  const jobsInProgress = filteredJobs.filter((job) => job.status === "in_progress");
  const jobsIncomplete = filteredJobs.filter((job) => job.status === "incomplete");
  const jobsDone = filteredJobs.filter((job) => job.status === "done");
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const smartQueueQuery = smartQueueSearch.trim().toLowerCase();
  const filteredSmartQueueJobs = smartQueueJobs.filter((job) => {
    const matchesSearch =
      !smartQueueQuery ||
      job.jobNumber.toLowerCase().includes(smartQueueQuery) ||
      job.title.toLowerCase().includes(smartQueueQuery) ||
      (job.customerName ?? "").toLowerCase().includes(smartQueueQuery) ||
      job.material.toLowerCase().includes(smartQueueQuery) ||
      (job.sheetSize ?? "").toLowerCase().includes(smartQueueQuery);
    if (!matchesSearch) return false;
    if (smartQueueFilter === "all") return true;
    if (smartQueueFilter === "pending") return job.status === "pending";
    if (smartQueueFilter === "ready") return job.status === "ready";
    if (smartQueueFilter === "urgent") return job.priority === "urgent";
    if (smartQueueFilter === "missing_dxf") return job.warnings.includes("Missing DXF");
    if (smartQueueFilter === "completed") return job.status === "completed";
    return true;
  });
  const filteredSmartQueueJobIds = new Set(filteredSmartQueueJobs.map((job) => job.id));
  const visibleSmartQueueGroups = smartQueueGroups
    .map((group) => ({
      ...group,
      jobs: group.jobs.filter((job) => filteredSmartQueueJobIds.has(job.id)),
      items: group.items.filter((item) => filteredSmartQueueJobIds.has(item.jobId))
    }))
    .filter((group) => group.jobs.length > 0 || (!smartQueueQuery && smartQueueFilter === "all"));
  const selectedSmartQueueJob = smartQueueJobs.find((job) => job.id === smartQueueSelectedJobId) ?? null;
  const activeLeadTimeJob = selectedSmartQueueJob ?? smartQueueJobs[0] ?? null;
  const activeSheetOptimizerJob = activeLeadTimeJob;
  useEffect(() => {
    if (offlineBootMode || !workspaceId || viewMode !== "sheet_optimizer" || workspaceLocked) return;
    if (smartQueueJobs.length === 0) {
      void refreshSmartQueue();
      return;
    }
    if (activeSheetOptimizerJob) {
      setSheetOptimizerMaterial(activeSheetOptimizerJob.material || "Mild Steel");
      setSheetOptimizerThickness(String(activeSheetOptimizerJob.thickness ?? 1.5));
    }
  }, [offlineBootMode, workspaceId, viewMode, workspaceLocked, smartQueueJobs, activeSheetOptimizerJob]);
  const smartQueueStatusColors: Record<SmartQueueJob["status"], string> = {
    pending: "#94a3b8",
    ready: "#38bdf8",
    cutting: "#22c55e",
    paused: "#f97316",
    completed: "#a3e635",
    cancelled: "#ef4444"
  };
  const smartQueuePriorityColors: Record<SmartQueueJob["priority"], string> = {
    low: "#94a3b8",
    normal: "#60a5fa",
    urgent: "#f43f5e"
  };
  const stockQuery = stockSearch.trim().toLowerCase();
  const stockLowWarningKeys = new Set(stockWarnings.map((warning) => `${warning.material}::${warning.thickness}`));
  const filteredStockSheets = stockSheets.filter((sheet) => {
    if (stockViewFilter === "offcuts_only") return false;
    const matchesSearch =
      !stockQuery ||
      sheet.material.toLowerCase().includes(stockQuery) ||
      `${sheet.width}x${sheet.height}`.includes(stockQuery) ||
      `${sheet.width} x ${sheet.height}`.includes(stockQuery) ||
      String(sheet.quantity).includes(stockQuery) ||
      (sheet.supplier ?? "").toLowerCase().includes(stockQuery) ||
      (sheet.location ?? "").toLowerCase().includes(stockQuery);
    const matchesMaterial = !stockMaterialFilter || sheet.material === stockMaterialFilter;
    const matchesThickness = !stockThicknessFilter || String(sheet.thickness) === stockThicknessFilter;
    const matchesStatus =
      stockViewFilter === "all" ||
      (stockViewFilter === "low_stock" && stockLowWarningKeys.has(`${sheet.material}::${sheet.thickness}`)) ||
      (stockViewFilter === "available" && sheet.status === "available") ||
      (stockViewFilter === "reserved" && sheet.status === "reserved");
    return matchesSearch && matchesMaterial && matchesThickness && matchesStatus;
  });
  const filteredStockOffcuts = stockOffcuts.filter((offcut) => {
    if (stockViewFilter === "low_stock") return false;
    const matchesSearch =
      !stockQuery ||
      offcut.material.toLowerCase().includes(stockQuery) ||
      `${offcut.width}x${offcut.height}`.includes(stockQuery) ||
      `${offcut.width} x ${offcut.height}`.includes(stockQuery) ||
      (offcut.location ?? "").toLowerCase().includes(stockQuery);
    const matchesMaterial = !stockMaterialFilter || offcut.material === stockMaterialFilter;
    const matchesThickness = !stockThicknessFilter || String(offcut.thickness) === stockThicknessFilter;
    const matchesStatus =
      stockViewFilter === "all" ||
      stockViewFilter === "offcuts_only" ||
      stockViewFilter === "low_stock" ||
      (stockViewFilter === "available" && offcut.status === "available") ||
      (stockViewFilter === "reserved" && offcut.status === "reserved");
    return matchesSearch && matchesMaterial && matchesThickness && matchesStatus;
  });
  const filteredStockWarnings = stockViewFilter === "low_stock" || stockViewFilter === "all" ? stockWarnings : [];
  const smartQueueStockMaterialOptions = Array.from(
    new Set([...stockSheets.map((sheet) => sheet.material), ...stockOffcuts.map((offcut) => offcut.material)].filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const smartQueueStockThicknessOptions = Array.from(
    new Set([...stockSheets.map((sheet) => String(sheet.thickness)), ...stockOffcuts.map((offcut) => String(offcut.thickness))])
  ).sort((a, b) => Number(a) - Number(b));

  useEffect(() => {
    const sourcePart = selectedSmartQueueJob?.legacyJobId
      ? jobs.find((job) => job.id === selectedSmartQueueJob.legacyJobId)?.jobDxfParts?.[0]
      : undefined;
    const material = selectedSmartQueueJob?.material || sourcePart?.material || "";
    const thickness = selectedSmartQueueJob?.thickness ?? sourcePart?.thicknessMm ?? 0;
    const width = sourcePart?.widthMm ?? 0;
    const height = sourcePart?.heightMm ?? 0;
    if (!selectedSmartQueueJob || !material.trim() || thickness <= 0 || width <= 0 || height <= 0) {
      setStockJobSuggestion(null);
      setStockJobOffcutMatch(null);
      return;
    }
    void fetchStockSuggestion({ material, thickness, width, height }, "job");
    void fetchOffcutIntelligenceMatch(
      {
        material,
        thickness,
        width,
        height,
        jobId: selectedSmartQueueJob.legacyJobId ?? selectedSmartQueueJob.jobNumber,
        partDnaId: selectedSmartQueueJob.partDnaId ?? null,
        entityLabel: selectedSmartQueueJob.jobNumber
      },
      "job"
    );
  }, [selectedSmartQueueJob?.id, selectedSmartQueueJob?.material, selectedSmartQueueJob?.thickness, selectedSmartQueueJob?.partDnaId, jobs]);

  const machineOptions = useMemo(() => {
    const names = new Set<string>(DEFAULT_MACHINE_OPTIONS);
    for (const quote of quotes) {
      const sections = quote.sections as Record<string, QuoteSection>;
      for (const [sectionKey, section] of Object.entries(sections)) {
        const hasData =
          Number(section.amount ?? 0) > 0 ||
          (section.description ?? "").trim().length > 0 ||
          (section.parts?.length ?? 0) > 0;
        if (hasData) names.add(formatMachineLabelFromKey(sectionKey));
      }
    }
    for (const job of jobs) {
      const title = job.title.trim();
      if (title) names.add(title);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [quotes, jobs]);
  const selectedQuoteCustomer = customers.find((customer) => customer.id === quoteCustomerId) ?? null;
  const quoteNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const prefix = `Q-${year}-`;
    const existing = quotes
      .map((quote) => quote.quoteNumber)
      .filter((value) => value?.startsWith(prefix))
      .map((value) => Number(value.slice(prefix.length)))
      .filter((value) => Number.isFinite(value));
    const seed = Number(quoteSeed);
    const seedBase = Number.isFinite(seed) && seed > 0 ? seed - 1 : 0;
    const next = Math.max(seedBase, existing.length ? Math.max(...existing) : 0) + 1;
    return `${prefix}${String(next).padStart(3, "0")}`;
  }, [quoteSeed, quotes]);
  const quoteMaterialOptions = useMemo(() => {
    const names = materials.map((material) => material.name.trim()).filter(Boolean);
    return names.length ? names : ["Mild Steel"];
  }, [materials]);
  const densityByMaterial = Object.fromEntries(
    materials.map((material) => [material.name, material.density])
  ) as Record<string, number>;
  function calculatePlateWeightKg(material: string, thicknessMm: number, widthMm: number, heightMm: number, quantity = 1) {
    const density = densityByMaterial[material] ?? densityByMaterial["Mild Steel"] ?? 7850;
    const volumeM3 = (Math.max(0, widthMm) * Math.max(0, heightMm) * Math.max(0, thicknessMm)) / 1_000_000_000;
    return volumeM3 * density * Math.max(0, quantity);
  }
  const visibleRackWeights = Array.from(
    [...filteredStockSheets, ...filteredStockOffcuts].reduce((map, item) => {
      const location = item.location?.trim() || "No location";
      const quantity = "quantity" in item ? item.quantity : 1;
      const current = map.get(location) ?? { location, totalKg: 0, itemCount: 0 };
      current.totalKg += calculatePlateWeightKg(item.material, item.thickness, item.width, item.height, quantity);
      current.itemCount += 1;
      map.set(location, current);
      return map;
    }, new Map<string, { location: string; totalKg: number; itemCount: number }>())
  ).sort((a, b) => b.totalKg - a.totalKg);
  const rateByMaterial = Object.fromEntries(
    materials.map((material) => [material.name, material.ratePerKg])
  ) as Record<string, number>;
  const parsedVatRate = Number(quoteVatRate) || 0;
  const parsedCostPerPierce = Number(costPerPierce) || 0;
  const parsedCostPerCutMm = Number(costPerCutMm) || 0;
  const parsedCostPerBend = Number(costPerBend) || 0;
  const tankL = Math.max(0, Number(tankLengthMm) || 0);
  const tankW = Math.max(0, Number(tankWidthMm) || 0);
  const tankH = Math.max(0, Number(tankHeightMm) || 0);
  const tankT = Math.max(0, Number(tankThicknessMm) || 0);
  const tankQty = Math.max(1, Math.round(Number(tankQuantity) || 1));
  const tankDensity = densityByMaterial[tankMaterial] ?? densityByMaterial["Mild Steel"] ?? 7850;
  const tankMaterialRate = rateByMaterial[tankMaterial] ?? 0;
  const tankFabRate = Math.max(0, Number(tankFabRatePerKg) || 0);
  const tankSurfaceAreaSqm = (2 * (tankL * tankW + tankL * tankH + tankW * tankH)) / 1_000_000;
  const tankWeightKg = tankSurfaceAreaSqm * (tankT / 1000) * tankDensity;
  const tankMaterialCostPerUnit = tankWeightKg * tankMaterialRate;
  const tankFabCostPerUnit = tankWeightKg * tankFabRate;
  const tankUnitTotal = tankMaterialCostPerUnit + tankFabCostPerUnit;
  const tankSubTotal = tankUnitTotal * tankQty;
  const tankVat = (tankSubTotal * parsedVatRate) / 100;
  const tankTotal = tankSubTotal + tankVat;
  const jobDxfCalculatedParts = jobDxfParts.map((part) => {
    const material = part.material ?? quoteMaterialOptions[0] ?? "Mild Steel";
    const thicknessMm = normalizeJobDxfThickness(part.thicknessMm);
    const density = densityByMaterial[material] ?? densityByMaterial["Mild Steel"] ?? 7850;
    const unitWeightKg = ((part.widthMm * part.heightMm * thicknessMm) / 1_000_000_000) * density;
    const totalWeightKg = unitWeightKg * Math.max(0, Math.round(part.quantity || 0));
    return { ...part, material, thicknessMm, unitWeightKg, totalWeightKg };
  });
  const jobDxfTotalWeightKg = jobDxfCalculatedParts.reduce((sum, part) => sum + part.totalWeightKg, 0);
  const jobDxfCalculatedPartById = useMemo(
    () => new Map(jobDxfCalculatedParts.map((part) => [part.id, part])),
    [jobDxfCalculatedParts]
  );
  const jobDxfDisplayFiles = useMemo(() => {
    if (jobDxfSourceFiles.length > 0) return jobDxfSourceFiles;
    if (jobDxfParts.length === 0) return [];
    return [
      {
        id: "job-dxf-all",
        fileName: jobDxfFileName || "DXF Parts",
        segments: [],
        layers: [],
        previewDataUrl: jobDxfPreviewDataUrl,
        parts: jobDxfParts
      }
    ] as JobDxfSourceFile[];
  }, [jobDxfSourceFiles, jobDxfParts, jobDxfFileName, jobDxfPreviewDataUrl]);
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
  const weldingRateByKey = Object.fromEntries(
    weldingRates.map((rate) => [`${rate.material.toLowerCase()}|${rate.thicknessMm}`, rate.pricePerMeter])
  ) as Record<string, number>;
  const weldCalculatedParts = weldParts.map((part) => {
    const lookupKey = `${part.material.toLowerCase()}|${part.thicknessMm}`;
    const rateFromTable = weldingRateByKey[lookupKey];
    const effectiveRate = Number.isFinite(rateFromTable) ? rateFromTable : part.pricePerMeter;
    const metersPerPart = (part.weldLengthMm || 0) / 1000;
    const totalMeters = metersPerPart * (part.quantity || 0);
    const lineTotal = totalMeters * (effectiveRate || 0);
    return { ...part, effectiveRate, metersPerPart, totalMeters, lineTotal };
  });
  const weldingSubTotal = weldCalculatedParts.reduce((sum, part) => sum + part.lineTotal, 0);
  const weldingVat = (weldingSubTotal * parsedVatRate) / 100;
  const weldingTotal = weldingSubTotal + weldingVat;
  const weldingTotalMeters = weldCalculatedParts.reduce((sum, part) => sum + part.totalMeters, 0);
  const bendingRateByKey = Object.fromEntries(
    bendingRates.map((rate) => [
      `${rate.material.toLowerCase()}|${rate.thicknessMm}`,
      { shortPricePerBend: rate.shortPricePerBend, longPricePerBend: rate.longPricePerBend }
    ])
  ) as Record<string, { shortPricePerBend: number; longPricePerBend: number }>;
  const bendCalculatedParts = bendParts.map((part) => {
    const lookupKey = `${part.material.toLowerCase()}|${part.thicknessMm}`;
    const rateFromTable = bendingRateByKey[lookupKey];
    const isLong = (part.bendLengthMm || 0) > 1000;
    const effectivePricePerBend = rateFromTable
      ? (isLong ? rateFromTable.longPricePerBend : rateFromTable.shortPricePerBend)
      : (isLong ? part.longPricePerBend : part.shortPricePerBend);
    const totalBends = Math.max(0, part.quantity || 0) * Math.max(0, part.bendCount || 0);
    const lineTotal = totalBends * Math.max(0, effectivePricePerBend || 0);
    return { ...part, isLong, effectivePricePerBend, totalBends, lineTotal };
  });
  const bendingSubTotal = bendCalculatedParts.reduce((sum, part) => sum + part.lineTotal, 0);
  const bendingVat = (bendingSubTotal * parsedVatRate) / 100;
  const bendingTotal = bendingSubTotal + bendingVat;
  const bendingTotalBends = bendCalculatedParts.reduce((sum, part) => sum + part.totalBends, 0);
  const rollingRateByKey = Object.fromEntries(
    rollingRates.map((rate) => [`${rate.material.toLowerCase()}|${rate.thicknessMm}`, rate.pricePerMeter])
  ) as Record<string, number>;
  const rollingCalculatedParts = rollingParts.map((part) => {
    const lookupKey = `${part.material.toLowerCase()}|${part.thicknessMm}`;
    const rateFromTable = rollingRateByKey[lookupKey];
    const effectiveRate = Number.isFinite(rateFromTable) ? rateFromTable : part.pricePerMeter;
    const diameterMm = Math.max(0, part.diameterMm || 0);
    const heightMm = Math.max(0, part.heightMm || 0);
    const autoRollingLengthMm = diameterMm > 0 ? Math.PI * diameterMm : 0;
    const effectiveRollingLengthMm = (part.rollingLengthMm || 0) > 0 ? (part.rollingLengthMm || 0) : autoRollingLengthMm;
    const metersPerPart = effectiveRollingLengthMm / 1000;
    const areaSqmPerPart = (effectiveRollingLengthMm * heightMm) / 1e6;
    const thicknessM = Math.max(0, part.thicknessMm || 0) / 1000;
    const density = densityByMaterial[part.material] ?? 7850;
    const weightKgPerPart = areaSqmPerPart * thicknessM * density;
    const totalMeters = metersPerPart * (part.quantity || 0);
    const totalAreaSqm = areaSqmPerPart * (part.quantity || 0);
    const totalWeightKg = weightKgPerPart * (part.quantity || 0);
    const lineTotal = totalMeters * (effectiveRate || 0);
    return {
      ...part,
      effectiveRate,
      effectiveRollingLengthMm,
      metersPerPart,
      totalMeters,
      areaSqmPerPart,
      totalAreaSqm,
      weightKgPerPart,
      totalWeightKg,
      lineTotal
    };
  });
  const rollingSubTotal = rollingCalculatedParts.reduce((sum, part) => sum + part.lineTotal, 0);
  const rollingVat = (rollingSubTotal * parsedVatRate) / 100;
  const rollingTotal = rollingSubTotal + rollingVat;
  const rollingTotalMeters = rollingCalculatedParts.reduce((sum, part) => sum + part.totalMeters, 0);
  const rollingTotalAreaSqm = rollingCalculatedParts.reduce((sum, part) => sum + part.totalAreaSqm, 0);
  const rollingTotalWeightKg = rollingCalculatedParts.reduce((sum, part) => sum + part.totalWeightKg, 0);
  const quoteGrandTotal =
    (Number(quoteLaserCuttingAmount) || 0) +
    (Number(quotePunchingAmount) || 0) +
    (Number(quoteFabricationAmount) || 0) +
    (Number(quoteTankManufacturingAmount) || 0) +
    weldingTotal +
    bendingTotal +
    rollingTotal;
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
  const activeQuoteStockPart =
    calculatedParts[selectedQuotePartIndex ?? -1] ??
    calculatedParts[0] ??
    null;

  useEffect(() => {
    if (!activeQuoteStockPart || activeQuoteStockPart.material.trim().length === 0 || activeQuoteStockPart.thicknessMm <= 0) {
      setStockQuoteSuggestion(null);
      setStockQuoteOffcutMatch(null);
      return;
    }
    void fetchStockSuggestion(
      {
        material: activeQuoteStockPart.material,
        thickness: activeQuoteStockPart.thicknessMm,
        width: activeQuoteStockPart.lengthMm,
        height: activeQuoteStockPart.widthMm
      },
      "quote"
    );
    void fetchOffcutIntelligenceMatch(
      {
        material: activeQuoteStockPart.material,
        thickness: activeQuoteStockPart.thicknessMm,
        width: activeQuoteStockPart.lengthMm,
        height: activeQuoteStockPart.widthMm,
        quoteId: quoteNumber || null,
        partDnaId: activeQuoteStockPart.partDnaId ?? null,
        entityLabel: activeQuoteStockPart.name
      },
      "quote"
    );
  }, [activeQuoteStockPart?.material, activeQuoteStockPart?.thicknessMm, activeQuoteStockPart?.lengthMm, activeQuoteStockPart?.widthMm, activeQuoteStockPart?.partDnaId, quoteNumber]);

  const laserSubTotal = calculatedParts.reduce((sum, part) => sum + part.lineTotal, 0);
  const laserVat = (laserSubTotal * parsedVatRate) / 100;
  const laserTotal = laserSubTotal + laserVat;
  const recommendedNesting = nestingResults.length
    ? nestingResults
        .slice()
        .sort((a, b) => a.plateCount - b.plateCount || a.wastePercent - b.wastePercent)[0]
    : null;

  if (isScanPage) {
    return (
      <div
        style={{
          background: "#1e1f22",
          color: "white",
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          padding: "28px 20px"
        }}
      >
        <div
          style={{
            width: "min(1040px, 96vw)",
            background: "#232428",
            padding: 16,
            borderRadius: 12,
            border: "1px solid #31343b"
          }}
        >
          <div
            style={{
              background: "#1b1c1f",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <h2 style={{ margin: 0, fontSize: 22 }}>Job Card Scan</h2>
            <BrandWordmark compact subtitle="Scan Operations" />
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12, padding: "0 2px" }}>
            Scan QR, verify all job details, capture checked quantities, then complete.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 14 }}>
            <input
              value={scanToken}
              onChange={(e) => setScanToken(e.target.value)}
              placeholder="QR token"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #333",
                background: "#1b1c1f",
                color: "white"
              }}
            />
            <button
              onClick={() => void loadScanJob(scanToken)}
              disabled={scanLoading || !scanToken.trim()}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #444",
                background: "#232428",
                color: "white",
                cursor: scanLoading || !scanToken.trim() ? "not-allowed" : "pointer",
                opacity: scanLoading || !scanToken.trim() ? 0.6 : 1
              }}
            >
              {scanLoading ? "Loading..." : "Load Job"}
            </button>
          </div>

          {scanJob ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ background: "#1b1c1f", border: "1px solid #343842", borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{scanJob.jobNumber}</div>
                <div style={{ fontSize: 13, opacity: 0.9 }}>{scanJob.title}</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
                  Customer: {scanJob.customerName ?? "-"} | Quote: {scanJob.quoteNumber ?? "-"} | Assigned: {scanJob.assignedTo ?? "-"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Status: {scanJob.status} | Created: {new Date(scanJob.createdAt).toLocaleString("en-ZA")}
                </div>
              </div>

              <div style={{ background: "#1b1c1f", border: "1px solid #343842", borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Imported Files</div>
                {(scanJob.fileLinks ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>No imported files.</div>
                ) : (
                  <div style={{ display: "grid", gap: 4 }}>
                    {scanJob.fileLinks.map((file) => (
                      <div key={file.fileName} style={{ fontSize: 12, opacity: 0.9 }}>
                        {file.fileName}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: "#1b1c1f", border: "1px solid #343842", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>Part Quantity Check</div>
                  <input
                    value={scanQuantity}
                    onChange={(e) => setScanQuantity(e.target.value)}
                    placeholder={`Overall checked qty (expected ${scanJob.quantityExpected ?? "-"})`}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#232428",
                      color: "white"
                    }}
                  />
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {(scanJob.jobDxfParts ?? []).map((part) => (
                    <div
                      key={part.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "70px 1fr 90px 90px 140px",
                        gap: 8,
                        alignItems: "center",
                        background: "#232428",
                        border: "1px solid #2d3340",
                        borderRadius: 8,
                        padding: 8
                      }}
                    >
                      <div
                        style={{
                          width: 66,
                          height: 66,
                          borderRadius: 6,
                          overflow: "hidden",
                          border: "1px solid #334155",
                          background: "#0b1220",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        {part.thumbnailDataUrl ? (
                          <img src={part.thumbnailDataUrl} alt={part.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: 10, opacity: 0.65 }}>No thumb</span>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{part.name}</div>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>
                          {part.widthMm} x {part.heightMm} mm | Layer: {part.layer}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Expected: {part.quantity}</div>
                      <input
                        value={scanPartQuantities[part.id] ?? ""}
                        onChange={(e) =>
                          setScanPartQuantities((current) => ({ ...current, [part.id]: e.target.value }))
                        }
                        placeholder="Checked"
                        style={{
                          width: "100%",
                          padding: 8,
                          borderRadius: 8,
                          border: "1px solid #333",
                          background: "#1b1c1f",
                          color: "white"
                        }}
                      />
                      <div style={{ fontSize: 11, opacity: 0.75 }}>
                        Cut {part.cutLengthMm} mm | Pierce {part.pierceCount}
                      </div>
                    </div>
                  ))}
                  {(scanJob.jobDxfParts ?? []).length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>No DXF parts on this job card.</div>
                  ) : null}
                </div>
              </div>

              <button
                onClick={submitScan}
                disabled={scanSubmitting}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid #444",
                  background: "#5865f2",
                  color: "white",
                  cursor: scanSubmitting ? "not-allowed" : "pointer",
                  opacity: scanSubmitting ? 0.7 : 1
                }}
              >
                {scanSubmitting ? "Checking..." : "Done (Complete Quantity Check)"}
              </button>

              {scanShortageNoteUrl ? (
                <button
                  onClick={() => window.open(scanShortageNoteUrl, "_blank")}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #7f1d1d",
                    background: "#450a0a",
                    color: "#fecaca",
                    cursor: "pointer"
                  }}
                >
                  Open Shortage Note PDF
                </button>
              ) : null}
            </div>
          ) : null}

          {scanStatus ? <div style={{ marginTop: 12, fontSize: 12 }}>{scanStatus}</div> : null}
        </div>
      </div>
    );
  }

  if ((!token || !user) && !offlineBootMode) {
    return (
      <div
        data-qx-ui
        style={{
          background: "#0f1115",
          color: UI.colors.text,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          position: "relative",
          overflow: "hidden",
          fontFamily: UI.fontFamily
        }}
      >
        <DesignSystemStyles />
        <img
          src={BRAND_LOGO_SRC}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity: 0.15,
            filter: "blur(1px) saturate(1.03)",
            pointerEvents: "none",
            userSelect: "none",
            transform: "scale(1.04)"
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at center, rgba(15, 17, 21, 0.26) 0%, rgba(15, 17, 21, 0.68) 58%, rgba(15, 17, 21, 0.92) 100%)",
            pointerEvents: "none"
          }}
        />
        <Card
          style={{
            width: 460,
            padding: 28,
            position: "relative",
            zIndex: 1,
            background: "rgba(16, 20, 28, 0.88)",
            border: `1px solid ${UI.colors.borderStrong}`,
            boxShadow: "0 28px 80px rgba(0,0,0,0.28)"
          }}
        >
          <div
            style={{
              marginBottom: 24,
              padding: "6px 2px 4px"
            }}
          >
            <BrandWordmark subtitle="Quotes Jobs Invoices" showIcon={false} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
              {authMode === "login" ? "Sign in" : "Create account"}
            </h2>
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "rgba(209, 213, 219, 0.74)" }}>
              {authMode === "login"
                ? "Access quotes, jobs, invoices, and customer workflows."
                : "Create your workspace and start managing quotes, jobs, invoices, and customers."}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
            />
            <Input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
            />
            {authMode === "login" ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: UI.colors.muted }}>
                <input
                  type="checkbox"
                  checked={authRemember}
                  onChange={(e) => setAuthRemember(e.target.checked)}
                />
                Remember my details
              </label>
            ) : null}
            {authMode === "register" ? (
              <>
                <Input
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Your name"
                />
                <Input
                  value={authWorkspaceName}
                  onChange={(e) => setAuthWorkspaceName(e.target.value)}
                  placeholder="Company name"
                />
              </>
            ) : null}
            {authError ? <div style={{ color: "#f87171", fontSize: 12 }}>{authError}</div> : null}
            {apiRuntimeStatus.packaged && apiRuntimeStatus.running === false && apiRuntimeStatus.mode !== "gateway" ? (
              <Card
                compact
                style={{
                  background: "rgba(127, 29, 29, 0.18)",
                  border: "1px solid rgba(248, 113, 113, 0.35)"
                }}
              >
                <SectionHeader
                  title={apiRuntimeStatus.mode === "gateway" ? "Render API Not Reachable" : "Local API Not Running"}
                  subtitle={`Current API URL: ${effectiveApiUrl}`}
                />
                <div style={{ fontSize: 12, lineHeight: 1.5, color: "#fca5a5" }}>
                  {apiRuntimeStatus.error ??
                    (apiRuntimeStatus.mode === "gateway"
                      ? "The public Render API could not be reached."
                      : "The packaged backend did not start.")}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    onClick={() => {
                      void restartRuntimeApi();
                    }}
                    disabled={authBusy}
                    variant="secondary"
                  >
                    Restart API
                  </Button>
                  <Button
                    onClick={() => {
                      void openRuntimeApiLogs();
                    }}
                    variant="danger"
                  >
                    Open Logs
                  </Button>
                </div>
              </Card>
            ) : null}
            {authMode === "login" && authEmail.trim() ? (
              <div style={{ fontSize: 12, color: "rgba(209, 213, 219, 0.74)" }}>
                Payment Ref: <span style={{ color: "white", fontWeight: 700 }}>{loginPaymentReference}</span>
              </div>
            ) : null}
            <Button
              onClick={handleAuth}
              disabled={authBusy}
              variant="primary"
            >
              {authMode === "login" ? "Sign in" : "Create account"}
            </Button>
            {authMode === "login" ? (
              <>
                {renderSubscriptionPaymentDetails(loginPaymentReference)}
                <div style={{ fontSize: 11, color: "rgba(209, 213, 219, 0.74)", lineHeight: 1.5 }}>
                  Use the payment reference shown above when paying by EFT. Once payment is confirmed by the main admin, sign in again.
                </div>
              </>
            ) : null}
            <Button
              onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
              variant="secondary"
              style={{ color: UI.colors.muted }}
            >
              {authMode === "login" ? "Need an account?" : "Already have an account?"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div
      data-qx-ui
      style={{
        background: UI.colors.appBg,
        color: UI.colors.text,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: UI.fontFamily
      }}
    >
      <DesignSystemStyles />
      <div
        style={{
          padding: "16px 24px 14px",
          background: "linear-gradient(180deg, rgba(22, 26, 33, 0.98) 0%, rgba(24, 28, 34, 0.98) 100%)",
          borderBottom: "1px solid transparent"
        }}
      >
        <BrandWordmark compact subtitle={activeServer?.name ?? "Quotes Jobs Invoices"} />
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div
        style={{
          width: 88,
          background: UI.colors.shellBg,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          borderRight: "1px solid transparent"
        }}
      >
        {visibleSidebarItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              if (!canOpenViewMode(item.id)) return;
              setViewMode(item.id as typeof viewMode);
            }}
            style={{
              width: 60,
              minHeight: 60,
              padding: 8,
              borderRadius: UI.radius.lg,
              border: viewMode === item.id ? `1px solid ${UI.colors.borderStrong}` : `1px solid ${UI.colors.border}`,
              background: viewMode === item.id ? "rgba(28, 53, 42, 0.82)" : "rgba(255,255,255,0.03)",
              color: UI.colors.text,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 11,
              boxShadow: viewMode === item.id ? "0 0 0 1px rgba(112, 255, 163, 0.2) inset, 0 12px 24px rgba(0,0,0,0.2)" : UI.shadow.subtle,
              transition: UI.transition
            }}
          >
            {item.id === "ai_assistant" ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <div style={{ color: "#ffffff", fontSize: 18, fontWeight: 800, lineHeight: 1 }}>SQ</div>
              </div>
            ) : (
              item.label
            )}
          </button>
        ))}
      </div>

      {viewMode === "settings" ? (
      <div
        style={{
          width: 320,
          background: UI.colors.pageBg,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          borderRight: `1px solid ${UI.colors.border}`
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{activeServer?.name ?? "Qouterx Workspace"}</div>
          <Button onClick={logout} variant="secondary" style={{ minHeight: 34, padding: "8px 10px", fontSize: 12 }}>
            Log out
          </Button>
        </div>

        <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>Workspace</div>
        <select value={workspaceId ?? ""} onChange={(e) => setWorkspaceId(e.target.value)} style={{ marginBottom: 16 }}>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>

        <div style={{ opacity: 0.9, marginBottom: 16, fontSize: 16, fontWeight: 700 }}>Workspace Panel</div>
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

        {canManageAccounts ? (
          <>
            <div style={{ opacity: 0.9, marginBottom: 8 }}>Users</div>
            <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 8 }}>
              Total users: {workspaceUsers.length} · Logged in: {workspaceUsers.filter((member) => member.isLoggedIn).length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
              {workspaceUsers.map((member) => {
                const isPaid = member.subscriptionState === "active";
                const isLockedOrUnpaid = member.subscriptionState !== "active";
                return (
                <div
                  key={member.id}
                  style={{
                    fontSize: 12,
                    padding: "8px 8px 10px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8,
                    background: isLockedOrUnpaid ? "rgba(127, 29, 29, 0.18)" : "rgba(22, 101, 52, 0.12)",
                    border: isLockedOrUnpaid ? "1px solid rgba(239, 68, 68, 0.35)" : "1px solid rgba(34, 197, 94, 0.24)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ color: isLockedOrUnpaid ? "#fca5a5" : "white" }}>
                      {member.name ?? member.email} <span style={{ opacity: 0.6 }}>({member.role})</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <div
                        style={{
                          padding: "3px 7px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 800,
                          background: member.isLoggedIn ? "rgba(34, 197, 94, 0.18)" : "rgba(71, 85, 105, 0.24)",
                          color: member.isLoggedIn ? "#86efac" : "#cbd5e1"
                        }}
                      >
                        {member.isLoggedIn ? "Logged In" : "Logged Out"}
                      </div>
                      <div
                        style={{
                          padding: "3px 7px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 800,
                          background:
                            member.subscriptionState === "active"
                              ? "rgba(34, 197, 94, 0.18)"
                              : member.subscriptionState === "locked"
                                ? "rgba(239, 68, 68, 0.2)"
                                : "rgba(251, 191, 36, 0.2)",
                          color:
                            member.subscriptionState === "active"
                              ? "#86efac"
                              : member.subscriptionState === "locked"
                                ? "#fecaca"
                                : "#fde68a"
                        }}
                      >
                        {member.subscriptionState === "active"
                          ? "Subscription Active"
                          : member.subscriptionState === "locked"
                            ? "Locked"
                            : "Activation Needed"}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.74, marginTop: 2 }}>{member.email}</div>
                  <div style={{ fontSize: 11, opacity: 0.78, marginTop: 2, color: isLockedOrUnpaid ? "#fecaca" : "#bbf7d0" }}>
                    Ref: {member.userRef ?? member.id}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.82, marginTop: 2, color: isLockedOrUnpaid ? "#f87171" : "#86efac" }}>
                    {member.ownerLocked
                      ? "Locked · Payment required"
                      : member.manualPaidUntil
                        ? `Paid until ${new Date(member.manualPaidUntil * 1000).toLocaleDateString()}`
                        : "Not paid yet"}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>
                    Active sessions: {member.sessionCount ?? 0}
                    {member.lastSessionAt ? ` · Last login ${new Date(member.lastSessionAt).toLocaleString("en-ZA")}` : " · No login recorded"}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button
                      onClick={() => {
                        void updateUserBillingAccess(member.id, "unlock");
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid #166534",
                        background: "#16a34a",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 11
                      }}
                    >
                      Activate 30 Days
                    </button>
                    <button
                      onClick={() => {
                        void updateUserBillingAccess(member.id, "lock");
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid #7f1d1d",
                        background: "#991b1b",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 11
                      }}
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              )})}
              {workspaceUsers.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.6 }}>No users found yet.</div>
              ) : null}
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
          </>
        ) : null}

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
        <UpdateStatusCard
          currentVersion={appVersion}
          updateStatus={updateStatus}
          updateBusy={updateBusy}
          updateActionError={updateActionError}
          onCheck={() => {
            void requestDesktopUpdateCheck();
          }}
          onInstall={() => {
            void installDesktopUpdateNow();
          }}
        />
        {renderSubscriptionPaymentDetails(billingCompany?.manualPaymentReference ?? billing.paymentReference ?? accountPaymentReference)}
        <button
          onClick={() => setViewMode("billing")}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "#3b3d43",
            color: "white",
            cursor: "pointer",
            marginBottom: 6
          }}
        >
          Open Billing Screen
        </button>
        {canManageAccounts ? (
          <button
            onClick={() => setViewMode("admin_subscriptions")}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #166534",
              background: "#14532d",
              color: "white",
              cursor: "pointer"
            }}
          >
            Open Admin Subscriptions
          </button>
        ) : null}
      </div>
      ) : null}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div
          style={{
            padding: "18px 24px",
            borderBottom: `1px solid ${UI.colors.border}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "rgba(18, 21, 27, 0.72)"
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.1 }}>
            {viewMode === "chat"
              ? `# ${roomId}`
              : viewMode === "billing"
              ? "Billing / Subscription"
              : viewMode === "brain_center"
              ? "Brain Center"
              : viewMode === "manufacturing_memory"
              ? "Manufacturing Memory"
              : viewMode === "profit_intelligence"
              ? "Profit Intelligence"
              : viewMode === "material_prediction"
              ? "Material Prediction"
              : viewMode === "ai_production_queue"
              ? "AI Production Queue"
              : viewMode === "lead_time_intelligence"
              ? "Lead Time Intelligence"
              : viewMode === "sheet_optimizer"
              ? "Auto Sheet Optimizer"
              : viewMode === "nesting_intelligence"
              ? "Smart AI Nesting"
              : viewMode === "nesting_workspace"
              ? "Nesting"
              : viewMode === "nesting_studio"
              ? "Nesting"
              : viewMode === "dxf_error_detection"
              ? "DXF Error Detection"
              : viewMode === "production_assistant"
              ? "Production Assistant"
              : viewMode === "jobs"
              ? "Job Board"
              : viewMode === "part_dna"
              ? "Part DNA"
              : viewMode === "quotes"
              ? "Quotes"
              : viewMode === "tank"
              ? "Tank Calculator"
              : viewMode === "email"
              ? "Email"
              : viewMode === "documents"
              ? "Documents"
              : viewMode === "customers"
              ? "Customers"
              : viewMode === "image_dxf"
              ? "Image to DXF"
              : viewMode === "ai_assistant"
              ? "AI Assistant"
              : viewMode === "admin_subscriptions"
              ? "Admin Subscriptions"
              : viewMode === "company_live"
              ? "Company Live Dashboard"
              : viewMode === "files"
              ? "File Organizer"
              : viewMode === "settings"
              ? "Settings"
              : "QR Station"}
          </div>
        </div>

        {viewMode === "settings" ? (
          <PageContainer>
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

            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Email Settings (SMTP + IMAP)</div>
                  <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>Use Gmail with a Google app password, or enter custom mail server settings.</div>
                </div>
                <button
                  onClick={applyGmailEmailPreset}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(96,165,250,0.45)",
                    background: "rgba(37,99,235,0.22)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 700,
                    whiteSpace: "nowrap"
                  }}
                >
                  Add Gmail
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input
                  value={emailSettings.smtpHost}
                  onChange={(e) => setEmailSettings((current) => ({ ...current, smtpHost: e.target.value }))}
                  placeholder="SMTP host (e.g. smtp.gmail.com)"
                  style={{ gridColumn: "span 2", padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={emailSettings.smtpPort}
                  onChange={(e) => setEmailSettings((current) => ({ ...current, smtpPort: Number(e.target.value) || 587 }))}
                  placeholder="SMTP port"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#d1d5db" }}>
                  <input
                    type="checkbox"
                    checked={emailSettings.smtpSecure}
                    onChange={(e) => setEmailSettings((current) => ({ ...current, smtpSecure: e.target.checked }))}
                  />
                  Use secure SMTP
                </label>
                <input
                  value={emailSettings.smtpUser}
                  onChange={(e) => setEmailSettings((current) => ({ ...current, smtpUser: e.target.value }))}
                  placeholder="SMTP username"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  type="text"
                  value={emailSettings.smtpPass}
                  onChange={(e) => setEmailSettings((current) => ({ ...current, smtpPass: e.target.value }))}
                  placeholder="SMTP password / app password"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={emailSettings.imapHost}
                  onChange={(e) => setEmailSettings((current) => ({ ...current, imapHost: e.target.value }))}
                  placeholder="IMAP host (e.g. imap.gmail.com)"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={emailSettings.imapPort}
                  onChange={(e) => setEmailSettings((current) => ({ ...current, imapPort: Number(e.target.value) || 993 }))}
                  placeholder="IMAP port"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#d1d5db" }}>
                  <input
                    type="checkbox"
                    checked={emailSettings.imapSecure}
                    onChange={(e) => setEmailSettings((current) => ({ ...current, imapSecure: e.target.checked }))}
                  />
                  Use secure IMAP
                </label>
                <div />
                <input
                  value={emailSettings.imapUser}
                  onChange={(e) => setEmailSettings((current) => ({ ...current, imapUser: e.target.value }))}
                  placeholder="IMAP username"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  type="text"
                  value={emailSettings.imapPass}
                  onChange={(e) => setEmailSettings((current) => ({ ...current, imapPass: e.target.value }))}
                  placeholder="IMAP password / app password"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={emailSettings.fromName}
                  onChange={(e) => setEmailSettings((current) => ({ ...current, fromName: e.target.value }))}
                  placeholder="From name"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={emailSettings.fromEmail}
                  onChange={(e) => setEmailSettings((current) => ({ ...current, fromEmail: e.target.value }))}
                  placeholder="From email"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <label style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#d1d5db" }}>
                  <input
                    type="checkbox"
                    checked={emailSettings.autoNotifyJobDone}
                    onChange={(e) => setEmailSettings((current) => ({ ...current, autoNotifyJobDone: e.target.checked }))}
                  />
                  Auto-email customer when job is marked done
                </label>
                <div style={{ gridColumn: "span 2", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    onClick={() => {
                      void saveEmailSettings();
                    }}
                    disabled={emailSettingsSaving}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: "#16a34a",
                      color: "white",
                      cursor: emailSettingsSaving ? "not-allowed" : "pointer",
                      fontWeight: 700
                    }}
                  >
                    {emailSettingsSaving ? "Saving..." : "Save Email Settings"}
                  </button>
                  <button
                    onClick={() => {
                      void linkInboxWithImapSettings();
                    }}
                    disabled={emailSettingsSaving || emailLinkingInbox}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #2563eb",
                      background: "#1d4ed8",
                      color: "white",
                      cursor: emailSettingsSaving || emailLinkingInbox ? "not-allowed" : "pointer",
                      fontWeight: 700
                    }}
                  >
                    {emailLinkingInbox ? "Linking Inbox..." : "Link Inbox With IMAP"}
                  </button>
                </div>
                {emailImapLinkStatus ? (
                  <div
                    style={{
                      gridColumn: "span 2",
                      borderRadius: 8,
                      padding: "10px 12px",
                      border: emailImapLinkStatus.toLowerCase().includes("failed") || emailImapLinkStatus.toLowerCase().includes("error")
                        ? "1px solid rgba(248,113,113,0.45)"
                        : "1px solid rgba(34,197,94,0.4)",
                      background: emailImapLinkStatus.toLowerCase().includes("failed") || emailImapLinkStatus.toLowerCase().includes("error")
                        ? "rgba(127,29,29,0.28)"
                        : "rgba(20,83,45,0.24)",
                      color: "white",
                      fontSize: 12
                    }}
                  >
                    {emailImapLinkStatus}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Device Access</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <input
                  value={deviceId}
                  readOnly
                  placeholder="Device ID"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
                <input
                  value={redeemAccessCode}
                  onChange={(e) => setRedeemAccessCode(e.target.value.toUpperCase())}
                  placeholder="Access code"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={() => {
                    void redeemDeviceAccessCode();
                  }}
                  disabled={redeemBusy}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #444",
                    background: "#2563eb",
                    color: "white",
                    cursor: redeemBusy ? "not-allowed" : "pointer",
                    fontWeight: 700
                  }}
                >
                  {redeemBusy ? "Applying..." : "Apply Code"}
                </button>
                <button
                  onClick={() => {
                    void refreshDeviceAccess();
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #444",
                    background: "#374151",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 700
                  }}
                >
                  Refresh Access
                </button>
              </div>
              {deviceAccessStatus ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>{deviceAccessStatus}</div> : null}
              {deviceAllowedFeatures ? (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                  Allowed: {deviceAllowedFeatures.join(", ")}
                </div>
              ) : null}
              {redeemStatus ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>{redeemStatus}</div> : null}
            </div>

            {isAppOwner ? (
              <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Access Code Generator</div>
                {!generatorUnlocked ? (
                  <>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                      Enter your login password to unlock generator access.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="password"
                        value={unlockPassword}
                        onChange={(e) => setUnlockPassword(e.target.value)}
                        placeholder="Your login password"
                        style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                      />
                      <button
                        onClick={() => {
                          void unlockCodeGenerator();
                        }}
                        disabled={generatorBusy}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1px solid #444",
                          background: "#7c3aed",
                          color: "white",
                          cursor: generatorBusy ? "not-allowed" : "pointer",
                          fontWeight: 700
                        }}
                      >
                        {generatorBusy ? "Checking..." : "Unlock"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                      Select the app parts this code will allow on the other computer.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 8, marginBottom: 10 }}>
                      {APP_FEATURE_OPTIONS.map((feature) => {
                        const selected = generatorSelectedFeatures.includes(feature.id);
                        return (
                          <label
                            key={feature.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "6px 8px",
                              borderRadius: 8,
                              border: "1px solid #333",
                              background: selected ? "#1e3a8a33" : "#111",
                              fontSize: 12
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => {
                                setGeneratorSelectedFeatures((current) => {
                                  if (e.target.checked) return [...new Set([...current, feature.id])];
                                  return current.filter((entry) => entry !== feature.id);
                                });
                              }}
                            />
                            {feature.label}
                          </label>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => {
                        void generateAccessCode();
                      }}
                      disabled={generatorBusy}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #444",
                        background: "#16a34a",
                        color: "white",
                        cursor: generatorBusy ? "not-allowed" : "pointer",
                        fontWeight: 700
                      }}
                    >
                      {generatorBusy ? "Generating..." : "Generate Code"}
                    </button>
                    {generatedAccessCode ? (
                      <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid #3b3d43", background: "#111", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
                        {generatedAccessCode}
                      </div>
                    ) : null}
                  </>
                )}
                {generatorStatus ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>{generatorStatus}</div> : null}
              </div>
            ) : null}

          </PageContainer>
        ) : viewMode === "chat" ? (
          <>
            <PageContainer style={{ padding: 20, display: "grid", gridTemplateColumns: canManageAccounts ? "320px minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 14, minHeight: 0 }}>
              {canManageAccounts ? (
                <div style={{ border: `1px solid ${UI.colors.border}`, borderRadius: 12, overflow: "hidden", background: "#151922" }}>
                  <div style={{ padding: 14, fontWeight: 800, borderBottom: `1px solid ${UI.colors.border}` }}>
                    User Chats
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 260px)", overflow: "auto" }}>
                    {supportThreads.map((thread) => (
                      <button
                        key={thread.threadKey}
                        onClick={() => setSelectedSupportThreadKey(thread.threadKey)}
                        style={{
                          textAlign: "left",
                          padding: 12,
                          border: "none",
                          borderBottom: `1px solid ${UI.colors.border}`,
                          background: selectedSupportThread?.threadKey === thread.threadKey ? "#1f2a44" : "transparent",
                          color: "white",
                          cursor: "pointer"
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>{thread.userName || thread.userEmail}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted }}>{thread.workspaceName}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                          {thread.messages[thread.messages.length - 1]?.text ?? "No messages"}
                        </div>
                      </button>
                    ))}
                    {!supportThreads.length ? (
                      <div style={{ padding: 14, color: UI.colors.muted, fontSize: 13 }}>
                        No support chats yet.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div style={{ border: `1px solid ${UI.colors.border}`, borderRadius: 12, overflow: "hidden", background: "#151922", display: "flex", flexDirection: "column", minHeight: 520 }}>
                <div style={{ padding: 14, borderBottom: `1px solid ${UI.colors.border}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {canManageAccounts
                        ? selectedSupportThread
                          ? `${selectedSupportThread.userName || selectedSupportThread.userEmail}`
                          : "Select a user chat"
                        : "Chat To Main User"}
                    </div>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>
                      {canManageAccounts
                        ? selectedSupportThread?.userEmail ?? "Only you can see all support chats."
                        : "Send problems or requests directly to the owner."}
                    </div>
                  </div>
                  <Button onClick={() => void loadSupportThreads()} variant="secondary" disabled={supportLoading}>
                    {supportLoading ? "Loading..." : "Refresh"}
                  </Button>
                </div>

                <div style={{ flex: 1, padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                  {(selectedSupportThread?.messages ?? []).map((message) => {
                    const mine = canManageAccounts ? message.fromOwner : !message.fromOwner;
                    return (
                      <div
                        key={message.id}
                        style={{
                          alignSelf: mine ? "flex-end" : "flex-start",
                          maxWidth: "76%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: mine ? "#2563eb" : "#232833",
                          color: "white",
                          border: `1px solid ${mine ? "rgba(96,165,250,0.45)" : UI.colors.border}`
                        }}
                      >
                        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
                          {message.fromOwner ? "Owner" : message.userName || message.userEmail} · {formatDateTime(message.createdAt)}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
                      </div>
                    );
                  })}
                  {!selectedSupportThread && !canManageAccounts ? (
                    <div style={{ color: UI.colors.muted }}>No messages yet. Send the first message below.</div>
                  ) : null}
                  {!selectedSupportThread && canManageAccounts ? (
                    <div style={{ color: UI.colors.muted }}>Select a user on the left to reply.</div>
                  ) : null}
                </div>
                {supportStatus ? <div style={{ padding: "0 16px 10px", color: "#fca5a5", fontSize: 12 }}>{supportStatus}</div> : null}
              </div>
            </PageContainer>

            <div style={{ padding: 20, borderTop: `1px solid ${UI.colors.border}`, display: "flex", gap: 8 }}>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
                placeholder={canManageAccounts ? "Reply to selected user" : "Message the main user"}
                style={{ flex: 1, background: "#11161f" }}
              />
              <Button onClick={send} variant="primary" disabled={canManageAccounts && !selectedSupportThread}>
                Send
              </Button>
            </div>
          </>
        ) : viewMode === "billing" ? (
          <PageContainer>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: 16 }}>
              <Card>
                <SectionHeader
                  title="Billing / Subscription"
                  subtitle="Use your unique reference when paying by EFT. Your account will be reactivated once payment is confirmed."
                />
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Company: <b>{billingCompany?.companyName ?? workspaces.find((entry) => entry.id === workspaceId)?.name ?? "—"}</b>
                </div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Current plan: <b>{billingCompany?.planName ?? "Qouter X Standard"}</b>
                </div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Subscription status: <b style={{ textTransform: "capitalize" }}>{billing.status ?? "unknown"}</b>
                </div>
                {billing.status === "pending" ? (
                  <div style={{ fontSize: 12, color: "#fcd34d", marginBottom: 12 }}>
                    Your account request has been sent. Waiting for admin approval.
                  </div>
                ) : null}
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Expiry date: <b>{formatPeriodEnd(billing.currentPeriodEnd)}</b>
                </div>
                <div style={{ fontSize: 13, marginBottom: 12 }}>
                  Grace period: <b>{billing.graceUntil ? formatDateTime(billing.graceUntil) : "—"}</b>
                </div>
                {renderSubscriptionPaymentDetails(
                  billingCompany?.manualPaymentReference ?? billing.paymentReference ?? accountPaymentReference
                )}
                <div style={{ fontSize: 12, color: "#f8d48f", marginBottom: 12 }}>
                  Use this reference when paying:{" "}
                  <b>{billingCompany?.manualPaymentReference ?? billing.paymentReference ?? accountPaymentReference}</b>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <Input
                    value={billingProofAmount}
                    onChange={(e) => setBillingProofAmount(e.target.value)}
                    placeholder="Payment amount"
                  />
                  <Input
                    value={billingProofNotes}
                    onChange={(e) => setBillingProofNotes(e.target.value)}
                    placeholder="Proof notes / message to admin"
                  />
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setBillingProofFile(e.target.files?.[0] ?? null)}
                    style={{ fontSize: 12 }}
                  />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Button onClick={() => void uploadBillingProof()} disabled={billingBusy} variant="primary">
                      Upload Proof Of Payment
                    </Button>
                    <Button
                      onClick={() => {
                        void refreshBilling();
                        void refreshBillingCompany();
                      }}
                      disabled={billingBusy}
                      variant="secondary"
                    >
                      Sync Now
                    </Button>
                  </div>
                  <div style={{ fontSize: 12, color: UI.colors.muted }}>
                    Contact admin. Your account will be reactivated once payment is confirmed.
                  </div>
                  {billingStatusMessage ? <div style={{ fontSize: 12, color: "#86efac" }}>{billingStatusMessage}</div> : null}
                  {billing.status === "pending" ? (
                    <div style={{ fontSize: 12, color: "#fcd34d" }}>
                      Waiting for admin approval. This laptop will receive the subscription update on the next sync.
                    </div>
                  ) : null}
                  {workspaceLocked ? (
                    <div style={{ fontSize: 12, color: "#fca5a5" }}>
                      Your Qouter X subscription has expired. Please make payment using reference{" "}
                      <b>{billingCompany?.manualPaymentReference ?? billing.paymentReference ?? accountPaymentReference}</b> and contact admin.
                    </div>
                  ) : null}
                </div>
              </Card>
              <div style={{ display: "grid", gap: 16 }}>
                <Card>
                  <SectionHeader title="Pending Payments" subtitle="Local proofs are saved first and stay pending until the main admin confirms them." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {billingPayments.map((payment) => (
                      <div key={payment.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 700 }}>{formatRand(payment.amount)}</div>
                          <StatusBadge tone={payment.confirmedByAdmin ? "success" : "warning"}>
                            {payment.confirmedByAdmin ? "Confirmed" : "Pending"}
                          </StatusBadge>
                        </div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                          {payment.paymentReference} · {formatDateTime(payment.paymentDate)}
                        </div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                          {payment.notes || "No notes"}
                        </div>
                      </div>
                    ))}
                    {billingPayments.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No payment proofs uploaded yet.</div>
                    ) : null}
                  </div>
                </Card>
                <Card>
                  <SectionHeader title="Devices Last Seen" subtitle="Each laptop reports back independently. These check-ins do not depend on your local Wi-Fi IP." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {billingDevices.map((device) => (
                      <div key={device.deviceId} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ fontWeight: 700 }}>{device.deviceName}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted }}>{device.deviceId}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted }}>Last seen {formatDateTime(device.lastSeenAt)}</div>
                      </div>
                    ))}
                    {billingDevices.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No devices have checked in yet.</div>
                    ) : null}
                  </div>
                </Card>
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "admin_subscriptions" ? (
          <PageContainer>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
              <Card><div style={{ fontSize: 12, color: UI.colors.muted }}>Pending Requests</div><div style={{ fontSize: 28, fontWeight: 800 }}>{pendingAccountRequests.length}</div></Card>
              <Card><div style={{ fontSize: 12, color: UI.colors.muted }}>Active</div><div style={{ fontSize: 28, fontWeight: 800 }}>{adminSubscriptions?.activeAccounts ?? 0}</div></Card>
              <Card><div style={{ fontSize: 12, color: UI.colors.muted }}>Expired</div><div style={{ fontSize: 28, fontWeight: 800 }}>{adminSubscriptions?.expiredAccounts ?? 0}</div></Card>
              <Card><div style={{ fontSize: 12, color: UI.colors.muted }}>Expiring Soon</div><div style={{ fontSize: 28, fontWeight: 800 }}>{adminSubscriptions?.expiringSoon ?? 0}</div></Card>
              <Card><div style={{ fontSize: 12, color: UI.colors.muted }}>Suspended</div><div style={{ fontSize: 28, fontWeight: 800 }}>{adminSubscriptions?.suspendedAccounts ?? 0}</div></Card>
              <Card><div style={{ fontSize: 12, color: UI.colors.muted }}>Connected Devices</div><div style={{ fontSize: 28, fontWeight: 800 }}>{adminSubscriptions?.devices.length ?? 0}</div></Card>
            </div>
            {accountRequestToast ? (
              <Card compact style={{ marginBottom: 16, border: "1px solid rgba(250, 204, 21, 0.35)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>New Qouter X account request</div>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>{accountRequestToast}</div>
                  </div>
                  <Button onClick={() => setAccountRequestToast(null)} variant="secondary">Dismiss</Button>
                </div>
              </Card>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(340px, 0.8fr)", gap: 16 }}>
              <Card>
                <SectionHeader title="Admin Subscriptions" subtitle="Main admin manually renews, suspends, cancels, and confirms EFT payments." />
                <div style={{ display: "grid", gap: 12 }}>
                  {pendingAccountRequests.length > 0 ? (
                    <Card compact style={{ border: "1px solid rgba(250, 204, 21, 0.35)", background: "rgba(120, 53, 15, 0.16)" }}>
                      <div style={{ fontWeight: 800, marginBottom: 10 }}>Pending Account Requests</div>
                      <div style={{ display: "grid", gap: 10 }}>
                        {pendingAccountRequests.map((request) => (
                          <div key={request.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                            <div style={{ fontWeight: 800 }}>{request.companyName}</div>
                            <div style={{ fontSize: 12, color: UI.colors.muted }}>{request.contactName || request.email}</div>
                            <div style={{ fontSize: 12, color: UI.colors.muted }}>{request.deviceName} · {request.platform}</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                              <Button onClick={() => void approveAccountRequest(request.id, 1)} variant="primary">Approve</Button>
                              <Button onClick={() => void rejectAccountRequest(request.id)} variant="danger">Reject</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : null}
                  {(adminSubscriptions?.companies ?? []).map((company) => (
                    <div key={company.id} style={{ padding: 14, borderRadius: 14, border: `1px solid ${UI.colors.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{company.companyName}</div>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>{company.email || "No contact email"}</div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                            Plan {company.planName} · Ref {company.manualPaymentReference}
                          </div>
                        </div>
                        <StatusBadge
                          tone={
                            company.resolvedStatus === "active" || company.resolvedStatus === "trial"
                              ? "success"
                              : company.resolvedStatus === "expired"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {company.resolvedStatus}
                        </StatusBadge>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 12, fontSize: 12 }}>
                        <div>Expiry: <b>{company.subscriptionEndDate ? formatDateTime(company.subscriptionEndDate) : "—"}</b></div>
                        <div>Days left: <b>{company.expiresInDays}</b></div>
                        <div>Days expired: <b>{company.expiredDays}</b></div>
                        <div>Last seen: <b>{company.lastSeenAt ? formatDateTime(company.lastSeenAt) : "Never"}</b></div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                        <Button onClick={() => void adminUpdateSubscriptionStatus(company.id, "active")} variant="secondary">Unlock</Button>
                        <Button onClick={() => void adminStartSubscriptionCycle(company.id, 1)} variant="secondary">Start Subscription Cycle</Button>
                        <Button onClick={() => void adminRenewSubscription(company.id, 1)} variant="primary">Renew 1 Month</Button>
                        <Button onClick={() => void adminRenewSubscription(company.id, 3)} variant="primary">Renew 3 Months</Button>
                        <Button onClick={() => void adminRenewSubscription(company.id, 12)} variant="primary">Renew 12 Months</Button>
                        <Button onClick={() => void adminUpdateSubscriptionStatus(company.id, "suspended")} variant="danger">Suspend</Button>
                        <Button onClick={() => void adminUpdateSubscriptionStatus(company.id, "cancelled")} variant="danger">Cancel</Button>
                        <Button onClick={() => void loadAdminSubscriptionDetail(company.id)} variant="secondary">View Payments</Button>
                        <Button onClick={() => void adminAddSubscriptionNote(company.id, company.notes)} variant="secondary">Add Note</Button>
                      </div>
                      {company.notes ? <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 10 }}>Note: {company.notes}</div> : null}
                    </div>
                  ))}
                  {(adminSubscriptions?.companies.length ?? 0) === 0 ? (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>No company subscriptions found yet.</div>
                  ) : null}
                </div>
              </Card>
              <Card>
                <SectionHeader title="Payments / Audit" subtitle="Open a company to confirm payment proofs and inspect the renewal history." />
                <div style={{ display: "grid", gap: 12 }}>
                  {(adminSubscriptionDetail?.payments ?? []).map((payment) => (
                    <div key={payment.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 700 }}>{formatRand(payment.amount)}</div>
                        <StatusBadge tone={payment.confirmedByAdmin ? "success" : "warning"}>
                          {payment.confirmedByAdmin ? "Confirmed" : "Pending"}
                        </StatusBadge>
                      </div>
                      <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>{payment.paymentReference}</div>
                      <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>{payment.proofFilePath ?? "No proof file path"}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        {!payment.confirmedByAdmin ? (
                          <Button
                            onClick={() => {
                              if (!adminSubscriptionDetail) return;
                              void adminConfirmPayment(payment.id, adminSubscriptionDetail.companyId);
                            }}
                            variant="primary"
                          >
                            Confirm Payment
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {(adminSubscriptionDetail?.payments.length ?? 0) === 0 ? (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>No payment proofs selected yet.</div>
                  ) : null}
                  <div style={{ borderTop: `1px solid ${UI.colors.border}`, paddingTop: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Audit Log</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {(adminSubscriptionDetail?.auditLog ?? []).map((entry) => (
                        <div key={entry.id} style={{ fontSize: 12, color: UI.colors.muted }}>
                          <b>{entry.action}</b> · {formatDateTime(entry.createdAt)}
                          {entry.adminNote ? ` · ${entry.adminNote}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                  {billingStatusMessage ? <div style={{ fontSize: 12, color: "#86efac" }}>{billingStatusMessage}</div> : null}
                </div>
              </Card>
            </div>
          </PageContainer>
        ) : viewMode === "brain_center" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <SectionHeader title="Brain Center" subtitle="One connected intelligence layer across pricing, stock, queueing, DXF quality, and admin sync." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void runBrainOrchestrator("quick")} variant="secondary">Run Quick</Button>
                    <Button onClick={() => void runBrainOrchestrator("full")} variant="primary">Run Full</Button>
                    <Button onClick={() => void refreshBrainCenter()} variant="secondary">Refresh</Button>
                  </div>
                </div>
                {brainError ? (
                  <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{brainError}</div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: 10 }}>
                  {[
                    { label: "Open recommendations", value: brainDashboard?.topRecommendations.length ?? 0 },
                    { label: "Profit today", value: ZAR_FORMATTER.format(brainDashboard?.profitSummary.profitToday ?? 0) },
                    { label: "Profit month", value: ZAR_FORMATTER.format(brainDashboard?.profitSummary.profitMonth ?? 0) },
                    { label: "Shortages", value: brainDashboard?.materialShortages.length ?? 0 },
                    { label: "Offcut matches", value: brainDashboard?.offcutOpportunities.length ?? 0 },
                    { label: "Lead-time risks", value: brainDashboard?.leadTimeRisks.length ?? 0 },
                    { label: "DXF issues", value: brainDashboard?.dxfErrors.length ?? 0 },
                    { label: "Pending sync", value: brainDashboard?.syncHealth.pendingSyncEvents ?? 0 }
                  ].map((entry) => (
                    <div key={entry.label} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>{entry.label}</div>
                      <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{entry.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)", gap: 16 }}>
                <Card>
                  <SectionHeader title="Top Recommendations" subtitle="Shared actions collected from all Brain modules." />
                  <div style={{ display: "grid", gap: 12 }}>
                    {brainRecommendations.map((recommendation) => {
                      const payload = (() => {
                        try {
                          return JSON.parse(recommendation.payloadJson || "{}") as Record<string, unknown>;
                        } catch {
                          return {};
                        }
                      })();
                      return (
                        <div key={recommendation.id} style={{ padding: 14, borderRadius: 14, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                            <div>
                              <div style={{ fontWeight: 800 }}>{recommendation.title}</div>
                              <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>{recommendation.message}</div>
                            </div>
                            <StatusBadge
                              tone={
                                recommendation.status === "accepted"
                                  ? "success"
                                  : recommendation.status === "dismissed"
                                    ? "danger"
                                    : "warning"
                              }
                            >
                              {recommendation.status}
                            </StatusBadge>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12, fontSize: 12 }}>
                            <div>Module: <b>{recommendation.moduleName}</b></div>
                            <div>Confidence: <b>{Math.round(recommendation.confidence * 100)}%</b></div>
                            <div>Impact: <b>{recommendation.impactScore}</b></div>
                          </div>
                          {"entityType" in payload || "entityId" in payload ? (
                            <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 8 }}>
                              Target: {String(payload.entityType ?? "entity")} / {String(payload.entityId ?? "unknown")}
                            </div>
                          ) : null}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                            <Button
                              onClick={() => void updateBrainRecommendationStatus(recommendation.id, "accepted")}
                              variant="primary"
                              disabled={recommendation.status === "accepted"}
                            >
                              Accept
                            </Button>
                            <Button
                              onClick={() => void updateBrainRecommendationStatus(recommendation.id, "dismissed")}
                              variant="secondary"
                              disabled={recommendation.status === "dismissed"}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {!brainLoading && brainRecommendations.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No recommendations yet.</div>
                    ) : null}
                  </div>
                </Card>
                <Card>
                  <SectionHeader title="Sync Health" subtitle="Subscription and admin reporting health across local and cloud sync." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      { label: "Cloud sync", value: brainDashboard?.syncHealth.cloudSyncEnabled ? "Enabled" : "Disabled" },
                      { label: "Pending sync events", value: brainDashboard?.syncHealth.pendingSyncEvents ?? 0 },
                      { label: "Failed sync events", value: brainDashboard?.syncHealth.failedSyncEvents ?? 0 },
                      { label: "Devices seen", value: brainDashboard?.syncHealth.recentDeviceCount ?? 0 },
                      { label: "Recent sync errors", value: brainDashboard?.syncHealth.recentErrorCount ?? 0 },
                      { label: "Active accounts", value: brainDashboard?.syncHealth.activeAccounts ?? 0 },
                      { label: "Expired accounts", value: brainDashboard?.syncHealth.expiredAccounts ?? 0 },
                      { label: "Pending payment proofs", value: brainDashboard?.syncHealth.pendingPaymentProofs ?? 0 }
                    ].map((entry) => (
                      <div key={entry.label} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ color: UI.colors.muted }}>{entry.label}</span>
                        <b>{entry.value}</b>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <SectionHeader title="Profit Warnings" subtitle="Low margin jobs and price pressure." />
                    <Button onClick={() => void openBrainCenterDetail("profit")} variant="secondary">Open</Button>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(brainDashboard?.profitWarnings ?? []).map((entry) => (
                      <div key={entry.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ fontWeight: 700 }}>{entry.jobId || `Profit #${entry.id}`}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                          {entry.material}{entry.thickness ? ` · ${entry.thickness}mm` : ""} · Margin {entry.marginPercent.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 6 }}>
                          Gross profit {ZAR_FORMATTER.format(entry.grossProfit)}
                        </div>
                      </div>
                    ))}
                    {!(brainDashboard?.profitWarnings.length) ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No profit warnings.</div> : null}
                  </div>
                </Card>
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <SectionHeader title="Material Shortages" subtitle="Forecasted shortages and buying pressure." />
                    <Button onClick={() => void openBrainCenterDetail("materials")} variant="secondary">Open</Button>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(brainDashboard?.materialShortages ?? []).map((entry, index) => (
                      <div key={`${entry.material}-${entry.thickness}-${index}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ fontWeight: 700 }}>{entry.material} · {entry.thickness}mm</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                          Need {entry.predictedSheetsNeeded.toFixed(2)} sheets in {entry.forecastPeriodDays} days
                        </div>
                        <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 6 }}>
                          Short by {entry.shortageSheets.toFixed(2)} · Buy {entry.recommendedBuySheets.toFixed(2)}
                        </div>
                      </div>
                    ))}
                    {!(brainDashboard?.materialShortages.length) ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No shortages predicted.</div> : null}
                  </div>
                </Card>
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <SectionHeader title="Offcut Opportunities" subtitle="Best current offcut reuse opportunities." />
                    <Button onClick={() => void openBrainCenterDetail("offcuts")} variant="secondary">Open</Button>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(brainDashboard?.offcutOpportunities ?? []).map((entry) => (
                      <div key={entry.recommendation.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ fontWeight: 700 }}>{entry.recommendation.title}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>{entry.recommendation.message}</div>
                        {entry.offcut ? (
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>
                            Offcut #{entry.offcut.id} · {entry.offcut.material} · {entry.offcut.thickness}mm · {entry.offcut.width} x {entry.offcut.height} mm
                          </div>
                        ) : null}
                        {entry.latestMatch ? (
                          <div style={{ fontSize: 12, color: "#86efac", marginTop: 6 }}>
                            {entry.latestMatch.fitType} fit · Saving {ZAR_FORMATTER.format(entry.latestMatch.savingEstimate)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {!(brainDashboard?.offcutOpportunities.length) ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No offcut matches right now.</div> : null}
                  </div>
                </Card>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <SectionHeader title="Queue Plan" subtitle="Current AI production order and savings." />
                    <Button onClick={() => void openBrainCenterDetail("queue")} variant="secondary">Open</Button>
                  </div>
                  {brainDashboard?.queuePlan ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ fontWeight: 800 }}>{brainDashboard.queuePlan.title}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                          {brainDashboard.queuePlan.status} · {Math.round(brainDashboard.queuePlan.totalEstimatedMinutes)} min · setup saving {Math.round(brainDashboard.queuePlan.setupSavingMinutes)} min · material saving {ZAR_FORMATTER.format(brainDashboard.queuePlan.materialSavingEstimate)}
                        </div>
                      </div>
                      {brainDashboard.queuePlan.items.slice(0, 6).map((item, index) => (
                        <div key={`${item.jobId}-${index}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontWeight: 700 }}>Job #{item.jobId}</div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>{item.reason}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>No queue plan generated yet.</div>
                  )}
                </Card>
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <SectionHeader title="Lead-Time Risks" subtitle="Predicted late jobs and schedule pressure." />
                    <Button onClick={() => void openBrainCenterDetail("lead_time")} variant="secondary">Open</Button>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(brainDashboard?.leadTimeRisks ?? []).map((entry) => (
                      <div key={entry.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ fontWeight: 700 }}>Job #{entry.jobId ?? "?"}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                          Finish {formatDateTime(entry.estimatedFinishAt)} · {Math.round(entry.confidence * 100)}% confidence
                        </div>
                        <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 6 }}>
                          {entry.riskWarnings.join(" • ")}
                        </div>
                      </div>
                    ))}
                    {!(brainDashboard?.leadTimeRisks.length) ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No lead-time risks recorded.</div> : null}
                  </div>
                </Card>
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <SectionHeader title="DXF Errors" subtitle="Recent files with cut-risk warnings or critical issues." />
                    <Button onClick={() => void openBrainCenterDetail("dxf_errors")} variant="secondary">Open</Button>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(brainDashboard?.dxfErrors ?? []).map((entry) => (
                      <div key={entry.dxfFileId} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ fontWeight: 700 }}>{entry.dxfFileId}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                          Critical {entry.criticalCount} · Warning {entry.warningCount} · Info {entry.infoCount}
                        </div>
                        <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 6 }}>{formatDateTime(entry.latestAt)}</div>
                      </div>
                    ))}
                    {!(brainDashboard?.dxfErrors.length) ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No DXF issues captured.</div> : null}
                  </div>
                </Card>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <SectionHeader title="Recent Events" subtitle="Shared event stream across all Brain modules." />
                    <Button onClick={() => void openBrainCenterDetail("events")} variant="secondary">Open</Button>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {brainEvents.map((event) => {
                      const payload = (() => {
                        try {
                          return JSON.parse(event.payloadJson || "{}") as Record<string, unknown>;
                        } catch {
                          return {};
                        }
                      })();
                      return (
                        <div key={event.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <div style={{ fontWeight: 800 }}>{event.eventType.replace(/_/g, " ")}</div>
                            <div style={{ fontSize: 11, color: UI.colors.muted }}>{formatDateTime(event.createdAt)}</div>
                          </div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                            {event.entityType} · {event.entityId}
                          </div>
                          {Object.keys(payload).length > 0 ? (
                            <pre
                              style={{
                                margin: "10px 0 0",
                                padding: 10,
                                borderRadius: 10,
                                background: "rgba(2,6,23,0.56)",
                                border: `1px solid ${UI.colors.border}`,
                                color: UI.colors.muted,
                                fontSize: 11,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word"
                              }}
                            >
                              {JSON.stringify(payload, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      );
                    })}
                    {!brainLoading && brainEvents.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No brain events captured yet.</div>
                    ) : null}
                  </div>
                </Card>
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <SectionHeader title="Nesting and Purchasing" subtitle="Material buy signals and grouped nesting opportunities." />
                    <Button onClick={() => void openBrainCenterDetail("nesting_purchasing")} variant="secondary">Open</Button>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(brainDashboard?.purchaseRecommendations ?? []).slice(0, 4).map((entry) => (
                      <div key={entry.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 700 }}>{entry.material} · {entry.thickness}mm</div>
                          <StatusBadge tone={entry.urgency === "urgent" ? "danger" : entry.urgency === "normal" ? "warning" : "info"}>{entry.urgency}</StatusBadge>
                        </div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>{entry.reason}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>
                          Buy {entry.recommendedQuantity} {entry.unit} · est. {ZAR_FORMATTER.format(entry.estimatedCost)}
                        </div>
                      </div>
                    ))}
                    {(brainDashboard?.nestingPlans ?? []).slice(0, 4).map((entry) => (
                      <div key={entry.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ fontWeight: 700 }}>{entry.material} · {entry.thickness}mm</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                          Waste {entry.wastePercent.toFixed(1)}% · Saving {ZAR_FORMATTER.format(entry.estimatedSaving)} · {entry.status}
                        </div>
                      </div>
                    ))}
                    {!brainLoading && !(brainDashboard?.purchaseRecommendations.length || brainDashboard?.nestingPlans.length) ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No purchasing or nesting intelligence yet.</div>
                    ) : null}
                  </div>
                </Card>
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <SectionHeader title="Production Assistant" subtitle="Factory questions using queue, stock, profit, DXF, and offcut data." />
                    <Button onClick={() => void openBrainCenterDetail("production_assistant")} variant="secondary">Open</Button>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>
                      Ask what to cut next, which jobs are late, which DXFs have issues, and what material needs buying.
                    </div>
                    {productionAssistantMessages.length ? (
                      <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ fontWeight: 700 }}>Latest answer</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4, lineHeight: 1.45 }}>
                          {productionAssistantMessages[0]?.text.slice(0, 180)}
                          {productionAssistantMessages[0]?.text.length > 180 ? "..." : ""}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No assistant conversation yet.</div>
                    )}
                  </div>
                </Card>
              </div>

              {brainCenterDetail ? (
                <Card style={{ scrollMarginTop: 16 }} className="brain-center-detail-card">
                  <div data-brain-detail="true" style={{ position: "relative", top: -16 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                    <SectionHeader
                      title={
                        brainCenterDetail === "profit"
                          ? "Profit Details"
                          : brainCenterDetail === "materials"
                            ? "Material Shortage Details"
                            : brainCenterDetail === "offcuts"
                              ? "Offcut Opportunity Details"
                              : brainCenterDetail === "queue"
                                ? "Queue Plan Details"
                                : brainCenterDetail === "lead_time"
                                  ? "Lead-Time Details"
                                  : brainCenterDetail === "dxf_errors"
                                    ? "DXF Error Details"
                                    : brainCenterDetail === "events"
                                      ? "Recent Event Details"
                                      : "Nesting and Purchasing Details"
                      }
                      subtitle="Detailed information opened from Brain Center."
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {brainCenterDetail === "profit" ? <Button onClick={() => void refreshProfitIntelligence()} variant="secondary">Refresh</Button> : null}
                      {brainCenterDetail === "materials" ? <Button onClick={() => void refreshMaterialPrediction()} variant="secondary">Refresh</Button> : null}
                      {brainCenterDetail === "queue" ? <Button onClick={() => void refreshProductionQueueBrain()} variant="secondary">Refresh</Button> : null}
                      {brainCenterDetail === "lead_time" && activeLeadTimeJob ? (
                        <Button onClick={() => void predictLeadTime(activeLeadTimeJob.id)} variant="secondary">Refresh</Button>
                      ) : null}
                      {brainCenterDetail === "nesting_purchasing" ? (
                        <>
                          <Button onClick={() => void refreshMaterialPrediction()} variant="secondary">Refresh Buying</Button>
                          <Button onClick={() => void refreshNestingPlans()} variant="secondary">Refresh Nests</Button>
                        </>
                      ) : null}
                      <Button onClick={() => setBrainCenterDetail(null)} variant="secondary">Close</Button>
                    </div>
                  </div>

                  {brainCenterDetail === "profit" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)", gap: 16 }}>
                      <div style={{ display: "grid", gap: 10 }}>
                        <SectionHeader title="Warnings" subtitle="Low-margin and underpriced work." />
                        {(brainDashboard?.profitWarnings ?? []).map((entry) => (
                          <div key={entry.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontWeight: 800 }}>{entry.jobId || `Profit #${entry.id}`}</div>
                              <StatusBadge tone={entry.marginPercent < 12 ? "danger" : "warning"}>{entry.marginPercent.toFixed(1)}%</StatusBadge>
                            </div>
                            <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>
                              Revenue {formatRand(entry.revenue)} · Cost {formatRand(entry.totalCost)} · Profit {formatRand(entry.grossProfit)}
                            </div>
                          </div>
                        ))}
                        {!(brainDashboard?.profitWarnings.length) ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No profit warnings.</div> : null}
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <SectionHeader title="Insights" subtitle="Stored pricing and customer profitability signals." />
                        {profitInsights.slice(0, 8).map((insight) => (
                          <div key={insight.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontWeight: 800 }}>{insight.title}</div>
                              <StatusBadge tone={insight.insightType.includes("low") || insight.insightType.includes("underpriced") ? "warning" : "info"}>
                                {Math.round(insight.confidence * 100)}%
                              </StatusBadge>
                            </div>
                            <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{insight.message}</div>
                          </div>
                        ))}
                        {!profitInsights.length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No extra profit insight loaded yet.</div> : null}
                      </div>
                    </div>
                  ) : null}

                  {brainCenterDetail === "materials" ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      {(materialShortages.length ? materialShortages : brainDashboard?.materialShortages ?? []).map((entry, index) => (
                        <div key={`${entry.material}-${entry.thickness}-${index}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontWeight: 800 }}>{entry.material} · {entry.thickness}mm</div>
                            <StatusBadge tone="warning">{entry.recommendedBuySheets.toFixed(2)} buy</StatusBadge>
                          </div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{entry.recommendation}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
                            <div>Window: <b>{entry.forecastPeriodDays}d</b></div>
                            <div>Need: <b>{entry.predictedSheetsNeeded.toFixed(2)}</b></div>
                            <div>Short by: <b>{entry.shortageSheets.toFixed(2)}</b></div>
                            <div>Buy: <b>{entry.recommendedBuySheets.toFixed(2)}</b></div>
                          </div>
                        </div>
                      ))}
                      {!((materialShortages.length ? materialShortages : brainDashboard?.materialShortages ?? []).length) ? (
                        <div style={{ fontSize: 12, color: UI.colors.muted }}>No shortage detail available.</div>
                      ) : null}
                    </div>
                  ) : null}

                  {brainCenterDetail === "offcuts" ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      {(brainDashboard?.offcutOpportunities ?? []).map((entry) => (
                        <div key={entry.recommendation.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontWeight: 800 }}>{entry.recommendation.title}</div>
                            <StatusBadge tone="success">{Math.round(entry.recommendation.confidence * 100)}%</StatusBadge>
                          </div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{entry.recommendation.message}</div>
                          {entry.offcut ? (
                            <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 8 }}>
                              Offcut #{entry.offcut.id} · {entry.offcut.material} · {entry.offcut.thickness}mm · {entry.offcut.width} x {entry.offcut.height} mm
                            </div>
                          ) : null}
                          {entry.latestMatch ? (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
                              <div>Fit: <b>{entry.latestMatch.fitType}</b></div>
                              <div>Waste: <b>{entry.latestMatch.wasteArea.toFixed(2)}</b></div>
                              <div>Saving: <b>{formatRand(entry.latestMatch.savingEstimate)}</b></div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {!(brainDashboard?.offcutOpportunities.length) ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No offcut opportunities right now.</div> : null}
                    </div>
                  ) : null}

                  {brainCenterDetail === "queue" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.05fr)", gap: 16 }}>
                      <div style={{ display: "grid", gap: 10 }}>
                        <SectionHeader title="Current Plan" subtitle="Recommended production order and savings." />
                        {productionQueuePlan || brainDashboard?.queuePlan ? (
                          <>
                            <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                              <div style={{ fontWeight: 800 }}>{(productionQueuePlan ?? brainDashboard?.queuePlan)?.title}</div>
                              <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>
                                Status {(productionQueuePlan ?? brainDashboard?.queuePlan)?.status} · Setup saving {Math.round((productionQueuePlan ?? brainDashboard?.queuePlan)?.setupSavingMinutes ?? 0)} min · Material saving {formatRand((productionQueuePlan ?? brainDashboard?.queuePlan)?.materialSavingEstimate ?? 0)}
                              </div>
                            </div>
                            {((productionQueuePlan ?? brainDashboard?.queuePlan)?.items ?? []).map((item, index) => (
                              <div key={`${item.jobId}-${index}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                                <div style={{ fontWeight: 800 }}>Job #{item.jobId}</div>
                                <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{item.reason}</div>
                              </div>
                            ))}
                          </>
                        ) : (
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>No queue plan detail loaded.</div>
                        )}
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <SectionHeader title="Job Scores" subtitle="Why the Brain ranks jobs where it does." />
                        {productionQueueScores.slice(0, 12).map((entry) => (
                          <div key={entry.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontWeight: 800 }}>Job #{entry.jobId}</div>
                              <b>{entry.score.toFixed(1)}</b>
                            </div>
                            <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{entry.reasons.join(" • ")}</div>
                          </div>
                        ))}
                        {!productionQueueScores.length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No queue scores loaded yet.</div> : null}
                      </div>
                    </div>
                  ) : null}

                  {brainCenterDetail === "lead_time" ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      {leadTimePrediction ? (
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, fontSize: 12 }}>
                            <div>Start: <b>{formatDateTime(leadTimePrediction.estimatedStartAt)}</b></div>
                            <div>Finish: <b>{formatDateTime(leadTimePrediction.estimatedFinishAt)}</b></div>
                            <div>Confidence: <b>{Math.round(leadTimePrediction.confidence * 100)}%</b></div>
                            <div>Queue load: <b>{Math.round(leadTimePrediction.queueLoadMinutes)} min</b></div>
                          </div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 8 }}>{leadTimePrediction.reasons.join(" • ")}</div>
                        </div>
                      ) : null}
                      {(brainDashboard?.leadTimeRisks ?? []).map((entry) => (
                        <div key={entry.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontWeight: 800 }}>Job #{entry.jobId ?? "?"}</div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>
                            Finish {formatDateTime(entry.estimatedFinishAt)} · {Math.round(entry.confidence * 100)}% confidence
                          </div>
                          <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 6 }}>{entry.riskWarnings.join(" • ")}</div>
                        </div>
                      ))}
                      {!leadTimePrediction && !(brainDashboard?.leadTimeRisks.length) ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No lead-time detail loaded yet.</div> : null}
                    </div>
                  ) : null}

                  {brainCenterDetail === "dxf_errors" ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      {(brainDashboard?.dxfErrors ?? []).map((entry) => (
                        <div key={entry.dxfFileId} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontWeight: 800 }}>{entry.dxfFileId}</div>
                            <StatusBadge tone={entry.criticalCount > 0 ? "danger" : entry.warningCount > 0 ? "warning" : "info"}>
                              C{entry.criticalCount} / W{entry.warningCount}
                            </StatusBadge>
                          </div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>
                            Critical {entry.criticalCount} · Warning {entry.warningCount} · Info {entry.infoCount}
                          </div>
                          <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 8 }}>Latest {formatDateTime(entry.latestAt)}</div>
                        </div>
                      ))}
                      {!(brainDashboard?.dxfErrors.length) ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No DXF error detail available.</div> : null}
                    </div>
                  ) : null}

                  {brainCenterDetail === "events" ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      {brainEvents.map((event) => {
                        const payload = (() => {
                          try {
                            return JSON.parse(event.payloadJson || "{}") as Record<string, unknown>;
                          } catch {
                            return {};
                          }
                        })();
                        return (
                          <div key={event.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontWeight: 800 }}>{event.eventType.replace(/_/g, " ")}</div>
                              <div style={{ fontSize: 11, color: UI.colors.muted }}>{formatDateTime(event.createdAt)}</div>
                            </div>
                            <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{event.entityType} · {event.entityId}</div>
                            {Object.keys(payload).length ? (
                              <pre style={{ margin: "10px 0 0", padding: 10, borderRadius: 10, background: "rgba(2,6,23,0.56)", border: `1px solid ${UI.colors.border}`, color: UI.colors.muted, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                {JSON.stringify(payload, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        );
                      })}
                      {!brainEvents.length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No event detail available.</div> : null}
                    </div>
                  ) : null}

                  {brainCenterDetail === "nesting_purchasing" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)", gap: 16 }}>
                      <div style={{ display: "grid", gap: 10 }}>
                        <SectionHeader title="Purchase Suggestions" subtitle="What the Brain thinks should be bought next." />
                        {purchaseRecommendations.slice(0, 10).map((entry) => (
                          <div key={entry.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontWeight: 800 }}>{entry.material} · {entry.thickness}mm</div>
                              <StatusBadge tone={entry.urgency === "urgent" ? "danger" : entry.urgency === "normal" ? "warning" : "info"}>{entry.urgency}</StatusBadge>
                            </div>
                            <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{entry.reason}</div>
                            <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 8 }}>
                              Buy {entry.recommendedQuantity} {entry.unit} · est. {formatRand(entry.estimatedCost)}
                            </div>
                          </div>
                        ))}
                        {!purchaseRecommendations.length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No purchase detail loaded yet.</div> : null}
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <SectionHeader title="Nesting Plans" subtitle="Grouped nest recommendations and savings." />
                        {nestingPlans.slice(0, 8).map((entry) => (
                          <div key={entry.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontWeight: 800 }}>{entry.material} · {entry.thickness}mm</div>
                              <StatusBadge tone={entry.status === "approved" ? "success" : entry.status === "completed" ? "info" : "warning"}>{entry.status}</StatusBadge>
                            </div>
                            <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>
                              Waste {entry.wastePercent.toFixed(1)}% · Saving {formatRand(entry.estimatedSaving)} · Cut {Math.round(entry.estimatedCutTimeMinutes)} min
                            </div>
                          </div>
                        ))}
                        {!nestingPlans.length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No nesting detail loaded yet.</div> : null}
                      </div>
                    </div>
                  ) : null}
                </Card>
              ) : null}
            </div>
          </PageContainer>
        ) : viewMode === "manufacturing_memory" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <SectionHeader title="Manufacturing Memory" subtitle="Workshop memory built from completed work, materials, offcuts, and issues." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void refreshManufacturingMemory()} variant="secondary">Refresh</Button>
                    <Button onClick={() => void rebuildManufacturingMemory()} variant="primary">Rebuild Memory</Button>
                  </div>
                </div>
                {manufacturingMemoryError ? (
                  <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{manufacturingMemoryError}</div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
                  {[
                    { label: "Repeat parts", value: manufacturingMemories.filter((entry) => entry.memoryType === "repeat_customer_part").length },
                    { label: "Difficult parts", value: manufacturingMemories.filter((entry) => entry.memoryType === "difficult_part").length },
                    { label: "Profitable patterns", value: manufacturingPatterns.filter((entry) => entry.patternType === "profitable_job_type").length },
                    { label: "Material patterns", value: manufacturingPatterns.filter((entry) => entry.patternType === "recurring_material_usage").length },
                    { label: "Common issues", value: manufacturingPatterns.filter((entry) => entry.patternType === "common_dxf_error").length }
                  ].map((entry) => (
                    <div key={entry.label} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>{entry.label}</div>
                      <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{entry.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 16 }}>
                <Card>
                  <SectionHeader title="Memories" subtitle="Repeat parts, difficult work, profitability, offcuts, and issues." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {manufacturingMemories.map((memory) => {
                      const payload = (() => {
                        try {
                          return JSON.parse(memory.payloadJson || "{}") as Record<string, unknown>;
                        } catch {
                          return {};
                        }
                      })();
                      return (
                        <div key={memory.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <div style={{ fontWeight: 800 }}>{memory.title}</div>
                            <StatusBadge tone={memory.importanceScore >= 80 ? "danger" : memory.importanceScore >= 60 ? "warning" : "info"}>
                              {memory.memoryType.replace(/_/g, " ")}
                            </StatusBadge>
                          </div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{memory.summary}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
                            <div>Entity: <b>{memory.entityType}</b></div>
                            <div>ID: <b>{memory.entityId}</b></div>
                            <div>Importance: <b>{Math.round(memory.importanceScore)}</b></div>
                          </div>
                          {Object.keys(payload).length ? (
                            <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 8 }}>
                              {typeof payload.customerName === "string" ? `Customer: ${payload.customerName}` : null}
                              {typeof payload.material === "string" ? `${typeof payload.customerName === "string" ? " · " : ""}Material: ${payload.material}` : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {!manufacturingMemoryLoading && manufacturingMemories.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No manufacturing memories captured yet.</div>
                    ) : null}
                    {manufacturingMemoryLoading ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>Loading manufacturing memories...</div>
                    ) : null}
                  </div>
                </Card>

                <Card>
                  <SectionHeader title="Known Patterns" subtitle="Repeatable workshop behavior the Brain can use later." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {manufacturingPatterns.map((pattern) => (
                      <div key={pattern.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <div style={{ fontWeight: 800 }}>{pattern.title}</div>
                          <StatusBadge tone={pattern.confidence >= 0.85 ? "success" : pattern.confidence >= 0.7 ? "warning" : "info"}>
                            {Math.round(pattern.confidence * 100)}%
                          </StatusBadge>
                        </div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{pattern.description}</div>
                        <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 8 }}>
                          {pattern.patternType.replace(/_/g, " ")} · {formatDateTime(pattern.createdAt)}
                        </div>
                      </div>
                    ))}
                    {!manufacturingMemoryLoading && manufacturingPatterns.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No known patterns yet.</div>
                    ) : null}
                  </div>
                </Card>
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "profit_intelligence" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <SectionHeader title="Profit Intelligence" subtitle="Real job profitability by customer, material, and repeat work." />
                  <Button onClick={() => void refreshProfitIntelligence()} variant="secondary">Refresh</Button>
                </div>
                {profitError ? <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{profitError}</div> : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Profit today</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{formatRand(profitSummary?.profitToday ?? 0)}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Profit month</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{formatRand(profitSummary?.profitMonth ?? 0)}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Underpriced jobs</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{profitSummary?.underpricedJobs.length ?? 0}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Price increases</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{profitSummary?.recommendedPriceIncreases.length ?? 0}</div>
                  </div>
                </div>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
                <Card>
                  <SectionHeader title="Best Customers" subtitle="Highest gross profit customers." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {(profitSummary?.bestCustomers ?? []).map((entry) => (
                      <div key={`best-${entry.customerId}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 800 }}>{entry.customerId}</div>
                          <StatusBadge tone="success">{entry.marginPercent.toFixed(1)}%</StatusBadge>
                        </div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>
                          Profit {formatRand(entry.grossProfit)} · Revenue {formatRand(entry.revenue)} · Jobs {entry.jobCount}
                        </div>
                      </div>
                    ))}
                    {!profitLoading && (profitSummary?.bestCustomers.length ?? 0) === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No customer profit data yet.</div>
                    ) : null}
                  </div>
                </Card>

                <Card>
                  <SectionHeader title="Worst Customers" subtitle="Lowest profit or loss customers." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {(profitSummary?.worstCustomers ?? []).map((entry) => (
                      <div key={`worst-${entry.customerId}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 800 }}>{entry.customerId}</div>
                          <StatusBadge tone={entry.grossProfit < 0 ? "danger" : "warning"}>{entry.marginPercent.toFixed(1)}%</StatusBadge>
                        </div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>
                          Profit {formatRand(entry.grossProfit)} · Revenue {formatRand(entry.revenue)} · Jobs {entry.jobCount}
                        </div>
                      </div>
                    ))}
                    {!profitLoading && (profitSummary?.worstCustomers.length ?? 0) === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No low-margin customer data yet.</div>
                    ) : null}
                  </div>
                </Card>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)", gap: 16 }}>
                <Card>
                  <SectionHeader title="Profit Records" subtitle="Calculated revenue, cost, gross profit, and margin per job." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {profitRecords.map((record) => (
                      <div key={record.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <div style={{ fontWeight: 800 }}>{record.jobId ?? `Record ${record.id}`}</div>
                          <StatusBadge tone={record.marginPercent < 12 ? "danger" : record.marginPercent < 25 ? "warning" : "success"}>
                            {record.marginPercent.toFixed(1)}%
                          </StatusBadge>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
                          <div>Revenue: <b>{formatRand(record.revenue)}</b></div>
                          <div>Total Cost: <b>{formatRand(record.totalCost)}</b></div>
                          <div>Gross Profit: <b>{formatRand(record.grossProfit)}</b></div>
                          <div>Material: <b>{record.material}{record.thickness !== null && record.thickness !== undefined ? ` ${record.thickness}mm` : ""}</b></div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8, marginTop: 10, fontSize: 11, color: UI.colors.muted }}>
                          <div>Material {formatRand(record.materialCost)}</div>
                          <div>Cut {formatRand(record.cuttingCost)}</div>
                          <div>Gas {formatRand(record.gasCost)}</div>
                          <div>Labor {formatRand(record.laborCost)}</div>
                          <div>Setup {formatRand(record.setupCost)}</div>
                          <div>Delivery {formatRand(record.deliveryCost)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          {record.jobId ? (
                            <Button onClick={() => void calculateProfitForJob(record.jobId!)} variant="secondary">Recalculate</Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {!profitLoading && profitRecords.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No profit records yet. Calculate profit on a completed job first.</div>
                    ) : null}
                    {profitLoading ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>Loading profit records...</div>
                    ) : null}
                  </div>
                </Card>

                <Card>
                  <SectionHeader title="Insights" subtitle="Underpriced jobs, strong customers, and suggested price increases." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {profitInsights.map((insight) => (
                      <div key={insight.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 800 }}>{insight.title}</div>
                          <StatusBadge tone={insight.insightType === "underpriced_job" || insight.insightType === "price_increase_suggestion" ? "warning" : "info"}>
                            {Math.round(insight.confidence * 100)}%
                          </StatusBadge>
                        </div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{insight.message}</div>
                        <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 8 }}>
                          {insight.insightType.replace(/_/g, " ")} · {formatDateTime(insight.createdAt)}
                        </div>
                      </div>
                    ))}
                    {!profitLoading && profitInsights.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No profit insights yet.</div>
                    ) : null}
                  </div>
                </Card>
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "material_prediction" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <SectionHeader title="Material Prediction" subtitle="Forecast likely material demand from recent jobs, approved quotes, and repeat work." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void refreshMaterialPrediction()} variant="secondary">Refresh</Button>
                    <Button onClick={() => void rebuildMaterialPrediction()} variant="primary">Rebuild Forecast</Button>
                  </div>
                </div>
                {materialPredictionError ? (
                  <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{materialPredictionError}</div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Next 7 days</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>
                      {materialForecasts.filter((entry) => entry.forecastPeriodDays === 7).reduce((sum, entry) => sum + entry.predictedKgNeeded, 0).toFixed(1)} kg
                    </div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Next 30 days</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>
                      {materialForecasts.filter((entry) => entry.forecastPeriodDays === 30).reduce((sum, entry) => sum + entry.predictedKgNeeded, 0).toFixed(1)} kg
                    </div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Likely shortages</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{materialShortages.length}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Avg confidence</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>
                      {materialForecasts.length ? `${Math.round(materialForecasts.reduce((sum, entry) => sum + entry.confidence, 0) / materialForecasts.length * 100)}%` : "0%"}
                    </div>
                  </div>
                </div>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)", gap: 16 }}>
                <Card>
                  <SectionHeader title="Forecast Usage" subtitle="Expected usage over the next 7 and 30 days." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {materialForecasts.map((entry) => (
                      <div key={`${entry.id}-${entry.forecastPeriodDays}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <div style={{ fontWeight: 800 }}>{entry.material} {entry.thickness}mm</div>
                          <StatusBadge tone={entry.confidence >= 0.8 ? "success" : entry.confidence >= 0.6 ? "warning" : "info"}>
                            {Math.round(entry.confidence * 100)}%
                          </StatusBadge>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
                          <div>Window: <b>{entry.forecastPeriodDays}d</b></div>
                          <div>Sheets: <b>{entry.predictedSheetsNeeded.toFixed(2)}</b></div>
                          <div>Weight: <b>{entry.predictedKgNeeded.toFixed(2)} kg</b></div>
                          <div>Signals: <b>{entry.basedOnJobsCount} jobs / {entry.basedOnQuoteCount} quotes</b></div>
                        </div>
                      </div>
                    ))}
                    {!materialPredictionLoading && materialForecasts.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No material forecasts yet. Rebuild the forecast to generate one.</div>
                    ) : null}
                    {materialPredictionLoading ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>Loading material forecasts...</div>
                    ) : null}
                  </div>
                </Card>

                <Card>
                  <SectionHeader title="Likely Shortages" subtitle="Buy recommendations before material runs out." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {materialShortages.map((entry) => (
                      <div key={`${entry.material}-${entry.thickness}-${entry.forecastPeriodDays}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <div style={{ fontWeight: 800 }}>{entry.material} {entry.thickness}mm</div>
                          <StatusBadge tone="warning">{entry.recommendedBuySheets} buy</StatusBadge>
                        </div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{entry.recommendation}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
                          <div>Window: <b>{entry.forecastPeriodDays}d</b></div>
                          <div>Shortage: <b>{entry.shortageSheets.toFixed(2)} sheets</b></div>
                          <div>Stock now: <b>{entry.availableEquivalentSheets.toFixed(2)} eq</b></div>
                        </div>
                        <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 8 }}>
                          Confidence {Math.round(entry.confidence * 100)}% · Lead time {entry.leadTimeDays} days
                          {entry.preferredSupplier ? ` · Supplier ${entry.preferredSupplier}` : ""}
                        </div>
                      </div>
                    ))}
                    {!materialPredictionLoading && materialShortages.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No likely shortages detected right now.</div>
                    ) : null}
                  </div>
                </Card>
              </div>

              <Card>
                <SectionHeader title="Purchasing Intelligence" subtitle="What to buy next, why it matters, and how urgent it is." />
                <div style={{ display: "grid", gap: 10 }}>
                  {purchaseRecommendations.map((entry) => (
                    <div key={entry.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div style={{ fontWeight: 800 }}>
                          {entry.material} {entry.thickness}mm
                        </div>
                        <StatusBadge tone={entry.urgency === "urgent" ? "danger" : entry.urgency === "normal" ? "warning" : "info"}>
                          {entry.urgency}
                        </StatusBadge>
                      </div>
                      <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{entry.reason}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
                        <div>Buy: <b>{entry.recommendedQuantity} {entry.unit}</b></div>
                        <div>Est. cost: <b>{formatRand(entry.estimatedCost)}</b></div>
                        <div>Status: <b>{entry.status}</b></div>
                        <div>Supplier: <b>{entry.preferredSupplier ?? "Any"}</b></div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        <Button onClick={() => void updatePurchaseRecommendation(entry.id, "mark-ordered")} variant="primary">
                          Mark Ordered
                        </Button>
                        <Button onClick={() => void updatePurchaseRecommendation(entry.id, "dismiss")} variant="secondary">
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!materialPredictionLoading && purchaseRecommendations.length === 0 ? (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>No purchase suggestions right now.</div>
                  ) : null}
                </div>
              </Card>
            </div>
          </PageContainer>
        ) : viewMode === "ai_production_queue" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <SectionHeader title="AI Production Queue" subtitle="Recommended job order using urgency, due dates, stock, offcuts, material risk, and Part DNA history." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void refreshProductionQueueBrain()} variant="secondary">Refresh</Button>
                    <Button onClick={() => void createProductionQueuePlan()} variant="primary">Create Plan</Button>
                  </div>
                </div>
                {productionQueueError ? (
                  <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{productionQueueError}</div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Current plan</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{productionQueuePlan?.title ?? "None"}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Est. run time</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{Math.round(productionQueuePlan?.totalEstimatedMinutes ?? 0)} min</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Setup saving</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{Math.round(productionQueuePlan?.setupSavingMinutes ?? 0)} min</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Material saving</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{formatRand(productionQueuePlan?.materialSavingEstimate ?? 0)}</div>
                  </div>
                </div>
                {productionQueuePlan ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {productionQueuePlan.status !== "active" ? (
                      <Button onClick={() => void updateProductionQueuePlan(productionQueuePlan.id, "start")} variant="primary">Start Plan</Button>
                    ) : null}
                    {productionQueuePlan.status !== "completed" ? (
                      <Button onClick={() => void updateProductionQueuePlan(productionQueuePlan.id, "complete")} variant="secondary">Complete Plan</Button>
                    ) : null}
                    <StatusBadge tone={productionQueuePlan.status === "active" ? "success" : productionQueuePlan.status === "completed" ? "info" : "warning"}>
                      {productionQueuePlan.status}
                    </StatusBadge>
                  </div>
                ) : null}
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)", gap: 16 }}>
                <Card>
                  <SectionHeader title="Recommended Order" subtitle="Best run sequence with reasons for each job." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {productionQueuePlan?.items.map((item) => {
                      const jobScore = productionQueueScores.find((entry) => entry.jobId === item.jobId);
                      const jobDetails = smartQueueJobs.find((entry) => entry.id === item.jobId);
                      const reasons = jobScore ? (() => {
                        try {
                          return JSON.parse(jobScore.reasonsJson) as string[];
                        } catch {
                          return [];
                        }
                      })() : [];
                      return (
                        <div key={item.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <div style={{ fontWeight: 800 }}>
                              #{item.sortOrder + 1} {jobDetails?.jobNumber ?? `Job ${item.jobId}`} {jobDetails?.title ?? ""}
                            </div>
                            <StatusBadge tone={jobDetails?.priority === "urgent" ? "danger" : jobDetails?.ready ? "success" : "warning"}>
                              Score {Math.round(jobScore?.score ?? 0)}
                            </StatusBadge>
                          </div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{item.reason}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
                            <div>Material: <b>{jobDetails?.material ?? "—"}</b></div>
                            <div>Thickness: <b>{jobDetails?.thickness ?? "—"}{jobDetails?.thickness ? "mm" : ""}</b></div>
                            <div>Cut time: <b>{jobDetails?.estimatedCutTimeMinutes ?? 0} min</b></div>
                            <div>Status: <b>{jobDetails?.status ?? "—"}</b></div>
                          </div>
                          {reasons.length ? (
                            <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 8 }}>
                              {reasons.slice(0, 5).join(" • ")}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {!productionQueueLoading && !productionQueuePlan ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No AI production plan yet. Create one to see the recommended order.</div>
                    ) : null}
                    {productionQueueLoading ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>Loading AI production queue...</div>
                    ) : null}
                  </div>
                </Card>

                <Card>
                  <SectionHeader title="Score Reasons" subtitle="Why jobs moved up or down in the queue." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {productionQueueScores.map((entry) => {
                      const jobDetails = smartQueueJobs.find((job) => job.id === entry.jobId);
                      const reasons = (() => {
                        try {
                          return JSON.parse(entry.reasonsJson) as string[];
                        } catch {
                          return [];
                        }
                      })();
                      return (
                        <div key={`${entry.id}-${entry.jobId}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontWeight: 800 }}>{jobDetails?.jobNumber ?? `Job ${entry.jobId}`}</div>
                            <StatusBadge tone={entry.score >= 500 ? "danger" : entry.score >= 250 ? "warning" : "info"}>
                              {Math.round(entry.score)}
                            </StatusBadge>
                          </div>
                          <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 8 }}>
                            {reasons.length ? reasons.join(" • ") : "No reasons captured."}
                          </div>
                        </div>
                      );
                    })}
                    {!productionQueueLoading && productionQueueScores.length === 0 ? (
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>No queue scores yet.</div>
                    ) : null}
                  </div>
                </Card>
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "lead_time_intelligence" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <SectionHeader title="Lead Time Intelligence" subtitle="Predict realistic start and finish dates from queue load, stock position, capacity, and Part DNA history." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void refreshSmartQueue()} variant="secondary">Refresh Jobs</Button>
                    <Button
                      onClick={() => activeLeadTimeJob ? void predictLeadTime(activeLeadTimeJob.id) : undefined}
                      variant="primary"
                      disabled={!activeLeadTimeJob}
                    >
                      Predict Lead Time
                    </Button>
                  </div>
                </div>
                {leadTimeError ? (
                  <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{leadTimeError}</div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) minmax(0, 1fr)", gap: 16, alignItems: "end" }}>
                  <div>
                    <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>Job</div>
                    <select
                      value={activeLeadTimeJob?.id ?? ""}
                      onChange={(event) => {
                        const nextId = Number(event.target.value);
                        setSmartQueueSelectedJobId(Number.isFinite(nextId) ? nextId : null);
                      }}
                      style={{ width: "100%" }}
                    >
                      {smartQueueJobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.jobNumber} · {job.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                    <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>Estimated start</div>
                      <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{leadTimePrediction ? formatDateTime(leadTimePrediction.estimatedStartAt) : "—"}</div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>Estimated finish</div>
                      <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{leadTimePrediction ? formatDateTime(leadTimePrediction.estimatedFinishAt) : "—"}</div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>Confidence</div>
                      <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{leadTimePrediction ? `${Math.round(leadTimePrediction.confidence * 100)}%` : "—"}</div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>Queue load</div>
                      <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{leadTimePrediction ? `${Math.round(leadTimePrediction.queueLoadMinutes)} min` : "—"}</div>
                    </div>
                  </div>
                </div>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
                <Card>
                  <SectionHeader title="Prediction Detail" subtitle="Main timing drivers behind this completion estimate." />
                  {leadTimeLoading ? (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Calculating lead time...</div>
                  ) : leadTimePrediction ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, fontSize: 12 }}>
                        <div>Setup: <b>{Math.round(leadTimePrediction.setupMinutes)} min</b></div>
                        <div>Cut: <b>{Math.round(leadTimePrediction.adjustedCutTimeMinutes)} min</b></div>
                        <div>Stock delay: <b>{leadTimePrediction.stockDelayDays.toFixed(1)} d</b></div>
                        <div>Similar jobs: <b>{leadTimePrediction.similarHistorySamples}</b></div>
                      </div>
                      {leadTimePrediction.reasons.map((reason, index) => (
                        <div key={`${index}-${reason}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}`, fontSize: 12 }}>
                          {reason}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Select a job and run the predictor.</div>
                  )}
                </Card>

                <Card>
                  <SectionHeader title="Risk Warnings" subtitle="Things most likely to push the finish date out." />
                  {leadTimeLoading ? (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Checking risks...</div>
                  ) : leadTimePrediction?.riskWarnings.length ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      {leadTimePrediction.riskWarnings.map((warning, index) => (
                        <div key={`${index}-${warning}`} style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(248,113,113,0.35)", background: "rgba(127,29,29,0.16)" }}>
                          <div style={{ fontSize: 12, color: "#fecaca" }}>{warning}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>No major risk warnings on the current prediction.</div>
                  )}
                </Card>
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "sheet_optimizer" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <SectionHeader title="Auto Sheet Optimizer" subtitle="Compare offcuts, full sheets, and order-required cases before quoting or cutting." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void refreshStock()} variant="secondary">Refresh Stock</Button>
                    <Button onClick={() => void runSheetOptimization()} variant="primary">Optimize</Button>
                  </div>
                </div>
                {sheetOptimizerError ? (
                  <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{sheetOptimizerError}</div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) repeat(4, minmax(0, 1fr))", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>Linked job</div>
                    <select
                      value={activeSheetOptimizerJob?.id ?? ""}
                      onChange={(event) => {
                        const nextId = Number(event.target.value);
                        setSmartQueueSelectedJobId(Number.isFinite(nextId) ? nextId : null);
                      }}
                      style={{ width: "100%" }}
                    >
                      {smartQueueJobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.jobNumber} · {job.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>Material</div>
                    <Input value={sheetOptimizerMaterial} onChange={(event) => setSheetOptimizerMaterial(event.target.value)} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>Thickness (mm)</div>
                    <Input value={sheetOptimizerThickness} onChange={(event) => setSheetOptimizerThickness(event.target.value)} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>Required Width (mm)</div>
                    <Input value={sheetOptimizerWidth} onChange={(event) => setSheetOptimizerWidth(event.target.value)} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>Required Height (mm)</div>
                    <Input value={sheetOptimizerHeight} onChange={(event) => setSheetOptimizerHeight(event.target.value)} />
                  </div>
                </div>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
                <Card>
                  <SectionHeader title="Best Source" subtitle="What to cut from first and how much waste it will create." />
                  {sheetOptimizerLoading ? (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Optimizing sheet source...</div>
                  ) : sheetOptimizerResult ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Recommended</div>
                          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }}>{sheetOptimizerResult.recommendedSourceType.replace(/_/g, " ")}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Waste</div>
                          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }}>{sheetOptimizerResult.wastePercent.toFixed(2)}%</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Saving</div>
                          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }}>{formatRand(sheetOptimizerResult.savingEstimate)}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Confidence</div>
                          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }}>{Math.round(sheetOptimizerResult.confidence * 100)}%</div>
                        </div>
                      </div>
                      <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ fontWeight: 800 }}>{sheetOptimizerResult.sourceLabel}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{sheetOptimizerResult.recommendation}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 8 }}>
                          Fit: <b>{sheetOptimizerResult.fitType}</b> · Required: <b>{sheetOptimizerResult.requiredWidth} x {sheetOptimizerResult.requiredHeight} mm</b>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Run the optimizer to compare offcuts, sheets, and ordering.</div>
                  )}
                </Card>

                <Card>
                  <SectionHeader title="Recommendation" subtitle="Why this source won, and whether another sheet size would save more." />
                  {sheetOptimizerLoading ? (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Checking waste and stock guidance...</div>
                  ) : sheetOptimizerResult ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}`, fontSize: 12 }}>
                        {sheetOptimizerResult.stockMessage}
                      </div>
                      {sheetOptimizerResult.betterSheetWarning ? (
                        <div style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(251,191,36,0.35)", background: "rgba(120,53,15,0.16)", fontSize: 12, color: "#fde68a" }}>
                          {sheetOptimizerResult.betterSheetWarning}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>No optimizer result yet.</div>
                  )}
                </Card>
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "nesting_studio" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                  <SectionHeader title="Nesting" subtitle="Manual and AI nesting with sheet/offcut selection, puzzle-fit placement, warnings, and customer-named DXF exports." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void runNestingStudio()} variant="primary" disabled={nestingStudioLoading}>Auto Nest</Button>
                    <Button onClick={() => void runNestingStudio(30000)} variant="secondary" disabled={nestingStudioLoading}>Optimize More</Button>
                    <Button onClick={rotateSelectedNestingStudioPlacement} variant="secondary" disabled={!nestingStudioSelectedPartId || nestingStudioLoading}>Rotate 90°</Button>
                    <Button onClick={deleteSelectedNestingStudioPlacement} variant="secondary" disabled={!nestingStudioSelectedPartId || nestingStudioLoading}>Delete Placement</Button>
                    <Button onClick={() => void exportNestingStudioDxf()} variant="secondary" disabled={!nestingStudioResult || nestingStudioLoading}>Export DXF</Button>
                  </div>
                </div>
                {nestingStudioError ? <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{nestingStudioError}</div> : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Customer
                    <Input value={nestingStudioCustomer} onChange={(event) => setNestingStudioCustomer(event.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Nest name
                    <Input value={nestingStudioNestName} onChange={(event) => setNestingStudioNestName(event.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Material
                    <Input value={nestingStudioMaterial} onChange={(event) => setNestingStudioMaterial(event.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Thickness
                    <Input value={nestingStudioThickness} onChange={(event) => setNestingStudioThickness(event.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Sheet width
                    <Input value={nestingStudioSheetWidth} onChange={(event) => setNestingStudioSheetWidth(event.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Sheet height
                    <Input value={nestingStudioSheetHeight} onChange={(event) => setNestingStudioSheetHeight(event.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Kerf
                    <Input value={nestingStudioKerf} onChange={(event) => setNestingStudioKerf(event.target.value)} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Spacing
                    <Input value={nestingStudioSpacing} onChange={(event) => setNestingStudioSpacing(event.target.value)} />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 10 }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Border
                    <Input value={nestingStudioBorder} onChange={(event) => setNestingStudioBorder(event.target.value)} />
                  </label>
                  <div style={{ alignSelf: "end", fontSize: 12, color: UI.colors.muted }}>
                    Source: {nestingStudioSelectedOffcutId ? `Offcut #${nestingStudioSelectedOffcutId}` : "Full sheet"}
                  </div>
                  <Button onClick={() => setNestingStudioSelectedOffcutId(null)} variant="secondary" disabled={!nestingStudioSelectedOffcutId}>Use Full Sheet</Button>
                </div>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.6fr)", gap: 16 }}>
                <Card>
                  <SectionHeader title="Preview" subtitle="Canvas preview of the current nesting result." />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: UI.colors.muted }}>
                      <input type="checkbox" checked={nestingStudioSnapToGrid} onChange={(event) => setNestingStudioSnapToGrid(event.target.checked)} />
                      Snap to grid
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: UI.colors.muted }}>
                      <input type="checkbox" checked={nestingStudioShowSpacingBoundary} onChange={(event) => setNestingStudioShowSpacingBoundary(event.target.checked)} />
                      Spacing boundary
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: UI.colors.muted }}>
                      <input type="checkbox" checked={nestingStudioShowNfpDebug} onChange={(event) => setNestingStudioShowNfpDebug(event.target.checked)} />
                      NFP debug
                    </label>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Selected: {nestingStudioSelectedPartId ?? "none"}</div>
                  </div>
                  <canvas
                    ref={nestingStudioCanvasRef}
                    width={1200}
                    height={600}
                    onMouseDown={handleNestingStudioCanvasMouseDown}
                    onMouseMove={handleNestingStudioCanvasMouseMove}
                    onMouseUp={stopNestingStudioDrag}
                    onMouseLeave={stopNestingStudioDrag}
                    style={{ width: "100%", borderRadius: 8, background: "#07111f", display: "block", cursor: nestingStudioResult ? "grab" : "default" }}
                  />
                </Card>
                <Card>
                  <SectionHeader title="Results" subtitle="Last run from the existing engine." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      ["Placed", String(nestingStudioResult?.placements.length ?? 0)],
                      ["Unplaced", String(nestingStudioResult?.unplaced.length ?? 0)],
                      ["Usage", `${(nestingStudioResult?.usagePercent ?? 0).toFixed(2)}%`],
                      ["Waste", `${(nestingStudioResult?.wastePercent ?? 0).toFixed(2)}%`],
                      ["Attempts", String(nestingStudioResult?.optimizationProgress?.attemptsCompleted ?? 0)],
                      ["Cut order", String(nestingStudioResult?.cutOrder?.length ?? 0)],
                      ["Heat score", `${(nestingStudioResult?.heatScore ?? 0).toFixed(0)}/100`],
                      ["Common-line", `${(nestingStudioResult?.commonLineSaving ?? 0).toFixed(2)} mm`]
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: 10, borderRadius: 8, border: `1px solid ${UI.colors.border}` }}>
                        <span style={{ color: UI.colors.muted }}>{label}</span>
                        <b>{value}</b>
                      </div>
                    ))}
                    {nestingStudioExportPath ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontSize: 11, color: UI.colors.muted, wordBreak: "break-word" }}>Exported: {nestingStudioExportPath}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button onClick={() => void openNestingStudioExportFolder()} variant="secondary">Open Folder</Button>
                          <Button onClick={() => void createNestingStudioLeftoverOffcut()} variant="secondary" disabled={nestingStudioLoading}>Create Leftover Offcut</Button>
                        </div>
                      </div>
                    ) : null}
                    {(nestingStudioResult?.warnings ?? []).map((warning) => (
                      <div key={warning} style={{ fontSize: 12, color: "#fde68a" }}>{warning}</div>
                    ))}
                  </div>
                </Card>
              </div>
              <Card>
                <SectionHeader title="Offcuts" subtitle="Available matching offcuts for Nesting Studio." />
                {nestingStudioOffcutRecommendation ? (
                  <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, border: "1px solid rgba(34,197,94,0.35)", color: "#bbf7d0", fontSize: 12 }}>
                    Recommended: Use offcut #{nestingStudioOffcutRecommendation.offcut.id}. Waste {nestingStudioOffcutRecommendation.wastePercent.toFixed(1)}% · Saving R{nestingStudioOffcutRecommendation.estimatedSaving.toFixed(2)}
                  </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {nestingStudioOffcuts.map((offcut) => (
                    <div key={offcut.id} style={{ padding: 10, borderRadius: 8, border: `1px solid ${offcut.id === nestingStudioSelectedOffcutId ? "#22c55e" : UI.colors.border}`, display: "grid", gap: 8 }}>
                      <img src={createOffcutPreviewDataUrl(offcut)} alt="" style={{ width: "100%", height: 72, objectFit: "contain", background: "#020617", borderRadius: 6 }} />
                      <div style={{ fontWeight: 800 }}>Offcut #{offcut.id}</div>
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>{offcut.material} · {offcut.thickness} mm</div>
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>{offcut.width} x {offcut.height} mm · Area {Math.round(offcut.usableArea)} mm²</div>
                      <div style={{ fontSize: 11, color: UI.colors.muted }}>Source: {offcut.sourceCustomerId ?? offcut.sourceJobId ?? offcut.sourceWorkspaceId ?? "manual"} · {offcut.location ?? "No location"}</div>
                      <Button onClick={() => selectNestingStudioOffcut(offcut)} variant="secondary">Use Offcut</Button>
                    </div>
                  ))}
                  {!nestingStudioOffcuts.length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No available nesting offcuts saved yet.</div> : null}
                </div>
              </Card>
            </div>
          </PageContainer>
        ) : viewMode === "nesting_workspace" ? (
          <PageContainer key="nesting-workspace" style={{ padding: 0, overflow: "auto", height: "100%", background: UI.colors.appBg }}>
            <div style={{ display: "grid", gap: 16, minHeight: "100%", padding: 16, background: UI.colors.appBg }}>
              <div style={{ padding: "16px 20px", border: "1px solid transparent", borderRadius: 12, background: UI.colors.cardBgStrong }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <SectionHeader title="Qouter X Nest Program" />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void saveNestingWorkspaceSettings()} variant="primary" disabled={nestingWorkspaceLoading}>Save Nest</Button>
                    <Button onClick={() => void runNestingWorkspaceAutoNest()} variant="secondary" disabled={!nestingWorkspaceActive || nestingWorkspaceLoading}>Run Nest Program</Button>
                    <Button onClick={() => setNestingWorkspaceManualMode((value) => !value)} variant="secondary">Manual Nest Mode</Button>
                    <Button onClick={() => void exportNestingWorkspaceDxf()} variant="secondary" disabled={!nestingWorkspaceActive || nestingWorkspaceLoading}>Export DXF</Button>
                  </div>
                </div>
                {nestingWorkspaceError ? <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 10 }}>{nestingWorkspaceError}</div> : null}
                {nestingWorkspaceRecommendation ? (
                  <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: "1px solid rgba(110,231,183,0.32)", background: "rgba(20,83,45,0.18)", fontSize: 13 }}>
                    {nestingWorkspaceRecommendation.message}
                    <Button onClick={() => void useNestingWorkspaceOffcut(nestingWorkspaceRecommendation)} variant="primary" style={{ marginLeft: 12, minHeight: 32, padding: "8px 10px" }}>
                      Use Offcut
                    </Button>
                  </div>
                ) : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) minmax(520px, 1fr) minmax(320px, 380px)", gap: 16, alignItems: "start", minHeight: 0 }}>
                <Card compact style={{ minWidth: 0 }}>
                  <SectionHeader title="Sheet Setup" subtitle="Customer, material, and cutting settings." />
                  <div style={{ display: "grid", gap: 12 }}>
                    <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Customer
                      <select
                        value={nestingWorkspaceCustomerId}
                        onChange={(event) => {
                          const customer = customers.find((entry) => entry.id === event.target.value);
                          setNestingWorkspaceCustomerId(event.target.value);
                          setNestingWorkspaceCustomerName(customer?.name ?? "Walk-in");
                        }}
                        style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }}
                      >
                        <option value="">Walk-in / Manual</option>
                        {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                      </select>
                    </label>
                    <Input value={nestingWorkspaceCustomerName} onChange={(event) => setNestingWorkspaceCustomerName(event.target.value)} placeholder="Customer name" />
                    <Input value={nestingWorkspaceNestName} onChange={(event) => setNestingWorkspaceNestName(event.target.value)} placeholder="Nest name" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8 }}>
                      <Input value={nestingWorkspaceMaterial} onChange={(event) => setNestingWorkspaceMaterial(event.target.value)} placeholder="Material" />
                      <Input value={nestingWorkspaceThickness} onChange={(event) => setNestingWorkspaceThickness(event.target.value)} placeholder="mm" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Input value={nestingWorkspaceSheetWidth} onChange={(event) => setNestingWorkspaceSheetWidth(event.target.value)} placeholder="Width" />
                      <Input value={nestingWorkspaceSheetHeight} onChange={(event) => setNestingWorkspaceSheetHeight(event.target.value)} placeholder="Height" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <Input value={nestingWorkspaceBorder} onChange={(event) => setNestingWorkspaceBorder(event.target.value)} placeholder="Border" />
                      <Input value={nestingWorkspaceKerf} onChange={(event) => setNestingWorkspaceKerf(event.target.value)} placeholder="Kerf" />
                      <Input value={nestingWorkspaceSpacing} onChange={(event) => setNestingWorkspaceSpacing(event.target.value)} placeholder="Spacing" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <select value={nestingWorkspaceLeadInType} onChange={(event) => setNestingWorkspaceLeadInType(event.target.value as "line" | "arc")} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }}>
                        <option value="line">Line lead-in</option>
                        <option value="arc">Arc lead-in</option>
                      </select>
                      <Input value={nestingWorkspaceLeadInLength} onChange={(event) => setNestingWorkspaceLeadInLength(event.target.value)} placeholder="Lead length" />
                    </div>
                    {[
                      ["Allow rotation", nestingWorkspaceAllowRotation, setNestingWorkspaceAllowRotation],
                      ["Allow common line", nestingWorkspaceAllowCommonLine, setNestingWorkspaceAllowCommonLine],
                      ["Enable micro joins", nestingWorkspaceEnableMicroJoins, setNestingWorkspaceEnableMicroJoins],
                      ["Grid", nestingWorkspaceShowGrid, setNestingWorkspaceShowGrid],
                      ["Collision overlay", nestingWorkspaceShowCollision, setNestingWorkspaceShowCollision],
                      ["Sheet border", nestingWorkspaceShowBorder, setNestingWorkspaceShowBorder],
                      ["Show bounding boxes", nestingWorkspaceShowBoundingBoxes, setNestingWorkspaceShowBoundingBoxes]
                    ].map(([label, checked, setter]) => (
                      <label key={String(label)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <input type="checkbox" checked={Boolean(checked)} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(event.target.checked)} />
                        {String(label)}
                      </label>
                    ))}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button onClick={() => { setNestingWorkspaceActive(null); setNestingWorkspaceNestName("New Nest"); }} variant="secondary">New</Button>
                      <Button onClick={() => void saveNestingWorkspaceSettings()} variant="primary">Save</Button>
                      <Button onClick={() => void recommendNestingWorkspaceOffcuts()} variant="secondary" disabled={!nestingWorkspaceActive}>Recommend Offcut</Button>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button onClick={() => void (nestingWorkspaceActive && apiFetch(`/api/nesting/workspaces/${nestingWorkspaceActive.id}`, { method: "PATCH", body: JSON.stringify({ sourceType: "sheet", sourceId: null, sheetWidth: Number(nestingWorkspaceSheetWidth), sheetHeight: Number(nestingWorkspaceSheetHeight) }) }).then(() => refreshNestingWorkspaceData(nestingWorkspaceActive.id)))} variant="secondary" disabled={!nestingWorkspaceActive}>Use Full Sheet</Button>
                    </div>
                  </div>
                </Card>

                <Card compact style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                    <SectionHeader title="Program Preview" subtitle={nestingWorkspaceActive ? `${nestingWorkspaceActive.sourceType.toUpperCase()} · ${nestingWorkspaceActive.sheetWidth} x ${nestingWorkspaceActive.sheetHeight} mm` : "Create or open a nest program."} />
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Button onClick={() => setNestingWorkspaceZoom((value) => Math.max(0.5, value - 0.1))} variant="secondary">-</Button>
                      <Button onClick={() => setNestingWorkspaceZoom(1)} variant="secondary">Fit</Button>
                      <Button onClick={() => setNestingWorkspaceZoom((value) => Math.min(2, value + 0.1))} variant="secondary">+</Button>
                    </div>
                  </div>
                  {nestingWorkspaceActive ? (
                    <div style={{ overflow: "auto", border: "1px solid transparent", borderRadius: 8, background: "#07111f", padding: 14, minHeight: 460, maxHeight: "calc(100vh - 310px)" }}>
                      {nestingWorkspaceActive.placements.some((placement) => {
                        const part = nestingWorkspaceActive.parts.find((entry) => entry.id === placement.partId);
                        return !nestingWorkspaceGeometryPaths(part, placement).hasTrueGeometry;
                      }) ? (
                        <div style={{ color: "#fbbf24", fontSize: 12, marginBottom: 10 }}>
                          DXF preview geometry missing — bounding box fallback
                        </div>
                      ) : null}
                      <svg
                        viewBox={`0 0 ${nestingWorkspaceActive.sheetWidth} ${nestingWorkspaceActive.sheetHeight}`}
                        style={{ width: `${100 * nestingWorkspaceZoom}%`, minWidth: 520, aspectRatio: `${nestingWorkspaceActive.sheetWidth} / ${nestingWorkspaceActive.sheetHeight}`, display: "block" }}
                      >
                        <defs>
                          <pattern id="nest-grid" width="100" height="100" patternUnits="userSpaceOnUse">
                            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
                          </pattern>
                        </defs>
                        <rect x="0" y="0" width={nestingWorkspaceActive.sheetWidth} height={nestingWorkspaceActive.sheetHeight} fill={nestingWorkspaceShowGrid ? "url(#nest-grid)" : "#08111f"} stroke={nestingWorkspaceActive.sourceType === "offcut" ? "#fbbf24" : "#94a3b8"} strokeWidth="3" />
                        {nestingWorkspaceShowBorder ? (
                          <rect
                            x={nestingWorkspaceActive.border}
                            y={nestingWorkspaceActive.border}
                            width={Math.max(0, nestingWorkspaceActive.sheetWidth - nestingWorkspaceActive.border * 2)}
                            height={Math.max(0, nestingWorkspaceActive.sheetHeight - nestingWorkspaceActive.border * 2)}
                            fill="none"
                            stroke="rgba(110,231,183,0.55)"
                            strokeDasharray="10 8"
                            strokeWidth="2"
                          />
                        ) : null}
                        {nestingWorkspaceActive.placements.map((placement) => {
                          const part = nestingWorkspaceActive.parts.find((entry) => entry.id === placement.partId);
                          const rotated = placement.rotation === 90 || placement.rotation === 270;
                          const width = rotated ? part?.height ?? 10 : part?.width ?? 10;
                          const height = rotated ? part?.width ?? 10 : part?.height ?? 10;
                          const selected = nestingWorkspaceSelectedPlacementId === placement.id;
                          const warning = placement.hasCollision || placement.isOutsideSheet;
                          const geometry = nestingWorkspaceGeometryPaths(part, placement);
                          return (
                            <g key={placement.id} onClick={() => setNestingWorkspaceSelectedPlacementId(placement.id)} style={{ cursor: "pointer" }}>
                              {geometry.outerPath ? (
                                <path
                                  d={[geometry.outerPath, ...geometry.holePaths].join(" ")}
                                  fill={warning && nestingWorkspaceShowCollision ? "rgba(248,113,113,0.28)" : selected ? "rgba(56,189,248,0.28)" : "rgba(110,231,183,0.18)"}
                                  stroke={warning && nestingWorkspaceShowCollision ? "#f87171" : selected ? "#38bdf8" : "#6ee7b7"}
                                  strokeWidth={selected ? 4 : 2}
                                  fillRule="evenodd"
                                />
                              ) : (
                                <rect
                                  x={placement.x}
                                  y={placement.y}
                                  width={width}
                                  height={height}
                                  fill={warning && nestingWorkspaceShowCollision ? "rgba(248,113,113,0.28)" : selected ? "rgba(56,189,248,0.28)" : "rgba(110,231,183,0.18)"}
                                  stroke={warning && nestingWorkspaceShowCollision ? "#f87171" : selected ? "#38bdf8" : "#6ee7b7"}
                                  strokeWidth={selected ? 4 : 2}
                                />
                              )}
                              {geometry.segmentLines.map((segment, index) => (
                                <line
                                  key={`${placement.id}-segment-${index}`}
                                  x1={segment.start.x}
                                  y1={segment.start.y}
                                  x2={segment.end.x}
                                  y2={segment.end.y}
                                  stroke={segment.kind === "arc" || segment.kind === "circle" ? "#fbbf24" : "#a7f3d0"}
                                  strokeWidth={selected ? 2.5 : 1.5}
                                  fill="none"
                                />
                              ))}
                              {geometry.circleShapes.map((circle, index) => (
                                <circle
                                  key={`${placement.id}-circle-${index}`}
                                  cx={circle.center.x}
                                  cy={circle.center.y}
                                  r={circle.r}
                                  fill="none"
                                  stroke="#fbbf24"
                                  strokeWidth={selected ? 2.5 : 1.5}
                                />
                              ))}
                              {geometry.arcPaths.map((path, index) => (
                                <path
                                  key={`${placement.id}-arc-${index}`}
                                  d={path}
                                  fill="none"
                                  stroke="#fbbf24"
                                  strokeWidth={selected ? 2.5 : 1.5}
                                />
                              ))}
                              {nestingWorkspaceShowBoundingBoxes || !geometry.hasTrueGeometry ? (
                                <rect
                                  x={placement.x}
                                  y={placement.y}
                                  width={width}
                                  height={height}
                                  fill="none"
                                  stroke={!geometry.hasTrueGeometry ? "#fbbf24" : "rgba(148,163,184,0.72)"}
                                  strokeDasharray="8 6"
                                  strokeWidth="2"
                                />
                              ) : null}
                              {!geometry.hasTrueGeometry ? <title>No DXF geometry loaded — showing bounding box fallback</title> : null}
                              {selected ? (
                                <>
                                  <text x={placement.x + 8} y={placement.y + 18} fill="#e5e7eb" fontSize="12">{part?.fileName ?? `Part ${placement.partId}`}</text>
                                  <text x={placement.x + 8} y={placement.y + 34} fill="#94a3b8" fontSize="10">Rot {placement.rotation}°</text>
                                </>
                              ) : null}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  ) : (
                    <div style={{ minHeight: 460, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid transparent", borderRadius: 8, color: UI.colors.muted }}>
                      Create a nesting workspace to start.
                    </div>
                  )}
                  {nestingWorkspaceManualMode && nestingWorkspaceActive ? (
                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <Button onClick={() => void moveNestingWorkspacePlacement(-10, 0)} variant="secondary">Left</Button>
                      <Button onClick={() => void moveNestingWorkspacePlacement(10, 0)} variant="secondary">Right</Button>
                      <Button onClick={() => void moveNestingWorkspacePlacement(0, -10)} variant="secondary">Up</Button>
                      <Button onClick={() => void moveNestingWorkspacePlacement(0, 10)} variant="secondary">Down</Button>
                      <Button onClick={() => void moveNestingWorkspacePlacement(0, 0, 90)} variant="secondary">Rotate 90°</Button>
                      <span style={{ fontSize: 12, color: UI.colors.muted }}>Selected: {nestingWorkspaceSelectedPlacementId ?? "none"}</span>
                    </div>
                  ) : null}
                </Card>

                <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
                  <Card compact>
                    <SectionHeader title="Nest Parts & Plates" subtitle="Import DXF parts, pull jobs or quotes, set quantities, then run the nesting program." />
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Button onClick={() => void addDxfToNestingWorkspaceFromDesktopPicker()} variant="primary" disabled={nestingWorkspaceLoading}>Browse DXF</Button>
                        <input
                          type="file"
                          accept=".dxf"
                          onChange={(event) => {
                            void addDxfToNestingWorkspace(event.target.files?.[0] ?? null);
                            event.currentTarget.value = "";
                          }}
                          disabled={nestingWorkspaceLoading}
                          title="Fallback upload if the desktop picker is unavailable"
                          style={{ maxWidth: 220 }}
                        />
                      </div>
                      <select onChange={(event) => void addJobToNestingWorkspace(jobs.find((job) => job.id === event.target.value) ?? null)} disabled={nestingWorkspaceLoading} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }}>
                        <option value="">Add from Job</option>
                        {jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber} · {job.title}</option>)}
                      </select>
                      <select onChange={(event) => void addQuoteToNestingWorkspace(quotes.find((quote) => quote.id === event.target.value) ?? null)} disabled={nestingWorkspaceLoading} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }}>
                        <option value="">Add from Quote</option>
                        {quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.quoteNumber} · {quote.title}</option>)}
                      </select>
                      <div style={{ display: "grid", gap: 8, maxHeight: 190, overflow: "auto" }}>
                        {(nestingWorkspaceActive?.parts ?? []).map((part) => {
                          const previewDataUrl = createNestingPartPreviewDataUrl(part);
                          return (
                            <div key={part.id} style={{ display: "grid", gridTemplateColumns: "64px minmax(0, 1fr)", gap: 10, alignItems: "center", padding: 10, borderRadius: 8, border: `1px solid ${UI.colors.border}` }}>
                              <div style={{ width: 64, height: 44, borderRadius: 6, border: `1px solid ${UI.colors.border}`, background: "#020617", overflow: "hidden", display: "grid", placeItems: "center" }}>
                                {previewDataUrl ? <img src={previewDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 10, color: UI.colors.muted }}>DXF</span>}
                              </div>
                              <div style={{ minWidth: 0, display: "grid", gap: 5 }}>
                                <div style={{ fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{part.fileName}</div>
                                <div style={{ fontSize: 11, color: UI.colors.muted }}>{part.width.toFixed(0)} x {part.height.toFixed(0)} mm · Pierce {part.pierceCount}</div>
                                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: UI.colors.muted }}>
                                  Qty
                                  <input
                                    type="number"
                                    min={1}
                                    defaultValue={part.quantity}
                                    disabled={nestingWorkspaceLoading}
                                    onBlur={(event) => void updateNestingWorkspacePartQuantity(part.id, Number(event.currentTarget.value))}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    style={{ width: 68, padding: "5px 7px", borderRadius: 7, border: `1px solid ${UI.colors.border}`, background: "#0b1220", color: UI.colors.text }}
                                  />
                                </label>
                              </div>
                            </div>
                          );
                        })}
                        {!(nestingWorkspaceActive?.parts ?? []).length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No parts added.</div> : null}
                      </div>
                    </div>
                  </Card>

                  <Card compact>
                    <SectionHeader title="Warnings" subtitle="Collision, border, lead-in, heat, and tab checks." />
                    <div style={{ display: "grid", gap: 6, maxHeight: 150, overflow: "auto" }}>
                      {(nestingWorkspaceActive?.warnings ?? []).map((warning, index) => (
                        <div key={`${warning.message}-${index}`} style={{ fontSize: 12, color: warning.severity === "critical" ? "#fca5a5" : warning.severity === "warning" ? "#fde68a" : "#bfdbfe" }}>
                          {warning.severity.toUpperCase()}: {warning.message}
                        </div>
                      ))}
                      {!(nestingWorkspaceActive?.warnings ?? []).length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No warnings.</div> : null}
                    </div>
                  </Card>

                  <Card compact>
                    <SectionHeader title="Results" subtitle="Current workspace metrics." />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[
                        ["Usage", `${(nestingWorkspaceActive?.usagePercent ?? 0).toFixed(1)}%`],
                        ["Waste", `${(nestingWorkspaceActive?.wastePercent ?? 0).toFixed(1)}%`],
                        ["Cut length", `${Math.round(nestingWorkspaceActive?.estimatedCutLength ?? 0)} mm`],
                        ["Pierces", String(nestingWorkspaceActive?.estimatedPierceCount ?? 0)]
                      ].map(([label, value]) => (
                        <div key={label} style={{ padding: 10, borderRadius: 8, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 11, color: UI.colors.muted }}>{label}</div>
                          <div style={{ fontWeight: 800 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: UI.colors.muted }}>Export: {nestingWorkspaceActive?.exportedDxfPath ?? "Not exported"}</div>
                    <Button onClick={() => void createNestingWorkspaceOffcuts()} variant="secondary" disabled={!nestingWorkspaceActive} style={{ marginTop: 10 }}>Create Offcuts</Button>
                  </Card>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 1fr) minmax(360px, 1fr)", gap: 16, alignItems: "start" }}>
                <Card compact style={{ minHeight: 220 }}>
                  <SectionHeader title="Offcut Library" subtitle="Previous nesting offcuts with DXF-style previews." />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                    {nestingWorkspaceOffcuts.map((offcut) => {
                      const preview = (() => {
                        try {
                          return JSON.parse(offcut.previewJson || "{}") as { outline?: Array<{ x: number; y: number }> };
                        } catch {
                          return {};
                        }
                      })();
                      const outline = preview.outline?.length ? preview.outline : [{ x: 0, y: 0 }, { x: offcut.width, y: 0 }, { x: offcut.width, y: offcut.height }, { x: 0, y: offcut.height }];
                      return (
                        <div key={offcut.id} style={{ padding: 10, borderRadius: 8, border: `1px solid ${UI.colors.border}`, display: "grid", gap: 8 }}>
                          <svg viewBox={`0 0 ${offcut.width} ${offcut.height}`} style={{ width: "100%", aspectRatio: "2 / 1", background: "#07111f", borderRadius: 6 }}>
                            <polygon points={outline.map((point) => `${point.x},${point.y}`).join(" ")} fill="rgba(251,191,36,0.12)" stroke="#fbbf24" strokeWidth="3" />
                            <text x="8" y="18" fill="#e5e7eb" fontSize="12">OFFCUT-{offcut.id}</text>
                          </svg>
                          <div style={{ fontWeight: 800 }}>OFFCUT-{offcut.id}</div>
                          <div style={{ fontSize: 11, color: UI.colors.muted }}>{offcut.material} · {offcut.thickness}mm · {Math.round(offcut.width)} x {Math.round(offcut.height)} · {offcut.location ?? "No location"}</div>
                          <div style={{ fontSize: 11, color: UI.colors.muted }}>Area {Math.round(offcut.usableArea)} mm² · {formatDateTime(offcut.createdAt)}</div>
                          <Button onClick={() => void useNestingWorkspaceOffcut(offcut)} variant="secondary">Use this offcut</Button>
                        </div>
                      );
                    })}
                    {!nestingWorkspaceOffcuts.length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No nesting offcuts saved yet.</div> : null}
                  </div>
                </Card>
                <Card compact style={{ minHeight: 220 }}>
                  <SectionHeader title="Nesting History" subtitle="Open, duplicate, reuse offcut, or export previous nests." />
                  <div style={{ display: "grid", gap: 10, maxHeight: 300, overflow: "auto" }}>
                    {nestingWorkspaceHistory.map((entry) => (
                      <div key={entry.id} style={{ padding: 10, borderRadius: 8, border: `1px solid ${UI.colors.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 800 }}>{entry.nestName}</div>
                          <StatusBadge tone={entry.status === "exported" ? "success" : entry.status === "nested" ? "info" : "warning"}>{entry.status}</StatusBadge>
                        </div>
                        <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 5 }}>{entry.customerName} · {entry.material} · {entry.thickness}mm · Waste {(entry.wastePercent ?? 0).toFixed(1)}%</div>
                        <div style={{ fontSize: 11, color: UI.colors.muted }}>DXF: {entry.exportedDxfPath ?? "Not exported"}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <Button onClick={() => void refreshNestingWorkspaceData(entry.id)} variant="secondary" style={{ minHeight: 32, padding: "8px 10px" }}>Open</Button>
                          <Button onClick={() => { setNestingWorkspaceActive(null); setNestingWorkspaceNestName(`${entry.nestName} Copy`); setNestingWorkspaceMaterial(entry.material); setNestingWorkspaceThickness(String(entry.thickness)); setNestingWorkspaceSheetWidth(String(entry.sheetWidth)); setNestingWorkspaceSheetHeight(String(entry.sheetHeight)); }} variant="secondary" style={{ minHeight: 32, padding: "8px 10px" }}>Duplicate</Button>
                          <Button onClick={() => void exportNestingWorkspaceDxf()} variant="secondary" style={{ minHeight: 32, padding: "8px 10px" }}>Export Again</Button>
                        </div>
                      </div>
                    ))}
                    {!nestingWorkspaceHistory.length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No previous nesting history yet.</div> : null}
                  </div>
                </Card>
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "nesting_intelligence" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <SectionHeader title="Smart AI Nesting" subtitle="Group queued parts by material and thickness, prefer offcuts, and generate draft nesting plans." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void refreshNestingPlans()} variant="secondary">Refresh</Button>
                    <Button onClick={() => void createNestingRecommendations()} variant="primary">Recommend Nests</Button>
                  </div>
                </div>
                {nestingError ? (
                  <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{nestingError}</div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Draft plans</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{nestingPlans.filter((plan) => plan.status === "draft").length}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Approved</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{nestingPlans.filter((plan) => plan.status === "approved").length}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Avg waste</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>
                      {nestingPlans.length ? `${(nestingPlans.reduce((sum, plan) => sum + plan.wastePercent, 0) / nestingPlans.length).toFixed(1)}%` : "—"}
                    </div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Estimated saving</div>
                    <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>
                      {nestingPlans.length ? formatRand(nestingPlans.reduce((sum, plan) => sum + plan.estimatedSaving, 0)) : "—"}
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                  <SectionHeader title="Advanced Nesting Engine" subtitle="Run real 2D sheet packing with rotations, common-line savings, lead-ins, micro joins, manufacturability warnings, and nested DXF export." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void runAdvancedNestingEngine()} variant="primary" disabled={nestingLoading}>Optimize</Button>
                    <Button onClick={() => void exportAdvancedNestingDxf()} variant="secondary" disabled={!advancedNestResult?.jobId || nestingLoading}>Export DXF</Button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10, alignItems: "end" }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Material
                    <input value={advancedNestMaterial} onChange={(event) => setAdvancedNestMaterial(event.target.value)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Thickness
                    <input value={advancedNestThickness} onChange={(event) => setAdvancedNestThickness(event.target.value)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Sheet W
                    <input value={advancedNestSheetWidth} onChange={(event) => setAdvancedNestSheetWidth(event.target.value)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Sheet H
                    <input value={advancedNestSheetHeight} onChange={(event) => setAdvancedNestSheetHeight(event.target.value)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Kerf
                    <input value={advancedNestKerf} onChange={(event) => setAdvancedNestKerf(event.target.value)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Spacing
                    <input value={advancedNestSpacing} onChange={(event) => setAdvancedNestSpacing(event.target.value)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Border
                    <input value={advancedNestBorder} onChange={(event) => setAdvancedNestBorder(event.target.value)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Lead-in
                    <select value={advancedNestLeadInType} onChange={(event) => setAdvancedNestLeadInType(event.target.value as "line" | "arc")} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }}>
                      <option value="line">Line</option>
                      <option value="arc">Arc</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: UI.colors.muted }}>Lead length
                    <input value={advancedNestLeadInLength} onChange={(event) => setAdvancedNestLeadInLength(event.target.value)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "#111827", color: "white" }} />
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 42, color: UI.colors.text, fontSize: 13 }}>
                    <input type="checkbox" checked={advancedNestAllowCommonLine} onChange={(event) => setAdvancedNestAllowCommonLine(event.target.checked)} /> Common-line
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 42, color: UI.colors.text, fontSize: 13 }}>
                    <input type="checkbox" checked={advancedNestEnableMicroJoins} onChange={(event) => setAdvancedNestEnableMicroJoins(event.target.checked)} /> Micro joins
                  </label>
                </div>

                {advancedNestResult ? (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: 16, marginTop: 16 }}>
                    <div>
                      <div style={{ position: "relative", aspectRatio: `${advancedNestResult.sheetWidth} / ${advancedNestResult.sheetHeight}`, border: `1px solid ${UI.colors.border}`, background: "#0b1220", overflow: "hidden", borderRadius: 8 }}>
                        {advancedNestResult.placements.map((placement) => (
                          <div key={placement.id} title={`Rot ${placement.rotation}°`} style={{
                            position: "absolute",
                            left: `${(placement.x / advancedNestResult.sheetWidth) * 100}%`,
                            top: `${(placement.y / advancedNestResult.sheetHeight) * 100}%`,
                            width: `${(placement.width / advancedNestResult.sheetWidth) * 100}%`,
                            height: `${(placement.height / advancedNestResult.sheetHeight) * 100}%`,
                            border: placement.isCommonLine ? "2px solid #38bdf8" : "1px solid #6ee7b7",
                            background: placement.isCommonLine ? "rgba(56,189,248,0.18)" : "rgba(110,231,183,0.12)"
                          }} />
                        ))}
                        {advancedNestResult.microJoins.map((tab, index) => (
                          <div key={`${tab.placementId}-${index}`} style={{
                            position: "absolute",
                            left: `${(tab.x / advancedNestResult.sheetWidth) * 100}%`,
                            top: `${(tab.y / advancedNestResult.sheetHeight) * 100}%`,
                            width: 8,
                            height: 8,
                            borderRadius: 8,
                            background: "#f59e0b"
                          }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                        {[
                          { label: "Usage", value: `${advancedNestResult.usagePercent.toFixed(1)}%` },
                          { label: "Waste", value: `${advancedNestResult.wastePercent.toFixed(1)}%` },
                          { label: "Cut length", value: `${advancedNestResult.estimatedCutLength.toFixed(0)} mm` },
                          { label: "Pierces", value: String(advancedNestResult.estimatedPierceCount) },
                          { label: "Cut time", value: `${advancedNestResult.estimatedCutTimeMinutes.toFixed(1)} min` },
                          { label: "Common-line", value: formatRand(advancedNestResult.commonLineSavingEstimate) }
                        ].map((metric) => (
                          <div key={metric.label} style={{ padding: 10, borderRadius: 8, border: `1px solid ${UI.colors.border}` }}>
                            <div style={{ fontSize: 11, color: UI.colors.muted }}>{metric.label}</div>
                            <div style={{ fontWeight: 800, marginTop: 3 }}>{metric.value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 12, color: UI.colors.muted }}>
                        DXF export: {advancedNestResult.dxfExportPath ?? "Not exported"}
                      </div>
                      <div style={{ display: "grid", gap: 6, maxHeight: 160, overflow: "auto" }}>
                        {advancedNestResult.warnings.map((warning, index) => (
                          <div key={`${warning.message}-${index}`} style={{ fontSize: 12, color: warning.severity === "critical" ? "#fca5a5" : warning.severity === "warning" ? "#fde68a" : "#bfdbfe" }}>
                            {warning.severity.toUpperCase()}: {warning.message}
                          </div>
                        ))}
                        {!advancedNestResult.warnings.length ? <div style={{ fontSize: 12, color: UI.colors.muted }}>No manufacturability warnings.</div> : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </Card>

              {nestingSkippedGroups.length ? (
                <Card>
                  <SectionHeader title="Blocked Groups" subtitle="Material groups that still need stock or a better sheet source before they can nest." />
                  <div style={{ display: "grid", gap: 10 }}>
                    {nestingSkippedGroups.map((group, index) => (
                      <div key={`${group.material}-${group.thickness}-${index}`} style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(251,191,36,0.35)", background: "rgba(120,53,15,0.16)" }}>
                        <div style={{ fontWeight: 800 }}>{group.material} · {group.thickness} mm</div>
                        <div style={{ fontSize: 12, color: "#fde68a", marginTop: 6 }}>{group.reason}</div>
                        <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 8 }}>
                          Jobs: {group.jobIds.map((id) => smartQueueJobs.find((job) => job.id === id)?.jobNumber ?? `#${id}`).join(", ") || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              <div style={{ display: "grid", gap: 16 }}>
                {nestingLoading && !nestingPlans.length ? (
                  <Card>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Building nesting recommendations...</div>
                  </Card>
                ) : null}
                {!nestingLoading && nestingPlans.length === 0 ? (
                  <Card>
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>No nesting plans yet. Run the recommender to group queued jobs into sheet or offcut nests.</div>
                  </Card>
                ) : null}
                {nestingPlans.map((plan) => {
                  const groupedJobs = Array.from(new Set(plan.items.map((item) => item.jobId).filter((value): value is number => value !== null)))
                    .map((jobId) => smartQueueJobs.find((job) => job.id === jobId))
                    .filter((job): job is SmartQueueJob => Boolean(job));
                  return (
                    <Card key={plan.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 800 }}>{plan.material} · {plan.thickness} mm</div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 4 }}>
                            Source: <b>{plan.sheetSourceType}</b> #{plan.sheetSourceId ?? "?"} · Plate <b>{Math.round(plan.width)} x {Math.round(plan.height)} mm</b>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <StatusBadge tone={plan.status === "approved" ? "success" : plan.status === "completed" ? "info" : "warning"}>
                            {plan.status}
                          </StatusBadge>
                          {plan.status === "draft" ? (
                            <Button variant="primary" onClick={() => void approveNestingPlan(plan.id)}>Approve Plan</Button>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Waste</div>
                          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }}>{plan.wastePercent.toFixed(2)}%</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Saving</div>
                          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }}>{formatRand(plan.estimatedSaving)}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Est. cut time</div>
                          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }}>{Math.round(plan.estimatedCutTimeMinutes)} min</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Grouped jobs</div>
                          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }}>{groupedJobs.length}</div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.05fr)", gap: 16 }}>
                        <div style={{ display: "grid", gap: 10 }}>
                          <SectionHeader title="Grouped Jobs" subtitle="Queue jobs included in this nesting recommendation." />
                          {groupedJobs.length ? groupedJobs.map((job) => (
                            <div key={job.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ fontWeight: 800 }}>{job.jobNumber} · {job.title}</div>
                                <div style={{ fontSize: 12, color: UI.colors.muted }}>{job.material} · {job.thickness ?? "?"} mm</div>
                              </div>
                              <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>
                                Reasons: {job.queueReasons.slice(0, 3).join(" • ") || "Grouped for shared material and thickness."}
                              </div>
                            </div>
                          )) : (
                            <div style={{ fontSize: 12, color: UI.colors.muted }}>No linked queue jobs were found for this plan.</div>
                          )}
                        </div>

                        <div style={{ display: "grid", gap: 10 }}>
                          <SectionHeader title="Placed Parts" subtitle="Simple shelf-placement coordinates that can be replaced by a full nesting engine later." />
                          <div style={{ display: "grid", gap: 8, maxHeight: 340, overflow: "auto", paddingRight: 4 }}>
                            {plan.items.map((item) => (
                              <div key={item.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}`, fontSize: 12 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                  <div>
                                    Job: <b>{item.jobId ? smartQueueJobs.find((job) => job.id === item.jobId)?.jobNumber ?? `#${item.jobId}` : item.quoteId ?? "Unlinked"}</b>
                                  </div>
                                  <div>Part DNA: <b>{item.partDnaId ? `#${item.partDnaId}` : "—"}</b></div>
                                </div>
                                <div style={{ color: UI.colors.muted, marginTop: 6 }}>
                                  X {Math.round(item.x)} · Y {Math.round(item.y)} · Rot {item.rotation}° · Qty {item.quantity}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "dxf_error_detection" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <SectionHeader title="DXF Error Detection" subtitle="Catch open contours, tiny holes, bad geometry, and likely burn issues before cutting." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void runDxfErrorCheck()} variant="primary">Check DXF</Button>
                  </div>
                </div>
                {dxfErrorError ? (
                  <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{dxfErrorError}</div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) 180px", gap: 12, alignItems: "end" }}>
                  <div>
                    <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>DXF file</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="file"
                        accept=".dxf"
                        onChange={(event) => {
                          setDxfErrorFile(event.target.files?.[0] ?? null);
                          event.currentTarget.value = "";
                        }}
                        style={{ minWidth: 180, flex: 1 }}
                      />
                      <Button onClick={() => void pickDxfErrorFileFromDesktop()} variant="secondary">Browse DXF</Button>
                    </div>
                    {dxfErrorFile ? <div style={{ marginTop: 6, fontSize: 11, color: UI.colors.muted }}>{dxfErrorFile.name}</div> : null}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>Material thickness (mm)</div>
                    <Input value={dxfErrorThickness} onChange={(event) => setDxfErrorThickness(event.target.value)} />
                  </div>
                </div>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.05fr)", gap: 16 }}>
                <Card>
                  <SectionHeader title="Warnings & Critical Issues" subtitle="Severity-sorted DXF findings from the current file." />
                  {dxfErrorLoading ? (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Checking DXF geometry...</div>
                  ) : dxfErrorResult ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>File</div>
                          <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4 }}>{dxfErrorResult.dxfFileId}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Critical</div>
                          <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{dxfErrorResult.summary.criticalCount}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Warnings</div>
                          <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{dxfErrorResult.summary.warningCount}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>Info</div>
                          <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{dxfErrorResult.summary.infoCount}</div>
                        </div>
                      </div>
                      {dxfErrorResult.reports.map((report) => (
                        <div
                          key={report.id}
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            border:
                              report.severity === "critical"
                                ? "1px solid rgba(248,113,113,0.35)"
                                : report.severity === "warning"
                                ? "1px solid rgba(251,191,36,0.35)"
                                : `1px solid ${UI.colors.border}`,
                            background:
                              report.severity === "critical"
                                ? "rgba(127,29,29,0.16)"
                                : report.severity === "warning"
                                ? "rgba(120,53,15,0.16)"
                                : "transparent"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <div style={{ fontWeight: 800 }}>{report.errorType.replace(/_/g, " ")}</div>
                            <StatusBadge tone={report.severity === "critical" ? "danger" : report.severity === "warning" ? "warning" : "info"}>
                              {report.severity}
                            </StatusBadge>
                          </div>
                          <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{report.message}</div>
                          {report.entityRef ? (
                            <div style={{ fontSize: 11, color: UI.colors.muted, marginTop: 8 }}>Ref: {report.entityRef}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Choose a DXF file and run the check.</div>
                  )}
                </Card>

                <Card>
                  <SectionHeader title="Recommended Fixes" subtitle="Suggested cleanup steps before nesting or cutting." />
                  {dxfErrorLoading ? (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>Preparing recommended fixes...</div>
                  ) : dxfErrorResult ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      {dxfErrorResult.recommendedFixes.length ? (
                        dxfErrorResult.recommendedFixes.map((fix, index) => (
                          <div key={`${index}-${fix}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}`, fontSize: 12 }}>
                            {fix}
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: 12, color: UI.colors.muted }}>No specific fixes suggested.</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: UI.colors.muted }}>No DXF check result yet.</div>
                  )}
                </Card>
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "production_assistant" ? (
          <PageContainer>
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <SectionHeader title="Production Assistant" subtitle="Ask deterministic factory questions using Qouter X queue, stock, profit, DXF, and offcut data." />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button onClick={() => void askProductionAssistant()} variant="primary" disabled={productionAssistantLoading}>
                      {productionAssistantLoading ? "Thinking..." : "Ask"}
                    </Button>
                  </div>
                </div>
                {productionAssistantError ? (
                  <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>{productionAssistantError}</div>
                ) : null}
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "end" }}>
                    <div>
                      <div style={{ fontSize: 12, color: UI.colors.muted, marginBottom: 6 }}>Question</div>
                      <Input
                        value={productionAssistantInput}
                        onChange={(event) => setProductionAssistantInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void askProductionAssistant();
                          }
                        }}
                        placeholder="What jobs are late?"
                      />
                    </div>
                    <Button onClick={() => void askProductionAssistant()} variant="primary" disabled={productionAssistantLoading}>
                      Send
                    </Button>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      "What jobs are late?",
                      "What should we cut next?",
                      "Which jobs can combine?",
                      "What material must we buy?",
                      "Which jobs are low profit?",
                      "Which customer owes money?",
                      "Which DXFs have errors?",
                      "Which offcuts can be used?"
                    ].map((question) => (
                      <Button key={question} variant="secondary" onClick={() => void askProductionAssistant(question)} disabled={productionAssistantLoading}>
                        {question}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>

              <div style={{ display: "grid", gap: 12 }}>
                {productionAssistantMessages.map((message, index) => (
                  <Card key={`${message.at}-${index}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        {message.role === "assistant" ? "Production Assistant" : "You"}
                      </div>
                      <div style={{ fontSize: 11, color: UI.colors.muted }}>{formatDateTime(message.at)}</div>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.5 }}>{message.text}</div>
                    {message.role === "assistant" && message.response ? (
                      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        {message.response.sourceModules.length ? (
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>
                            Sources: {message.response.sourceModules.join(", ")}
                          </div>
                        ) : null}
                        {message.response.recommendations.length ? (
                          <div style={{ display: "grid", gap: 8 }}>
                            {message.response.recommendations.map((recommendation, recIndex) => (
                              <div key={`${recommendation.title}-${recIndex}`} style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.colors.border}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                                  <div style={{ fontWeight: 800 }}>{recommendation.title}</div>
                                  {typeof recommendation.confidence === "number" ? (
                                    <div style={{ fontSize: 11, color: UI.colors.muted }}>{Math.round(recommendation.confidence * 100)}%</div>
                                  ) : null}
                                </div>
                                <div style={{ fontSize: 12, color: UI.colors.muted, marginTop: 6 }}>{recommendation.message}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {message.response.suggestedActions.length ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {message.response.suggestedActions.map((action) => (
                              <Button key={action.id} variant="secondary" onClick={() => void handleProductionAssistantAction(action)}>
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "jobs" ? (
          <JobsView
            jobsPage={jobsPage}
            setJobsPage={setJobsPage}
            jobs={jobs}
            filteredJobs={filteredJobs}
            jobsOpen={jobsOpen}
            jobsInProgress={jobsInProgress}
            jobsIncomplete={jobsIncomplete}
            jobsDone={jobsDone}
            customers={customers}
            workers={workers}
            quotes={quotes}
            machineOptions={machineOptions}
            quoteMaterialOptions={quoteMaterialOptions}
            selectedJobId={selectedJobId}
            setSelectedJobId={setSelectedJobId}
            selectedJob={selectedJob}
            jobTitle={jobTitle}
            setJobTitle={setJobTitle}
            jobCustomer={jobCustomer}
            setJobCustomer={setJobCustomer}
            jobAssignedTo={jobAssignedTo}
            setJobAssignedTo={setJobAssignedTo}
            jobQuantity={jobQuantity}
            setJobQuantity={setJobQuantity}
            selectedQuote={selectedQuote}
            setSelectedQuote={setSelectedQuote}
            jobPrice={jobPrice}
            setJobPrice={setJobPrice}
            jobCost={jobCost}
            setJobCost={setJobCost}
            jobFiles={jobFiles}
            setJobFiles={setJobFiles}
            jobSearch={jobSearch}
            setJobSearch={setJobSearch}
            jobDxfParts={jobDxfParts}
            jobDxfSaving={jobDxfSaving}
            jobDxfSelectedPartIds={jobDxfSelectedPartIds}
            jobDxfStatus={jobDxfStatus ?? ""}
            jobDxfLayers={jobDxfLayers}
            jobDxfSelectedLayers={jobDxfSelectedLayers}
            jobDxfCalculatedParts={jobDxfCalculatedParts}
            jobDxfTotalWeightKg={jobDxfTotalWeightKg}
            jobDxfCalculatedPartById={jobDxfCalculatedPartById}
            jobDxfDisplayFiles={jobDxfDisplayFiles}
            manualPlateShape={manualPlateShape}
            setManualPlateShape={setManualPlateShape}
            manualPlateName={manualPlateName}
            setManualPlateName={setManualPlateName}
            manualPlateWidthMm={manualPlateWidthMm}
            setManualPlateWidthMm={setManualPlateWidthMm}
            manualPlateHeightMm={manualPlateHeightMm}
            setManualPlateHeightMm={setManualPlateHeightMm}
            manualPlateDiameterMm={manualPlateDiameterMm}
            setManualPlateDiameterMm={setManualPlateDiameterMm}
            manualPlateQuantity={manualPlateQuantity}
            setManualPlateQuantity={setManualPlateQuantity}
            perfPartName={perfPartName}
            setPerfPartName={setPerfPartName}
            perfPlateWidthMm={perfPlateWidthMm}
            setPerfPlateWidthMm={setPerfPlateWidthMm}
            perfPlateHeightMm={perfPlateHeightMm}
            setPerfPlateHeightMm={setPerfPlateHeightMm}
            perfQuantity={perfQuantity}
            setPerfQuantity={setPerfQuantity}
            perfHoleType={perfHoleType}
            setPerfHoleType={setPerfHoleType}
            perfPatternType={perfPatternType}
            setPerfPatternType={setPerfPatternType}
            perfSpacingMode={perfSpacingMode}
            setPerfSpacingMode={setPerfSpacingMode}
            perfPitchMm={perfPitchMm}
            setPerfPitchMm={setPerfPitchMm}
            perfWebMm={perfWebMm}
            setPerfWebMm={setPerfWebMm}
            perfHoleSizeMm={perfHoleSizeMm}
            setPerfHoleSizeMm={setPerfHoleSizeMm}
            perfSlotLengthMm={perfSlotLengthMm}
            setPerfSlotLengthMm={setPerfSlotLengthMm}
            perfSlotWidthMm={perfSlotWidthMm}
            setPerfSlotWidthMm={setPerfSlotWidthMm}
            perfBorderXMm={perfBorderXMm}
            setPerfBorderXMm={setPerfBorderXMm}
            perfBorderYMm={perfBorderYMm}
            setPerfBorderYMm={setPerfBorderYMm}
            perfPreviewZoom={perfPreviewZoom}
            setPerfPreviewZoom={setPerfPreviewZoom}
            perforationPreview={perforationPreview}
            createJob={createJob}
            printJobCard={printJobCard}
            createAndPrintJobCardSet={createAndPrintJobCardSet}
            openJobCard={openJobCard}
            runQuantityCheck={runQuantityCheck}
            markJobDone={markJobDone}
            loadJobDxfFiles={loadJobDxfFiles}
            importJobDxfFromDesktopPicker={importJobDxfFromDesktopPicker}
            clearJobDxfReader={clearJobDxfReader}
            deleteSelectedJobDxfParts={deleteSelectedJobDxfParts}
            exportSelectedJobDxfAsCutDxf={exportSelectedJobDxfAsCutDxf}
            addManualJobPlate={addManualJobPlate}
            addManualPerforatedPlate={addManualPerforatedPlate}
            exportPerforationDxf={exportPerforationDxf}
            saveJobDxfParts={saveJobDxfParts}
            toggleJobDxfLayer={toggleJobDxfLayer}
            toggleJobDxfPartSelected={toggleJobDxfPartSelected}
            toggleSelectAllJobDxfParts={toggleSelectAllJobDxfParts}
            updateJobDxfPartQuantity={updateJobDxfPartQuantity}
            updateJobDxfPartMeta={updateJobDxfPartMeta}
            openJobFile={openJobFile}
            printJobFile={printJobFile}
          />
        ) : viewMode === "company_live" ? (
          <PageContainer>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, opacity: 0.72 }}>Connected Devices</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{cloudDashboard?.devices.length ?? 0}</div>
              </div>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, opacity: 0.72 }}>Jobs Completed Today</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{cloudDashboard?.jobsCompletedToday ?? 0}</div>
              </div>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, opacity: 0.72 }}>Quotes Created Today</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{cloudDashboard?.quotesCreatedToday ?? 0}</div>
              </div>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, opacity: 0.72 }}>Errors</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{cloudDashboard?.errors.length ?? 0}</div>
              </div>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, opacity: 0.72 }}>Recent DXF Imports</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{cloudDashboard?.recentDxfImports.length ?? 0}</div>
              </div>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, opacity: 0.72 }}>POs Detected</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{cloudDashboard?.purchaseOrdersDetected.length ?? 0}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Connected Devices</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(cloudDashboard?.devices ?? []).map((device) => (
                    <div key={device.deviceId} style={{ background: "#1b1c1f", borderRadius: 8, padding: 10 }}>
                      <div style={{ fontWeight: 700 }}>{device.deviceName}</div>
                      <div style={{ fontSize: 12, opacity: 0.78 }}>
                        {(device.userName || "No user")} · {device.role}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.62 }}>
                        Last seen {new Date(device.lastSeenAt).toLocaleString("en-ZA")}
                      </div>
                    </div>
                  ))}
                  {(cloudDashboard?.devices.length ?? 0) === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>No laptops have reported yet.</div>
                  ) : null}
                </div>
              </div>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>Recent Activity Feed</div>
                  <button
                    onClick={() => {
                      void syncCloudNow();
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #166534",
                      background: "#15803d",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 12
                    }}
                  >
                    Sync Now
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(cloudDashboard?.recentEvents ?? cloudEvents).slice(0, 30).map((event) => (
                    <div key={event.id} style={{ background: "#1b1c1f", borderRadius: 8, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 700 }}>{event.eventType}</div>
                        <div style={{ fontSize: 11, opacity: 0.62 }}>
                          {new Date(event.createdAt).toLocaleString("en-ZA")}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
                        Status: {event.status} · Retries: {event.retryCount}
                      </div>
                      {event.lastError ? (
                        <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 4 }}>{event.lastError}</div>
                      ) : null}
                    </div>
                  ))}
                  {((cloudDashboard?.recentEvents ?? cloudEvents).length ?? 0) === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>No activity yet.</div>
                  ) : null}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Recent DXF Imports</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(cloudDashboard?.recentDxfImports ?? []).map((event) => (
                    <div key={`dxf-${event.id}`} style={{ background: "#1b1c1f", borderRadius: 8, padding: 10 }}>
                      <div style={{ fontWeight: 700 }}>{event.eventType}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>{new Date(event.createdAt).toLocaleString("en-ZA")}</div>
                    </div>
                  ))}
                  {(cloudDashboard?.recentDxfImports.length ?? 0) === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>No DXF imports reported yet.</div>
                  ) : null}
                </div>
              </div>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Purchase Orders Detected</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(cloudDashboard?.purchaseOrdersDetected ?? []).map((event) => (
                    <div key={`po-${event.id}`} style={{ background: "#1b1c1f", borderRadius: 8, padding: 10 }}>
                      <div style={{ fontWeight: 700 }}>{event.eventType}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>{new Date(event.createdAt).toLocaleString("en-ZA")}</div>
                    </div>
                  ))}
                  {(cloudDashboard?.purchaseOrdersDetected.length ?? 0) === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>No purchase-order detections yet.</div>
                  ) : null}
                </div>
              </div>
            </div>
          </PageContainer>
        ) : viewMode === "part_dna" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, marginBottom: 16 }}>
              <div
                style={{
                  background: "#232428",
                  borderRadius: 16,
                  padding: 20,
                  border: "1px solid rgba(96,165,250,0.28)",
                  boxShadow: "0 0 0 1px rgba(59,130,246,0.1), 0 0 26px rgba(37,99,235,0.12)"
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 28, marginBottom: 8 }}>Part DNA</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.84, maxWidth: 760 }}>
                  This is the right place in your app to keep a permanent record of every quoted part. Each part can carry its own
                  unique code, preview image, customer link, quote history, job-card history, and a dedicated customer folder on the desktop.
                </div>
                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12
                  }}
                >
                  {[
                    {
                      title: "Unique Part Code",
                      body: "Generate a stable code for every DXF or quoted item and reuse that code on quotes, jobs, and files."
                    },
                    {
                      title: "Customer History",
                      body: "Store each part under the customer name so you can see repeat work and previous prices immediately."
                    },
                    {
                      title: "Part Image",
                      body: "Save a thumbnail or preview image of the part so it is easy to identify without opening the drawing first."
                    },
                    {
                      title: "Desktop Filing",
                      body: "Create a customer folder on the desktop and keep each part file under its own part-code filename."
                    }
                  ].map((item) => (
                    <div
                      key={item.title}
                      style={{
                        background: "#1b1d22",
                        borderRadius: 12,
                        padding: 14,
                        border: "1px solid rgba(96,165,250,0.24)"
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{item.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.78, lineHeight: 1.55 }}>{item.body}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: "#232428",
                  borderRadius: 16,
                  padding: 20,
                  border: "1px solid rgba(96,165,250,0.28)",
                  boxShadow: "0 0 0 1px rgba(59,130,246,0.1), 0 0 26px rgba(37,99,235,0.12)"
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>Use It With</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <button
                    onClick={() => setViewMode("quotes")}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(96,165,250,0.35)",
                      background: "#1b1d22",
                      color: "white",
                      cursor: "pointer",
                      textAlign: "left",
                      fontWeight: 700
                    }}
                  >
                    Open Quotes and DXF Reader
                  </button>
                  <button
                    onClick={() => setViewMode("jobs")}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(96,165,250,0.35)",
                      background: "#1b1d22",
                      color: "white",
                      cursor: "pointer",
                      textAlign: "left",
                      fontWeight: 700
                    }}
                  >
                    Open Job Cards
                  </button>
                  <button
                    onClick={() => setViewMode("customers")}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(96,165,250,0.35)",
                      background: "#1b1d22",
                      color: "white",
                      cursor: "pointer",
                      textAlign: "left",
                      fontWeight: 700
                    }}
                  >
                    Open Customers
                  </button>
                  <button
                    onClick={() => setViewMode("files")}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(96,165,250,0.35)",
                      background: "#1b1d22",
                      color: "white",
                      cursor: "pointer",
                      textAlign: "left",
                      fontWeight: 700
                    }}
                  >
                    Open File Organizer
                  </button>
                </div>
                <div style={{ marginTop: 16, fontSize: 12, opacity: 0.76, lineHeight: 1.6 }}>
                  Best fit:
                  <br />
                  `Email` brings in customer drawings.
                  <br />
                  `Part DNA` identifies and records the part.
                  <br />
                  `Quotes` prices it.
                  <br />
                  `Jobs` carries the same part code through production.
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: 16 }}>
              <div
                style={{
                  background: "#232428",
                  borderRadius: 16,
                  padding: 20,
                  border: "1px solid rgba(96,165,250,0.28)",
                  boxShadow: "0 0 0 1px rgba(59,130,246,0.1), 0 0 26px rgba(37,99,235,0.12)"
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>DXF Intake</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <input
                    type="file"
                    accept=".dxf"
                    multiple
                    onChange={(e) => {
                      void loadDxfReaderFiles(e.target.files ?? undefined);
                    }}
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid rgba(96,165,250,0.28)",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <button
                    onClick={() => {
                      void importDxfFromDesktopPicker();
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(96,165,250,0.35)",
                      background: "#1b1d22",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                      textAlign: "left"
                    }}
                  >
                    Import DXF From Desktop
                  </button>
                  <button
                    onClick={() => {
                      void analyzeSelectedDxfPartsForPartDna();
                    }}
                    disabled={partDnaBusy || dxfReaderParts.length === 0}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(96,165,250,0.35)",
                      background: partDnaBusy ? "#334155" : "#1d4ed8",
                      color: "white",
                      cursor: partDnaBusy || dxfReaderParts.length === 0 ? "not-allowed" : "pointer",
                      fontWeight: 800,
                      textAlign: "left"
                    }}
                  >
                    {partDnaBusy ? "Analyzing Part DNA..." : "Analyze Selected Parts"}
                  </button>
                  <button
                    onClick={() => {
                      void addSelectedDxfPartsToQuote();
                    }}
                    disabled={partDnaBusy || dxfReaderParts.length === 0}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(96,165,250,0.35)",
                      background: partDnaBusy || dxfReaderParts.length === 0 ? "#374151" : "#0f766e",
                      color: "white",
                      cursor: partDnaBusy || dxfReaderParts.length === 0 ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      textAlign: "left"
                    }}
                  >
                    Add Selected DNA Parts To Quote
                  </button>
                  <button
                    onClick={clearDxfReader}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(96,165,250,0.2)",
                      background: "#111827",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                      textAlign: "left"
                    }}
                  >
                    Clear Loaded DXF
                  </button>
                </div>
                <div style={{ marginTop: 12, fontSize: 12, opacity: 0.76, lineHeight: 1.55 }}>
                  {partDnaStatus ?? dxfReaderStatus ?? "Upload a DXF here. The app will split the drawing into parts, fingerprint the geometry, assign a part code, and keep the quote history under that code."}
                </div>

                <div style={{ marginTop: 18, fontWeight: 700, marginBottom: 8 }}>Current Record Fields</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                  {[
                    "Part code",
                    "Geometry hash",
                    "Soft hash",
                    "Customer",
                    "Material",
                    "Thickness",
                    "Quote history",
                    "Desktop folder"
                  ].map((field) => (
                    <div
                      key={field}
                      style={{
                        background: "#1b1d22",
                        borderRadius: 10,
                        padding: "10px 12px",
                        border: "1px solid rgba(96,165,250,0.22)",
                        fontSize: 12
                      }}
                    >
                      {field}
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: "#232428",
                  borderRadius: 16,
                  padding: 20,
                  border: "1px solid rgba(96,165,250,0.28)",
                  boxShadow: "0 0 0 1px rgba(59,130,246,0.1), 0 0 26px rgba(37,99,235,0.12)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>Detected Parts</div>
                  <div style={{ fontSize: 12, opacity: 0.76 }}>
                    {dxfReaderSelectedPartIds.length}/{dxfReaderParts.length} selected
                  </div>
                </div>
                {dxfReaderParts.length === 0 ? (
                  <div style={{ fontSize: 13, opacity: 0.68 }}>
                    No DXF parts loaded yet. Import one or more DXF files in this panel first.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {dxfReaderParts.map((part) => {
                      const dna = partDnaResultsByPartId[part.id];
                      const matchingQuotePart = quoteParts.find((entry) => entry.geometryHash && dna?.geometryHash === entry.geometryHash) ?? quoteParts.find((entry) => entry.name === part.name);
                      const priceDiffWarning =
                        dna?.previousQuotedPrice &&
                        matchingQuotePart?.unitPrice &&
                        dna.previousQuotedPrice > 0 &&
                        Math.abs(matchingQuotePart.unitPrice - dna.previousQuotedPrice) / dna.previousQuotedPrice > 0.15;
                      return (
                        <div
                          key={part.id}
                          style={{
                            background: "#1b1d22",
                            borderRadius: 14,
                            padding: 14,
                            border: "1px solid rgba(96,165,250,0.22)",
                            display: "grid",
                            gridTemplateColumns: "22px 96px minmax(0, 1fr)",
                            gap: 12,
                            alignItems: "start"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={dxfReaderSelectedPartIds.includes(part.id)}
                            onChange={() => toggleDxfReaderPart(part.id)}
                            style={{ marginTop: 6 }}
                          />
                          <div>
                            {part.thumbnailDataUrl ? (
                              <img
                                src={part.thumbnailDataUrl}
                                alt={part.name}
                                style={{ width: 96, height: 96, objectFit: "contain", borderRadius: 10, border: "1px solid #334155", background: "#0b1220" }}
                              />
                            ) : (
                              <div style={{ width: 96, height: 96, borderRadius: 10, border: "1px solid #334155", background: "#0b1220" }} />
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 6 }}>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: 17 }}>{part.name}</div>
                                <div style={{ fontSize: 12, opacity: 0.76 }}>
                                  {part.widthMm} x {part.heightMm} mm · Cut {part.cutLengthMm} mm · Pierce {part.pierceCount}
                                </div>
                              </div>
                              {dna ? (
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    padding: "6px 8px",
                                    borderRadius: 999,
                                    background: dna.isExistingPart ? "rgba(34,197,94,0.18)" : dna.nearMatches.some((match) => match.similarityPercent >= 92) ? "rgba(245,158,11,0.16)" : "rgba(59,130,246,0.18)",
                                    color: dna.isExistingPart ? "#86efac" : dna.nearMatches.some((match) => match.similarityPercent >= 92) ? "#fcd34d" : "#93c5fd"
                                  }}
                                >
                                  {dna.isExistingPart ? "Exact match found" : dna.nearMatches.some((match) => match.similarityPercent >= 92) ? "Possible same part" : "New part"}
                                </div>
                              ) : null}
                            </div>

                            {dna ? (
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                                <div style={{ background: "#111827", borderRadius: 10, padding: 10 }}>
                                  <div style={{ fontSize: 11, opacity: 0.64, marginBottom: 4 }}>Part Code</div>
                                  <div style={{ fontWeight: 800 }}>{dna.partCode}</div>
                                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Times quoted: {dna.timesQuoted}</div>
                                </div>
                                <div style={{ background: "#111827", borderRadius: 10, padding: 10 }}>
                                  <div style={{ fontSize: 11, opacity: 0.64, marginBottom: 4 }}>Bounding Size</div>
                                  <div>{dna.boundingBox.width.toFixed(2)} x {dna.boundingBox.height.toFixed(2)} mm</div>
                                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                                    Outside: {dna.boundingBox.outsideWidth.toFixed(2)} x {dna.boundingBox.outsideHeight.toFixed(2)} mm
                                  </div>
                                </div>
                                <div style={{ background: "#111827", borderRadius: 10, padding: 10 }}>
                                  <div style={{ fontSize: 11, opacity: 0.64, marginBottom: 4 }}>Previous Quote</div>
                                  <div>{dna.previousQuotedPrice ? formatRand(dna.previousQuotedPrice) : "No prior price"}</div>
                                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                                    Cut time: {dna.previousActualCutTime ? `${dna.previousActualCutTime} min` : "-"}
                                  </div>
                                </div>
                                <div style={{ background: "#111827", borderRadius: 10, padding: 10 }}>
                                  <div style={{ fontSize: 11, opacity: 0.64, marginBottom: 4 }}>Folder</div>
                                  <div style={{ fontSize: 11, lineHeight: 1.5, wordBreak: "break-word" }}>
                                    {dna.savedFiles?.folderPath ?? "Will be created under Desktop Part DNA"}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, opacity: 0.72 }}>
                                Run Part DNA analysis to assign a stable code, search previous quotes, and create the customer file folder for this part.
                              </div>
                            )}

                            {priceDiffWarning ? (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  background: "rgba(220,38,38,0.14)",
                                  border: "1px solid rgba(248,113,113,0.35)",
                                  color: "#fecaca",
                                  fontSize: 12
                                }}
                              >
                                Current quote price differs by more than 15% from the previous quoted price for this part.
                              </div>
                            ) : null}

                            {dna?.previousOperatorNotes ? (
                              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.78 }}>
                                <strong>Previous operator notes:</strong> {dna.previousOperatorNotes}
                              </div>
                            ) : null}

                            {dna ? (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: 12,
                                  borderRadius: 12,
                                  background: "#0f172a",
                                  border: "1px solid rgba(34,197,94,0.22)"
                                }}
                              >
                                <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 8, color: "#86efac" }}>
                                  Part DNA Intelligence
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                                  <div style={{ fontSize: 12 }}>
                                    <div style={{ opacity: 0.65, marginBottom: 4 }}>Exact match</div>
                                    <div>{dna.isExistingPart ? "Yes" : "No"}</div>
                                  </div>
                                  <div style={{ fontSize: 12 }}>
                                    <div style={{ opacity: 0.65, marginBottom: 4 }}>Complexity</div>
                                    <div>{typeof dna.complexityScore === "number" ? dna.complexityScore.toFixed(1) : "-"}</div>
                                  </div>
                                  <div style={{ fontSize: 12 }}>
                                    <div style={{ opacity: 0.65, marginBottom: 4 }}>Near matches</div>
                                    <div>{dna.nearMatches.length}</div>
                                  </div>
                                  <div style={{ fontSize: 12 }}>
                                    <div style={{ opacity: 0.65, marginBottom: 4 }}>Customer history</div>
                                    <div>{dna.customerHistory?.length ?? 0}</div>
                                  </div>
                                </div>

                                {dna.customerHistory?.length ? (
                                  <div style={{ marginTop: 10 }}>
                                    <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Customer History</div>
                                    <div style={{ display: "grid", gap: 6 }}>
                                      {dna.customerHistory.slice(0, 4).map((entry) => (
                                        <div
                                          key={`${part.id}-history-${entry.id}`}
                                          style={{
                                            padding: "8px 10px",
                                            borderRadius: 10,
                                            background: "#111827",
                                            border: "1px solid rgba(34,197,94,0.14)",
                                            fontSize: 12
                                          }}
                                        >
                                          <div style={{ fontWeight: 700 }}>
                                            {entry.customerName ?? entry.customerId ?? "Unknown customer"} · {entry.entityType} {entry.entityId}
                                          </div>
                                          <div style={{ opacity: 0.74, marginTop: 4 }}>
                                            {entry.material ?? "No material"}{entry.thickness !== null && entry.thickness !== undefined ? ` · ${entry.thickness}mm` : ""}
                                            {entry.quotedPrice !== null && entry.quotedPrice !== undefined ? ` · ${formatRand(entry.quotedPrice)}` : ""}
                                            {entry.actualCutTimeMinutes !== null && entry.actualCutTimeMinutes !== undefined ? ` · ${entry.actualCutTimeMinutes} min cut` : ""}
                                          </div>
                                          {entry.operatorNotes ? (
                                            <div style={{ opacity: 0.82, marginTop: 4 }}>{entry.operatorNotes}</div>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {dna.intelligenceRecommendations?.length ? (
                                  <div style={{ marginTop: 10 }}>
                                    <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Recommendations</div>
                                    <div style={{ display: "grid", gap: 6 }}>
                                      {dna.intelligenceRecommendations.slice(0, 3).map((entry) => (
                                        <div
                                          key={`${part.id}-rec-${entry.id}`}
                                          style={{
                                            padding: "8px 10px",
                                            borderRadius: 10,
                                            background: "rgba(59,130,246,0.1)",
                                            border: "1px solid rgba(96,165,250,0.16)",
                                            fontSize: 12
                                          }}
                                        >
                                          <div style={{ fontWeight: 700 }}>{entry.title}</div>
                                          <div style={{ opacity: 0.78, marginTop: 4 }}>{entry.message}</div>
                                          <div style={{ opacity: 0.62, marginTop: 4 }}>
                                            Confidence {Math.round(entry.confidence * 100)}% · Impact {entry.impactScore}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {dna?.nearMatches.length ? (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Near Matches</div>
                                <div style={{ display: "grid", gap: 6 }}>
                                  {dna.nearMatches.map((match) => (
                                    <div
                                      key={`${part.id}-${match.id}`}
                                      style={{
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        background: "#111827",
                                        border: "1px solid rgba(96,165,250,0.16)",
                                        fontSize: 12
                                      }}
                                    >
                                      {match.partCode} · {match.partName ?? "Unnamed"} · {match.similarityPercent}% similar
                                      {match.previousQuotedPrice !== null && match.previousQuotedPrice !== undefined ? ` · ${formatRand(match.previousQuotedPrice)}` : ""}
                                      {match.previousActualCutTimeMinutes !== null && match.previousActualCutTimeMinutes !== undefined ? ` · ${match.previousActualCutTimeMinutes} min` : ""}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                background: "#232428",
                borderRadius: 16,
                padding: 20,
                border: "1px solid rgba(96,165,250,0.28)",
                boxShadow: "0 0 0 1px rgba(59,130,246,0.1), 0 0 26px rgba(37,99,235,0.12)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 22 }}>Part DNA Library</div>
                  <div style={{ fontSize: 12, opacity: 0.76, marginTop: 4 }}>
                    All parts with DNA codes, grouped by customer with previous quote history and preview image.
                  </div>
                </div>
                <button
                  onClick={() => {
                    void loadPartDnaLibrary();
                  }}
                  disabled={partDnaLibraryLoading}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(96,165,250,0.35)",
                    background: partDnaLibraryLoading ? "#334155" : "#1d4ed8",
                    color: "white",
                    cursor: partDnaLibraryLoading ? "not-allowed" : "pointer",
                    fontWeight: 700
                  }}
                >
                  {partDnaLibraryLoading ? "Loading..." : "Refresh Library"}
                </button>
              </div>

              {partDnaLibraryLoading && partDnaLibrary.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.72 }}>Loading Part DNA library...</div>
              ) : groupedPartDnaLibrary.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.72 }}>
                  No Part DNA records found yet. Analyze a DXF part to build the library.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  {groupedPartDnaLibrary.map(([customerName, customerParts]) => (
                    <div key={customerName} style={{ background: "#1b1d22", borderRadius: 14, padding: 14, border: "1px solid rgba(96,165,250,0.18)" }}>
                      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>{customerName}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                        {customerParts.map((part) => (
                          <div
                            key={part.id}
                            style={{
                              background: "#111827",
                              borderRadius: 12,
                              padding: 12,
                              border: "1px solid rgba(96,165,250,0.16)",
                              display: "grid",
                              gridTemplateColumns: "92px minmax(0, 1fr)",
                              gap: 12,
                              alignItems: "start"
                            }}
                          >
                            <div
                              style={{
                                width: 92,
                                height: 92,
                                borderRadius: 10,
                                border: "1px solid #334155",
                                background: "#0b1220",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "hidden"
                              }}
                            >
                              {part.previewSvg ? (
                                <div
                                  style={{ width: "100%", height: "100%" }}
                                  dangerouslySetInnerHTML={{ __html: normalizePartDnaPreviewSvg(part.previewSvg) }}
                                />
                              ) : (
                                <div style={{ fontSize: 11, opacity: 0.56 }}>No image</div>
                              )}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 800, marginBottom: 4 }}>{part.partCode}</div>
                              <div style={{ fontSize: 12, opacity: 0.82, marginBottom: 6 }}>{part.partName ?? "Unnamed part"}</div>
                              <div style={{ fontSize: 12, opacity: 0.76, lineHeight: 1.55 }}>
                                Size: {part.boundingWidth.toFixed(2)} x {part.boundingHeight.toFixed(2)} mm
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.76, lineHeight: 1.55 }}>
                                Material: {part.material ?? "-"} · Thickness: {part.thickness ?? "-"}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.76, lineHeight: 1.55 }}>
                                Times quoted: {part.timesQuoted}
                              </div>
                              <div style={{ marginTop: 8, fontSize: 12 }}>
                                Previous quote: <strong>{part.previousQuotedPrice ? formatRand(part.previousQuotedPrice) : "No previous quote"}</strong>
                              </div>
                              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                                Quote date: {formatDateTime(part.previousQuotedAt)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : viewMode === "quotes" ? (
          <QuotesView
            quotesPage={quotesPage}
            setQuotesPage={setQuotesPage}
            quotes={quotes}
            customers={customers}
            quoteSeed={quoteSeed}
            setQuoteSeed={setQuoteSeed}
            quoteTitle={quoteTitle}
            setQuoteTitle={setQuoteTitle}
            quoteCustomerId={quoteCustomerId}
            setQuoteCustomerId={setQuoteCustomerId}
            quoteCompanyName={quoteCompanyName}
            setQuoteCompanyName={setQuoteCompanyName}
            quoteCompanyEmail={quoteCompanyEmail}
            setQuoteCompanyEmail={setQuoteCompanyEmail}
            quoteCompanyPhone={quoteCompanyPhone}
            setQuoteCompanyPhone={setQuoteCompanyPhone}
            quoteCompanyAddress={quoteCompanyAddress}
            setQuoteCompanyAddress={setQuoteCompanyAddress}
            quoteCompanyVatNumber={quoteCompanyVatNumber}
            setQuoteCompanyVatNumber={setQuoteCompanyVatNumber}
            quoteCompanyRegistrationNumber={quoteCompanyRegistrationNumber}
            setQuoteCompanyRegistrationNumber={setQuoteCompanyRegistrationNumber}
            quoteAccentColor={quoteAccentColor}
            setQuoteAccentColor={setQuoteAccentColor}
            companyProfileSaving={companyProfileSaving}
            quoteVatRate={quoteVatRate}
            setQuoteVatRate={setQuoteVatRate}
            costPerPierce={costPerPierce}
            setCostPerPierce={setCostPerPierce}
            costPerCutMm={costPerCutMm}
            setCostPerCutMm={setCostPerCutMm}
            costPerBend={costPerBend}
            setCostPerBend={setCostPerBend}
            dxfReaderLayers={dxfReaderLayers}
            dxfReaderSelectedLayers={dxfReaderSelectedLayers}
            dxfReaderParts={dxfReaderParts}
            dxfReaderSourceFiles={dxfReaderSourceFiles}
            dxfReaderSelectedPartIds={dxfReaderSelectedPartIds}
            setDxfReaderSelectedPartIds={setDxfReaderSelectedPartIds}
            dxfReaderStatus={dxfReaderStatus}
            setDxfReaderStatus={setDxfReaderStatus}
            dxfReaderTextInput={dxfReaderTextInput}
            setDxfReaderTextInput={setDxfReaderTextInput}
            pdfReaderSourcePages={pdfReaderSourcePages}
            pdfReaderParts={pdfReaderParts}
            pdfReaderSelectedPartIds={pdfReaderSelectedPartIds}
            setPdfReaderSelectedPartIds={setPdfReaderSelectedPartIds}
            pdfReaderStatus={pdfReaderStatus}
            dxfMergeToleranceMm={dxfMergeToleranceMm}
            setDxfMergeToleranceMm={setDxfMergeToleranceMm}
            nestingGapMm={nestingGapMm}
            setNestingGapMm={setNestingGapMm}
            nestingResults={nestingResults}
            materialSearch={materialSearch}
            setMaterialSearch={setMaterialSearch}
            materials={materials}
            setMaterials={setMaterials}
            newMaterialName={newMaterialName}
            setNewMaterialName={setNewMaterialName}
            newMaterialDensity={newMaterialDensity}
            setNewMaterialDensity={setNewMaterialDensity}
            thicknessRates={thicknessRates}
            setThicknessRates={setThicknessRates}
            newThicknessMm={newThicknessMm}
            setNewThicknessMm={setNewThicknessMm}
            newThicknessRate={newThicknessRate}
            setNewThicknessRate={setNewThicknessRate}
            quickPartName={quickPartName}
            setQuickPartName={setQuickPartName}
            quickPartLength={quickPartLength}
            setQuickPartLength={setQuickPartLength}
            quickPartWidth={quickPartWidth}
            setQuickPartWidth={setQuickPartWidth}
            quickPartThickness={quickPartThickness}
            setQuickPartThickness={setQuickPartThickness}
            quickPartQuantity={quickPartQuantity}
            setQuickPartQuantity={setQuickPartQuantity}
            quickPartMaterial={quickPartMaterial}
            setQuickPartMaterial={setQuickPartMaterial}
            stockQuoteSuggestion={stockQuoteSuggestion}
            stockQuoteOffcutMatch={stockQuoteOffcutMatch}
            selectedQuotePartIndex={selectedQuotePartIndex}
            setSelectedQuotePartIndex={setSelectedQuotePartIndex}
            quoteSearchTerm={quoteSearchTerm}
            setQuoteSearchTerm={setQuoteSearchTerm}
            quotePreviewUrl={quotePreviewUrl}
            quotePreviewLoading={quotePreviewLoading}
            weldingRates={weldingRates}
            setWeldingRates={setWeldingRates}
            newWeldingRateMaterial={newWeldingRateMaterial}
            setNewWeldingRateMaterial={setNewWeldingRateMaterial}
            newWeldingRateThickness={newWeldingRateThickness}
            setNewWeldingRateThickness={setNewWeldingRateThickness}
            newWeldingRatePrice={newWeldingRatePrice}
            setNewWeldingRatePrice={setNewWeldingRatePrice}
            bendingRates={bendingRates}
            setBendingRates={setBendingRates}
            newBendingRateMaterial={newBendingRateMaterial}
            setNewBendingRateMaterial={setNewBendingRateMaterial}
            newBendingRateThickness={newBendingRateThickness}
            setNewBendingRateThickness={setNewBendingRateThickness}
            newBendingShortPrice={newBendingShortPrice}
            setNewBendingShortPrice={setNewBendingShortPrice}
            newBendingLongPrice={newBendingLongPrice}
            setNewBendingLongPrice={setNewBendingLongPrice}
            rollingRates={rollingRates}
            setRollingRates={setRollingRates}
            newRollingRateMaterial={newRollingRateMaterial}
            setNewRollingRateMaterial={setNewRollingRateMaterial}
            newRollingRateThickness={newRollingRateThickness}
            setNewRollingRateThickness={setNewRollingRateThickness}
            newRollingRatePrice={newRollingRatePrice}
            setNewRollingRatePrice={setNewRollingRatePrice}
            quoteParts={quoteParts}
            punchParts={punchParts}
            weldParts={weldParts}
            bendParts={bendParts}
            rollingParts={rollingParts}
            copiedPart={copiedPart}
            workspaceId={workspaceId}
            quoteLogoDataUrl={quoteLogoDataUrl}
            setQuoteLogoDataUrl={setQuoteLogoDataUrl}
            selectedRecentQuoteId={selectedRecentQuoteId}
            setSelectedRecentQuoteId={setSelectedRecentQuoteId}
            calculatedParts={calculatedParts}
            punchCalculatedParts={punchCalculatedParts}
            punchPartsTotal={punchPartsTotal}
            punchPartsVat={punchPartsVat}
            punchPartsFinal={punchPartsFinal}
            punchPartsWeight={punchPartsWeight}
            laserSubTotal={laserSubTotal}
            laserVat={laserVat}
            laserTotal={laserTotal}
            parsedVatRate={parsedVatRate}
            densityByMaterial={densityByMaterial}
            rateByMaterial={rateByMaterial}
            punchPriceByThickness={punchPriceByThickness}
            parsedCostPerPierce={parsedCostPerPierce}
            parsedCostPerCutMm={parsedCostPerCutMm}
            parsedCostPerBend={parsedCostPerBend}
            weldCalculatedParts={weldCalculatedParts}
            weldingSubTotal={weldingSubTotal}
            weldingVat={weldingVat}
            weldingTotal={weldingTotal}
            weldingTotalMeters={weldingTotalMeters}
            bendCalculatedParts={bendCalculatedParts}
            bendingSubTotal={bendingSubTotal}
            bendingVat={bendingVat}
            bendingTotal={bendingTotal}
            bendingTotalBends={bendingTotalBends}
            rollingCalculatedParts={rollingCalculatedParts}
            rollingSubTotal={rollingSubTotal}
            rollingVat={rollingVat}
            rollingTotal={rollingTotal}
            rollingTotalMeters={rollingTotalMeters}
            rollingTotalAreaSqm={rollingTotalAreaSqm}
            rollingTotalWeightKg={rollingTotalWeightKg}
            quoteNumber={quoteNumber}
            quoteMaterialOptions={quoteMaterialOptions}
            activeQuoteStockPart={activeQuoteStockPart}
            recommendedNesting={recommendedNesting}
            groupedRecentQuotes={groupedRecentQuotes}
            selectedRecentQuote={selectedRecentQuote}
            createQuote={createQuote}
            saveQuoteSeed={saveQuoteSeed}
            openQuotePdf={openQuotePdf}
            printQuotePdf={printQuotePdf}
            createInvoiceFromQuote={createInvoiceFromQuote}
            createAutoJobCardFromQuote={createAutoJobCardFromQuote}
            exportQuotePdf={exportQuotePdf}
            printInvoicePdf={printInvoicePdf}
            addQuotePart={addQuotePart}
            removeQuotePart={removeQuotePart}
            updateQuotePart={updateQuotePart}
            addPunchPart={addPunchPart}
            removePunchPart={removePunchPart}
            updatePunchPart={updatePunchPart}
            addWeldPart={addWeldPart}
            removeWeldPart={removeWeldPart}
            updateWeldPart={updateWeldPart}
            addBendPart={addBendPart}
            removeBendPart={removeBendPart}
            updateBendPart={updateBendPart}
            addRollingPart={addRollingPart}
            removeRollingPart={removeRollingPart}
            updateRollingPart={updateRollingPart}
            addMaterial={addMaterial}
            addMaterialFromLibrary={addMaterialFromLibrary}
            addThicknessRate={addThicknessRate}
            addQuickPart={addQuickPart}
            focusCell={focusCell}
            handleCellKeyDown={handleCellKeyDown}
            loadDxfReaderFiles={loadDxfReaderFiles}
            ingestDxfRaw={ingestDxfRaw}
            renameDxfReaderPart={renameDxfReaderPart}
            loadPdfReaderFiles={loadPdfReaderFiles}
            renamePdfReaderPart={renamePdfReaderPart}
            pickAccentFromLogo={pickAccentFromLogo}
            formatRand={formatRand}
            apiFetch={apiFetch}
            saveCompanyProfile={saveCompanyProfile}
            runNestingEstimate={runNestingEstimate}
            useSuggestedOffcut={useSuggestedOffcut}
            uploadQuotePartDxf={uploadQuotePartDxf}
            uploadQuotePartDxfFromDesktopPicker={uploadQuotePartDxfFromDesktopPicker}
            importDxfFromDesktopPicker={importDxfFromDesktopPicker}
            importPdfFromDesktopPicker={importPdfFromDesktopPicker}
            clearDxfReader={clearDxfReader}
            clearPdfReader={clearPdfReader}
            toggleDxfReaderLayer={toggleDxfReaderLayer}
            toggleDxfReaderPart={toggleDxfReaderPart}
            togglePdfReaderPart={togglePdfReaderPart}
            deleteSelectedDxfReaderParts={deleteSelectedDxfReaderParts}
            deleteSelectedPdfReaderParts={deleteSelectedPdfReaderParts}
            toggleSelectAllDxfReaderParts={toggleSelectAllDxfReaderParts}
            toggleSelectAllPdfReaderParts={toggleSelectAllPdfReaderParts}
            addSelectedDxfPartsToQuote={addSelectedDxfPartsToQuote}
            addSelectedPdfPartsToQuote={addSelectedPdfPartsToQuote}
            updateDxfReaderPartQuantity={updateDxfReaderPartQuantity}
            addWeldingRate={addWeldingRate}
            addBendingRate={addBendingRate}
            addRollingRate={addRollingRate}
          />
        ) : viewMode === "tank" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr", gap: 12 }}>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Tank Calculator</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                  Enter tank dimensions, thickness, material, and fabrication rate. All values are in Rands.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input
                    value={tankLengthMm}
                    onChange={(e) => setTankLengthMm(e.target.value)}
                    placeholder="Length mm"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <input
                    value={tankWidthMm}
                    onChange={(e) => setTankWidthMm(e.target.value)}
                    placeholder="Width mm"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <input
                    value={tankHeightMm}
                    onChange={(e) => setTankHeightMm(e.target.value)}
                    placeholder="Height mm"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <select
                    value={tankThicknessMm}
                    onChange={(e) => setTankThicknessMm(e.target.value)}
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  >
                    {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value} mm
                      </option>
                    ))}
                  </select>
                  <select
                    value={tankMaterial}
                    onChange={(e) => setTankMaterial(e.target.value)}
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  >
                    {materials.map((material) => (
                      <option key={material.name} value={material.name}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={tankQuantity}
                    onChange={(e) => setTankQuantity(e.target.value)}
                    placeholder="Quantity"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <input
                    value={tankFabRatePerKg}
                    onChange={(e) => setTankFabRatePerKg(e.target.value)}
                    placeholder="Fabrication rate R/kg"
                    style={{ gridColumn: "span 2", padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                </div>
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Fittings</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8 }}>
                    <select
                      value={tankFittingGroup}
                      onChange={(e) => {
                        const group = e.target.value;
                        const firstFitting =
                          SANITARY_FITTING_GROUPS.find((entry) => entry.group === group)?.fittings[0] ?? "";
                        setTankFittingGroup(group);
                        setTankFitting(firstFitting);
                      }}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                    >
                      {SANITARY_FITTING_GROUPS.map((entry) => (
                        <option key={entry.group} value={entry.group}>
                          {entry.group}
                        </option>
                      ))}
                    </select>
                    <select
                      value={tankFitting}
                      onChange={(e) => setTankFitting(e.target.value)}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                    >
                      {tankFittingsForSelectedGroup.map((entry) => (
                        <option key={entry} value={entry}>
                          {entry}
                        </option>
                      ))}
                    </select>
                    <select
                      value={tankFittingSize}
                      onChange={(e) => setTankFittingSize(e.target.value)}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                    >
                      <option value="">Size (optional)</option>
                      {SANITARY_STANDARD_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={addTankFittingSelection}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #444",
                        background: "#2b2d31",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 700,
                        whiteSpace: "nowrap"
                      }}
                    >
                      Add Fitting
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 120, overflow: "auto" }}>
                    {tankFittingSelections.length === 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.65 }}>No fittings selected yet.</div>
                    ) : (
                      tankFittingSelections.map((entry, index) => (
                        <div
                          key={`${entry}-${index}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: 8,
                            alignItems: "center",
                            background: "#1b1c1f",
                            borderRadius: 8,
                            padding: "6px 8px"
                          }}
                        >
                          <div style={{ fontSize: 12 }}>{entry}</div>
                          <button
                            onClick={() => removeTankFittingSelection(index)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #444",
                              background: "transparent",
                              color: "#d1d5db",
                              cursor: "pointer",
                              fontSize: 11
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <button
                  onClick={applyTankCalcToQuote}
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #444",
                    background: "#16a34a",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 700
                  }}
                >
                  Use In Quote Tank Section
                </button>
              </div>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Tank Totals</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Area: {tankSurfaceAreaSqm.toFixed(3)} m²</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Weight per tank: {tankWeightKg.toFixed(2)} kg</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Material per tank: {formatRand(tankMaterialCostPerUnit)}</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Fabrication per tank: {formatRand(tankFabCostPerUnit)}</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Sub total: {formatRand(tankSubTotal)}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>VAT: {formatRand(tankVat)}</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Total: {formatRand(tankTotal)}</div>
              </div>
            </div>
          </div>
        ) : viewMode === "documents" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, alignItems: "start" }}>
              <div style={{ background: "#232428", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  onClick={() => setDocsPage("purchase_orders")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: docsPage === "purchase_orders" ? "2px solid #5865f2" : "1px solid #444",
                    background: docsPage === "purchase_orders" ? "#1f2430" : "#232428",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left"
                  }}
                >
                  Purchase Orders
                </button>
                <button
                  onClick={() => setDocsPage("invoices")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: docsPage === "invoices" ? "2px solid #5865f2" : "1px solid #444",
                    background: docsPage === "invoices" ? "#1f2430" : "#232428",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left"
                  }}
                >
                  Invoices
                </button>
                <button
                  onClick={() => setDocsPage("recent_quotes")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: docsPage === "recent_quotes" ? "2px solid #5865f2" : "1px solid #444",
                    background: docsPage === "recent_quotes" ? "#1f2430" : "#232428",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left"
                  }}
                >
                  Recent Quotes
                </button>
                <button
                  onClick={() => setDocsPage("delivery_notes")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: docsPage === "delivery_notes" ? "2px solid #5865f2" : "1px solid #444",
                    background: docsPage === "delivery_notes" ? "#1f2430" : "#232428",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left"
                  }}
                >
                  Delivery Notes
                </button>
              </div>

              <div>
                {docsPage === "purchase_orders" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 12 }}>
                    <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontWeight: 700, marginBottom: 12 }}>Create Purchase Order</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <input
                          value={poTitle}
                          onChange={(e) => setPoTitle(e.target.value)}
                          placeholder="PO title"
                          style={{ gridColumn: "span 2", padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <select
                          value={poCustomerId}
                          onChange={(e) => setPoCustomerId(e.target.value)}
                          style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        >
                          <option value="">Select customer</option>
                          {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>{customer.name}</option>
                          ))}
                        </select>
                        <input
                          value={poAmount}
                          onChange={(e) => setPoAmount(e.target.value)}
                          placeholder="Amount (R)"
                          style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <textarea
                          value={poNotes}
                          onChange={(e) => setPoNotes(e.target.value)}
                          placeholder="PO notes"
                          style={{ gridColumn: "span 2", minHeight: 90, padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <button
                          onClick={createPurchaseOrderDoc}
                          style={{ gridColumn: "span 2", padding: "10px 12px", borderRadius: 8, border: "1px solid #444", background: "#16a34a", color: "white", cursor: "pointer", fontWeight: 700 }}
                        >
                          Create Purchase Order
                        </button>
                      </div>
                    </div>
                    <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontWeight: 700, marginBottom: 12 }}>Recent Purchase Orders</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {purchaseOrders.map((doc) => (
                          <div key={doc.id} style={{ background: "#1b1c1f", padding: 10, borderRadius: 8 }}>
                            <div style={{ fontWeight: 700 }}>{doc.number}</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>{doc.title}</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              {doc.customerName} · {formatRand(doc.amount ?? 0)}
                            </div>
                          </div>
                        ))}
                        {purchaseOrders.length === 0 ? <div style={{ fontSize: 12, opacity: 0.65 }}>No purchase orders yet.</div> : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {docsPage === "invoices" ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontWeight: 700, marginBottom: 12 }}>Create Invoice</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <input
                          value={invoiceTitle}
                          onChange={(e) => setInvoiceTitle(e.target.value)}
                          placeholder="Invoice title"
                          style={{ gridColumn: "span 2", padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <select
                          value={invoiceCustomerId}
                          onChange={(e) => setInvoiceCustomerId(e.target.value)}
                          style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        >
                          <option value="">Select customer</option>
                          {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>{customer.name}</option>
                          ))}
                        </select>
                        <input
                          value={invoiceAmount}
                          onChange={(e) => setInvoiceAmount(e.target.value)}
                          placeholder="Amount (R)"
                          style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <textarea
                          value={invoiceNotes}
                          onChange={(e) => setInvoiceNotes(e.target.value)}
                          placeholder="Invoice notes"
                          style={{ gridColumn: "span 2", minHeight: 90, padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <button
                          onClick={createInvoiceDoc}
                          style={{ gridColumn: "span 2", padding: "10px 12px", borderRadius: 8, border: "1px solid #444", background: "#16a34a", color: "white", cursor: "pointer", fontWeight: 700 }}
                        >
                          Create Invoice
                        </button>
                      </div>
                    </div>
                    <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontWeight: 700, marginBottom: 10 }}>Invoices (Completed + Manual)</div>
                      <input
                        value={invoiceSearchTerm}
                        onChange={(e) => setInvoiceSearchTerm(e.target.value)}
                        placeholder="Search by invoice number, customer, title..."
                        style={{
                          width: "100%",
                          marginBottom: 10,
                          padding: 10,
                          borderRadius: 8,
                          border: "1px solid #333",
                          background: "#111",
                          color: "white"
                        }}
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.9fr) 360px", gap: 12, alignItems: "start" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, maxHeight: 760, overflow: "auto", paddingRight: 4 }}>
                          {groupedInvoiceDocs.map(([customerName, docs]) => (
                            <div key={customerName} style={{ background: "#1f2024", borderRadius: 12, padding: 14 }}>
                              <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 10 }}>{customerName}</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {docs.map((doc) => (
                                  <div
                                    key={doc.id}
                                    onClick={() => setSelectedInvoiceDocId(doc.id)}
                                    style={{
                                      background: selectedInvoiceDoc?.id === doc.id ? "#111827" : "#18181b",
                                      padding: 12,
                                      borderRadius: 10,
                                      border: selectedInvoiceDoc?.id === doc.id ? "1px solid #60a5fa" : "1px solid #2f3440",
                                      cursor: "pointer"
                                    }}
                                  >
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                      <div style={{ fontWeight: 700, fontSize: 13 }}>{doc.number}</div>
                                      <div style={{ fontSize: 10, opacity: 0.72 }}>{doc.source === "quote" ? "Auto" : "Manual"}</div>
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.35, marginTop: 4 }}>{doc.title}</div>
                                    <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
                                      {formatRand(doc.amount ?? 0)} · {new Date(doc.createdAt).toLocaleDateString("en-ZA")}
                                    </div>
                                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                                      <button
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setSelectedInvoiceDocId(doc.id);
                                        }}
                                        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #444", background: "#2f3136", color: "white", cursor: "pointer", fontSize: 12 }}
                                      >
                                        Preview
                                      </button>
                                      {doc.quoteId ? (
                                        <button
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void printInvoicePdf(doc.quoteId as string);
                                          }}
                                          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #2563eb", background: "#2563eb", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                                        >
                                          Print Invoice
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          {groupedInvoiceDocs.length === 0 ? <div style={{ fontSize: 12, opacity: 0.65 }}>No invoices found.</div> : null}
                        </div>
                        <div style={{ background: "#111827", borderRadius: 10, border: "1px solid #2f3440", padding: 10, minHeight: 430, position: "sticky", top: 16 }}>
                          {selectedInvoiceDoc ? (
                            <>
                              <div style={{ fontWeight: 700, fontSize: 28, marginBottom: 6 }}>Invoice Preview</div>
                              <div style={{ fontWeight: 700, marginBottom: 6 }}>{selectedInvoiceDoc.number}</div>
                              <div style={{ fontSize: 12, opacity: 0.82, marginBottom: 4 }}>{selectedInvoiceDoc.title}</div>
                              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                                {selectedInvoiceDoc.customerName} · {formatRand(selectedInvoiceDoc.amount ?? 0)}
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                                {selectedInvoiceQuoteId ? (
                                  <>
                                    <button
                                      onClick={() => void openInvoicePdf(selectedInvoiceQuoteId)}
                                      style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "white", cursor: "pointer", fontSize: 12 }}
                                    >
                                      Open Invoice
                                    </button>
                                    <button
                                      onClick={() => void printInvoicePdf(selectedInvoiceQuoteId)}
                                      style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #2563eb", background: "#2563eb", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                                    >
                                      Print Invoice
                                    </button>
                                  </>
                                ) : null}
                              </div>
                              {selectedInvoiceQuoteId ? (
                                invoicePreviewLoading ? (
                                  <div style={{ fontSize: 12, opacity: 0.7 }}>Loading invoice preview...</div>
                                ) : invoicePreviewUrl ? (
                                  <iframe
                                    title={`invoice-preview-${selectedInvoiceDoc.id}`}
                                    src={invoicePreviewUrl}
                                    style={{ width: "100%", height: 560, border: "1px solid #334155", borderRadius: 8, background: "white" }}
                                  />
                                ) : (
                                  <div style={{ fontSize: 12, opacity: 0.7 }}>Invoice preview unavailable.</div>
                                )
                              ) : (
                                <div style={{ fontSize: 12, opacity: 0.72 }}>Manual invoice record (no PDF source attached).</div>
                              )}
                            </>
                          ) : (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>Select an invoice to preview.</div>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.62, marginTop: 8 }}>
                        Auto invoices are pulled from completed quotes (accepted status).
                      </div>
                    </div>
                  </div>
                ) : null}

                {docsPage === "recent_quotes" ? (
                  <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent Quotes</div>
                    <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 12 }}>
                      Browse quotes by customer, search them, and preview the selected PDF on the right.
                    </div>
                    <input
                      value={quoteSearchTerm}
                      onChange={(e) => setQuoteSearchTerm(e.target.value)}
                      placeholder="Search all quotes by quote number, customer, title, status..."
                      style={{
                        width: "100%",
                        marginBottom: 12,
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid #333",
                        background: "#111",
                        color: "white"
                      }}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.9fr) 360px", gap: 12, alignItems: "start" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, maxHeight: 760, overflow: "auto", paddingRight: 4 }}>
                        {groupedRecentQuotes.map(([customerName, customerQuotes]) => (
                          <div key={`docs-${customerName}`} style={{ background: "#1f2024", borderRadius: 12, padding: 14 }}>
                            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 10 }}>{customerName}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {customerQuotes.map((quote) => (
                                <div
                                  key={`docs-${quote.id}`}
                                  onClick={() => setSelectedRecentQuoteId(quote.id)}
                                  style={{
                                    background: selectedRecentQuote?.id === quote.id ? "#111827" : "#18181b",
                                    border: selectedRecentQuote?.id === quote.id ? "1px solid #60a5fa" : "1px solid #2f3440",
                                    borderRadius: 10,
                                    padding: 12,
                                    cursor: "pointer"
                                  }}
                                >
                                  <div style={{ fontWeight: 700, lineHeight: 1.25 }}>{quote.quoteNumber}</div>
                                  <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4, marginTop: 4 }}>{quote.title}</div>
                                  <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
                                    {quote.status} · {formatRand(quote.total)}
                                  </div>
                                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedRecentQuoteId(quote.id);
                                      }}
                                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #444", background: "#2f3136", color: "white", cursor: "pointer", fontSize: 12 }}
                                    >
                                      Preview
                                    </button>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void printQuotePdf(quote.id);
                                      }}
                                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #444", background: "#5865f2", color: "white", cursor: "pointer", fontSize: 12 }}
                                    >
                                      Print Quote
                                    </button>
                                    {quote.status === "accepted" ? (
                                      <button
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void printInvoicePdf(quote.id);
                                        }}
                                        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #444", background: "#0ea5e9", color: "white", cursor: "pointer", fontSize: 12 }}
                                      >
                                        Print Invoice
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {groupedRecentQuotes.length === 0 ? <div style={{ fontSize: 12, opacity: 0.65 }}>No quotes found.</div> : null}
                      </div>
                      <div style={{ background: "#1f2024", borderRadius: 12, padding: 16, position: "sticky", top: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 28, marginBottom: 8 }}>Quote Preview</div>
                        {selectedRecentQuote ? (
                          <>
                            <div style={{ fontSize: 13, opacity: 0.82, marginBottom: 4 }}>{selectedRecentQuote.quoteNumber}</div>
                            <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 12 }}>
                              {selectedRecentQuote.customerName ?? "-"} · {formatRand(selectedRecentQuote.total)}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                              <button
                                onClick={() => void openQuotePdf(selectedRecentQuote.id)}
                                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#111827", color: "white", cursor: "pointer", fontSize: 12 }}
                              >
                                Open Quote
                              </button>
                              <button
                                onClick={() => void exportQuotePdf(selectedRecentQuote.id)}
                                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #166534", background: "#166534", color: "white", cursor: "pointer", fontSize: 12 }}
                              >
                                Export PDF
                              </button>
                              <button
                                onClick={() => {
                                  void createInvoiceFromQuote(selectedRecentQuote);
                                }}
                                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #0f766e", background: "#0f766e", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                              >
                                Create Invoice
                              </button>
                            </div>
                            {quotePreviewLoading ? (
                              <div style={{ fontSize: 12, opacity: 0.72 }}>Loading quote preview...</div>
                            ) : quotePreviewUrl ? (
                              <iframe
                                title={`docs-quote-preview-${selectedRecentQuote.id}`}
                                src={quotePreviewUrl}
                                style={{ width: "100%", height: 560, border: "1px solid #334155", borderRadius: 8, background: "white" }}
                              />
                            ) : (
                              <div style={{ fontSize: 12, opacity: 0.72 }}>Quote preview unavailable.</div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: 12, opacity: 0.72 }}>Select a quote to preview.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {docsPage === "delivery_notes" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 12 }}>
                    <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontWeight: 700, marginBottom: 12 }}>Create Delivery Note</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <input
                          value={deliveryTitle}
                          onChange={(e) => setDeliveryTitle(e.target.value)}
                          placeholder="Delivery note title"
                          style={{ gridColumn: "span 2", padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <select
                          value={deliveryQuoteId}
                          onChange={(e) => applyQuoteToDeliveryNote(e.target.value)}
                          style={{ gridColumn: "span 2", padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        >
                          <option value="">Select quote (optional)</option>
                          {quotes.map((quote) => (
                            <option key={quote.id} value={quote.id}>
                              {quote.quoteNumber} - {quote.title}
                            </option>
                          ))}
                        </select>
                        <select
                          value={deliveryCustomerId}
                          onChange={(e) => setDeliveryCustomerId(e.target.value)}
                          style={{ gridColumn: "span 2", padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        >
                          <option value="">Select customer</option>
                          {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>{customer.name}</option>
                          ))}
                        </select>
                        <textarea
                          value={deliveryNotesText}
                          onChange={(e) => setDeliveryNotesText(e.target.value)}
                          placeholder="Items delivered / delivery comments"
                          style={{ gridColumn: "span 2", minHeight: 110, padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <button
                          onClick={createDeliveryNoteDoc}
                          style={{ gridColumn: "span 2", padding: "10px 12px", borderRadius: 8, border: "1px solid #444", background: "#16a34a", color: "white", cursor: "pointer", fontWeight: 700 }}
                        >
                          Create Delivery Note
                        </button>
                      </div>
                    </div>
                    <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontWeight: 700, marginBottom: 12 }}>Recent Delivery Notes</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {deliveryNotes.map((doc) => (
                          <div key={doc.id} style={{ background: "#1b1c1f", padding: 10, borderRadius: 8 }}>
                            <div style={{ fontWeight: 700 }}>{doc.number}</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>{doc.title}</div>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              {doc.customerName}{Number.isFinite(doc.amount) ? ` · ${formatRand(doc.amount ?? 0)}` : ""}
                            </div>
                          </div>
                        ))}
                        {deliveryNotes.length === 0 ? <div style={{ fontSize: 12, opacity: 0.65 }}>No delivery notes yet.</div> : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : viewMode === "email" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16, order: 99, gridColumn: "1 / -1" }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Detection Board</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 12 }}>
                  Auto-detected emails are split into Quotes and Purchase Orders. Select any card to preview and push files into Quote/Job tools.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(210px, 1fr) minmax(210px, 1fr) minmax(210px, 1fr) minmax(280px, 1.2fr)", gap: 12 }}>
                  <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 10, border: "1px solid #2f3440", maxHeight: 420, overflow: "auto" }}>
                    <div style={{ fontWeight: 700, color: "#38bdf8", marginBottom: 8 }}>Quotes ({quoteDetectionEntries.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {quoteDetectionEntries.map((entry) => (
                        <div key={`quote-${entry.message.uid}-${entry.message.date}`} style={{ background: "#111827", borderRadius: 8, border: "1px solid #2f3b52", padding: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.message.subject || "(no subject)"}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>{entry.message.from}</div>
                          <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 4 }}>
                            Sent: {formatSentTimestamp(entry.message.date)}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
                            Refs: {entry.refs.length ? entry.refs.join(", ") : "-"}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button
                              onClick={() => {
                                setMessageAsDetectionPreview(entry.message);
                              }}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 7,
                                border: "1px solid #46526a",
                                background: "#1f2937",
                                color: "white",
                                cursor: "pointer",
                                fontSize: 11
                              }}
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => {
                                void (async () => {
                                  setMessageAsDetectionPreview(entry.message);
                                  const detection = await detectEmailContent({
                                    fromEmail: entry.message.from,
                                    subject: entry.message.subject,
                                    body: cleanEmailDisplayText(entry.message.snippet || ""),
                                    silent: true
                                  });
                                  addDetectedQuoteToCalculator(detection, entry.message);
                                })();
                              }}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 7,
                                border: "1px solid #3f4f71",
                                background: "#1d4ed8",
                                color: "white",
                                cursor: "pointer",
                                fontSize: 11
                              }}
                            >
                              Add Quote
                            </button>
                          </div>
                        </div>
                      ))}
                      {quoteDetectionEntries.length === 0 ? <div style={{ fontSize: 12, opacity: 0.65 }}>No quote emails detected.</div> : null}
                    </div>
                  </div>

                  <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 10, border: "1px solid #2f3440", maxHeight: 420, overflow: "auto" }}>
                    <div style={{ fontWeight: 700, color: "#f59e0b", marginBottom: 8 }}>Purchase Orders ({purchaseOrderDetectionEntries.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {purchaseOrderDetectionEntries.map((entry) => (
                        <div key={`po-${entry.message.uid}-${entry.message.date}`} style={{ background: "#111827", borderRadius: 8, border: "1px solid #2f3b52", padding: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.message.subject || "(no subject)"}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>{entry.message.from}</div>
                          <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 4 }}>
                            Sent: {formatSentTimestamp(entry.message.date)}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
                            Refs: {entry.refs.length ? entry.refs.join(", ") : "-"}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button
                              onClick={() => {
                                setMessageAsDetectionPreview(entry.message);
                              }}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 7,
                                border: "1px solid #46526a",
                                background: "#1f2937",
                                color: "white",
                                cursor: "pointer",
                                fontSize: 11
                              }}
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => {
                                setMessageAsDetectionPreview(entry.message);
                                void applyPurchaseOrderQuantitiesToQuote(entry.message);
                              }}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 7,
                                border: "1px solid #5b3a0d",
                                background: "#b45309",
                                color: "white",
                                cursor: "pointer",
                                fontSize: 11
                              }}
                            >
                              Apply Qty
                            </button>
                          </div>
                        </div>
                      ))}
                      {purchaseOrderDetectionEntries.length === 0 ? <div style={{ fontSize: 12, opacity: 0.65 }}>No purchase-order emails detected.</div> : null}
                    </div>
                  </div>

                  <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 10, border: "1px solid #2f3440", maxHeight: 420, overflow: "auto" }}>
                    <div style={{ fontWeight: 700, color: "#84cc16", marginBottom: 8 }}>Done ({doneDetectionEntries.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {doneDetectionEntries.map((entry) => (
                        <div key={`done-${entry.message.uid}-${entry.message.date}`} style={{ background: "#111827", borderRadius: 8, border: "1px solid #2f3b52", padding: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.message.subject || "(no subject)"}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>{entry.message.from}</div>
                          <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 4 }}>
                            Sent: {formatSentTimestamp(entry.message.date)}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
                            Type: {entry.kinds.map((kind) => (kind === "purchase_order" ? "PO" : "Quote")).join(", ")}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                            Processed: {formatProcessedTimestamp(entry.processedAt)}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 6 }}>
                            Actions: {entry.actions.length ? entry.actions.join(", ") : "-"}
                          </div>
                          <button
                            onClick={() => {
                              setMessageAsDetectionPreview(entry.message);
                            }}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 7,
                              border: "1px solid #46526a",
                              background: "#1f2937",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 11
                            }}
                          >
                            Preview
                          </button>
                        </div>
                      ))}
                      {doneDetectionEntries.length === 0 ? <div style={{ fontSize: 12, opacity: 0.65 }}>No processed emails yet.</div> : null}
                    </div>
                  </div>

                  <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 10, border: "1px solid #2f3440", minHeight: 220 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Detection Preview</div>
                    {selectedDetectionMessage ? (
                      <>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{selectedDetectionMessage.subject || "(no subject)"}</div>
                        <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 6 }}>{selectedDetectionMessage.from}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
                          {new Date(selectedDetectionMessage.date).toLocaleString("en-ZA")}
                        </div>
                        <div style={{ maxHeight: 90, overflow: "auto", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: 8, fontSize: 11, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                          {cleanEmailDisplayText(selectedDetectionMessage.snippet || "").slice(0, 500) || "(no preview text)"}
                        </div>
                        <div style={{ marginBottom: 8, fontSize: 11, opacity: 0.85 }}>
                          Files: {(selectedDetectionMessage.attachments ?? []).map((attachment) => attachment.name).join(", ") || "-"}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          <button
                            onClick={() => {
                              addDetectedQuoteToCalculator(emailDetection, selectedDetectionMessage);
                            }}
                            disabled={!emailDetection?.quote}
                            style={{
                              padding: "7px 9px",
                              borderRadius: 7,
                              border: "1px solid #444",
                              background: emailDetection?.quote ? "#1d4ed8" : "#374151",
                              color: "white",
                              cursor: emailDetection?.quote ? "pointer" : "not-allowed",
                              fontSize: 11
                            }}
                          >
                            Add To Quote
                          </button>
                          <button
                            onClick={() => {
                              void addSelectedEmailDxfToQuoteReader(selectedDetectionMessage);
                            }}
                            style={{ padding: "7px 9px", borderRadius: 7, border: "1px solid #444", background: "#0f766e", color: "white", cursor: "pointer", fontSize: 11 }}
                          >
                            Add DXF
                          </button>
                          <button
                            onClick={() => {
                              void addSelectedEmailPdfToQuoteReader(selectedDetectionMessage);
                            }}
                            style={{ padding: "7px 9px", borderRadius: 7, border: "1px solid #444", background: "#7c3aed", color: "white", cursor: "pointer", fontSize: 11 }}
                          >
                            Add PDF
                          </button>
                          <button
                            onClick={() => {
                              void addSelectedEmailDxfToJobReader(selectedDetectionMessage);
                            }}
                            style={{ padding: "7px 9px", borderRadius: 7, border: "1px solid #444", background: "#b45309", color: "white", cursor: "pointer", fontSize: 11 }}
                          >
                            Add DXF Job
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.65 }}>Select a detected email card to preview.</div>
                    )}
                  </div>
                </div>
                {emailStatus ? <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>{emailStatus}</div> : null}
                <div style={{ marginTop: 12, background: "#1b1c1f", borderRadius: 10, padding: 12, fontSize: 12, border: "1px solid #2f3440" }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Auto Detector Output</div>
                  {emailDetectionUpdatedAt ? (
                    <div style={{ marginBottom: 8, opacity: 0.78 }}>
                      Last analyzed: {new Date(emailDetectionUpdatedAt).toLocaleString("en-ZA")}
                    </div>
                  ) : (
                    <div style={{ marginBottom: 8, opacity: 0.65 }}>No analysis run yet.</div>
                  )}
                  <div style={{ marginBottom: 6 }}>
                    Customer: {emailDetection?.customer ? `${emailDetection.customer.name} (${emailDetection.customer.email ?? "-"})` : "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    Detected quote: {emailDetection?.quote ? `${emailDetection.quote.quoteNumber} · ${emailDetection.quote.title}` : "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    Quote refs: {emailDetection?.quoteCandidates?.length ? emailDetection.quoteCandidates.join(", ") : "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    PO refs: {emailDetection?.purchaseOrderCandidates?.length ? emailDetection.purchaseOrderCandidates.join(", ") : "-"}
                  </div>
                </div>
              </div>

              {emailComposerOpen ? (
                <div
                  style={{
                    background: "linear-gradient(180deg, #1d2430 0%, #171c24 100%)",
                    borderRadius: 16,
                    border: "1px solid #334155",
                    padding: 16,
                    gridColumn: "1 / -1"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 20 }}>Compose Email</div>
                      <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
                        Write your message, polish it, preview it, then send.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => setEmailComposerPreviewOpen((current) => !current)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #475569",
                          background: emailComposerPreviewOpen ? "#1d4ed8" : "#334155",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700
                        }}
                      >
                        {emailComposerPreviewOpen ? "Hide Preview" : "Preview"}
                      </button>
                      <button
                        onClick={() => {
                          void polishCurrentEmailDraft();
                        }}
                        disabled={emailComposerPolishing}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #854d0e",
                          background: emailComposerPolishing ? "#713f12" : "#d97706",
                          color: "white",
                          cursor: emailComposerPolishing ? "not-allowed" : "pointer",
                          fontSize: 12,
                          fontWeight: 700
                        }}
                      >
                        {emailComposerPolishing ? "Polishing..." : "Polish Draft"}
                      </button>
                      <button
                        onClick={() => setEmailComposerOpen(false)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #475569",
                          background: "#1f2937",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: emailComposerPreviewOpen ? "minmax(320px, 1fr) minmax(320px, 1fr)" : "1fr", gap: 14 }}>
                    <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 12, padding: 14 }}>
                      <input
                        value={emailSendTo}
                        onChange={(e) => setEmailSendTo(e.target.value)}
                        placeholder="To"
                        style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#020617", color: "white", marginBottom: 10 }}
                      />
                      <input
                        value={emailSendSubject}
                        onChange={(e) => setEmailSendSubject(e.target.value)}
                        placeholder="Subject"
                        style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#020617", color: "white", marginBottom: 10 }}
                      />
                      <textarea
                        value={emailSendBody}
                        onChange={(e) => setEmailSendBody(e.target.value)}
                        placeholder="Write your email here"
                        style={{ width: "100%", minHeight: 220, padding: 12, borderRadius: 10, border: "1px solid #334155", background: "#020617", color: "white", marginBottom: 12, lineHeight: 1.6 }}
                      />
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          onClick={() => {
                            void polishCurrentEmailDraft();
                          }}
                          disabled={emailComposerPolishing}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "1px solid #854d0e",
                            background: emailComposerPolishing ? "#713f12" : "#d97706",
                            color: "white",
                            cursor: emailComposerPolishing ? "not-allowed" : "pointer",
                            fontWeight: 700
                          }}
                        >
                          {emailComposerPolishing ? "Polishing..." : "Fix Spelling + Professional"}
                        </button>
                        <button
                          onClick={() => {
                            setEmailComposerPreviewOpen(true);
                          }}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "1px solid #3f4f71",
                            background: "#1d4ed8",
                            color: "white",
                            cursor: "pointer",
                            fontWeight: 700
                          }}
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => {
                            void sendEmailMessage();
                          }}
                          disabled={emailSending}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "1px solid #166534",
                            background: emailSending ? "#166534" : "#16a34a",
                            color: "white",
                            cursor: emailSending ? "not-allowed" : "pointer",
                            fontWeight: 700
                          }}
                        >
                          {emailSending ? "Sending..." : "Send Email"}
                        </button>
                      </div>
                    </div>
                    {emailComposerPreviewOpen ? (
                      <div style={{ background: "#e2e8f0", border: "1px solid #cbd5e1", borderRadius: 12, overflow: "hidden", minHeight: 320 }}>
                        <div style={{ padding: "10px 14px", borderBottom: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontSize: 12, fontWeight: 700 }}>
                          Preview
                        </div>
                        <iframe
                          title="Email preview"
                          srcDoc={emailSendPreviewHtml}
                          style={{ width: "100%", minHeight: 520, border: "none", background: "white" }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  background: "linear-gradient(180deg, #223956 0%, #17304f 36%, #142235 100%)",
                  borderRadius: 24,
                  border: "1px solid rgba(120, 155, 205, 0.32)",
                  padding: 0,
                  overflow: "hidden",
                  boxShadow: "0 18px 48px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06)",
                  gridColumn: "1 / -1"
                }}
              >
                <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(140,170,210,0.18)", background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 120px", alignItems: "center", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <div style={{ width: "100%", maxWidth: 420, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 16, background: "rgba(12, 23, 37, 0.62)", border: "1px solid rgba(132, 166, 215, 0.14)", color: "rgba(232,240,252,0.92)" }}>
                        <span style={{ fontSize: 18, opacity: 0.82 }}>⌕</span>
                        <span style={{ fontSize: 15, opacity: 0.86 }}>Search</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, color: "rgba(230,236,245,0.8)", fontSize: 18 }}>
                      <span>⟲</span>
                      <span>⋯</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        setEmailComposerOpen(true);
                        setEmailComposerPreviewOpen(false);
                      }}
                      style={{
                        padding: "10px 18px",
                        borderRadius: 12,
                        border: "1px solid rgba(91, 161, 255, 0.58)",
                        background: "linear-gradient(180deg, #4f9cff 0%, #2f79ec 100%)",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 13
                      }}
                    >
                      New Email
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "280px 380px minmax(0, 1fr)", gap: 0, minHeight: 760 }}>
                  <div style={{ background: "linear-gradient(180deg, rgba(20,31,51,0.96) 0%, rgba(19,29,46,0.98) 100%)", borderRight: "1px solid rgba(117, 146, 190, 0.14)", padding: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "rgba(241,245,250,0.96)" }}>All Accounts</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "rgba(241,245,250,0.96)" }}>
                          {emailSettings.imapUser || graphEmailAccountEmail || emailSettings.fromEmail || "Connect Email"}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {emailFolderEntries.map((entry) => (
                            <div
                              key={entry.id}
                              onClick={() => setSelectedOutlookFolder(entry.id)}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr auto",
                                gap: 8,
                                alignItems: "center",
                                padding: "9px 12px",
                                borderRadius: 12,
                                background: selectedOutlookFolder === entry.id ? "rgba(50, 106, 192, 0.34)" : "transparent",
                                color: selectedOutlookFolder === entry.id ? "#f8fbff" : "rgba(224,231,240,0.78)",
                                border: selectedOutlookFolder === entry.id ? "1px solid rgba(93, 146, 228, 0.28)" : "1px solid transparent",
                                fontSize: 13,
                                cursor: "pointer"
                              }}
                            >
                              <span>{entry.displayName}</span>
                              <span style={{ opacity: 0.86 }}>
                                {typeof entry.unreadItemCount === "number"
                                  ? entry.unreadItemCount
                                  : typeof entry.totalItemCount === "number"
                                    ? entry.totalItemCount
                                    : entry.id === "inbox"
                                      ? inboxMessages.length
                                      : entry.id === "quote_requests"
                                        ? quoteDetectionEntries.length
                                        : entry.id === "purchase_orders"
                                          ? purchaseOrderDetectionEntries.length
                                          : entry.id === "attachments"
                                            ? filteredInboxMessages.filter((message) => (message.attachments ?? []).length > 0).length
                                            : filteredInboxMessages.length}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ borderTop: "1px solid rgba(132, 158, 197, 0.12)", paddingTop: 12 }}>
                        <div style={{ fontSize: 12, opacity: 0.74, marginBottom: 8 }}>Quick Actions</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button
                            onClick={() => {
                              void addSelectedEmailDxfToQuoteReader();
                            }}
                            disabled={!selectedInboxMessageAttachments.some((attachment) => isDxfAttachment(attachment))}
                            style={{
                              padding: "9px 12px",
                              borderRadius: 10,
                              border: "1px solid rgba(27, 133, 118, 0.45)",
                              background: selectedInboxMessageAttachments.some((attachment) => isDxfAttachment(attachment)) ? "rgba(15,118,110,0.26)" : "rgba(255,255,255,0.04)",
                              color: "white",
                              cursor: selectedInboxMessageAttachments.some((attachment) => isDxfAttachment(attachment)) ? "pointer" : "not-allowed",
                              fontSize: 12,
                              textAlign: "left"
                            }}
                          >
                            Import DXF To Quote Reader
                          </button>
                          <button
                            onClick={() => {
                              void addSelectedEmailPdfToQuoteReader();
                            }}
                            disabled={!selectedInboxMessageAttachments.some((attachment) => isPdfAttachment(attachment))}
                            style={{
                              padding: "9px 12px",
                              borderRadius: 10,
                              border: "1px solid rgba(53, 106, 201, 0.45)",
                              background: selectedInboxMessageAttachments.some((attachment) => isPdfAttachment(attachment)) ? "rgba(29,78,216,0.26)" : "rgba(255,255,255,0.04)",
                              color: "white",
                              cursor: selectedInboxMessageAttachments.some((attachment) => isPdfAttachment(attachment)) ? "pointer" : "not-allowed",
                              fontSize: 12,
                              textAlign: "left"
                            }}
                          >
                            Import PDF To Quote Reader
                          </button>
                          <button
                            onClick={() => {
                              void applyProofOfPaymentFromSelectedEmail();
                            }}
                            disabled={proofOfPaymentBusy}
                            style={{
                              padding: "9px 12px",
                              borderRadius: 10,
                              border: "1px solid rgba(33, 163, 83, 0.45)",
                              background: proofOfPaymentBusy ? "rgba(255,255,255,0.04)" : "rgba(22,163,74,0.22)",
                              color: "white",
                              cursor: proofOfPaymentBusy ? "not-allowed" : "pointer",
                              fontSize: 12,
                              textAlign: "left"
                            }}
                          >
                            {proofOfPaymentBusy ? "Applying POP..." : "Apply Proof Of Payment"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: "rgba(24, 28, 34, 0.96)", borderRight: "1px solid rgba(117, 146, 190, 0.14)", display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ padding: 14, borderBottom: "1px solid rgba(117, 146, 190, 0.14)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                        <div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 999, background: "rgba(56,102,170,0.2)", border: "1px solid rgba(90, 136, 208, 0.22)" }}>
                          <button
                            onClick={() => setSelectedOutlookFilter("all")}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 999,
                              border: "none",
                              background: selectedOutlookFilter === "all" ? "#4f9cff" : "transparent",
                              color: "white",
                              cursor: "pointer",
                              fontWeight: 700,
                              fontSize: 12
                            }}
                          >
                            All
                          </button>
                          <button
                            onClick={() => setSelectedOutlookFilter("unread")}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 999,
                              border: "none",
                              background: selectedOutlookFilter === "unread" ? "#4f9cff" : "transparent",
                              color: "white",
                              cursor: "pointer",
                              fontWeight: 700,
                              fontSize: 12
                            }}
                          >
                            Unread
                          </button>
                          <button
                            onClick={() => setSelectedOutlookFilter("needs_review")}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 999,
                              border: "none",
                              background: selectedOutlookFilter === "needs_review" ? "#4f9cff" : "transparent",
                              color: "white",
                              cursor: "pointer",
                              fontWeight: 700,
                              fontSize: 12
                            }}
                          >
                            Needs Review
                          </button>
                          <div
                            style={{
                              alignSelf: "center",
                              minWidth: 26,
                              textAlign: "center",
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: "#2f79ec",
                              color: "white",
                              fontSize: 11,
                              fontWeight: 700
                            }}
                          >
                            {activeInboxMessages.length}
                          </div>
                        </div>
                        <span style={{ fontSize: 18, opacity: 0.68 }}>☰</span>
                      </div>
                      <input
                        value={inboxSearch}
                        onChange={(e) => setInboxSearch(e.target.value)}
                        placeholder="Search emails or attachments"
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(96, 123, 160, 0.24)", background: "rgba(8,14,22,0.84)", color: "white" }}
                      />
                    </div>

                    <div style={{ maxHeight: 620, overflow: "auto" }}>
                      <div style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "rgba(207,220,240,0.82)", borderBottom: "1px solid rgba(117, 146, 190, 0.12)" }}>
                        {selectedOutlookFolder === "quote_requests"
                          ? "Quote Requests"
                          : selectedOutlookFolder === "purchase_orders"
                            ? "Purchase Orders"
                            : selectedOutlookFolder === "attachments"
                              ? "Emails With Attachments"
                              : "Outlook Messages"}
                      </div>
                      {activeInboxMessages.map((message) => {
                        const isSelected = selectedInboxMessage?.uid === message.uid;
                        const senderName = getInboxSenderName(message.from);
                        const avatarColor = message.uid % 3 === 0 ? "#b58900" : message.uid % 3 === 1 ? "#2563eb" : "#7c3aed";
                        const processedInfo = processedEmailMap[message.uid];
                        const searchMatchInfo = emailSearchMatchesByUid.get(message.uid);
                        const attachmentMatches = searchMatchInfo?.attachmentMatches ?? [];
                        return (
                          <button
                            key={`${message.uid}-${message.date}`}
                            onClick={() => {
                              setSelectedInboxUid(message.uid);
                              setSelectedDetectionUid(message.uid);
                              markInboxEmailRead(message.uid);
                              setEmailFromInput(message.from);
                              setEmailSubjectInput(message.subject);
                              setEmailBodyInput(cleanEmailDisplayText(message.body || message.snippet || ""));
                            }}
                            style={{
                              width: "100%",
                              border: "none",
                              borderBottom: "1px solid rgba(117, 146, 190, 0.08)",
                              background: isSelected ? "rgba(66, 116, 194, 0.24)" : "transparent",
                              color: "white",
                              cursor: "pointer",
                              textAlign: "left",
                              padding: "12px 14px",
                              display: "grid",
                              gridTemplateColumns: "44px minmax(0,1fr) auto",
                              gap: 10,
                              alignItems: "center"
                            }}
                          >
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: "50%",
                                background: avatarColor,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: 15,
                                boxShadow: "0 10px 20px rgba(0,0,0,0.18)"
                              }}
                            >
                              {getInboxInitials(message.from)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {senderName}
                                </div>
                                {message.detectedType === "quote_request" ? (
                                  <span style={{ fontSize: 10, borderRadius: 999, padding: "2px 6px", background: "rgba(29,78,216,0.65)", border: "1px solid rgba(96,165,250,0.45)", color: "#dbeafe", whiteSpace: "nowrap" }}>
                                    Quote Request
                                  </span>
                                ) : null}
                                {message.detectedType === "purchase_order" ? (
                                  <span style={{ fontSize: 10, borderRadius: 999, padding: "2px 6px", background: "rgba(180,83,9,0.7)", border: "1px solid rgba(251,191,36,0.45)", color: "#fef3c7", whiteSpace: "nowrap" }}>
                                    Purchase Order
                                  </span>
                                ) : null}
                                {message.detectedType === "needs_review" ? (
                                  <span style={{ fontSize: 10, borderRadius: 999, padding: "2px 6px", background: "rgba(127,29,29,0.72)", border: "1px solid rgba(248,113,113,0.45)", color: "#fecaca", whiteSpace: "nowrap" }}>
                                    Needs Review
                                  </span>
                                ) : null}
                                {processedInfo ? (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      borderRadius: 999,
                                      padding: "2px 6px",
                                      background: "rgba(20,83,45,0.72)",
                                      border: "1px solid rgba(22,163,74,0.4)",
                                      color: "#bbf7d0",
                                      whiteSpace: "nowrap"
                                    }}
                                  >
                                    Processed
                                  </span>
                                ) : null}
                              </div>
                                <div style={{ fontSize: 13, opacity: 0.94, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {message.subject || "(no subject)"}
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.66, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {processedInfo
                                    ? `Processed: ${formatProcessedTimestamp(processedInfo.processedAt)}`
                                    : (cleanEmailDisplayText(message.snippet || "") || "(no preview text)")}
                                </div>
                              {inboxSearch.trim() && attachmentMatches.length > 0 ? (
                                <div style={{ fontSize: 11, color: "#93c5fd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  Attachment match: {attachmentMatches.join(", ")}
                                </div>
                              ) : null}
                              {message.detectionConfidence ? (
                                <div style={{ fontSize: 11, color: "rgba(191,219,254,0.86)" }}>
                                  Confidence: {message.detectionConfidence}%
                                </div>
                              ) : null}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", paddingLeft: 6 }}>
                              {(message.attachments ?? []).length > 0 ? <span title="Has attachments" style={{ opacity: 0.8 }}>📎</span> : null}
                              {!readEmailMap[message.uid] ? (
                                <span
                                  style={{
                                    width: 9,
                                    height: 9,
                                    borderRadius: "50%",
                                    background: "#4f9cff",
                                    boxShadow: "0 0 0 4px rgba(79,156,255,0.18)"
                                  }}
                                  title="New email"
                                />
                              ) : null}
                              <span style={{ fontSize: 12, opacity: 0.78 }}>{getInboxTimeLabel(message.date)}</span>
                            </div>
                          </button>
                        );
                      })}
                      {activeInboxMessages.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.65, padding: 12 }}>
                          {filteredInboxMessages.length === 0 ? "No messages match your search." : "No messages in this tab."}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ background: "linear-gradient(180deg, rgba(31,32,34,0.98) 0%, rgba(27,28,30,0.98) 100%)", minHeight: 620, padding: 18, display: "flex", flexDirection: "column" }}>
                    {selectedInboxMessage ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
                          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
                            {selectedInboxMessage.subject || "(no subject)"}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, opacity: 0.72 }}>
                            <span title="Reply">↩</span>
                            <span title="Reply All">↶</span>
                            <span title="Forward">⇉</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                            <div
                              style={{
                                width: 46,
                                height: 46,
                                borderRadius: "50%",
                                background: "#7d7373",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: 18,
                                flex: "0 0 auto"
                              }}
                            >
                              {getInboxInitials(selectedInboxMessage.from)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {selectedInboxMessage.from}
                              </div>
                              <div style={{ fontSize: 13, opacity: 0.76 }}>To: {emailSettings.fromEmail || "you@company.com"}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.72, whiteSpace: "nowrap" }}>
                            {new Date(selectedInboxMessage.date).toLocaleString("en-ZA")}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                          {selectedInboxMessage.detectedType === "quote_request" ? (
                            <span style={{ fontSize: 12, borderRadius: 999, padding: "4px 10px", background: "rgba(29,78,216,0.65)", border: "1px solid rgba(96,165,250,0.45)", color: "#dbeafe" }}>
                              Quote Request
                            </span>
                          ) : null}
                          {selectedInboxMessage.detectedType === "purchase_order" ? (
                            <span style={{ fontSize: 12, borderRadius: 999, padding: "4px 10px", background: "rgba(180,83,9,0.7)", border: "1px solid rgba(251,191,36,0.45)", color: "#fef3c7" }}>
                              Purchase Order
                            </span>
                          ) : null}
                          {selectedInboxMessage.detectedType === "needs_review" ? (
                            <span style={{ fontSize: 12, borderRadius: 999, padding: "4px 10px", background: "rgba(127,29,29,0.72)", border: "1px solid rgba(248,113,113,0.45)", color: "#fecaca" }}>
                              Needs Review
                            </span>
                          ) : null}
                          {(selectedInboxMessage.attachments ?? []).some((attachment) => isDxfAttachment(attachment)) ? (
                            <span style={{ fontSize: 12, borderRadius: 999, padding: "4px 10px", background: "rgba(15,118,110,0.24)", border: "1px solid rgba(45,212,191,0.3)", color: "#99f6e4" }}>
                              DXF Attached
                            </span>
                          ) : null}
                          {selectedInboxMessage.detectionConfidence ? (
                            <span style={{ fontSize: 12, borderRadius: 999, padding: "4px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(148,163,184,0.25)", color: "#e2e8f0" }}>
                              Confidence {selectedInboxMessage.detectionConfidence}%
                            </span>
                          ) : null}
                        </div>
                        {processedEmailMap[selectedInboxMessage.uid] ? (
                          <div
                            style={{
                              borderRadius: 10,
                              border: "1px solid #166534",
                              background: "#052e16",
                              color: "#bbf7d0",
                              padding: "10px 12px",
                              marginBottom: 12,
                              fontSize: 12
                            }}
                          >
                            Processed at {formatProcessedTimestamp(processedEmailMap[selectedInboxMessage.uid].processedAt)}
                            {processedEmailMap[selectedInboxMessage.uid].actions.length
                              ? ` · ${processedEmailMap[selectedInboxMessage.uid].actions.join(", ")}`
                              : ""}
                          </div>
                        ) : null}
                        {selectedInboxMessageAttachments.length ? (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                            {selectedInboxMessageAttachments.map((attachment, index) => {
                              const preview = inboxAttachmentPreviews[getAttachmentPreviewKey(selectedInboxMessage.uid, attachment.part)];
                              return (
                                <div
                                  key={`${attachment.part}-${attachment.name}-${index}`}
                                  onClick={() => {
                                    void openInboxAttachment(selectedInboxMessage.uid, attachment).catch((error) => {
                                      setEmailStatus(error instanceof Error ? error.message : "Failed to open attachment.");
                                    });
                                  }}
                                  style={{
                                    border: "1px solid #535762",
                                    borderRadius: 10,
                                    background: "#232428",
                                    padding: "10px 12px",
                                    cursor: "pointer"
                                  }}
                                >
                                  <div style={{ display: "grid", gridTemplateColumns: "28px minmax(120px, 1fr) auto", gap: 10, alignItems: "center" }}>
                                    <div
                                      style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 6,
                                        border: "1px solid #6b7280",
                                        background: "#e5e7eb",
                                        color: "#111827",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 13
                                      }}
                                    >
                                      📄
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {attachment.name}
                                      </div>
                                      <div style={{ fontSize: 11, opacity: 0.72 }}>
                                        {[attachment.contentType, formatAttachmentSize(attachment.sizeBytes)].filter(Boolean).join(" · ")}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 15, opacity: 0.7 }}>⌄</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {selectedInboxDetailLoading ? (
                          <div style={{ borderRadius: 10, border: "1px solid #334155", background: "#0f172a", color: "#cbd5e1", padding: "10px 12px", marginBottom: 16, fontSize: 13 }}>
                            Loading full email...
                          </div>
                        ) : null}
                        {selectedInboxDetailError ? (
                          <div style={{ borderRadius: 10, border: "1px solid #7f1d1d", background: "#450a0a", color: "#fecaca", padding: "10px 12px", marginBottom: 16, fontSize: 13 }}>
                            {selectedInboxDetailError}
                          </div>
                        ) : null}
                        {(() => {
                          const threadSegments = splitEmailIntoThreadSegments(selectedInboxDisplayBody);
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "#1d1d1d", borderRadius: 16, border: "1px solid #323438", padding: 16, minHeight: 360 }}>
                              {threadSegments.map((segment, index) => (
                                <div
                                  key={`${segment.title}-${index}`}
                                  style={{
                                    background: index === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                                    border: index === 0 ? "none" : "1px solid rgba(117, 146, 190, 0.12)",
                                    borderRadius: 12,
                                    padding: index === 0 ? 0 : 12
                                  }}
                                >
                                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.54, marginBottom: 8 }}>
                                    {segment.title}
                                  </div>
                                  <div style={{ fontSize: 15, whiteSpace: "pre-wrap", lineHeight: 1.72, opacity: 0.95 }}>
                                    {segment.body}
                                  </div>
                                </div>
                              ))}
                              {threadSegments.length === 0 ? (
                                <div
                                  style={{
                                    fontSize: 15,
                                    whiteSpace: "pre-wrap",
                                    lineHeight: 1.65,
                                    opacity: 0.9,
                                    padding: 4
                                  }}
                                >
                                  (no body preview)
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={() => {
                              void createQuoteFromSelectedEmail().catch((error) => {
                                setEmailStatus(error instanceof Error ? error.message : "Failed to create quote.");
                              });
                            }}
                            disabled={selectedInboxMessage.detectedType === "purchase_order"}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid #1d4ed8",
                              background: selectedInboxMessage.detectedType !== "purchase_order" ? "#1d4ed8" : "#374151",
                              color: "white",
                              cursor: selectedInboxMessage.detectedType !== "purchase_order" ? "pointer" : "not-allowed",
                              fontSize: 12,
                              fontWeight: 700
                            }}
                          >
                            Create Quote
                          </button>
                          <button
                            onClick={() => {
                              void extractCustomerFromEmail(selectedInboxMessage).catch((error) => {
                                setEmailStatus(error instanceof Error ? error.message : "Failed to extract customer.");
                              });
                            }}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid #166534",
                              background: "#166534",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 700
                            }}
                          >
                            Extract Customer
                          </button>
                          <button
                            onClick={() => {
                              void createJobFromSelectedPurchaseOrder().catch((error) => {
                                setEmailStatus(error instanceof Error ? error.message : "Failed to create job.");
                              });
                            }}
                            disabled={selectedInboxMessage.detectedType !== "purchase_order"}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid #b45309",
                              background: selectedInboxMessage.detectedType === "purchase_order" ? "#b45309" : "#374151",
                              color: "white",
                              cursor: selectedInboxMessage.detectedType === "purchase_order" ? "pointer" : "not-allowed",
                              fontSize: 12,
                              fontWeight: 700
                            }}
                          >
                            Prepare Job From PO
                          </button>
                          <button
                            onClick={() => {
                              void addSelectedEmailDxfToQuoteReader();
                            }}
                            disabled={!selectedInboxMessageAttachments.some((attachment) => isDxfAttachment(attachment))}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid #0f766e",
                              background: selectedInboxMessageAttachments.some((attachment) => isDxfAttachment(attachment)) ? "#0f766e" : "#374151",
                              color: "white",
                              cursor: selectedInboxMessageAttachments.some((attachment) => isDxfAttachment(attachment)) ? "pointer" : "not-allowed",
                              fontSize: 12,
                              fontWeight: 700
                            }}
                          >
                            Import DXF To Quote Reader
                          </button>
                          <button
                            onClick={() => {
                              void addSelectedEmailPdfToQuoteReader();
                            }}
                            disabled={!selectedInboxMessageAttachments.some((attachment) => isPdfAttachment(attachment))}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid #1d4ed8",
                              background: selectedInboxMessageAttachments.some((attachment) => isPdfAttachment(attachment)) ? "#1d4ed8" : "#374151",
                              color: "white",
                              cursor: selectedInboxMessageAttachments.some((attachment) => isPdfAttachment(attachment)) ? "pointer" : "not-allowed",
                              fontSize: 12,
                              fontWeight: 700
                            }}
                          >
                            Import PDF To Quote Reader
                          </button>
                          <button
                            onClick={() => {
                              setEmailFromInput(selectedInboxMessage.from);
                              setEmailSubjectInput(selectedInboxMessage.subject);
                              setEmailBodyInput(cleanEmailDisplayText(selectedInboxDisplayBody));
                            }}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid #475569",
                              background: "#334155",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Use In Detection
                          </button>
                          <button
                            onClick={() => {
                              setEmailSendTo(selectedInboxMessage.from);
                              setEmailSendSubject(`RE: ${selectedInboxMessage.subject || ""}`.trim());
                              setEmailComposerOpen(true);
                              setEmailComposerPreviewOpen(false);
                            }}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid #3f4f71",
                              background: "#1d4ed8",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Reply In Composer
                          </button>
                          <button
                            onClick={() => {
                              void applyProofOfPaymentFromSelectedEmail();
                            }}
                            disabled={proofOfPaymentBusy}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid #166534",
                              background: "#16a34a",
                              color: "white",
                              cursor: proofOfPaymentBusy ? "not-allowed" : "pointer",
                              fontSize: 12,
                              fontWeight: 700
                            }}
                          >
                            {proofOfPaymentBusy ? "Applying POP..." : "Apply Proof Of Payment"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 13, opacity: 0.65 }}>Select an email to preview it.</div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : viewMode === "ai_assistant" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ maxWidth: 1360, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              <div style={{ background: "#232428", borderRadius: 18, padding: 18, border: "1px solid rgba(99, 102, 241, 0.18)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 28 }}>Smart Job Queue</div>
                    <div style={{ fontSize: 13, opacity: 0.72, marginTop: 4 }}>
                      Auto-plan laser jobs by material, thickness, due pressure, DXF readiness, and setup savings.
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      void autoPlanSmartQueue();
                    }}
                    disabled={smartQueuePlanning}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1px solid rgba(76, 134, 129, 0.55)",
                      background: smartQueuePlanning ? "rgba(55, 65, 81, 0.82)" : "rgba(34, 197, 94, 0.18)",
                      color: "white",
                      cursor: smartQueuePlanning ? "not-allowed" : "pointer",
                      fontWeight: 700
                    }}
                  >
                    {smartQueuePlanning ? "Planning..." : "Auto Plan Queue"}
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1.6fr) auto", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <input
                    value={smartQueueSearch}
                    onChange={(e) => setSmartQueueSearch(e.target.value)}
                    placeholder="Search by job number, customer, material, sheet size"
                    style={{
                      width: "100%",
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid rgba(99, 102, 241, 0.24)",
                      background: "#111827",
                      color: "white"
                    }}
                  />
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {filteredSmartQueueJobs.length} of {smartQueueJobs.length} jobs
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { id: "queue", label: "Smart Queue" },
                    { id: "stock", label: "Stock & Material" }
                  ].map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setSmartQueueSection(section.id as typeof smartQueueSection)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border:
                          smartQueueSection === section.id
                            ? "1px solid rgba(112, 255, 163, 0.9)"
                            : "1px solid rgba(99, 102, 241, 0.24)",
                        background:
                          smartQueueSection === section.id ? "rgba(38, 64, 52, 0.78)" : "rgba(255,255,255,0.03)",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700
                      }}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
                {smartQueueSection === "queue" ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {[
                    { id: "all", label: "All" },
                    { id: "pending", label: "Pending" },
                    { id: "ready", label: "Ready" },
                    { id: "urgent", label: "Urgent" },
                    { id: "missing_dxf", label: "Missing DXF" },
                    { id: "completed", label: "Completed" }
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setSmartQueueFilter(filter.id as typeof smartQueueFilter)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border:
                          smartQueueFilter === filter.id
                            ? "1px solid rgba(112, 255, 163, 0.9)"
                            : "1px solid rgba(99, 102, 241, 0.24)",
                        background:
                          smartQueueFilter === filter.id ? "rgba(38, 64, 52, 0.78)" : "rgba(255,255,255,0.03)",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                ) : null}
              </div>

              {smartQueueSection === "queue" ? (
              <>
              {smartQueueError ? (
                <div style={{ padding: 12, borderRadius: 12, background: "rgba(127, 29, 29, 0.35)", border: "1px solid rgba(239, 68, 68, 0.35)", color: "#fecaca" }}>
                  {smartQueueError}
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {smartQueueRecommendations.length === 0 ? (
                  <div style={{ padding: 16, borderRadius: 16, background: "rgba(255,255,255,0.028)", border: "1px solid rgba(99, 102, 241, 0.16)", opacity: 0.75 }}>
                    No recommendations yet. Load jobs or run Auto Plan Queue.
                  </div>
                ) : (
                  smartQueueRecommendations.map((recommendation) => (
                    <div
                      key={recommendation.id}
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        background:
                          recommendation.severity === "urgent"
                            ? "rgba(127, 29, 29, 0.32)"
                            : recommendation.severity === "warning"
                              ? "rgba(120, 53, 15, 0.28)"
                              : "rgba(15, 23, 42, 0.7)",
                        border:
                          recommendation.severity === "urgent"
                            ? "1px solid rgba(248, 113, 113, 0.4)"
                            : recommendation.severity === "warning"
                              ? "1px solid rgba(251, 191, 36, 0.32)"
                              : "1px solid rgba(99, 102, 241, 0.16)"
                      }}
                    >
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>{recommendation.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.45 }}>{recommendation.detail}</div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 14, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 18, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                    <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>Recommended Queue Groups</div>
                    {smartQueueLoading ? (
                      <div style={{ fontSize: 13, opacity: 0.7 }}>Loading queue groups...</div>
                    ) : visibleSmartQueueGroups.length === 0 ? (
                      <div style={{ fontSize: 13, opacity: 0.7 }}>No queue groups yet. Run Auto Plan Queue after jobs are synced.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 12 }}>
                        {visibleSmartQueueGroups.map((group) => (
                          <div
                            key={group.id || `${group.material}-${group.thickness ?? "na"}-${group.sheetSize ?? "na"}`}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (!group.id) return;
                              void handleSmartQueueDrop(group.id);
                            }}
                            style={{
                              borderRadius: 16,
                              border: "1px solid rgba(99, 102, 241, 0.2)",
                              background: "rgba(15, 23, 42, 0.72)",
                              padding: 14
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: 18 }}>{group.material}</div>
                                <div style={{ fontSize: 13, opacity: 0.82 }}>
                                  {group.thickness ?? "?"}mm {group.sheetSize ? `· ${group.sheetSize}` : ""}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <div style={{ padding: "5px 9px", borderRadius: 999, background: "rgba(59, 130, 246, 0.18)", fontSize: 11, fontWeight: 700 }}>
                                  Run #{group.recommendedRunOrder}
                                </div>
                                {group.urgencyWarning ? (
                                  <div style={{ padding: "5px 9px", borderRadius: 999, background: "rgba(239, 68, 68, 0.18)", color: "#fecaca", fontSize: 11, fontWeight: 700 }}>
                                    Warning
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: 8, fontSize: 12, opacity: 0.82, marginBottom: 12 }}>
                              <div>Jobs: {group.jobs.length}</div>
                              <div>Total cut: {group.estimatedTotalCutTimeMinutes} min</div>
                              <div>Pierces: {group.totalPierces}</div>
                              <div>Cut length: {group.totalCutLength.toFixed(0)} mm</div>
                              <div>Setup saving: {group.estimatedSetupSavingMinutes} min</div>
                              <div>Status: {group.status}</div>
                            </div>

                            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                              <button
                                onClick={() => {
                                  if (!group.id) return;
                                  void startSmartQueueGroup(group.id);
                                }}
                                disabled={!group.id}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 8,
                                  border: "1px solid rgba(34, 197, 94, 0.36)",
                                  background: !group.id ? "rgba(55, 65, 81, 0.82)" : "rgba(34, 197, 94, 0.16)",
                                  color: "white",
                                  cursor: !group.id ? "not-allowed" : "pointer",
                                  fontWeight: 700,
                                  fontSize: 12
                                }}
                              >
                                Start Group
                              </button>
                              <button
                                onClick={() => {
                                  if (!group.id) return;
                                  void completeSmartQueueGroup(group.id);
                                }}
                                disabled={!group.id}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 8,
                                  border: "1px solid rgba(163, 230, 53, 0.3)",
                                  background: !group.id ? "rgba(55, 65, 81, 0.82)" : "rgba(101, 163, 13, 0.16)",
                                  color: "white",
                                  cursor: !group.id ? "not-allowed" : "pointer",
                                  fontWeight: 700,
                                  fontSize: 12
                                }}
                              >
                                Complete Group
                              </button>
                            </div>
                            {!group.id ? (
                              <div style={{ fontSize: 11, opacity: 0.68, marginBottom: 10 }}>
                                Run Auto Plan Queue to save this recommendation and enable drag/drop controls.
                              </div>
                            ) : null}

                            <div style={{ display: "grid", gap: 8 }}>
                              {group.jobs.map((job) => (
                                <div
                                  key={job.id}
                                  draggable
                                  onDragStart={() => setSmartQueueDraggingJobId(job.id)}
                                  onDragEnd={() => setSmartQueueDraggingJobId(null)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    if (!group.id) return;
                                    void handleSmartQueueDrop(group.id, job.id);
                                  }}
                                  onClick={() => setSmartQueueSelectedJobId(job.id)}
                                  title={job.queueReasons.join(" • ")}
                                  style={{
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border:
                                      smartQueueSelectedJobId === job.id
                                        ? "1px solid rgba(112, 255, 163, 0.88)"
                                        : "1px solid rgba(99, 102, 241, 0.16)",
                                    background:
                                      smartQueueDraggingJobId === job.id
                                        ? "rgba(56, 189, 248, 0.14)"
                                        : "rgba(255,255,255,0.03)",
                                    cursor: "grab"
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                    <div>
                                      <div style={{ fontWeight: 700 }}>{job.jobNumber}</div>
                                      <div style={{ fontSize: 12, opacity: 0.78 }}>{job.title}</div>
                                    </div>
                                    <div style={{ fontSize: 11, color: smartQueueStatusColors[job.status], fontWeight: 800 }}>
                                      {job.status}
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                                    <div style={{ padding: "4px 8px", borderRadius: 999, background: "rgba(255,255,255,0.05)", fontSize: 11 }}>
                                      {job.estimatedCutTimeMinutes} min
                                    </div>
                                    <div style={{ padding: "4px 8px", borderRadius: 999, background: "rgba(255,255,255,0.05)", fontSize: 11 }}>
                                      {job.ready ? "DXF Ready" : "Needs Setup"}
                                    </div>
                                    {job.partDnaId ? (
                                      <div style={{ padding: "4px 8px", borderRadius: 999, background: "rgba(34, 197, 94, 0.14)", fontSize: 11 }}>
                                        Part DNA
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 18, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                    <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>Job List</div>
                    {smartQueueLoading ? (
                      <div style={{ fontSize: 13, opacity: 0.7 }}>Loading jobs...</div>
                    ) : filteredSmartQueueJobs.length === 0 ? (
                      <div style={{ fontSize: 13, opacity: 0.7 }}>No jobs match the current filters.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 10, maxHeight: 620, overflowY: "auto", paddingRight: 4 }}>
                        {filteredSmartQueueJobs.map((job) => (
                          <div
                            key={job.id}
                            onClick={() => setSmartQueueSelectedJobId(job.id)}
                            style={{
                              padding: 14,
                              borderRadius: 16,
                              border:
                                smartQueueSelectedJobId === job.id
                                  ? "1px solid rgba(112, 255, 163, 0.88)"
                                  : "1px solid rgba(99, 102, 241, 0.14)",
                              background: smartQueueSelectedJobId === job.id ? "rgba(17, 24, 39, 0.92)" : "rgba(255,255,255,0.03)",
                              cursor: "pointer"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: 16 }}>{job.jobNumber}</div>
                                <div style={{ fontSize: 13, opacity: 0.84 }}>{job.title}</div>
                                <div style={{ fontSize: 12, opacity: 0.68 }}>{job.customerName ?? "Unassigned customer"}</div>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                                <div style={{ padding: "4px 8px", borderRadius: 999, background: `${smartQueuePriorityColors[job.priority]}22`, color: smartQueuePriorityColors[job.priority], fontSize: 11, fontWeight: 800 }}>
                                  {job.priority}
                                </div>
                                <div style={{ padding: "4px 8px", borderRadius: 999, background: `${smartQueueStatusColors[job.status]}22`, color: smartQueueStatusColors[job.status], fontSize: 11, fontWeight: 800 }}>
                                  {job.status}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(110px, 1fr))", gap: 8, fontSize: 12, opacity: 0.84, marginBottom: 10 }}>
                              <div>Material: {job.material || "Missing"}</div>
                              <div>Thickness: {job.thickness ?? "-"}</div>
                              <div>Due: {job.dueDate ? new Date(job.dueDate).toLocaleDateString("en-ZA") : "No due date"}</div>
                              <div>Cut time: {job.estimatedCutTimeMinutes} min</div>
                              <div>DXF: {job.warnings.includes("Missing DXF") ? "Missing" : "Ready"}</div>
                              <div>Part DNA: {job.partDnaId ? `Match #${job.partDnaId}` : "None"}</div>
                            </div>

                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void runSmartQueueJobAction(job.id, "start");
                                }}
                                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(34, 197, 94, 0.34)", background: "rgba(34, 197, 94, 0.16)", color: "white", cursor: "pointer", fontSize: 12 }}
                              >
                                Start
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void runSmartQueueJobAction(job.id, "pause");
                                }}
                                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(249, 115, 22, 0.34)", background: "rgba(249, 115, 22, 0.16)", color: "white", cursor: "pointer", fontSize: 12 }}
                              >
                                Pause
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const raw = window.prompt(`Actual cut time for ${job.jobNumber} in minutes`, String(job.estimatedCutTimeMinutes || 0));
                                  if (raw === null) return;
                                  const actualMinutes = Number(raw);
                                  if (!Number.isFinite(actualMinutes) || actualMinutes < 0) return;
                                  void (async () => {
                                    await runSmartQueueJobAction(job.id, "complete", actualMinutes);
                                    await markTargetStockUsed(job.legacyJobId ?? job.jobNumber);
                                  })();
                                }}
                                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(163, 230, 53, 0.3)", background: "rgba(101, 163, 13, 0.16)", color: "white", cursor: "pointer", fontSize: 12 }}
                              >
                                Complete
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void updateSmartQueueJob(job.id, { manuallyMarkedReady: !job.manuallyMarkedReady });
                                }}
                                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(59, 130, 246, 0.3)", background: "rgba(59, 130, 246, 0.14)", color: "white", cursor: "pointer", fontSize: 12 }}
                              >
                                {job.manuallyMarkedReady ? "Unmark Ready" : "Mark Ready"}
                              </button>
                            </div>

                            <div style={{ fontSize: 11, opacity: 0.7 }}>
                              Why recommended? {job.queueReasons.join(" • ") || "No scoring reasons yet."}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 18, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                    <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>Selected Job</div>
                    {selectedSmartQueueJob ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>{selectedSmartQueueJob.jobNumber}</div>
                        <div style={{ fontSize: 13, opacity: 0.84 }}>{selectedSmartQueueJob.title}</div>
                        <div style={{ fontSize: 12, opacity: 0.76 }}>Customer: {selectedSmartQueueJob.customerName ?? "Unassigned customer"}</div>
                        <div style={{ fontSize: 12, opacity: 0.76 }}>Material: {selectedSmartQueueJob.material || "Missing"} · Thickness: {selectedSmartQueueJob.thickness ?? "-"}</div>
                        <div style={{ fontSize: 12, opacity: 0.76 }}>Estimated cut time: {selectedSmartQueueJob.estimatedCutTimeMinutes} min · Setup: {selectedSmartQueueJob.estimatedSetupTimeMinutes} min</div>
                        <div style={{ fontSize: 12, opacity: 0.76 }}>Pierces: {selectedSmartQueueJob.estimatedPierceCount} · Cut length: {selectedSmartQueueJob.estimatedCutLength.toFixed(0)} mm</div>
                        <div style={{ fontSize: 12, opacity: 0.76 }}>DXF: {selectedSmartQueueJob.warnings.includes("Missing DXF") ? "Missing" : "Ready"} · Part DNA: {selectedSmartQueueJob.partDnaId ? `#${selectedSmartQueueJob.partDnaId}` : "None"}</div>
                        <div style={{ fontSize: 12, opacity: 0.76 }}>Warnings: {selectedSmartQueueJob.warnings.length ? selectedSmartQueueJob.warnings.join(" • ") : "No blocking warnings"}</div>
                        <div style={{ fontSize: 12, opacity: 0.76 }}>Why recommended: {selectedSmartQueueJob.queueReasons.join(" • ") || "No scoring reasons yet."}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, opacity: 0.7 }}>Select a job to inspect queue detail.</div>
                    )}
                  </div>
                </div>
              </div>
              </>
              ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 18, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) repeat(3, auto)", gap: 10, alignItems: "center", marginBottom: 12 }}>
                      <input
                        value={stockSearch}
                        onChange={(e) => setStockSearch(e.target.value)}
                        placeholder="Search material, size, location"
                        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }}
                      />
                      <select value={stockMaterialFilter} onChange={(e) => setStockMaterialFilter(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }}>
                        <option value="">All materials</option>
                        {smartQueueStockMaterialOptions.map((material) => (
                          <option key={material} value={material}>{material}</option>
                        ))}
                      </select>
                      <select value={stockThicknessFilter} onChange={(e) => setStockThicknessFilter(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }}>
                        <option value="">All thickness</option>
                        {smartQueueStockThicknessOptions.map((thickness) => (
                          <option key={thickness} value={thickness}>{thickness} mm</option>
                        ))}
                      </select>
                      <select value={stockViewFilter} onChange={(e) => setStockViewFilter(e.target.value as typeof stockViewFilter)} style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }}>
                        <option value="all">All</option>
                        <option value="available">Available</option>
                        <option value="reserved">Reserved</option>
                        <option value="low_stock">Low stock</option>
                        <option value="offcuts_only">Offcuts only</option>
                      </select>
                    </div>
                    {stockError ? (
                      <div style={{ padding: 12, borderRadius: 12, background: "rgba(127, 29, 29, 0.35)", border: "1px solid rgba(239, 68, 68, 0.35)", color: "#fecaca", marginBottom: 12 }}>
                        {stockError}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      <button
                        onClick={() => {
                          setStockAddMode("sheet");
                          setStockAddForm((current) => ({ ...current, width: current.width || "3000", height: current.height || "1500", quantity: current.quantity || "1", location: current.location || "Rack" }));
                        }}
                        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(34, 197, 94, 0.34)", background: stockAddMode === "sheet" ? "rgba(34, 197, 94, 0.28)" : "rgba(34, 197, 94, 0.16)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                      >
                        Add Sheet
                      </button>
                      <button
                        onClick={() => {
                          setStockAddMode("offcut");
                          setStockAddForm((current) => ({ ...current, width: "600", height: "400", quantity: "1", location: current.location || "Offcut Bin" }));
                        }}
                        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(59, 130, 246, 0.34)", background: stockAddMode === "offcut" ? "rgba(59, 130, 246, 0.28)" : "rgba(59, 130, 246, 0.16)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                      >
                        Add Offcut
                      </button>
                    </div>
                    {stockAddMode ? (
                      <div style={{ padding: 12, borderRadius: 14, background: "rgba(15, 23, 42, 0.72)", border: "1px solid rgba(99, 102, 241, 0.16)", marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                          <div style={{ fontWeight: 800 }}>{stockAddMode === "sheet" ? "New Full Sheet" : "New Offcut"}</div>
                          <button onClick={() => setStockAddMode(null)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(148, 163, 184, 0.2)", background: "rgba(148, 163, 184, 0.12)", color: "white", cursor: "pointer", fontSize: 12 }}>
                            Cancel
                          </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                          <select value={stockAddForm.material} onChange={(e) => setStockAddForm((current) => ({ ...current, material: e.target.value }))} style={{ minWidth: 0, padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }}>
                            {quoteMaterialOptions.map((material) => (
                              <option key={material} value={material}>{material}</option>
                            ))}
                          </select>
                          <select value={stockAddForm.thickness} onChange={(e) => setStockAddForm((current) => ({ ...current, thickness: e.target.value }))} style={{ minWidth: 0, padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }}>
                            {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                              <option key={value} value={String(value)}>{value} mm</option>
                            ))}
                          </select>
                          <input value={stockAddForm.width} onChange={(e) => setStockAddForm((current) => ({ ...current, width: e.target.value }))} placeholder="Width mm" inputMode="decimal" style={{ minWidth: 0, padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }} />
                          <input value={stockAddForm.height} onChange={(e) => setStockAddForm((current) => ({ ...current, height: e.target.value }))} placeholder="Height mm" inputMode="decimal" style={{ minWidth: 0, padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }} />
                          {stockAddMode === "sheet" ? (
                            <>
                              <input value={stockAddForm.quantity} onChange={(e) => setStockAddForm((current) => ({ ...current, quantity: e.target.value }))} placeholder="Quantity" inputMode="numeric" style={{ minWidth: 0, padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }} />
                              <input value={stockAddForm.supplier} onChange={(e) => setStockAddForm((current) => ({ ...current, supplier: e.target.value }))} placeholder="Supplier" style={{ minWidth: 0, padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }} />
                              <input value={stockAddForm.costPerSheet} onChange={(e) => setStockAddForm((current) => ({ ...current, costPerSheet: e.target.value }))} placeholder="Cost per sheet" inputMode="decimal" style={{ minWidth: 0, padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }} />
                            </>
                          ) : null}
                          <input value={stockAddForm.location} onChange={(e) => setStockAddForm((current) => ({ ...current, location: e.target.value }))} placeholder="Location" style={{ minWidth: 0, padding: 10, borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111827", color: "white" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10, alignItems: "center" }}>
                          <div style={{ fontSize: 12, color: UI.colors.muted }}>
                            Estimated weight: {calculatePlateWeightKg(stockAddForm.material, Number(stockAddForm.thickness), Number(stockAddForm.width), Number(stockAddForm.height), stockAddMode === "sheet" ? Number(stockAddForm.quantity) || 1 : 1).toFixed(1)} kg
                          </div>
                          <button onClick={() => void saveStockItem(stockAddMode)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(34, 197, 94, 0.34)", background: "rgba(34, 197, 94, 0.2)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                            Save {stockAddMode === "sheet" ? "Sheet" : "Offcut"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {stockLoading ? (
                      <div style={{ fontSize: 13, opacity: 0.7 }}>Loading stock...</div>
                    ) : (
                      <div style={{ display: "grid", gap: 14 }}>
                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 8 }}>Full Sheets</div>
                          <div style={{ display: "grid", gap: 8 }}>
                            {filteredStockSheets.map((sheet) => (
                              <div key={sheet.id} style={{ padding: 12, borderRadius: 14, background: "rgba(15, 23, 42, 0.72)", border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                  <div>
                                    <div style={{ fontWeight: 700 }}>{sheet.material} {sheet.thickness}mm</div>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>{sheet.width} x {sheet.height} · Qty {sheet.quantity}</div>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>Weight {calculatePlateWeightKg(sheet.material, sheet.thickness, sheet.width, sheet.height, sheet.quantity).toFixed(1)} kg</div>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>{sheet.location ?? "No location"} · {sheet.supplier ?? "No supplier"}</div>
                                  </div>
                                  <div style={{ textAlign: "right", fontSize: 12 }}>
                                    <div>{sheet.status}</div>
                                    <div>{sheet.costPerSheet ? formatRand(sheet.costPerSheet) : "No cost"}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {filteredStockSheets.length === 0 ? <div style={{ fontSize: 12, opacity: 0.7 }}>No matching full sheets.</div> : null}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 8 }}>Offcuts</div>
                          <div style={{ display: "grid", gap: 8 }}>
                            {filteredStockOffcuts.map((offcut) => (
                              <div key={offcut.id} style={{ padding: 12, borderRadius: 14, background: "rgba(15, 23, 42, 0.72)", border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                  <div>
                                    <div style={{ fontWeight: 700 }}>{offcut.material} {offcut.thickness}mm</div>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>{offcut.width} x {offcut.height} · Area {offcut.usableArea.toFixed(0)} mm²</div>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>Weight {calculatePlateWeightKg(offcut.material, offcut.thickness, offcut.width, offcut.height).toFixed(1)} kg</div>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>{offcut.location ?? "No location"} · {offcut.status}</div>
                                  </div>
                                  <button onClick={() => {
                                    if (!selectedSmartQueueJob) return;
                                    void reserveStockForTarget({
                                      jobId: selectedSmartQueueJob.legacyJobId ?? selectedSmartQueueJob.jobNumber,
                                      material: offcut.material,
                                      thickness: offcut.thickness,
                                      width: offcut.width,
                                      height: offcut.height
                                    });
                                  }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(34, 197, 94, 0.34)", background: "rgba(34, 197, 94, 0.16)", color: "white", cursor: "pointer", fontSize: 12 }}>Use for Quote/Job</button>
                                </div>
                              </div>
                            ))}
                            {filteredStockOffcuts.length === 0 ? <div style={{ fontSize: 12, opacity: 0.7 }}>No matching offcuts.</div> : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 18, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Rack Weights</div>
                    {visibleRackWeights.length === 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>No rack weight to show for the current filters.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {visibleRackWeights.map((rack) => (
                          <div key={rack.location} style={{ padding: 10, borderRadius: 10, background: "rgba(15, 23, 42, 0.72)", border: "1px solid rgba(99, 102, 241, 0.16)", display: "flex", justifyContent: "space-between", gap: 12 }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{rack.location}</div>
                              <div style={{ fontSize: 12, opacity: 0.7 }}>{rack.itemCount} stock item{rack.itemCount === 1 ? "" : "s"}</div>
                            </div>
                            <div style={{ fontWeight: 800 }}>{rack.totalKg.toFixed(1)} kg</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 18, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Low Stock Warnings</div>
                    {filteredStockWarnings.length === 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>No low stock warnings.</div>
                    ) : filteredStockWarnings.map((warning, index) => (
                      <div key={`${warning.material}-${warning.thickness}-${index}`} style={{ padding: 10, borderRadius: 10, background: "rgba(120, 53, 15, 0.22)", border: "1px solid rgba(251, 191, 36, 0.24)", fontSize: 12, marginBottom: 8 }}>
                        {warning.message}
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 18, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Stock Movements</div>
                    <div style={{ display: "grid", gap: 8, maxHeight: 420, overflowY: "auto" }}>
                      {stockMovements.slice(0, 40).map((movement) => (
                        <div key={movement.id} style={{ padding: 10, borderRadius: 10, background: "rgba(15, 23, 42, 0.72)", border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{movement.type}</div>
                          <div style={{ fontSize: 12, opacity: 0.8 }}>{movement.material} {movement.thickness}mm · Qty {movement.quantity}</div>
                          <div style={{ fontSize: 11, opacity: 0.7 }}>{movement.jobId ?? "No job"} · {new Date(movement.createdAt).toLocaleString("en-ZA")}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 18, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Stock Suggestion Panel</div>
                    {selectedSmartQueueJob ? (
                      stockJobSuggestion ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ fontSize: 12, color: stockJobSuggestion.materialRequired ? "#fca5a5" : "#86efac" }}>
                            {stockJobSuggestion.message}
                            {stockJobSuggestion.estimatedSaving > 0 ? ` · Saving ${formatRand(stockJobSuggestion.estimatedSaving)}` : ""}
                          </div>
                          {stockJobSuggestion.bestOffcut ? (
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              Best offcut: {stockJobSuggestion.bestOffcut.width} x {stockJobSuggestion.bestOffcut.height} · {stockJobSuggestion.bestOffcut.location ?? "No location"}
                            </div>
                          ) : null}
                          {stockJobSuggestion.bestSheet ? (
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              Best full sheet: {stockJobSuggestion.bestSheet.width} x {stockJobSuggestion.bestSheet.height} · Qty {stockJobSuggestion.bestSheet.quantity}
                            </div>
                          ) : null}
                          {stockJobOffcutMatch?.offcut ? (
                            <div style={{ padding: 10, borderRadius: 10, background: "rgba(15, 23, 42, 0.62)", border: `1px solid ${UI.colors.border}`, display: "grid", gap: 6 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: stockJobOffcutMatch.fitType === "partial" ? "#fbbf24" : "#86efac" }}>
                                Smart Offcut: {stockJobOffcutMatch.message}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.84 }}>
                                Best offcut match: {stockJobOffcutMatch.offcut.width} x {stockJobOffcutMatch.offcut.height} · {stockJobOffcutMatch.offcut.location ?? "No location"}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.76 }}>
                                Fit: {stockJobOffcutMatch.fitType ?? "none"} · Confidence {Math.round(stockJobOffcutMatch.confidence * 100)}% · Waste {stockJobOffcutMatch.wasteArea.toFixed(0)} mm²
                                {stockJobOffcutMatch.savingEstimate > 0 ? ` · Saving ${formatRand(stockJobOffcutMatch.savingEstimate)}` : ""}
                              </div>
                            </div>
                          ) : null}
                          {!stockJobSuggestion.materialRequired ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {stockJobOffcutMatch?.offcut ? (
                                <button onClick={() => {
                                  const sourcePart = selectedSmartQueueJob.legacyJobId ? jobs.find((job) => job.id === selectedSmartQueueJob.legacyJobId)?.jobDxfParts?.[0] : undefined;
                                  const width = sourcePart?.widthMm ?? 0;
                                  const height = sourcePart?.heightMm ?? 0;
                                  void useSuggestedOffcut({
                                    offcutId: stockJobOffcutMatch.offcut.id,
                                    action: "reserve",
                                    jobId: selectedSmartQueueJob.legacyJobId ?? selectedSmartQueueJob.jobNumber,
                                    partDnaId: selectedSmartQueueJob.partDnaId ?? null,
                                    width,
                                    height
                                  });
                                }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(59, 130, 246, 0.34)", background: "rgba(59, 130, 246, 0.16)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                                  Use Suggested Offcut
                                </button>
                              ) : null}
                              <button onClick={() => {
                                const sourcePart = selectedSmartQueueJob.legacyJobId ? jobs.find((job) => job.id === selectedSmartQueueJob.legacyJobId)?.jobDxfParts?.[0] : undefined;
                                const width = sourcePart?.widthMm ?? 0;
                                const height = sourcePart?.heightMm ?? 0;
                                if (width <= 0 || height <= 0) return;
                                void reserveStockForTarget({
                                  jobId: selectedSmartQueueJob.legacyJobId ?? selectedSmartQueueJob.jobNumber,
                                  material: selectedSmartQueueJob.material,
                                  thickness: selectedSmartQueueJob.thickness ?? 0,
                                  width,
                                  height
                                });
                              }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(34, 197, 94, 0.34)", background: "rgba(34, 197, 94, 0.16)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                                Reserve
                              </button>
                              <button onClick={() => {
                                void markTargetStockUsed(selectedSmartQueueJob.legacyJobId ?? selectedSmartQueueJob.jobNumber);
                              }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(163, 230, 53, 0.3)", background: "rgba(101, 163, 13, 0.16)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                                Mark Used
                              </button>
                              <button onClick={() => {
                                const parentSheetId = stockJobSuggestion.bestSheet?.id ?? null;
                                if (!parentSheetId) return;
                                const width = Number(window.prompt("Offcut width mm", "300"));
                                const height = Number(window.prompt("Offcut height mm", "300"));
                                if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
                                void apiFetch("/api/stock/create-offcut", {
                                  method: "POST",
                                  body: JSON.stringify({
                                    workspaceId,
                                    jobId: selectedSmartQueueJob.legacyJobId ?? selectedSmartQueueJob.jobNumber,
                                    parentSheetId,
                                    width,
                                    height
                                  })
                                }).then(() => refreshStock());
                              }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(59, 130, 246, 0.34)", background: "rgba(59, 130, 246, 0.16)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                                Create Offcut
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Select a queue job with material, thickness, and DXF size to get a stock suggestion.</div>
                      )
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Select a queue job to get stock suggestions.</div>
                    )}
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 18, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontWeight: 800 }}>Smart Offcut Recommendations</div>
                      <button onClick={() => { void refreshOffcutRecommendations(); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(59, 130, 246, 0.34)", background: "rgba(59, 130, 246, 0.14)", color: "white", cursor: "pointer", fontSize: 12 }}>
                        Refresh
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto" }}>
                      {offcutRecommendations.map((entry) => (
                        <div key={entry.recommendation.id} style={{ padding: 10, borderRadius: 10, background: "rgba(15, 23, 42, 0.72)", border: "1px solid rgba(99, 102, 241, 0.16)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{entry.recommendation.title}</div>
                            <div style={{ fontSize: 11, opacity: 0.75 }}>{Math.round(entry.recommendation.confidence * 100)}%</div>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.78, marginTop: 4 }}>{entry.recommendation.message}</div>
                          {entry.offcut ? (
                            <div style={{ fontSize: 11, opacity: 0.72, marginTop: 6 }}>
                              {entry.offcut.material} {entry.offcut.thickness}mm · {entry.offcut.width} x {entry.offcut.height} · {entry.offcut.location ?? "No location"}
                              {entry.latestMatch ? ` · ${entry.latestMatch.fitType} fit` : ""}
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {offcutRecommendations.length === 0 ? <div style={{ fontSize: 12, opacity: 0.7 }}>No offcut recommendations yet.</div> : null}
                    </div>
                  </div>
                </div>
              </div>
              )}
            </div>
          </div>
        ) : viewMode === "image_dxf" ? (
          <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
            <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Image to Outline DXF (High Precision)</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 12 }}>
                  Upload a clear image (logo, silhouette, part shape) and generate an outline DXF. Tune threshold and curve detail for best precision.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 10 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                        <input
                          type="file"
                          accept="image/*,.heic,.heif"
                          onChange={(e) => {
                            setImageToDxfFile(e.target.files?.[0] ?? null);
                            setImageToDxfResultFileName(null);
                            setImageToDxfResultBase64(null);
                            setImageToDxfPreviewDataUrl(null);
                            setImageToDxfResultStats(null);
                          }}
                          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
                          Supports PNG, JPG, WEBP, BMP, TIFF, HEIC. If your file shows a cloud icon, download it locally first.
                        </div>
                      </div>
                  <input
                    value={imageToDxfThreshold}
                    onChange={(e) => setImageToDxfThreshold(e.target.value)}
                    placeholder="Threshold (0-255)"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <input
                    value={imageToDxfCurveSteps}
                    onChange={(e) => setImageToDxfCurveSteps(e.target.value)}
                    placeholder="Curve Steps (8-200)"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <input
                    value={imageToDxfMmPerPixel}
                    onChange={(e) => setImageToDxfMmPerPixel(e.target.value)}
                    placeholder="mm per pixel"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                  <input
                    value={imageToDxfLayer}
                    onChange={(e) => setImageToDxfLayer(e.target.value)}
                    placeholder="DXF Layer"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      void convertImageToOutlineDxf();
                    }}
                    disabled={imageToDxfBusy || !imageToDxfFile}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: imageToDxfBusy ? "#374151" : "#16a34a",
                      color: "white",
                      cursor: imageToDxfBusy || !imageToDxfFile ? "not-allowed" : "pointer",
                      fontWeight: 700
                    }}
                  >
                    {imageToDxfBusy ? "Converting..." : "Convert to DXF"}
                  </button>
                  <button
                    onClick={exportImageToDxf}
                    disabled={!imageToDxfResultBase64}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: imageToDxfResultBase64 ? "#0ea5e9" : "#374151",
                      color: "white",
                      cursor: imageToDxfResultBase64 ? "pointer" : "not-allowed",
                      fontWeight: 700
                    }}
                  >
                    Export DXF
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.82 }}>
                  {imageToDxfStatus ?? "No conversion run yet."}
                </div>
                {imageToDxfPreviewDataUrl ? (
                  <div style={{ marginTop: 14, border: "1px solid #364152", borderRadius: 10, background: "#0b1220", padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>DXF Preview</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {imageToDxfResultFileName ?? "outline.dxf"}
                        {imageToDxfResultStats
                          ? ` · ${imageToDxfResultStats.polylineCount ?? 0} outlines · ${imageToDxfResultStats.segmentCount ?? 0} segments`
                          : ""}
                      </div>
                    </div>
                    <img
                      src={imageToDxfPreviewDataUrl}
                      alt="DXF preview"
                      style={{
                        width: "100%",
                        maxHeight: 700,
                        objectFit: "contain",
                        background: "#ffffff",
                        borderRadius: 8,
                        border: "1px solid #2f3948"
                      }}
                    />
                  </div>
                ) : null}
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
                <input
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                  placeholder="Customer email"
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
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder="Customer phone"
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
                  value={newCustomerAddress}
                  onChange={(e) => setNewCustomerAddress(e.target.value)}
                  placeholder="Customer address"
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
                  value={newCustomerNotes}
                  onChange={(e) => setNewCustomerNotes(e.target.value)}
                  placeholder="Notes / contact person"
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
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Add Payment</div>
                <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 10 }}>
                  Add manual customer payments here, or jump to Email and apply a proof of payment from an invoice email.
                </div>
                <select
                  value={paymentCustomerId}
                  onChange={(e) => setPaymentCustomerId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #333",
                    background: "#111",
                    color: "white",
                    marginBottom: 10
                  }}
                >
                  <option value="">Select customer</option>
                  {customerSummaries.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
                <input
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Payment amount"
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
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="Reference / note"
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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      void addPayment();
                    }}
                    disabled={paymentBusy}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: paymentBusy ? "#374151" : "#16a34a",
                      color: "white",
                      cursor: paymentBusy ? "not-allowed" : "pointer"
                    }}
                  >
                    {paymentBusy ? "Saving..." : "Save Payment"}
                  </button>
                  <button
                    onClick={() => setViewMode("email")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: "#1d4ed8",
                      color: "white",
                      cursor: "pointer"
                    }}
                  >
                    Open Email POP
                  </button>
                </div>
                {paymentStatus ? <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>{paymentStatus}</div> : null}
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
                      onClick={() => {
                        setPaymentCustomerId(customer.id);
                        setPaymentStatus(`Ready to add payment for ${customer.name}.`);
                      }}
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
      {accountRequestPopup ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 1100
          }}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              background: "#111827",
              borderRadius: 18,
              border: "1px solid rgba(250,204,21,0.34)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
              padding: 22
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>New Qouter X account request</div>
            <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.6, marginBottom: 14 }}>
              A new company is waiting for admin approval.
            </div>
            <div
              style={{
                background: "#1f2937",
                borderRadius: 12,
                padding: 14,
                border: "1px solid rgba(250,204,21,0.2)",
                display: "grid",
                gap: 6
              }}
            >
              <div style={{ fontWeight: 800 }}>{accountRequestPopup.companyName}</div>
              <div style={{ fontSize: 13, color: UI.colors.text }}>{accountRequestPopup.contactName || "No contact name"}</div>
              <div style={{ fontSize: 12, color: UI.colors.muted }}>{accountRequestPopup.email || "No email provided"}</div>
              <div style={{ fontSize: 12, color: UI.colors.muted }}>
                Device: {accountRequestPopup.deviceName} · {accountRequestPopup.platform}
              </div>
              <div style={{ fontSize: 12, color: UI.colors.muted }}>
                Requested: {formatDateTime(accountRequestPopup.createdAt)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 18 }}>
              <Button
                onClick={() => {
                  setViewMode("admin_subscriptions");
                  setAccountRequestPopup(null);
                }}
                variant="secondary"
              >
                View Request
              </Button>
              <Button
                onClick={() => {
                  void approveAccountRequest(accountRequestPopup.id, 1);
                  setViewMode("admin_subscriptions");
                  setAccountRequestPopup(null);
                }}
                variant="primary"
              >
                Approve
              </Button>
              <Button
                onClick={() => {
                  void rejectAccountRequest(accountRequestPopup.id);
                  setAccountRequestPopup(null);
                }}
                variant="danger"
              >
                Reject
              </Button>
              <Button onClick={() => setAccountRequestPopup(null)} variant="secondary">
                Later
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {partDnaPreviousPricePopup ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 1000
          }}
        >
          <div
            style={{
              width: "min(640px, 100%)",
              background: "#111827",
              borderRadius: 18,
              border: "1px solid rgba(96,165,250,0.34)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
              padding: 22
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Previous Part Price Found</div>
            <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.6, marginBottom: 14 }}>
              Part DNA found previous quote pricing for this detected part.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {partDnaPreviousPricePopup.entries.map((entry) => (
                <div
                  key={`${entry.partCode}-${entry.previousQuotedAt ?? "unknown"}`}
                  style={{
                    background: "#1f2937",
                    borderRadius: 12,
                    padding: 12,
                    border: "1px solid rgba(96,165,250,0.2)"
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>{entry.partCode}</div>
                  <div style={{ fontSize: 12, opacity: 0.82, marginBottom: 6 }}>{entry.partName}</div>
                  <div style={{ fontSize: 14 }}>
                    Previous quoted price: <strong>{formatRand(entry.previousQuotedPrice)}</strong>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.74, marginTop: 4 }}>
                    Quote date: {formatDateTime(entry.previousQuotedAt)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={() => setPartDnaPreviousPricePopup(null)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(96,165,250,0.32)",
                  background: "#1d4ed8",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 700
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[renderer] uncaught render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#111318", color: "white", padding: 24, fontFamily: "Inter, sans-serif" }}>
          <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>Qouter X Renderer Error</div>
            <div style={{ fontSize: 14, color: "#cbd5e1" }}>
              The UI hit a runtime error instead of loading a blank screen.
            </div>
            <pre
              style={{
                margin: 0,
                padding: 16,
                borderRadius: 16,
                background: "#020617",
                border: "1px solid rgba(148, 163, 184, 0.22)",
                color: "#fca5a5",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word"
              }}
            >
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    {["/download", "/downloads"].includes(window.location.pathname) ? <DownloadPage /> : <App />}
  </RootErrorBoundary>
);
