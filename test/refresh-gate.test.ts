import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertGeneratedTree, assertTrustedPr, assertTrustedRun, CATALOG_REPOSITORY_ID,
  REFRESH_BRANCH, requiredGatePassed, waitForRefreshGate } from '../src/refresh-gate.ts'
import type { CheckRun, GateExpectation, GateIo, RefreshPr, RequiredCheck } from '../src/refresh-gate.ts'

const expected: GateExpectation = { head: 'a'.repeat(40), base: 'b'.repeat(40), pr: 3, workflowId: 383573421 }
function pr(): RefreshPr {
  return { number: 3, state: 'open', user: { id: 41898282, login: 'github-actions[bot]', type: 'Bot' },
    head: { sha: expected.head, ref: REFRESH_BRANCH, repo: { id: CATALOG_REPOSITORY_ID } },
    base: { sha: expected.base, ref: 'main', repo: { id: CATALOG_REPOSITORY_ID } }, mergeable_state: 'clean' }
}
function run(event: string, conclusion = 'success'): CheckRun {
  return { id: event === 'pull_request' ? 20 : 10, event, head_sha: expected.head,
    head_branch: REFRESH_BRANCH, path: '.github/workflows/check.yml', workflow_id: expected.workflowId,
    status: 'completed', conclusion, repository: { id: CATALOG_REPOSITORY_ID }, head_repository: { id: CATALOG_REPOSITORY_ID },
    actor: { id: 41898282 }, triggering_actor: { id: 41898282 },
    pull_requests: [{ number: 3, head: pr().head, base: pr().base }] }
}
function check(): RequiredCheck {
  return { name: 'Catalog checks', bucket: 'pass', state: 'SUCCESS', workflow: 'Catalog checks', event: 'pull_request',
    link: 'https://github.com/UnlikeOtherAI/nessie-mcp-catalog/actions/runs/20/job/123' }
}
function harness() {
  const state = { pull: run('pull_request', 'action_required'), approved: [] as number[], waits: 0, trustReads: 0,
    checks: [check()], mergeable: 'clean' }
  const io: GateIo = {
    verifyTrust: async () => { state.trustReads++; return { ...pr(), mergeable_state: state.mergeable } },
    runs: async () => [run('workflow_dispatch'), structuredClone(state.pull)],
    run: async () => structuredClone(state.pull),
    approve: async (id) => { state.approved.push(id); state.pull.conclusion = 'success' },
    requiredChecks: async () => state.checks,
    wait: async () => { state.waits++ },
  }
  return { state, io }
}

test('live failure regression: dispatch success waits for approved PR run and its actual required check', async () => {
  const { state, io } = harness()
  await waitForRefreshGate(expected, io, 3)
  assert.deepEqual(state.approved, [20])
  assert.equal(state.waits, 1)
  assert.ok(state.trustReads >= 3)
})

test('empty rollups, dispatch-only rows, stale links and failed required checks cannot satisfy the PR gate', () => {
  for (const checks of [[], [{ ...check(), event: 'workflow_dispatch' }],
    [{ ...check(), link: check().link.replace('/20/', '/19/') }], [{ ...check(), bucket: 'fail', state: 'FAILURE' }],
    [check(), { ...check(), name: 'Another required check', bucket: 'pending', state: 'PENDING' }]]) {
    assert.equal(requiredGatePassed(checks, run('pull_request')), false)
  }
  assert.equal(requiredGatePassed([check()], run('pull_request')), true)
})

test('approval never implies success; a persistent approval gate is requested only once then fails closed', async () => {
  const { state, io } = harness()
  io.approve = async (id) => { state.approved.push(id) }
  await assert.rejects(waitForRefreshGate(expected, io, 3), /remains open for retry/)
  assert.deepEqual(state.approved, [20])
})

test('denied approval preserves the PR and names the repository-only operational remedy', async () => {
  const { io } = harness()
  io.approve = async () => { throw new Error('HTTP 403') }
  await assert.rejects(waitForRefreshGate(expected, io), /PR #3 remains open.*GitHub App remedy/)
})

test('changed head/base/repository/PR author is refused before requesting approval', async () => {
  const mutations: ((value: RefreshPr) => void)[] = [
    (value) => { value.head.sha = 'c'.repeat(40) }, (value) => { value.base.sha = 'c'.repeat(40) },
    (value) => { value.head.repo.id++ }, (value) => { value.base.repo.id++ },
    (value) => { value.user.id++ }, (value) => { value.user.login = 'impostor' },
    (value) => { value.base.ref = 'release' }, (value) => { value.state = 'closed' },
  ]
  for (const mutate of mutations) {
    const { state, io } = harness()
    const changed = pr()
    mutate(changed)
    io.verifyTrust = async () => changed
    await assert.rejects(waitForRefreshGate(expected, io), /authority\/head\/base changed/)
    assert.deepEqual(state.approved, [])
  }
})

test('foreign workflow, fork, actor, event, base or PR linkage cannot be approved', () => {
  const mutations: ((value: CheckRun) => void)[] = [
    (value) => { value.path = '.github/workflows/publish.yml' }, (value) => { value.workflow_id++ },
    (value) => { value.head_repository.id++ }, (value) => { value.repository.id++ },
    (value) => { value.actor.id++ }, (value) => { value.triggering_actor.id++ },
    (value) => { value.event = 'pull_request_target' }, (value) => { value.head_sha = 'd'.repeat(40) },
    (value) => { value.pull_requests[0].number++ }, (value) => { value.pull_requests[0].base.sha = 'd'.repeat(40) },
  ]
  for (const mutate of mutations) {
    const changed = run('pull_request', 'action_required')
    mutate(changed)
    assert.throws(() => assertTrustedRun(changed, expected, 'pull_request'))
  }
})

test('approval revalidates mutable head and individual run immediately before writing', async () => {
  const { state, io } = harness()
  let reads = 0
  io.verifyTrust = async () => {
    reads++
    const current = pr()
    if (reads === 2) current.head.sha = 'd'.repeat(40)
    return current
  }
  await assert.rejects(waitForRefreshGate(expected, io))
  assert.deepEqual(state.approved, [])
  const second = harness()
  second.io.run = async () => ({ ...run('pull_request', 'action_required'), workflow_id: 999 })
  await assert.rejects(waitForRefreshGate(expected, second.io))
  assert.deepEqual(second.state.approved, [])
})

test('non-generated changes and altered validator contents cannot enter the approval path', () => {
  assertGeneratedTree(['dist/catalog.json', 'inputs/tensorblock/snapshot.json'], 'a'.repeat(40), 'a'.repeat(40))
  assert.throws(() => assertGeneratedTree(['src/compile.ts'], 'a'.repeat(40), 'a'.repeat(40)))
  assert.throws(() => assertGeneratedTree(['dist/catalog.json'], 'a'.repeat(40), 'b'.repeat(40)))
  assertTrustedPr(pr(), expected)
})

test('a missing PR run or required rollup never passes on dispatch success alone', async () => {
  const { state, io } = harness()
  io.runs = async () => [run('workflow_dispatch')]
  await assert.rejects(waitForRefreshGate(expected, io, 2), /did not become green/)
  assert.deepEqual(state.approved, [])
  const second = harness()
  second.state.pull = run('pull_request')
  second.state.checks = []
  await assert.rejects(waitForRefreshGate(expected, second.io, 2), /did not become green/)
})

test('failed PR validation and a blocked merge state remain closed', async () => {
  const { io, state } = harness()
  state.pull = run('pull_request', 'failure')
  await assert.rejects(waitForRefreshGate(expected, io), /validator failed/)
  const second = harness()
  second.state.pull = run('pull_request')
  second.state.mergeable = 'blocked'
  await assert.rejects(waitForRefreshGate(expected, second.io, 2), /did not become green/)
})
