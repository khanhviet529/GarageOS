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

/* ============================ Câu hỏi thường gặp ============================ */

/**
 * Nơi một câu hỏi được hiện — SRS-LS-EXP-001 §4.10.
 *
 * 🔒 KHÔNG có giá trị `FAQ`. Câu hỏi thường gặp luôn là một KHỐI NHÚNG trong
 *    trang khác, không có trang riêng. Nút "Xem tất cả" ở khối FAQ từng trỏ vào
 *    hư vô đúng vì giả định ngược lại; 2026-09-04 đổi thành "Xem thêm 6 câu" mở
 *    tại chỗ.
 *
 *    Thêm một giá trị vào đây mà không thêm cả một trang và một mục menu là
 *    dựng lại đúng cái nút dẫn tới URL không tồn tại. Enum này được nhân đôi ở
 *    `faq_surface` (migration 0076) và bài kiểm đối chiếu hai bản.
 */
export const FaqSurface = z.enum(['HOME', 'CONTACT', 'VEHICLE', 'NEWS']);
export type FaqSurface = z.infer<typeof FaqSurface>;

export const FAQ_SURFACE_LABEL: Record<FaqSurface, string> = {
  HOME: 'Trang chủ',
  CONTACT: 'Liên hệ',
  VEHICLE: 'Chi tiết xe',
  NEWS: 'Tin tức',
};

/**
 * ⚠️ Màn vỏ trong sales-admin xin `GET/PUT /marketing/faq-groups` và
 *    `/faq-groups/:id/items` — một mô hình NHÓM chứa câu hỏi. Mô hình ở đây
 *    không có bảng nhóm, và đó là chủ ý:
 *
 *    · "Nhóm" mà giao diện muốn là `topic` — một nhãn chữ trên chính câu hỏi.
 *      Một bảng nhóm chỉ để đựng một cái tên là thêm một bảng, một màn quản lý
 *      nhóm, và một câu hỏi mới ("xoá nhóm thì câu hỏi đi đâu?").
 *    · "Chọn nhóm nào hiện ở trang nào" là `faq_placement`, và nó chính xác
 *      hơn: cùng một chủ đề có thể muốn hiện ở Liên hệ mà không hiện ở Trang
 *      chủ.
 *
 *    SRS-LS-EXP-001 §4.10 chốt `faq_item` + `faq_placement`, viết sau bản vỏ.
 */
export const FaqItemInput = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(4_000),
  /** Nhãn nhóm, tự do. Null = chưa xếp nhóm. */
  topic: z.string().trim().max(80).nullable().optional(),
  displayOrder: z.number().int().min(0).max(10_000).default(0),
  /** Trang nào hiện câu này. Rỗng = chưa hiện ở đâu cả. */
  surfaces: z.array(FaqSurface).max(4).default([]),
});
export type FaqItemInput = z.infer<typeof FaqItemInput>;

export const FaqItemUpdateInput = FaqItemInput.extend({ version: z.number().int().nonnegative() });
export type FaqItemUpdateInput = z.infer<typeof FaqItemUpdateInput>;

export const FaqItemRow = z.object({
  id: z.string().uuid(),
  question: z.string(),
  answer: z.string(),
  topic: z.string().nullable(),
  displayOrder: z.number().int(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']),
  surfaces: z.array(FaqSurface),
  version: z.number().int(),
});
export type FaqItemRow = z.infer<typeof FaqItemRow>;

export const PublicFaqItem = z.object({
  id: z.string().uuid(),
  question: z.string(),
  answer: z.string(),
  topic: z.string().nullable(),
});
export type PublicFaqItem = z.infer<typeof PublicFaqItem>;
