import { diffWords } from 'diff'

export type DiffChunk = {
  value: string
  added: boolean
  removed: boolean
}

export const computeDiff = (from: string, to: string): DiffChunk[] =>
  diffWords(from, to).map(change => ({
    value: change.value,
    added: change.added ?? false,
    removed: change.removed ?? false,
  }))
