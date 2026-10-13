import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { compile } from './compile.ts'
import { parseSource } from './adapters/index.ts'
import { CurationSchema, LockSchema, ReviewSchema, SourcesSchema } from './model.ts'
import type { Observation, Review } from './model.ts'
import { CatalogSchema, ManifestSchema, PUBLISHER, Timestamp } from './wire.ts'
import type { Catalog, Manifest } from './wire.ts'
import { json, sha256 } from './hash.ts'
import { assertSanitized } from './sanitize.ts'
import { bindingMap, resolveIdentity } from './identity.ts'

export const PublicationSchema = z.strictObject({ sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), generatedAt: Timestamp })
export const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'))
export type Projection = { catalog: Catalog; manifest: Manifest; catalogText: string; observations: Map<string, Observation[]>; report: unknown }
export async function project(): Promise<Projection> {
  const lock = LockSchema.parse(await readJson('sources.lock.json'))
  const sources = SourcesSchema.parse(await readJson('sources.json')).sources
  if (lock.snapshots.length !== sources.length || sources.some((source) => !lock.snapshots.some((item) => item.id === source.id))) {
    throw new Error('Every enabled source needs a complete snapshot')
  }
  const publication = PublicationSchema.parse(await readJson('publication.json'))
  const observations = new Map<string, Observation[]>()
  for (const snapshot of lock.snapshots) {
    const body = await readFile(snapshot.snapshotPath, 'utf8')
    if (sha256(body) !== snapshot.sha256) throw new Error(`Snapshot digest mismatch: ${snapshot.id}`)
    const parsed = parseSource(body, snapshot)
    if (new Set(parsed.map((item) => item.nativeId)).size !== parsed.length) throw new Error(`Duplicate source keys: ${snapshot.id}`)
    for (const item of parsed) if (Buffer.byteLength(JSON.stringify(item)) > 64 * 1024) throw new Error('Observation size limit exceeded')
    observations.set(snapshot.id, parsed)
    snapshot.observations = parsed.length
  }
  const curation = CurationSchema.parse(await readJson('curation/entries.json'))
  const reviews = new Map<string, Review>()
  for (const entry of curation.entries) if (entry.reviewPath) reviews.set(entry.reviewPath, ReviewSchema.parse(await readJson(entry.reviewPath)))
  const identityMap = await readJson('curation/identity-map.json')
  const entries = compile([...observations.values()].flat(), identityMap, curation, reviews, publication.generatedAt)
  const catalog = CatalogSchema.parse({ schemaVersion: 1, sequence: publication.sequence, entries })
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error('Duplicate canonical IDs')
  // Compact JSON keeps the measured 43k-entry catalog below GitHub's single-file bound.
  const catalogText = `${JSON.stringify(catalog)}\n`
  if (Buffer.byteLength(catalogText) > 80 * 1024 * 1024) throw new Error('Catalog exceeds 80 MiB publication limit')
  const manifest = ManifestSchema.parse({ schemaVersion: 1, publisher: PUBLISHER, ...publication,
    complete: true, catalogPath: 'dist/catalog.json', catalogSha256: sha256(catalogText),
    entryCount: entries.length, sourceSnapshots: lock.snapshots })
  assertSanitized(catalog)
  const report = { schemaVersion: 1, ...publication,
    sources: lock.snapshots.map((item) => ({ id: item.id, revision: item.revision, observations: item.observations,
      remoteCandidates: observations.get(item.id)!.filter((observation) => observation.remotes.length).length })),
    observations: [...observations.values()].reduce((sum, list) => sum + list.length, 0),
    canonicalEntries: entries.length, remoteEntries: entries.filter((entry) => entry.remotes.length > 0).length,
    packageOnlyEntries: entries.filter((entry) => !entry.remotes.length && entry.packages.length).length,
    multiSourceEntries: entries.filter((entry) => new Set(entry.sourceRefs.map((ref) => ref.sourceId)).size > 1).length,
    approvedEntries: entries.filter((entry) => entry.nessieApproved).length,
    madeByNessieEntries: entries.filter((entry) => entry.madeByNessie).length,
    catalogBytes: Buffer.byteLength(catalogText),
    unresolvedObservations: [...observations.values()].flat().filter((item) => resolveIdentity(item, bindingMap(identityMap)) === null).length,
    limitations: ['Directory observations without a strong identity binding remain pending; remote candidates are not tested installations.',
      'All upstream trust/verification claims remain upstream assertions. No third-party server was executed or approved.'] }
  return { catalog, manifest, catalogText, observations, report }
}
export async function writeProjection(projection: Projection): Promise<void> {
  await mkdir('dist', { recursive: true })
  await mkdir('observations', { recursive: true })
  await mkdir('reports', { recursive: true })
  await writeFile('dist/catalog.json', projection.catalogText)
  await writeFile('dist/manifest.json', json(projection.manifest))
  for (const [id, observations] of projection.observations) {
    await writeFile(`observations/${id}.json`, `${JSON.stringify(observations)}\n`)
  }
  await writeFile('reports/catalog-report.json', json(projection.report))
}
