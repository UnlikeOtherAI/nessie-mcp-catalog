import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogApiEndpoint, catalogCheckRunPath } from '../src/github-api.ts'

const root = 'repos/UnlikeOtherAI/nessie-mcp-catalog'

test('repository-root API lookup has the exact path without a trailing slash', () => {
  for (const path of ['', '/', '///']) assert.equal(catalogApiEndpoint(path), root)
  assert.equal(catalogApiEndpoint(), root)
})

test('neighboring workflow, run, job, PR and approval paths retain their exact segments and query', () => {
  for (const path of ['pulls/3', 'actions/workflows/check.yml',
    'actions/workflows/check.yml/runs?head_sha=abc&per_page=100', 'actions/runs/38457760969',
    'actions/runs/38457760969/jobs?per_page=100', 'actions/runs/38457760969/approve', 'check-runs/115502161202']) {
    assert.equal(catalogApiEndpoint(path), `${root}/${path}`)
  }
  assert.equal(catalogApiEndpoint('/actions/runs/123/'), `${root}/actions/runs/123`)
  for (const path of ['../other', 'actions/../user', 'https://api.github.com/user', 'actions//runs']) {
    assert.throws(() => catalogApiEndpoint(path), /repository-relative/)
  }
})

test('job adapter follows its explicit same-repository check reference instead of assuming equal IDs', () => {
  const job = { id: 101, check_run_url: `https://api.github.com/${root}/check-runs/202` }
  assert.equal(catalogCheckRunPath(job.check_run_url), 'check-runs/202')
  assert.equal(catalogApiEndpoint(catalogCheckRunPath(job.check_run_url)), `${root}/check-runs/202`)
})

test('check-run references cannot leave the repository or carry credentials/query/fragment', () => {
  const valid = `https://api.github.com/${root}/check-runs/202`
  for (const value of [valid.replace('api.github.com', 'example.com'), valid.replace('nessie-mcp-catalog', 'another-repo'),
    valid.replace('https:', 'http:'), valid.replace('https://', 'https://user:secret@'), `${valid}?token=secret`,
    `${valid}#fragment`, `${valid}/jobs`, valid.replace('/202', '/9007199254740992'), valid.replace('/202', '/not-a-number')]) {
    assert.throws(() => catalogCheckRunPath(value))
  }
})
