import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canManageManualSubscriptions,
  getSubscriptionRole,
  openManualSubscriptionDatabase
} from "./manual-subscriptions.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-manual-subscriptions-"));
}

test("company gets unique payment reference", () => {
  const dir = makeTempDir();
  const service = openManualSubscriptionDatabase(dir);
  const first = service.ensureCompany({ id: "company-1", companyName: "Reimec Flow" });
  const second = service.ensureCompany({ id: "company-2", companyName: "Reimec Flow" });
  assert.match(first.manualPaymentReference, /^QX-REIMEC-\d{4}-\d{4}$/);
  assert.notEqual(first.manualPaymentReference, second.manualPaymentReference);
});

test("expired account locks premium features after grace ends", () => {
  const dir = makeTempDir();
  const service = openManualSubscriptionDatabase(dir);
  service.ensureCompany({ id: "company-1", companyName: "Locked Co" });
  const db = (service as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db;
  db.prepare(
    `UPDATE companies
     SET subscriptionStatus = 'expired',
         subscriptionEndDate = ?,
         graceUntil = ?,
         updatedAt = ? 
     WHERE id = ?`
  ).run("2025-01-01T00:00:00.000Z", "2025-01-04T00:00:00.000Z", new Date().toISOString(), "company-1");
  const snapshot = service.getSubscriptionSnapshot("company-1");
  assert.equal(snapshot?.status, "expired");
  assert.equal(snapshot?.hasAccess, false);
  assert.equal(snapshot?.limitedAccess, false);
});

test("active account unlocks features and grace period allows temporary access", () => {
  const dir = makeTempDir();
  const service = openManualSubscriptionDatabase(dir);
  service.ensureCompany({ id: "company-1", companyName: "Active Co" });
  const renewed = service.renewCompany("company-1", 1, "manual renewal");
  assert.equal(renewed?.status, "active");
  assert.equal(renewed?.hasAccess, true);

  service.updateCompanyStatus("company-1", "expired", "grace test");
  const graceSnapshot = service.getSubscriptionSnapshot("company-1");
  assert.equal(graceSnapshot?.status, "expired");
  assert.equal(graceSnapshot?.hasAccess, true);
  assert.equal(graceSnapshot?.limitedAccess, true);
});

test("admin renew 1 month extends expiry and writes audit log", () => {
  const dir = makeTempDir();
  const service = openManualSubscriptionDatabase(dir);
  const company = service.ensureCompany({ id: "company-1", companyName: "Renew Co" });
  const before = company.subscriptionEndDate;
  const renewed = service.renewCompany("company-1", 1, "renew one month");
  assert.ok(renewed?.company.subscriptionEndDate);
  assert.notEqual(renewed?.company.subscriptionEndDate, before);
  const audit = service.listAuditLog("company-1");
  assert.equal(audit[0]?.action, "renew_1_months");
});

test("payment proof creates pending manual payment", () => {
  const dir = makeTempDir();
  const service = openManualSubscriptionDatabase(dir);
  const company = service.ensureCompany({ id: "company-1", companyName: "Proof Co" });
  const payment = service.createManualPayment({
    companyId: company.id,
    paymentReference: company.manualPaymentReference,
    amount: 999,
    paymentMethod: "eft",
    proofFilePath: "/tmp/proof.pdf",
    notes: "Uploaded proof"
  });
  assert.equal(payment?.confirmedByAdmin, false);
  assert.equal(service.listManualPayments(company.id).length, 1);
});

test("normal user cannot renew account", () => {
  const role = getSubscriptionRole({ isMainAdmin: false, membershipRole: "member" });
  assert.equal(role, "operator");
  assert.equal(canManageManualSubscriptions(role), false);
});

test("audit log is written on suspend and cancel", () => {
  const dir = makeTempDir();
  const service = openManualSubscriptionDatabase(dir);
  service.ensureCompany({ id: "company-1", companyName: "Audit Co" });
  service.updateCompanyStatus("company-1", "suspended", "hold");
  service.updateCompanyStatus("company-1", "cancelled", "cancelled");
  const audit = service.listAuditLog("company-1");
  assert.equal(audit[0]?.action, "status_cancelled");
  assert.equal(audit[1]?.action, "status_suspended");
});
