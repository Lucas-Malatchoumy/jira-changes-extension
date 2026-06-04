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

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

// Folds an unchanged block of text: keeps only a few context words on each
// side, the middle becomes a […] marker.
const collapse = (value: string, isFirst: boolean, isLast: boolean): string => {
  const tokens = value.split(/\s+/).filter(Boolean)
  if (tokens.length <= CONTEXT_WORDS * 2) return esc(value)

  const head = esc(tokens.slice(0, CONTEXT_WORDS).join(' '))
  const tail = esc(tokens.slice(-CONTEXT_WORDS).join(' '))
  const fold = '<span class="jd-fold">[…]</span>'

  // First block: no change before → only show the end (which precedes the first change)
  if (isFirst) return `${fold} ${tail} `
  // Last block: no change after → only show the start (which follows the last change)
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

// Finds the history/activity section to scope the DOM scan.
// Returns null if not found: we NEVER scan the whole page, otherwise the diff
// would get injected into the description field itself.
const findHistoryRoot = (): Element | null =>
  document.querySelector('[data-testid="issue-activity-feed.feed-display-with-intersection-observer"]') ??
  document.querySelector('[data-testid^="issue-activity-feed.feed"]') ??
  document.querySelector('[data-testid="issue-activity-feed"]') ??
  document.querySelector('[data-test-id="issue-activity-feed"]') ??
  document.querySelector('#activity-section') ??
  document.querySelector('[aria-label*="Activity"]')

const highlightChangesInDOM = (changes: DescriptionChange[]): void => {
  // Normalized maps for O(1) lookup during the DOM walk
  const fromMap = new Map<string, DescriptionChange>()
  const toMap = new Map<string, DescriptionChange>()

  for (const change of changes) {
    const nf = norm(change.from)
    const nt = norm(change.to)
    if (nf.length > 20) fromMap.set(nf, change)
    if (nt.length > 20) toMap.set(nt, change)
  }

  const root = findHistoryRoot()
  if (!root) {
    // activity section not (yet) rendered → leave everything alone
    console.warn('[Jira Diff] activity feed not found, skipping (selectors may need updating)')
    return
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)

  let node: Element | null
  while ((node = walker.nextNode() as Element | null)) {
    // Skip already-processed or too-deep elements (containers, not leaves)
    if (node.getAttribute(PROCESSED_ATTR)) continue
    if (node.children.length > 3) continue

    const text = norm(node.textContent ?? '')
    if (text.length < 20) continue

    // A single change shows up in two nodes: the "before" column (text == from)
    // and the "after" column (text == to). In unified view we keep only one.
    const change = fromMap.get(text) ?? toMap.get(text)
    if (!change) continue

    node.setAttribute(PROCESSED_ATTR, '1')

    if (renderedIds.has(change.id)) {
      // Twin column already covered by the unified diff → hide it
      ;(node as HTMLElement).style.display = 'none'
      continue
    }

    renderedIds.add(change.id)
    node.innerHTML = renderUnified(change.from, change.to)
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
// Observer for the history lazy-render, kept so it can be disconnected before
// each re-init (otherwise they pile up on every SPA navigation).
let highlightObserver: MutationObserver | null = null
// ids of changes already rendered (avoids re-rendering / dedupes the 2 columns)
const renderedIds = new Set<string>()

const scheduleHighlight = (): void => {
  if (debounceTimer) clearTimeout(debounceTimer)
  // Debounce: Jira often fires several mutations in a row while rendering
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

    // First pass (history may already be in the DOM)
    highlightChangesInDOM(pendingChanges)

    // Watch lazy loads (the user clicks the History tab).
    // Disconnect any observer from a previous init before creating a new one.
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
