# Chiến lược kiểm thử

> Đọc sau: [13-nfr.md](13-nfr.md) · Đọc tiếp: [15-roadmap.md](15-roadmap.md)

## 1. Nguyên tắc

🔒 **Mỗi bất biến trong [05-invariants.md](05-invariants.md) phải có ít nhất một
test tự động.** Không có ngoại lệ.

Đây không phải "cố gắng đạt 80% coverage" — coverage theo dòng là chỉ số kém.
Thay vào đó: **coverage theo bất biến phải là 100%**.

| Loại test | Tỉ trọng | Chạy ở đâu | Thời gian |
|---|---|---|---|
| Đơn vị (domain thuần) | ~50% | Không cần DB | < 1s toàn bộ |
| Tích hợp (service + DB thật) | ~35% | Postgres trong Docker | < 60s |
| Đồng thời (concurrency) | ~5% | Postgres thật | < 30s |
| API (end-to-end HTTP) | ~8% | App đầy đủ | < 60s |
| Giao diện (E2E) | ~2% | Playwright | < 5 phút |

💡 Tỉ trọng này nghiêng về **tích hợp** nhiều hơn kim tự tháp test kinh điển. Lý
do: phần lớn bất biến của hệ thống được enforce ở tầng database — test không chạm
DB thật thì không kiểm chứng được chúng.

🔒 **Không dùng SQLite hay in-memory DB để thay Postgres.** Exclusion constraint,
RLS và partial index không tồn tại ở đó — test sẽ xanh trong khi production sai.

## 2. Bản đồ bất biến → test

### Cô lập tenant

| Bất biến | Loại test | Kịch bản |
|---|---|---|
| `INV-T-01` | Tích hợp | Tạo dữ liệu 2 tenant; đăng nhập A; gọi mọi endpoint với ID của B → **404** (không phải 403) |
| `INV-T-02` | Đơn vị + lint | Rule cấm đọc `req.body.tenantId`; test service bỏ qua `tenantId` trong input |
| `INV-T-03` | Tích hợp | Cố tạo `RepairOrder` của tenant A trỏ `Vehicle` của tenant B → lỗi FK |

### Kho

| Bất biến | Loại test | Kịch bản |
|---|---|---|
| `INV-S-01` | **Đồng thời** | 50 request giữ chỗ song song, tồn = 1 → đúng 1 thành công |
| `INV-S-01` | **Đồng thời** | 50 request xuất kho song song, tồn = 1 → `on_hand` cuối = 0 |
| `INV-S-02` | Tích hợp | 🔒 Chạy truy vấn đối soát **sau mỗi kịch bản kho** → 0 dòng lệch |
| `INV-S-03` | Tích hợp | `UPDATE`/`DELETE` trên `stock_movement` → bị từ chối bởi quyền DB |
| `INV-S-04` | Tích hợp | Xuất kho cho dòng `PENDING` → lỗi, không có movement nào |
| `INV-S-06` | Tích hợp | Dịch thời gian, chạy job → `available` tăng lại |

### Báo giá

| Bất biến | Loại test | Kịch bản |
|---|---|---|
| `INV-Q-02` | Tích hợp | Từ chối dòng `LABOR` → mọi dòng `PART` con thành `REJECTED` |
| `INV-Q-03` | Tích hợp | Gửi báo giá thứ hai khi còn cái `SENT` → bị chặn bởi unique index |
| `INV-Q-05` | Tích hợp | Gửi báo giá → đổi `PriceList` → đọc lại → **tổng không đổi** |
| `INV-Q-06` | Tích hợp | Sửa dòng → tổng tự tính lại đúng |
| `INV-Q-07` | Tích hợp | Duyệt sau `validUntil` → `QUOTATION_EXPIRED` |
| — | **Đồng thời** | 10 request duyệt song song → đúng 1 thành công, giữ chỗ chỉ tạo một lần |

### Thi công

| Bất biến | Loại test | Kịch bản |
|---|---|---|
| `INV-W-01` | **Đồng thời** | 20 request cùng khoang, khung giờ chồng → đúng 1 thành công |
| `INV-W-02` | **Đồng thời** | 20 request cùng thợ, khung giờ chồng → đúng 1 thành công |
| `INV-W-01` | Tích hợp | Hai phân công **kề nhau** (10:00–11:00, 11:00–12:00) → **cả hai thành công** |
| `INV-W-01` | Tích hợp | Phân công vào khung của assignment `DONE` → thành công (mệnh đề `WHERE`) |
| `INV-W-03` | Tích hợp | Thợ thiếu chứng chỉ → chặn; có chứng chỉ nhưng hết hạn trước `plannedStart` → **cũng chặn** |
| `INV-W-04` | Tích hợp | Thợ tự QC việc mình → bị chặn bởi `CHECK` |
| `INV-W-05` | Tích hợp | Bắt đầu hạng mục thứ hai → bị chặn |
| `INV-W-06` | Tích hợp | Tạo `TimeLog` chồng → bị chặn bởi exclusion constraint |

### Tiền

| Bất biến | Loại test | Kịch bản |
|---|---|---|
| `INV-M-01` | **Kiến trúc** | Quét `information_schema` → 0 cột tiền dùng kiểu số thực |
| `INV-M-02` | Tích hợp | Hoá đơn 20 dòng có làm tròn → tổng khớp chính xác 0đ sai lệch |
| `INV-M-03` | Tích hợp | `UPDATE` hoá đơn `ISSUED` → `INVOICE_IMMUTABLE` |
| `INV-M-04` | Tích hợp | Thu vượt tổng → bị chặn |
| `INV-M-05` | Tích hợp | Phân bổ ≠ số tiền thanh toán → bị chặn |
| `INV-M-06` | Tích hợp | `is_warranty=true` + `line_total>0` → `CHECK` chặn |

### Phương tiện, bảo hành

| Bất biến | Loại test | Kịch bản |
|---|---|---|
| `INV-V-01` | Tích hợp | Thêm hạng mục `ICE`-only vào xe `BEV` → `POWERTRAIN_MISMATCH` |
| `INV-V-02` | Tích hợp | Tạo `30A-123.45` rồi `30A12345` → bị chặn (chuẩn hoá) |
| `INV-V-03` | Tích hợp | Tạo đơn thứ hai cho xe đang mở → chặn; sau khi `DELIVERED` → cho phép |
| `INV-B-02` | **Đơn vị** | Bảng tham số: (còn tháng, hết km) → hết hạn; (hết tháng, còn km) → hết hạn |
| `INV-B-03` | Tích hợp | Dùng lại coverage đã claim → bị chặn |
| `INV-B-04` | Tích hợp | Đơn bảo hành có dòng giá > 0 → bị chặn |

## 3. Test đồng thời — cách viết

Đây là loại test khó viết đúng nhất và cũng có giá trị chứng minh cao nhất.

```ts
// apps/api/test/concurrency/stock-reservation.spec.ts
describe('INV-S-01 — tồn kho không âm dưới tải đồng thời', () => {
  it('50 request giữ chỗ đồng thời, tồn = 1 → đúng 1 thành công', async () => {
    const part = await seedPart({ onHand: 1 });

    // 🔒 Bắn thật sự song song, không phải tuần tự
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        inventoryService.reserve(actor, {
          partId: part.id, warehouseId, quantity: 1,
          repairOrderId: uniqueOrderId(), quotationLineId: uniqueLineId(),
        }),
      ),
    );

    const ok     = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(49);
    expect(failed.every(f => f.reason.code === 'INSUFFICIENT_STOCK')).toBe(true);

    const balance = await getBalance(part.id, warehouseId);
    expect(balance.reserved).toBe(1);
    expect(balance.onHand).toBe(1);       // giữ chỗ không đổi tồn thực

    await assertLedgerMatchesBalance();   // 🔒 INV-S-02 sau mỗi kịch bản
  });
});
```

⚠️ **Bẫy thường gặp:** dùng `Promise.all` với các lời gọi *cùng một connection*
trong pool sẽ chạy tuần tự và test luôn xanh dù code sai. Phải bảo đảm mỗi lời gọi
lấy connection riêng.

## 4. Hàm khẳng định dùng lại

```ts
// test/helpers/invariants.ts

/** 🔒 INV-S-02 — gọi sau MỌI kịch bản chạm kho */
export async function assertLedgerMatchesBalance(tx = db) {
  const rows = await tx.$queryRaw`
    SELECT b.warehouse_id, b.part_id, b.on_hand, COALESCE(SUM(m.quantity),0) AS ledger
      FROM stock_balance b
      LEFT JOIN stock_movement m USING (tenant_id, warehouse_id, part_id)
     GROUP BY b.tenant_id, b.warehouse_id, b.part_id, b.on_hand
    HAVING b.on_hand <> COALESCE(SUM(m.quantity),0)`;
  expect(rows).toHaveLength(0);
}

/** 🔒 INV-M-02 */
export async function assertInvoiceTotalsMatch(tx = db) { … }

/** 🔒 INV-M-01 — test kiến trúc */
export async function assertNoFloatMoneyColumns(tx = db) { … }
```

💡 `assertLedgerMatchesBalance()` là **hàm khẳng định giá trị nhất trong toàn bộ
test suite**: nó bắt được cả những lỗi chưa nghĩ tới, kể cả trong code viết sau này.

## 5. Test theo case nghiệp vụ

Mỗi file trong [07-business-cases/](07-business-cases/) có mục "Test cần có" —
đó là đặc tả test. Ánh xạ:

```
docs/07-business-cases/BC-04-giu-cho-xuat-kho.md  mục 7
   ↓
apps/api/test/business-cases/bc-04-reservation.spec.ts
```

```ts
describe('BC-04 — Giữ chỗ và xuất kho', () => {
  it('BC-04.1 — 50 giữ chỗ đồng thời, tồn 1', …);
  it('BC-04.3 — giữ chỗ 3 món, món 3 thiếu → rollback toàn bộ', …);
  it('BC-04.4 — khoá theo thứ tự part_id → không deadlock', …);
  it('BC-04.9 — kiểm kê xuống dưới reserved → bị chặn có thông báo', …);
  it('BC-04.10 — đối soát sổ sau mọi kịch bản', …);
});
```

🔒 Đánh số test khớp với số trong tài liệu — đọc tài liệu biết ngay test nào phủ.

## 6. Dữ liệu test

### Nguyên tắc

| # | Nguyên tắc |
|---|---|
| 1 | Mỗi test tự tạo dữ liệu, không phụ thuộc test khác |
| 2 | Dùng builder có giá trị mặc định hợp lý, chỉ khai báo phần khác biệt |
| 3 | Mỗi test chạy trong transaction và rollback — trừ test đồng thời |
| 4 | ⚠️ Test đồng thời **không** rollback được (cần commit thật) → dùng schema riêng, dọn sau |

```ts
const order = await aRepairOrder()
  .forVehicle(aVehicle().withPowertrain('BEV'))
  .withStatus('IN_PROGRESS')
  .build();
```

### Seed cho môi trường local

🔒 Seed phải đủ để **mọi màn hình có nội dung và mọi báo cáo có số liệu**:

- 2 tenant (kiểm chứng cô lập bằng mắt)
- 3 chi nhánh, 12 người dùng đủ 7 vai
- ~50 xe: 30 `ICE`, 12 `HYBRID`, 8 `BEV`
- ~200 đơn ở **mọi trạng thái**, trải đều 6 tháng
- Có sẵn: 1 đơn bảo hành, 1 đơn có bảo hiểm, 1 đơn bị huỷ giữa chừng, 1 xe bỏ quên
- Kho có món sắp hết, món tồn lâu

## 7. Kiểm thử giao diện (E2E)

Ít nhưng đúng chỗ — chỉ các luồng mà lỗi gây thiệt hại lớn nhất:

| # | Luồng | Vì sao |
|---|---|---|
| 1 | Tiếp nhận → báo giá → duyệt → sửa → thanh toán → bàn giao | Luồng chính, phải luôn chạy |
| 2 | Khách duyệt từng phần qua link + OTP | Điểm chạm khách hàng |
| 3 | Thợ bấm giờ trên mobile | Đường ghi dữ liệu quan trọng |
| 4 | Thợ **không thấy** bất kỳ số tiền nào | 🔒 Kiểm chứng `PR-05` ở tầng UI |

## 8. Kiểm thử hiệu năng

| Loại | Công cụ | Khi nào |
|---|---|---|
| Đếm truy vấn (chống N+1) | Middleware Prisma đếm query | Mỗi PR |
| Tải | k6 | Trước mỗi release |
| Truy vấn chậm | `pg_stat_statements` | Hằng tuần |

```ts
it('danh sách đơn không bị N+1', async () => {
  const { queryCount } = await withQueryCounter(() =>
    repairOrderService.list(actor, { limit: 20 }),
  );
  expect(queryCount).toBeLessThanOrEqual(3);   // 1 đếm + 1 danh sách + 1 join phụ
});
```

## 9. Quy trình CI

```yaml
# .github/workflows/ci.yml (rút gọn)
jobs:
  test:
    services:
      postgres: { image: postgres:16 }        # 🔒 Postgres thật, không SQLite
      redis:    { image: redis:7 }
    steps:
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm db:migrate
      - run: pnpm test:unit          # < 10s
      - run: pnpm test:integration   # < 60s
      - run: pnpm test:concurrency   # < 30s
      - run: pnpm test:api           # < 60s
      - run: pnpm test:invariants    # 🔒 quét kiến trúc: kiểu cột tiền, RLS đã bật, ...
```

🔒 **`test:invariants` là job không được phép bỏ qua.** Nó kiểm tra các thuộc tính
toàn hệ thống:

- Mọi cột tiền là `bigint`
- Mọi bảng có `tenant_id` đã bật RLS **và** `FORCE ROW LEVEL SECURITY`
- Không bảng nào có FK trỏ tới bảng khác mà thiếu `tenant_id` trong khoá
- `stock_movement` và `audit_log` không có quyền `UPDATE`/`DELETE`

💡 Loại test này tự động áp dụng cho bảng thêm mới sau này — đó là điều khiến nó
đáng giá hơn nhiều so với việc nhớ kiểm tra bằng tay.

## 10. Những gì cố ý KHÔNG test

| Không test | Lý do |
|---|---|
| Getter/setter, DTO thuần | Không có logic |
| Thư viện bên thứ ba | Không phải việc của mình |
| Chi tiết giao diện (màu, vị trí) | Giòn, giá trị thấp |
| Mọi tổ hợp form | Zod schema đã phủ; test một vài đại diện |

🔒 Nhưng **không bao giờ bỏ qua**: bất kỳ bất biến nào ở
[05-invariants.md](05-invariants.md).
