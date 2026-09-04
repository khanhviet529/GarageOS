'use client';

/**
 * Lập báo giá — BC-02.
 *
 * Bố cục hai cột có chủ đích: bên trái là danh mục để chọn, bên phải là báo giá
 * đang hình thành. Cố vấn thường ngồi cạnh khách và vừa nói vừa thêm hạng mục,
 * nên tổng tiền phải luôn nằm trong tầm mắt, không nằm dưới cuối trang.
 *
 * 🔒 Giá KHÔNG do màn hình này quyết định. Nó chỉ gửi lên hạng mục và số lượng;
 * đơn giá lấy từ bảng giá đã snapshot trên báo giá. Một lỗi hiển thị ở đây
 * không thể biến thành một hoá đơn sai.
 */
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleCheck, CircleX, Lock, TriangleAlert, X } from 'lucide-react';
import { ApiCallError, formatMoney, formatDateTime } from '@/lib/api';
import {
  QUOTATION_LINE_STATUS_LABEL,
  QUOTATION_STATUS_LABEL,
  SERVICE_CATEGORY_LABEL,
  type CatalogForVehicle,
  type Quotation,
} from '@garageos/contracts';
import { AppHeader } from '@/components/layout/app-header';
import { ErrorState, Loading } from '@/components/error-state';
import { TieuDeTrang } from '@/components/tieu-de-trang';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPlate } from '@garageos/domain';
import { BangCuon } from '@/components/bang-cuon';
import {
  useQuotationCatalog,
  useQuotationOrder,
  useQuotations,
} from '@/features/quotations/queries';
import {
  useAddQuotationLine,
  useCreateQuotation,
  useRemoveQuotationLine,
  useSendQuotation,
} from '@/features/quotations/mutations';

/** Sắc thái nhãn của cả bản báo giá — dùng chung cho mọi chỗ hiện trạng thái */
function toneBaoGia(status: Quotation['status']) {
  if (status === 'APPROVED') return 'ok' as const;
  if (status === 'REJECTED' || status === 'EXPIRED') return 'danger' as const;
  if (status === 'SENT' || status === 'PARTIALLY_APPROVED') return 'warn' as const;
  return 'trung' as const;
}

export default function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = use(params);

  const orderQuery = useQuotationOrder(orderId);
  const order = orderQuery.data;
  const catalogQuery = useQuotationCatalog(order);
  const catalog = catalogQuery.data;
  const quotationsQuery = useQuotations(orderId);
  const quotations = quotationsQuery.data;
  const createQuotation = useCreateQuotation(orderId);
  const addLine = useAddQuotationLine(orderId);
  const removeLine = useRemoveQuotationLine(orderId);
  const sendQuotation = useSendQuotation(orderId);
  const busy =
    createQuotation.isPending ||
    addLine.isPending ||
    removeLine.isPending ||
    sendQuotation.isPending;
  const queryError = [
    orderQuery.error,
    catalogQuery.error,
    quotationsQuery.error,
    createQuotation.error,
    addLine.error,
    removeLine.error,
    sendQuotation.error,
  ].find((cause) => cause !== null);
  const error =
    queryError instanceof ApiCallError
      ? queryError.api.message
      : queryError === undefined
        ? null
        : 'Lỗi kết nối';

  // Bản nháp là bản duy nhất sửa được — các bản đã gửi chỉ để xem lại
  const draft = quotations?.find((q) => q.status === 'DRAFT') ?? null;

  function run(action: () => Promise<unknown>) {
    void action().catch(() => undefined);
  }

  return (
    <>
      <AppHeader current="don" />

      <main id="noi-dung" className="container flex flex-col gap-5">
        {error !== null && (
          <ErrorState
            message={error}
            onRetry={() => {
              createQuotation.reset();
              addLine.reset();
              removeLine.reset();
              sendQuotation.reset();
              void orderQuery.refetch();
              void catalogQuery.refetch();
              void quotationsQuery.refetch();
            }}
          />
        )}

        {/* Bản trước render một trang TRẮNG trong lúc tải: cố vấn bấm 'Lập báo
            giá' khi đang ngồi cạnh khách, thấy trắng 2-3 giây trên wifi xưởng,
            tưởng hỏng và bấm back. */}
        {order === undefined && error === null && <Loading what="báo giá" />}

        {order !== undefined && (
          <TieuDeTrang
            cap="h2"
            tieuDe="Lập báo giá"
            phu={
              <>
                <Link href={`/don/${orderId}`} className="mono text-brand hover:underline">
                  {order.code}
                </Link>
                {' · '}
                <span className="mono">{formatPlate(order.vehicle.plateNumber)}</span>
                {' · '}
                {order.customer.displayName}
              </>
            }
          >
            {draft === null && (
              <Button
                dangXuLy={busy}
                onClick={() => run(() => createQuotation.mutateAsync(undefined))}
              >
                Tạo báo giá mới
              </Button>
            )}
          </TieuDeTrang>
        )}

        {draft !== null && catalog !== undefined && (
          <div className="split">
            <CatalogPicker
              catalog={catalog}
              disabled={busy}
              lines={draft.lines}
              onAddService={(serviceItemId, quantity) =>
                void run(() =>
                  addLine.mutateAsync({
                    quotationId: draft.id,
                    input: { lineType: 'LABOR', serviceItemId, quantity },
                  }),
                )
              }
              onAddPart={(partId, quantity, parentLineId) =>
                void run(() =>
                  addLine.mutateAsync({
                    quotationId: draft.id,
                    input: {
                      lineType: 'PART',
                      partId,
                      quantity,
                      ...(parentLineId === '' ? {} : { parentLineId }),
                    },
                  }),
                )
              }
            />

            <DraftPanel
              quotation={draft}
              disabled={busy}
              onRemove={(lineId) => run(() => removeLine.mutateAsync({ quotationId: draft.id, lineId }))}
              onSend={() => run(() => sendQuotation.mutateAsync(draft.id))}
            />
          </div>
        )}

        {quotations !== undefined &&
          quotations
            .filter((q) => q.status !== 'DRAFT')
            .map((q) => <SentQuotation key={q.id} quotation={q} />)}

        {quotations !== undefined && quotations.length === 0 && (
          <div className="alert info">
            Đơn này chưa có báo giá nào. Bấm <strong>Tạo báo giá mới</strong> để bắt đầu.
          </div>
        )}
      </main>
    </>
  );
}

function CatalogPicker({
  catalog,
  lines,
  disabled,
  onAddService,
  onAddPart,
}: {
  catalog: CatalogForVehicle;
  lines: Quotation['lines'];
  disabled: boolean;
  onAddService: (serviceItemId: string, quantity: number) => void;
  onAddPart: (partId: string, quantity: number, parentLineId: string) => void;
}) {
  const [tab, setTab] = useState<'service' | 'part'>('service');
  const [parentLineId, setParentLineId] = useState('');

  const laborLines = lines.filter((l) => l.lineType === 'LABOR');

  // Dòng công cha có thể bị xoá khỏi báo giá trong lúc dropdown đang chọn nó.
  // Khi đó trình duyệt hiện ô trống nhưng state vẫn giữ id cũ, và bấm "Thêm"
  // gửi lên một id không còn tồn tại — người dùng nhận lỗi khó hiểu vì ô nhìn
  // như đang để trống.
  useEffect(() => {
    if (parentLineId !== '' && !laborLines.some((l) => l.id === parentLineId)) {
      setParentLineId('');
    }
  }, [laborLines, parentLineId]);

  return (
    <div className="card overflow-hidden p-0">
      <div className="tabs px-4 pt-1 md:px-[18px]">
        <button
          className={tab === 'service' ? 'tab active' : 'tab'}
          onClick={() => setTab('service')}
        >
          Hạng mục công ({catalog.serviceItems.length})
        </button>
        <button className={tab === 'part' ? 'tab active' : 'tab'} onClick={() => setTab('part')}>
          Phụ tùng ({catalog.parts.length})
        </button>
      </div>

      {tab === 'service' && (
        <>
          <p className="hint px-4 py-3 md:px-[18px]">
            Đã lọc theo loại động cơ của chính chiếc xe này — hạng mục không áp dụng được sẽ
            không xuất hiện.
          </p>
          <BangCuon moTa="Danh mục hạng mục công">
            <table>
              <thead>
                <tr>
                  <th>Hạng mục</th>
                  <th className="w-[80px] phai">Giờ</th>
                  <th className="w-[130px] phai">Tiền công</th>
                  <th className="w-[86px]" />
                </tr>
              </thead>
              <tbody>
                {catalog.serviceItems.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="text-text">{s.name}</span>
                      <span className="nhan-ky-thuat mt-1 block">
                        {SERVICE_CATEGORY_LABEL[s.category] ?? s.category}
                      </span>
                    </td>
                    <td className="mono phai">{s.standardHours}h</td>
                    <td className="mono phai nowrap text-text">{formatMoney(s.laborAmount)}</td>
                    <td className="phai">
                      <Button
                        variant="vien"
                        size="sm"
                        disabled={disabled}
                        onClick={() => onAddService(s.id, 1)}
                        aria-label={`Thêm ${s.name}`}
                      >
                        Thêm
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </BangCuon>
        </>
      )}

      {tab === 'part' && (
        <>
          <div className="field px-4 py-3 md:px-[18px]">
            <label htmlFor="parent">Gắn vào hạng mục công</label>
            <select
              id="parent"
              value={parentLineId}
              onChange={(e) => setParentLineId(e.target.value)}
            >
              <option value="" disabled>
                — Chọn hạng mục công —
              </option>
              {laborLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description}
                </option>
              ))}
            </select>
            <span className="hint flex gap-1.5">
              <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>
                BẮT BUỘC. Khách duyệt theo hạng mục công, nên phụ tùng không gắn vào hạng mục
                nào là phụ tùng khách không có cách nào duyệt. Gắn rồi thì khi khách từ chối
                công, phụ tùng tự từ chối theo — kho không xuất hàng cho việc không ai làm.
              </span>
            </span>
          </div>

          <BangCuon moTa="Danh mục phụ tùng">
            <table>
              <thead>
                <tr>
                  <th>Phụ tùng</th>
                  <th className="w-[70px]">ĐVT</th>
                  <th className="w-[150px] phai">Đơn giá</th>
                  <th className="w-[86px]" />
                </tr>
              </thead>
              <tbody>
                {catalog.parts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="text-text">{p.name}</span>
                      {p.isHighVoltage && <span className="tag bev ml-1.5">Cao áp</span>}
                      <span className="nhan-ky-thuat mt-1 block">{p.sku}</span>
                    </td>
                    <td>{p.unit}</td>
                    <td className="mono phai nowrap text-text">
                      {p.sellPrice === null ? (
                        <span className="text-text-dim">chưa có giá</span>
                      ) : (
                        formatMoney(p.sellPrice)
                      )}
                    </td>
                    <td className="phai">
                      <Button
                        variant="vien"
                        size="sm"
                        disabled={disabled || p.sellPrice === null || parentLineId === ''}
                        onClick={() => onAddPart(p.id, 1, parentLineId)}
                        aria-label={`Thêm ${p.name}`}
                      >
                        Thêm
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </BangCuon>
        </>
      )}
    </div>
  );
}

function DraftPanel({
  quotation,
  disabled,
  onRemove,
  onSend,
}: {
  quotation: Quotation;
  disabled: boolean;
  onRemove: (lineId: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mb-0">Báo giá #{quotation.seq}</h2>
        <Badge tone={toneBaoGia(quotation.status)} className="ml-auto">
          {QUOTATION_STATUS_LABEL[quotation.status]}
        </Badge>
      </div>

      {quotation.lines.length === 0 ? (
        <div className="alert info mt-3">Chọn hạng mục ở bên trái để thêm vào báo giá.</div>
      ) : (
        <BangCuon moTa="Dòng của báo giá đang soạn" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Nội dung</th>
                <th className="w-[56px] phai">SL</th>
                <th className="w-[120px] phai">Đơn giá</th>
                <th className="w-[130px] phai">Thành tiền</th>
                <th className="w-[48px]" />
              </tr>
            </thead>
            <tbody>
              {quotation.lines.map((l) => (
                <tr key={l.id}>
                  <td className={l.parentLineId === null ? '' : 'pl-6'}>
                    {l.parentLineId !== null && <span className="text-text-dim">↳ </span>}
                    {l.description}
                    {l.isWarranty && <span className="tag bev ml-1.5">Bảo hành</span>}
                  </td>
                  <td className="mono phai">{l.quantity}</td>
                  <td className="mono phai nowrap">{formatMoney(l.unitPrice)}</td>
                  <td className="mono phai nowrap font-medium text-text">
                    {formatMoney(l.lineTotal)}
                  </td>
                  <td className="phai">
                    <Button
                      variant="chu"
                      size="icon"
                      disabled={disabled}
                      aria-label={`Bỏ ${l.description}`}
                      onClick={() => onRemove(l.id)}
                    >
                      <X className="size-3.5" aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BangCuon>
      )}

      <Totals quotation={quotation} />

      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <Button
          size="khach"
          disabled={disabled || quotation.lines.length === 0}
          onClick={onSend}
        >
          Gửi khách duyệt
        </Button>
        <span className="hint flex max-w-[28ch] gap-1.5">
          <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>Gửi rồi thì giá đóng băng. Muốn đổi phải lập bản mới.</span>
        </span>
      </div>
    </div>
  );
}

function Totals({ quotation }: { quotation: Quotation }) {
  return (
    <table className="totals mt-3">
      <tbody>
        <tr>
          <th>Cộng tiền hàng</th>
          <td className="mono">{formatMoney(quotation.subtotalAmount)}</td>
        </tr>
        {quotation.discountAmount > 0 && (
          <tr>
            <th>Chiết khấu</th>
            <td className="mono">−{formatMoney(quotation.discountAmount)}</td>
          </tr>
        )}
        <tr>
          <th>Thuế GTGT</th>
          <td className="mono">{formatMoney(quotation.taxAmount)}</td>
        </tr>
        <tr className="grand">
          <th>Tổng cộng</th>
          <td className="mono">{formatMoney(quotation.totalAmount)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Bản đã gửi khách — bố cục của khung `XƯỞNG — Báo giá`: bảng đầy đủ chiều
 * ngang, rồi một hàng gồm cảnh báo và thẻ tổng cộng.
 */
function SentQuotation({ quotation }: { quotation: Quotation }) {
  const choDuyet = quotation.lines.filter((l) => l.status === 'PENDING');
  const daDuyet = quotation.lines.filter((l) => l.status === 'APPROVED');
  const cong = (ds: Quotation['lines']) => ds.reduce((s, l) => s + l.lineTotal, 0);

  return (
    <section className="flex flex-col gap-4">
      <div className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5 md:px-[18px]">
          <h2 className="mb-0 text-14 font-semibold text-text">Báo giá #{quotation.seq}</h2>
          <p className="hint">
            {quotation.sentAt !== null && <>Gửi lúc {formatDateTime(quotation.sentAt)}. </>}
            {quotation.validUntil !== null && (
              <>Có hiệu lực đến {formatDateTime(quotation.validUntil)}.</>
            )}
          </p>
          <Badge tone={toneBaoGia(quotation.status)} className="ml-auto">
            {QUOTATION_STATUS_LABEL[quotation.status] ?? quotation.status}
          </Badge>
        </div>

        <BangCuon moTa="Dòng của báo giá đã gửi khách">
          <table>
            <thead>
              <tr>
                <th>Hạng mục</th>
                <th className="w-[100px]">Loại</th>
                <th className="w-[56px] phai">SL</th>
                <th className="w-[130px] phai">Đơn giá</th>
                <th className="w-[140px] phai">Thành tiền</th>
                <th className="w-[150px]">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {quotation.lines.map((l) => (
                <tr key={l.id} className={l.status === 'REJECTED' ? 'rejected' : undefined}>
                  <td className={l.parentLineId === null ? '' : 'pl-6'}>
                    {l.parentLineId !== null && <span className="text-text-dim">↳ </span>}
                    {l.description}
                  </td>
                  <td className="text-text-dim">{l.lineType === 'LABOR' ? 'Công' : 'Phụ tùng'}</td>
                  <td className="mono phai">{l.quantity}</td>
                  <td className="mono phai nowrap">{formatMoney(l.unitPrice)}</td>
                  <td className="mono phai nowrap font-medium text-text">
                    {formatMoney(l.lineTotal)}
                  </td>
                  <td>
                    <Badge
                      tone={
                        l.status === 'APPROVED'
                          ? 'ok'
                          : l.status === 'REJECTED'
                            ? 'danger'
                            : 'warn'
                      }
                    >
                      {QUOTATION_LINE_STATUS_LABEL[l.status] ?? l.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BangCuon>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/*
          Cảnh báo chỉ xuất hiện khi CÒN dòng chưa duyệt, và nói ra hệ quả vận
          hành chứ không chỉ nói "chưa duyệt": thợ không được thi công và kho
          không xuất phụ tùng cho dòng đó. Đây là điều cố vấn phải biết trước
          khi hứa ngày trả xe.
        */}
        {choDuyet.length > 0 ? (
          <div className="alert warn flex gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-13 font-semibold">
                {choDuyet.length} dòng chưa được khách duyệt
              </p>
              <p className="mt-1 text-12 leading-body text-text-muted">
                Thợ không được thi công và kho không xuất phụ tùng cho dòng chưa duyệt. Khách
                duyệt qua link tra cứu, xác thực bằng mã OTP.
              </p>
            </div>
          </div>
        ) : (
          <div className="alert success flex gap-3">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-13 font-semibold">Khách đã phản hồi hết các dòng của bản này</p>
          </div>
        )}

        <div className="card">
          <h2>Tổng cộng</h2>
          <DongTong nhan="Đã duyệt" mau="text-ok">
            {formatMoney(cong(daDuyet))}
          </DongTong>
          {choDuyet.length > 0 && (
            <DongTong nhan="Chờ khách duyệt" mau="text-warn">
              {formatMoney(cong(choDuyet))}
            </DongTong>
          )}
          <DongTong nhan="Cộng tiền hàng">{formatMoney(quotation.subtotalAmount)}</DongTong>
          <DongTong nhan="Thuế GTGT">{formatMoney(quotation.taxAmount)}</DongTong>
          <DongTong nhan="Khách phải trả" dam cuoi>
            {formatMoney(quotation.totalAmount)}
          </DongTong>
        </div>
      </div>

      {/* Ai duyệt gì, lúc nào — đọc từ chính trạng thái dòng */}
      {quotation.lines.some((l) => l.status !== 'PENDING') && (
        <div className="card">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mb-0">Khách duyệt từng hạng mục</h2>
            <span className="nhan-ky-thuat ml-auto">Qua link tra cứu · OTP đã xác thực</span>
          </div>
          <ul className="mt-3">
            {quotation.lines
              .filter((l) => l.lineType === 'LABOR')
              .map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0"
                >
                  {l.status === 'REJECTED' ? (
                    <CircleX className="size-4 shrink-0 text-danger" aria-hidden />
                  ) : l.status === 'APPROVED' ? (
                    <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden />
                  ) : (
                    <TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden />
                  )}
                  <span
                    className={
                      l.status === 'REJECTED'
                        ? 'min-w-0 flex-1 text-12 text-text-dim'
                        : 'min-w-0 flex-1 text-12 text-text'
                    }
                  >
                    {l.description}
                  </span>
                  <span className="font-mono text-10 uppercase tracking-[0.08em] text-text-dim">
                    {QUOTATION_LINE_STATUS_LABEL[l.status] ?? l.status}
                  </span>
                </li>
              ))}
          </ul>
          {quotation.lines.some((l) => l.rejectReason !== null) && (
            <div className="mt-3 rounded-md bg-ink-2 p-3">
              <p className="nhan-ky-thuat mb-1.5">Khách ghi chú lúc từ chối</p>
              {quotation.lines
                .filter((l) => l.rejectReason !== null)
                .map((l) => (
                  <p key={l.id} className="text-11 leading-body text-text-muted">
                    “{l.rejectReason}” — {l.description}
                  </p>
                ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DongTong({
  nhan,
  children,
  mau,
  dam = false,
  cuoi = false,
}: {
  nhan: string;
  children: React.ReactNode;
  mau?: string;
  dam?: boolean;
  cuoi?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 py-2 ${cuoi ? '' : 'border-b border-line'}`}
    >
      <span className="text-12 text-text-dim">{nhan}</span>
      <span
        className={`ml-auto font-mono text-12 ${mau ?? 'text-text'} ${dam ? 'font-semibold' : ''}`}
      >
        {children}
      </span>
    </div>
  );
}
