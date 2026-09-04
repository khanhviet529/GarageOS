'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PackagePlus, RefreshCw } from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { useToast } from '@/components/toast';
import { BangCuon } from '@/components/bang-cuon';
import { SkeletonTable } from '@/components/skeleton';
import { TieuDeTrang } from '@/components/tieu-de-trang';
import { DaiMetric, Metric } from '@/components/metric';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  api,
  ApiCallError,
  formatDateTime,
  formatMoney,
  MOVEMENT_TYPE_LABEL,
  type PendingIssue,
  type StockBalance,
  type StockMovementItem,
  type Warehouse,
} from '@/lib/api';

interface PartOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
}

export default function TrangKho() {
  const [khoList, setKhoList] = useState<Warehouse[]>([]);
  const [khoId, setKhoId] = useState('');
  const [parts, setParts] = useState<PartOption[]>([]);

  const [ton, setTon] = useState<StockBalance[] | null>(null);
  const [soKho, setSoKho] = useState<StockMovementItem[]>([]);
  const [choXuat, setChoXuat] = useState<PendingIssue[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [capNhatLuc, setCapNhatLuc] = useState('');

  const [tim, setTim] = useState('');
  const [chiSapHet, setChiSapHet] = useState(false);

  // Form nhập kho
  const [partId, setPartId] = useState('');
  const [soLuong, setSoLuong] = useState('');
  const [giaVon, setGiaVon] = useState('');
  const [soPhieu, setSoPhieu] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([api.listWarehouses(), api.listStockParts()])
      .then(([w, p]) => {
        setKhoList(w);
        setParts(p);
        // Kho mặc định lên trước ở API, nên phần tử đầu là lựa chọn đúng
        if (w[0] !== undefined) setKhoId(w[0].id);
      })
      .catch((e: unknown) =>
        setLoi(e instanceof ApiCallError ? e.api.message : 'Không tải được kho'),
      );
  }, []);

  const taiTon = useCallback(() => {
    if (khoId === '') return;
    api
      .listStockBalances({ warehouseId: khoId, search: tim, belowMinimum: chiSapHet })
      .then((rows) => {
        setTon(rows);
        setLoi(null);
        setCapNhatLuc(new Date().toLocaleTimeString('vi-VN'));
      })
      .catch((e: unknown) =>
        setLoi(e instanceof ApiCallError ? e.api.message : 'Không tải được tồn kho'),
      );
    api
      .listStockMovements({ warehouseId: khoId })
      .then(setSoKho)
      .catch(() => {
        /* sổ kho là phần phụ — hỏng thì không chặn màn hình tồn */
      });
    api
      .listPendingIssues()
      .then((ds) => setChoXuat(ds.filter((x) => x.reservationId !== '')))
      .catch(() => setChoXuat([]));
  }, [khoId, tim, chiSapHet]);

  useEffect(taiTon, [taiTon]);

  async function xuatKho(gc: PendingIssue): Promise<void> {
    setLoi(null);
    try {
      const r = await api.issueStock({ reservationId: gc.reservationId });
      toast.thanhCong(
        `Đã xuất ${r.quantity} ${gc.unit} ${gc.partName} cho đơn ${gc.repairOrderCode}.`,
      );
      taiTon();
    } catch (err) {
      const msg = err instanceof ApiCallError ? err.api.message : 'Xuất kho thất bại';
      setLoi(msg);
      toast.loi(msg, () => void xuatKho(gc));
    }
  }

  async function nhapKho(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setLoi(null);
    setDangGui(true);
    try {
      const r = await api.receiveStock({
        warehouseId: khoId,
        partId,
        quantity: Number(soLuong),
        unitCost: Math.round(Number(giaVon)),
        ...(soPhieu.trim() === '' ? {} : { reference: soPhieu.trim() }),
      });
      const p = parts.find((x) => x.id === partId);
      toast.thanhCong(
        `Đã nhập ${soLuong} ${p?.unit ?? ''} ${p?.name ?? ''}. ` +
          `Tồn mới ${r.onHand}, giá vốn bình quân ${formatMoney(r.avgCost)}.`,
      );
      setSoLuong('');
      setGiaVon('');
      setSoPhieu('');
      taiTon();
    } catch (err) {
      const msg = err instanceof ApiCallError ? err.api.message : 'Nhập kho thất bại';
      setLoi(msg);
      toast.loi(msg);
    } finally {
      setDangGui(false);
    }
  }

  const sapHet = ton?.filter((b) => b.belowMinimum).length ?? 0;
  // 🔒 Giá vốn do API quyết định có trả hay không. Giao diện chỉ ĐỌC quyết định
  //    đó, không tự suy từ vai — vai nằm trong token mà token do client giữ.
  const xemGiaVon = ton !== null && ton.length > 0 && ton[0]!.avgCost !== null;
  const dangLoc = tim.trim() !== '' || chiSapHet;

  const chiSo = useMemo(() => {
    const ds = ton ?? [];
    return {
      soMa: ds.length,
      sapHet: ds.filter((b) => b.belowMinimum).length,
      giuCho: ds.reduce((s, b) => s + b.reserved, 0),
      /*
       * 🔒 Giá trị tồn cộng trên ĐÚNG những dòng đang hiển thị, và dòng phụ nói
       * ra điều đó khi có bộ lọc. Một con số tổng không kèm phạm vi là con số
       * sẽ bị đọc như tổng của cả kho — đúng loại "báo cáo không sai công thức
       * nhưng nói dối" mà docs/09 cảnh báo.
       */
      giaTri: ds.reduce((s, b) => s + b.onHand * (b.avgCost ?? 0), 0),
    };
  }, [ton]);

  return (
    <>
      <AppHeader current="kho" />
      <main id="noi-dung" className="container flex flex-col gap-5">
        <TieuDeTrang
          tieuDe="Kho phụ tùng"
          phu={
            loi !== null
              ? 'Không đọc được tồn kho'
              : ton === null
                ? 'Đang tải tồn kho…'
                : `${sapHet} mã dưới tồn tối thiểu · ${choXuat.length} phiếu chờ xuất`
          }
        >
          {capNhatLuc !== '' && (
            <span className="hidden font-mono text-11 text-text-dim sm:inline">
              Cập nhật {capNhatLuc}
            </span>
          )}
          <Button variant="vien" type="button" onClick={taiTon}>
            <RefreshCw className="size-3.5" aria-hidden />
            Làm mới
          </Button>
          <Button asChild>
            <a href="#nhap-kho">
              <PackagePlus className="size-4" aria-hidden />
              Nhập kho
            </a>
          </Button>
        </TieuDeTrang>

        {loi !== null && <ErrorState message={loi} onRetry={taiTon} />}

        <DaiMetric>
          <Metric
            nhan="Mã phụ tùng"
            giaTri={chiSo.soMa}
            {...(dangLoc ? { phu: 'sau bộ lọc', tone: 'dim' as const } : {})}
          />
          <Metric
            nhan="Dưới tồn tối thiểu"
            giaTri={chiSo.sapHet}
            {...(chiSo.sapHet > 0 ? { phu: 'cần đặt hàng', tone: 'warn' as const } : {})}
          />
          <Metric
            nhan="Đang giữ chỗ"
            giaTri={chiSo.giuCho}
            {...(choXuat.length > 0
              ? { phu: `${choXuat.length} phiếu chờ xuất`, tone: 'dim' as const }
              : {})}
          />
          {/* 🔒 Ô tiền chỉ dựng khi API đã trả giá vốn — tức là vai này được xem */}
          {xemGiaVon && (
            <Metric
              nhan="Giá trị tồn"
              co="vua"
              giaTri={formatMoney(chiSo.giaTri)}
              phu={dangLoc ? 'theo giá vốn · phần đang hiện' : 'theo giá vốn'}
              tone="dim"
            />
          )}
        </DaiMetric>

        {/* ── Tồn kho ─────────────────────────────────────────────────────
            🔒 Bảng này phải là <table> ĐẦU TIÊN trong DOM: hai kịch bản E2E
            đọc nó qua `page.locator('table').first()` và so con số ở đúng cột
            thứ ba (tồn) và thứ năm (khả dụng). */}
        <section className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3.5 md:px-[18px]">
            <div className="field">
              <label htmlFor="chon-kho">Kho</label>
              <select id="chon-kho" value={khoId} onChange={(e) => setKhoId(e.target.value)}>
                {khoList.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                    {w.isDefault ? ' (mặc định)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field min-w-[180px] flex-1">
              <label htmlFor="tim-ma">Tìm mã hoặc tên</label>
              <input
                id="tim-ma"
                value={tim}
                onChange={(e) => setTim(e.target.value)}
                placeholder="PT-OIL, má phanh…"
              />
            </div>
            <label className="hop-kiem">
              <input
                type="checkbox"
                checked={chiSapHet}
                onChange={(e) => setChiSapHet(e.target.checked)}
              />
              Chỉ hiện món sắp hết
            </label>
          </div>

          {sapHet > 0 && !chiSapHet && (
            <p className="alert warn m-4 md:m-[18px]" role="status">
              {sapHet} mã hàng đang dưới mức tồn tối thiểu.
            </p>
          )}

          {/*
            Khung xương chỉ hiện khi ĐANG CHỜ, không hiện khi đã hỏng. Bản
            trước để nó chạy mãi sau một lỗi 403: người dùng nhìn thấy một bảng
            xám nhấp nháy vô tận bên dưới dòng "bạn không được xem mục này", và
            hai thứ đó nói hai điều khác nhau.
          */}
          {ton === null && loi === null ? (
            <div className="p-4 md:p-[18px]">
              <SkeletonTable rows={6} cols={xemGiaVon ? 8 : 7} />
            </div>
          ) : ton === null ? null : ton.length === 0 ? (
            <div className="p-4 md:p-[18px]">
              <EmptyState
                title="Không có mã hàng nào khớp bộ lọc"
                description={
                  chiSapHet
                    ? 'Tất cả mã hàng đang ở trên mức tồn tối thiểu. Bỏ tick "chỉ hiện món sắp hết" để xem toàn bộ.'
                    : 'Thử tìm theo mã khác, hoặc nhập kho mới ở biểu mẫu bên dưới.'
                }
              />
            </div>
          ) : (
            <BangCuon moTa="Tồn kho theo mã phụ tùng">
              <table>
                <caption className="sr-only">Tồn kho theo mã phụ tùng</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-[140px]">
                      Mã
                    </th>
                    <th scope="col">Tên phụ tùng</th>
                    <th scope="col" className="phai w-[110px]">
                      Tồn thực tế
                    </th>
                    <th scope="col" className="phai w-[100px]">
                      Đã giữ chỗ
                    </th>
                    <th scope="col" className="phai w-[100px]">
                      Khả dụng
                    </th>
                    <th scope="col" className="phai w-[100px]">
                      Tối thiểu
                    </th>
                    {xemGiaVon && (
                      <th scope="col" className="phai w-[150px]">
                        Giá vốn bình quân
                      </th>
                    )}
                    <th scope="col" className="w-[150px]">
                      Tình trạng
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ton.map((b) => {
                    const het = b.available <= 0;
                    const nhan = b.belowMinimum
                      ? het
                        ? 'sắp hết · hết khả dụng'
                        : 'sắp hết'
                      : het
                        ? 'hết khả dụng'
                        : 'đủ';
                    return (
                      <tr key={`${b.warehouseId}-${b.partId}`}>
                        <td className="mono text-text">{b.sku}</td>
                        <td>{b.partName}</td>
                        <td className="phai mono">
                          {b.onHand} {b.unit}
                        </td>
                        <td className="phai mono">{b.reserved === 0 ? '—' : b.reserved}</td>
                        <td className={`phai mono ${het ? 'text-danger' : 'text-text'}`}>
                          {b.available}
                        </td>
                        <td className="phai mono text-text-dim">{b.minStockLevel}</td>
                        {xemGiaVon && (
                          <td className="phai mono">{formatMoney(b.avgCost ?? 0)}</td>
                        )}
                        <td>
                          <Badge tone={het ? 'danger' : b.belowMinimum ? 'warn' : 'ok'}>
                            {nhan}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </BangCuon>
          )}
        </section>

        {/* ── Chờ xuất kho ────────────────────────────────────────────────── */}
        <section className="card overflow-hidden p-0">
          <div className="border-b border-line px-4 py-3.5 md:px-[18px]">
            <h2 className="mb-1 text-14 font-semibold text-text">Chờ xuất kho</h2>
            <p className="hint">
              Phụ tùng khách đã duyệt và kho đã giữ chỗ. Xuất kho là lúc hàng thật sự rời khỏi
              kệ — trước đó hàng vẫn còn nguyên, chỉ là đã có chủ.
            </p>
          </div>
          {choXuat.length === 0 ? (
            <p className="alert info m-4 md:m-[18px]">Không có phiếu nào chờ xuất.</p>
          ) : (
            <BangCuon moTa="Các phiếu giữ chỗ đang chờ xuất kho">
              <table>
                <thead>
                  <tr>
                    <th scope="col" className="w-[150px]">
                      Đơn
                    </th>
                    <th scope="col" className="w-[130px]">
                      Xe
                    </th>
                    <th scope="col">Phụ tùng</th>
                    <th scope="col" className="phai w-[110px]">
                      Số lượng
                    </th>
                    <th scope="col" className="w-[180px]">
                      Hạn giữ
                    </th>
                    <th scope="col" className="w-[190px]">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {choXuat.map((gc) => (
                    <tr key={gc.reservationId}>
                      <td className="mono nowrap text-text">{gc.repairOrderCode}</td>
                      <td className="mono">{gc.plateNumber}</td>
                      <td>
                        <span className="mono">{gc.sku}</span> {gc.partName}
                      </td>
                      <td className="phai mono">
                        {gc.quantity} {gc.unit}
                      </td>
                      <td className="mono">
                        {formatDateTime(gc.expiresAt)}
                        {/* Quá hạn vẫn hiện: job nhả chạy theo chu kỳ, và thủ kho
                            cầm phụ tùng trên tay cần biết vì sao sắp không xuất được */}
                        {gc.quaHan && <span className="tag canh-bao">quá hạn</span>}
                      </td>
                      <td className="phai">
                        <Button variant="vien" size="sm" type="button" onClick={() => void xuatKho(gc)}>
                          Xuất cho {gc.repairOrderCode}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BangCuon>
          )}
        </section>

        {/* ── Nhập kho ────────────────────────────────────────────────────── */}
        <section className="card" id="nhap-kho">
          <h2>Nhập kho</h2>
          <p className="hint mb-3.5">
            Mỗi lần nhập ghi một dòng sổ kho. Giá vốn bình quân được tính lại tự động; sổ kho
            không sửa được, ghi sai thì ghi phiếu điều chỉnh.
          </p>

          <form onSubmit={nhapKho} className="row top">
            <div className="field min-w-[200px] flex-[2]">
              <label htmlFor="nk-part">Phụ tùng</label>
              <select
                id="nk-part"
                required
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
              >
                <option value="">— chọn phụ tùng —</option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field flex-1">
              <label htmlFor="nk-sl">Số lượng</label>
              <input
                id="nk-sl"
                required
                type="number"
                step="0.01"
                min="0.01"
                value={soLuong}
                onChange={(e) => setSoLuong(e.target.value)}
              />
            </div>
            <div className="field flex-1">
              <label htmlFor="nk-gia">Giá vốn một đơn vị (đồng)</label>
              <input
                id="nk-gia"
                required
                type="number"
                step="1"
                min="0"
                value={giaVon}
                onChange={(e) => setGiaVon(e.target.value)}
              />
            </div>
            <div className="field flex-1">
              <label htmlFor="nk-phieu">Số phiếu / hoá đơn nhà cung cấp</label>
              <input
                id="nk-phieu"
                value={soPhieu}
                onChange={(e) => setSoPhieu(e.target.value)}
                placeholder="không bắt buộc"
              />
            </div>
            <Button type="submit" dangXuLy={dangGui} disabled={khoId === ''}>
              {dangGui ? 'Đang ghi sổ…' : 'Ghi phiếu nhập'}
            </Button>
          </form>
        </section>

        {/* ── Sổ kho ──────────────────────────────────────────────────────── */}
        <section className="card overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3.5 md:px-[18px]">
            <h2 className="mb-0 text-14 font-semibold text-text">Sổ kho gần đây</h2>
            <span className="nhan-ky-thuat ml-auto">Chỉ thêm · không sửa được</span>
          </div>
          {soKho.length === 0 ? (
            <p className="alert info m-4 md:m-[18px]">Kho này chưa có chuyển động nào.</p>
          ) : (
            <BangCuon moTa="Các chuyển động kho gần đây">
              <table>
                <caption className="sr-only">Các chuyển động kho gần đây</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-[170px]">
                      Thời điểm
                    </th>
                    <th scope="col" className="w-[150px]">
                      Loại
                    </th>
                    <th scope="col">Phụ tùng</th>
                    <th scope="col" className="phai w-[110px]">
                      Số lượng
                    </th>
                    <th scope="col" className="w-[160px]">
                      Người ghi
                    </th>
                    <th scope="col">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {soKho.slice(0, 30).map((m) => (
                    <tr key={m.id}>
                      <td className="mono nowrap">{formatDateTime(m.createdAt)}</td>
                      <td>{MOVEMENT_TYPE_LABEL[m.type] ?? m.type}</td>
                      <td>
                        <span className="mono">{m.sku}</span> {m.partName}
                      </td>
                      {/* Dấu giữ nguyên: sổ kho là chứng từ, +/− là thông tin */}
                      <td className={`phai mono ${m.quantity < 0 ? 'am' : ''}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td>{m.createdByName}</td>
                      <td className="text-text-dim">{m.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BangCuon>
          )}
        </section>
      </main>
    </>
  );
}
