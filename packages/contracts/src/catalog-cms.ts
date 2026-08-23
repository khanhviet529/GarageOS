import { z } from 'zod';

const url = z.string().url().max(500);
const mark = z.discriminatedUnion('type', [z.object({ type: z.literal('bold') }), z.object({ type: z.literal('italic') }), z.object({ type: z.literal('link'), attrs: z.object({ href: url }) })]);
const text = z.object({ type: z.literal('text'), text: z.string().max(10_000), marks: z.array(mark).max(8).optional() });
const inline = z.union([text, z.object({ type: z.literal('hardBreak') })]);
const block = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), content: z.array(inline).max(200).optional() }),
  z.object({ type: z.literal('heading'), attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }), content: z.array(inline).min(1).max(200) }),
  z.object({ type: z.literal('blockquote'), content: z.array(z.object({ type: z.literal('paragraph'), content: z.array(inline).max(200).optional() })).min(1).max(20) }),
  z.object({ type: z.literal('bulletList'), content: z.array(z.object({ type: z.literal('listItem'), content: z.array(z.object({ type: z.literal('paragraph'), content: z.array(inline).max(200).optional() })).min(1).max(10) })).min(1).max(50) }),
  z.object({ type: z.literal('orderedList'), content: z.array(z.object({ type: z.literal('listItem'), content: z.array(z.object({ type: z.literal('paragraph'), content: z.array(inline).max(200).optional() })).min(1).max(10) })).min(1).max(50) }),
]);

/** Safe Tiptap-compatible subset. It excludes HTML, images, scripts and arbitrary attrs. */
export const RichTextDocumentV1 = z.object({ type: z.literal('doc'), schemaVersion: z.literal(1), content: z.array(block).max(200) });
export type RichTextDocumentV1 = z.infer<typeof RichTextDocumentV1>;

/** Stable recursive serialization: object key order can never alter a revision hash. */
export function canonicalizeRichTextDocument(input: RichTextDocumentV1): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, child]) => [key, normalize(child)]));
    }
    return value;
  };
  return JSON.stringify(normalize(RichTextDocumentV1.parse(input)));
}

export function richTextFromPlainText(textValue: string): RichTextDocumentV1 {
  const text = textValue.trim();
  return { type: 'doc', schemaVersion: 1, content: text === '' ? [] : [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

export function richTextToPlainText(input: RichTextDocumentV1): string {
  const doc = RichTextDocumentV1.parse(input);
  const words: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node !== null && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (record.type === 'text' && typeof record.text === 'string') words.push(record.text);
      if ('content' in record) visit(record.content);
    }
  };
  visit(doc.content);
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

export const CategoryInput = z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(140), description: z.string().trim().max(500).nullable().optional(), imageMediaId: z.string().uuid().nullable().optional(), status: z.enum(['ACTIVE', 'HIDDEN']).default('ACTIVE'), sortOrder: z.number().int().min(0).max(10_000).default(0), seoTitle: z.string().trim().max(160).nullable().optional(), seoDescription: z.string().trim().max(300).nullable().optional() });
export type CategoryInput = z.infer<typeof CategoryInput>;
export const CategoryUpdateInput = CategoryInput.extend({ version: z.number().int().nonnegative() });
export type CategoryUpdateInput = z.infer<typeof CategoryUpdateInput>;

export const TestimonialInput = z.object({ displayName: z.string().trim().min(1).max(120), content: z.string().trim().min(1).max(2_000), rating: z.number().int().min(1).max(5).nullable().optional(), vehicleId: z.string().uuid().nullable().optional(), featured: z.boolean().default(false), sortOrder: z.number().int().min(0).max(10_000).default(0) });
export type TestimonialInput = z.infer<typeof TestimonialInput>;
export const TestimonialUpdateInput = TestimonialInput.extend({ version: z.number().int().nonnegative() });
export type TestimonialUpdateInput = z.infer<typeof TestimonialUpdateInput>;

export const PublicTestimonial = z.object({ id: z.string().uuid(), displayName: z.string(), content: z.string(), rating: z.number().int().min(1).max(5).nullable(), featured: z.boolean(), vehicleId: z.string().uuid().nullable() });
export type PublicTestimonial = z.infer<typeof PublicTestimonial>;
