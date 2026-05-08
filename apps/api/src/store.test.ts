import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  JsonFileStoreRepository,
  addMembership,
  createSession,
  getSession,
  getStoreRepository,
  getUserWorkspaces,
  getWorkspace,
  setStoreRepository,
  upsertUser,
  type StoreRepository
} from "./store.js";

function makeTempDataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qouterx-store-"));
  return path.join(dir, "data.json");
}

function withTempRepository(fn: () => void) {
  const previousRepository: StoreRepository = getStoreRepository();
  setStoreRepository(new JsonFileStoreRepository(makeTempDataPath()));
  try {
    fn();
  } finally {
    setStoreRepository(previousRepository);
  }
}

test("getWorkspace applies default structures through the repository layer", () => {
  withTempRepository(() => {
    const workspace = getWorkspace("ws-defaults");
    assert.equal(workspace.id, "ws-defaults");
    assert.equal(workspace.servers.length, 1);
    assert.equal(workspace.jobs.length, 0);
    assert.equal(workspace.quotes.length, 0);
    assert.deepEqual(workspace.syncState, {});
    assert.equal(workspace.emailSettings?.autoNotifyJobDone, true);
  });
});

test("membership and session lookups delegate through the active repository", () => {
  withTempRepository(() => {
    upsertUser({
      id: "user-1",
      email: "owner@example.com",
      provider: "local",
      createdAt: new Date().toISOString()
    });
    createSession({
      token: "session-1",
      userId: "user-1",
      createdAt: new Date().toISOString()
    });
    getWorkspace("ws-membership");
    addMembership({ userId: "user-1", workspaceId: "ws-membership", role: "owner" });

    const workspaces = getUserWorkspaces("user-1");
    const session = getSession("session-1");

    assert.equal(workspaces.length, 1);
    assert.equal(workspaces[0]?.id, "ws-membership");
    assert.equal(session?.userId, "user-1");
  });
});
