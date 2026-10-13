import { readFile, writeFile } from 'node:fs/promises'
import { acquire } from '../src/acquire.ts'
import { FetchBudget } from '../src/fetch.ts'
import { LockSchema, SourcesSchema } from '../src/model.ts'
import { json } from '../src/hash.ts'
const sources = SourcesSchema.parse(JSON.parse(await readFile('sources.json', 'utf8'))).sources
const lock = LockSchema.parse(JSON.parse(await readFile('sources.lock.json', 'utf8')))
const budget = new FetchBudget()
for (const source of sources.filter((source) => source.kind !== 'registry')) {
  const result = await acquire(source, new Date().toISOString(), budget)
  await writeFile(result.snapshot.snapshotPath, result.body)
  await writeFile(`inputs/${source.id}/metadata.json`, json(result.metadata))
  await writeFile(`licenses/${source.id}.txt`, result.license)
  lock.snapshots = lock.snapshots.map((snapshot) => snapshot.id === source.id ? result.snapshot : snapshot)
}
await writeFile('sources.lock.json', json(lock))
