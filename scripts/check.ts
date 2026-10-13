import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { project } from '../src/project.ts'
import { json } from '../src/hash.ts'
const projection = await project()
assert.equal(await readFile('dist/catalog.json', 'utf8'), projection.catalogText, 'Catalog differs from offline rebuild')
assert.equal(await readFile('dist/manifest.json', 'utf8'), json(projection.manifest), 'Manifest differs from offline rebuild')
assert.equal(await readFile('reports/catalog-report.json', 'utf8'), json(projection.report), 'Report differs from offline rebuild')
for (const [id, observations] of projection.observations) {
  assert.equal(await readFile(`observations/${id}.json`, 'utf8'), `${JSON.stringify(observations)}\n`, `Observation drift: ${id}`)
}
console.log(`Catalog checks passed: ${projection.catalog.entries.length} entries, ${projection.manifest.sourceSnapshots.length} sources`)
