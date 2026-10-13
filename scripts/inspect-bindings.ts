import { readFile } from 'node:fs/promises'
import { LockSchema } from '../src/model.ts'
import { parseSource } from '../src/adapters/index.ts'
const lock = LockSchema.parse(JSON.parse(await readFile('sources.lock.json', 'utf8')))
for (const snapshot of lock.snapshots) {
  const observations = parseSource(await readFile(snapshot.snapshotPath, 'utf8'), snapshot)
  console.log(snapshot.id)
  console.log(observations.filter((item) => item.links.some((link) =>
    ['https://docs.devin.ai/work-with-devin/deepwiki-mcp', 'https://deepwiki.com/', 'https://devin.ai/',
      'https://github.com/github/github-mcp-server', 'https://github.com/upstash/context7',
      'https://linear.app/', 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem']
      .includes(link))).map((item) => ({ nativeId: item.nativeId, identity: item.identity,
        links: item.links, remotes: item.remotes.map((remote) => remote.url) })))
}
