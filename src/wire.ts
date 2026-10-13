/** Public wire contract v1. All objects are strict; no credentials or install commands. */
import { z } from 'zod'
import { publicUrl } from './sanitize.ts'

export const PUBLISHER = 'UnlikeOtherAI/nessie-mcp-catalog' as const
const text = z.string().max(4000)
const key = z.string().min(1).max(300)
export const Digest = z.string().regex(/^[a-f0-9]{64}$/)
export const Timestamp = z.iso.datetime()
export const PublicUrl = z.url().max(2000).refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password && !url.hash && publicUrl(value) !== null
}, 'Must be a credential-free HTTPS URL without a fragment')
const nullableUrl = PublicUrl.nullable()

export const IdentitySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('registry'), name: key }),
  z.strictObject({ kind: z.literal('package'), registryType: key, identifier: key, component: key }),
  z.strictObject({ kind: z.literal('repository'), repositoryId: z.number().int().positive(), component: key }),
  z.strictObject({ kind: z.literal('remote'), providerId: key, component: key }),
])
export const MetadataSchema = z.strictObject({
  name: key, displayName: key, description: text, vendor: z.string().max(300).nullable(),
  websiteUrl: nullableUrl, repositoryUrl: nullableUrl, documentationUrl: nullableUrl,
  categories: z.array(key).max(20), tags: z.array(key).max(50),
})
export const AuthSchema = z.strictObject({
  method: z.enum(['none', 'bearer', 'api_key', 'oauth2', 'unknown']),
  headerName: z.string().max(100).nullable(), valuePrefix: z.enum(['Bearer ', 'Token ']).nullable(),
  hint: z.string().max(500).nullable(), scopes: z.array(key).max(50),
})
export const RemoteSchema = z.strictObject({
  id: key, transport: z.enum(['http', 'sse']), url: PublicUrl,
  auth: AuthSchema, version: z.string().max(200).nullable(),
})
export const PackageSchema = z.strictObject({
  registryType: key, identifier: key, version: z.string().max(200).nullable(),
  transport: z.enum(['stdio', 'http', 'sse', 'unknown']),
})
export const SourceRefSchema = z.strictObject({
  sourceId: key, nativeId: z.string().min(1).max(1000), revision: key,
  path: z.string().max(1000).nullable(), url: PublicUrl, digest: Digest, license: key,
})
export const ApprovalSchema = z.strictObject({
  policyVersion: z.literal('approval-policy-v1'), materialDigest: Digest,
  testedAt: Timestamp, expiresAt: Timestamp, nessieRevision: key, suiteRevision: key,
  environment: z.enum(['isolated-fixture', 'scoped-live-readonly']),
  checks: z.strictObject({
    compatibility: z.literal('passed'), readOnlyFunctional: z.literal('passed'),
    authScope: z.literal('passed'), securityReview: z.literal('passed'),
  }),
  evidenceUrl: PublicUrl, decisionUrl: PublicUrl, limitations: z.array(text).max(20),
})
export const AuthorshipSchema = z.strictObject({
  componentId: key, repositoryUrl: PublicUrl, revision: key,
  evidenceUrl: PublicUrl, decisionUrl: PublicUrl,
})
export const EntrySchema = z.strictObject({
  id: key, identity: IdentitySchema, sourceRefs: z.array(SourceRefSchema).min(1).max(30),
  metadata: MetadataSchema, remotes: z.array(RemoteSchema).max(30),
  packages: z.array(PackageSchema).max(30),
  lifecycle: z.enum(['active', 'deprecated', 'withdrawn']), materialDigest: Digest,
  nessieApproved: z.boolean(), madeByNessie: z.boolean(),
  approval: ApprovalSchema.nullable(), authorship: AuthorshipSchema.nullable(),
})
export const SnapshotSchema = z.strictObject({
  id: key, kind: z.enum(['registry', 'markdown', 'tensorblock']), url: PublicUrl,
  revision: key, sha256: Digest, fetchedAt: Timestamp, license: key,
  adapterVersion: z.literal(1), observations: z.number().int().nonnegative(),
  status: z.literal('complete'), snapshotPath: z.string().regex(/^inputs\/[a-z0-9-]+\/snapshot\.(json|md)$/),
})
export const ManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), publisher: z.literal(PUBLISHER),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), generatedAt: Timestamp,
  complete: z.literal(true), catalogPath: z.literal('dist/catalog.json'),
  catalogSha256: Digest, entryCount: z.number().int().min(1).max(100_000),
  sourceSnapshots: z.array(SnapshotSchema).min(1).max(20),
})
export const CatalogSchema = z.strictObject({
  schemaVersion: z.literal(1), sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  entries: z.array(EntrySchema).min(1).max(100_000),
})
export type Identity = z.infer<typeof IdentitySchema>
export type Metadata = z.infer<typeof MetadataSchema>
export type Remote = z.infer<typeof RemoteSchema>
export type Package = z.infer<typeof PackageSchema>
export type SourceRef = z.infer<typeof SourceRefSchema>
export type Approval = z.infer<typeof ApprovalSchema>
export type Authorship = z.infer<typeof AuthorshipSchema>
export type Entry = z.infer<typeof EntrySchema>
export type Snapshot = z.infer<typeof SnapshotSchema>
export type Manifest = z.infer<typeof ManifestSchema>
export type Catalog = z.infer<typeof CatalogSchema>
