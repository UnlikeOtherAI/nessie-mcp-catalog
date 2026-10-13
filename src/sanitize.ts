import { isIP } from 'node:net'

const SENSITIVE_KEY = /^(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|access_token|refresh_token|api[_-]?key|client_secret|credential|private_key|signature)$/i
const SECRET_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_|github_pat_|sk-(?:proj-|ant-)?|xox[baprs]-|AKIA)[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g
const CREDENTIAL_ASSIGNMENT = /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization)\s*[=:]\s*["']?)(?!\{)[A-Za-z0-9_.~+\/-]{12,}/gi

export function safeText(value: unknown, max = 4000): string {
  if (typeof value !== 'string') return ''
  return value.replace(/https?:\/\/[^\s<>"`\])]+/g, (url) => publicUrl(url) ? url : '[REDACTED-URL]')
    .replace(SECRET_VALUE, '[REDACTED]').replace(CREDENTIAL_ASSIGNMENT, '$1[REDACTED]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max)
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254)
      && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168)
      && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19))
      && !(a === 192 && b === 0 && (c === 0 || c === 2)) && !(a === 192 && b === 88 && c === 99)
      && !(a === 198 && b === 51 && c === 100) && !(a === 203 && b === 0 && c === 113)
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase()
    return /^[23][0-9a-f]{3}:/.test(normalized) && !normalized.startsWith('2001:db8:')
  }
  return false
}

export function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000 || value.includes('[REDACTED')) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (host === 'localhost' || !host.includes('.') || host.endsWith('.local') || host.endsWith('.internal')) return null
    if (isIP(host) && !isPublicAddress(host)) return null
    for (const [name, content] of url.searchParams) {
      if (SENSITIVE_KEY.test(name) || /token|secret|credential|password|api.?key/i.test(name)) return null
      if (content.length > 100 || /[A-Za-z0-9_-]{40,}/.test(content)) return null
    }
    url.hash = ''
    return url.toString()
  } catch { return null }
}

/** All potentially executable/secret defaults are dropped, even when upstream calls them public. */
export function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 20) throw new Error('Input nesting limit exceeded')
  if (typeof value === 'string') return safeText(value, 64 * 1024)
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item, depth + 1))
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === 'headers' && Array.isArray(item)) {
        result[key] = item.map((header: Record<string, unknown>) => ({
          name: safeText(header.name, 100), isRequired: header.isRequired === true,
          isSecret: header.isSecret === true,
          valuePrefix: typeof header.value === 'string' && header.value.startsWith('Bearer ') ? 'Bearer ' : null,
        }))
      } else if (SENSITIVE_KEY.test(key) || ['value', 'default', 'headers', 'environmentVariables', 'arguments', 'command', 'commands', 'env'].includes(key)) {
        result[key] = '[REDACTED]'
      } else result[key] = sanitizeJson(item, depth + 1)
    }
    return result
  }
  return value
}

export function assertSanitized(value: unknown): void {
  const serialized = JSON.stringify(value)
  SECRET_VALUE.lastIndex = 0
  if (SECRET_VALUE.test(serialized)) throw new Error('Credential sentinel or secret pattern found')
  SECRET_VALUE.lastIndex = 0
}
