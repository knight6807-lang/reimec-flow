import type { EmailAttachmentType, EmailDetectionResult, EmailDetectedType } from "./email-types.js";

export type EmailDetectionInput = {
  subject?: string;
  bodyText?: string;
  senderEmail?: string;
  knownCustomer?: boolean;
  attachmentNames?: string[];
  attachmentTypes?: EmailAttachmentType[];
};

const QUOTE_SUBJECT_RULES: Array<{ pattern: RegExp; score: number; reason: string }> = [
  { pattern: /\b(?:quote|quotation|quotations|pricing|price|estimate|rfq|request\s+for\s+quote|please\s+quote|tender)\b/i, score: 25, reason: "Subject contains quote/RFQ language" }
];

const QUOTE_BODY_RULES: Array<{ pattern: RegExp; score: number; reason: string }> = [
  { pattern: /\b(?:please\s+quote|can\s+you\s+quote|send\s+price|need\s+pricing|request\s+for\s+quote)\b/i, score: 30, reason: "Body contains quote request phrase" },
  { pattern: /\b(?:attached\s+dxf|attached\s+drawing|laser\s+cutting|cutting\s+required)\b/i, score: 20, reason: "Body references drawings or cutting work" },
  { pattern: /\b(?:stainless|mild\s+steel|aluminium|aluminum|thickness|qty|quantity)\b/i, score: 10, reason: "Body includes material, thickness, or quantity signals" }
];

const PO_SUBJECT_RULES: Array<{ pattern: RegExp; score: number; reason: string }> = [
  { pattern: /\b(?:purchase\s+order|official\s+order|order\s+confirmation)\b/i, score: 35, reason: "Subject contains purchase-order language" },
  { pattern: /\bPO[-\s#:]*[A-Z0-9]{3,}\b/i, score: 35, reason: "Subject includes a PO number" }
];

const PO_BODY_RULES: Array<{ pattern: RegExp; score: number; reason: string }> = [
  { pattern: /\b(?:purchase\s+order|po\s+number|order\s+number|please\s+proceed|accepted\s+quote|approved\s+quote|deliver\s+to)\b/i, score: 35, reason: "Body contains purchase-order language" },
  { pattern: /\b(?:invoice|official\s+order)\b/i, score: 12, reason: "Body includes invoice/order confirmation language" }
];

const QUOTE_REF_PATTERN = /\bQ[-\s]?\d{4,}(?:[-/]\d+)?\b/i;
const PO_NUMBER_PATTERN = /\b(?:PO|P\/O|PURCHASE\s+ORDER)[-\s#:]*([A-Z0-9][A-Z0-9\-\/]{2,})\b/i;
const THICKNESS_PATTERN = /\b(\d{1,2}(?:\.\d+)?)\s*mm\b/i;
const QUANTITY_PATTERN = /\b(?:qty|quantity)\s*[:\-]?\s*(\d+)\b/i;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueReasons(reasons: string[]) {
  return Array.from(new Set(reasons));
}

export function detectAttachmentType(fileName: string, contentType = ""): EmailAttachmentType {
  const lowerName = fileName.trim().toLowerCase();
  const lowerType = contentType.trim().toLowerCase();
  if (lowerName.endsWith(".dxf") || lowerType.includes("dxf")) return "dxf";
  if (lowerName.endsWith(".dwg") || lowerType.includes("dwg")) return "dwg";
  if (lowerName.endsWith(".pdf") || lowerType.includes("pdf")) {
    if (/\b(?:po|purchase[_\s-]*order|official[_\s-]*order|order)\b/i.test(lowerName)) return "purchase_order_pdf";
    if (/\b(?:quote|quotation|rfq|drawing)\b/i.test(lowerName)) return "quote_request_document";
    return "pdf";
  }
  if (/\.(xlsx?|csv)$/i.test(lowerName) || lowerType.includes("spreadsheet") || lowerType.includes("excel")) return "excel";
  if (/\.(docx?)$/i.test(lowerName) || lowerType.includes("wordprocessingml") || lowerType.includes("msword")) return "word";
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lowerName) || lowerType.startsWith("image/")) return "image";
  return "unknown";
}

export function classifyEmailContent(input: EmailDetectionInput): EmailDetectionResult {
  const subject = input.subject?.trim() ?? "";
  const bodyText = input.bodyText?.trim() ?? "";
  const combined = `${subject}\n${bodyText}`.trim();
  const reasons: string[] = [];
  let quoteScore = 0;
  let purchaseOrderScore = 0;

  for (const rule of QUOTE_SUBJECT_RULES) {
    if (rule.pattern.test(subject)) {
      quoteScore += rule.score;
      reasons.push(rule.reason);
    }
  }
  for (const rule of QUOTE_BODY_RULES) {
    if (rule.pattern.test(bodyText)) {
      quoteScore += rule.score;
      reasons.push(rule.reason);
    }
  }
  for (const rule of PO_SUBJECT_RULES) {
    if (rule.pattern.test(subject)) {
      purchaseOrderScore += rule.score;
      reasons.push(rule.reason);
    }
  }
  for (const rule of PO_BODY_RULES) {
    if (rule.pattern.test(bodyText)) {
      purchaseOrderScore += rule.score;
      reasons.push(rule.reason);
    }
  }

  const attachmentTypes = input.attachmentTypes ?? [];
  const attachmentNames = input.attachmentNames ?? [];
  if (attachmentTypes.some((type) => type === "dxf" || type === "dwg")) {
    quoteScore += 25;
    reasons.push("DXF/DWG attachment detected");
  }
  if (attachmentTypes.some((type) => type === "quote_request_document" || type === "pdf" || type === "excel")) {
    quoteScore += 15;
    reasons.push("Drawing/quote attachment detected");
  }
  if (attachmentTypes.some((type) => type === "purchase_order_pdf")) {
    purchaseOrderScore += 25;
    reasons.push("Purchase-order PDF attachment detected");
  }
  if (attachmentNames.some((name) => /\b(?:po|purchase[_\s-]*order|official[_\s-]*order|approved[_\s-]*quote)\b/i.test(name))) {
    purchaseOrderScore += 20;
    reasons.push("Attachment filename suggests a purchase order");
  }

  if (input.knownCustomer) {
    quoteScore += 5;
    purchaseOrderScore += 5;
    reasons.push("Known customer matched");
  }

  const poMatch = combined.match(PO_NUMBER_PATTERN);
  if (poMatch) {
    purchaseOrderScore += 25;
    reasons.push("PO number extracted");
  }

  if (/\b(?:approved\s+quote|accepted\s+quote|please\s+proceed)\b/i.test(combined)) {
    purchaseOrderScore += 20;
    reasons.push("Approved quote / proceed language detected");
  }

  if (quoteScore >= 30 && /\border\b/i.test(combined) && !poMatch && purchaseOrderScore < 40) {
    purchaseOrderScore = 40;
    reasons.push("Order language conflicts with quote language");
  }

  const quoteRefMatch = combined.match(QUOTE_REF_PATTERN);
  if (quoteRefMatch) {
    purchaseOrderScore += 20;
    reasons.push("Quote reference detected");
  }

  let detectedType: EmailDetectedType = "unknown";
  let confidence = 0;
  if (purchaseOrderScore >= 65 && (poMatch || /approved\s+quote|please\s+proceed/i.test(combined))) {
    detectedType = "purchase_order";
    confidence = purchaseOrderScore;
  } else if (quoteScore >= 70 && purchaseOrderScore < 70) {
    detectedType = "quote_request";
    confidence = quoteScore;
  } else if (quoteScore >= 40 && purchaseOrderScore >= 40) {
    detectedType = poMatch ? "purchase_order" : "needs_review";
    confidence = Math.max(quoteScore, purchaseOrderScore);
  } else if (quoteScore >= 40 || purchaseOrderScore >= 40) {
    detectedType = "possible_quote_or_po";
    confidence = Math.max(quoteScore, purchaseOrderScore);
  } else if (subject || bodyText) {
    detectedType = "normal_email";
    confidence = Math.max(quoteScore, purchaseOrderScore);
  }

  const thicknessMatch = combined.match(THICKNESS_PATTERN);
  const quantityMatch = combined.match(QUANTITY_PATTERN);
  let extractedMaterial: string | null = null;
  if (/\bstainless(?:\s+steel)?|ss\s*304|ss\s*316\b/i.test(combined)) extractedMaterial = "Stainless Steel";
  else if (/\bmild\s+steel|\bms\b/i.test(combined)) extractedMaterial = "Mild Steel";
  else if (/\baluminium|aluminum\b/i.test(combined)) extractedMaterial = "Aluminium";

  return {
    detectedType,
    detectionConfidence: clampScore(confidence),
    detectionReasons: uniqueReasons(reasons),
    quoteScore: clampScore(quoteScore),
    purchaseOrderScore: clampScore(purchaseOrderScore),
    extractedPoNumber: poMatch?.[1]?.replace(/^PO[-\s]*/i, "") ?? null,
    extractedQuoteReference: quoteRefMatch?.[0] ?? null,
    extractedMaterial,
    extractedThicknessMm: thicknessMatch ? Number(thicknessMatch[1]) : null,
    extractedQuantity: quantityMatch ? Number(quantityMatch[1]) : null
  };
}

export function scoreNearMatch(input: {
  widthA: number;
  heightA: number;
  widthB: number;
  heightB: number;
  cutLengthA: number;
  cutLengthB: number;
  pierceCountA: number;
  pierceCountB: number;
  holeCountA: number;
  holeCountB: number;
}) {
  const dimDelta =
    Math.abs(input.widthA - input.widthB) +
    Math.abs(input.heightA - input.heightB);
  const cutDelta = Math.abs(input.cutLengthA - input.cutLengthB);
  const pierceDelta = Math.abs(input.pierceCountA - input.pierceCountB);
  const holeDelta = Math.abs(input.holeCountA - input.holeCountB);
  const dimScore = Math.max(0, 40 - dimDelta * 4);
  const cutScore = Math.max(0, 30 - cutDelta * 0.02);
  const pierceScore = Math.max(0, 15 - pierceDelta * 6);
  const holeScore = Math.max(0, 15 - holeDelta * 8);
  return clampScore(dimScore + cutScore + pierceScore + holeScore);
}
