import { assertGeneratedPaths } from './generated-paths.ts'

export const CATALOG_REPOSITORY = 'UnlikeOtherAI/nessie-mcp-catalog'
export const CATALOG_REPOSITORY_ID = 1417714962
export const REFRESH_BRANCH = 'automation/catalog-refresh'
const BOT_ID = 41898282
const CHECK_PATH = '.github/workflows/check.yml'
export type GateExpectation = { head: string; base: string; pr: number; workflowId: number }
type Ref = { sha: string; ref: string; repo: { id: number } }
export type RefreshPr = { number: number; state: string; user: { id: number; login: string; type: string };
  head: Ref; base: Ref; mergeable_state: string }
export type CheckRun = { id: number; event: string; head_sha: string; head_branch: string; path: string;
  workflow_id: number; status: string; conclusion: string | null; repository: { id: number };
  head_repository: { id: number }; actor: { id: number }; triggering_actor: { id: number };
  pull_requests: { number: number; head: Ref; base: Ref }[] }
export type RequiredCheck = { name: string; bucket: string; state: string; workflow: string; event: string; link: string }

export function assertTrustedPr(pr: RefreshPr, expected: GateExpectation): void {
  if (pr.number !== expected.pr || pr.state !== 'open' || pr.user.id !== BOT_ID
    || pr.user.login !== 'github-actions[bot]' || pr.user.type !== 'Bot'
    || pr.head.repo.id !== CATALOG_REPOSITORY_ID || pr.base.repo.id !== CATALOG_REPOSITORY_ID
    || pr.head.ref !== REFRESH_BRANCH || pr.base.ref !== 'main'
    || pr.head.sha !== expected.head || pr.base.sha !== expected.base) throw new Error('Refresh PR authority/head/base changed')
}

export function assertGeneratedTree(paths: string[], trustedWorkflowBlob: string, candidateWorkflowBlob: string): void {
  assertGeneratedPaths(paths)
  if (!/^[a-f0-9]{40,64}$/.test(trustedWorkflowBlob) || trustedWorkflowBlob !== candidateWorkflowBlob) {
    throw new Error('Refresh validator differs from trusted main')
  }
}

export function assertTrustedRun(run: CheckRun, expected: GateExpectation, event: string): void {
  if (run.event !== event || run.head_sha !== expected.head || run.head_branch !== REFRESH_BRANCH
    || run.path !== CHECK_PATH || run.workflow_id !== expected.workflowId
    || run.repository.id !== CATALOG_REPOSITORY_ID || run.head_repository.id !== CATALOG_REPOSITORY_ID
    || run.actor.id !== BOT_ID || run.triggering_actor.id !== BOT_ID) throw new Error('Unexpected refresh validator authority')
  if (event === 'pull_request' && (run.pull_requests.length !== 1 || run.pull_requests.some((pr) =>
    pr.number !== expected.pr || pr.head.sha !== expected.head || pr.base.sha !== expected.base
    || pr.head.ref !== REFRESH_BRANCH || pr.base.ref !== 'main'
    || pr.head.repo.id !== CATALOG_REPOSITORY_ID || pr.base.repo.id !== CATALOG_REPOSITORY_ID))) {
    throw new Error('Validator run belongs to a different pull request')
  }
}

export function requiredGatePassed(checks: RequiredCheck[], prRun: CheckRun): boolean {
  const prefix = `https://github.com/${CATALOG_REPOSITORY}/actions/runs/${prRun.id}/job/`
  return checks.length > 0 && checks.every((check) => check.bucket === 'pass' && check.state === 'SUCCESS')
    && checks.some((check) => check.name === 'Catalog checks' && check.workflow === 'Catalog checks'
      && check.event === 'pull_request' && check.link.startsWith(prefix))
}

export type GateIo = {
  verifyTrust: () => Promise<RefreshPr>
  runs: () => Promise<CheckRun[]>
  run: (id: number) => Promise<CheckRun>
  approve: (id: number) => Promise<void>
  requiredChecks: (prRun: CheckRun) => Promise<RequiredCheck[]>
  wait: () => Promise<void>
}

/** Dispatch success is necessary; it cannot substitute for GitHub's actual PR gate. */
export async function waitForRefreshGate(expected: GateExpectation, io: GateIo, attempts = 40): Promise<void> {
  const approved = new Set<number>()
  for (let attempt = 0; attempt < attempts; attempt++) {
    const pr = await io.verifyTrust()
    assertTrustedPr(pr, expected)
    const runs = await io.runs()
    const latest = (event: string): CheckRun | undefined => runs.filter((run) => run.event === event && run.head_sha === expected.head)
      .sort((a, b) => b.id - a.id)[0]
    const dispatch = latest('workflow_dispatch')
    const pull = latest('pull_request')
    for (const run of [dispatch, pull]) {
      if (!run) continue
      assertTrustedRun(run, expected, run === pull ? 'pull_request' : 'workflow_dispatch')
      if (run === pull && run.conclusion === 'action_required') {
        if (!approved.has(run.id)) {
          // Re-read mutable PR/run state immediately before the narrow approval write.
          assertTrustedPr(await io.verifyTrust(), expected)
          const current = await io.run(run.id)
          assertTrustedRun(current, expected, 'pull_request')
          if (current.conclusion === 'action_required') {
            try { await io.approve(current.id) } catch (cause) {
              throw new Error(`GitHub refused workflow approval for exact refresh run ${current.id}. PR #${expected.pr} remains open. `
                + 'Keep protection/fork approvals enabled; see docs/operations.md for the source-repository-only GitHub App remedy.', { cause })
            }
            approved.add(current.id)
          }
        }
      } else if (run.status === 'completed' && run.conclusion !== 'success') {
        throw new Error(`Refresh ${run.event} validator failed (run ${run.id}); PR remains open`)
      }
    }
    if (dispatch?.status === 'completed' && dispatch.conclusion === 'success'
      && pull?.status === 'completed' && pull.conclusion === 'success'
      && requiredGatePassed(await io.requiredChecks(pull), pull) && pr.mergeable_state === 'clean') return
    await io.wait()
  }
  throw new Error('Required PR validator did not become green within ten minutes; refresh PR remains open for retry')
}
