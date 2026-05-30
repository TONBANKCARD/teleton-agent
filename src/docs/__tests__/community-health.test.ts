import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

type IssueFormField = {
  type?: string;
  id?: string;
};

type IssueForm = {
  name?: string;
  description?: string;
  body?: IssueFormField[];
};

type IssueChooser = {
  blank_issues_enabled?: boolean;
  contact_links?: Array<{ name?: string; url?: string; about?: string }>;
};

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

function parseYamlFile<T>(path: string): T {
  return parse(readRepoFile(path)) as T;
}

describe("community health files", () => {
  it("publishes contribution policy documents and links them from public docs", () => {
    const requiredFiles = [
      ".github/CODE_OF_CONDUCT.md",
      ".github/PULL_REQUEST_TEMPLATE.md",
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/feature_request.yml",
      ".github/ISSUE_TEMPLATE/config.yml",
      "GOVERNANCE.md",
      "SUPPORT.md",
    ];

    for (const path of requiredFiles) {
      expect(existsSync(join(repoRoot, path)), `${path} should exist`).toBe(true);
    }

    const codeOfConduct = readRepoFile(".github/CODE_OF_CONDUCT.md");
    expect(codeOfConduct).toContain("Contributor Covenant Code of Conduct");
    expect(codeOfConduct).toContain("version 2.1");

    const readme = readRepoFile("README.md");
    expect(readme).toContain("[Code of Conduct](.github/CODE_OF_CONDUCT.md)");
    expect(readme).toContain("[Governance](GOVERNANCE.md)");
    expect(readme).toContain("[Support](SUPPORT.md)");

    const contributing = readRepoFile("CONTRIBUTING.md");
    expect(contributing).toContain("[Code of Conduct](.github/CODE_OF_CONDUCT.md)");
  });

  it("uses structured GitHub issue forms with a discussion contact path", () => {
    const bugReport = parseYamlFile<IssueForm>(".github/ISSUE_TEMPLATE/bug_report.yml");
    const featureRequest = parseYamlFile<IssueForm>(".github/ISSUE_TEMPLATE/feature_request.yml");
    const chooser = parseYamlFile<IssueChooser>(".github/ISSUE_TEMPLATE/config.yml");

    expect(bugReport.body?.some((field) => field.id === "reproduction")).toBe(true);
    expect(bugReport.body?.some((field) => field.id === "environment")).toBe(true);
    expect(featureRequest.body?.some((field) => field.id === "problem")).toBe(true);
    expect(featureRequest.body?.some((field) => field.id === "proposal")).toBe(true);
    expect(chooser.blank_issues_enabled).toBe(false);
    expect(chooser.contact_links?.some((link) => link.url?.includes("/discussions"))).toBe(true);
  });

  it("asks pull request authors for description, type, testing, and release hygiene", () => {
    const template = readRepoFile(".github/PULL_REQUEST_TEMPLATE.md");

    expect(template).toContain("## Description");
    expect(template).toContain("## Type of Change");
    expect(template).toContain("## Testing Done");
    expect(template).toContain("CHANGELOG");
    expect(template).not.toContain("targets the `dev` branch");
  });
});
