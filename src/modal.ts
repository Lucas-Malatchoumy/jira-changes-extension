import type { DescriptionChange } from './types'
import { computeDiff } from './diff'

const MODAL_ID = 'jira-diff-modal'
const STYLE_ID = 'jira-diff-styles'

const STYLES = `
#jira-diff-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
#jira-diff-inner {
  background: #fff;
  border-radius: 8px;
  width: 80vw;
  max-width: 900px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
}
#jira-diff-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e0e3ea;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
#jira-diff-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #172b4d;
}
#jira-diff-nav {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: #6b778c;
}
#jira-diff-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.jd-meta {
  font-size: 12px;
  color: #6b778c;
  margin-bottom: 12px;
}
.jd-content {
  font-size: 14px;
  line-height: 1.7;
  color: #172b4d;
  background: #f4f5f7;
  padding: 16px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}
.jd-added {
  background: #dcfce7;
  color: #15803d;
  border-radius: 2px;
  padding: 0 1px;
}
.jd-removed {
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 2px;
  padding: 0 1px;
  text-decoration: line-through;
}
#jira-diff-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: #6b778c;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}
#jira-diff-close:hover { background: #f4f5f7; }
.jd-nav-btn {
  background: #f4f5f7;
  border: none;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  color: #172b4d;
}
.jd-nav-btn:hover:not(:disabled) { background: #dde0ea; }
.jd-nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
`

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const escape = (str: string): string =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const renderDiff = (change: DescriptionChange): string =>
  computeDiff(change.from, change.to)
    .map(chunk => {
      const text = escape(chunk.value)
      if (chunk.added) return `<span class="jd-added">${text}</span>`
      if (chunk.removed) return `<span class="jd-removed">${text}</span>`
      return text
    })
    .join('')

const handleEsc = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') closeModal()
}

export const closeModal = (): void => {
  document.getElementById(MODAL_ID)?.remove()
  document.removeEventListener('keydown', handleEsc)
}

export const openModal = (changes: DescriptionChange[]): void => {
  closeModal()

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLES
    document.head.appendChild(style)
  }

  let index = changes.length - 1

  const modal = document.createElement('div')
  modal.id = MODAL_ID

  const render = (): void => {
    const change = changes[index]
    modal.innerHTML = `
      <div id="jira-diff-inner">
        <div id="jira-diff-header">
          <h2>Historique des descriptions</h2>
          <div style="display:flex;align-items:center;gap:12px">
            <div id="jira-diff-nav">
              <button class="jd-nav-btn" id="jd-prev" ${index === 0 ? 'disabled' : ''}>&#8592; Précédent</button>
              <span>${index + 1} / ${changes.length}</span>
              <button class="jd-nav-btn" id="jd-next" ${index === changes.length - 1 ? 'disabled' : ''}>Suivant &#8594;</button>
            </div>
            <button id="jira-diff-close">&times;</button>
          </div>
        </div>
        <div id="jira-diff-body">
          <div class="jd-meta">
            Modifié par <strong>${escape(change.author)}</strong> le ${formatDate(change.created)}
          </div>
          <div class="jd-content">${renderDiff(change)}</div>
        </div>
      </div>
    `

    modal.querySelector('#jira-diff-close')!.addEventListener('click', closeModal)
    modal.querySelector('#jd-prev')?.addEventListener('click', () => {
      if (index > 0) { index--; render() }
    })
    modal.querySelector('#jd-next')?.addEventListener('click', () => {
      if (index < changes.length - 1) { index++; render() }
    })
  }

  render()
  modal.addEventListener('click', e => { if (e.target === modal) closeModal() })
  document.addEventListener('keydown', handleEsc)
  document.body.appendChild(modal)
}
