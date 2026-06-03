import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { IntegrationAuthManager } from "../auth.js";
import { ensureIntegrationTables } from "../storage.js";

vi.mock("../../../utils/logger.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("IntegrationAuthManager — WORK4-003 regression", () => {
  let db: Database.Database;
  const originalEnv = process.env.TELETON_INTEGRATIONS_KEY;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    ensureIntegrationTables(db);
    db.prepare(
      `INSERT INTO integrations (id, name, type, provider) VALUES ('svc', 'Test', 'api', 'custom-http')`
    ).run();
    delete process.env.TELETON_INTEGRATIONS_KEY;
  });

  afterEach(() => {
    db.close();
    if (originalEnv !== undefined) {
      process.env.TELETON_INTEGRATIONS_KEY = originalEnv;
    } else {
      delete process.env.TELETON_INTEGRATIONS_KEY;
    }
  });

  it("does not persist the integrations AES key inside memory.db by default", () => {
    process.env.TELETON_INTEGRATIONS_KEY = "";
    new IntegrationAuthManager(db);
    const row = db
      .prepare("SELECT value FROM security_settings WHERE key = 'integration_credentials_key'")
      .get();
    expect(row).toBeUndefined();
  });

  it("does not persist the AES key when TELETON_INTEGRATIONS_KEY is unset", () => {
    new IntegrationAuthManager(db);
    const row = db
      .prepare("SELECT value FROM security_settings WHERE key = 'integration_credentials_key'")
      .get();
    expect(row).toBeUndefined();
  });

  it("encrypts and decrypts credentials using an explicit key", () => {
    const key = "a".repeat(64);
    const manager = new IntegrationAuthManager(db, key);

    const cred = manager.createCredential({
      integrationId: "svc",
      authType: "api_key",
      credentials: { apiKey: "secret-value" },
    });

    const retrieved = manager.getCredential(cred.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.credentials.apiKey).toBe("secret-value");
  });

  it("encrypts and decrypts credentials using TELETON_INTEGRATIONS_KEY env var", () => {
    process.env.TELETON_INTEGRATIONS_KEY = "b".repeat(64);
    const manager = new IntegrationAuthManager(db);

    const cred = manager.createCredential({
      integrationId: "svc",
      authType: "api_key",
      credentials: { apiKey: "env-secret" },
    });

    const retrieved = manager.getCredential(cred.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.credentials.apiKey).toBe("env-secret");
  });

  it("two managers without explicit key share the same fallback key and can decrypt each other's data", () => {
    const mgr1 = new IntegrationAuthManager(db);
    const cred = mgr1.createCredential({
      integrationId: "svc",
      authType: "api_key",
      credentials: { apiKey: "shared-secret" },
    });

    const mgr2 = new IntegrationAuthManager(db);
    const retrieved = mgr2.getCredential(cred.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.credentials.apiKey).toBe("shared-secret");
  });
});
