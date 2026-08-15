import { z } from 'zod';

/** Vai trò — khớp enum `user_role` trong DB (infra/migrations/0001_init.sql) */
export const Role = z.enum([
  'SERVICE_ADVISOR',
  'TECHNICIAN',
  'STORE_KEEPER',
  'CASHIER',
  'BRANCH_MANAGER',
  'OWNER',
  // Landing / Sales — SRS Phase 1 (docs/superpowers/specs/2026-08-12-phase-1-landing-sales-srs.md mục 5.1)
  'MARKETING_EDITOR',
  'MARKETING_PUBLISHER',
  'SALES_ADVISOR',
  'SALES_MANAGER',
]);
export type Role = z.infer<typeof Role>;

/** Phạm vi dữ liệu — docs/02-actors-and-permissions.md mục 1 */
export const Scope = z.enum(['TENANT', 'BRANCH', 'SELF']);
export type Scope = z.infer<typeof Scope>;

export const SCOPE_OF_ROLE: Record<Role, Scope> = {
  OWNER: 'TENANT',
  BRANCH_MANAGER: 'BRANCH',
  SERVICE_ADVISOR: 'BRANCH',
  STORE_KEEPER: 'BRANCH',
  CASHIER: 'BRANCH',
  TECHNICIAN: 'SELF',
  // ⚠️ SCOPE_OF_ROLE là "phạm vi mặc định theo vai". Module sales KHÔNG dùng
  // trực tiếp nó — xem scopeForAction() trong @garageos/domain (P1-UT-007):
  // người vừa MARKETING_EDITOR vừa SALES_ADVISOR vẫn chỉ đọc lead được gán.
  MARKETING_EDITOR: 'TENANT',
  MARKETING_PUBLISHER: 'TENANT',
  SALES_ADVISOR: 'SELF',
  SALES_MANAGER: 'BRANCH',
};

/**
 * Nhãn tiếng Việt cho vai — người dùng ở xưởng, không phải lập trình viên.
 *
 * 🔒 Đặt Ở ĐÂY, cạnh enum, và khai kiểu `Record<Role, string>` để trình biên
 * dịch bắt buộc đủ sáu vai.
 *
 * Bản trước nằm trong `apps/web/src/lib/api.ts` dưới dạng
 * `Record<string, string>` — kiểu đó không kiểm được gì, và BA trong sáu khoá
 * đã sai tên: `MANAGER`, `WAREHOUSE_KEEPER`, `ACCOUNTANT` (enum thật là
 * `BRANCH_MANAGER`, `STORE_KEEPER`, `CASHIER`). Hậu quả: quản lý chi nhánh, thủ
 * kho và thu ngân đều nhìn thấy tên hằng số viết hoa trên thanh tiêu đề.
 *
 * Lỗi sống suốt Phase 1 vì mọi ảnh chụp và mọi kịch bản E2E đều đăng nhập bằng
 * cố vấn dịch vụ — vai duy nhất có nhãn đúng. Nó lộ ra ở Phase 2.1 khi màn kho
 * buộc phải đăng nhập bằng thủ kho.
 */
export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Chủ chuỗi',
  BRANCH_MANAGER: 'Quản lý chi nhánh',
  SERVICE_ADVISOR: 'Cố vấn dịch vụ',
  STORE_KEEPER: 'Thủ kho',
  CASHIER: 'Thu ngân',
  TECHNICIAN: 'Kỹ thuật viên',
  MARKETING_EDITOR: 'Biên tập Marketing',
  MARKETING_PUBLISHER: 'Duyệt nội dung Marketing',
  SALES_ADVISOR: 'Tư vấn bán hàng',
  SALES_MANAGER: 'Quản lý bán hàng',
};
