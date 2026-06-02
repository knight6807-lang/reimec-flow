import React from "react";
import type {
  CustomerRecord,
  QuoteRecord,
  QuotePart,
  DxfReaderPartPreview,
  QuoteDxfSourceFile,
  PdfReaderPartPreview,
  PdfReaderSourcePage,
  NestingResult,
} from "../types";
import {
  MASTER_MATERIALS,
  SANITARY_FITTING_GROUPS,
  SANITARY_STANDARD_SIZES,
} from "../constants";

type PunchPart = {
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
};
type WeldPart = {
  name: string;
  weldLengthMm: number;
  thicknessMm: number;
  material: string;
  quantity: number;
  pricePerMeter: number;
};
type BendPart = {
  name: string;
  bendLengthMm: number;
  thicknessMm: number;
  material: string;
  quantity: number;
  bendCount: number;
  shortPricePerBend: number;
  longPricePerBend: number;
};
type RollingPart = {
  name: string;
  diameterMm: number;
  heightMm: number;
  rollingLengthMm: number;
  thicknessMm: number;
  material: string;
  quantity: number;
  pricePerMeter: number;
};

export interface QuotesViewProps {
  quotesPage: "calculator" | "dxf_reader" | "pdf_reader" | "recent_quotes";
  setQuotesPage: (v: "calculator" | "dxf_reader" | "pdf_reader" | "recent_quotes") => void;
  quotes: QuoteRecord[];
  customers: CustomerRecord[];
  quoteSeed: string;
  setQuoteSeed: (v: string) => void;
  quoteTitle: string;
  setQuoteTitle: (v: string) => void;
  quoteCustomerId: string;
  setQuoteCustomerId: (v: string) => void;
  quoteCompanyName: string;
  setQuoteCompanyName: (v: string) => void;
  quoteCompanyEmail: string;
  setQuoteCompanyEmail: (v: string) => void;
  quoteCompanyPhone: string;
  setQuoteCompanyPhone: (v: string) => void;
  quoteCompanyAddress: string;
  setQuoteCompanyAddress: (v: string) => void;
  quoteCompanyVatNumber: string;
  setQuoteCompanyVatNumber: (v: string) => void;
  quoteCompanyRegistrationNumber: string;
  setQuoteCompanyRegistrationNumber: (v: string) => void;
  quoteAccentColor: string;
  setQuoteAccentColor: (v: string) => void;
  companyProfileSaving: boolean;
  quoteVatRate: string;
  setQuoteVatRate: (v: string) => void;
  costPerPierce: string;
  setCostPerPierce: (v: string) => void;
  costPerCutMm: string;
  setCostPerCutMm: (v: string) => void;
  costPerBend: string;
  setCostPerBend: (v: string) => void;
  dxfReaderLayers: string[];
  dxfReaderSelectedLayers: string[];
  dxfReaderParts: DxfReaderPartPreview[];
  dxfReaderSourceFiles: QuoteDxfSourceFile[];
  dxfReaderSelectedPartIds: string[];
  setDxfReaderSelectedPartIds: (v: string[]) => void;
  dxfReaderStatus: string | null;
  setDxfReaderStatus: (v: string | null) => void;
  dxfReaderTextInput: string;
  setDxfReaderTextInput: (v: string) => void;
  pdfReaderSourcePages: PdfReaderSourcePage[];
  pdfReaderParts: PdfReaderPartPreview[];
  pdfReaderSelectedPartIds: string[];
  setPdfReaderSelectedPartIds: (v: string[]) => void;
  pdfReaderStatus: string | null;
  dxfMergeToleranceMm: string;
  setDxfMergeToleranceMm: (v: string) => void;
  nestingGapMm: string;
  setNestingGapMm: (v: string) => void;
  nestingResults: NestingResult[];
  materialSearch: string;
  setMaterialSearch: (v: string) => void;
  materials: Array<{ name: string; density: number }>;
  setMaterials: (v: Array<{ name: string; density: number }>) => void;
  newMaterialName: string;
  setNewMaterialName: (v: string) => void;
  newMaterialDensity: string;
  setNewMaterialDensity: (v: string) => void;
  thicknessRates: Array<{ thicknessMm: number; ratePerKg: number }>;
  setThicknessRates: (v: Array<{ thicknessMm: number; ratePerKg: number }>) => void;
  newThicknessMm: string;
  setNewThicknessMm: (v: string) => void;
  newThicknessRate: string;
  setNewThicknessRate: (v: string) => void;
  quickPartName: string;
  setQuickPartName: (v: string) => void;
  quickPartLength: string;
  setQuickPartLength: (v: string) => void;
  quickPartWidth: string;
  setQuickPartWidth: (v: string) => void;
  quickPartThickness: string;
  setQuickPartThickness: (v: string) => void;
  quickPartQuantity: string;
  setQuickPartQuantity: (v: string) => void;
  quickPartMaterial: string;
  setQuickPartMaterial: (v: string) => void;
  stockQuoteSuggestion: unknown;
  stockQuoteOffcutMatch: { offcut: { id: string } | null } | null;
  selectedQuotePartIndex: number | null;
  setSelectedQuotePartIndex: (v: number | null) => void;
  quoteSearchTerm: string;
  setQuoteSearchTerm: (v: string) => void;
  quotePreviewUrl: string | null;
  quotePreviewLoading: boolean;
  weldingRates: Array<{ material: string; thicknessMm: number; pricePerMeter: number }>;
  setWeldingRates: (v: Array<{ material: string; thicknessMm: number; pricePerMeter: number }>) => void;
  newWeldingRateMaterial: string;
  setNewWeldingRateMaterial: (v: string) => void;
  newWeldingRateThickness: string;
  setNewWeldingRateThickness: (v: string) => void;
  newWeldingRatePrice: string;
  setNewWeldingRatePrice: (v: string) => void;
  bendingRates: Array<{ material: string; thicknessMm: number; shortPricePerBend: number; longPricePerBend: number }>;
  setBendingRates: (v: Array<{ material: string; thicknessMm: number; shortPricePerBend: number; longPricePerBend: number }>) => void;
  newBendingRateMaterial: string;
  setNewBendingRateMaterial: (v: string) => void;
  newBendingRateThickness: string;
  setNewBendingRateThickness: (v: string) => void;
  newBendingShortPrice: string;
  setNewBendingShortPrice: (v: string) => void;
  newBendingLongPrice: string;
  setNewBendingLongPrice: (v: string) => void;
  rollingRates: Array<{ material: string; thicknessMm: number; pricePerMeter: number }>;
  setRollingRates: (v: Array<{ material: string; thicknessMm: number; pricePerMeter: number }>) => void;
  newRollingRateMaterial: string;
  setNewRollingRateMaterial: (v: string) => void;
  newRollingRateThickness: string;
  setNewRollingRateThickness: (v: string) => void;
  newRollingRatePrice: string;
  setNewRollingRatePrice: (v: string) => void;
  quoteParts: QuotePart[];
  punchParts: PunchPart[];
  weldParts: WeldPart[];
  bendParts: BendPart[];
  rollingParts: RollingPart[];
  copiedPart: QuotePart | null;
  workspaceId: string | null;
  quoteLogoDataUrl: string | null;
  setQuoteLogoDataUrl: (v: string | null) => void;
  selectedRecentQuoteId: string | null;
  setSelectedRecentQuoteId: (v: string | null) => void;
  // Computed values
  calculatedParts: Array<QuotePart & { unitPrice: number; lineTotal: number; weightKg: number }>;
  punchCalculatedParts: Array<PunchPart & { lineTotal: number; weightKg: number; quantity: number }>;
  punchPartsTotal: number;
  punchPartsVat: number;
  punchPartsFinal: number;
  punchPartsWeight: number;
  laserSubTotal: number;
  laserVat: number;
  laserTotal: number;
  parsedVatRate: number;
  densityByMaterial: Record<string, number>;
  rateByMaterial: Record<string, number>;
  punchPriceByThickness: Record<number, number>;
  parsedCostPerPierce: number;
  parsedCostPerCutMm: number;
  parsedCostPerBend: number;
  weldCalculatedParts: Array<WeldPart & { effectiveRate: number; metersPerPart: number; totalMeters: number; lineTotal: number }>;
  weldingSubTotal: number;
  weldingVat: number;
  weldingTotal: number;
  weldingTotalMeters: number;
  bendCalculatedParts: Array<BendPart & { isLong: boolean; effectivePricePerBend: number; totalBends: number; lineTotal: number }>;
  bendingSubTotal: number;
  bendingVat: number;
  bendingTotal: number;
  bendingTotalBends: number;
  rollingCalculatedParts: Array<RollingPart & { effectiveRate: number; effectiveRollingLengthMm: number; metersPerPart: number; totalMeters: number; areaSqmPerPart: number; totalAreaSqm: number; weightKgPerPart: number; totalWeightKg: number; lineTotal: number }>;
  rollingSubTotal: number;
  rollingVat: number;
  rollingTotal: number;
  rollingTotalMeters: number;
  rollingTotalAreaSqm: number;
  rollingTotalWeightKg: number;
  quoteNumber: string;
  quoteMaterialOptions: string[];
  activeQuoteStockPart: (QuotePart & { unitPrice: number; lineTotal: number; weightKg: number }) | null;
  recommendedNesting: NestingResult | null;
  groupedRecentQuotes: Array<[string, QuoteRecord[]]>;
  selectedRecentQuote: QuoteRecord | null;
  // Functions
  createQuote: () => void;
  saveQuoteSeed: () => void;
  openQuotePdf: (id: string) => Promise<void>;
  printQuotePdf: (id: string) => Promise<void>;
  createInvoiceFromQuote: (quote: QuoteRecord) => Promise<void>;
  createAutoJobCardFromQuote: (quote: QuoteRecord) => Promise<void>;
  exportQuotePdf: (id: string) => Promise<void>;
  printInvoicePdf: (id: string) => Promise<void>;
  addQuotePart: () => void;
  removeQuotePart: (index: number) => void;
  updateQuotePart: (index: number, field: keyof QuotePart, value: unknown) => void;
  addPunchPart: () => void;
  removePunchPart: (index: number) => void;
  updatePunchPart: (index: number, field: string, value: unknown) => void;
  addWeldPart: () => void;
  removeWeldPart: (index: number) => void;
  updateWeldPart: (index: number, field: string, value: unknown) => void;
  addBendPart: () => void;
  removeBendPart: (index: number) => void;
  updateBendPart: (index: number, field: string, value: unknown) => void;
  addRollingPart: () => void;
  removeRollingPart: (index: number) => void;
  updateRollingPart: (index: number, field: string, value: unknown) => void;
  addMaterial: () => void;
  addMaterialFromLibrary: (mat: { name: string; density: number }) => void;
  addThicknessRate: () => void;
  addQuickPart: () => void;
  focusCell: (row: number, col: number, tableId: string) => void;
  handleCellKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number, maxRow: number, maxCol: number, tableId: string) => void;
  loadDxfReaderFiles: (files?: FileList) => Promise<void>;
  ingestDxfRaw: (raw: string, fileName: string) => void;
  renameDxfReaderPart: (id: string, name: string) => void;
  loadPdfReaderFiles: (files?: FileList) => Promise<void>;
  renamePdfReaderPart: (id: string, name: string) => void;
  pickAccentFromLogo: (dataUrl: string) => Promise<string | null>;
  formatRand: (value: number | null | undefined) => string;
  apiFetch: (path: string, options?: RequestInit) => Promise<Response>;
  saveCompanyProfile: () => Promise<void>;
  runNestingEstimate: () => void;
  useSuggestedOffcut: (params: { offcutId: string; action: string; quoteId: string | null; partDnaId: number | null; width: number; height: number }) => Promise<void>;
  uploadQuotePartDxf: (index: number, file?: File) => Promise<void>;
  uploadQuotePartDxfFromDesktopPicker: (index: number) => Promise<void>;
  importDxfFromDesktopPicker: () => Promise<void>;
  importPdfFromDesktopPicker: () => Promise<void>;
  clearDxfReader: () => void;
  clearPdfReader: () => void;
  toggleDxfReaderLayer: (layer: string) => void;
  toggleDxfReaderPart: (id: string) => void;
  togglePdfReaderPart: (id: string) => void;
  deleteSelectedDxfReaderParts: () => void;
  deleteSelectedPdfReaderParts: () => void;
  toggleSelectAllDxfReaderParts: () => void;
  toggleSelectAllPdfReaderParts: () => void;
  addSelectedDxfPartsToQuote: () => void;
  addSelectedPdfPartsToQuote: () => void;
  updateDxfReaderPartQuantity: (id: string, qty: number) => void;
  addWeldingRate: () => void;
  addBendingRate: () => void;
  addRollingRate: () => void;
}

export function QuotesView(props: QuotesViewProps) {
  const {
    quotesPage, setQuotesPage,
    quotes, customers,
    quoteSeed, setQuoteSeed,
    quoteTitle, setQuoteTitle,
    quoteCustomerId, setQuoteCustomerId,
    quoteCompanyName, setQuoteCompanyName,
    quoteCompanyEmail, setQuoteCompanyEmail,
    quoteCompanyPhone, setQuoteCompanyPhone,
    quoteCompanyAddress, setQuoteCompanyAddress,
    quoteCompanyVatNumber, setQuoteCompanyVatNumber,
    quoteCompanyRegistrationNumber, setQuoteCompanyRegistrationNumber,
    quoteAccentColor, setQuoteAccentColor,
    companyProfileSaving,
    quoteVatRate, setQuoteVatRate,
    costPerPierce, setCostPerPierce,
    costPerCutMm, setCostPerCutMm,
    costPerBend, setCostPerBend,
    dxfReaderLayers, dxfReaderSelectedLayers, dxfReaderParts, dxfReaderSourceFiles,
    dxfReaderSelectedPartIds, setDxfReaderSelectedPartIds,
    dxfReaderStatus, setDxfReaderStatus,
    dxfReaderTextInput, setDxfReaderTextInput,
    pdfReaderSourcePages, pdfReaderParts, pdfReaderSelectedPartIds, setPdfReaderSelectedPartIds,
    pdfReaderStatus,
    dxfMergeToleranceMm, setDxfMergeToleranceMm,
    nestingGapMm, setNestingGapMm, nestingResults,
    materialSearch, setMaterialSearch,
    materials, setMaterials,
    newMaterialName, setNewMaterialName,
    newMaterialDensity, setNewMaterialDensity,
    thicknessRates, setThicknessRates,
    newThicknessMm, setNewThicknessMm,
    newThicknessRate, setNewThicknessRate,
    quickPartName, setQuickPartName,
    quickPartLength, setQuickPartLength,
    quickPartWidth, setQuickPartWidth,
    quickPartThickness, setQuickPartThickness,
    quickPartQuantity, setQuickPartQuantity,
    quickPartMaterial, setQuickPartMaterial,
    stockQuoteSuggestion, stockQuoteOffcutMatch,
    selectedQuotePartIndex, setSelectedQuotePartIndex,
    quoteSearchTerm, setQuoteSearchTerm,
    quotePreviewUrl, quotePreviewLoading,
    weldingRates, setWeldingRates,
    newWeldingRateMaterial, setNewWeldingRateMaterial,
    newWeldingRateThickness, setNewWeldingRateThickness,
    newWeldingRatePrice, setNewWeldingRatePrice,
    bendingRates, setBendingRates,
    newBendingRateMaterial, setNewBendingRateMaterial,
    newBendingRateThickness, setNewBendingRateThickness,
    newBendingShortPrice, setNewBendingShortPrice,
    newBendingLongPrice, setNewBendingLongPrice,
    rollingRates, setRollingRates,
    newRollingRateMaterial, setNewRollingRateMaterial,
    newRollingRateThickness, setNewRollingRateThickness,
    newRollingRatePrice, setNewRollingRatePrice,
    quoteParts, punchParts, weldParts, bendParts, rollingParts,
    copiedPart, workspaceId,
    quoteLogoDataUrl, setQuoteLogoDataUrl,
    selectedRecentQuoteId, setSelectedRecentQuoteId,
    calculatedParts, punchCalculatedParts, punchPartsTotal, punchPartsVat, punchPartsFinal, punchPartsWeight,
    laserSubTotal, laserVat, laserTotal,
    parsedVatRate, densityByMaterial, rateByMaterial, punchPriceByThickness,
    parsedCostPerPierce, parsedCostPerCutMm, parsedCostPerBend,
    weldCalculatedParts, weldingSubTotal, weldingVat, weldingTotal, weldingTotalMeters,
    bendCalculatedParts, bendingSubTotal, bendingVat, bendingTotal, bendingTotalBends,
    rollingCalculatedParts, rollingSubTotal, rollingVat, rollingTotal, rollingTotalMeters, rollingTotalAreaSqm, rollingTotalWeightKg,
    quoteNumber, quoteMaterialOptions,
    activeQuoteStockPart, recommendedNesting,
    groupedRecentQuotes, selectedRecentQuote,
    createQuote, saveQuoteSeed, openQuotePdf, printQuotePdf,
    createInvoiceFromQuote, createAutoJobCardFromQuote, exportQuotePdf, printInvoicePdf,
    addQuotePart, removeQuotePart, updateQuotePart,
    addPunchPart, removePunchPart, updatePunchPart,
    addWeldPart, removeWeldPart, updateWeldPart,
    addBendPart, removeBendPart, updateBendPart,
    addRollingPart, removeRollingPart, updateRollingPart,
    addMaterial, addMaterialFromLibrary, addThicknessRate, addQuickPart,
    focusCell, handleCellKeyDown,
    loadDxfReaderFiles, ingestDxfRaw, renameDxfReaderPart,
    loadPdfReaderFiles, renamePdfReaderPart,
    pickAccentFromLogo, formatRand, apiFetch, saveCompanyProfile,
    runNestingEstimate, useSuggestedOffcut,
    uploadQuotePartDxf, uploadQuotePartDxfFromDesktopPicker,
    importDxfFromDesktopPicker, importPdfFromDesktopPicker,
    clearDxfReader, clearPdfReader,
    toggleDxfReaderLayer, toggleDxfReaderPart, togglePdfReaderPart,
    deleteSelectedDxfReaderParts, deleteSelectedPdfReaderParts,
    toggleSelectAllDxfReaderParts, toggleSelectAllPdfReaderParts,
    addSelectedDxfPartsToQuote, addSelectedPdfPartsToQuote,
    updateDxfReaderPartQuantity,
    addWeldingRate, addBendingRate, addRollingRate,
  } = props;

  return (
          <div style={{ flex: 1, padding: 16, overflow: "auto", background: "#202226" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(210px, 240px) minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
              <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 16, padding: 10, display: "flex", flexDirection: "column", gap: 8, border: "1px solid rgba(99, 102, 241, 0.16)", boxShadow: "0 0 20px rgba(88, 101, 242, 0.06)" }}>
                <button
                  onClick={() => setQuotesPage("calculator")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: quotesPage === "calculator" ? "1px solid rgba(122, 132, 255, 0.9)" : "1px solid rgba(99, 102, 241, 0.18)",
                    background: quotesPage === "calculator" ? "rgba(58, 68, 99, 0.82)" : "rgba(255,255,255,0.02)",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left",
                    boxShadow: quotesPage === "calculator" ? "0 0 18px rgba(88, 101, 242, 0.16)" : "0 0 12px rgba(88, 101, 242, 0.05)"
                  }}
                >
                  Quote Calculator
                </button>
                <button
                  onClick={() => setQuotesPage("dxf_reader")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: quotesPage === "dxf_reader" ? "1px solid rgba(122, 132, 255, 0.9)" : "1px solid rgba(99, 102, 241, 0.18)",
                    background: quotesPage === "dxf_reader" ? "rgba(58, 68, 99, 0.82)" : "rgba(255,255,255,0.02)",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left",
                    boxShadow: quotesPage === "dxf_reader" ? "0 0 18px rgba(88, 101, 242, 0.16)" : "0 0 12px rgba(88, 101, 242, 0.05)"
                  }}
                >
                  DXF Reader
                </button>
                <button
                  onClick={() => setQuotesPage("pdf_reader")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: quotesPage === "pdf_reader" ? "1px solid rgba(122, 132, 255, 0.9)" : "1px solid rgba(99, 102, 241, 0.18)",
                    background: quotesPage === "pdf_reader" ? "rgba(58, 68, 99, 0.82)" : "rgba(255,255,255,0.02)",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left",
                    boxShadow: quotesPage === "pdf_reader" ? "0 0 18px rgba(88, 101, 242, 0.16)" : "0 0 12px rgba(88, 101, 242, 0.05)"
                  }}
                >
                  PDF Reader
                </button>
              </div>

              <div>

            {quotesPage === "calculator" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 16, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)", boxShadow: "0 0 20px rgba(88, 101, 242, 0.06)" }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Quote Settings</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                  Set quote numbering and save company profile once for all new quotes.
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input
                    value={quoteSeed}
                    onChange={(e) => setQuoteSeed(e.target.value)}
                    placeholder="Start number"
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(99, 102, 241, 0.24)",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <button
                    onClick={saveQuoteSeed}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(99, 102, 241, 0.28)",
                      background: "rgba(78, 90, 128, 0.82)",
                      color: "white",
                      cursor: "pointer"
                    }}
                  >
                    Save
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <input
                    value={quoteCompanyName}
                    onChange={(e) => setQuoteCompanyName(e.target.value)}
                    placeholder="Company name"
                    style={{ gridColumn: "1 / -1", padding: 10, borderRadius: 8, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white" }}
                  />
                  <input
                    value={quoteCompanyEmail}
                    onChange={(e) => setQuoteCompanyEmail(e.target.value)}
                    placeholder="Company email"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white" }}
                  />
                  <input
                    value={quoteCompanyPhone}
                    onChange={(e) => setQuoteCompanyPhone(e.target.value)}
                    placeholder="Company phone"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white" }}
                  />
                  <input
                    value={quoteCompanyVatNumber}
                    onChange={(e) => setQuoteCompanyVatNumber(e.target.value)}
                    placeholder="VAT number"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white" }}
                  />
                  <input
                    value={quoteCompanyRegistrationNumber}
                    onChange={(e) => setQuoteCompanyRegistrationNumber(e.target.value)}
                    placeholder="Registration number"
                    style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white" }}
                  />
                  <input
                    value={quoteCompanyAddress}
                    onChange={(e) => setQuoteCompanyAddress(e.target.value)}
                    placeholder="Company address"
                    style={{ gridColumn: "1 / -1", padding: 10, borderRadius: 8, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white" }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, color: "white", fontSize: 12 }}>
                    Accent color
                    <input
                      type="color"
                      value={quoteAccentColor}
                      onChange={(e) => setQuoteAccentColor(e.target.value)}
                      style={{ width: 36, height: 28, border: "1px solid rgba(99, 102, 241, 0.24)", borderRadius: 6, background: "#111" }}
                    />
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const dataUrl = String(reader.result);
                        setQuoteLogoDataUrl(dataUrl);
                        const accent = await pickAccentFromLogo(dataUrl);
                        if (accent) setQuoteAccentColor(accent);
                      };
                      reader.readAsDataURL(file);
                    }}
                    style={{ gridColumn: "1 / -1" }}
                  />
                  <button
                    onClick={saveCompanyProfile}
                    disabled={companyProfileSaving}
                    style={{
                      gridColumn: "1 / -1",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(99, 102, 241, 0.28)",
                      background: "rgba(78, 90, 128, 0.72)",
                      color: "white",
                      cursor: companyProfileSaving ? "not-allowed" : "pointer"
                    }}
                  >
                    {companyProfileSaving ? "Saving..." : "Save Company Profile"}
                  </button>
                </div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 16, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)", boxShadow: "0 0 20px rgba(88, 101, 242, 0.06)" }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Create Quote</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <input
                    value={quoteTitle}
                    onChange={(e) => setQuoteTitle(e.target.value)}
                    placeholder="Quote title"
                    style={{
                      gridColumn: "1 / -1",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(99, 102, 241, 0.24)",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <select
                    value={quoteCustomerId}
                    onChange={(e) => setQuoteCustomerId(e.target.value)}
                    style={{
                      gridColumn: "1 / -1",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(99, 102, 241, 0.24)",
                      background: "#111",
                      color: "white"
                    }}
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  {selectedQuoteCustomer ? (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        fontSize: 11,
                        opacity: 0.8,
                        background: "#1b1c1f",
                        border: "1px solid rgba(99, 102, 241, 0.18)",
                        borderRadius: 8,
                        padding: 8
                      }}
                    >
                      {selectedQuoteCustomer.email ? `Email: ${selectedQuoteCustomer.email} · ` : ""}
                      {selectedQuoteCustomer.phone ? `Phone: ${selectedQuoteCustomer.phone} · ` : ""}
                      {selectedQuoteCustomer.address ?? selectedQuoteCustomer.notes ?? "No customer address"}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            ) : null}

            {quotesPage === "dxf_reader" ? (
            <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 16, padding: 16, marginBottom: 16, border: "1px solid rgba(99, 102, 241, 0.16)", boxShadow: "0 0 20px rgba(88, 101, 242, 0.06)" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Built-in DXF Reader</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                Upload one or more DXF files, select detected parts, add selected parts with thumbnails to Laser Quote, and print selected drawings.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <input
                  type="file"
                  accept=".dxf"
                  multiple
                  onChange={(e) => {
                    void loadDxfReaderFiles(e.target.files ?? undefined);
                    e.currentTarget.value = "";
                  }}
                />
                <button
                  onClick={() => {
                    void importDxfFromDesktopPicker();
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#334155",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12
                  }}
                >
                  Import DXF (Desktop Access)
                </button>
                <button
                  onClick={toggleSelectAllDxfReaderParts}
                  disabled={dxfReaderParts.length === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#2f3136",
                    color: "white",
                    cursor: dxfReaderParts.length ? "pointer" : "not-allowed",
                    fontSize: 12
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={() => setDxfReaderSelectedPartIds([])}
                  disabled={dxfReaderSelectedPartIds.length === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#2f3136",
                    color: "white",
                    cursor: dxfReaderSelectedPartIds.length ? "pointer" : "not-allowed",
                    fontSize: 12
                  }}
                >
                  Clear Selection
                </button>
                <button
                  onClick={deleteSelectedDxfReaderParts}
                  disabled={dxfReaderSelectedPartIds.length === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: dxfReaderSelectedPartIds.length === 0 ? "#3f3f46" : "#991b1b",
                    color: "white",
                    cursor: dxfReaderSelectedPartIds.length ? "pointer" : "not-allowed",
                    fontSize: 12
                  }}
                >
                  Delete Selected
                </button>
                <button
                  onClick={clearDxfReader}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#7f1d1d",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={addSelectedDxfPartsToQuote}
                  disabled={dxfReaderSelectedPartIds.length === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#16a34a",
                    color: "white",
                    cursor: dxfReaderSelectedPartIds.length ? "pointer" : "not-allowed",
                    fontSize: 12
                  }}
                >
                  Add Selected To Laser Parts
                </button>
                <button
                  onClick={printSelectedDxfParts}
                  disabled={dxfReaderSelectedPartIds.length === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#5865f2",
                    color: "white",
                    cursor: dxfReaderSelectedPartIds.length ? "pointer" : "not-allowed",
                    fontSize: 12
                  }}
                >
                  Print Selected Drawings
                </button>
                <input
                  value={nestingGapMm}
                  onChange={(e) => setNestingGapMm(e.target.value)}
                  placeholder="Spacing mm"
                  style={{
                    width: 100,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#111",
                    color: "white",
                    fontSize: 12
                  }}
                />
                <button
                  onClick={runNestingEstimate}
                  disabled={dxfReaderSelectedPartIds.length === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#0f766e",
                    color: "white",
                    cursor: dxfReaderSelectedPartIds.length ? "pointer" : "not-allowed",
                    fontSize: 12
                  }}
                >
                  Estimate Plate Needed
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>Merge tolerance</span>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={dxfMergeToleranceMm}
                    onChange={(e) => setDxfMergeToleranceMm(e.target.value)}
                  />
                  <span style={{ fontSize: 12, minWidth: 38 }}>{dxfMergeToleranceMm} mm</span>
                  <button
                    onClick={() => setDxfMergeToleranceMm("8")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid #444",
                      background: "#1f2937",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 11
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>
                  Fallback if file permissions fail: paste DXF text and load directly.
                </div>
                <textarea
                  value={dxfReaderTextInput}
                  onChange={(e) => setDxfReaderTextInput(e.target.value)}
                  placeholder="Paste DXF text here..."
                  style={{
                    width: "100%",
                    minHeight: 90,
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #334155",
                    background: "#0f172a",
                    color: "white",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 11,
                    marginBottom: 8
                  }}
                />
                <button
                  onClick={() => {
                    const raw = dxfReaderTextInput.trim();
                    if (!raw) {
                      setDxfReaderStatus("Paste DXF text first.");
                      return;
                    }
                    const ok = ingestDxfRaw(raw, "pasted-input.dxf");
                    if (ok) setDxfReaderStatus("Loaded DXF from pasted text.");
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#334155",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12
                  }}
                >
                  Load Pasted DXF
                </button>
              </div>
              {dxfReaderStatus ? (
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>{dxfReaderStatus}</div>
              ) : null}
              {dxfReaderLayers.length > 0 ? (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Layers</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {dxfReaderLayers.map((layer) => {
                      const selected = dxfReaderSelectedLayers.includes(layer);
                      return (
                        <button
                          key={layer}
                          onClick={() => toggleDxfReaderLayer(layer)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: selected ? "1px solid #22c55e" : "1px solid #475569",
                            background: selected ? "#14532d" : "#1f2937",
                            color: "white",
                            fontSize: 11,
                            cursor: "pointer"
                          }}
                        >
                          {layer}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {dxfReaderSourceFiles.length > 0 ? (
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
                  Files: {dxfReaderSourceFiles.length} · Parts: {dxfReaderParts.length} · Selected: {dxfReaderSelectedPartIds.length}
                </div>
              ) : null}
              {nestingResults.length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Nesting Estimate</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                    {nestingResults.map((result) => (
                      <div key={`${result.plateWidthMm}x${result.plateHeightMm}`} style={{ background: "#1b1c1f", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          Plate {result.plateWidthMm} x {result.plateHeightMm}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>Plates needed: {result.plateCount}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>Utilization: {result.utilizationPercent.toFixed(1)}%</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>Waste: {result.wastePercent.toFixed(1)}%</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          Used area: {(result.usedAreaMm2 / 1_000_000).toFixed(3)} m² / {(result.totalPlateAreaMm2 / 1_000_000).toFixed(3)} m²
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <svg width={220} height={130} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6 }}>
                            {(() => {
                              const scale = Math.min(210 / result.plateWidthMm, 120 / result.plateHeightMm);
                              const ox = (220 - result.plateWidthMm * scale) / 2;
                              const oy = (130 - result.plateHeightMm * scale) / 2;
                              const firstPlate = result.layouts[0];
                              if (!firstPlate) return null;
                              return (
                                <>
                                  <rect
                                    x={ox}
                                    y={oy}
                                    width={result.plateWidthMm * scale}
                                    height={result.plateHeightMm * scale}
                                    fill="#020617"
                                    stroke="#64748b"
                                  />
                                  {firstPlate.placements.map((placement, idx) => (
                                    <g key={`${placement.name}-${idx}`}>
                                      <rect
                                        x={ox + placement.xMm * scale}
                                        y={oy + placement.yMm * scale}
                                        width={Math.max(1, placement.widthMm * scale)}
                                        height={Math.max(1, placement.heightMm * scale)}
                                        fill="rgba(34,197,94,0.08)"
                                        stroke="rgba(34,197,94,0.35)"
                                        strokeWidth={0.4}
                                      />
                                      {placement.sourceSegments && placement.sourceBounds
                                        ? placement.sourceSegments.map((seg, segIndex) => {
                                            const bh = Math.max(1, placement.sourceBounds!.maxY - placement.sourceBounds!.minY);
                                            const localX1 = seg.x1 - placement.sourceBounds!.minX;
                                            const localY1 = placement.sourceBounds!.maxY - seg.y1;
                                            const localX2 = seg.x2 - placement.sourceBounds!.minX;
                                            const localY2 = placement.sourceBounds!.maxY - seg.y2;

                                            const bw = Math.max(1, placement.sourceBounds!.maxX - placement.sourceBounds!.minX);
                                            const toPlaced = (x: number, y: number) => {
                                              if (placement.rotationDeg === 90) {
                                                return { x: bh - y, y: x };
                                              }
                                              if (placement.rotationDeg === 180) {
                                                return { x: bw - x, y: bh - y };
                                              }
                                              return { x, y };
                                            };

                                            const p1 = toPlaced(localX1, localY1);
                                            const p2 = toPlaced(localX2, localY2);

                                            const px1 = ox + (placement.xMm + p1.x) * scale;
                                            const py1 = oy + (placement.yMm + p1.y) * scale;
                                            const px2 = ox + (placement.xMm + p2.x) * scale;
                                            const py2 = oy + (placement.yMm + p2.y) * scale;

                                            return (
                                              <line
                                                key={`${placement.name}-${idx}-seg-${segIndex}`}
                                                x1={px1}
                                                y1={py1}
                                                x2={px2}
                                                y2={py2}
                                                stroke="#22c55e"
                                                strokeWidth={0.6}
                                                strokeLinecap="round"
                                              />
                                            );
                                          })
                                        : null}
                                    </g>
                                  ))}
                                </>
                              );
                            })()}
                          </svg>
                          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>Preview: first plate layout</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>
                    Recommended: {recommendedNesting ? `${recommendedNesting.plateWidthMm} x ${recommendedNesting.plateHeightMm}` : "-"}
                  </div>
                </div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12, alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto" }}>
                  {dxfReaderSourceFiles.length > 0 ? (
                    dxfReaderSourceFiles.map((source) => (
                      <div
                        key={source.id}
                        style={{
                          border: "1px solid #334155",
                          borderRadius: 8,
                          padding: 6,
                          background: "#121826"
                        }}
                      >
                        {source.previewDataUrl ? (
                          <img
                            src={source.previewDataUrl}
                            alt={source.fileName}
                            style={{ width: "100%", height: 126, borderRadius: 6, border: "1px solid #334155", objectFit: "cover" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: 126,
                              borderRadius: 6,
                              border: "1px solid #334155",
                              background: "#0b1220",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 11,
                              opacity: 0.75
                            }}
                          >
                            No preview
                          </div>
                        )}
                        <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700 }}>{source.fileName}</div>
                        <div style={{ fontSize: 10, opacity: 0.75 }}>{source.parts.length} part type{source.parts.length === 1 ? "" : "s"}</div>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: 140,
                        borderRadius: 8,
                        border: "1px solid #334155",
                        background: "#0b1220",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        opacity: 0.7
                      }}
                    >
                      No previews
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto" }}>
                  {dxfReaderParts.length > 0 ? (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.85, marginBottom: 2 }}>
                      <input
                        type="checkbox"
                        checked={dxfReaderSelectedPartIds.length > 0 && dxfReaderSelectedPartIds.length === dxfReaderParts.length}
                        onChange={toggleSelectAllDxfReaderParts}
                      />
                      Select all ({dxfReaderSelectedPartIds.length}/{dxfReaderParts.length})
                    </label>
                  ) : null}
                  {dxfReaderSourceFiles.map((source) => (
                    <div key={`parts-${source.id}`} style={{ border: "1px solid #303238", borderRadius: 8, padding: 8, background: "#191b20" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{source.fileName}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {source.parts.map((part) => {
                          const selected = dxfReaderSelectedPartIds.includes(part.id);
                          return (
                            <div
                              key={part.id}
                              onClick={() => toggleDxfReaderPart(part.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggleDxfReaderPart(part.id);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "22px 56px 1fr",
                                gap: 8,
                                alignItems: "center",
                                background: selected ? "#1f2937" : "#1b1c1f",
                                border: selected ? "1px solid #22c55e" : "1px solid #303238",
                                borderRadius: 8,
                                color: "white",
                                padding: 6,
                                textAlign: "left",
                                cursor: "pointer"
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleDxfReaderPart(part.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 6,
                                  border: "1px solid #334155",
                                  overflow: "hidden",
                                  background: "#0b1220",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center"
                                }}
                              >
                                <img src={part.thumbnailDataUrl} alt={part.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              </div>
                              <div>
                                <input
                                  value={part.name}
                                  onChange={(e) => renameDxfReaderPart(part.id, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  style={{
                                    width: "100%",
                                    marginBottom: 4,
                                    padding: "4px 6px",
                                    borderRadius: 6,
                                    border: "1px solid #334155",
                                    background: "#0f172a",
                                    color: "white",
                                    fontSize: 12,
                                    fontWeight: 700
                                  }}
                                />
                                <div style={{ fontSize: 11, opacity: 0.75 }}>Layer: {part.layer}</div>
                                <div style={{ display: "grid", gridTemplateColumns: "90px 72px 1fr", gap: 8, alignItems: "center", marginBottom: 4 }}>
                                  <div style={{ fontSize: 11, opacity: 0.75 }}>Nest qty</div>
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={part.quantity}
                                    onChange={(e) => updateDxfReaderPartQuantity(part.id, Number(e.target.value) || 0)}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    style={{
                                      width: "100%",
                                      padding: "4px 6px",
                                      borderRadius: 6,
                                      border: "1px solid #334155",
                                      background: "#0f172a",
                                      color: "white",
                                      fontSize: 12
                                    }}
                                  />
                                  <div style={{ fontSize: 11, opacity: 0.75, textAlign: "right" }}>
                                    {part.widthMm} x {part.heightMm} mm
                                  </div>
                                </div>
                                <div style={{ fontSize: 11, opacity: 0.75 }}>
                                  Cut: {part.cutLengthMm} mm · Pierce: {part.pierceCount} · Entities: {part.segmentCount}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {source.parts.length === 0 ? (
                          <div style={{ fontSize: 11, opacity: 0.7 }}>No visible parts for current layer filter.</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            ) : null}

            {quotesPage === "pdf_reader" ? (
            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Built-in PDF Reader</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                Upload PDF drawings, auto-detect drawing shapes, split into selectable parts, then add selected parts to Laser Quote.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={(e) => {
                    void loadPdfReaderFiles(e.target.files ?? undefined);
                    e.currentTarget.value = "";
                  }}
                />
                <button
                  onClick={() => void importPdfFromDesktopPicker()}
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
                  Browse PDF
                </button>
                <button
                  onClick={toggleSelectAllPdfReaderParts}
                  disabled={pdfReaderParts.length === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#2f3136",
                    color: "white",
                    cursor: pdfReaderParts.length ? "pointer" : "not-allowed",
                    fontSize: 12
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={() => setPdfReaderSelectedPartIds([])}
                  disabled={pdfReaderSelectedPartIds.length === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#2f3136",
                    color: "white",
                    cursor: pdfReaderSelectedPartIds.length ? "pointer" : "not-allowed",
                    fontSize: 12
                  }}
                >
                  Clear Selection
                </button>
                <button
                  onClick={deleteSelectedPdfReaderParts}
                  disabled={pdfReaderSelectedPartIds.length === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: pdfReaderSelectedPartIds.length === 0 ? "#3f3f46" : "#991b1b",
                    color: "white",
                    cursor: pdfReaderSelectedPartIds.length ? "pointer" : "not-allowed",
                    fontSize: 12
                  }}
                >
                  Delete Selected
                </button>
                <button
                  onClick={clearPdfReader}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#7f1d1d",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={addSelectedPdfPartsToQuote}
                  disabled={pdfReaderSelectedPartIds.length === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #444",
                    background: "#16a34a",
                    color: "white",
                    cursor: pdfReaderSelectedPartIds.length ? "pointer" : "not-allowed",
                    fontSize: 12
                  }}
                >
                  Add Selected To Laser Parts
                </button>
              </div>
              {pdfReaderStatus ? <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>{pdfReaderStatus}</div> : null}
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
                Pages: {pdfReaderSourcePages.length} · Parts: {pdfReaderParts.length} · Selected: {pdfReaderSelectedPartIds.length}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12, alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto" }}>
                  {pdfReaderSourcePages.length > 0 ? (
                    pdfReaderSourcePages.map((page) => (
                      <div
                        key={page.id}
                        style={{
                          border: "1px solid #334155",
                          borderRadius: 8,
                          padding: 6,
                          background: "#121826"
                        }}
                      >
                        <img
                          src={page.previewDataUrl}
                          alt={`${page.fileName} page ${page.pageNumber}`}
                          style={{ width: "100%", height: 126, borderRadius: 6, border: "1px solid #334155", objectFit: "cover" }}
                        />
                        <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700 }}>{page.fileName}</div>
                        <div style={{ fontSize: 10, opacity: 0.75 }}>Page {page.pageNumber} · {page.parts.length} part type{page.parts.length === 1 ? "" : "s"}</div>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: 140,
                        borderRadius: 8,
                        border: "1px solid #334155",
                        background: "#0b1220",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        opacity: 0.7
                      }}
                    >
                      No page previews
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto" }}>
                  {pdfReaderParts.length > 0 ? (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.85, marginBottom: 2 }}>
                      <input
                        type="checkbox"
                        checked={pdfReaderSelectedPartIds.length > 0 && pdfReaderSelectedPartIds.length === pdfReaderParts.length}
                        onChange={toggleSelectAllPdfReaderParts}
                      />
                      Select all ({pdfReaderSelectedPartIds.length}/{pdfReaderParts.length})
                    </label>
                  ) : null}
                  {pdfReaderSourcePages.map((page) => (
                    <div key={`pdf-parts-${page.id}`} style={{ border: "1px solid #303238", borderRadius: 8, padding: 8, background: "#191b20" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                        {page.fileName} · Page {page.pageNumber}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {page.parts.map((part) => {
                          const selected = pdfReaderSelectedPartIds.includes(part.id);
                          return (
                            <div
                              key={part.id}
                              onClick={() => togglePdfReaderPart(part.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  togglePdfReaderPart(part.id);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "22px 56px 1fr",
                                gap: 8,
                                alignItems: "center",
                                background: selected ? "#1f2937" : "#1b1c1f",
                                border: selected ? "1px solid #22c55e" : "1px solid #303238",
                                borderRadius: 8,
                                color: "white",
                                padding: 6,
                                textAlign: "left",
                                cursor: "pointer"
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => togglePdfReaderPart(part.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 6,
                                  border: "1px solid #334155",
                                  overflow: "hidden",
                                  background: "#0b1220",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center"
                                }}
                              >
                                <img src={part.thumbnailDataUrl} alt={part.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              </div>
                              <div>
                                <input
                                  value={part.name}
                                  onChange={(e) => renamePdfReaderPart(part.id, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  style={{
                                    width: "100%",
                                    marginBottom: 4,
                                    padding: "4px 6px",
                                    borderRadius: 6,
                                    border: "1px solid #334155",
                                    background: "#0f172a",
                                    color: "white",
                                    fontSize: 12,
                                    fontWeight: 700
                                  }}
                                />
                                <div style={{ fontSize: 11, opacity: 0.75 }}>Qty detected: {part.quantity}</div>
                                <div style={{ fontSize: 11, opacity: 0.75 }}>{part.widthMm} x {part.heightMm} mm</div>
                              </div>
                            </div>
                          );
                        })}
                        {page.parts.length === 0 ? (
                          <div style={{ fontSize: 11, opacity: 0.7 }}>No drawing parts detected on this page.</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            ) : null}

            {quotesPage === "calculator" ? (
            <>
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
                  <select
                    value={quickPartThickness || String(JOB_DXF_THICKNESS_OPTIONS[0])}
                    onChange={(e) => setQuickPartThickness(e.target.value)}
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#111", color: "white" }}
                  >
                    {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value} mm
                      </option>
                    ))}
                  </select>
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
                <div style={{ minWidth: 980 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(140px, 1.4fr) minmax(96px, 1fr) repeat(10, minmax(70px, 1fr))",
                      gap: 8,
                      fontSize: 11
                    }}
                  >
                    <div style={{ textAlign: "left" }}>Part</div>
                    <div style={{ textAlign: "center" }}>DXF</div>
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
                        onClick={() => setSelectedQuotePartIndex(index)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(140px, 1.4fr) minmax(96px, 1fr) repeat(10, minmax(70px, 1fr))",
                          gap: 8,
                          alignItems: "center",
                          padding: 6,
                          borderRadius: 10,
                          background: selectedQuotePartIndex === index ? "rgba(59, 130, 246, 0.08)" : "transparent",
                          border: selectedQuotePartIndex === index ? "1px solid rgba(96, 165, 250, 0.22)" : "1px solid transparent"
                        }}
                      >
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <input
                        value={part.name}
                        onChange={(e) => updateQuotePart(index, { name: e.target.value })}
                        onKeyDown={(e) => handleCellKeyDown(e, index, 0)}
                        data-row={index}
                        data-col="name"
                        style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                      />
                      {part.partCode ? (
                        <div style={{ fontSize: 10, opacity: 0.72, paddingLeft: 2 }}>DNA: {part.partCode}</div>
                      ) : null}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4
                      }}
                    >
                      <div
                        style={{
                          width: 60,
                          height: 60,
                          borderRadius: 6,
                          border: "1px solid #334155",
                          overflow: "hidden",
                          background: "#0b1220",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        {part.thumbnailDataUrl ? (
                          <img
                            src={part.thumbnailDataUrl}
                            alt={part.dxfName ?? "DXF thumbnail"}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span style={{ fontSize: 10, opacity: 0.7 }}>No DXF</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept=".dxf"
                        onChange={(e) => {
                          void uploadQuotePartDxf(index, e.target.files?.[0]);
                          e.currentTarget.value = "";
                        }}
                        style={{ width: 92, fontSize: 10 }}
                      />
                      <button
                        type="button"
                        onClick={() => void uploadQuotePartDxfFromDesktopPicker(index)}
                        style={{
                          width: 92,
                          padding: "5px 6px",
                          borderRadius: 6,
                          border: "1px solid #444",
                          background: "#2f3136",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 10
                        }}
                      >
                        Browse DXF
                      </button>
                      <div
                        style={{
                          width: 92,
                          fontSize: 10,
                          textAlign: "center",
                          opacity: 0.75,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                        title={part.dxfName ?? ""}
                      >
                        {part.dxfName ?? "No file"}
                      </div>
                    </div>
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
                    <select
                      value={part.thicknessMm}
                      onChange={(e) => updateQuotePart(index, { thicknessMm: Number(e.target.value) || 0 })}
                      onKeyDown={(e) => handleCellKeyDown(e, index, 3)}
                      data-row={index}
                      data-col="thicknessMm"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                    >
                      {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
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
                      {formatRand(part.lineTotal)}
                    </div>
                    <button
                      onClick={() => removeQuotePart(index)}
                      style={{
                        gridColumn: "span 12",
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
                <div style={{ fontSize: 12, opacity: 0.75, display: "flex", alignItems: "center" }}>
                  <div style={{ display: "grid", gap: 12, width: "100%" }}>
                    <div>Quote sections are now built automatically from calculator data.</div>
                    <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Stock Suggestion Panel</div>
                      {activeQuoteStockPart ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ fontSize: 12, opacity: 0.78 }}>
                            {activeQuoteStockPart.name} · {activeQuoteStockPart.material} · {activeQuoteStockPart.thicknessMm}mm · {activeQuoteStockPart.lengthMm} x {activeQuoteStockPart.widthMm} mm
                          </div>
                          {stockQuoteSuggestion ? (
                            <>
                              <div style={{ fontSize: 12, color: stockQuoteSuggestion.materialRequired ? "#fca5a5" : "#86efac" }}>
                                {stockQuoteSuggestion.message}
                                {stockQuoteSuggestion.estimatedSaving > 0 ? ` · Saving ${formatRand(stockQuoteSuggestion.estimatedSaving)}` : ""}
                              </div>
                              {stockQuoteSuggestion.bestOffcut ? (
                                <div style={{ fontSize: 12, opacity: 0.82 }}>
                                  Best offcut: {stockQuoteSuggestion.bestOffcut.material} {stockQuoteSuggestion.bestOffcut.thickness}mm · {stockQuoteSuggestion.bestOffcut.width} x {stockQuoteSuggestion.bestOffcut.height} · {stockQuoteSuggestion.bestOffcut.location ?? "No location"}
                                </div>
                              ) : null}
                              {stockQuoteSuggestion.bestSheet ? (
                                <div style={{ fontSize: 12, opacity: 0.82 }}>
                                  Best full sheet: {stockQuoteSuggestion.bestSheet.material} {stockQuoteSuggestion.bestSheet.thickness}mm · {stockQuoteSuggestion.bestSheet.width} x {stockQuoteSuggestion.bestSheet.height} · Qty {stockQuoteSuggestion.bestSheet.quantity}
                                </div>
                              ) : null}
                              {stockQuoteOffcutMatch?.offcut ? (
                                <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: `1px solid ${UI.colors.border}`, background: "rgba(15, 23, 42, 0.56)", display: "grid", gap: 6 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: stockQuoteOffcutMatch.fitType === "partial" ? "#fbbf24" : "#86efac" }}>
                                    Smart Offcut: {stockQuoteOffcutMatch.message}
                                  </div>
                                  <div style={{ fontSize: 12, opacity: 0.84 }}>
                                    {stockQuoteOffcutMatch.offcut.material} {stockQuoteOffcutMatch.offcut.thickness}mm · {stockQuoteOffcutMatch.offcut.width} x {stockQuoteOffcutMatch.offcut.height} · {stockQuoteOffcutMatch.offcut.location ?? "No location"}
                                  </div>
                                  <div style={{ fontSize: 12, opacity: 0.76 }}>
                                    Fit: {stockQuoteOffcutMatch.fitType ?? "none"} · Confidence {Math.round(stockQuoteOffcutMatch.confidence * 100)}% · Waste {stockQuoteOffcutMatch.wasteArea.toFixed(0)} mm²
                                    {stockQuoteOffcutMatch.savingEstimate > 0 ? ` · Saving ${formatRand(stockQuoteOffcutMatch.savingEstimate)}` : ""}
                                  </div>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                                    <Button
                                      variant="secondary"
                                      onClick={() => {
                                        if (!stockQuoteOffcutMatch.offcut) return;
                                        void useSuggestedOffcut({
                                          offcutId: stockQuoteOffcutMatch.offcut.id,
                                          action: "reserve",
                                          quoteId: quoteNumber || null,
                                          partDnaId: activeQuoteStockPart.partDnaId ?? null,
                                          width: activeQuoteStockPart.lengthMm,
                                          height: activeQuoteStockPart.widthMm
                                        });
                                      }}
                                    >
                                      Reserve Offcut
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>No stock recommendation yet.</div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Select a quote part to check stock and offcuts.</div>
                      )}
                    </div>
                  </div>
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
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Sub total: {formatRand(laserSubTotal)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>VAT: {formatRand(laserVat)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Total: {formatRand(laserTotal)}</div>
                </div>
              </div>
            </div>

            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Laser Welding Calculator</div>
              <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 10 }}>
                Charge by weld length (meters), with rate per meter based on material + thickness.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginBottom: 12 }}>
                <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Welding Rate Table (R/m)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 70px", gap: 6, fontSize: 11 }}>
                    <div>Material</div>
                    <div>Thickness</div>
                    <div>Rate / m</div>
                    <div></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {weldingRates.map((rate) => (
                      <div
                        key={`${rate.material}-${rate.thicknessMm}`}
                        style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 70px", gap: 6, alignItems: "center" }}
                      >
                        <div style={{ fontSize: 12 }}>{rate.material}</div>
                        <div style={{ fontSize: 12 }}>{rate.thicknessMm} mm</div>
                        <div style={{ fontSize: 12 }}>{formatRand(rate.pricePerMeter)}</div>
                        <button
                          onClick={() =>
                            setWeldingRates((list) =>
                              list.filter(
                                (item) =>
                                  !(item.material === rate.material && item.thicknessMm === rate.thicknessMm)
                              )
                            )
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
                    {weldingRates.length === 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Add welding rates below.</div>
                    ) : null}
                  </div>
                </div>
                <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Add Welding Rate</div>
                  <select
                    value={newWeldingRateMaterial}
                    onChange={(e) => setNewWeldingRateMaterial(e.target.value)}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white",
                      marginBottom: 8
                    }}
                  >
                    {materials.map((material) => (
                      <option key={material.name} value={material.name}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newWeldingRateThickness || String(JOB_DXF_THICKNESS_OPTIONS[0])}
                    onChange={(e) => setNewWeldingRateThickness(e.target.value)}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white",
                      marginBottom: 8
                    }}
                  >
                    {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value} mm
                      </option>
                    ))}
                  </select>
                  <input
                    value={newWeldingRatePrice}
                    onChange={(e) => setNewWeldingRatePrice(e.target.value)}
                    placeholder="Price per meter (R)"
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
                    onClick={addWeldingRate}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: "#5865f2",
                      color: "white",
                      cursor: "pointer"
                    }}
                  >
                    Add Welding Rate
                  </button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 900 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(140px, 1.2fr) repeat(7, minmax(90px, 1fr))",
                      gap: 8,
                      fontSize: 11
                    }}
                  >
                    <div style={{ textAlign: "left" }}>Part</div>
                    <div style={{ textAlign: "center" }}>Weld mm</div>
                    <div style={{ textAlign: "center" }}>Thickness</div>
                    <div style={{ textAlign: "center" }}>Material</div>
                    <div style={{ textAlign: "center" }}>Qty</div>
                    <div style={{ textAlign: "center" }}>R/m</div>
                    <div style={{ textAlign: "center" }}>Meters</div>
                    <div style={{ textAlign: "center" }}>Price</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                    {weldCalculatedParts.map((part, index) => (
                      <div
                        key={`${part.name}-${index}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(140px, 1.2fr) repeat(7, minmax(90px, 1fr))",
                          gap: 8,
                          alignItems: "center"
                        }}
                      >
                        <input
                          value={part.name}
                          onChange={(e) => updateWeldPart(index, { name: e.target.value })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.weldLengthMm}
                          onChange={(e) => updateWeldPart(index, { weldLengthMm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <select
                          value={part.thicknessMm}
                          onChange={(e) => updateWeldPart(index, { thicknessMm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        >
                          {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <select
                          value={part.material}
                          onChange={(e) => updateWeldPart(index, { material: e.target.value })}
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
                          onChange={(e) => updateWeldPart(index, { quantity: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.pricePerMeter}
                          onChange={(e) => updateWeldPart(index, { pricePerMeter: Number(e.target.value) || 0 })}
                          placeholder="Fallback"
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {part.totalMeters.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {formatRand(part.lineTotal)}
                        </div>
                        <button
                          onClick={() => removeWeldPart(index)}
                          style={{
                            gridColumn: "span 8",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px dashed #444",
                            background: "transparent",
                            color: "#9ca3af",
                            cursor: "pointer"
                          }}
                        >
                          Remove Weld Part
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addWeldPart}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px dashed #444",
                        background: "transparent",
                        color: "#9ca3af",
                        cursor: "pointer"
                      }}
                    >
                      + Add Weld Part
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
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Laser Welding Totals</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Sub total: {formatRand(weldingSubTotal)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>VAT: {formatRand(weldingVat)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total: {formatRand(weldingTotal)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total length: {weldingTotalMeters.toFixed(2)} m</div>
                </div>
              </div>
            </div>

            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Bending Calculator</div>
              <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 10 }}>
                Bending price is based on material + thickness, with separate rates for shorter than 1m and longer than 1m.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginBottom: 12 }}>
                <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Bending Rate Table (R per bend)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px 110px 70px", gap: 6, fontSize: 11 }}>
                    <div>Material</div>
                    <div>Thickness</div>
                    <div>&lt;= 1m</div>
                    <div>&gt; 1m</div>
                    <div></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {bendingRates.map((rate) => (
                      <div
                        key={`${rate.material}-${rate.thicknessMm}`}
                        style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px 110px 70px", gap: 6, alignItems: "center" }}
                      >
                        <div style={{ fontSize: 12 }}>{rate.material}</div>
                        <div style={{ fontSize: 12 }}>{rate.thicknessMm} mm</div>
                        <div style={{ fontSize: 12 }}>{formatRand(rate.shortPricePerBend)}</div>
                        <div style={{ fontSize: 12 }}>{formatRand(rate.longPricePerBend)}</div>
                        <button
                          onClick={() =>
                            setBendingRates((list) =>
                              list.filter(
                                (item) =>
                                  !(item.material === rate.material && item.thicknessMm === rate.thicknessMm)
                              )
                            )
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
                    {bendingRates.length === 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Add bending rates below.</div>
                    ) : null}
                  </div>
                </div>
                <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Add Bending Rate</div>
                  <select
                    value={newBendingRateMaterial}
                    onChange={(e) => setNewBendingRateMaterial(e.target.value)}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white",
                      marginBottom: 8
                    }}
                  >
                    {materials.map((material) => (
                      <option key={material.name} value={material.name}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newBendingRateThickness || String(JOB_DXF_THICKNESS_OPTIONS[0])}
                    onChange={(e) => setNewBendingRateThickness(e.target.value)}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white",
                      marginBottom: 8
                    }}
                  >
                    {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value} mm
                      </option>
                    ))}
                  </select>
                  <input
                    value={newBendingShortPrice}
                    onChange={(e) => setNewBendingShortPrice(e.target.value)}
                    placeholder="<= 1m price per bend (R)"
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
                    value={newBendingLongPrice}
                    onChange={(e) => setNewBendingLongPrice(e.target.value)}
                    placeholder="> 1m price per bend (R)"
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
                    onClick={addBendingRate}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: "#5865f2",
                      color: "white",
                      cursor: "pointer"
                    }}
                  >
                    Add Bending Rate
                  </button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 980 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(140px, 1.2fr) repeat(9, minmax(90px, 1fr))",
                      gap: 8,
                      fontSize: 11
                    }}
                  >
                    <div style={{ textAlign: "left" }}>Part</div>
                    <div style={{ textAlign: "center" }}>Bend mm</div>
                    <div style={{ textAlign: "center" }}>Length Type</div>
                    <div style={{ textAlign: "center" }}>Thickness</div>
                    <div style={{ textAlign: "center" }}>Material</div>
                    <div style={{ textAlign: "center" }}>Qty</div>
                    <div style={{ textAlign: "center" }}>Bends</div>
                    <div style={{ textAlign: "center" }}>R/Bend</div>
                    <div style={{ textAlign: "center" }}>Total Bends</div>
                    <div style={{ textAlign: "center" }}>Price</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                    {bendCalculatedParts.map((part, index) => (
                      <div
                        key={`${part.name}-${index}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(140px, 1.2fr) repeat(9, minmax(90px, 1fr))",
                          gap: 8,
                          alignItems: "center"
                        }}
                      >
                        <input
                          value={part.name}
                          onChange={(e) => updateBendPart(index, { name: e.target.value })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.bendLengthMm}
                          onChange={(e) => updateBendPart(index, { bendLengthMm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {part.isLong ? "> 1m" : "<= 1m"}
                        </div>
                        <select
                          value={part.thicknessMm}
                          onChange={(e) => updateBendPart(index, { thicknessMm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        >
                          {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <select
                          value={part.material}
                          onChange={(e) => updateBendPart(index, { material: e.target.value })}
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
                          onChange={(e) => updateBendPart(index, { quantity: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.bendCount}
                          onChange={(e) => updateBendPart(index, { bendCount: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {formatRand(part.effectivePricePerBend)}
                        </div>
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {part.totalBends}
                        </div>
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {formatRand(part.lineTotal)}
                        </div>
                        <div style={{ gridColumn: "span 10", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          <input
                            value={part.shortPricePerBend}
                            onChange={(e) => updateBendPart(index, { shortPricePerBend: Number(e.target.value) || 0 })}
                            placeholder="Fallback <=1m R/bend"
                            style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                          />
                          <input
                            value={part.longPricePerBend}
                            onChange={(e) => updateBendPart(index, { longPricePerBend: Number(e.target.value) || 0 })}
                            placeholder="Fallback >1m R/bend"
                            style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                          />
                          <button
                            onClick={() => removeBendPart(index)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px dashed #444",
                              background: "transparent",
                              color: "#9ca3af",
                              cursor: "pointer"
                            }}
                          >
                            Remove Bend Part
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={addBendPart}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px dashed #444",
                        background: "transparent",
                        color: "#9ca3af",
                        cursor: "pointer"
                      }}
                    >
                      + Add Bend Part
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
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Bending Totals</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Sub total: {formatRand(bendingSubTotal)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>VAT: {formatRand(bendingVat)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total: {formatRand(bendingTotal)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total bends: {bendingTotalBends.toFixed(0)}</div>
                </div>
              </div>
            </div>

            <div style={{ background: "#232428", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Rolling Calculator</div>
              <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 10 }}>
                Enter diameter + height to auto-calculate rolling length, plate size (m²), weight (kg), and price.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginBottom: 12 }}>
                <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Rolling Rate Table (R/m)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 70px", gap: 6, fontSize: 11 }}>
                    <div>Material</div>
                    <div>Thickness</div>
                    <div>Rate / m</div>
                    <div></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {rollingRates.map((rate) => (
                      <div
                        key={`${rate.material}-${rate.thicknessMm}`}
                        style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 70px", gap: 6, alignItems: "center" }}
                      >
                        <div style={{ fontSize: 12 }}>{rate.material}</div>
                        <div style={{ fontSize: 12 }}>{rate.thicknessMm} mm</div>
                        <div style={{ fontSize: 12 }}>{formatRand(rate.pricePerMeter)}</div>
                        <button
                          onClick={() =>
                            setRollingRates((list) =>
                              list.filter(
                                (item) =>
                                  !(item.material === rate.material && item.thicknessMm === rate.thicknessMm)
                              )
                            )
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
                    {rollingRates.length === 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Add rolling rates below.</div>
                    ) : null}
                  </div>
                </div>
                <div style={{ background: "#1b1c1f", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Add Rolling Rate</div>
                  <select
                    value={newRollingRateMaterial}
                    onChange={(e) => setNewRollingRateMaterial(e.target.value)}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white",
                      marginBottom: 8
                    }}
                  >
                    {materials.map((material) => (
                      <option key={material.name} value={material.name}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newRollingRateThickness || String(JOB_DXF_THICKNESS_OPTIONS[0])}
                    onChange={(e) => setNewRollingRateThickness(e.target.value)}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white",
                      marginBottom: 8
                    }}
                  >
                    {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value} mm
                      </option>
                    ))}
                  </select>
                  <input
                    value={newRollingRatePrice}
                    onChange={(e) => setNewRollingRatePrice(e.target.value)}
                    placeholder="Price per meter (R)"
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
                    onClick={addRollingRate}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #444",
                      background: "#5865f2",
                      color: "white",
                      cursor: "pointer"
                    }}
                  >
                    Add Rolling Rate
                  </button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 900 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(140px, 1.2fr) repeat(11, minmax(85px, 1fr))",
                      gap: 8,
                      fontSize: 11
                    }}
                  >
                    <div style={{ textAlign: "left" }}>Part</div>
                    <div style={{ textAlign: "center" }}>Dia mm</div>
                    <div style={{ textAlign: "center" }}>Height mm</div>
                    <div style={{ textAlign: "center" }}>Rolling mm</div>
                    <div style={{ textAlign: "center" }}>Thickness</div>
                    <div style={{ textAlign: "center" }}>Material</div>
                    <div style={{ textAlign: "center" }}>Qty</div>
                    <div style={{ textAlign: "center" }}>R/m</div>
                    <div style={{ textAlign: "center" }}>Meters</div>
                    <div style={{ textAlign: "center" }}>m²</div>
                    <div style={{ textAlign: "center" }}>kg</div>
                    <div style={{ textAlign: "center" }}>Price</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                    {rollingCalculatedParts.map((part, index) => (
                      <div
                        key={`${part.name}-${index}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(140px, 1.2fr) repeat(11, minmax(85px, 1fr))",
                          gap: 8,
                          alignItems: "center"
                        }}
                      >
                        <input
                          value={part.name}
                          onChange={(e) => updateRollingPart(index, { name: e.target.value })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.diameterMm}
                          onChange={(e) => updateRollingPart(index, { diameterMm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.heightMm}
                          onChange={(e) => updateRollingPart(index, { heightMm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.rollingLengthMm}
                          onChange={(e) => updateRollingPart(index, { rollingLengthMm: Number(e.target.value) || 0 })}
                          placeholder="Auto if 0"
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <select
                          value={part.thicknessMm}
                          onChange={(e) => updateRollingPart(index, { thicknessMm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        >
                          {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <select
                          value={part.material}
                          onChange={(e) => updateRollingPart(index, { material: e.target.value })}
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
                          onChange={(e) => updateRollingPart(index, { quantity: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <input
                          value={part.pricePerMeter}
                          onChange={(e) => updateRollingPart(index, { pricePerMeter: Number(e.target.value) || 0 })}
                          placeholder="Fallback"
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        />
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {part.totalMeters.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {part.totalAreaSqm.toFixed(3)}
                        </div>
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {part.totalWeightKg.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {formatRand(part.lineTotal)}
                        </div>
                        <button
                          onClick={() => removeRollingPart(index)}
                          style={{
                            gridColumn: "span 12",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px dashed #444",
                            background: "transparent",
                            color: "#9ca3af",
                            cursor: "pointer"
                          }}
                        >
                          Remove Rolling Part
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addRollingPart}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px dashed #444",
                        background: "transparent",
                        color: "#9ca3af",
                        cursor: "pointer"
                      }}
                    >
                      + Add Rolling Part
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
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Rolling Totals</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Sub total: {formatRand(rollingSubTotal)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>VAT: {formatRand(rollingVat)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total: {formatRand(rollingTotal)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total length: {rollingTotalMeters.toFixed(2)} m</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Plate size: {rollingTotalAreaSqm.toFixed(3)} m²</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total weight: {rollingTotalWeightKg.toFixed(2)} kg</div>
                </div>
              </div>
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
                        <select
                          value={part.thicknessMm}
                          onChange={(e) => updatePunchPart(index, { thicknessMm: Number(e.target.value) || 0 })}
                          style={{ padding: 6, borderRadius: 6, border: "1px solid #333", background: "#111", color: "white" }}
                        >
                          {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
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
                          {formatRand(part.lineTotal)}
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
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Sub total: {formatRand(punchPartsTotal)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>VAT: {formatRand(punchPartsVat)}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total: {formatRand(punchPartsFinal)}</div>
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
                  <select
                    value={newThicknessMm || String(JOB_DXF_THICKNESS_OPTIONS[0])}
                    onChange={(e) => setNewThicknessMm(e.target.value)}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white",
                      marginBottom: 8
                    }}
                  >
                    {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value} mm
                      </option>
                    ))}
                  </select>
                  <input
                    value={newThicknessRate}
                    onChange={(e) => setNewThicknessRate(e.target.value)}
                    placeholder="Price per m² (R)"
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
              <button
                onClick={createQuote}
                style={{
                  width: "100%",
                  marginBottom: 12,
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid #444",
                  background: "#16a34a",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 700
                }}
              >
                Create Quote
              </button>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Use the left Quotes panel to open <strong>Recent Quotes</strong>.
              </div>
            </div>
            </>
            ) : null}
            {quotesPage === "recent_quotes" ? (
            <div style={{ background: "#232428", borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent Quotes</div>
              <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 12 }}>
                Customer name on top, all quotes listed below. Click any quote to preview it on the right.
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                  {groupedRecentQuotes.map(([customerName, customerQuotes]) => (
                    <div key={customerName} style={{ background: "#1f2024", borderRadius: 12, padding: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 10 }}>{customerName}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {customerQuotes.map((quote) => (
                          <div
                            key={quote.id}
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
                                Preview
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void printQuotePdf(quote.id);
                                }}
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
                                Print Quote
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void createAutoJobCardFromQuote(quote);
                                }}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  border: "1px solid #166534",
                                  background: "#166534",
                                  color: "white",
                                  cursor: "pointer",
                                  fontSize: 12,
                                  fontWeight: 700
                                }}
                              >
                                Create Auto Job Card
                              </button>
                              {quote.status === "accepted" ? (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void printInvoicePdf(quote.id);
                                  }}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 6,
                                    border: "1px solid #444",
                                    background: "#0ea5e9",
                                    color: "white",
                                    cursor: "pointer",
                                    fontSize: 12
                                  }}
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
                  {groupedRecentQuotes.length === 0 ? <div style={{ fontSize: 12, opacity: 0.65 }}>No quotes yet.</div> : null}
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
                            void createAutoJobCardFromQuote(selectedRecentQuote);
                          }}
                          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #14532d", background: "#14532d", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                        >
                          Create Auto Job Card
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
                          title={`quote-preview-${selectedRecentQuote.id}`}
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
              </div>
            </div>
          </div>

  );
}
