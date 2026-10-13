import { readFile } from 'node:fs/promises'
import { project } from '../src/project.ts'
import { json } from '../src/hash.ts'
import { z } from 'zod'
import { CatalogSchema, ManifestSchema } from '../src/wire.ts'
const projection = await project()
async function same(path: string, expected: string): Promise<void> {
  if (await readFile(path, 'utf8') !== expected) throw new Error(`${path} differs from its offline rebuild`)
}
await same('dist/catalog.json', projection.catalogText)
await same('dist/manifest.json', json(projection.manifest))
await same('reports/catalog-report.json', json(projection.report))
for (const [name, schema] of Object.entries({ catalog: CatalogSchema, manifest: ManifestSchema })) {
  await same(`schema/${name}-v1.schema.json`, json(z.toJSONSchema(schema, { target: 'draft-2020-12' })))
}
for (const [id, observations] of projection.observations) {
  await same(`observations/${id}.json`, `${JSON.stringify(observations)}\n`)
}
console.log(`Catalog checks passed: ${projection.catalog.entries.length} entries, ${projection.manifest.sourceSnapshots.length} sources`)
