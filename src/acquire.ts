import { readFile } from 'node:fs/promises'
import { digest, json, sha256 } from './hash.ts'
import { FetchBudget, readPublic } from './fetch.ts'
import { sanitizeJson, safeText } from './sanitize.ts'
import type { Source } from './model.ts'
import type { Snapshot } from './wire.ts'

export type Acquisition = { snapshot: Snapshot; body: string; license: string; metadata: unknown }
export async function acquire(source: Source, fetchedAt: string, budget: FetchBudget): Promise<Acquisition> {
  const get = (url: string, maxBytes = source.maxBytes) => readPublic(url, { maxBytes, budget })
  if (source.kind === 'registry') {
    const records: unknown[] = []
    const pages: { digest: string; records: number }[] = []
    const seen = new Set<string>()
    let cursor: string | null = null
    for (let page = 0; page < 1000; page++) {
      const url = new URL(source.url!)
      url.searchParams.set('limit', '100')
      url.searchParams.set('version', 'latest')
      if (cursor) url.searchParams.set('cursor', cursor)
      const response = await get(url.toString())
      const data = JSON.parse(response.body)
      if (!Array.isArray(data.servers) || (data.metadata?.nextCursor != null && typeof data.metadata.nextCursor !== 'string')) {
        throw new Error('Registry page schema changed')
      }
      const sanitized = sanitizeJson(data.servers) as unknown[]
      pages.push({ digest: digest(sanitized), records: sanitized.length })
      records.push(...sanitized)
      if (records.length > 100_000) throw new Error('Registry record cap reached before completion')
      if ((page + 1) % 100 === 0) console.log(`Registry: ${page + 1} pages, ${records.length} records, ${budget.bytes} downloaded bytes`)
      cursor = data.metadata?.nextCursor || null
      if (!cursor) break
      if (page === 999) throw new Error(`Registry traversal incomplete after ${page + 1} pages and ${records.length} records`)
      if (seen.has(cursor)) throw new Error(`Registry repeated cursor after ${page + 1} pages`)
      seen.add(cursor)
    }
    const body = json(records)
    const hash = sha256(body)
    return { body, license: await readFile('licenses/official-registry.txt', 'utf8'),
      metadata: { pages, fetchedAt, recordCount: records.length, apiVersion: 'v0.1', versionFilter: 'latest' },
      snapshot: { id: source.id, kind: source.kind, url: source.url!, revision: `sha256:${hash}`,
        sha256: hash, fetchedAt, license: source.license, adapterVersion: 1, observations: 0,
        status: 'complete', snapshotPath: `inputs/${source.id}/snapshot.json` } }
  }
  const repo = JSON.parse((await get(`https://api.github.com/repos/${source.repo}`, 1024 * 1024)).body)
  if (repo.archived || repo.full_name?.toLowerCase() !== source.repo!.toLowerCase()
      || (source.repositoryId && repo.id !== source.repositoryId)) throw new Error('Source repository authority changed')
  const commit = JSON.parse((await get(`https://api.github.com/repos/${source.repo}/commits/${repo.default_branch}`, 1024 * 1024)).body)
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid source commit')
  const base = `https://raw.githubusercontent.com/${source.repo}/${commit.sha}`
  const response = await get(`${base}/${source.path}`)
  const license = safeText((await get(`${base}/LICENSE`, 128 * 1024)).body, 128 * 1024)
  if (!license.includes('MIT License') && !license.includes('MIT License (MIT)')) throw new Error('Source license changed')
  const body = source.kind === 'markdown'
    ? safeText(response.body, source.maxBytes)
    : json(sanitizeJson(JSON.parse(response.body)))
  return { body, license,
    metadata: { repository: repo.full_name, repositoryId: repo.id, stars: repo.stargazers_count,
      defaultBranch: repo.default_branch, commit: commit.sha, committedAt: commit.commit.committer.date,
      fetchedAt, license: source.license, licenseDigest: sha256(license), inputPath: source.path,
      sanitation: 'Credential values and executable defaults removed before persistence; snapshot hash covers sanitized bytes.' },
    snapshot: { id: source.id, kind: source.kind, url: `${base}/${source.path}`, revision: commit.sha,
      sha256: sha256(body), fetchedAt, license: source.license, adapterVersion: 1, observations: 0,
      status: 'complete', snapshotPath: `inputs/${source.id}/snapshot.${source.kind === 'markdown' ? 'md' : 'json'}` } }
}
