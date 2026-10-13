# Approval and authorship policy v1

`nessieApproved` and `madeByNessie` are independent boolean outputs. Both start false. Registry publisher verification, source popularity and upstream badges do not change them. The initial public catalog intentionally has no positive approvals or authorship claims.

An approval PR sets a curation row's `nessieApproved` request and references `reviews/<component>/<review>.json`. The review has `revoked: false` and an `approval` object conforming to `src/wire.ts`:

- `policyVersion: "approval-policy-v1"`, the exact `materialDigest`, UTC `testedAt` and `expiresAt`;
- the tested `nessieRevision`, `suiteRevision`, and `environment` (`isolated-fixture` or `scoped-live-readonly`);
- `testedRemoteIds`, containing only unique IDs of the remote configurations actually exercised, at least one for an entry with remotes; package-only evidence uses an empty list;
- separately passed `compatibility`, `readOnlyFunctional`, `authScope`, and `securityReview` checks;
- a public credential-free `evidenceUrl`, the reviewing PR `decisionUrl`, and explicit `limitations`.

Evidence must record a functioning MCP initialization/tool-list contract, a suitable harmless/read-only functional exercise, the exact authentication configuration and least necessary scopes, and a security review of the tested component/configuration. Fixture evidence must say what was simulated; it cannot claim a live service was tested. A human reviewer evaluates whether the evidence supports the intended claim before merging the PR. A set of boolean check labels without linked reviewable results is not sufficient evidence.

`materialDigest` is SHA-256 of recursively key-sorted canonical JSON for `{identity, remotes, packages}`; array order is preserved. Endpoint, auth, version or package changes invalidate the evidence. A whole-component digest alone does not assert every alternative remote was exercised: consumers must additionally require their selected remote ID in `testedRemoteIds`. Unknown auth cannot support an approval. Positive remote approvals last at most 30 days; package-only approvals last at most 90 days. Future-dated tests and invalid intervals fail validation. Revocation, expiry, material change or non-active lifecycle makes approval false while retaining the historical evidence for review. Consumers must re-evaluate expiry at use time, even between refreshes.

Nessie-authored evidence is separate: the curation row sets `madeByNessie` and supplies `authorship.componentId` matching the canonical entry ID, a source `repositoryUrl`, exact `revision`, `evidenceUrl` and `decisionUrl`. The reviewed component itself must have been authored by Nessie. Curating or configuring another publisher's MCP server is not authorship. This flag does not imply compatibility/security approval.

No approval runner executes arbitrary catalog packages. This first delivery provides evidence admission and revocation, not an automatic security certification service. Any future sandboxed package testing system needs its own reviewed execution/isolation design. Existing Nessie connection checks remain the appropriate place for account-specific authentication discovery and connectivity.
