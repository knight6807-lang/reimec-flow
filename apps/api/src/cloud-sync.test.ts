import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openCloudSyncDatabase } from "./cloud-sync.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-cloud-sync-"));
}

test("cloud sync queues and sends pending events", async () => {
  const dir = makeTempDir();
  const service = openCloudSyncDatabase(dir);
  service.saveSettings({
    enabled: true,
    companyId: "company-1",
    deviceName: "Laptop A",
    role: "admin",
    adminMode: true
  });
  const eventId = service.pushEvent({
    eventType: "app_started",
    payload: { device: "Laptop A" }
  });
  assert.equal(typeof eventId, "number");
  const before = service.listEvents();
  assert.equal(before[0]?.status, "pending");
  const result = await service.syncPendingEvents();
  assert.equal(result.skipped, false);
  assert.equal(result.sent, 1);
  const after = service.listEvents();
  assert.equal(after[0]?.status, "sent");
});

test("cloud dashboard returns registered devices and recent events", async () => {
  const dir = makeTempDir();
  const service = openCloudSyncDatabase(dir);
  await service.registerDevice({
    deviceId: "device-1",
    deviceName: "Laptop A",
    userName: "admin@qouterx.com",
    role: "admin"
  });
  service.pushEvent({
    eventType: "quote_created",
    payload: { quoteNumber: "Q-1" }
  });
  const dashboard = service.getCompanyDashboard();
  assert.equal(dashboard.devices.length, 1);
  assert.equal(dashboard.recentEvents.length, 1);
});
