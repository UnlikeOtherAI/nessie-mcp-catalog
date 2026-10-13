import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { assertGeneratedPaths } from '../src/generated-paths.ts'
import { ManifestSchema } from '../src/wire.ts'
import { assertGeneratedTree, assertTrustedPr, CATALOG_REPOSITORY, CATALOG_REPOSITORY_ID, REFRESH_BRANCH,
  waitForRefreshGate } from '../src/refresh-gate.ts'
import type { CheckRun, GateExpectation, RefreshPr, RequiredCheck } from '../src/refresh-gate.ts'

const repo = CATALOG_REPOSITORY
const branch = REFRESH_BRANCH
const run = (command: string, args: string[]): string => execFileSync(command, args, {
  encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
}).trim()
const api = (path: string): unknown => JSON.parse(run('gh', ['api', `repos/${repo}/${path}`]))
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const paths = (text: string): string[] => text.split('\n').filter(Boolean)
const trustedBase = run('git', ['rev-parse', 'HEAD'])
const repository = api('') as { id: number; full_name: string }
if (repository.id !== CATALOG_REPOSITORY_ID || repository.full_name !== repo) throw new Error('Catalog repository authority changed')
const changed = paths(run('git', ['diff', '--name-only']))
const staged = paths(run('git', ['diff', '--cached', '--name-only']))
const untracked = paths(run('git', ['ls-files', '--others', '--exclude-standard']))
assertGeneratedPaths([...changed, ...staged, ...untracked])
if (!changed.length && !staged.length && !untracked.length) {
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
await writeFile('.staging/refresh-pr.md', `Refresh the complete public source snapshots and generated catalog to publication ${manifest.sequence} (${manifest.entryCount} canonical entries).\n\nEditorial curation, identity bindings and review evidence are unchanged. Offline schema, identity, credential sanitation and deterministic rebuild checks passed before this PR was prepared. Both the explicitly dispatched validator and GitHub's required pull-request check must pass on this exact head before merge.\n`)
const title = `Refresh catalog publication ${manifest.sequence}`
if (prs.length) run('gh', ['pr', 'edit', String(prs[0].number), '--repo', repo, '--title', title, '--body-file', '.staging/refresh-pr.md'])
else run('gh', ['pr', 'create', '--repo', repo, '--base', 'main', '--head', branch, '--title', title, '--body-file', '.staging/refresh-pr.md'])
const pr = JSON.parse(run('gh', ['pr', 'view', branch, '--repo', repo, '--json', 'number,headRefOid'])) as { number: number; headRefOid: string }
if (pr.headRefOid !== head) throw new Error('Refresh PR no longer points to the prepared commit')
const workflow = api('actions/workflows/check.yml') as { id: number; path: string; state: string }
if (workflow.path !== '.github/workflows/check.yml' || workflow.state !== 'active') throw new Error('Catalog validator authority changed')
const expected: GateExpectation = { head, base: trustedBase, pr: pr.number, workflowId: workflow.id }
const verifyTrust = async (): Promise<RefreshPr> => {
  const current = api(`pulls/${pr.number}`) as RefreshPr
  assertTrustedPr(current, expected)
  assertGeneratedTree(paths(run('git', ['diff', '--name-only', `${trustedBase}..${head}`])),
    run('git', ['rev-parse', `${trustedBase}:.github/workflows/check.yml`]),
    run('git', ['rev-parse', `${head}:.github/workflows/check.yml`]))
  return current
}
await verifyTrust()
// GITHUB_TOKEN-created PR runs may await approval independently of this dispatch.
run('gh', ['workflow', 'run', 'check.yml', '--repo', repo, '--ref', branch])
await waitForRefreshGate(expected, {
  verifyTrust,
  runs: async () => {
    const data = api(`actions/workflows/check.yml/runs?head_sha=${head}&per_page=100`) as { total_count: number; workflow_runs: CheckRun[] }
    if (data.total_count > 100) throw new Error('Too many validator runs to inspect safely')
    return data.workflow_runs
  },
  run: async (id) => api(`actions/runs/${id}`) as CheckRun,
  approve: async (id) => {
    run('gh', ['api', '--method', 'POST', `repos/${repo}/actions/runs/${id}/approve`])
    console.log(`Approved unchanged generated-only validator run ${id} for PR #${pr.number}`)
  },
  requiredChecks: async (prRun) => {
    const jobs = api(`actions/runs/${prRun.id}/jobs?per_page=100`) as {
      total_count: number; jobs: { id: number; name: string; check_run_url: string }[] }
    const job = jobs.jobs.filter((item) => item.name === 'Catalog checks')
    if (jobs.total_count > 100 || job.length !== 1
      || job[0].check_run_url !== `https://api.github.com/repos/${repo}/check-runs/${job[0].id}`) throw new Error('Unexpected required validator job')
    const check = api(`check-runs/${job[0].id}`) as { app: { id: number }; head_sha: string; status: string; conclusion: string; name: string }
    if (check.app.id !== 15368 || check.head_sha !== head || check.name !== 'Catalog checks'
      || check.status !== 'completed' || check.conclusion !== 'success') throw new Error('Required validator check authority changed')
    let output: string
    try {
      output = run('gh', ['pr', 'checks', String(pr.number), '--repo', repo, '--required',
        '--json', 'name,bucket,state,workflow,event,link'])
    } catch (error) {
      // gh reports pending checks with exit 8 and failures/empty rollups with exit 1.
      const failure = error as { stdout?: string; status?: number }
      if (![1, 8].includes(failure.status ?? 0)) throw error
      output = failure.stdout?.toString().trim() || '[]'
    }
    return JSON.parse(output) as RequiredCheck[]
  },
  wait: () => wait(15_000),
})
await verifyTrust()
run('git', ['fetch', '--no-tags', 'origin', 'main:refs/remotes/origin/main'])
const mainSequence = JSON.parse(run('git', ['show', 'origin/main:publication.json'])).sequence as number
if (mainSequence >= manifest.sequence) throw new Error('Main publication advanced; the next refresh will rebase and rebuild')
// Re-run when maintainers changed code/curation while sources were being fetched.
if (run('git', ['rev-parse', 'origin/main']) !== run('git', ['rev-parse', `${head}^`])) {
  throw new Error('Main changed during refresh; next scheduled run rebuilds from its new head')
}
run('gh', ['pr', 'merge', String(pr.number), '--repo', repo, '--merge', '--match-head-commit', head])
console.log(`Merged verified refresh PR #${pr.number}, publication ${manifest.sequence}`)
