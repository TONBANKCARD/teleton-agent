import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  PolicyEngine,
  parsePoliciesYaml,
  stringifyPolicyYaml,
  type CreateSecurityPolicyInput,
} from "../policy-engine.js";

describe("PolicyEngine", () => {
  let db: Database.Database;
  let engine: PolicyEngine;

  beforeEach(() => {
    db = new Database(":memory:");
    engine = new PolicyEngine(db);
  });

  afterEach(() => {
    db.close();
  });

  it("allows actions when no policy matches", () => {
    const result = engine.evaluate({
      tool: "workspace_read",
      params: { path: "notes.md" },
      senderId: 123,
      chatId: "dm",
    });

    expect(result.action).toBe("allow");
    expect(result.reason).toBe("No matching policy");
  });

  it("denies the first matching policy by priority", () => {
    engine.createPolicy({
      name: "low-priority-approval",
      match: { tool: "exec_run" },
      action: "require_approval",
      priority: 1,
    });
    engine.createPolicy({
      name: "block-rm-rf",
      match: { tool: "exec_run", params: { command: { pattern: "rm\\s+-rf" } } },
      action: "deny",
      reason: "Destructive file operations are blocked",
      priority: 10,
    });

    const result = engine.evaluate({
      tool: "exec_run",
      params: { command: "rm -rf /tmp/example" },
      senderId: 123,
      chatId: "dm",
    });

    expect(result.action).toBe("deny");
    expect(result.policy?.name).toBe("block-rm-rf");
    expect(result.reason).toBe("Destructive file operations are blocked");
  });

  it("supports YAML policy definitions", () => {
    const parsed = parsePoliciesYaml(`
policies:
  - name: api-calls-require-approval
    match:
      tool: web_fetch
      params:
        url:
          pattern: "^https://api\\\\."
    action: require_approval
    reason: External API calls need review
    priority: 5
`);

    expect(parsed).toEqual<CreateSecurityPolicyInput[]>([
      {
        name: "api-calls-require-approval",
        match: {
          tool: "web_fetch",
          params: { url: { pattern: "^https://api\\." } },
        },
        action: "require_approval",
        reason: "External API calls need review",
        enabled: true,
        priority: 5,
      },
    ]);

    const yaml = stringifyPolicyYaml(parsed[0]);
    expect(yaml).toContain("api-calls-require-approval");
    expect(yaml).toContain("require_approval");
  });

  it("rejects invalid or unsafe regex param patterns when defining policies", () => {
    expect(() =>
      engine.createPolicy({
        name: "invalid-regex",
        match: { tool: "web_fetch", params: { url: { pattern: "(" } } },
        action: "deny",
      })
    ).toThrow(/regex pattern/i);

    expect(() =>
      engine.createPolicy({
        name: "unsafe-regex",
        match: { tool: "exec_run", params: { command: { pattern: "(a+)+$" } } },
        action: "deny",
      })
    ).toThrow(/unsafe regex pattern/i);
  });

  it("fails closed instead of evaluating unsafe regex patterns from stored policies", () => {
    db.prepare(
      `INSERT INTO security_policies (name, match, action, reason, enabled, priority)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      "legacy-unsafe-regex",
      JSON.stringify({
        tool: "exec_run",
        params: { command: { pattern: "(a+)+$" } },
      }),
      "deny",
      null,
      1,
      10
    );

    const result = engine.evaluate({
      tool: "exec_run",
      params: { command: "aaaaaaaaaaaa!" },
      senderId: 123,
      chatId: "dm",
    });

    expect(result.action).toBe("deny");
    expect(result.reason).toMatch(/unsafe regex pattern/i);
    expect(result.policy?.name).toBe("legacy-unsafe-regex");
  });

  it("reuses compiled regex param patterns during evaluation", () => {
    engine.createPolicy({
      name: "block-rm-rf",
      match: { tool: "exec_run", params: { command: { pattern: "rm\\s+-rf" } } },
      action: "deny",
    });

    const OriginalRegExp = globalThis.RegExp;
    globalThis.RegExp = function RegExp() {
      throw new Error("RegExp should not be recompiled during evaluation");
    } as unknown as RegExpConstructor;
    try {
      const result = engine.evaluate({
        tool: "exec_run",
        params: { command: "rm -rf /tmp/example" },
        senderId: 123,
        chatId: "dm",
      });
      expect(result.action).toBe("deny");
    } finally {
      globalThis.RegExp = OriginalRegExp;
    }
  });

  it("records validation decisions", () => {
    engine.createPolicy({
      name: "block-write",
      match: { tool: "workspace_write" },
      action: "deny",
      reason: "Writes are disabled",
    });

    const result = engine.evaluate({
      tool: "workspace_write",
      params: { path: "a.txt", content: "x" },
      senderId: 123,
      chatId: "dm",
    });
    engine.recordValidation({
      tool: "workspace_write",
      params: { path: "a.txt", content: "x" },
      action: result.action,
      reason: result.reason,
      policy: result.policy,
    });

    const entries = engine.listValidationLog({ limit: 5 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      tool: "workspace_write",
      action: "deny",
      reason: "Writes are disabled",
      policy_name: "block-write",
    });
  });

  it("enforces configured per-tool rate limits", () => {
    engine.setToolRateLimit("web_fetch", 1);

    const first = engine.evaluate({
      tool: "web_fetch",
      params: { url: "https://example.com" },
      senderId: 123,
      chatId: "dm",
    });
    const second = engine.evaluate({
      tool: "web_fetch",
      params: { url: "https://example.com/again" },
      senderId: 123,
      chatId: "dm",
    });

    expect(first.action).toBe("allow");
    expect(second.action).toBe("deny");
    expect(second.reason).toContain("rate limit");
  });
});
