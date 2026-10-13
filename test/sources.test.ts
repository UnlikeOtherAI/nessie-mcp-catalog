import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acquire } from '../src/acquire.ts'
import { parseSource } from '../src/adapters/index.ts'
import { FetchBudget, readPublic } from '../src/fetch.ts'
import { assertGeneratedPaths, isGeneratedPath } from '../src/generated-paths.ts'
import { digest } from '../src/hash.ts'
import { LockSchema, SourcesSchema } from '../src/model.ts'
import { assertSanitized, isPublicAddress, publicUrl, safeText, sanitizeJson } from '../src/sanitize.ts'
import type { Snapshot } from '../src/wire.ts'

const sources = SourcesSchema.parse(JSON.parse(await readFile('sources.json', 'utf8'))).sources
const lock = LockSchema.parse(JSON.parse(await readFile('sources.lock.json', 'utf8')))
const timestamp = '2026-10-13T00:00:00.000Z'
const snapshot = (id: string, kind: Snapshot['kind']): Snapshot => ({ id, kind, url: 'https://example.com/input', revision: 'fixture',
  sha256: digest({ fixture: true }), fetchedAt: timestamp, license: 'MIT', adapterVersion: 1,
  observations: 0, status: 'complete', snapshotPath: `inputs/${id}/snapshot.${kind === 'markdown' ? 'md' : 'json'}` })

test('every exact retained upstream input yields structural observations with matching counts', async () => {
  assert.equal(sources.length, 6)
  for (const pin of lock.snapshots) {
    const parsed = parseSource(await readFile(pin.snapshotPath, 'utf8'), pin)
    assert.equal(parsed.length, pin.observations, pin.id)
    assert.equal(new Set(parsed.map((item) => item.nativeId)).size, parsed.length)
    assertSanitized(parsed)
  }
})

test('Markdown headings bound server rows; HTML/sponsor links cannot become servers', () => {
  const body = '# Directory\n## Sponsors\n- [Sponsor](https://sponsor.example.com)\n## Server Implementations\n### Tools\n'
    + '- [Component](https://github.com/example/mono/tree/main/a) endpoint `https://mcp.example.com/a`\n'
    + '## Clients\n- [Client](https://example.com/client)\n<script>https://example.com/trap</script>\n'
  const parsed = parseSource(body, snapshot('punkpeye', 'markdown'))
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].identity, null)
  assert.deepEqual(parsed[0].remotes, [])
  assert.ok(parsed[0].links.includes('https://mcp.example.com/a'))
})

test('Registry lifecycle/transport stay structural; undeclared authentication remains unknown', () => {
  const input = [{ server: { name: 'org.example/server', version: '1', remotes: [
    { type: 'streamable-http', url: 'https://mcp.example.com' },
    { type: 'stdio', url: 'https://example.com/not-a-remote' }, { type: 'sse', url: 'http://127.0.0.1/private' }],
    packages: [{ registryType: 'npm', identifier: '@example/server', version: '1', transport: { type: 'stdio' } }] },
    _meta: { 'io.modelcontextprotocol.registry/official': { status: 'deleted', isLatest: true } } }]
  const result = parseSource(JSON.stringify(input), snapshot('official-registry', 'registry'))[0]
  assert.equal(result.lifecycle, 'withdrawn')
  assert.equal(result.remotes.length, 1)
  assert.equal(result.remotes[0].auth.method, 'unknown')
  assert.equal(result.packages[0].transport, 'stdio')
  input[0]._meta['io.modelcontextprotocol.registry/official'].status = 'invented'
  assert.throws(() => parseSource(JSON.stringify(input), snapshot('official-registry', 'registry')))
})

test('two Markdown components sharing one repository URL remain separate observations', () => {
  const body = '# Directory\n## Server Implementations\n'
    + '- [Database component](https://github.com/example/mono) component-a\n'
    + '- [Filesystem component](https://github.com/example/mono) component-b\n'
  const rows = parseSource(body, snapshot('punkpeye', 'markdown'))
  assert.equal(rows.length, 2)
  assert.notEqual(rows[0].nativeId, rows[1].nativeId)
})

test('Registry traversal rejects repeated cursors and never returns a partial snapshot', async () => {
  let calls = 0
  const reader: typeof readPublic = async () => {
    calls++
    return { body: JSON.stringify({ servers: [], metadata: { nextCursor: 'same' } }), status: 200, etag: null, retryAfter: null }
  }
  await assert.rejects(acquire(sources[0], timestamp, new FetchBudget(), reader), /repeated cursor/)
  assert.equal(calls, 2)
  await assert.rejects(acquire(sources[0], timestamp, new FetchBudget(), async () => {
    throw new Error('upstream failure')
  }), /upstream failure/)
})

test('TensorBlock retains native listing identities without inventing component proof', () => {
  const parsed = parseSource(JSON.stringify([{ id: 'one', name: 'Example', links: {
    repo: 'https://github.com/example/server', endpoint: 'https://mcp.example.com', docs: null },
    transport: ['streamable-http'], auth: { type: 'oauth2' }, verification: 'verified', source: {} }]), snapshot('tensorblock', 'tensorblock'))
  assert.equal(parsed[0].identity, null)
  assert.equal(parsed[0].remotes[0].auth.method, 'oauth2')
  assert.equal(parsed[0].nativeId, 'one')
})

test('credentials, executable defaults and private endpoint URLs do not survive sanitation', () => {
  const secret = `ghp_${'a'.repeat(32)}`
  const clean = sanitizeJson({ description: `text ${secret}`, password: 'fixture-private-value', command: 'npx arbitrary',
    headers: [{ name: 'Authorization', value: `Bearer ${secret}`, isSecret: true, isRequired: true }],
    url: 'https://user:password@example.com/mcp', nested: { default: 'fixture-private-value' } })
  const serialized = JSON.stringify(clean)
  assert.ok(!serialized.includes(secret))
  assert.ok(!serialized.includes('fixture-private-value'))
  assert.ok(!serialized.includes('npx arbitrary'))
  assertSanitized(clean)
  assert.throws(() => assertSanitized({ secret }))
  assert.equal(safeText('https://example.com/?api_key=fixture-secret'), '[REDACTED-URL]')
  for (const url of ['https://127.0.0.1', 'https://192.168.1.2', 'https://[::1]', 'https://localhost',
    'https://foo.internal', 'https://example.com/?access_token=private', 'http://example.com']) assert.equal(publicUrl(url), null)
})

test('fetch allowlist and total byte budget fail closed without network access', async () => {
  assert.equal(isPublicAddress('10.0.0.1'), false)
  assert.equal(isPublicAddress('169.254.169.254'), false)
  assert.equal(isPublicAddress('::ffff:127.0.0.1'), false)
  assert.equal(isPublicAddress('1.1.1.1'), true)
  const budget = new FetchBudget(10)
  budget.add(10)
  assert.throws(() => budget.add(1), /budget exceeded/)
  await assert.rejects(readPublic('https://localhost/private', { budget, maxBytes: 10 }), /allowlist/)
})

test('refresh path allowlist excludes curation, review evidence, executable code and traversal', () => {
  assertGeneratedPaths(['dist/catalog.json', 'sources.lock.json', 'inputs/tensorblock/snapshot.json'])
  for (const path of ['curation/entries.json', 'reviews/x/test.json', 'src/wire.ts', '.github/workflows/check.yml',
    'inputs/../src/wire.ts', 'inputs/a/code.ts', 'publication.json.exe']) assert.equal(isGeneratedPath(path), false)
})
