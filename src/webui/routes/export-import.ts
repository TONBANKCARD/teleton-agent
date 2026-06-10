import { Hono } from "hono";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { WebUIServerDeps, APIResponse } from "../types.js";
import {
  CONFIGURABLE_KEYS,
  getNestedValue,
  setNestedValue,
  readRawConfig,
  writeRawConfig,
} from "../../config/configurable-keys.js";
import {
  getBlocklistConfig,
  setBlocklistConfig,
  getTriggersConfig,
  setTriggersConfig,
  getRulesConfig,
  setRulesConfig,
} from "../../agent/hooks/user-hook-store.js";
import { WORKSPACE_ROOT } from "../../workspace/paths.js";
import { IMMUTABLE_FILES } from "../../workspace/validator.js";
import { getErrorMessage } from "../../utils/errors.js";
import { clearPromptCache } from "../../soul/loader.js";

const SOUL_FILES = ["SOUL.md", "SECURITY.md", "STRATEGY.md", "MEMORY.md", "HEARTBEAT.md"] as const;

// Sensitive config keys to strip from export
const SENSITIVE_KEYS = [
  "agent.api_key",
  "telegram.bot_token",
  "telegram.api_id",
  "telegram.api_hash",
  "tavily_api_key",
  "tonapi_key",
  "toncenter_api_key",
];

function stripSensitive(config: Record<string, unknown>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  // Zero out sensitive top-level and nested keys
  for (const key of SENSITIVE_KEYS) {
    const parts = key.split(".");
    let obj: Record<string, unknown> = copy;
    for (let i = 0; i < parts.length - 1; i++) {
      if (obj[parts[i]] && typeof obj[parts[i]] === "object") {
        obj = obj[parts[i]] as Record<string, unknown>;
      } else {
        obj = {};
        break;
      }
    }
    const last = parts[parts.length - 1];
    if (last in obj) {
      (obj as Record<string, unknown>)[last] = null;
    }
  }
  return copy;
}

export interface ConfigBundle {
  version: "1.0";
  exported_at: string;
  app_version: string;
  config: Record<string, unknown>;
  hooks: {
    blocklist: unknown;
    triggers: unknown;
    rules: unknown;
  };
  soul: Record<string, string>;
}

export function createExportImportRoutes(deps: WebUIServerDeps) {
  const app = new Hono();

  // GET /api/export — export full config bundle (sensitive keys stripped)
  app.get("/", (c) => {
    try {
      const rawConfig = readRawConfig(deps.configPath);
      const safeConfig = stripSensitive(rawConfig);

      const blocklist = getBlocklistConfig(deps.memory.db);
      const triggers = getTriggersConfig(deps.memory.db);
      const rules = getRulesConfig(deps.memory.db);

      const soul: Record<string, string> = {};
      for (const filename of SOUL_FILES) {
        const filePath = join(WORKSPACE_ROOT, filename);
        try {
          soul[filename] = readFileSync(filePath, "utf-8");
        } catch {
          soul[filename] = "";
        }
      }

      // Read package.json for version
      let appVersion = "unknown";
      try {
        const pkgPath = join(process.cwd(), "package.json");
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
          appVersion = pkg.version ?? "unknown";
        }
      } catch {
        // ignore
      }

      const bundle: ConfigBundle = {
        version: "1.0",
        exported_at: new Date().toISOString(),
        app_version: appVersion,
        config: safeConfig,
        hooks: { blocklist, triggers, rules },
        soul,
      };

      const response: APIResponse<ConfigBundle> = { success: true, data: bundle };
      return c.json(response);
    } catch (error) {
      return c.json<APIResponse>({ success: false, error: getErrorMessage(error) }, 500);
    }
  });

  // POST /api/export/import — import config bundle
  app.post("/import", async (c) => {
    try {
      const body = await c.req.json<{
        bundle: ConfigBundle;
        options?: {
          config?: boolean;
          hooks?: boolean;
          soul?: boolean;
        };
      }>();

      const { bundle, options = { config: true, hooks: true, soul: true } } = body;

      if (!bundle || bundle.version !== "1.0") {
        return c.json<APIResponse>(
          { success: false, error: "Invalid bundle format. Expected version 1.0" },
          400
        );
      }

      const applied: string[] = [];

      if (options.config && bundle.config) {
        const existing = readRawConfig(deps.configPath);
        // Deep-copy existing so all non-configurable keys (e.g. webui.auth_token_hash)
        // are preserved and the shallow-merge attack surface is eliminated.
        const merged = JSON.parse(JSON.stringify(existing)) as Record<string, unknown>;
        // Only apply keys that are in the CONFIGURABLE_KEYS allowlist.
        // This prevents setting arbitrary/security-sensitive fields not exposed in the UI.
        for (const [key, meta] of Object.entries(CONFIGURABLE_KEYS)) {
          const importedValue = getNestedValue(bundle.config as Record<string, unknown>, key);
          if (importedValue === undefined || importedValue === null) continue;
          if (meta.type === "array") {
            if (!Array.isArray(importedValue)) continue;
            const allValid = importedValue.every((item) => !meta.validate(String(item)));
            if (!allValid) continue;
            setNestedValue(
              merged,
              key,
              importedValue.map((item) => meta.parse(String(item)))
            );
          } else {
            const valueStr = String(importedValue);
            if (meta.validate(valueStr)) continue;
            setNestedValue(merged, key, meta.parse(valueStr));
          }
        }
        writeRawConfig(merged, deps.configPath);
        applied.push("config");
      }

      if (options.hooks && bundle.hooks) {
        if (bundle.hooks.blocklist) {
          setBlocklistConfig(
            deps.memory.db,
            bundle.hooks.blocklist as Parameters<typeof setBlocklistConfig>[1]
          );
          applied.push("blocklist");
        }
        if (bundle.hooks.triggers) {
          setTriggersConfig(
            deps.memory.db,
            bundle.hooks.triggers as Parameters<typeof setTriggersConfig>[1]
          );
          applied.push("triggers");
        }
        if (bundle.hooks.rules) {
          setRulesConfig(
            deps.memory.db,
            bundle.hooks.rules as Parameters<typeof setRulesConfig>[1]
          );
          applied.push("rules");
        }
      }

      if (options.soul && bundle.soul) {
        const { writeFileSync } = await import("node:fs");
        for (const filename of SOUL_FILES) {
          // Honor IMMUTABLE_FILES: SOUL.md, STRATEGY.md, SECURITY.md cannot be
          // overwritten via import (they are owner-only configuration files).
          if (IMMUTABLE_FILES.includes(filename)) continue;
          if (bundle.soul[filename] !== undefined) {
            const filePath = join(WORKSPACE_ROOT, filename);
            writeFileSync(filePath, bundle.soul[filename], "utf-8");
          }
        }
        clearPromptCache();
        applied.push("soul");
      }

      return c.json<APIResponse<{ applied: string[] }>>({
        success: true,
        data: { applied },
      });
    } catch (error) {
      return c.json<APIResponse>({ success: false, error: getErrorMessage(error) }, 500);
    }
  });

  return app;
}
