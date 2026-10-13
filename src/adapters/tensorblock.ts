import { array, metadata, nullable, record, remote, sourceRef } from './common.ts'
import { safeText, publicUrl } from '../sanitize.ts'
import type { Observation } from '../model.ts'
import type { Snapshot } from '../wire.ts'

export function parseTensorblock(body: string, snapshot: Snapshot): Observation[] {
  const data: unknown = JSON.parse(body)
  if (!Array.isArray(data)) throw new Error('TensorBlock snapshot must be an array')
  return data.map((raw): Observation => {
    const item = record(raw)
    const nativeId = safeText(item.id, 1000)
    if (!nativeId) throw new Error('TensorBlock record lacks native ID')
    const links = record(item.links)
    const info = metadata(item.name, item.description)
    info.repositoryUrl = publicUrl(links.repo)
    info.websiteUrl = publicUrl(links.homepage)
    info.documentationUrl = publicUrl(links.docs)
    info.categories = typeof item.category === 'string' ? [safeText(item.category, 300)] : []
    const transports = array(item.transport)
    const remotes = transports.flatMap((transport, index) => {
      const candidate = remote(links.endpoint, transport, `remote-${index + 1}`)
      if (!candidate) return []
      const auth = record(item.auth).type
      if (auth === 'none' || auth === 'oauth2' || auth === 'bearer') candidate.auth.method = auth
      return [candidate]
    })
    return { nativeId, sourceRef: sourceRef(snapshot, nativeId, raw, nullable(record(item.source).docsPath, 1000)),
      identity: null, metadata: info, remotes, packages: [], lifecycle: 'active', selected: true,
      links: [...new Set(Object.values(links).map(publicUrl).filter((url) => url !== null))].slice(0, 30),
      unresolvedReason: 'Source native ID identifies a listing; component identity needs an explicit binding.' }
  })
}
