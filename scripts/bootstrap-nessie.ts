/** One-off explicit migration: parses literal public library metadata, never executes source. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import ts from 'typescript'
import { CurationSchema } from '../src/model.ts'
import { identityId } from '../src/identity.ts'
import { json } from '../src/hash.ts'
const sourcePath = process.argv[2]
if (!sourcePath) throw new Error('Pass the read-only Nessie library.ts source path')
const ast = ts.createSourceFile('library.ts', await readFile(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true)
let initializer: ts.ArrayLiteralExpression | undefined
function visit(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'CURATED_MCP_LIBRARY'
    && node.initializer && ts.isArrayLiteralExpression(node.initializer)) initializer = node.initializer
  ts.forEachChild(node, visit)
}
visit(ast)
if (!initializer) throw new Error('Literal curated library not found')
const providers: Record<string, string> = { notion: 'notion.so', linear: 'linear.app', sentry: 'sentry.io',
  atlassian: 'atlassian.com', asana: 'asana.com', deepwiki: 'cognition.ai', context7: 'upstash.com',
  'cloudflare-docs': 'cloudflare.com', github: 'github.com', stripe: 'stripe.com', zapier: 'zapier.com',
  huggingface: 'huggingface.co', paypal: 'paypal.com', square: 'squareup.com', semgrep: 'semgrep.dev' }
const entries = initializer.elements.map((element) => {
  if (!ts.isObjectLiteralExpression(element)) throw new Error('Unexpected non-literal library element')
  const values: Record<string, string | null> = {}
  for (const property of element.properties) {
    if (!ts.isPropertyAssignment(property)) throw new Error('Non-literal library property')
    const value = property.initializer
    if (!ts.isStringLiteral(value) && value.kind !== ts.SyntaxKind.NullKeyword) throw new Error('Non-literal library value')
    values[property.name.getText(ast)] = ts.isStringLiteral(value) ? value.text : null
  }
  const key = values.key!
  if (!providers[key]) throw new Error('Provider identity requires explicit migration mapping')
  const identity = { kind: 'remote' as const, providerId: providers[key], component: key }
  return { id: identityId(identity), identity, legacyLibraryKey: key,
    metadata: { name: values.name, displayName: values.label, description: values.description,
      vendor: values.vendor, websiteUrl: null, repositoryUrl: values.sourceUrl?.startsWith('https://github.com/') ? values.sourceUrl : null,
      documentationUrl: values.sourceUrl, categories: [], tags: [] },
    remotes: [{ id: 'primary', transport: values.transport, url: values.url,
      auth: { method: values.authMethod, headerName: values.authMethod === 'bearer' ? 'Authorization' : null,
        valuePrefix: values.authMethod === 'bearer' ? 'Bearer ' : null, hint: values.authHint, scopes: [] }, version: null }],
    packages: [], lifecycle: 'active', sourceUrl: values.sourceUrl,
    sourceRevision: 'nessie:fb6054de995d28ada3bb2265acb3961d95315cd0',
    reason: 'Migrated the explicit public remote configuration from Nessie CURATED_MCP_LIBRARY. This is a connection configuration assertion, not new test or approval evidence.',
    nessieApproved: false, madeByNessie: false, reviewPath: null, authorship: null }
})
await mkdir('curation', { recursive: true })
await writeFile('curation/entries.json', json(CurationSchema.parse({ schemaVersion: 1, entries })))
