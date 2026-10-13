# Security

This is a public source-data and curation repository. Never add passwords, tokens, credential-bearing URLs, response authorization headers, account-specific configuration or private installation data. If sensitive data is discovered, report it privately through GitHub's security reporting feature where available; do not include the secret in a public issue or PR.

Source fetching is restricted to reviewed public upstream hosts with DNS/socket validation, response/time/total limits and bounded retries. Raw-format inputs are sanitized before persistence. Structured secret/default/command values are removed, known credential patterns are redacted, and credential-bearing URLs are rejected. Treat every upstream string as untrusted display data; Markdown and HTML are not executed. These controls reduce exposure but cannot identify every previously unknown secret format embedded in arbitrary prose: source admission and changes remain reviewable.

CI checks source data and schema; it never executes listed MCP packages or server tools. PR checks have read-only permissions and no external provider credentials. The scheduled writer operates only from trusted main, creates a generated-only PR and requires a successful read-only validator on the exact commit before merge. Approval evidence is separate from these catalog integrity checks.

Report an unsafe component with its canonical ID and public evidence. Maintainers can withdraw it and revoke approval through a higher-sequence publication. See [operations](docs/operations.md) and [approval policy](docs/approval-policy.md).
