import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { acquire } from '../src/acquire.ts'
import { FetchBudget } from '../src/fetch.ts'
import { SourcesSchema } from '../src/model.ts'
import { json } from '../src/hash.ts'
const sources = SourcesSchema.parse(JSON.parse(await readFile('sources.json', 'utf8'))).sources
const budget = new FetchBudget()
const snapshots = []
for (const source of sources) {
  console.log(`Fetching ${source.id}`)
  const result = await acquire(source, new Date().toISOString(), budget)
  await mkdir(`inputs/${source.id}`, { recursive: true })
  await writeFile(result.snapshot.snapshotPath, result.body)
  await writeFile(`inputs/${source.id}/metadata.json`, json(result.metadata))
  await writeFile(`licenses/${source.id}.txt`, result.license)
  snapshots.push(result.snapshot)
  console.log(`${source.id}: ${Buffer.byteLength(result.body)} sanitized bytes`)
}
await writeFile('sources.lock.json', json({ schemaVersion: 1, snapshots }))
