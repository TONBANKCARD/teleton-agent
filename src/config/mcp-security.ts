import {
  createPinnedOutboundFetch,
  validateOutboundUrl,
  validateResolvedOutboundUrl,
  type PinnedOutboundFetch,
} from "../services/outbound-url-guard.js";

export const SAFE_MCP_PACKAGE_RE = /^[@a-zA-Z0-9._/-]+$/;
export const SAFE_MCP_ARG_RE = /^[a-zA-Z0-9._/:=@-]+$/;
export const SAFE_MCP_ENV_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const SAFE_MCP_ENV_VALUE_RE = /^[a-zA-Z0-9._/:=@-]*$/;

export const BLOCKED_MCP_ENV_KEYS = new Set([
  "LD_PRELOAD",
  "NODE_OPTIONS",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "ELECTRON_RUN_AS_NODE",
]);

const MCP_SERVER_URL_GUARD = {
  allowedProtocols: ["http:", "https:"] as const,
  label: "MCP server URL",
};

export type PinnedMcpServerFetch = PinnedOutboundFetch;

export function validateMcpServerUrl(rawUrl: string): Promise<string | undefined>;
export function validateMcpServerUrl(
  rawUrl: string,
  options: { resolve: false }
): string | undefined;
export function validateMcpServerUrl(
  rawUrl: string,
  options?: { resolve?: boolean }
): Promise<string | undefined> | string | undefined {
  try {
    if (options?.resolve === false) {
      validateOutboundUrl(rawUrl, MCP_SERVER_URL_GUARD);
      return undefined;
    }

    return validateResolvedOutboundUrl(rawUrl, MCP_SERVER_URL_GUARD)
      .then(() => undefined)
      .catch(getErrorText);
  } catch (error) {
    return getErrorText(error);
  }
}

export async function createPinnedMcpServerFetch(rawUrl: string): Promise<PinnedMcpServerFetch> {
  return createPinnedOutboundFetch(rawUrl, MCP_SERVER_URL_GUARD);
}

export function validateMcpEnv(env: unknown): string | undefined {
  if (env === undefined) return undefined;
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return "MCP env must be an object";
  }

  for (const [key, value] of Object.entries(env)) {
    if (!SAFE_MCP_ENV_KEY_RE.test(key)) {
      return `Invalid env key "${key}" - only letters, numbers, and _ are allowed`;
    }
    if (BLOCKED_MCP_ENV_KEYS.has(key.toUpperCase())) {
      return `Dangerous env key "${key}" is not allowed for MCP servers`;
    }
    if (typeof value !== "string") {
      return `Invalid env value for "${key}" - value must be a string`;
    }
    if (!SAFE_MCP_ENV_VALUE_RE.test(value)) {
      return `Invalid env value for "${key}" - only alphanumeric, ., /, :, =, @, _, - allowed`;
    }
  }

  return undefined;
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
