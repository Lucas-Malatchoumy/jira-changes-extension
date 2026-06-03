# Jira Description Diff

Chrome extension that highlights word-level changes in Jira's issue description history.

Jira's built-in history only shows the old and new description side by side with no indication of what actually changed. This extension automatically highlights added words in green and removed words in red, directly in the page.

![Before / After example](docs/preview.png)

## Installation

### From source (developer mode)

**Requirements:** Node.js 18+

```bash
git clone https://github.com/YOUR_USERNAME/jira-diff.git
cd jira-diff
npm install
npm run build
```

Then load the extension in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked**
4. Select the `jira-diff` folder

The extension is now active on all `*.atlassian.net` pages.

## Usage

Open any Jira issue, scroll to the **Activity** section, and click **History**. Description changes will automatically show highlighted diffs — no button to click, no reload needed.

- Green background = words added in this version
- Red background with strikethrough = words removed in this version

If you navigate between issues, the highlighting re-applies automatically.

## Development

```bash
npm run watch   # rebuilds on every file save
```

After each rebuild, go to `chrome://extensions` and click the refresh icon on the extension card, then reload the Jira page.

## Compatibility

- Jira Cloud (`*.atlassian.net`) only
- Chrome 88+ (Manifest V3)

## How it works

On each issue page, the extension calls Jira's REST API (`/rest/api/3/issue/{key}/changelog`) using your existing session — no API token required. It then scans the history section of the DOM and injects highlight spans into the existing text elements, without altering Jira's layout.

## Troubleshooting

**Nothing is highlighted after opening History**

Jira occasionally changes the CSS class names and `data-testid` attributes of its history section. Open the browser console on the Jira page and look for `[Jira Diff]` error messages. If the history root element can't be found, inspect the Activity section and update the selectors in `src/content.ts` → `findHistoryRoot()`, then rebuild.
