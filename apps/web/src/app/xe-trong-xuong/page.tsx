'use client';

/**
 * Danh sách xe đang trong xưởng — màn hình cố vấn dịch vụ mở cả ngày.
 *
 * Thiết kế theo mật độ: một dòng một xe, quét mắt được cả xưởng trong một màn
 * hình. Không phân trang ở Phase 1 vì một garage hiếm khi có quá 100 xe cùng
 * lúc; khi nào chạm ngưỡng thì mới cần, và lúc đó sẽ thấy rõ cần lọc theo gì.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowUpDown,
  CircleAlert,
  ListFilter,
  PackageSearch,
  Plus,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {
  api,
  ApiCallError,
  POWERTRAIN_LABEL,
  POWERTRAIN_CLASS,
  ORDER_STATUS_LABEL,
  formatDateTime,
  type RepairOrderListItem,
} from '@/lib/api';
import { AppHeader } from '@/components/layout/app-header';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { TieuDeTrang } from '@/components/tieu-de-trang';
import { DaiMetric, Metric } from '@/components/metric';
import { BangCuon } from '@/components/bang-cuon';
import { SkeletonTable } from '@/components/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatPlate } from '@garageos/domain';
import { laHomNay, soGioTu, toneTrangThai } from '@/lib/hien-thi';

type Loc = 'tat-ca' | 'cho-duyet' | 'dang-sua' | 'san-sang-giao';
type SapXep = 'moi-nhat' | 'cu-nhat' | 'bien-so';

const NHAN_LOC: Record<Loc, string> = {
  'tat-ca': 'Tất cả',
  'cho-duyet': 'Chờ khách duyệt',
  'dang-sua': 'Đang sửa',
  'san-sang-giao': 'Sẵn sàng giao',
};

const NHAN_SAP_XEP: Record<SapXep, string> = {
  'moi-nhat': 'Tiếp nhận mới nhất',
  'cu-nhat': 'Ở xưởng lâu nhất',
  'bien-so': 'Biển số A→Z',
};

const THUOC_LOC: Record<Loc, (o: RepairOrderListItem) => boolean> = {
  'tat-ca': () => true,
  'cho-duyet': (o) => o.status === 'AWAITING_APPROVAL',
  'dang-sua': (o) => o.status === 'IN_PROGRESS',
  'san-sang-giao': (o) => o.status === 'AWAITING_DELIVERY',
};

function WorkshopPage() {
  const thamSo = useSearchParams();
  const tim = (thamSo.get('tim') ?? '').trim().toLowerCase();

  const [orders, setOrders] = useState<RepairOrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capNhatLuc, setCapNhatLuc] = useState<Date | null>(null);
  const [loc, setLoc] = useState<Loc>('tat-ca');
  const [sapXep, setSapXep] = useState<SapXep>('moi-nhat');

  const taiLai = useCallback(() => {
    setError(null);
    api
      .listRepairOrders()
      .then((r) => {
        setOrders(r);
        setCapNhatLuc(new Date());
      })
      .catch((err) => {
        setError(err instanceof ApiCallError ? err.api.message : 'Lỗi kết nối');
        setOrders([]);
      });
  }, []);

  useEffect(() => {
    taiLai();

    /*
     * Màn hình này "mở cả ngày" theo đúng comment ở đầu file — nhưng bản trước
     * chỉ tải đúng một lần lúc mount. Cố vấn để tab từ sáng, 3 giờ chiều nhìn
     * vào thấy trạng thái của 9 giờ sáng, rồi nói với khách "xe anh đang chờ
     * phụ tùng" trong khi thợ đã sửa xong từ trưa.
     *
     * Tải lại khi tab được nhìn lại: đúng lúc người dùng sắp đọc dữ liệu, và
     * không tốn request nào khi tab đang ẩn.
     */
    const khiHienLai = () => {
      if (document.visibilityState === 'visible') taiLai();
    };
    document.addEventListener('visibilitychange', khiHienLai);
    return () => document.removeEventListener('visibilitychange', khiHienLai);
  }, [taiLai]);

  /*
   * Chỉ số dựng TỪ chính danh sách đang hiển thị.
   *
   * 🔒 Không có con số nào ở đây được bịa hay ước lượng. Bộ thiết kế vẽ ô
   * "QUÁ HẸN TRẢ", nhưng `GET /repair-orders` không trả `promisedAt` nên xưởng
   * không có cách nào biết đơn nào quá hẹn từ màn này — thay bằng "ĐANG SỬA",
   * một đại lượng đếm được. Đã ghi vào báo cáo cuối, mục dữ liệu còn thiếu.
   */
  const chiSo = useMemo(() => {
    const ds = orders ?? [];
    const choDuyet = ds.filter((o) => o.status === 'AWAITING_APPROVAL');
    return {
      tong: ds.length,
      nhanHomNay: ds.filter((o) => laHomNay(o.receivedAt)).length,
      choDuyet: choDuyet.length,
      choDuyetQuaHan: choDuyet.filter((o) => soGioTu(o.receivedAt) > 24).length,
      dangSua: ds.filter((o) => o.status === 'IN_PROGRESS').length,
      choPhuTung: ds.filter((o) => o.status === 'AWAITING_PARTS').length,
      sanSangGiao: ds.filter((o) => o.status === 'AWAITING_DELIVERY').length,
    };
  }, [orders]);

  const hienThi = useMemo(() => {
    let ds = (orders ?? []).filter(THUOC_LOC[loc]);
    if (tim !== '') {
      ds = ds.filter((o) =>
        [o.plateNumber, o.code, o.customerName, o.customerComplaint]
          .join(' ')
          .toLowerCase()
          .includes(tim),
      );
    }
    const theoThoiGian = (a: RepairOrderListItem, b: RepairOrderListItem) =>
      new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
    return [...ds].sort((a, b) =>
      sapXep === 'bien-so'
        ? a.plateNumber.localeCompare(b.plateNumber, 'vi')
        : sapXep === 'cu-nhat'
          ? theoThoiGian(a, b)
          : -theoThoiGian(a, b),
    );
  }, [orders, loc, sapXep, tim]);

  /*
   * Việc cần xử lý — khối bên phải trong bộ thiết kế.
   *
   * Mỗi mục là một CÂU HỎI ĐANG CHỜ TRẢ LỜI, dựng từ trạng thái của chính
   * những đơn đang mở. Không có nguồn dữ liệu thứ hai nào ở đây, nên cũng
   * không có con số nào không kiểm chứng được.
   */
  const canXuLy = useMemo(() => {
    const ds = orders ?? [];
    const nhom = [
      {
        key: 'cho-duyet',
        Icon: CircleAlert,
        mau: 'text-warn',
        tieuDe: 'Báo giá chờ khách duyệt',
        items: ds.filter((o) => o.status === 'AWAITING_APPROVAL'),
        phu: (o: RepairOrderListItem) =>
          `${formatPlate(o.plateNumber)} · nhận ${Math.round(soGioTu(o.receivedAt))} giờ trước`,
      },
      {
        key: 'cho-phu-tung',
        Icon: PackageSearch,
        mau: 'text-warn',
        tieuDe: 'Chờ phụ tùng',
        items: ds.filter((o) => o.status === 'AWAITING_PARTS'),
        phu: (o: RepairOrderListItem) => `${formatPlate(o.plateNumber)} · ${o.customerName}`,
      },
      {
        key: 'cho-qc',
        Icon: ShieldCheck,
        mau: 'text-ok',
        tieuDe: 'Chờ kiểm tra chất lượng',
        items: ds.filter((o) => o.status === 'QUALITY_CHECK'),
        phu: (o: RepairOrderListItem) => `${formatPlate(o.plateNumber)} · thợ đã báo xong`,
      },
      {
        key: 'cho-thu-tien',
        Icon: Wallet,
        mau: 'text-brand',
        tieuDe: 'Chờ thanh toán',
        items: ds.filter((o) => o.status === 'AWAITING_PAYMENT'),
        phu: (o: RepairOrderListItem) => `${formatPlate(o.plateNumber)} · ${o.customerName}`,
      },
    ];
    return nhom.filter((n) => n.items.length > 0);
  }, [orders]);

  const tongCanXuLy = canXuLy.reduce((s, n) => s + n.items.length, 0);

  /*
   * 🔒 Ngày hôm nay chỉ được tính Ở TRÌNH DUYỆT.
   *
   * Trang này được kết xuất tĩnh lúc build, nên `new Date()` gọi thẳng trong
   * thân component sẽ ĐÓNG BĂNG ngày build vào HTML. Sau đó React hydrate với
   * ngày thật và báo lệch — một lỗi console mà bộ E2E chặn, và một dòng chữ
   * sai ngày mà không ai để ý cho tới khi có người dùng nó để nhớ hôm nay là
   * thứ mấy.
   */
  const [homNay, setHomNay] = useState('');
  useEffect(() => {
    setHomNay(
      new Date().toLocaleDateString('vi-VN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    );
  }, []);

  return (
    <>
      <AppHeader current="xe-trong-xuong" />

      <main id="noi-dung" className="container flex flex-col gap-5">
        <TieuDeTrang tieuDe="Xe trong xưởng" {...(homNay === '' ? {} : { phu: homNay })}>
          {capNhatLuc !== null && (
            <span className="hidden font-mono text-11 text-text-dim sm:inline">
              Cập nhật {capNhatLuc.toLocaleTimeString('vi-VN')}
            </span>
          )}
          <Button variant="vien" onClick={taiLai}>
            <RefreshCw className="size-3.5" aria-hidden />
            Làm mới
          </Button>
          <Button asChild>
            <Link href="/tiep-nhan">
              <Plus className="size-4" aria-hidden />
              Tiếp nhận xe
            </Link>
          </Button>
        </TieuDeTrang>

        <DaiMetric>
          <Metric
            nhan="Xe trong xưởng"
            giaTri={chiSo.tong}
            {...(chiSo.nhanHomNay > 0
              ? { phu: `+${chiSo.nhanHomNay} hôm nay`, tone: 'ok' as const }
              : {})}
          />
          <Metric
            nhan="Chờ khách duyệt"
            giaTri={chiSo.choDuyet}
            {...(chiSo.choDuyetQuaHan > 0
              ? { phu: `${chiSo.choDuyetQuaHan} quá 24 giờ`, tone: 'warn' as const }
              : {})}
          />
          <Metric
            nhan="Đang sửa"
            giaTri={chiSo.dangSua}
            {...(chiSo.choPhuTung > 0
              ? { phu: `${chiSo.choPhuTung} chờ phụ tùng`, tone: 'warn' as const }
              : {})}
          />
          <Metric nhan="Sẵn sàng giao" giaTri={chiSo.sanSangGiao} />
        </DaiMetric>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── Bảng xe ─────────────────────────────────────────────────── */}
          <section className="card overflow-hidden p-0">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5 md:px-[18px]">
              <h2 className="text-14 font-semibold text-text">
                {hienThi.length} xe đang ở xưởng
                {tim !== '' && <span className="ml-2 text-text-dim">· lọc theo “{tim}”</span>}
              </h2>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="chip" size="chip">
                      <ListFilter className="size-3.5" aria-hidden />
                      {loc === 'tat-ca' ? 'Bộ lọc' : NHAN_LOC[loc]}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Lọc theo trạng thái</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                      value={loc}
                      onValueChange={(v) => setLoc(v as Loc)}
                    >
                      {(Object.keys(NHAN_LOC) as Loc[]).map((k) => (
                        <DropdownMenuRadioItem key={k} value={k}>
                          {NHAN_LOC[k]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="chip" size="chip">
                      <ArrowUpDown className="size-3.5" aria-hidden />
                      Sắp xếp
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Sắp xếp theo</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                      value={sapXep}
                      onValueChange={(v) => setSapXep(v as SapXep)}
                    >
                      {(Object.keys(NHAN_SAP_XEP) as SapXep[]).map((k) => (
                        <DropdownMenuRadioItem key={k} value={k}>
                          {NHAN_SAP_XEP[k]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {error !== null && (
              <div className="p-4 md:p-[18px]">
                <ErrorState message={error} onRetry={taiLai} />
              </div>
            )}

            {orders === null && error === null && (
              <div className="p-4 md:p-[18px]">
                <SkeletonTable rows={8} cols={6} />
              </div>
            )}

            {orders !== null && error === null && hienThi.length === 0 && (
              <div className="p-4 md:p-[18px]">
                <EmptyState
                  title={
                    orders.length === 0
                      ? 'Chưa có xe nào đang trong xưởng'
                      : 'Không có xe nào khớp bộ lọc'
                  }
                  description={
                    orders.length === 0
                      ? 'Bắt đầu bằng cách tiếp nhận một chiếc xe.'
                      : 'Thử bỏ bớt bộ lọc, hoặc tìm bằng một phần biển số.'
                  }
                  action={
                    orders.length === 0 ? (
                      <Button asChild>
                        <Link href="/tiep-nhan">Tiếp nhận xe mới</Link>
                      </Button>
                    ) : (
                      <Button variant="vien" onClick={() => setLoc('tat-ca')}>
                        Xoá bộ lọc
                      </Button>
                    )
                  }
                />
              </div>
            )}

            {orders !== null && hienThi.length > 0 && (
              <BangCuon moTa="Danh sách xe đang trong xưởng">
                <table>
                  <thead>
                    <tr>
                      <th className="w-[130px]">Biển số</th>
                      <th className="w-[150px]">Mã đơn</th>
                      <th className="nowrap w-[170px]">Khách hàng</th>
                      <th>Lời khách mô tả</th>
                      <th className="w-[170px]">Trạng thái</th>
                      <th className="w-[86px]">Động cơ</th>
                      <th className="w-[140px]">Tiếp nhận lúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hienThi.map((o) => (
                      <tr key={o.id}>
                        <td className="mono nowrap font-medium text-text">
                          {formatPlate(o.plateNumber)}
                        </td>
                        <td className="mono nowrap">
                          <Link
                            href={`/don/${o.id}`}
                            className="text-brand underline-offset-2 hover:underline"
                          >
                            {o.code}
                          </Link>
                        </td>
                        <td className="nowrap">{o.customerName}</td>
                        <td>
                          <span className="truncate-1 max-w-[38ch]" title={o.customerComplaint}>
                            {o.customerComplaint}
                          </span>
                        </td>
                        <td>
                          <Badge tone={toneTrangThai(o.status)}>
                            {ORDER_STATUS_LABEL[o.status] ?? o.status}
                          </Badge>
                        </td>
                        <td>
                          <span className={`tag ${POWERTRAIN_CLASS[o.powertrain]}`}>
                            {POWERTRAIN_LABEL[o.powertrain]}
                          </span>
                        </td>
                        <td className="mono nowrap text-text-dim">
                          {formatDateTime(o.receivedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </BangCuon>
            )}
          </section>

          {/* ── Việc cần xử lý ──────────────────────────────────────────── */}
          <aside className="card overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3.5">
              <h2 className="text-14 font-semibold text-text">Cần xử lý hôm nay</h2>
              <span className="ml-auto font-mono text-12 text-brand">{tongCanXuLy}</span>
            </div>

            {orders === null && (
              <p className="p-4 text-12 text-text-dim" role="status">
                Đang tải…
              </p>
            )}

            {orders !== null && tongCanXuLy === 0 && (
              <p className="p-4 text-12 leading-body text-text-dim">
                Không có việc nào đang chờ bạn. Danh sách này dựng từ trạng thái của các đơn
                đang mở.
              </p>
            )}

            <ul>
              {canXuLy.map((nhom) => (
                <li key={nhom.key} className="border-b border-line last:border-b-0">
                  <div className="flex items-start gap-2.5 px-4 pb-1.5 pt-3.5">
                    <nhom.Icon className={`mt-px size-4 shrink-0 ${nhom.mau}`} aria-hidden />
                    <span className="text-13 font-medium text-text">
                      {nhom.tieuDe}
                      <span className="ml-1.5 font-mono text-11 text-text-dim">
                        {nhom.items.length}
                      </span>
                    </span>
                  </div>
                  <ul className="pb-2.5">
                    {nhom.items.slice(0, 3).map((o) => (
                      <li key={o.id}>
                        <Link
                          href={`/don/${o.id}`}
                          className="block px-4 py-1.5 pl-[42px] text-11 text-text-dim transition-colors hover:bg-ink-2 hover:text-text"
                        >
                          {nhom.phu(o)}
                        </Link>
                      </li>
                    ))}
                    {nhom.items.length > 3 && (
                      <li className="px-4 py-1.5 pl-[42px] text-11 text-text-dim">
                        và {nhom.items.length - 3} xe nữa
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </main>
    </>
  );
}

/**
 * `useSearchParams` bắt buộc phải nằm trong `<Suspense>` khi trang được kết
 * xuất tĩnh — không có nó, `next build` dừng với lỗi prerender.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <WorkshopPage />
    </Suspense>
  );
}
