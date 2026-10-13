import { z } from 'zod'
import { AuthorshipSchema, ApprovalSchema, IdentitySchema, MetadataSchema, PackageSchema,
  PublicUrl, RemoteSchema, SnapshotSchema, SourceRefSchema } from './wire.ts'

export const SourceSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/), kind: z.enum(['registry', 'markdown', 'tensorblock']),
  url: PublicUrl.optional(), repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional(),
  repositoryId: z.number().int().positive().optional(), path: z.string().optional(),
  license: z.enum(['MIT', 'CC0-1.0']), cadenceHours: z.number().int().min(24).max(168),
  licenseSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  maxBytes: z.number().int().min(1).max(16 * 1024 * 1024),
})
export const SourcesSchema = z.strictObject({ schemaVersion: z.literal(1), sources: z.array(SourceSchema).min(1).max(20) })
export const ObservationSchema = z.strictObject({
  nativeId: z.string().min(1).max(1000), sourceRef: SourceRefSchema,
  identity: IdentitySchema.nullable(), metadata: MetadataSchema,
  remotes: z.array(RemoteSchema).max(30), packages: z.array(PackageSchema).max(30),
  lifecycle: z.enum(['active', 'deprecated', 'withdrawn']),
  selected: z.boolean(),
  links: z.array(PublicUrl).max(30), unresolvedReason: z.string().max(200).nullable(),
})
export const ObservationsSchema = z.array(ObservationSchema).max(100_000)
export const LockSchema = z.strictObject({ schemaVersion: z.literal(1), snapshots: z.array(SnapshotSchema).max(20) })
export const BindingSchema = z.strictObject({
  sourceId: z.string(), nativeId: z.string(), identity: IdentitySchema,
  evidenceUrl: PublicUrl, reason: z.string().min(20).max(2000),
})
export const IdentityMapSchema = z.strictObject({ schemaVersion: z.literal(1), bindings: z.array(BindingSchema).max(10_000) })
export const CurationEntrySchema = z.strictObject({
  id: z.string(), identity: IdentitySchema,
  legacyLibraryKey: z.string().max(100).nullable().default(null),
  metadata: MetadataSchema.partial(), remotes: z.array(RemoteSchema).max(30).optional(),
  packages: z.array(PackageSchema).max(30).optional(),
  lifecycle: z.enum(['active', 'deprecated', 'withdrawn']).optional(),
  sourceUrl: PublicUrl, sourceRevision: z.string(), reason: z.string().min(20).max(2000),
  nessieApproved: z.boolean().default(false), madeByNessie: z.boolean().default(false),
  reviewPath: z.string().regex(/^reviews\/[a-z0-9-]+\/[a-z0-9-]+\.json$/).nullable().default(null),
  authorship: AuthorshipSchema.nullable().default(null),
})
export const CurationSchema = z.strictObject({ schemaVersion: z.literal(1), entries: z.array(CurationEntrySchema).max(10_000) })
export const ReviewSchema = z.strictObject({ approval: ApprovalSchema, revoked: z.boolean() })
export type Source = z.infer<typeof SourceSchema>
export type Observation = z.infer<typeof ObservationSchema>
export type CurationEntry = z.infer<typeof CurationEntrySchema>
export type Review = z.infer<typeof ReviewSchema>
