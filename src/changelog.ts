import type { ChangelogEntry, DescriptionChange } from './types'

const PAGE_SIZE = 100

export const fetchDescriptionChanges = async (issueKey: string): Promise<DescriptionChange[]> => {
  const changes: DescriptionChange[] = []
  let startAt = 0
  let isLast = false

  while (!isLast) {
    const res = await fetch(
      `${window.location.origin}/rest/api/3/issue/${issueKey}/changelog?startAt=${startAt}&maxResults=${PAGE_SIZE}`
    )

    if (!res.ok) throw new Error(`Changelog fetch failed: ${res.status}`)

    const data = await res.json() as { values: ChangelogEntry[]; isLast: boolean }

    for (const entry of data.values) {
      const item = entry.items.find(i => i.field === 'description')
      if (item) changes.push({ id: entry.id, from: item.fromString ?? '', to: item.toString ?? '' })
    }

    isLast = data.isLast || data.values.length === 0
    startAt += data.values.length
  }

  return changes
}
