import { lookup } from 'node:dns'
import { request } from 'node:https'
import { isPublicAddress } from './sanitize.ts'

const ALLOWED_HOSTS = new Set(['api.github.com', 'raw.githubusercontent.com', 'registry.modelcontextprotocol.io'])
export class FetchBudget {
  bytes = 0
  readonly limit: number
  constructor(limit = 128 * 1024 * 1024) { this.limit = limit }
  add(size: number): void {
    this.bytes += size
    if (this.bytes > this.limit) throw new Error('Total download budget exceeded')
  }
}
export type ReadResult = { body: string; status: number; etag: string | null; retryAfter: string | null }
export type ReadOptions = { maxBytes: number; budget: FetchBudget; etag?: string; timeoutMs?: number }

/** HTTPS socket DNS is validated in its own lookup callback; no check/fetch rebinding gap. */
function once(url: URL, options: ReadOptions): Promise<ReadResult & { location: string | null }> {
  if (!ALLOWED_HOSTS.has(url.hostname) || url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Source URL is outside the reviewed fetch allowlist')
  }
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'user-agent': 'nessie-mcp-catalog/1', accept: 'application/json, text/plain' }
    if (options.etag) headers['if-none-match'] = options.etag
    if (url.hostname === 'api.github.com' && process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`
    const req = request(url, {
      headers, lookup: (hostname, lookupOptions, callback) => {
        lookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
          if (error) { callback(error, []); return }
          if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
            callback(new Error('Source resolved to a non-public address'), []); return
          }
          callback(null, addresses)
        })
      },
    }, (response) => {
      const chunks: Buffer[] = []
      let bytes = 0
      response.on('error', reject)
      const claimed = Number(response.headers['content-length'])
      if (Number.isFinite(claimed) && claimed > options.maxBytes) {
        response.destroy(new Error('Source response size limit exceeded')); return
      }
      response.on('data', (chunk: Buffer) => {
        try {
          bytes += chunk.length
          options.budget.add(chunk.length)
          if (bytes > options.maxBytes) throw new Error('Source response size limit exceeded')
          chunks.push(chunk)
        } catch (error) { response.destroy(error as Error) }
      })
      response.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'),
        status: response.statusCode ?? 0, etag: response.headers.etag ?? null,
        retryAfter: response.headers['retry-after'] ?? null, location: response.headers.location ?? null }))
    })
    const timer = setTimeout(() => req.destroy(new Error('Source request timed out')), options.timeoutMs ?? 20_000)
    req.on('close', () => clearTimeout(timer))
    req.on('error', () => reject(new Error('Source network request failed')))
    req.end()
  })
}

export async function readPublic(urlString: string, options: ReadOptions): Promise<ReadResult> {
  let url = new URL(urlString)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let result = await once(url, options)
      for (let redirects = 0; result.status >= 300 && result.status < 400 && result.status !== 304; redirects++) {
        if (!result.location || redirects >= 3) throw new Error('Source redirect limit exceeded')
        url = new URL(result.location, url)
        result = await once(url, options)
      }
      if (result.status === 200 || result.status === 304) return result
      if (result.status !== 429 && result.status < 500) throw new Error(`Source HTTP ${result.status}`)
      if (attempt === 2) throw new Error(`Source HTTP ${result.status}`)
      const delay = Math.min(10_000, Math.max(1000, Number(result.retryAfter) * 1000 || 2 ** attempt * 1000))
      await new Promise((resolve) => setTimeout(resolve, delay))
    } catch (error) {
      if (attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
    }
  }
  throw new Error('Source retry limit exceeded')
}
