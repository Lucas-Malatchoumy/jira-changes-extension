import { fetchDescriptionChanges } from './changelog'
import { computeDiff } from './diff'
import type { DescriptionChange } from './types'

const STYLE_ID = 'jira-diff-styles'
const PROCESSED_ATTR = 'data-jd-done'

const STYLES = `
.jd-removed {
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 2px;
  padding: 0 1px;
}
.jd-added {
  background: #dcfce7;
  color: #15803d;
  border-radius: 2px;
  padding: 0 1px;
}
`

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

// Colonne "Avant" : garde les suppressions, enlève les ajouts
const renderFrom = (from: string, to: string): string =>
  computeDiff(from, to)
    .filter(c => !c.added)
    .map(c => c.removed ? `<span class="jd-removed">${esc(c.value)}</span>` : esc(c.value))
    .join('')

// Colonne "Après" : garde les ajouts, enlève les suppressions
const renderTo = (from: string, to: string): string =>
  computeDiff(from, to)
    .filter(c => !c.removed)
    .map(c => c.added ? `<span class="jd-added">${esc(c.value)}</span>` : esc(c.value))
    .join('')

const injectStyles = (): void => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLES
  document.head.appendChild(style)
}

// Cherche la section history/activity pour limiter le scan DOM
const findHistoryRoot = (): Element =>
  document.querySelector('[data-testid="issue-activity-feed"]') ??
  document.querySelector('[data-test-id="issue-activity-feed"]') ??
  document.querySelector('#activity-section') ??
  document.querySelector('[aria-label*="Activity"]') ??
  document.body

const highlightChangesInDOM = (changes: DescriptionChange[]): void => {
  // Map normalisé pour lookup O(1) pendant le walk DOM
  const fromMap = new Map<string, DescriptionChange>()
  const toMap = new Map<string, DescriptionChange>()

  for (const change of changes) {
    const nf = norm(change.from)
    const nt = norm(change.to)
    if (nf.length > 20) fromMap.set(nf, change)
    if (nt.length > 20) toMap.set(nt, change)
  }

  const root = findHistoryRoot()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)

  let node: Element | null
  while ((node = walker.nextNode() as Element | null)) {
    // Ignore les éléments déjà traités ou trop profonds (containers, pas feuilles)
    if (node.getAttribute(PROCESSED_ATTR)) continue
    if (node.children.length > 3) continue

    const text = norm(node.textContent ?? '')
    if (text.length < 20) continue

    const fromChange = fromMap.get(text)
    if (fromChange) {
      node.setAttribute(PROCESSED_ATTR, '1')
      node.innerHTML = renderFrom(fromChange.from, fromChange.to)
      continue
    }

    const toChange = toMap.get(text)
    if (toChange) {
      node.setAttribute(PROCESSED_ATTR, '1')
      node.innerHTML = renderTo(toChange.from, toChange.to)
    }
  }
}

const getIssueKey = (): string | null => {
  const browseMatch = window.location.pathname.match(/\/browse\/([A-Z]+-\d+)/)
  if (browseMatch) return browseMatch[1]
  const params = new URLSearchParams(window.location.search)
  return params.get('selectedIssue') ?? params.get('issueKey')
}

let pendingChanges: DescriptionChange[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const scheduleHighlight = (): void => {
  if (debounceTimer) clearTimeout(debounceTimer)
  // Debounce : Jira fait souvent plusieurs mutations d'affilée lors du rendu
  debounceTimer = setTimeout(() => {
    if (pendingChanges.length > 0) highlightChangesInDOM(pendingChanges)
  }, 300)
}

const init = async (): Promise<void> => {
  const issueKey = getIssueKey()
  if (!issueKey) return

  injectStyles()

  try {
    pendingChanges = await fetchDescriptionChanges(issueKey)
    if (pendingChanges.length === 0) return

    // Premier passage (history peut déjà être dans le DOM)
    highlightChangesInDOM(pendingChanges)

    // Surveille les chargements lazy (l'utilisateur clique sur l'onglet History)
    const observer = new MutationObserver(scheduleHighlight)
    observer.observe(document.body, { childList: true, subtree: true })
  } catch (err) {
    console.error('[Jira Diff]', err)
  }
}

// Détection navigation SPA
let lastUrl = window.location.href
const navObserver = new MutationObserver(() => {
  if (window.location.href === lastUrl) return
  lastUrl = window.location.href
  pendingChanges = []
  setTimeout(init, 1500)
})
navObserver.observe(document.body, { childList: true, subtree: true })

init()
