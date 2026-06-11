import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createMcpRoutes } from "../routes/mcp.js";
import type { WebUIServerDeps } from "../types.js";

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  readRawConfig: vi.fn(),
  writeRawConfig: vi.fn(),
}));

vi.mock("node:dns/promises", () => dnsMocks);

vi.mock("../../config/configurable-keys.js", () => ({
  readRawConfig: configMocks.readRawConfig,
  writeRawConfig: configMocks.writeRawConfig,
}));

function createApp(): Hono {
  const deps = {
    configPath: "/tmp/teleton-test-config.yaml",
    mcpServers: () => [],
  } as unknown as WebUIServerDeps;

  const app = new Hono();
  app.route("/api/mcp", createMcpRoutes(deps));
  return app;
}

function postMcp(app: Hono, body: Record<string, unknown>): Promise<Response> {
  return app.request("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("MCP routes", () => {
  let app: Hono;

  beforeEach(() => {
    app = createApp();
    configMocks.readRawConfig.mockReturnValue({ mcp: { servers: {} } });
    configMocks.writeRawConfig.mockClear();
    dnsMocks.lookup.mockReset();
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("rejects MCP server urls pointing at metadata addresses", async () => {
    const res = await postMcp(app, {
      name: "metadata",
      url: "http://169.254.169.254/latest/meta-data/",
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(configMocks.writeRawConfig).not.toHaveBeenCalled();
  });

  it("rejects MCP server urls pointing at private addresses", async () => {
    const res = await postMcp(app, {
      name: "internal",
      url: "http://10.0.0.12/mcp",
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(configMocks.writeRawConfig).not.toHaveBeenCalled();
  });

  it("rejects MCP server urls pointing at IPv4-mapped private addresses", async () => {
    const res = await postMcp(app, {
      name: "mapped",
      url: "http://[::ffff:127.0.0.1]/mcp",
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(configMocks.writeRawConfig).not.toHaveBeenCalled();
  });

  it("rejects MCP server urls whose hostnames resolve to metadata addresses", async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);

    const res = await postMcp(app, {
      name: "rebind",
      url: "https://rebind.example.com/mcp",
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/private|loopback|metadata|not allowed/i);
    expect(configMocks.writeRawConfig).not.toHaveBeenCalled();
  });

  it("rejects dangerous MCP env keys before writing config", async () => {
    const res = await postMcp(app, {
      name: "stdio",
      package: "@modelcontextprotocol/server-filesystem",
      env: { NODE_OPTIONS: "--require=/tmp/payload.js" },
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(configMocks.writeRawConfig).not.toHaveBeenCalled();
  });

  it("rejects unsafe MCP env values before writing config", async () => {
    const res = await postMcp(app, {
      name: "stdio",
      package: "@modelcontextprotocol/server-filesystem",
      env: { API_KEY: "safe;rm-rf" },
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(configMocks.writeRawConfig).not.toHaveBeenCalled();
  });

  it("persists safe remote MCP urls and env values", async () => {
    const res = await postMcp(app, {
      name: "remote",
      url: "https://mcp.example.com/api",
      env: { API_KEY: "sk-test_123", CACHE_PATH: "/tmp/cache:rw" },
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(configMocks.writeRawConfig).toHaveBeenCalledOnce();
    expect(configMocks.writeRawConfig.mock.calls[0][0].mcp.servers.remote).toEqual({
      url: "https://mcp.example.com/api",
      env: { API_KEY: "sk-test_123", CACHE_PATH: "/tmp/cache:rw" },
    });
  });
});
