import { canonical, digest } from './hash.ts'
import type { Identity } from './wire.ts'
import type { Observation } from './model.ts'
import { IdentityMapSchema } from './model.ts'

export function identityId(identity: Identity): string {
  if (identity.kind === 'registry') return `registry:${identity.name}`
  if (identity.kind === 'remote') return `remote:${digest(identity).slice(0, 32)}`
  return `${identity.kind}:${digest(identity).slice(0, 32)}`
}
export function bindingMap(input: unknown): Map<string, Identity> {
  const parsed = IdentityMapSchema.parse(input)
  const result = new Map<string, Identity>()
  for (const binding of parsed.bindings) {
    const key = `${binding.sourceId}\0${binding.nativeId}`
    const prior = result.get(key)
    if (prior && canonical(prior) !== canonical(binding.identity)) throw new Error('Conflicting source identity binding')
    result.set(key, binding.identity)
  }
  return result
}
export function resolveIdentity(observation: Observation, bindings: Map<string, Identity>): Identity | null {
  const bound = bindings.get(`${observation.sourceRef.sourceId}\0${observation.nativeId}`)
  if (bound && observation.identity && canonical(bound) !== canonical(observation.identity)) {
    throw new Error('A binding cannot overwrite a structured upstream identity')
  }
  return bound ?? observation.identity
}
