import { BlockList, isIP } from "node:net";

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

const BLOCKED_MCP_HOSTNAMES = new Set(["localhost", "metadata", "metadata.google.internal"]);

const blockedIpRanges = new BlockList();
blockedIpRanges.addSubnet("0.0.0.0", 8, "ipv4");
blockedIpRanges.addSubnet("10.0.0.0", 8, "ipv4");
blockedIpRanges.addSubnet("100.64.0.0", 10, "ipv4");
blockedIpRanges.addSubnet("127.0.0.0", 8, "ipv4");
blockedIpRanges.addSubnet("169.254.0.0", 16, "ipv4");
blockedIpRanges.addSubnet("172.16.0.0", 12, "ipv4");
blockedIpRanges.addSubnet("192.168.0.0", 16, "ipv4");
blockedIpRanges.addSubnet("198.18.0.0", 15, "ipv4");
blockedIpRanges.addSubnet("224.0.0.0", 4, "ipv4");
blockedIpRanges.addSubnet("240.0.0.0", 4, "ipv4");
blockedIpRanges.addAddress("255.255.255.255", "ipv4");
blockedIpRanges.addAddress("::", "ipv6");
blockedIpRanges.addAddress("::1", "ipv6");
blockedIpRanges.addSubnet("fc00::", 7, "ipv6");
blockedIpRanges.addSubnet("fe80::", 10, "ipv6");
blockedIpRanges.addSubnet("ff00::", 8, "ipv6");

export function validateMcpServerUrl(rawUrl: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "Invalid MCP server URL";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "MCP server URL must use http:// or https://";
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    return "MCP server URL must include a host";
  }

  if (isBlockedMcpHostname(hostname)) {
    return "MCP server URL host must not be localhost or an internal metadata host";
  }

  if (isBlockedMcpIp(hostname)) {
    return "MCP server URL must not point at private, loopback, link-local, or metadata IP addresses";
  }

  return undefined;
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

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
}

function isBlockedMcpHostname(hostname: string): boolean {
  return BLOCKED_MCP_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
}

function isBlockedMcpIp(hostname: string): boolean {
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) return blockedIpRanges.check(hostname, "ipv4");
  if (ipVersion === 6) {
    const mappedIpv4 = getMappedIpv4(hostname);
    if (mappedIpv4) {
      return blockedIpRanges.check(mappedIpv4, "ipv4");
    }
    return blockedIpRanges.check(hostname, "ipv6");
  }
  return false;
}

function getMappedIpv4(hostname: string): string | undefined {
  const dotted = hostname.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1];

  const hex = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return undefined;

  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}
