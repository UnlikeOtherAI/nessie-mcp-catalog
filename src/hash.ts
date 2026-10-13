import { createHash } from 'node:crypto'
export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
export const digest = (value: unknown): string => sha256(canonical(value))
export const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
