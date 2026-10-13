import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { acquire } from '../src/acquire.ts'
import { parseSource } from '../src/adapters/index.ts'
import { FetchBudget } from '../src/fetch.ts'
import { json } from '../src/hash.ts'
import { LockSchema, SourcesSchema } from '../src/model.ts'
import { MissingSchema, reconcileMissing } from '../src/missing.ts'
import { project, PublicationSchema, readJson, writeProjection } from '../src/project.ts'

const now = new Date().toISOString()
const sources = SourcesSchema.parse(await readJson('sources.json')).sources
const lock = LockSchema.parse(await readJson('sources.lock.json'))
const priorPublication = PublicationSchema.parse(await readJson('publication.json'))
const priorCatalog = await readFile('dist/catalog.json', 'utf8')
let missing = MissingSchema.parse(await readJson('state/missing.json'))
const budget = new FetchBudget()
let changed = false
for (const source of sources) {
  const previous = lock.snapshots.find((item) => item.id === source.id)
  if (!previous) throw new Error('Bootstrap each newly reviewed source before enabling scheduled refresh')
  if (!process.argv.includes('--force') && source.cadenceHours === 168 && new Date(now).getUTCDay() !== 2) continue
  console.log(`Refreshing ${source.id}`)
  const result = await acquire(source, now, budget)
  const oldObservations = parseSource(await readFile(previous.snapshotPath, 'utf8'), previous)
  const observations = parseSource(result.body, result.snapshot)
  if (observations.length < oldObservations.length * 0.8) throw new Error(`Source ${source.id} lost over 20% of observations; review required`)
  missing = reconcileMissing(oldObservations, observations, missing, source.id, now)
  if (result.snapshot.sha256 === previous.sha256 && result.snapshot.revision === previous.revision) continue
  result.snapshot.observations = observations.length
  await mkdir(`inputs/${source.id}`, { recursive: true })
  await writeFile(result.snapshot.snapshotPath, result.body)
  await writeFile(`inputs/${source.id}/metadata.json`, json(result.metadata))
  await writeFile(`licenses/${source.id}.txt`, result.license)
  lock.snapshots = lock.snapshots.map((item) => item.id === source.id ? result.snapshot : item)
  changed = true
}
await writeFile('sources.lock.json', json(lock))
await writeFile('state/missing.json', json(missing))
await writeFile('publication.json', json({ sequence: priorPublication.sequence + 1, generatedAt: now }))
const projection = await project()
const priorEntries = JSON.stringify(JSON.parse(priorCatalog).entries)
changed ||= JSON.stringify(projection.catalog.entries) !== priorEntries
if (changed) {
  await writeProjection(projection)
  console.log(`Publication ${projection.manifest.sequence}: ${projection.manifest.entryCount} entries`)
} else {
  await writeFile('publication.json', json(priorPublication))
  console.log('All checked inputs unchanged; no new publication')
}
