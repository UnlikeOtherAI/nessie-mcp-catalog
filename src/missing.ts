import { z } from 'zod'
import { ObservationSchema } from './model.ts'
import type { Observation } from './model.ts'
import { Timestamp } from './wire.ts'
import { identityId } from './identity.ts'
export const MissingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  entries: z.array(z.strictObject({ sourceId: z.string(), nativeId: z.string(),
    firstMissedAt: Timestamp, lastCountedAt: Timestamp, misses: z.number().int().min(1).max(2),
    observation: ObservationSchema })).max(100_000),
})
export type MissingState = z.infer<typeof MissingSchema>
export function reconcileMissing(previous: Observation[], current: Observation[], state: MissingState,
  sourceId: string, now: string): MissingState {
  const present = new Set(current.map((item) => item.nativeId))
  const currentIdentities = new Set(current.flatMap((item) => item.identity ? [identityId(item.identity)] : []))
  const superseded = (item: Observation): boolean => item.identity !== null && currentIdentities.has(identityId(item.identity))
  const pending = new Map(state.entries.filter((item) => item.sourceId === sourceId).map((item) => [item.nativeId, item]))
  for (const item of previous) {
    if (present.has(item.nativeId) || superseded(item) || pending.has(item.nativeId)) continue
    pending.set(item.nativeId, { sourceId, nativeId: item.nativeId,
      firstMissedAt: now, lastCountedAt: now, misses: 1, observation: item })
  }
  for (const [key, item] of pending) {
    if (present.has(key) || superseded(item.observation)) { pending.delete(key); continue }
    if (item.misses === 1 && Date.parse(now) - Date.parse(item.lastCountedAt) >= 86_400_000) {
      item.misses = 2
      item.lastCountedAt = now
    }
  }
  return { schemaVersion: 1, entries: [...state.entries.filter((item) => item.sourceId !== sourceId), ...pending.values()]
    .sort((a, b) => `${a.sourceId}:${a.nativeId}`.localeCompare(`${b.sourceId}:${b.nativeId}`)) }
}
export function missingObservations(state: MissingState): Observation[] {
  return state.entries.map((item) => ({ ...item.observation,
    lifecycle: item.misses === 2 && item.observation.lifecycle === 'active' ? 'deprecated' : item.observation.lifecycle,
    unresolvedReason: item.misses === 2 ? 'Absent from two complete snapshots at least 24 hours apart.' : item.observation.unresolvedReason }))
}
