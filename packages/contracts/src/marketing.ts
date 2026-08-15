import { z } from 'zod';
import { Powertrain } from './vehicle.js';

/**
 * Contracts cho module marketing (landing/catalog/experience/SEO).
 *
 * Nguồn yêu cầu: docs/superpowers/specs/2026-08-12-phase-1-landing-sales-srs.md
 * và 2026-08-12-landing-seo-srs.md.
 *
 * 🔒 Tiền là số nguyên đồng (INV-M-01): `display_price_amount` là bigint DB,
 * trên đường truyền là number nguyên (xem money.ts — `.int()` + chặn trên).
 * Giá marketing KHÔNG dùng làm hoá đơn GarageOS.
 */

/* =============================== Enums =============================== */

export const SiteDomainStatus = z.enum(['PENDING', 'VERIFIED', 'ACTIVE', 'DISABLED']);
export type SiteDomainStatus = z.infer<typeof SiteDomainStatus>;

export const SiteProfileStatus = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export type SiteProfileStatus = z.infer<typeof SiteProfileStatus>;

export const ProductLifecycleStatus = z.enum(['ACTIVE', 'ARCHIVED']);
export type ProductLifecycleStatus = z.infer<typeof ProductLifecycleStatus>;

export const RevisionStatus = z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED']);
export type RevisionStatus = z.infer<typeof RevisionStatus>;

export const VariantInclusionStatus = z.enum(['ACTIVE', 'ARCHIVED']);
export type VariantInclusionStatus = z.infer<typeof VariantInclusionStatus>;

export const ExperienceKind = z.enum(['EXTERIOR_SPIN', 'INTERIOR_PANORAMA']);
export type ExperienceKind = z.infer<typeof ExperienceKind>;

export const ExperienceLifecycleStatus = z.enum(['ACTIVE', 'ARCHIVED']);
export type ExperienceLifecycleStatus = z.infer<typeof ExperienceLifecycleStatus>;

export const MediaKind = z.enum(['IMAGE', 'PANORAMA', 'AUDIO']);
export type MediaKind = z.infer<typeof MediaKind>;

export const MediaAssetStatus = z.enum([
  'IMPORTING',
  'VALIDATING',
  'READY',
  'QUARANTINED',
  'ARCHIVED',
]);
export type MediaAssetStatus = z.infer<typeof MediaAssetStatus>;

export const MediaRenditionVisibility = z.enum(['PRIVATE_STAGED', 'PUBLIC']);
export type MediaRenditionVisibility = z.infer<typeof MediaRenditionVisibility>;

export const MediaPublicationStatus = z.enum(['PENDING', 'READY', 'FAILED']);
export type MediaPublicationStatus = z.infer<typeof MediaPublicationStatus>;

export const ProductMediaRole = z.enum(['POSTER', 'GALLERY', 'SOCIAL', 'HOTSPOT_DETAIL']);
export type ProductMediaRole = z.infer<typeof ProductMediaRole>;

/* =============================== SEO =============================== */

/** Metadata override của một revision catalog — SEO-META-002/003. */
export const SeoMetadata = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(300),
});
export type SeoMetadata = z.infer<typeof SeoMetadata>;

/**
 * Kết quả validate SEO cho một draft (POST /marketing/seo/validate).
 * severity: BLOCKING chặn publish, WARNING/INFO chỉ báo.
 */
export const SeoCheck = z.object({
  requirementId: z.string(),
  severity: z.enum(['BLOCKING', 'WARNING', 'INFO']),
  code: z.string(),
  message: z.string(),
  fieldPath: z.string().optional(),
});
export type SeoCheck = z.infer<typeof SeoCheck>;

export const SeoValidationResult = z.object({
  targetVersion: z.number().int(),
  checks: z.array(SeoCheck),
});
export type SeoValidationResult = z.infer<typeof SeoValidationResult>;

/* =========================== Public views =========================== */

export const PublicBranchCard = z.object({
  id: z.string().uuid(),
  stableKey: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
});
export type PublicBranchCard = z.infer<typeof PublicBranchCard>;

export const PublicSiteView = z.object({
  brandName: z.string(),
  legalName: z.string().nullable(),
  defaultTitleSuffix: z.string(),
  primaryOrigin: z.string(),
  publicBranches: z.array(PublicBranchCard),
});
export type PublicSiteView = z.infer<typeof PublicSiteView>;

export const PublicProductMedia = z.object({
  id: z.string().uuid(),
  role: ProductMediaRole,
  url: z.string(),
  alt: z.string(),
  sortOrder: z.number().int(),
  isCover: z.boolean(),
});
export type PublicProductMedia = z.infer<typeof PublicProductMedia>;

export const PublicVariant = z.object({
  id: z.string().uuid(),
  stableKey: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  powertrain: Powertrain,
  modelYear: z.number().int(),
  displayPrice: z.number().int().nullable(),
  specifications: z.record(z.string(), z.unknown()),
  isFeatured: z.boolean(),
  sortOrder: z.number().int(),
});
export type PublicVariant = z.infer<typeof PublicVariant>;

export const ExperienceSummary = z.object({
  stableKey: z.string(),
  kind: ExperienceKind,
  label: z.string(),
  posterUrl: z.string().nullable(),
  revision: z.number().int(),
  contentHash: z.string(),
  estimatedBytes: z.number().int(),
});
export type ExperienceSummary = z.infer<typeof ExperienceSummary>;

/**
 * Manifest trải nghiệm deferred — P1-LND-017/P1-API-005.
 * `config` là Zod schema versioned lưu trong `vehicle_experience_version`; Phase 1
 * chỉ có EXTERIOR_SPIN (yawDegrees/quality tier) và INTERIOR_PANORAMA (viewpointKey).
 */
export const ExperienceManifest = z.object({
  schemaVersion: z.number().int(),
  stableKey: z.string(),
  kind: ExperienceKind,
  label: z.string(),
  revision: z.number().int(),
  contentHash: z.string(),
  posterUrl: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
});
export type ExperienceManifest = z.infer<typeof ExperienceManifest>;

export const PublicProductSummary = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  makeName: z.string(),
  modelName: z.string(),
  summary: z.string(),
  powertrain: Powertrain,
  displayPrice: z.number().int().nullable(),
  coverUrl: z.string().nullable(),
  coverAlt: z.string().nullable(),
});
export type PublicProductSummary = z.infer<typeof PublicProductSummary>;

export const PublicProductDetail = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  makeName: z.string(),
  modelName: z.string(),
  summary: z.string(),
  description: z.string(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  revision: z.number().int(),
  contentHash: z.string(),
  variants: z.array(PublicVariant),
  media: z.array(PublicProductMedia),
  experiences: z.array(ExperienceSummary),
});
export type PublicProductDetail = z.infer<typeof PublicProductDetail>;

/* ===================== Marketing admin inputs ===================== */

export const CreateVehicleProductInput = z.object({
  name: z.string().trim().min(2).max(160),
  makeName: z.string().trim().min(1).max(100),
  modelName: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug phải là kebab-case chữ thường'),
  summary: z.string().trim().max(500).optional().default(''),
  description: z.string().trim().max(20000).optional().default(''),
  seoTitle: z.string().trim().max(160).nullable().optional(),
  seoDescription: z.string().trim().max(300).nullable().optional(),
});
export type CreateVehicleProductInput = z.infer<typeof CreateVehicleProductInput>;

export const PatchProductDraftInput = z.object({
  version: z.number().int().nonnegative(),
  name: z.string().trim().min(2).max(160).optional(),
  summary: z.string().trim().max(500).optional(),
  description: z.string().trim().max(20000).optional(),
  seoTitle: z.string().trim().max(160).nullable().optional(),
  seoDescription: z.string().trim().max(300).nullable().optional(),
});
export type PatchProductDraftInput = z.infer<typeof PatchProductDraftInput>;

export const CreateVariantInput = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(100).nullable().optional(),
  powertrain: Powertrain,
  modelYear: z.number().int().min(1900).max(2100),
  displayPrice: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  specifications: z.record(z.string(), z.unknown()).optional().default({}),
  isFeatured: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
});
export type CreateVariantInput = z.infer<typeof CreateVariantInput>;

export const SiteProfileDraftInput = z.object({
  version: z.number().int().nonnegative(),
  brandName: z.string().trim().min(1).max(160).optional(),
  legalName: z.string().trim().max(160).nullable().optional(),
  defaultTitleSuffix: z.string().trim().max(160).optional(),
  defaultDescription: z.string().trim().min(50).max(300).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
});
export type SiteProfileDraftInput = z.infer<typeof SiteProfileDraftInput>;
