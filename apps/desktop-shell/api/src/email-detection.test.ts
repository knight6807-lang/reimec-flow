import test from "node:test";
import assert from "node:assert/strict";
import { classifyEmailContent, detectAttachmentType } from "./email-detection.js";

test("quote request with DXF attachment is strong quote_request", () => {
  const result = classifyEmailContent({
    subject: "RFQ for laser cutting",
    bodyText: "Please quote attached DXF. Stainless steel 2mm qty 4.",
    attachmentNames: ["part-a.dxf"],
    attachmentTypes: ["dxf"]
  });
  assert.equal(result.detectedType, "quote_request");
  assert.ok(result.detectionConfidence >= 70);
});

test("quote request without attachment is possible quote_request", () => {
  const result = classifyEmailContent({
    subject: "Can you quote this job?",
    bodyText: "Need pricing for mild steel 3mm brackets qty 10."
  });
  assert.equal(result.detectedType, "possible_quote_or_po");
  assert.ok(result.detectionConfidence >= 40);
});

test("purchase order with PO PDF is strong purchase_order", () => {
  const result = classifyEmailContent({
    subject: "Purchase Order PO-20431",
    bodyText: "Please proceed with the approved quote.",
    attachmentNames: ["PO-20431.pdf"],
    attachmentTypes: ["purchase_order_pdf"]
  });
  assert.equal(result.detectedType, "purchase_order");
  assert.equal(result.extractedPoNumber, "20431");
});

test("approved quote email is purchase_order", () => {
  const result = classifyEmailContent({
    subject: "Approved quote",
    bodyText: "Approved quote Q-2026-019. Please proceed."
  });
  assert.equal(result.detectedType, "purchase_order");
});

test("normal newsletter is unknown or normal", () => {
  const result = classifyEmailContent({
    subject: "Monthly newsletter",
    bodyText: "This month we launched new products and promotions."
  });
  assert.ok(result.detectedType === "normal_email" || result.detectedType === "unknown");
});

test("email with both quote and po words needs review unless po number found", () => {
  const review = classifyEmailContent({
    subject: "Quote and order update",
    bodyText: "Please quote this item and confirm the order."
  });
  assert.equal(review.detectedType, "needs_review");

  const po = classifyEmailContent({
    subject: "Quote and order update",
    bodyText: "Approved quote Q-2026-019. PO 45122 attached."
  });
  assert.equal(po.detectedType, "purchase_order");
});

test("attachment type detection covers DXF and purchase-order PDF", () => {
  assert.equal(detectAttachmentType("part-a.dxf", "application/octet-stream"), "dxf");
  assert.equal(detectAttachmentType("PO-45122.pdf", "application/pdf"), "purchase_order_pdf");
});
