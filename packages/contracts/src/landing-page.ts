import { z } from 'zod';

/**
 * Public landing document. This is deliberately a constrained union: no HTML,
 * JSX, arbitrary CSS, remote embeds or executable content crosses this boundary.
 */
export const LandingSectionAppearance = z.object({
  theme: z.enum(['light', 'dark', 'brand']).default('light'),
  alignment: z.enum(['left', 'center']).default('left'),
  spacing: z.enum(['compact', 'normal', 'spacious']).default('normal'),
  width: z.enum(['contained', 'wide', 'full']).default('contained'),
});

const Cta = z.object({
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(500),
});

const BaseSection = z.object({
  id: z.string().uuid(),
  schemaVersion: z.literal(1),
  enabled: z.boolean().default(true),
  appearance: LandingSectionAppearance.default({}),
});

export const HeroSection = BaseSection.extend({
  type: z.literal('hero'),
  content: z.object({
    eyebrow: z.string().trim().max(80).optional(),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().max(500).optional(),
    mediaId: z.string().uuid().nullable().default(null),
    cta: Cta.optional(),
  }),
  appearance: LandingSectionAppearance.extend({ variant: z.enum(['cinematic', 'split', 'minimal']).default('cinematic') }).default({}),
});

export const VehicleShowcaseSection = BaseSection.extend({
  type: z.literal('vehicleShowcase'),
  content: z.object({
    eyebrow: z.string().trim().max(80).optional(),
    title: z.string().trim().min(1).max(160),
    /** Empty is intentional: render the tenant's current published collection. */
    productIds: z.array(z.string().uuid()).max(6).default([]),
    cta: Cta.optional(),
  }),
  appearance: LandingSectionAppearance.extend({ variant: z.enum(['featured', 'collection']).default('featured') }).default({}),
});

export const JourneySection = BaseSection.extend({
  type: z.literal('journey'),
  content: z.object({ title: z.string().trim().min(1).max(160) }),
  appearance: LandingSectionAppearance.default({}),
});

export const ImageTextSection = BaseSection.extend({
  type: z.literal('imageText'),
  content: z.object({
    eyebrow: z.string().trim().max(80).optional(),
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(2_000),
    mediaId: z.string().uuid().nullable().default(null),
    cta: Cta.optional(),
  }),
  appearance: LandingSectionAppearance.extend({ imagePosition: z.enum(['left', 'right', 'background']).default('right') }).default({}),
});

export const TrustSection = BaseSection.extend({
  type: z.literal('trust'),
  content: z.object({ title: z.string().trim().min(1).max(160), body: z.string().trim().max(1_000).optional() }),
  appearance: LandingSectionAppearance.default({}),
});

export const RichTextSection = BaseSection.extend({
  type: z.literal('richText'),
  content: z.object({ title: z.string().trim().max(160).optional(), body: z.string().trim().min(1).max(4_000) }),
  appearance: LandingSectionAppearance.default({}),
});

export const CtaSection = BaseSection.extend({
  type: z.literal('cta'),
  content: z.object({ title: z.string().trim().min(1).max(160), body: z.string().trim().max(800).optional(), cta: Cta }),
  appearance: LandingSectionAppearance.default({}),
});

export const LandingSection = z.discriminatedUnion('type', [
  HeroSection, VehicleShowcaseSection, JourneySection, ImageTextSection,
  TrustSection, RichTextSection, CtaSection,
]);
export type LandingSection = z.infer<typeof LandingSection>;
export type LandingSectionType = LandingSection['type'];

export const LandingPageDocument = z.object({
  schemaVersion: z.literal(1),
  sections: z.array(LandingSection).min(1).max(30).superRefine((sections, ctx) => {
    const ids = new Set<string>();
    sections.forEach((section, index) => {
      if (ids.has(section.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'id'], message: 'Section ID must be unique' });
      ids.add(section.id);
    });
  }),
});
export type LandingPageDocument = z.infer<typeof LandingPageDocument>;

export const LandingPageDraftInput = z.object({ version: z.number().int().nonnegative(), document: LandingPageDocument });
export type LandingPageDraftInput = z.infer<typeof LandingPageDraftInput>;
export const LandingPublishInput = z.object({ version: z.number().int().nonnegative() });

export const LandingPageRevisionView = z.object({
  id: z.string().uuid(), revisionNumber: z.number().int(), status: z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED']),
  document: LandingPageDocument, version: z.number().int(), createdAt: z.string(), publishedAt: z.string().nullable(),
});
export type LandingPageRevisionView = z.infer<typeof LandingPageRevisionView>;
export const LandingPageView = z.object({
  id: z.string().uuid(), slug: z.string(), version: z.number().int(),
  draft: LandingPageRevisionView.nullable(), published: LandingPageRevisionView.nullable(),
});
export type LandingPageView = z.infer<typeof LandingPageView>;
