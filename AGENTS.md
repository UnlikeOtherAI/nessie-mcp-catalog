# Catalog contributor rules

Work in a dedicated worktree and branch; do not edit main directly. Use pnpm and Node 24, keep TypeScript strict and code modules below 500 lines. Source-code and curation changes must update the corresponding documentation. Run `pnpm typecheck`, `pnpm test` and `pnpm check` before handing off.

The source pipeline and operational bounds are documented in [docs/operations.md](docs/operations.md), evidence requirements in [docs/approval-policy.md](docs/approval-policy.md), and curation workflow in [CONTRIBUTING.md](CONTRIBUTING.md). Never execute third-party MCP packages, persist credentials, infer approval from stars, or deduplicate by name/repository URL/endpoint alone. All six admitted sources must remain complete; failures preserve the last publication.

Refresh may modify generated inputs/observations/artifacts only. Editorial overrides and review evidence require a normal PR. Every change lands through a green PR; sub-agents commit/push their assigned branch and hand it to the orchestrator without creating or merging a PR.
