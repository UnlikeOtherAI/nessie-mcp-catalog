import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { digest } from '../hash.ts'
import { publicUrl, safeText } from '../sanitize.ts'
import { metadata, sourceRef } from './common.ts'
import type { Observation } from '../model.ts'
import type { Snapshot } from '../wire.ts'

type Node = { type: string; value?: string; url?: string; depth?: number; children?: Node[]; position?: { start: { line: number } } }
const flatten = (node: Node): string => node.type === 'html' ? '' : node.value ?? node.children?.map(flatten).join(' ') ?? ''
function links(node: Node): string[] {
  return [...(node.type === 'link' && node.url ? [node.url] : []), ...(node.children ?? []).flatMap(links)]
}
const WONG_SECTIONS = new Set(['Reference Servers', 'Official Servers', 'Community Servers'])
const STOP_SECTIONS = new Set(['Community', 'Related', 'Contributing', 'License', 'Resources', 'Tools', 'Clients', 'Frameworks'])

/** Heading/table/list structure only: no prose-based endpoint or auth inference. */
export function parseMarkdown(body: string, snapshot: Snapshot): Observation[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Node
  const result: Observation[] = []
  let section = ''
  let category = ''
  let servers = false
  for (const node of tree.children ?? []) {
    if (node.type === 'heading') {
      const heading = flatten(node).trim()
      if ((node.depth ?? 0) <= 2) {
        section = heading
        if (snapshot.id === 'wong2') servers = WONG_SECTIONS.has(heading)
        else if (snapshot.id === 'jaw9c-remote') servers = heading === 'Remote MCP Server List'
        else if (/^(?:Servers|Server List|Available Servers|Remote MCP Servers|MCP Servers)(?:\s|$)/.test(heading)) servers = true
        else if (STOP_SECTIONS.has(heading)) servers = false
        // General punkpeye uses a "Server Implementations" collection then category headings.
        if (snapshot.id === 'punkpeye' && heading === 'Server Implementations') servers = true
      }
      category = heading
      continue
    }
    if (!servers) continue
    const candidates = node.type === 'list' ? node.children ?? []
      : node.type === 'table' ? (node.children ?? []).slice(1) : []
    for (const candidate of candidates) {
      const urls = [...new Set(links(candidate).map(publicUrl).filter((url) => url !== null))].slice(0, 30)
      if (!urls.length) continue
      const first = urls[0]
      const nativeId = `${section}:${first}`
      const line = candidate.position?.start.line ?? 0
      const content = safeText(flatten(candidate))
      const firstLink = findFirstLink(candidate)
      const info = metadata(firstLink ? flatten(firstLink) : content.slice(0, 150), content)
      info.repositoryUrl = urls.find((url) => new URL(url).hostname === 'github.com') ?? null
      info.websiteUrl = info.repositoryUrl === first ? null : first
      info.categories = category ? [safeText(category, 300)] : []
      result.push({ nativeId, sourceRef: sourceRef(snapshot, nativeId, { urls, content }, `README.md:L${line}`),
        identity: null, metadata: info, remotes: [], packages: [], lifecycle: 'active', selected: true,
        links: urls, unresolvedReason: 'Directory listing requires an explicit component binding; URLs are not installation proof.' })
    }
  }
  // One source can repeat an exact listing under categories. Preserve corroborating category values.
  const unique = new Map<string, Observation>()
  for (const observation of result) {
    const previous = unique.get(observation.nativeId)
    if (!previous) unique.set(observation.nativeId, observation)
    else {
      previous.metadata.categories = [...new Set([...previous.metadata.categories, ...observation.metadata.categories])].slice(0, 20)
      previous.sourceRef.digest = digest([previous.sourceRef.digest, observation.sourceRef.digest])
    }
  }
  return [...unique.values()]
}
function findFirstLink(node: Node): Node | undefined {
  if (node.type === 'link') return node
  return (node.children ?? []).map(findFirstLink).find(Boolean)
}
