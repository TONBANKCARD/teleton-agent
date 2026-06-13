---
title: "[AUDIT/V6] Soul editor: switching tabs while a load is in flight can save one file's content into another"
labels: ["bug", "audit-finding-v6", "medium", "data-integrity", "frontend"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-004"
severity: "medium"
category: "data-integrity"
github-issue: "pending"
---

## Problem Description

The Soul editor keeps a single `content` state shared by all tabs and a single
`activeTab`. Switching tabs sets `activeTab`, and an effect then reloads the new
file's content asynchronously:

```ts
const handleTabSwitch = async (file) => {
  if (dirty && !(await confirm(...))) return;   // user chose "Discard"
  setActiveTab(file);                            // tab flips immediately
};
useEffect(() => { void loadFile(activeTab); }, [activeTab, loadFile]);
```

Between `setActiveTab(file)` and `loadFile` finishing its fetch (which finally
calls `setContent(serverContent)`), `activeTab` already points at the **new**
file while `content` still holds the **previous** (discarded-but-not-yet-cleared)
content, and `dirty` is still `true`. If the auto-save interval fires, or the
user presses Ctrl+S, the save path runs:

```ts
await api.updateSoulFile(activeTab, content);   // newFile <= old file's content
saveDraft(activeTab, content);                  // same hazard for the draft
```

This writes the old file's content (the one the user explicitly discarded) into
the **newly selected** file — silent cross-file corruption of `SOUL.md` /
`STRATEGY.md` / etc.

## Location

- `web/src/pages/Soul.tsx:455-470` — `saveFile` posts `(activeTab, content)`.
- `web/src/pages/Soul.tsx:500-513` — auto-save interval posts
  `saveDraft(activeTab, content)`.
- `web/src/pages/Soul.tsx:515-525` — `handleTabSwitch` flips `activeTab`; the
  effect reloads `loadFile(activeTab)` asynchronously, leaving a window where
  `activeTab`/`content` are mismatched and `dirty` is still true.

## How To Reproduce

1. Edit `SOUL.md` (don't save) so the tab is dirty.
2. Switch to the `STRATEGY.md` tab and confirm "Discard".
3. Immediately press Ctrl+S (or wait for the 30s auto-save) before the new file
   finishes loading → the discarded `SOUL.md` text is written into
   `STRATEGY.md`.

## Impact

A core agent file can be silently overwritten with another file's content,
including the discarded edits the user explicitly chose not to keep. Hard to
notice until the agent misbehaves on corrupted strategy/identity text.

## Proposed Fix

- Guard saves by the file they target: capture the filename at edit time and
  refuse to save when `loading` is true or the in-flight load's target differs.
- Reset `content`/`savedContent`/`dirty` synchronously on tab switch (before the
  async load) so no stale-content save can fire.
- Sequence loads with an ignore-if-superseded flag (see WORK6-013).

## Regression Test

```tsx
it("does not save the previous tab's content into the newly selected file", async () => {
  // render editor, dirty SOUL.md, switch+discard to STRATEGY.md mid-load, fire save
  // expect updateSoulFile never called with ("STRATEGY.md", <SOUL content>)
});
```

## Acceptance Criteria

- [ ] No save (manual, Ctrl+S, or auto-save) can target a file other than the
      one whose content is currently displayed.
- [ ] Switching tabs cannot leave `activeTab` and `content` mismatched while
      `dirty` is true.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-004`
- Module: `web/src/pages/Soul.tsx`
