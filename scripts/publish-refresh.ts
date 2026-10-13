import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { assertGeneratedPaths } from '../src/generated-paths.ts'
import { ManifestSchema } from '../src/wire.ts'

const repo = 'UnlikeOtherAI/nessie-mcp-catalog'
const branch = 'automation/catalog-refresh'
const run = (command: string, args: string[]): string => execFileSync(command, args, {
  encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
}).trim()
const api = (path: string): unknown => JSON.parse(run('gh', ['api', `repos/${repo}/${path}`]))
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const paths = (text: string): string[] => text.split('\n').filter(Boolean)
const changed = paths(run('git', ['diff', '--name-only']))
const untracked = paths(run('git', ['ls-files', '--others', '--exclude-standard']))
assertGeneratedPaths([...changed, ...untracked])
if (!changed.length && !untracked.length) {
  console.log('No generated changes; no refresh PR is needed')
  process.exit(0)
}
const manifest = ManifestSchema.parse(JSON.parse(await readFile('dist/manifest.json', 'utf8')))
const prs = JSON.parse(run('gh', ['pr', 'list', '--repo', repo, '--head', branch, '--base', 'main', '--state', 'open',
  '--json', 'number,headRefOid,author'])) as { number: number; headRefOid: string; author: { login: string } }[]
if (prs.length > 1 || prs.some((pr) => !['github-actions[bot]', 'app/github-actions'].includes(pr.author.login))) {
  throw new Error('Refresh branch has an unexpected owner or multiple open PRs')
}
const remote = run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]).split(/\s/)[0]
if (remote) {
  run('git', ['fetch', '--no-tags', 'origin', `${branch}:refs/remotes/origin/${branch}`])
  const base = run('git', ['merge-base', 'HEAD', `origin/${branch}`])
  assertGeneratedPaths(paths(run('git', ['diff', '--name-only', `${base}..origin/${branch}`])))
  if (prs.length && prs[0].headRefOid !== remote) throw new Error('Refresh PR head changed during preparation')
}
run('git', ['switch', '-c', branch])
run('git', ['add', '--', ...changed, ...untracked])
run('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
  'commit', '-m', `Refresh catalog publication ${manifest.sequence}`])
const head = run('git', ['rev-parse', 'HEAD'])
run('git', ['push', `--force-with-lease=refs/heads/${branch}:${remote || ''}`, 'origin', `HEAD:refs/heads/${branch}`])
await mkdir('.staging', { recursive: true })
await writeFile('.staging/refresh-pr.md', `Refresh the complete public source snapshots and generated catalog to publication ${manifest.sequence} (${manifest.entryCount} canonical entries).\n\nEditorial curation, identity bindings and review evidence are unchanged. Offline schema, identity, credential sanitation and deterministic rebuild checks passed before this PR was prepared. An explicitly dispatched read-only check must pass on this exact head before merge.\n`)
const title = `Refresh catalog publication ${manifest.sequence}`
if (prs.length) run('gh', ['pr', 'edit', String(prs[0].number), '--repo', repo, '--title', title, '--body-file', '.staging/refresh-pr.md'])
else run('gh', ['pr', 'create', '--repo', repo, '--base', 'main', '--head', branch, '--title', title, '--body-file', '.staging/refresh-pr.md'])
const pr = JSON.parse(run('gh', ['pr', 'view', branch, '--repo', repo, '--json', 'number,headRefOid'])) as { number: number; headRefOid: string }
if (pr.headRefOid !== head) throw new Error('Refresh PR no longer points to the prepared commit')
// GITHUB_TOKEN pushes and PR creation intentionally suppress normal workflow events.
// workflow_dispatch is the documented exception; wait for that exact SHA and event.
run('gh', ['workflow', 'run', 'check.yml', '--repo', repo, '--ref', branch])
let verified = false
for (let attempt = 0; attempt < 24; attempt++) {
  await wait(15_000)
  const data = api(`actions/workflows/check.yml/runs?head_sha=${head}&event=workflow_dispatch&per_page=20`) as {
    workflow_runs: { id: number; head_sha: string; status: string; conclusion: string | null; event: string }[] }
  const check = data.workflow_runs.find((item) => item.head_sha === head && item.event === 'workflow_dispatch')
  if (!check || check.status !== 'completed') continue
  if (check.conclusion !== 'success') throw new Error(`Exact-head catalog check did not succeed (run ${check.id})`)
  verified = true
  break
}
if (!verified) throw new Error('Exact-head check did not complete within six minutes; PR remains open for the next refresh')
const current = api(`pulls/${pr.number}`) as { head: { sha: string }; base: { ref: string }; state: string }
if (current.head.sha !== head || current.base.ref !== 'main' || current.state !== 'open') throw new Error('PR changed after validation')
run('git', ['fetch', '--no-tags', 'origin', 'main:refs/remotes/origin/main'])
const mainSequence = JSON.parse(run('git', ['show', 'origin/main:publication.json'])).sequence as number
if (mainSequence >= manifest.sequence) throw new Error('Main publication advanced; the next refresh will rebase and rebuild')
// Re-run when maintainers changed code/curation while sources were being fetched.
if (run('git', ['rev-parse', 'origin/main']) !== run('git', ['rev-parse', `${head}^`])) {
  throw new Error('Main changed during refresh; next scheduled run rebuilds from its new head')
}
run('gh', ['pr', 'merge', String(pr.number), '--repo', repo, '--merge', '--match-head-commit', head])
console.log(`Merged verified refresh PR #${pr.number}, publication ${manifest.sequence}`)
