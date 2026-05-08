import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openCloudSubscriptionDatabase } from "./cloud-subscriptions.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-cloud-subscriptions-"));
}

test("creates unique payment reference and pending account request", () => {
  const root = makeTempRoot();
  const db = openCloudSubscriptionDatabase(root);
  const first = db.createAccountRequest({
    companyName: "Reimec",
    contactName: "Shaun",
    email: "shaun@example.com",
    phone: "012",
    deviceId: "device-1",
    deviceName: "Office Mac",
    platform: "macos"
  });
  const second = db.createAccountRequest({
    companyName: "Another Co",
    contactName: "Boeta",
    email: "boeta@example.com",
    phone: "013",
    deviceId: "device-2",
    deviceName: "Shop Floor PC",
    platform: "windows"
  });
  assert.match(first.company.manualPaymentReference, /^QX-/);
  assert.notEqual(first.company.manualPaymentReference, second.company.manualPaymentReference);
  assert.equal(first.request.status, "pending");
});

test("approve account request activates company and allows device", () => {
  const root = makeTempRoot();
  const db = openCloudSubscriptionDatabase(root);
  const created = db.createAccountRequest({
    companyName: "Reimec",
    contactName: "Shaun",
    email: "shaun@example.com",
    phone: "012",
    deviceId: "device-1",
    deviceName: "Office Mac",
    platform: "macos"
  });
  const approved = db.approveAccountRequest(created.request.id, "owner@qouterx.test", 1);
  assert.ok(approved);
  const snapshot = db.getSubscriptionStatusByDevice("device-1");
  assert.equal(snapshot.status, "active");
  assert.equal(snapshot.hasAccess, true);
  assert.equal(snapshot.device?.isAllowed, true);
});

test("suspend and renew update audit-backed lifecycle", () => {
  const root = makeTempRoot();
  const db = openCloudSubscriptionDatabase(root);
  const created = db.createAccountRequest({
    companyName: "Reimec",
    contactName: "Shaun",
    email: "shaun@example.com",
    phone: "012",
    deviceId: "device-1",
    deviceName: "Office Mac",
    platform: "macos"
  });
  db.approveAccountRequest(created.request.id, "owner@qouterx.test", 1);
  const suspended = db.setCompanyStatus(created.company.id, "suspended", "late payment");
  assert.equal(suspended?.subscriptionStatus, "suspended");
  const renewed = db.renewCompany(created.company.id, 3, "manual renewal");
  assert.equal(renewed?.subscriptionStatus, "active");
  const audit = db.listAuditLog(created.company.id);
  assert.ok(audit.some((entry) => entry.action === "status_suspended"));
  assert.ok(audit.some((entry) => entry.action === "renew_3_months"));
});
