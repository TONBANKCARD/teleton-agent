import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const guideRoot = join(repoRoot, "docs/user-guide");

const expectedSections = [
  "01-quick-start.md",
  "02-dashboard.md",
  "03-autonomous-mode.md",
  "04-tools.md",
  "05-soul-editor.md",
  "06-analytics.md",
  "07-sessions.md",
  "08-security.md",
  "09-hooks.md",
  "10-advanced-features.md",
  "11-settings.md",
  "12-troubleshooting.md",
  "13-faq-best-practices.md",
];

function listMarkdownFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort();
}

function assertLocalLinksResolve(markdownFile: string): void {
  const body = readFileSync(markdownFile, "utf8");
  const markdownLinkPattern = /!?\[[^\]]*]\((?!https?:|mailto:|#)([^)]+)\)/g;

  for (const match of body.matchAll(markdownLinkPattern)) {
    const target = decodeURIComponent(match[1].split("#")[0]);
    const resolved = resolve(dirname(markdownFile), target);
    expect(existsSync(resolved), `${markdownFile} links to missing file ${target}`).toBe(true);
  }
}

describe("WebUI user guide documentation", () => {
  it("contains the required bilingual section structure", () => {
    expect(existsSync(join(guideRoot, "README.md"))).toBe(true);
    expect(listMarkdownFiles(join(guideRoot, "en"))).toEqual(expectedSections);
    expect(listMarkdownFiles(join(guideRoot, "ru"))).toEqual(expectedSections);
  });

  it("ships enough screenshot and diagram assets for the guide", () => {
    const enScreenshots = readdirSync(join(guideRoot, "assets/screenshots/en")).filter((file) =>
      file.endsWith(".png")
    );
    const ruScreenshots = readdirSync(join(guideRoot, "assets/screenshots/ru")).filter((file) =>
      file.endsWith(".png")
    );
    const diagrams = readdirSync(join(guideRoot, "assets/diagrams")).filter((file) =>
      file.endsWith(".svg")
    );

    expect(enScreenshots.length).toBeGreaterThanOrEqual(30);
    expect(ruScreenshots.length).toBeGreaterThanOrEqual(30);
    expect(diagrams.length).toBeGreaterThanOrEqual(5);

    for (const file of enScreenshots) {
      const path = join(guideRoot, "assets/screenshots/en", file);
      expect(statSync(path).size, `${file} should not be empty`).toBeGreaterThan(0);
    }
    for (const file of ruScreenshots) {
      const path = join(guideRoot, "assets/screenshots/ru", file);
      expect(statSync(path).size, `${file} should not be empty`).toBeGreaterThan(0);
    }
  });

  it("does not contain broken local markdown links", () => {
    const markdownFiles = [
      join(guideRoot, "README.md"),
      ...expectedSections.map((file) => join(guideRoot, "en", file)),
      ...expectedSections.map((file) => join(guideRoot, "ru", file)),
    ];

    for (const markdownFile of markdownFiles) {
      assertLocalLinksResolve(markdownFile);
    }
  });
});
