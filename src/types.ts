export type ChangelogItem = {
  field: string
  fromString: string | null
  toString: string | null
}

export type ChangelogEntry = {
  id: string
  items: ChangelogItem[]
}

export type DescriptionChange = {
  id: string
  from: string
  to: string
}
