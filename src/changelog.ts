import type { ChangelogEntry, DescriptionChange } from './types'

export const fetchDescriptionChanges = async (issueKey: string): Promise<DescriptionChange[]> => {
  const res = await fetch(
    `${window.location.origin}/rest/api/3/issue/${issueKey}/changelog?maxResults=100`
  )

  if (!res.ok) throw new Error(`Changelog fetch failed: ${res.status}`)

  const data = await res.json() as { values: ChangelogEntry[] }

  return data.values
    .filter(entry => entry.items.some(item => item.field === 'description'))
    .map(entry => {
      const item = entry.items.find(i => i.field === 'description')!
      return {
        id: entry.id,
        created: entry.created,
        author: entry.author.displayName,
        from: item.fromString ?? '',
        to: item.toString ?? '',
      }
    })
}
