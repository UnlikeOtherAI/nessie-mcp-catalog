# Nessie MCP catalog

Nessie's public, owned catalog collects MCP server information from several public sources, retains the admitted inputs and their provenance, and publishes a consistent artifact for Nessie. This repository is the shared source and curation authority. Nessie imports its output into the existing application catalog; it does not maintain a second discovery catalog.

The initial complete publication contains **43,042 canonical components**, including **27,332 with a usable HTTPS remote configuration**, **15,061 package-only components**, and **13,488 additional unresolved directory observations**. There are 56,534 observations across six sources. A remote configuration is a connection candidate, not proof that a server works. No third-party server package or tool was executed to collect this data.

## Sources and provenance

Stars below were observed through GitHub's API on 2026-10-13. They informed source selection, never server approval. Exact repository IDs, revisions, dates, license digests and input hashes are committed in [`sources.json`](sources.json), [`sources.lock.json`](sources.lock.json), and each source's `inputs/<source>/metadata.json`.

| Input | GitHub stars observed | Latest pinned commit date | Retained observations | Why included |
| --- | ---: | --- | ---: | --- |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/docs) | — | Complete API traversal, 2026-10-13 | 43,035 | Structured publisher namespaces, versions, packages, declared remotes and lifecycle |
| [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | 96,281 | 2026-10-09 | 4,210 | Broad, actively maintained general list |
| [wong2/awesome-mcp-servers](https://github.com/wong2/awesome-mcp-servers) | 4,359 | 2026-07-13 | 515 | Established selective list; checked weekly because its update cadence is slower |
| [punkpeye/awesome-remote-mcp-servers](https://github.com/punkpeye/awesome-remote-mcp-servers) | 1,160 | 2026-10-09 | 924 | Maintained remote-focused discovery |
| [jaw9c/awesome-remote-mcp-servers](https://github.com/jaw9c/awesome-remote-mcp-servers) | 1,143 | 2026-09-24 | 121 | Independent remote list with structured rows |
| [TensorBlock/awesome-mcp-servers](https://github.com/TensorBlock/awesome-mcp-servers) | 898 | 2026-10-13 | 7,729 | Structured JSON listing IDs and component metadata |

[appcypher/awesome-mcp-servers](https://github.com/appcypher/awesome-mcp-servers) was considered (5,794 stars in the selection audit) but excluded because it was archived on 2026-05-06 and did not have an API-recognized reuse license. The official reference-server repository is useful component evidence, not an additional general catalog feed. Source inclusion requires maintained, openly reusable data and useful coverage; being the most starred is insufficient.

`inputs/` retains credential-sanitized source snapshots, `observations/` contains normalized discoveries, and `dist/catalog.json` contains components with a strong identity. Unsupported or ambiguous discoveries remain public in observations. All six sources contribute provenance to canonical records; for example, GitHub's MCP component combines the Registry, punkpeye, wong2, TensorBlock and explicit Nessie curation. Eleven canonical entries currently have multiple sources.

## Two independent Nessie flags

- **`nessieApproved`** means the applicable, explicitly tested configuration has current evidence for compatibility, read-only functionality, authentication scope and security review against a recorded Nessie and test-suite revision. Evidence names the tested remote IDs, material digest, environment, limitations, review decision and expiry. It is not a universal security certification.
- **`madeByNessie`** means Nessie authored that exact component, with repository/revision evidence and a review decision. Listing, packaging, configuring or testing someone else's server does not establish authorship.

Both default to `false`. The current publication has **zero approved and zero Nessie-authored entries**. They are independent of publisher verification in the Registry and independent of Nessie's existing community/Nessie presentation badges. An upstream verification claim or high star count cannot set either flag. See [approval policy](docs/approval-policy.md).

## Consume the publication

Read [`dist/manifest.json`](dist/manifest.json) first, then fetch its `catalogPath` from the **same immutable Git commit** and verify `catalogSha256`. Validate the strict [manifest](schema/manifest-v1.schema.json) and [catalog](schema/catalog-v1.schema.json) schemas. The TypeScript contract is [`src/wire.ts`](src/wire.ts); [`test/fixtures/`](test/fixtures/) contains small synthetic fixtures.

Consumers must enforce the publisher, complete snapshot flag, strictly increasing sequence, entry count, schema, byte caps and hash before replacing a working catalog. A changed hash at the same sequence is invalid. Missing, stale, unknown-schema or partial publications must not clear the previous catalog. Respect lifecycle withdrawals. Re-evaluate approval expiry at use time and require the selected remote ID to appear in `approval.testedRemoteIds`; a component-level true flag does not endorse every alternative endpoint. Package-only records remain searchable source data but cannot be offered as a remote installation without a supported runtime.

The default raw feed is `https://raw.githubusercontent.com/UnlikeOtherAI/nessie-mcp-catalog/main/dist/manifest.json`. A consumer must resolve `main` to a commit or pin a configured revision before reading both artifacts. The consumer owns bounded, public-network-only fetching and authentication discovery at connect time.

## Work locally

Use Node 24 and pnpm 10.12.4. All checks below are offline and do not run any listed server:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test
pnpm check
```

`pnpm build` regenerates normalized observations, report and publication from retained inputs and editorial files. `pnpm schema` regenerates JSON schemas from the wire contract. `pnpm refresh` fetches reviewed sources and prepares a new complete publication; it does not publish to GitHub. A maintainer can use `pnpm refresh --force` to include the weekly source outside Tuesday. GitHub API authentication is optional for local refresh; provide a short-lived `GH_TOKEN` only in the process environment if rate limits require it.

The [refresh workflow](.github/workflows/refresh.yml) runs daily at 03:17 UTC and supports manual dispatch. It creates or updates a generated-data-only PR, explicitly dispatches the read-only validator on that exact head, and merges only after that check succeeds and the base is unchanged. See [operations and limits](docs/operations.md) for repository setup, recovery and rollback; [contributing](CONTRIBUTING.md) for curation.

## Licensing

Source code and original Nessie curation are [MIT licensed](LICENSE). Retained input rights remain separate: the Registry dedicates Registry Data under CC0 1.0; the five selected GitHub inputs are MIT with their original notices retained. Referenced server code, hosted services, trademarks and packages keep their own licenses and terms. See [third-party notices](THIRD_PARTY_NOTICES.md).
