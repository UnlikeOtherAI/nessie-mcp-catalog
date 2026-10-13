import { CATALOG_REPOSITORY } from './refresh-gate.ts'

/** gh treats the repository root with a trailing slash as a different endpoint. */
export function catalogApiEndpoint(path = ''): string {
  const relative = path.replace(/^\/+|\/+$/g, '')
  const segments = relative.split('?')[0].split('/')
  if (relative && segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':'))) {
    throw new Error('GitHub API endpoint must be repository-relative')
  }
  return `repos/${CATALOG_REPOSITORY}${relative ? `/${relative}` : ''}`
}

/** Follow the job's explicit check-run reference; job IDs need not be check IDs. */
export function catalogCheckRunPath(checkRunUrl: string): string {
  const url = new URL(checkRunUrl)
  const prefix = `/repos/${CATALOG_REPOSITORY}/check-runs/`
  const id = url.pathname.slice(prefix.length)
  if (url.protocol !== 'https:' || url.hostname !== 'api.github.com' || url.port || url.username || url.password
    || url.search || url.hash || !url.pathname.startsWith(prefix) || !/^[1-9][0-9]*$/.test(id)
    || !Number.isSafeInteger(Number(id))) throw new Error('Unexpected required validator check-run URL')
  return `check-runs/${id}`
}
