import { digest } from './hash.ts'
import { bindingMap, identityId, resolveIdentity } from './identity.ts'
import { CurationSchema } from './model.ts'
import type { Observation, Review } from './model.ts'
import { EntrySchema } from './wire.ts'
import type { Entry, Identity, Metadata } from './wire.ts'

const EMPTY_METADATA: Metadata = { name: 'mcp-server', displayName: 'MCP server', description: '', vendor: null,
  websiteUrl: null, repositoryUrl: null, documentationUrl: null, categories: [], tags: [] }
export const materialDigest = (entry: Pick<Entry, 'identity' | 'remotes' | 'packages'>): string =>
  digest({ identity: entry.identity, remotes: entry.remotes, packages: entry.packages })

export function compile(observations: Observation[], identityMap: unknown, curationInput: unknown,
  reviews: Map<string, Review>, generatedAt: string): Entry[] {
  const bindings = bindingMap(identityMap)
  const groups = new Map<string, { identity: Identity; observations: Observation[] }>()
  for (const observation of observations) {
    if (!observation.selected) continue
    const identity = resolveIdentity(observation, bindings)
    if (!identity) continue
    const id = identityId(identity)
    const group = groups.get(id) ?? { identity, observations: [] }
    group.observations.push(observation)
    groups.set(id, group)
  }
  const entries = new Map<string, Entry>()
  for (const [id, group] of groups) {
    group.observations.sort((a, b) => (a.sourceRef.sourceId === 'official-registry' ? -1 : 0)
      - (b.sourceRef.sourceId === 'official-registry' ? -1 : 0)
      || a.sourceRef.sourceId.localeCompare(b.sourceRef.sourceId) || a.nativeId.localeCompare(b.nativeId))
    const primary = group.observations[0]
    const blocked = group.observations.some((item) => item.lifecycle === 'withdrawn')
    const entry: Entry = { id, identity: group.identity,
      metadata: primary.metadata,
      remotes: primary.remotes, packages: primary.packages,
      lifecycle: blocked ? 'withdrawn' : primary.lifecycle,
      sourceRefs: group.observations.map((item) => item.sourceRef), materialDigest: '',
      nessieApproved: false, madeByNessie: false, approval: null, authorship: null }
    entry.materialDigest = materialDigest(entry)
    entries.set(id, entry)
  }
  const curation = CurationSchema.parse(curationInput)
  const curatedIds = new Set<string>()
  for (const override of curation.entries) {
    if (override.id !== identityId(override.identity) || curatedIds.has(override.id)) throw new Error('Invalid or duplicate curated identity')
    curatedIds.add(override.id)
    const existing = entries.get(override.id)
    const entry: Entry = existing ?? { id: override.id, identity: override.identity, metadata: { ...EMPTY_METADATA },
      sourceRefs: [], remotes: [], packages: [], lifecycle: 'active', materialDigest: '',
      nessieApproved: false, madeByNessie: false, approval: null, authorship: null }
    entry.metadata = { ...entry.metadata, ...override.metadata }
    if (override.remotes !== undefined) entry.remotes = override.remotes
    if (override.packages !== undefined) entry.packages = override.packages
    if (override.lifecycle !== undefined && entry.lifecycle !== 'withdrawn') entry.lifecycle = override.lifecycle
    entry.sourceRefs.push({ sourceId: 'nessie-curation', nativeId: override.legacyLibraryKey ?? override.id, revision: override.sourceRevision,
      path: 'curation/entries.json', url: override.sourceUrl, digest: digest(override), license: 'MIT' })
    entry.materialDigest = materialDigest(entry)
    const review = override.reviewPath ? reviews.get(override.reviewPath) : undefined
    if (override.nessieApproved && !review) throw new Error('Requested approval has no review evidence')
    entry.approval = review?.approval ?? null
    const now = Date.parse(generatedAt)
    if (review) {
      const evidence = review.approval
      const validity = Date.parse(evidence.expiresAt) - Date.parse(evidence.testedAt)
      const maxDays = entry.remotes.length ? 30 : 90
      if (validity <= 0 || validity > maxDays * 86_400_000 || Date.parse(evidence.testedAt) > now) throw new Error('Invalid approval validity window')
      entry.nessieApproved = override.nessieApproved && !review.revoked && entry.lifecycle === 'active'
        && evidence.materialDigest === entry.materialDigest && Date.parse(evidence.expiresAt) > now
    }
    if (override.madeByNessie && (!override.authorship || override.authorship.componentId !== override.id)) {
      throw new Error('Authorship requires evidence for this exact component')
    }
    entry.madeByNessie = override.madeByNessie
    entry.authorship = override.authorship
    entries.set(entry.id, entry)
  }
  return [...entries.values()].sort((a, b) => a.id.localeCompare(b.id)).map((entry) => EntrySchema.parse(entry))
}
