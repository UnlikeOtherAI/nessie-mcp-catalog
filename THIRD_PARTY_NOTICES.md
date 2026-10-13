# Third-party inputs

This repository's MIT license covers its code and original editorial curation. It does not relicense upstream data, server packages, hosted services or trademarks. Each normalized observation and canonical source reference carries the source's license identifier, pinned revision and digest. These are data/list licenses, not the licenses of linked MCP implementations.

| Input | Retained license/notice | Pinned material |
| --- | --- | --- |
| Official MCP Registry | [CC0 data terms reference](licenses/official-registry.txt) | [Snapshot](inputs/official-registry/snapshot.json), [page digests](inputs/official-registry/metadata.json) |
| punkpeye general list | [Original MIT notice](licenses/punkpeye.txt) | [README snapshot](inputs/punkpeye/snapshot.md) |
| wong2 list | [Original MIT notice](licenses/wong2.txt) | [README snapshot](inputs/wong2/snapshot.md) |
| punkpeye remote list | [Original MIT notice](licenses/punkpeye-remote.txt) | [README snapshot](inputs/punkpeye-remote/snapshot.md) |
| jaw9c remote list | [Original MIT notice](licenses/jaw9c-remote.txt) | [README snapshot](inputs/jaw9c-remote/snapshot.md) |
| TensorBlock list | [Original MIT notice](licenses/tensorblock.txt) | [JSON snapshot](inputs/tensorblock/snapshot.json) |

The [Registry terms](https://modelcontextprotocol.io/registry/terms-of-service) dedicate Registry Data under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). Its API software license is separate. Nessie is an independent aggregator, not endorsed by any upstream maintainer or server publisher.

Sanitation removes credentials, credential-bearing URLs and executable defaults before inputs are retained. Snapshot hashes cover these admitted bytes, not unsanitized upstream bytes. Copyright/license notices are retained with each GitHub source; their hashes are pinned in `sources.json`. Changed notices require a review PR before automatic refresh may accept them. Git history retains prior admitted snapshots without storing third-party response headers, authorization material or executable package payloads.

Fifteen public remote configurations were migrated from Nessie's `packages/mcp-manage/src/library.ts` at commit `fb6054de995d28ada3bb2265acb3961d95315cd0`. The original keys and vendor documentation evidence are recorded in `curation/entries.json`; product built-ins, user installations, private entries and human identity data were not exported.
