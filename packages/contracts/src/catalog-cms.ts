import { z } from 'zod';
import { Role } from './roles.js';

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

/* ================================= Bài viết ================================= */

export const ArticleCategoryInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(140),
  displayOrder: z.number().int().min(0).max(10_000).default(0),
});
export type ArticleCategoryInput = z.infer<typeof ArticleCategoryInput>;
export const ArticleCategoryUpdateInput = ArticleCategoryInput.extend({
  version: z.number().int().nonnegative(),
});
export type ArticleCategoryUpdateInput = z.infer<typeof ArticleCategoryUpdateInput>;

/**
 * Tạo bài mới — chỉ những gì cần để có một bản NHÁP đầu tiên.
 *
 * 🔒 Không nhận `featured` ở đây. Bài nổi bật là CHỖ tràn viền ở đầu trang Tin
 *    tức — một chỗ duy nhất mỗi tenant, enforce bằng partial unique index
 *    (0077). Cho phép đặt lúc tạo nghĩa là lần tạo thứ hai sẽ lỗi ở tầng DB với
 *    một thông điệp không ai đọc được. Đặt nổi bật là một thao tác riêng, có
 *    endpoint riêng, và nó gỡ bài cũ trước.
 */
export const ArticleCreateInput = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  title: z.string().trim().min(1).max(200),
  categoryId: z.string().uuid().nullable().optional(),
});
export type ArticleCreateInput = z.infer<typeof ArticleCreateInput>;

/** Sửa bản NHÁP. Bản đã publish là bất biến (INV-LS-07) — sửa là tạo nháp mới. */
export const ArticleDraftInput = z.object({
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().max(500).nullable().optional(),
  bodyDocument: RichTextDocumentV1,
  seoTitle: z.string().trim().max(160).nullable().optional(),
  seoDescription: z.string().trim().max(300).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  coverMediaId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});
export type ArticleDraftInput = z.infer<typeof ArticleDraftInput>;

export const ArticleRow = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  coverUrl: z.string().nullable(),
  featured: z.boolean(),
  /** Có bản nháp đang chờ = có thay đổi chưa công bố. */
  hasDraft: z.boolean(),
  published: z.boolean(),
  publishedAt: z.string().nullable(),
  tags: z.array(z.string()),
  version: z.number().int(),
});
export type ArticleRow = z.infer<typeof ArticleRow>;

export const ArticleDraftView = ArticleDraftInput.extend({
  articleId: z.string().uuid(),
  slug: z.string(),
  revisionId: z.string().uuid(),
  revisionNumber: z.number().int(),
  version: z.number().int(),
});
export type ArticleDraftView = z.infer<typeof ArticleDraftView>;

export const PublicArticleSummary = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullable(),
  categoryName: z.string().nullable(),
  coverUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  featured: z.boolean(),
});
export type PublicArticleSummary = z.infer<typeof PublicArticleSummary>;

export const PublicArticleDetail = PublicArticleSummary.extend({
  bodyDocument: RichTextDocumentV1,
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  tags: z.array(z.string()),
});
export type PublicArticleDetail = z.infer<typeof PublicArticleDetail>;

/* ========================= Điều hướng và chuyển hướng ======================= */

export const NavPlacement = z.enum(['HEADER', 'FOOTER']);
export type NavPlacement = z.infer<typeof NavPlacement>;

export const NAV_PLACEMENT_LABEL: Record<NavPlacement, string> = {
  HEADER: 'Đầu trang',
  FOOTER: 'Chân trang',
};

/**
 * Một mục menu.
 *
 * 🔒 Đúng MỘT đích: `path` (nội bộ) hoặc `externalUrl`, không cả hai và không
 *    thiếu cả hai. Ràng buộc `nav_dung_mot_dich` (0078) canh điều đó ở database;
 *    ở đây `refine` để người dùng nhận một câu tiếng Việt thay vì lỗi Postgres.
 */
export const NavItemInput = z
  .object({
    placement: NavPlacement,
    columnIndex: z.number().int().min(0).max(2).default(0),
    label: z.string().trim().min(1).max(60),
    path: z.string().trim().regex(/^\/[^\s]*$/, 'Đường dẫn phải bắt đầu bằng /').max(300).nullable().optional(),
    externalUrl: z.string().trim().url().max(500).nullable().optional(),
    displayOrder: z.number().int().min(0).max(10_000).default(0),
    visible: z.boolean().default(true),
  })
  .refine(
    (v) => (v.path == null) !== (v.externalUrl == null),
    { message: 'Mỗi mục cần đúng một đích: đường dẫn nội bộ HOẶC liên kết ngoài.' },
  );
export type NavItemInput = z.infer<typeof NavItemInput>;

export const NavItemRow = z.object({
  id: z.string().uuid(),
  placement: NavPlacement,
  columnIndex: z.number().int(),
  label: z.string(),
  path: z.string().nullable(),
  externalUrl: z.string().nullable(),
  displayOrder: z.number().int(),
  visible: z.boolean(),
  version: z.number().int(),
});
export type NavItemRow = z.infer<typeof NavItemRow>;

/** Menu công khai — chỉ những gì landing cần để vẽ, không có id và version. */
export const PublicNavItem = z.object({
  label: z.string(),
  href: z.string(),
  columnIndex: z.number().int(),
  external: z.boolean(),
});
export type PublicNavItem = z.infer<typeof PublicNavItem>;

export const RedirectInput = z.object({
  fromPath: z.string().trim().regex(/^\/[^\s]*$/, 'Đường dẫn nguồn phải bắt đầu bằng /').max(300),
  toPath: z.string().trim().min(1).max(500),
  statusCode: z.union([z.literal(301), z.literal(302)]).default(301),
  note: z.string().trim().max(200).nullable().optional(),
});
export type RedirectInput = z.infer<typeof RedirectInput>;

export const RedirectRow = RedirectInput.extend({
  id: z.string().uuid(),
  version: z.number().int(),
});
export type RedirectRow = z.infer<typeof RedirectRow>;

/* ================================ Biểu mẫu ================================== */

export const LeadFormInput = z.object({
  successTitle: z.string().trim().min(1).max(120),
  successBody: z.string().trim().max(400),
  showMessageField: z.boolean().default(true),
  showBranchField: z.boolean().default(true),
});
export type LeadFormInput = z.infer<typeof LeadFormInput>;

export const LeadFormView = LeadFormInput.extend({
  id: z.string().uuid(),
  code: z.string(),
  version: z.number().int(),
  /** Phiên bản câu đồng ý đang hiệu lực. Null = chưa khai phiên bản nào. */
  consentVersion: z.string().nullable(),
  consentBody: z.string().nullable(),
});
export type LeadFormView = z.infer<typeof LeadFormView>;

/**
 * Thêm một phiên bản câu đồng ý.
 *
 * 🔒 Chỉ THÊM, không sửa và không xoá — `lead_form_consent_version` là bảng
 *    chỉ-thêm (0079). Một dòng ở đó là bằng chứng "ngày đó khách đồng ý với câu
 *    này"; sửa được nó thì nó không còn là bằng chứng.
 */
export const ConsentVersionInput = z.object({
  version: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(1_000),
});
export type ConsentVersionInput = z.infer<typeof ConsentVersionInput>;

export const ConsentVersionRow = ConsentVersionInput.extend({
  id: z.string().uuid(),
  effectiveFrom: z.string(),
});
export type ConsentVersionRow = z.infer<typeof ConsentVersionRow>;

/** Cấu hình biểu mẫu mà landing cần để vẽ — không có id, không có version. */
export const PublicLeadForm = z.object({
  successTitle: z.string(),
  successBody: z.string(),
  showMessageField: z.boolean(),
  showBranchField: z.boolean(),
  consentBody: z.string(),
});
export type PublicLeadForm = z.infer<typeof PublicLeadForm>;

/* ============================ Người dùng và vai ============================= */

export const AdminUserRow = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  roles: z.array(Role),
  isActive: z.boolean(),
  branchNames: z.array(z.string()),
  version: z.number().int(),
});
export type AdminUserRow = z.infer<typeof AdminUserRow>;

/**
 * Gán vai.
 *
 * 🔒 Màn này chỉ ĐỌC và GÁN vai — nó không định nghĩa lại quyền. Ma trận quyền
 *    là dữ liệu của hệ thống, nằm ở `ACTION_ROLES` và được service kiểm bằng
 *    `assertCan`. Cho phép giao diện sửa ma trận nghĩa là để một lần bấm nhầm mở
 *    được đường vào mà không có test nào canh.
 */
export const UserRolesInput = z.object({
  roles: z.array(Role).min(1).max(6),
  version: z.number().int().nonnegative(),
});
export type UserRolesInput = z.infer<typeof UserRolesInput>;

/* ============================== Bảng màu landing ============================= */

/**
 * 🔒 Tên trường ở đây là tên TIẾNG VIỆT của bốn token, trùng khít
 *    `BangMauLanding` trong `packages/domain/src/tuong-phan.ts`.
 *
 *    Khác với phần còn lại của contracts (dùng tiếng Anh), bốn khoá này đi
 *    nguyên vẹn từ ô nhập của biên tập viên → HTTP → cổng kiểm AA → cột trong
 *    DB. Dịch chúng sang tiếng Anh ở giữa chặng sẽ tạo một bảng ánh xạ bốn dòng
 *    mà không tầng nào cần — và một chỗ nữa để đổi nhầm `nenChinh` thành
 *    `nenNoi` mà kiểu vẫn hợp lệ.
 */
const HexMau = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Mã màu phải có dạng #rrggbb');

export const SiteThemeInput = z.object({
  nenChinh: HexMau,
  nenNoi: HexMau,
  thuongHieu: HexMau,
  nutChinh: HexMau,
  /*
   * Zod chỉ canh KIỂU và khoảng. Bậc hợp lệ (0/4/8/16) và toàn bộ luật tương
   * phản do `loiBangMau()` ở domain quyết, và cuối cùng là `CHECK` ở 0083 —
   * xem chú thích của migration về việc vì sao ngưỡng AA không nằm ở DB.
   */
  boGoc: z.number().int().min(0).max(16),
  /** Optimistic lock. `0` cho lần lưu đầu tiên, khi tenant chưa có dòng nào. */
  version: z.number().int().nonnegative(),
});
export type SiteThemeInput = z.infer<typeof SiteThemeInput>;

export const SiteThemeView = SiteThemeInput.extend({
  /** `false` = tenant chưa từng lưu; giá trị trả về là mặc định của hệ thống. */
  daLuu: z.boolean(),
});
export type SiteThemeView = z.infer<typeof SiteThemeView>;

/** Phần landing cần để vẽ — không có `version`, không có dấu vết ai sửa. */
export const PublicSiteTheme = SiteThemeInput.omit({ version: true });
export type PublicSiteTheme = z.infer<typeof PublicSiteTheme>;
