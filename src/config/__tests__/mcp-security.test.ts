import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinnedMcpServerFetch, validateMcpServerUrl } from "../mcp-security.js";

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => dnsMocks);

describe("MCP security", () => {
  beforeEach(() => {
    dnsMocks.lookup.mockReset();
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects an MCP URL whose hostname resolves to a metadata IP", async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);

    await expect(validateMcpServerUrl("https://rebind.example.com/mcp")).resolves.toMatch(
      /private|loopback|metadata|not allowed/i
    );
  });

  it("creates a pinned fetch for the validated MCP origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const target = await createPinnedMcpServerFetch("https://mcp.example.com/api");
    await target.fetch(new URL("https://mcp.example.com/api"), { method: "POST" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { dispatcher?: unknown }];
    expect(init.dispatcher).toBeDefined();
    expect(init.redirect).toBe("manual");

    await expect(target.fetch("https://other.example.com/api")).rejects.toThrow(
      /unvalidated origin/i
    );

    await target.close();
  });
});
