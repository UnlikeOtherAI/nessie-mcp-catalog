# Curation through pull requests

The home for catalog administration is this public repository. Open a PR changing `curation/entries.json`, `curation/identity-map.json`, or `reviews/`; these files are never rewritten by the refresh job. No additional product administration screen is required.

1. Locate the discovery in `observations/<source>.json` and retain its exact `sourceId`/`nativeId`. Review primary publisher documentation and the relevant component, rather than matching a display name, repository URL or endpoint alone.
2. Add an explicit identity binding when necessary. A Registry namespace/name, ecosystem package plus component, numeric repository ID plus component path, or reviewed provider ID plus component is required. Two components in one repository remain distinct. A binding must not contradict a structured upstream identity.
3. Add only needed editorial fields to `curation/entries.json`. Omitted fields inherit the source. Present `null`, empty strings and empty arrays are explicit overrides. Remote configurations contain public endpoint and auth-contract metadata only; never tokens, user-specific URLs, commands, environment values or personal identity data.
4. Leave both flags false unless the relevant [evidence policy](docs/approval-policy.md) is satisfied. Evidence files and decision links are reviewable in the PR. Authorship is an independent decision.
5. Increment `publication.json.sequence` and set its UTC `generatedAt` when the published catalog or schema changes. Run `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm check`. Include the changed report and generated artifacts in the PR. Source acquisition changes need a bounded real read of the affected upstream input as well as an offline fixture.
6. Merge only when the required `Catalog checks` status is green. Keep code/source-admission changes separate from automated generated-only refresh updates.

The `legacyLibraryKey` field is only for the fifteen explicit migrated global Nessie configurations. Their canonical source references use `sourceId: "nessie-curation"` and the original library key as `nativeId`; consumers can bind those known seeds without guessing identities. New curation does not invent legacy keys.

To add a source, review its maintainership, usefulness and data license; pin its numeric GitHub repository identity and license digest in `sources.json`; implement a structural adapter; retain a complete sanitized input and metadata; and test its precise real input. A source must be bootstrapped completely before it joins scheduled refresh. `scripts/acquire-inputs.ts` is an explicit initial-acquisition utility; it never publishes. `scripts/bootstrap-nessie.ts` documents the one-time literal-AST migration and must not be rerun over reviewed curation.

Code modules stay below 500 lines. Use strict TypeScript and pnpm. Tests must never execute discovered server packages or make live endpoint/tool calls. Do not commit private credentials or unsanitized debug dumps. See [SECURITY.md](SECURITY.md).
