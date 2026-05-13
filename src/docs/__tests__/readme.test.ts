import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pkg from "../../../package.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const readmePath = join(repoRoot, "README.md");

function countWebUiPages(): number {
  return readdirSync(join(repoRoot, "web/src/pages")).filter((file) => file.endsWith(".tsx"))
    .length;
}

function countWebUiApiRouteGroups(): number {
  return readFileSync(join(repoRoot, "src/webui/server.ts"), "utf8").match(
    /this\.app\.route\("\/api\//g
  )!.length;
}

function assertLocalLinksResolve(markdownFile: string): void {
  const body = readFileSync(markdownFile, "utf8");
  const markdownLinkPattern = /!?\[[^\]]*]\((?!https?:|mailto:|#)([^)]+)\)/g;

  for (const match of body.matchAll(markdownLinkPattern)) {
    const target = decodeURIComponent(match[1].split("#")[0]);
    if (!target) continue;

    const resolved = resolve(dirname(markdownFile), target);
    expect(existsSync(resolved), `${markdownFile} links to missing file ${target}`).toBe(true);
  }
}

describe("root README", () => {
  it("documents the current fork version and WebUI surface", () => {
    const readme = readFileSync(readmePath, "utf8");

    expect(readme).toContain(`Current fork version: \`${pkg.version}\``);
    expect(readme).toContain(`${countWebUiPages()} WebUI pages`);
    expect(readme).toContain(`${countWebUiApiRouteGroups()} authenticated WebUI API route groups`);
    expect(readme).toContain("100+ model presets");
    expect(readme).toContain("off | allowlist | yolo");
    expect(readme).not.toContain("70+ models");
    expect(readme).not.toContain("14 route groups");
    expect(readme).not.toContain("11 pages");
    expect(readme).not.toContain("github.com/TONresistor/teleton-agent.git");
    expect(readme).not.toContain("TONresistor/teleton-agent/issues");
  });

  it("documents the current MCP tool namespace", () => {
    const readme = readFileSync(readmePath, "utf8");

    expect(readme).toContain("`mcp.<server>.<tool>`");
    expect(readme).not.toContain("`mcp_<server>_<tool>`");
  });

  it("does not contain broken local markdown links", () => {
    assertLocalLinksResolve(readmePath);
  });
});
