import { fetchDescriptionChanges } from './changelog'
import { computeDiff } from './diff'
import type { DescriptionChange } from './types'

const STYLE_ID = 'jira-diff-styles'
const PROCESSED_ATTR = 'data-jd-done'

const STYLES = `
.jd-removed {
  background: #fee2e2;
  color: #b91c1c;
  text-decoration: line-through;
  border-radius: 2px;
  padding: 0 1px;
}
.jd-added {
  background: #dcfce7;
  color: #15803d;
  border-radius: 2px;
  padding: 0 1px;
}
.jd-fold {
  display: block;
  color: #9ca3af;
  font-style: italic;
  margin: 2px 0;
  user-select: none;
}
`

// Number of context words kept on each side of a folded region
const CONTEXT_WORDS = 8

// Minimum normalized length for a leaf to count as a description value
const MIN_TEXT_LEN = 20

// Separator for the (from, to) pair key — never appears in rendered text
const PAIR_SEP = '␟'

// History rows in the activity feed (see CLAUDE.md if highlighting breaks)
const HISTORY_ITEM_SELECTORS = [
  '[data-testid="issue-history.ui.history-items.generic-history-item.history-item"]',
  '[data-testid$="generic-history-item.history-item"]',
  '[data-testid$="history-item.history-item"]',
]

// Activity feed roots, tried in order. Never fall back to document.body:
// the diff would get injected into the live description field.
const HISTORY_ROOT_SELECTORS = [
  '[data-testid="issue-activity-feed.feed-display-with-intersection-observer"]',
  '[data-testid^="issue-activity-feed.feed"]',
  '[data-testid="issue-activity-feed"]',
  '[data-test-id="issue-activity-feed"]',
  '#activity-section',
  '[aria-label*="Activity"]',
]

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

const pairKey = (from: string, to: string): string =>
  norm(from) + PAIR_SEP + norm(to)

// Folds an unchanged block of text: keeps only a few context words on each
// side, the middle becomes a […] marker.
const collapse = (value: string, isFirst: boolean, isLast: boolean): string => {
  const tokens = value.split(/\s+/).filter(Boolean)
  if (tokens.length <= CONTEXT_WORDS * 2) return esc(value)

  const head = esc(tokens.slice(0, CONTEXT_WORDS).join(' '))
  const tail = esc(tokens.slice(-CONTEXT_WORDS).join(' '))
  const fold = '<span class="jd-fold">[…]</span>'

  if (isFirst) return `${fold} ${tail} `
  if (isLast) return ` ${head} ${fold}`
  return ` ${head} ${fold} ${tail} `
}

// Single-column unified diff: removals struck through in red, additions in
// green, unchanged regions folded.
const renderUnified = (from: string, to: string): string => {
  const parts = computeDiff(from, to)
  return parts
    .map((c, i) => {
      if (c.added) return `<span class="jd-added">${esc(c.value)}</span>`
      if (c.removed) return `<span class="jd-removed">${esc(c.value)}</span>`
      return collapse(c.value, i === 0, i === parts.length - 1)
    })
    .join('')
}

const injectStyles = (): void => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLES
  document.head.appendChild(style)
}

const findHistoryRoot = (): Element | null =>
  HISTORY_ROOT_SELECTORS.map(s => document.querySelector(s)).find(Boolean) ?? null

// Leaf elements with substantial text, in document order — the candidate
// from/to value nodes inside a history row.
const valueLeaves = (container: Element): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('*')).filter(
    el => el.children.length === 0 && norm(el.textContent ?? '').length >= MIN_TEXT_LEN
  )

// Hide the arrow and "to" column, expand the "from" column to full width.
// Jira pins sizes with !important, so the overrides must be !important too.
const toSingleColumn = (fromLeaf: HTMLElement, toLeaf: HTMLElement): void => {
  let common: Element | null = fromLeaf
  while (common && !common.contains(toLeaf)) common = common.parentElement
  if (!common) return

  for (const block of Array.from(common.children) as HTMLElement[]) {
    if (!block.contains(fromLeaf)) {
      block.style.display = 'none'
      continue
    }
    block.style.setProperty('flex', '1 1 100%', 'important')
    block.style.setProperty('width', '100%', 'important')
    block.style.setProperty('max-width', 'none', 'important')
  }
}

// Find the adjacent leaf pair matching a known change, render the unified
// diff into the "from" leaf. Scanning adjacent pairs tolerates an extra
// non-value leaf in the row (e.g. a label).
const renderInContainer = (
  container: Element,
  byPair: Map<string, DescriptionChange>
): DescriptionChange | null => {
  const leaves = valueLeaves(container)
  for (let i = 0; i < leaves.length - 1; i++) {
    const change = byPair.get(pairKey(leaves[i].textContent ?? '', leaves[i + 1].textContent ?? ''))
    if (!change) continue
    leaves[i].innerHTML = renderUnified(change.from, change.to)
    toSingleColumn(leaves[i], leaves[i + 1])
    return change
  }
  return null
}

const highlightChangesInDOM = (changes: DescriptionChange[]): void => {
  // Keyed by the (from, to) pair: chained edits share boundary text, so a
  // per-side key attributes diffs to the wrong row (see CLAUDE.md).
  const byPair = new Map(
    changes
      .filter(c => norm(c.from).length >= MIN_TEXT_LEN && norm(c.to).length >= MIN_TEXT_LEN)
      .map(c => [pairKey(c.from, c.to), c] as const)
  )

  const root = findHistoryRoot()
  if (!root) {
    console.warn('[Jira Diff] activity feed not found, skipping (selectors may need updating)')
    return
  }

  for (const container of Array.from(root.querySelectorAll(HISTORY_ITEM_SELECTORS.join(',')))) {
    if (container.getAttribute(PROCESSED_ATTR)) continue
    const change = renderInContainer(container, byPair)
    if (change) {
      container.setAttribute(PROCESSED_ATTR, '1')
      renderedIds.add(change.id)
    }
  }

  const missing = changes.length - renderedIds.size
  if (missing > 0) {
    console.warn(`[Jira Diff] ${missing}/${changes.length} change(s) not matched in the DOM (history not fully rendered, or row markup changed)`)
  }
}

const getIssueKey = (): string | null => {
  const browseMatch = window.location.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/)
  if (browseMatch) return browseMatch[1]
  const params = new URLSearchParams(window.location.search)
  return params.get('selectedIssue') ?? params.get('issueKey')
}

let pendingChanges: DescriptionChange[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null
// Disconnected before each re-init so observers don't pile up on SPA navigation
let highlightObserver: MutationObserver | null = null
// ids of changes already rendered
const renderedIds = new Set<string>()

const scheduleHighlight = (): void => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (pendingChanges.length > 0) highlightChangesInDOM(pendingChanges)
  }, 300)
}

const init = async (): Promise<void> => {
  const issueKey = getIssueKey()
  if (!issueKey) return

  renderedIds.clear()
  injectStyles()

  try {
    pendingChanges = await fetchDescriptionChanges(issueKey)
    if (pendingChanges.length === 0) return

    // First pass (history may already be in the DOM), then watch lazy loads
    highlightChangesInDOM(pendingChanges)
    highlightObserver?.disconnect()
    highlightObserver = new MutationObserver(scheduleHighlight)
    highlightObserver.observe(document.body, { childList: true, subtree: true })
  } catch (err) {
    console.error('[Jira Diff]', err)
  }
}

// SPA navigation detection
let lastUrl = window.location.href
const navObserver = new MutationObserver(() => {
  if (window.location.href === lastUrl) return
  lastUrl = window.location.href
  pendingChanges = []
  renderedIds.clear()
  setTimeout(init, 1500)
})
navObserver.observe(document.body, { childList: true, subtree: true })

init()
