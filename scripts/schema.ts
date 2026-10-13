import { mkdir, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { CatalogSchema, ManifestSchema } from '../src/wire.ts'
import { json } from '../src/hash.ts'
await mkdir('schema', { recursive: true })
for (const [name, schema] of Object.entries({ catalog: CatalogSchema, manifest: ManifestSchema })) {
  await writeFile(`schema/${name}-v1.schema.json`, json(z.toJSONSchema(schema, { target: 'draft-2020-12' })))
}
