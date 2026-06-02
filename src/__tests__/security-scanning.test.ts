import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * Structural validation for the continuous security scanning configuration
 * (CodeQL static analysis + gitleaks secret scanning). These guard against
 * accidental breakage of the workflows and allowlist introduced for #503.
 *
 * The repo root is the vitest working directory.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

type Workflow = {
  on: Record<string, unknown>;
  jobs: Record<
    string,
    { permissions?: Record<string, string>; steps: Array<Record<string, unknown>> }
  >;
};

describe("CodeQL workflow", () => {
  const wf = parse(read(".github/workflows/codeql.yml")) as Workflow;

  it("runs on pull requests, pushes to main, and a weekly schedule", () => {
    expect(wf.on).toHaveProperty("pull_request");
    expect(wf.on).toHaveProperty("push");
    expect(wf.on).toHaveProperty("schedule");
    const schedule = wf.on.schedule as Array<{ cron: string }>;
    expect(schedule.some((s) => /\*/.test(s.cron))).toBe(true);
  });

  it("grants security-events write permission for the analyze job", () => {
    const job = wf.jobs.analyze;
    expect(job).toBeDefined();
    expect(job.permissions?.["security-events"]).toBe("write");
  });

  it("initializes CodeQL for JavaScript/TypeScript with the extended query suite", () => {
    const steps = wf.jobs.analyze.steps;
    const init = steps.find((s) => String(s.uses ?? "").includes("codeql-action/init"));
    expect(init).toBeDefined();
    const withCfg = (init as { with: Record<string, string> }).with;
    expect(withCfg.languages).toContain("javascript-typescript");
    expect(withCfg.queries).toContain("security-extended");
    expect(steps.some((s) => String(s.uses ?? "").includes("codeql-action/analyze"))).toBe(true);
  });
});

describe("gitleaks secret-scanning workflow", () => {
  const wf = parse(read(".github/workflows/gitleaks.yml")) as Workflow;

  it("runs on pull requests and pushes", () => {
    expect(wf.on).toHaveProperty("pull_request");
    expect(wf.on).toHaveProperty("push");
  });

  it("uses the gitleaks action with the repo config and a GITHUB_TOKEN", () => {
    const steps = wf.jobs.gitleaks.steps;
    const scan = steps.find((s) => String(s.uses ?? "").includes("gitleaks/gitleaks-action"));
    expect(scan).toBeDefined();
    const env = (scan as { env: Record<string, string> }).env;
    expect(env.GITHUB_TOKEN).toBeDefined();
    expect(env.GITLEAKS_CONFIG).toContain(".gitleaks.toml");
  });
});

describe("gitleaks allowlist (.gitleaks.toml)", () => {
  const toml = read(".gitleaks.toml");

  it("exists and extends the default ruleset", () => {
    expect(existsSync(resolve(root, ".gitleaks.toml"))).toBe(true);
    expect(toml).toMatch(/useDefault\s*=\s*true/);
  });

  it("allowlists documentation placeholders and example templates", () => {
    expect(toml).toContain("[allowlist]");
    expect(toml).toMatch(/env\\\.example/);
    expect(toml).toContain("YOUR_");
  });

  it("allowlists the public Claude Code OAuth client ID", () => {
    expect(toml).toContain("9d1c250a-e61b-44d9-88ed-5944d1962f5e");
  });
});
