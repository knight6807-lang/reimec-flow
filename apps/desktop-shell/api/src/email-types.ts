export type EmailDetectedType =
  | "unknown"
  | "normal_email"
  | "quote_request"
  | "purchase_order"
  | "possible_quote_or_po"
  | "needs_review";

export type EmailAttachmentType =
  | "dxf"
  | "dwg"
  | "pdf"
  | "excel"
  | "word"
  | "image"
  | "purchase_order_pdf"
  | "quote_request_document"
  | "unknown";

export type EmailDetectionResult = {
  detectedType: EmailDetectedType;
  detectionConfidence: number;
  detectionReasons: string[];
  quoteScore: number;
  purchaseOrderScore: number;
  extractedPoNumber?: string | null;
  extractedQuoteReference?: string | null;
  extractedMaterial?: string | null;
  extractedThicknessMm?: number | null;
  extractedQuantity?: number | null;
};

export type StoredEmailAttachment = {
  id: number;
  emailId: number;
  graphAttachmentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  localPath?: string | null;
  attachmentType: EmailAttachmentType;
  importedToDxfReader: boolean;
  createdAt: string;
};

export type StoredEmailMessage = {
  id: number;
  graphMessageId: string;
  folder: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  sentAt?: string | null;
  bodyPreview: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  hasAttachments: boolean;
  isRead: boolean;
  importance?: string | null;
  detectedType: EmailDetectedType;
  detectionConfidence: number;
  detectionReasons: string[];
  extractedPoNumber?: string | null;
  extractedQuoteReference?: string | null;
  extractedMaterial?: string | null;
  extractedThicknessMm?: number | null;
  extractedQuantity?: number | null;
  customerId?: number | null;
  quoteId?: string | null;
  purchaseOrderId?: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: StoredEmailAttachment[];
};

export type GraphAttachmentInput = {
  graphAttachmentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  attachmentType: EmailAttachmentType;
};

export type GraphMessageInput = {
  graphMessageId: string;
  folder: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  sentAt?: string | null;
  bodyPreview: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  hasAttachments: boolean;
  isRead: boolean;
  importance?: string | null;
  detection: EmailDetectionResult;
  attachments: GraphAttachmentInput[];
};
