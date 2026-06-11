import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMcpServers } from "../mcp-loader.js";
import type { McpConfig } from "../../../config/schema.js";

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

const sdkMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  clients: [] as Array<{
    close: ReturnType<typeof vi.fn>;
    transport?: { close?: () => Promise<void> };
  }>,
  streamableTransports: [] as Array<{
    url: URL;
    opts?: { fetch?: typeof fetch };
    close: ReturnType<typeof vi.fn>;
    originalClose: ReturnType<typeof vi.fn>;
  }>,
  sseTransports: [] as Array<{
    url: URL;
    opts?: { fetch?: typeof fetch };
    close: ReturnType<typeof vi.fn>;
    originalClose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("node:dns/promises", () => dnsMocks);

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn(function () {
    const client = {
      transport: undefined as { close?: () => Promise<void> } | undefined,
      connect: vi.fn(async (transport: { close?: () => Promise<void> }) => {
        client.transport = transport;
        await sdkMocks.connect(transport);
      }),
      close: vi.fn(async () => {
        await client.transport?.close?.();
      }),
    };
    sdkMocks.clients.push(client);
    return client;
  }),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class StreamableHTTPClientTransport {
    originalClose = vi.fn();
    close = this.originalClose;

    constructor(
      public readonly url: URL,
      public readonly opts?: { fetch?: typeof fetch }
    ) {
      sdkMocks.streamableTransports.push(this);
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class SSEClientTransport {
    originalClose = vi.fn();
    close = this.originalClose;

    constructor(
      public readonly url: URL,
      public readonly opts?: { fetch?: typeof fetch }
    ) {
      sdkMocks.sseTransports.push(this);
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class StdioClientTransport {},
}));

vi.mock("../../../utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function remoteMcpConfig(url: string): McpConfig {
  return {
    servers: {
      remote: {
        url,
        scope: "always",
        enabled: true,
      },
    },
  };
}

describe("loadMcpServers remote URL security", () => {
  beforeEach(() => {
    sdkMocks.connect.mockReset();
    sdkMocks.connect.mockResolvedValue(undefined);
    sdkMocks.clients.length = 0;
    sdkMocks.streamableTransports.length = 0;
    sdkMocks.sseTransports.length = 0;
    dnsMocks.lookup.mockReset();
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a remote MCP hostname that resolves to a metadata IP", async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);

    const connections = await loadMcpServers(remoteMcpConfig("https://rebind.example.com/mcp"));

    expect(connections).toEqual([]);
    expect(sdkMocks.streamableTransports).toHaveLength(0);
    expect(sdkMocks.connect).not.toHaveBeenCalled();
  });

  it("passes a pinned fetch to the Streamable HTTP transport", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const connections = await loadMcpServers(remoteMcpConfig("https://mcp.example.com/api"));

    expect(connections).toHaveLength(1);
    expect(sdkMocks.streamableTransports).toHaveLength(1);
    const transport = sdkMocks.streamableTransports[0];
    expect(transport.opts?.fetch).toEqual(expect.any(Function));

    await transport.opts?.fetch?.(new URL("https://mcp.example.com/api"), { method: "GET" });

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { dispatcher?: unknown }];
    expect(init.dispatcher).toBeDefined();
    expect(init.redirect).toBe("manual");

    await expect(transport.opts?.fetch?.("https://other.example.com/api")).rejects.toThrow(
      /unvalidated origin/i
    );

    await connections[0].client.close();
    expect(transport.originalClose).toHaveBeenCalledOnce();
  });
});
