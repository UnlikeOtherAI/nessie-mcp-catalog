import { array, metadata, nullable, record, remote, sourceRef } from './common.ts'
import { safeText, publicUrl } from '../sanitize.ts'
import type { Observation } from '../model.ts'
import type { Package, Snapshot } from '../wire.ts'

export function parseRegistry(body: string, snapshot: Snapshot): Observation[] {
  const data: unknown = JSON.parse(body)
  if (!Array.isArray(data)) throw new Error('Registry snapshot must be an array')
  return data.map((raw): Observation => {
    const envelope = record(raw)
    const server = record(envelope.server)
    const name = safeText(server.name, 300)
    if (!name || !name.includes('/')) throw new Error('Registry record has no stable namespace/name')
    const version = nullable(server.version, 200)
    const nativeId = `${name}@${version ?? 'unknown'}`
    const official = record(record(envelope._meta)['io.modelcontextprotocol.registry/official'])
    const status = official.status
    if (status != null && !['active', 'deprecated', 'deleted'].includes(String(status))) throw new Error('Unknown Registry lifecycle')
    const info = metadata(server.title ?? name, server.description)
    info.name = name.split('/').at(-1)!.slice(0, 300)
    info.vendor = name.split('/')[0]
    info.websiteUrl = publicUrl(server.websiteUrl)
    info.repositoryUrl = publicUrl(record(server.repository).url)
    const remotes = array(server.remotes).map((rawRemote, index) => {
      const item = record(rawRemote)
      const result = remote(item.url, item.type, `remote-${index + 1}`)
      if (!result) return null
      result.version = version
      const headers = array(item.headers).map(record).filter((header) => header.isRequired === true && header.isSecret === true)
      if (headers.length === 1) {
        const header = headers[0]
        const name = safeText(header.name, 100)
        result.auth = { method: name.toLowerCase() === 'authorization' && header.valuePrefix === 'Bearer ' ? 'bearer' : 'api_key',
          headerName: name, valuePrefix: header.valuePrefix === 'Bearer ' ? 'Bearer ' : null, hint: null, scopes: [] }
      }
      return result
    }).filter((item) => item !== null)
    const packages = array(server.packages).flatMap((rawPackage): Package[] => {
      const item = record(rawPackage)
      const identifier = safeText(item.identifier, 300)
      const registryType = safeText(item.registryType, 300)
      if (!identifier || !registryType) return []
      const transport = record(item.transport).type
      return [{ registryType, identifier, version: nullable(item.version, 200),
        transport: transport === 'stdio' ? 'stdio' : transport === 'sse' ? 'sse' : transport === 'streamable-http' ? 'http' : 'unknown' }]
    })
    return { nativeId, sourceRef: sourceRef(snapshot, nativeId, raw), identity: { kind: 'registry', name },
      metadata: info, remotes, packages, lifecycle: status === 'deleted' ? 'withdrawn' : status === 'deprecated' ? 'deprecated' : 'active',
      selected: official.isLatest !== false,
      links: [info.repositoryUrl, info.websiteUrl].filter((url) => url !== null),
      unresolvedReason: official.isLatest === false ? 'superseded-version' : null }
  })
}
