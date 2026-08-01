# ADR-0007 — Prisma cho truy vấn thường, SQL thô cho phần cần khoá và ràng buộc

**Trạng thái:** ✅ Chấp nhận · **Ngày:** 2026-08-01

## Bối cảnh

Hệ thống phụ thuộc vào ba tính năng của PostgreSQL mà **không ORM nào diễn đạt
được**:

| Tính năng | Dùng ở đâu | Bất biến |
|---|---|---|
| `EXCLUDE USING gist` | Chống trùng khoang/thợ/giờ công | `INV-W-01/02/06` |
| `SELECT … FOR UPDATE` | Khoá dòng tồn kho | `INV-S-01` |
| Row-Level Security | Cô lập tenant | `INV-T-01` |
| Partial unique index | "chỉ một báo giá đang mở" | `INV-Q-03` |

Đồng thời, ~80% truy vấn còn lại là CRUD thường — viết SQL tay cho chúng là lãng
phí và dễ sai.

## Quyết định

**Dùng Prisma cho truy vấn thường; dùng SQL thô cho bốn nhóm trên. Schema do
migration SQL viết tay định nghĩa, Prisma chỉ `db pull` để sinh client.**

```
migrations/*.sql   ← 🔒 nguồn sự thật của schema (viết tay, có constraint đầy đủ)
       │
       ▼  prisma db pull
prisma/schema.prisma  ← chỉ để sinh TypeScript client
```

🔒 **Không dùng `prisma migrate dev` để sinh migration.** Prisma không biết cách
tạo exclusion constraint, RLS policy, partial index có biểu thức, hay trigger —
nó sẽ âm thầm bỏ qua chúng.

Ranh giới rõ ràng:

| Loại thao tác | Công cụ |
|---|---|
| Đọc danh sách, chi tiết, join thường | Prisma |
| Tạo/sửa bản ghi không có tranh chấp | Prisma |
| Giữ chỗ, xuất kho (cần `FOR UPDATE`) | 🔒 SQL thô |
| Phân công (bắt lỗi `23P01`) | 🔒 SQL thô hoặc Prisma + bắt mã lỗi |
| Đặt `app.tenant_id` | 🔒 SQL thô có tham số |
| Truy vấn báo cáo tổng hợp | 🔒 SQL thô |
| Truy vấn đối soát (`INV-S-02`) | 🔒 SQL thô |

## Phương án đã cân nhắc

| Phương án | Ưu | Nhược | Vì sao loại |
|---|---|---|---|
| **Chỉ Prisma, `prisma migrate`** | Đơn giản nhất, một công cụ | 🔒 **Không tạo được exclusion constraint, RLS, trigger** → mất phần lớn bất biến | ❌ Phá vỡ nền tảng của hệ thống |
| **Chỉ SQL thô (pg driver)** | Toàn quyền kiểm soát | Mất an toàn kiểu; ~80% truy vấn thường viết tay tốn công và dễ sai | ❌ Đánh đổi không đáng |
| **TypeORM / Drizzle** | Gần SQL hơn Prisma | Drizzle vẫn không có exclusion constraint; TypeORM migration kém tin cậy | ⚠️ Drizzle đáng cân nhắc lại sau |
| **Prisma + SQL thô, migration viết tay** | An toàn kiểu cho phần lớn; toàn quyền ở phần cần | Hai công cụ; schema định nghĩa ở nơi khác với Prisma | ✅ **Chọn** |

## Hệ quả

### Tích cực

- 🔒 Mọi bất biến ở [05-invariants.md](../05-invariants.md) đều enforce được ở tầng DB
- An toàn kiểu cho ~80% truy vấn
- Migration là SQL thuần → đọc được, review được, không phụ thuộc phiên bản ORM
- Chuyển sang ORM khác về sau không mất schema

### Tiêu cực — phải chấp nhận

- ⚠️ **Hai nguồn định nghĩa schema:** migration SQL là thật, `schema.prisma` là
  bản sao sinh ra. Quên `db pull` sau migration → client lệch với DB.
  Giảm nhẹ: script `pnpm db:migrate` tự chạy `db pull` ngay sau.
- ⚠️ SQL thô **không an toàn kiểu** — đổi tên cột thì Prisma báo lỗi nhưng SQL thô
  thì không. Giảm nhẹ: test tích hợp phủ mọi đường SQL thô.
- ⚠️ Nguy cơ SQL injection ở phần SQL thô. 🔒 Bắt buộc dùng template có tham số
  (`$queryRaw`), **cấm** `$queryRawUnsafe` với dữ liệu từ người dùng.
- ⚠️ Lập trình viên mới phải biết cả hai; ranh giới "khi nào dùng cái nào" phải
  được ghi rõ (bảng ở trên) và enforce qua code review
- ⚠️ Prisma không hiểu exclusion constraint → khi vi phạm, nó ném lỗi chung; phải
  tự bắt mã `23P01` và ánh xạ sang lỗi nghiệp vụ

## Xem lại khi nào

- Drizzle (hoặc ORM khác) hỗ trợ được exclusion constraint và RLS
- Tỉ lệ SQL thô vượt ~40% tổng số truy vấn → Prisma không còn đáng giữ
- Có sự cố do lệch giữa migration và `schema.prisma`
