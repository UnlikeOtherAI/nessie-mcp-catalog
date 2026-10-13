import { digest } from '../hash.ts'
import { safeText, publicUrl } from '../sanitize.ts'
import type { Metadata, Remote, Snapshot, SourceRef } from '../wire.ts'

export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
export const nullable = (value: unknown, max = 300): string | null => safeText(value, max) || null
export const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 180) || 'mcp-server'
export function metadata(name: unknown, description: unknown = ''): Metadata {
  const displayName = safeText(name, 300) || 'Unnamed discovery'
  return { name: slug(displayName), displayName, description: safeText(description), vendor: null,
    websiteUrl: null, repositoryUrl: null, documentationUrl: null, categories: [], tags: [] }
}
export function sourceRef(snapshot: Snapshot, nativeId: string, input: unknown, path: string | null = null): SourceRef {
  return { sourceId: snapshot.id, nativeId, revision: snapshot.revision, path,
    url: snapshot.url, digest: digest(input), license: snapshot.license }
}
export const unknownAuth = (): Remote['auth'] => ({ method: 'unknown', headerName: null, valuePrefix: null, hint: null, scopes: [] })
export function remote(url: unknown, transport: unknown, id = 'primary'): Remote | null {
  const safe = publicUrl(url)
  const type = transport === 'streamable-http' || transport === 'http' ? 'http' : transport === 'sse' ? 'sse' : null
  if (!safe || !type) return null
  return { id, url: safe, transport: type, auth: unknownAuth(), version: null }
}
