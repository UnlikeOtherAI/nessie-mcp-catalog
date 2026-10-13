# Publication, refresh and recovery

## Files and authority

`sources.json` is reviewed source admission policy, including fetch bounds, stable repository IDs and license digests. `sources.lock.json` pins each complete admitted snapshot. `inputs/` contains sanitized raw-format inputs and acquisition metadata; `observations/` contains their deterministic parsed form. `curation/` and `reviews/` are editorial authority. `state/missing.json` preserves source observations absent from later complete scans. `publication.json` supplies a monotonic sequence and UTC publication time. `dist/manifest.json` and `dist/catalog.json` are the only consumer wire artifacts.

Canonical identities use structured component evidence. Registry entries have `registry:<namespace/name>` IDs. Package, repository and remote identities use `<kind>:<first 32 hex characters of SHA-256(canonical identity JSON)>`. Names, shared repositories and identical endpoints never deduplicate entries by themselves. Exact source bindings are explicit reviewed rows. Registry observations have precedence over directory metadata; editorial fields override only when present. Source withdrawal cannot be undone by an `active` editorial override. Directory-only discoveries without component proof remain available in public observations.

Markdown rows that share a link retain separate observations when their normalized content differs. Such ambiguous listing IDs include a row-content digest suffix, preventing a shared repository URL from collapsing distinct components before identity review. Only exact equivalent normalized rows may combine their category annotations.

The Registry uses `version=latest`, follows all cursors to exhaustion and retains active/deprecated/deleted statuses. Unsupported transports stay in the admitted source input; they are not advertised as supported remotes. No cursors or timeouts can result in a partial publication. A new latest version supersedes its predecessor directly. Other absences retain their previous observation after the first complete scan, become deprecated after a second complete scan at least 24 hours later, and clear on reappearance. Explicit upstream deletion withdraws immediately. A per-source count drop over 20% fails refresh for review.

## Measured bounds

The initial complete Registry traversal on 2026-10-13 returned 43,035 latest records; 27,326 had usable HTTPS remotes. Its retained sanitized JSON is 46,748,471 bytes. TensorBlock's retained JSON is 10,962,371 bytes and needs a source-specific 16 MiB input cap. Other individual source responses are limited to 8 MiB, metadata to 1 MiB, and notices to 128 KiB.

The compiled catalog is 51,470,635 bytes, with 43,042 entries. Publication caps are **100,000 canonical entries and 80 MiB compiled bytes**, comfortably below GitHub's 100 MiB single-file limit for the measured corpus. Registry acquisition caps are 1,000 pages and 100,000 records, 128 MiB total downloads, and ten minutes total source acquisition; each HTTPS request has a 20-second deadline and at most three attempts/three same-origin redirects. Every referenced host is allowlisted and resolved within the actual socket lookup; private addresses are refused. Redirects cannot change a public Registry/raw request into an authenticated GitHub API request. Retained Registry snapshots have an 80 MiB cap; individual normalized observations have a 64 KiB cap. Overflows fail without publication, never truncate the corpus. If the input approaches these bounds, review paging/sharding and coordinate a new consumer contract before increasing them.

## GitHub setup and automatic publication

Enable Actions and allow GitHub Actions to create pull requests. Protect `main`: require a pull request and the `Catalog checks` status, prohibit force pushes/deletions and direct writes, and retain the normal merge-commit method. The refresh job needs `contents:write`, `pull-requests:write`, and `actions:write`; the validator has only `contents:read`. No personal access token is stored. A repository/organization policy that forbids workflow PR creation or these permissions is an operational blocker to resolve in repository settings, not a reason to bypass review.

The daily/manual workflow checks out trusted `main`, installs pinned dependencies with scripts disabled, fetches sources, then runs the same offline typecheck/tests/rebuild validator as PR CI. It may change only the generated data paths listed in `src/generated-paths.ts`; curation, reviews, source policy and code are excluded. It updates one `automation/catalog-refresh` branch/PR with a compare-and-swap push, preserving the PR when checks fail. Unrecognized PR authors or non-generated changes cause a refusal.

GitHub suppresses workflow events caused by `GITHUB_TOKEN` pushes and PR creation. The refresh job explicitly dispatches `check.yml` on the bot branch, waits for a successful `workflow_dispatch` run on that exact head SHA, then checks the PR head, base and publication sequence again. It merges with `--match-head-commit`, without bypass permissions. A changed main or head, failed check, missing run or timeout leaves the PR unmerged. The next scheduled run starts from current main and updates/rebuilds that same PR. This is the documented dispatch exception in [GitHub's event-triggering rules](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow#triggering-a-workflow-from-a-workflow).

Schedule and dispatch are serialized and do not cancel an in-progress run. Wong2 is fetched on Tuesdays; other sources daily. Unchanged bytes and revisions do not create timestamp-only catalog publications. A refresh still reevaluates evidence expiry and missing-state transitions. The bounded job timeout is 25 minutes, including an exact-head check wait of up to six minutes.

The workflow must be merged into `main` before manual dispatch is available. Initial bootstrap acceptance includes a real dispatch, its resulting exact-head check, and a reviewed green merge/no-change result. Local tests alone cannot establish that repository-level permissions are configured correctly.

## Rollback and investigation

Keep the last valid consumer projection when retrieval, validation or publication fails. Do not delete or hand-edit a failed PR to hide the failure. Diagnose the failed source/adapter/check, fix it in a reviewed PR, then dispatch refresh to prove recovery on the same pending work.

For a bad published configuration, change curation or restore the relevant inputs through a new PR, increment sequence and regenerate artifacts. Never decrement sequence or rewrite `main` to an old SHA: consumers use the sequence as a rollback watermark. A consumer may temporarily pin an earlier immutable known-good revision as an explicit operator recovery decision, with its watermark reset handled as an audited operation. For urgent unsafe components, publish a higher-sequence `withdrawn` curation state and revoke approval evidence.

Input licenses, source authority changes, schema changes and large observation drops need explicit maintainer review. Upstream request errors log status/source only, never authorization headers or arbitrary response bodies. Snapshots intentionally contain sanitized admission data, not executable installation commands or user credentials.
