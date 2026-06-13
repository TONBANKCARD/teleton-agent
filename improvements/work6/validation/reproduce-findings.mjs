#!/usr/bin/env node
// Reproduction check for the V6 audit (issue #604).
// Each check asserts that the audited code pattern is still present on the
// current commit. While a finding remains reproducible the script exits
// non-zero, so it doubles as a regression guard once the fixes land.
import { readFileSync } from "node:fs";

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

const f = {
  rename: read("src/agent/tools/workspace/rename.ts"),
  delete: read("src/agent/tools/workspace/delete.ts"),
  rateLimit: read("src/api/middleware/rate-limit.ts"),
  feedMessages: read("src/memory/feed/messages.ts"),
  schema: read("src/memory/schema.ts"),
  soul: read("web/src/pages/Soul.tsx"),
  integrationsRoute: read("src/webui/routes/integrations.ts"),
  integrationsAuth: read("src/services/integrations/auth.ts"),
  harden: read("src/workspace/harden-permissions.ts"),
  manager: read("src/workspace/manager.ts"),
  mtproto: read("src/webui/routes/mtproto.ts"),
  notifications: read("src/webui/routes/notifications.ts"),
  audit: read("src/webui/routes/audit.ts"),
  cached: read("src/memory/embeddings/cached.ts"),
  retention: read("src/memory/retention.ts"),
  client: read("src/agent/client.ts"),
  sessions: read("web/src/pages/Sessions.tsx"),
  temporal: read("src/webui/routes/temporal.ts"),
  csrf: read("src/webui/middleware/csrf.ts"),
  scoring: read("src/memory/scoring.ts"),
  memoryRoute: read("src/webui/routes/memory.ts"),
  api: read("web/src/lib/api.ts"),
  registry: read("src/agent/tools/registry.ts"),
};

const checks = [
  {
    id: "WORK6-001",
    description: "workspace_rename renames with no protected/immutable-file guard",
    present:
      f.rename.includes("renameSync(validatedFrom.absolutePath, validatedTo.absolutePath)") &&
      !f.rename.includes("PROTECTED_WORKSPACE_FILES") &&
      !f.rename.includes("IMMUTABLE_FILES") &&
      f.delete.includes("PROTECTED_WORKSPACE_FILES"),
  },
  {
    id: "WORK6-002",
    description: "mutating/read rate limiters call createLimiter() per request",
    present:
      f.rateLimit.includes("return createLimiter(60_000, 10)(c, next);") &&
      f.rateLimit.includes("return createLimiter(60_000, 300)(c, next);") &&
      f.rateLimit.includes("export const globalRateLimit: MiddlewareHandler = createLimiter("),
  },
  {
    id: "WORK6-003",
    description: "tg_messages written with INSERT OR REPLACE against an FTS5 external-content index",
    present:
      f.feedMessages.includes("INSERT OR REPLACE INTO tg_messages") &&
      f.schema.includes("content='tg_messages'") &&
      f.schema.includes("content_rowid='rowid'"),
  },
  {
    id: "WORK6-004",
    description: "Soul editor saves shared `content` against the current `activeTab`",
    present:
      f.soul.includes("api.updateSoulFile(activeTab, content)") &&
      f.soul.includes("saveDraft(activeTab, content)") &&
      f.soul.includes("setActiveTab"),
  },
  {
    id: "WORK6-005",
    description: "OAuth token exchange fetches a caller-supplied tokenUrl with no SSRF guard",
    present:
      f.integrationsRoute.includes("const tokenUrl = stringField(body.tokenUrl);") &&
      f.integrationsAuth.includes("const response = await fetch(tokenUrl, {") &&
      !f.integrationsAuth.includes("isPrivate") &&
      !f.integrationsAuth.includes("assertPublic"),
  },
  {
    id: "WORK6-006",
    description: "permission hardening targets non-existent teleton.db files",
    present:
      f.harden.includes('"teleton.db"') &&
      f.harden.includes('"teleton.db-wal"') &&
      !f.harden.includes('"memory.db"'),
  },
  {
    id: "WORK6-007",
    description: "workspace directories created without an explicit 0o700 mode",
    present:
      f.manager.includes("mkdirSync(TELETON_ROOT, { recursive: true });") &&
      f.manager.includes("mkdirSync(WORKSPACE_ROOT, { recursive: true });") &&
      !f.manager.includes("0o700"),
  },
  {
    id: "WORK6-008",
    description: "GET /api/mtproto returns config.mtproto verbatim (incl. proxy secret)",
    present:
      f.mtproto.includes("const mtproto = config.mtproto ?? { enabled: false, proxies: [] };") &&
      f.mtproto.includes("data: mtproto } as APIResponse"),
  },
  {
    id: "WORK6-009",
    description: "SSE handlers detach bus listeners only after the loop (leak on write throw)",
    present:
      f.notifications.includes("stream.onAbort(") &&
      f.notifications.includes('notificationBus.off("update", onUpdate);') &&
      f.audit.includes("stream.onAbort(") &&
      f.audit.includes('auditTrailBus.off("event", onEvent);'),
  },
  {
    id: "WORK6-010",
    description: "embedQuery caches the embedding unconditionally (no length guard)",
    present:
      f.cached.includes("this.cachePut(hash, serializeEmbedding(embedding));") &&
      f.cached.includes("if (embedding.length > 0) {"),
  },
  {
    id: "WORK6-011",
    description: "retention never references the unbounded feed tables",
    present:
      f.feedMessages.includes("INSERT OR REPLACE INTO tg_messages") &&
      !f.retention.includes("tg_messages"),
  },
  {
    id: "WORK6-012",
    description: "in-flight LLM fetch uses only AbortSignal.timeout (caller signal not combined)",
    present:
      f.client.includes("signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS),"),
  },
  {
    id: "WORK6-013",
    description: "Sessions loaders set state from async responses with no sequencing",
    present:
      f.sessions.includes("setMessages(res.data.messages);") &&
      !f.sessions.includes("AbortController"),
  },
  {
    id: "WORK6-014",
    description: "state-mutating GET endpoints (temporal/patterns) perform writes",
    present:
      f.temporal.includes('app.get("/temporal"') &&
      f.temporal.includes("service.syncTemporalMetadata();") &&
      f.temporal.includes('app.get("/patterns"') &&
      f.temporal.includes("service.analyzeAndStorePatterns();"),
  },
  {
    id: "WORK6-015",
    description: "boostImpact clamps only the lower bound; route forwards client amount",
    present:
      f.scoring.includes("const increment = Math.max(1, Math.floor(amount));") &&
      f.memoryRoute.includes("memoryScorer.boostImpact(ids, body.amount ?? 1);"),
  },
  {
    id: "WORK6-016",
    description: "Sessions reads res.data.messages unchecked and renders messages.map",
    present:
      f.sessions.includes("setMessages(res.data.messages);") &&
      f.sessions.includes("messages.length === 0") &&
      f.sessions.includes("messages.map("),
  },
  {
    id: "WORK6-017",
    description: "connectNotifications opens an EventSource with no onerror handler",
    present:
      f.api.includes("connectNotifications(onCount: (count: number) => void) {") &&
      f.api.includes("return () => eventSource.close();"),
  },
  {
    id: "WORK6-018",
    description: "registerPluginTools silently `continue`s on a tool-name collision",
    present:
      f.registry.includes("if (this.tools.has(tool.name)) continue;") &&
      f.registry.includes("replacePluginTools("),
  },
];

const present = checks.filter((check) => check.present);

for (const check of checks) {
  const status = check.present ? "PRESENT" : "not detected";
  console.log(`${check.id}: ${status} - ${check.description}`);
}

if (present.length > 0) {
  console.error(`\n${present.length}/${checks.length} audit finding(s) are still reproducible.`);
  process.exit(1);
}

console.log("\nNo tracked audit findings detected.");
