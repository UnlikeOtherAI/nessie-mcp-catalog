import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile, materialDigest } from '../src/compile.ts'
import { bindingMap, identityId } from '../src/identity.ts'
import { digest } from '../src/hash.ts'
import { MissingSchema, missingObservations, reconcileMissing } from '../src/missing.ts'
import { CatalogSchema, ApprovalSchema, ManifestSchema } from '../src/wire.ts'
import type { Entry } from '../src/wire.ts'
import type { Observation, Review } from '../src/model.ts'

const catalog = CatalogSchema.parse(JSON.parse(await readFile('test/fixtures/catalog-v1.json', 'utf8')))
const fixture = catalog.entries[0]
const emptyCuration = { schemaVersion: 1, entries: [] }
const emptyBindings = { schemaVersion: 1, bindings: [] }
const now = '2026-10-13T00:00:00.000Z'
function observation(sourceId = 'official-registry', identity: Entry['identity'] | null = fixture.identity): Observation {
  return { nativeId: 'fixture-listing', sourceRef: { ...fixture.sourceRefs[0], sourceId, nativeId: 'fixture-listing' },
    identity, metadata: structuredClone(fixture.metadata), remotes: structuredClone(fixture.remotes),
    packages: [], lifecycle: 'active', selected: true, links: [], unresolvedReason: null }
}
function review(entry = fixture): Review {
  return { revoked: false, approval: ApprovalSchema.parse({ policyVersion: 'approval-policy-v1',
    materialDigest: materialDigest(entry), testedAt: now, expiresAt: '2026-10-25T00:00:00.000Z',
    testedRemoteIds: ['primary'], nessieRevision: 'fixture-nessie-sha', suiteRevision: 'fixture-suite-sha',
    environment: 'isolated-fixture', checks: { compatibility: 'passed', readOnlyFunctional: 'passed',
      authScope: 'passed', securityReview: 'passed' }, evidenceUrl: 'https://example.com/test-run',
    decisionUrl: 'https://example.com/review', limitations: ['Synthetic evidence; never a production approval.'] }) }
}
function curated(approved = false, authored = false) {
  return { id: fixture.id, identity: fixture.identity, metadata: {}, sourceUrl: 'https://example.com/docs',
    sourceRevision: 'fixture', reason: 'Explicit fixture component review.', nessieApproved: approved,
    madeByNessie: authored, reviewPath: approved ? 'reviews/weather/fixture.json' : null,
    authorship: authored ? { componentId: fixture.id, repositoryUrl: 'https://github.com/example/weather',
      revision: 'fixture', evidenceUrl: 'https://example.com/source', decisionUrl: 'https://example.com/pr' } : null }
}
const compileOne = (entry: ReturnType<typeof curated>, evidence = review(), observed = observation()) =>
  compile([observed], emptyBindings, { schemaVersion: 1, entries: [entry] },
    new Map([['reviews/weather/fixture.json', evidence]]), now)[0]

test('wire schemas reject extra fields, incomplete snapshots and executable configuration', async () => {
  assert.throws(() => CatalogSchema.parse({ ...catalog, arbitrary: true }))
  assert.throws(() => CatalogSchema.parse({ ...catalog, entries: [{ ...fixture, command: 'npx unsafe' }] }))
  const manifest = JSON.parse(await readFile('test/fixtures/manifest-v1.json', 'utf8'))
  assert.throws(() => ManifestSchema.parse({ ...manifest, complete: false }))
  assert.throws(() => ManifestSchema.parse({ ...manifest, entryCount: 100001 }))
})

test('names, shared repositories and equal URLs never create identity bindings', () => {
  const a = observation('list-a', null)
  const b = observation('list-b', null)
  assert.equal(compile([a, b], emptyBindings, emptyCuration, new Map(), now).length, 0)
  const c = observation('official-registry', { kind: 'registry', name: 'org.example/component-two' })
  assert.equal(compile([observation(), c], emptyBindings, emptyCuration, new Map(), now).length, 2)
})

test('explicit component bindings merge corroboration deterministically and preserve override presence', () => {
  const a = observation('list-a', null)
  const bindings = { schemaVersion: 1, bindings: [{ sourceId: 'list-a', nativeId: a.nativeId,
    identity: fixture.identity, evidenceUrl: 'https://example.com/identity', reason: 'Explicitly reviewed component identity.' }] }
  const override = { ...curated(), metadata: { vendor: null, description: '', categories: [] } }
  const curation = { schemaVersion: 1, entries: [override] }
  const first = compile([a, observation()], bindings, curation, new Map(), now)
  const second = compile([observation(), a], bindings, curation, new Map(), now)
  assert.deepEqual(first, second)
  assert.equal(first[0].sourceRefs.length, 3)
  assert.equal(first[0].metadata.description, '')
  assert.equal(first[0].metadata.vendor, null)
  assert.equal(first[0].nessieApproved, false)
  assert.equal(first[0].madeByNessie, false)
  assert.throws(() => bindingMap({ ...bindings, bindings: [...bindings.bindings, {
    ...bindings.bindings[0], identity: { kind: 'registry', name: 'org.example/impostor' } }] }))
})

test('monorepo components remain separate despite a common repository ID', () => {
  assert.notEqual(identityId({ kind: 'repository', repositoryId: 42, component: 'src/a' }),
    identityId({ kind: 'repository', repositoryId: 42, component: 'src/b' }))
})

test('approval and authorship are independent and require their own evidence', () => {
  for (const approved of [false, true]) for (const authored of [false, true]) {
    const entry = compileOne(curated(approved, authored))
    assert.equal(entry.nessieApproved, approved)
    assert.equal(entry.madeByNessie, authored)
  }
  assert.throws(() => compile([observation()], emptyBindings, { schemaVersion: 1, entries: [curated(true)] }, new Map(), now))
  assert.throws(() => compileOne({ ...curated(false, true), authorship: null }))
})

test('expired, revoked and material-mismatched approvals cannot remain true', () => {
  const expired = review()
  expired.approval.testedAt = '2026-10-01T00:00:00.000Z'
  expired.approval.expiresAt = '2026-10-12T00:00:00.000Z'
  assert.equal(compileOne(curated(true), expired).nessieApproved, false)
  assert.equal(compileOne(curated(true), { ...review(), revoked: true }).nessieApproved, false)
  const changed = observation()
  changed.remotes[0].url = 'https://mcp.example.com/v2'
  assert.equal(compileOne(curated(true), review(), changed).nessieApproved, false)
  const staleVariant = observation()
  staleVariant.remotes[0].id = 'replacement'
  assert.equal(compileOne(curated(true), review(), staleVariant).nessieApproved, false)
})

test('approval names tested remote variants and forbids an unknown auth contract', () => {
  for (const ids of [[], ['missing'], ['primary', 'primary']]) {
    const evidence = review()
    evidence.approval.testedRemoteIds = ids
    assert.throws(() => compileOne(curated(true), evidence))
  }
  const unknown = observation()
  unknown.remotes[0].auth.method = 'unknown'
  const evidence = review({ ...fixture, remotes: unknown.remotes })
  assert.throws(() => compileOne(curated(true), evidence, unknown))
  const long = review()
  long.approval.expiresAt = '2027-01-01T00:00:00.000Z'
  assert.throws(() => compileOne(curated(true), long))
})

test('withdrawal wins over a curated active override and invalidates approval', () => {
  const withdrawn = observation()
  withdrawn.lifecycle = 'withdrawn'
  const entry = compile([withdrawn], emptyBindings, { schemaVersion: 1,
    entries: [{ ...curated(true), lifecycle: 'active' }] }, new Map([['reviews/weather/fixture.json', review()]]), now)[0]
  assert.equal(entry.lifecycle, 'withdrawn')
  assert.equal(entry.nessieApproved, false)
})

test('absence needs two complete observations 24 hours apart, reappearance clears it', () => {
  const original = observation()
  const first = reconcileMissing([original], [], MissingSchema.parse({ schemaVersion: 1, entries: [] }), 'official-registry', now)
  assert.equal(missingObservations(first)[0].lifecycle, 'active')
  const sameDay = reconcileMissing([], [], structuredClone(first), 'official-registry', '2026-10-13T12:00:00.000Z')
  assert.equal(sameDay.entries[0].misses, 1)
  const second = reconcileMissing([], [], first, 'official-registry', '2026-10-14T00:00:00.000Z')
  assert.equal(missingObservations(second)[0].lifecycle, 'deprecated')
  assert.equal(reconcileMissing([], [original], second, 'official-registry', '2026-10-15T00:00:00.000Z').entries.length, 0)
})

test('material digest covers auth/version/runtime identity but ignores display-only copy', () => {
  assert.equal(materialDigest({ ...fixture, metadata: { ...fixture.metadata, description: 'Changed copy' } } as Entry), fixture.materialDigest)
  assert.notEqual(materialDigest({ ...fixture, packages: [{ registryType: 'npm', identifier: '@example/server', version: '2', transport: 'stdio' }] }), fixture.materialDigest)
  assert.equal(digest({ z: 1, a: 2 }), digest({ a: 2, z: 1 }))
})

test('a newly published version supersedes the old observation without a false missing record', () => {
  const old = observation()
  const latest = observation()
  latest.nativeId = 'fixture-listing@2'
  latest.remotes[0].version = '2'
  const state = reconcileMissing([old], [latest], { schemaVersion: 1, entries: [] }, 'official-registry', now)
  assert.equal(state.entries.length, 0)
})
