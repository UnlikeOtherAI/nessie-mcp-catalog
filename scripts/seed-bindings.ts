/** Initial reviewed mappings. Exact source keys; never a general repository/URL auto-merge. */
import { readFile, writeFile } from 'node:fs/promises'
import { json } from '../src/hash.ts'
import { identityId } from '../src/identity.ts'
import type { Identity } from '../src/wire.ts'
const curation = JSON.parse(await readFile('curation/entries.json', 'utf8'))
const registryNames: Record<string, string> = {
  notion: 'com.notion/mcp', linear: 'app.linear/linear', sentry: 'io.github.getsentry/sentry-mcp',
  context7: 'io.github.upstash/context7', 'cloudflare-docs': 'com.cloudflare.mcp/mcp',
  github: 'io.github.github/github-mcp-server', stripe: 'com.stripe/mcp',
  huggingface: 'co.huggingface/hf-mcp-server', paypal: 'com.paypal.mcp/mcp',
}
for (const entry of curation.entries) {
  entry.legacyLibraryKey = entry.metadata.name
  const name = registryNames[entry.metadata.name]
  if (name) {
    entry.identity = { kind: 'registry', name }
    entry.id = identityId(entry.identity)
    entry.reason += ' Explicitly bound to the matching publisher Registry namespace and component using its declared remote plus the existing vendor documentation; no generic endpoint-only adoption is enabled.'
  }
}
const github: Identity = { kind: 'registry', name: 'io.github.github/github-mcp-server' }
const linear: Identity = { kind: 'registry', name: 'app.linear/linear' }
const context7: Identity = { kind: 'registry', name: 'io.github.upstash/context7' }
const filesystem: Identity = { kind: 'repository', repositoryId: 890668799, component: 'src/filesystem' }
const deepwiki: Identity = { kind: 'remote', providerId: 'cognition.ai', component: 'deepwiki' }
const definitions: [string, string, Identity, string, string][] = [
  ['punkpeye', 'Server Implementations:https://github.com/github/github-mcp-server', github,
    'https://github.com/github/github-mcp-server', 'The GitHub publisher Registry namespace declares this exact single MCP server repository and its hosted variant. This binding is specific to that named component.'],
  ['wong2', 'Official Servers:https://github.com/github/github-mcp-server', github,
    'https://github.com/github/github-mcp-server', 'The listing identifies GitHub’s official MCP server component, corroborated by its publisher Registry record, repository and documented remote.'],
  ['tensorblock', 'github-github-github-mcp-server-faa31886', github,
    'https://github.com/github/github-mcp-server', 'The structured source listing names the GitHub MCP server repository; the corresponding publisher Registry record identifies this component explicitly.'],
  ['punkpeye', 'Server Implementations:https://github.com/upstash/context7', context7,
    'https://github.com/upstash/context7', 'Explicit single-component binding for Upstash Context7; the publisher Registry record declares this repository and hosted endpoint.'],
  ['punkpeye-remote', 'Servers:https://linear.app/', linear,
    'https://linear.app/docs/mcp', 'Linear’s vendor documentation, declared remote and publisher Registry namespace identify the same Linear service component.'],
  ['jaw9c-remote', 'Remote MCP Server List:https://linear.app/', linear,
    'https://linear.app/docs/mcp', 'The table names the Linear operator and its legacy SSE route. Current configuration is maintained in curation; this is the same vendor component, not an endpoint-only match.'],
  ['punkpeye', 'Server Implementations:https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', filesystem,
    'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', 'The explicit src/filesystem path identifies this component inside repository 890668799. Other monorepo components remain separate.'],
  ['wong2', 'Reference Servers:https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', filesystem,
    'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', 'The same explicit src/filesystem component path and stable GitHub repository identity corroborate the reference server.'],
  ['wong2', 'Official Servers:https://docs.devin.ai/work-with-devin/deepwiki-mcp', deepwiki,
    'https://docs.devin.ai/work-with-devin/deepwiki-mcp', 'The Cognition/Devin documentation identifies the DeepWiki hosted component already named in Nessie’s migrated configuration.'],
  ['punkpeye-remote', 'Servers:https://deepwiki.com/', deepwiki,
    'https://docs.devin.ai/work-with-devin/deepwiki-mcp', 'DeepWiki’s documented Cognition operator and named service component bind this listing; the source’s hosted URL corroborates rather than defines identity.'],
  ['jaw9c-remote', 'Remote MCP Server List:https://devin.ai/', deepwiki,
    'https://docs.devin.ai/work-with-devin/deepwiki-mcp', 'This table row explicitly names DeepWiki and the Devin operator with its legacy SSE route; it is not every service on devin.ai.'],
]
await writeFile('curation/entries.json', json(curation))
await writeFile('curation/identity-map.json', json({ schemaVersion: 1, bindings: definitions.map(([sourceId, nativeId, identity, evidenceUrl, reason]) => ({ sourceId, nativeId, identity, evidenceUrl, reason })) }))
