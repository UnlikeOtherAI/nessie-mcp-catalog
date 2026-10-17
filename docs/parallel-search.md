# Parallel Search connection curation

The canonical component is `registry:ai.parallel/search-mcp`, discovered as `ai.parallel/search-mcp@1.0.0` in `observations/official-registry.json`. Its structured Registry namespace/name establishes identity. This curation updates that existing component; it does not merge directory listings or create another component from a matching name or URL.

The publisher's [Search MCP guide](https://docs.parallel.ai/integrations/mcp/search-mcp) and [pinned component README](https://github.com/parallel-web/search-mcp/blob/ac8e207b9fb1d5febb95d95b90c3a107ebdbdcbc/README.md) specify:

- Streamable HTTP at `https://search.parallel.ai/mcp`.
- Anonymous access without an account or API key, subject to free-tier rate limits.
- `web_search` for web search and `web_fetch` for reading specific URLs.

`curation/entries.json` overrides the discovered remote's older URL and unknown authentication with this public connection contract. It retains the `remote-1` ID, records `auth.method: "none"`, and leaves the remote version unspecified because the current hosted connection documentation does not pin a service version. The original Registry source reference remains in the generated entry alongside the curation source. Other metadata and components inherit their source values.

This is connection metadata, not test or approval evidence. `nessieApproved` and `madeByNessie` remain false, with no approval or authorship evidence. No third-party server package or tool is executed by the catalog checks. Nessie consumers still own connection checks and authentication discovery; listing this endpoint does not select it for an existing connection.

To reproduce the publication from retained inputs, use the [local setup](../README.md#work-locally), then run `pnpm build`, `pnpm typecheck`, `pnpm test` and `pnpm check`. Catalog and manifest schemas validate the connection; the offline rebuild checks the generated catalog, manifest, report and all source observations. Future source refreshes preserve this editorial override until a reviewed curation PR changes it.
