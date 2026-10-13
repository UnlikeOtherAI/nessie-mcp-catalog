import { mkdir, writeFile } from 'node:fs/promises'
import { digest, json, sha256 } from '../src/hash.ts'
import { ApprovalSchema, CatalogSchema, ManifestSchema, type Entry } from '../src/wire.ts'

const identity = { kind: 'registry' as const, name: 'com.example/weather' }
const remotes = [{
  id: 'primary', transport: 'http' as const, url: 'https://mcp.example.com/weather',
  auth: { method: 'none' as const, headerName: null, valuePrefix: null, hint: null, scopes: [] },
  version: '1.0.0',
}]
const entry: Entry = {
  id: 'registry:com.example/weather', identity,
  sourceRefs: [{ sourceId: 'official-registry', nativeId: 'com.example/weather@1.0.0',
    revision: 'fixture-v1', path: null, url: 'https://registry.modelcontextprotocol.io/v0.1/servers',
    digest: digest({ fixture: true }), license: 'CC0-1.0' }],
  metadata: { name: 'weather', displayName: 'Weather', description: 'Synthetic importer fixture.',
    vendor: 'Example', websiteUrl: 'https://example.com', repositoryUrl: null,
    documentationUrl: 'https://example.com/docs', categories: [], tags: [] },
  remotes, packages: [], lifecycle: 'active', materialDigest: digest({ identity, remotes, packages: [] }),
  nessieApproved: false, madeByNessie: false, approval: null, authorship: null,
}
const catalog = CatalogSchema.parse({ schemaVersion: 1, sequence: 1, entries: [entry] })
const catalogText = json(catalog)
const manifest = ManifestSchema.parse({
  schemaVersion: 1, publisher: 'UnlikeOtherAI/nessie-mcp-catalog', sequence: 1,
  generatedAt: '2026-10-13T00:00:00.000Z', complete: true, catalogPath: 'dist/catalog.json',
  catalogSha256: sha256(catalogText), entryCount: 1,
  sourceSnapshots: [{ id: 'official-registry', kind: 'registry',
    url: 'https://registry.modelcontextprotocol.io/v0.1/servers', revision: 'fixture-v1',
    sha256: digest({ fixture: true }), fetchedAt: '2026-10-13T00:00:00.000Z', license: 'CC0-1.0',
    adapterVersion: 1, observations: 1, status: 'complete', snapshotPath: 'inputs/official-registry/snapshot.json' }],
})
await mkdir('test/fixtures', { recursive: true })
await writeFile('test/fixtures/catalog-v1.json', catalogText)
await writeFile('test/fixtures/manifest-v1.json', json(manifest))
await writeFile('test/fixtures/approval-v1.json', json(ApprovalSchema.parse({
  policyVersion: 'approval-policy-v1', materialDigest: entry.materialDigest,
  testedAt: '2026-10-13T00:00:00.000Z', expiresAt: '2026-10-25T00:00:00.000Z',
  testedRemoteIds: ['primary'], nessieRevision: 'synthetic-nessie-revision', suiteRevision: 'synthetic-suite-revision',
  environment: 'isolated-fixture', checks: { compatibility: 'passed', readOnlyFunctional: 'passed',
    authScope: 'passed', securityReview: 'passed' }, evidenceUrl: 'https://example.com/synthetic-results',
  decisionUrl: 'https://example.com/synthetic-review', limitations: ['Synthetic fixture only; not a production approval.'],
})))
