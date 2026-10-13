import { readFile } from 'node:fs/promises'
import { LockSchema } from '../src/model.ts'
import { parseSource } from '../src/adapters/index.ts'
const lock = LockSchema.parse(JSON.parse(await readFile('sources.lock.json', 'utf8')))
for (const snapshot of lock.snapshots) {
  try {
    const observations = parseSource(await readFile(snapshot.snapshotPath, 'utf8'), snapshot)
    console.log(JSON.stringify({ source: snapshot.id, observations: observations.length,
      selected: observations.filter((item) => item.selected).length,
      remotes: observations.filter((item) => item.remotes.length).length,
      packages: observations.filter((item) => item.packages.length).length,
      bytes: Buffer.byteLength(JSON.stringify(observations)),
      sample: observations.slice(0, 2).map((item) => ({ nativeId: item.nativeId, name: item.metadata.displayName })) }))
  } catch (error) { console.log(snapshot.id, error instanceof Error ? error.message.slice(0, 1000) : 'Parse failed') }
}
