# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run build      # compile src/ → dist/content.js (one-shot)
npm run watch      # rebuild on every file change
```

After each build, reload the extension on `chrome://extensions` (click the refresh icon on the card), then hard-refresh the Jira page.

## Architecture

This is a Chrome Manifest V3 extension with a single content script. There is no background service worker, no popup, and no options page.

**Data flow:**

```
Jira page loads
  → content.ts: extract issue key from URL
  → changelog.ts: GET /rest/api/3/issue/{key}/changelog (same-origin, session cookies auto-sent)
  → filter entries where items[].field === "description"
  → build two Maps: normalizedFromText → DescriptionChange, normalizedToText → DescriptionChange
  → TreeWalker scan of the history/activity DOM section
  → for each leaf element whose textContent matches a known from/to, inject <span class="jd-removed|jd-added"> highlighting
  → MutationObserver keeps re-running the scan (debounced 300ms) as Jira lazy-renders history items
```

**Key constraint — DOM matching:** `highlightChangesInDOM` in `content.ts` matches elements by exact normalized text content (`norm()` collapses whitespace). This works as long as Jira renders the description text verbatim in a leaf-ish element (≤3 children). If Jira truncates or splits the text, the match will fail silently. The `PROCESSED_ATTR` (`data-jd-done`) prevents double-processing.

**SPA navigation:** Jira is a React SPA. A second `MutationObserver` (`navObserver`) watches `window.location.href` changes and re-runs `init()` with a 1500ms delay to let Jira finish rendering the new route.

**Build:** esbuild bundles everything (including the `diff` npm package) into a single IIFE at `dist/content.js`. The `src/` files use standard ESM imports — esbuild resolves them at build time. TypeScript is type-checked implicitly via `tsconfig.json`; there is no separate `tsc` step.

## Selector fragility

`findHistoryRoot()` tries four selectors in order before falling back to `document.body`. If highlighting stops working after a Jira update, inspect the activity section and update this list in `content.ts`:

```
[data-testid="issue-activity-feed"]
[data-test-id="issue-activity-feed"]
#activity-section
[aria-label*="Activity"]
```
