import { describe, it, expect, vi } from "vitest";

vi.mock("../utils/logger.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  initLoggerFromConfig: vi.fn(),
}));

import { AgentLifecycle } from "../agent/lifecycle.js";
import { startAgentKeepingDashboardAlive } from "../index.js";

/**
 * Regression test for issue #469: when the host's Telegram authentication
 * fails (invalid api_id, MTProto proxy unreachable, no network), the
 * agent's lifecycle.start() rejects. Before the fix, that rejection
 * propagated to TeletonApp.start() → main() → process.exit(1), which
 * killed the WebUI/Management API the user needs to repair the config.
 */
describe("startAgentKeepingDashboardAlive (issue #469)", () => {
  const makeLog = () => ({ error: vi.fn() });

  it("keeps the process alive when WebUI is enabled and the agent fails to start", async () => {
    const lifecycle = new AgentLifecycle();
    const log = makeLog();
    const startAgent = vi.fn(async () => {
      throw new Error("API_ID_INVALID");
    });

    await expect(
      startAgentKeepingDashboardAlive({
        lifecycle,
        startAgent,
        keepAliveOnFailure: true,
        log,
      })
    ).resolves.toBeUndefined();

    expect(startAgent).toHaveBeenCalledOnce();
    expect(lifecycle.getState()).toBe("stopped");
    expect(lifecycle.getError()).toBe("API_ID_INVALID");
    expect(log.error).toHaveBeenCalledOnce();
    const [, message] = log.error.mock.calls[0];
    expect(String(message)).toContain("WebUI/API remain available");
  });

  it("propagates the error when no dashboard is enabled", async () => {
    const lifecycle = new AgentLifecycle();
    const log = makeLog();
    const startAgent = vi.fn(async () => {
      throw new Error("Connection error");
    });

    await expect(
      startAgentKeepingDashboardAlive({
        lifecycle,
        startAgent,
        keepAliveOnFailure: false,
        log,
      })
    ).rejects.toThrow("Connection error");

    expect(lifecycle.getState()).toBe("stopped");
    expect(log.error).not.toHaveBeenCalled();
  });

  it("starts normally when the agent succeeds", async () => {
    const lifecycle = new AgentLifecycle();
    const log = makeLog();
    const startAgent = vi.fn(async () => {});

    await startAgentKeepingDashboardAlive({
      lifecycle,
      startAgent,
      keepAliveOnFailure: true,
      log,
    });

    expect(startAgent).toHaveBeenCalledOnce();
    expect(lifecycle.getState()).toBe("running");
    expect(log.error).not.toHaveBeenCalled();
  });

  it("keeps the dashboard alive for any error type (MTProto proxy unreachable, network down, etc.)", async () => {
    const lifecycle = new AgentLifecycle();
    const log = makeLog();

    // Simulate a non-Error rejection (some Telegram client paths throw strings).
    const stringError: unknown = "ECONNREFUSED 127.0.0.1:65530";
    const startAgent = vi.fn(async () => {
      throw stringError;
    });

    await expect(
      startAgentKeepingDashboardAlive({
        lifecycle,
        startAgent,
        keepAliveOnFailure: true,
        log,
      })
    ).resolves.toBeUndefined();

    expect(lifecycle.getState()).toBe("stopped");
    expect(log.error).toHaveBeenCalledOnce();
  });
});
