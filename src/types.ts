export type ChangelogItem = {
  field: string
  fromString: string | null
  toString: string | null
}

export type ChangelogEntry = {
  id: string
  created: string
  author: { displayName: string }
  items: ChangelogItem[]
}

export type DescriptionChange = {
  id: string
  created: string
  author: string
  from: string
  to: string
}
