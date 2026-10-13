import { ObservationsSchema } from '../model.ts'
import type { Observation } from '../model.ts'
import type { Snapshot } from '../wire.ts'
import { parseMarkdown } from './markdown.ts'
import { parseRegistry } from './registry.ts'
import { parseTensorblock } from './tensorblock.ts'

export function parseSource(body: string, snapshot: Snapshot): Observation[] {
  const observations = snapshot.kind === 'registry' ? parseRegistry(body, snapshot)
    : snapshot.kind === 'tensorblock' ? parseTensorblock(body, snapshot) : parseMarkdown(body, snapshot)
  if (!observations.length) throw new Error(`Source ${snapshot.id} unexpectedly has no observations`)
  return ObservationsSchema.parse(observations)
}
