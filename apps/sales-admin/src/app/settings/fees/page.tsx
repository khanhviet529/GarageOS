'use client';

import type { Powertrain } from '@garageos/contracts';
import { tinhGiaLanBanh } from '@garageos/domain';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table';
import { showroomApi, type FeeScheduleRow } from '@/features/showroom/api';
import { POWERTRAIN_LABEL } from '@/features/showroom/labels';
import { errorMessage } from '@/lib/client';
import { ngay, soNguyen, tien } from '@/lib/format';

/** Giá mẫu để thử phép cộng — 1,2 tỉ, cỡ một mẫu SUV điện phổ thông. */
const GIA_THU_MAC_DINH = '1200000000';

/** Gom các dòng cùng tỉnh lại: bảng hiện một dòng mỗi tỉnh, cột theo động cơ. */
interface DongTinh {
  provinceCode: string;
  provinceName: string;
  theoDongCo: Map<Powertrain, FeeScheduleRow>;
}

function gomTheoTinh(rows: FeeScheduleRow[]): DongTinh[] {
  const m = new Map<string, DongTinh>();
  for (const r of rows) {
    let d = m.get(r.provinceCode);
    if (d === undefined) {
      d = { provinceCode: r.provinceCode, provinceName: r.provinceName, theoDongCo: new Map() };
      m.set(r.provinceCode, d);
    }
    /* Truy vấn đã ORDER BY effective_from DESC, nên dòng đầu gặp là dòng đang
       hiệu lực — không ghi đè bằng dòng cũ hơn. */
    if (!d.theoDongCo.has(r.powertrain)) d.theoDongCo.set(r.powertrain, r);
  }
  return [...m.values()].sort((a, b) => a.provinceName.localeCompare(b.provinceName, 'vi'));
}

function phanTram(bp: number): string {
  return `${(bp / 100).toLocaleString('vi-VN')} %`;
}

export default function FeeSchedulesPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'showroom:feeScheduleRead');

  const [rows, setRows] = useState<FeeScheduleRow[]>([]);
  const [dangTai, setDangTai] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [giaThu, setGiaThu] = useState(GIA_THU_MAC_DINH);
  const [tinhThu, setTinhThu] = useState<string | null>(null);
  const [dongCoThu, setDongCoThu] = useState<Powertrain>('BEV');

  useEffect(() => {
    if (!canRead) {
      setDangTai(false);
      return;
    }
    let huy = false;
    showroomApi
      .feeSchedules()
      .then((r) => {
        if (!huy) setRows(r);
      })
      .catch((e) => {
        if (!huy) setError(errorMessage(e));
      })
      .finally(() => {
        if (!huy) setDangTai(false);
      });
    return () => {
      huy = true;
    };
  }, [canRead]);

  const tinhs = useMemo(() => gomTheoTinh(rows), [rows]);

  useEffect(() => {
    if (tinhThu === null && tinhs.length > 0) setTinhThu(tinhs[0]?.provinceCode ?? null);
  }, [tinhThu, tinhs]);

  const dongThu = tinhs.find((t) => t.provinceCode === tinhThu);
  const bieuPhiThu = dongThu?.theoDongCo.get(dongCoThu) ?? null;

  /*
   * 🔒 "Thử phép cộng" gọi ĐÚNG hàm mà máy chủ dùng: `tinhGiaLanBanh` ở
   *    `packages/domain`. Nếu chỗ này tự cộng lại một lần nữa bằng công thức
   *    chép tay, hai con số sẽ lệch nhau vào đúng ngày công thức đổi — và người
   *    biên tập sẽ tin con số sai vì nó hiện ngay trước mắt họ.
   */
  const thu = useMemo(() => {
    if (bieuPhiThu === null) return null;
    const so = giaThu.replace(/\D/g, '');
    if (so === '') return null;
    try {
      return tinhGiaLanBanh(
        { listPrice: BigInt(so) },
        {
          provinceName: bieuPhiThu.provinceName,
          powertrain: bieuPhiThu.powertrain,
          registrationFeeRateBp: bieuPhiThu.registrationFeeRateBp,
          plateFeeAmount: BigInt(bieuPhiThu.plateFeeAmount),
          inspectionFeeAmount: BigInt(bieuPhiThu.inspectionFeeAmount),
          roadMaintenanceFeeAmount: BigInt(bieuPhiThu.roadMaintenanceFeeAmount),
          civilInsuranceFeeAmount: BigInt(bieuPhiThu.civilInsuranceFeeAmount),
          materialInsuranceRateBp: bieuPhiThu.materialInsuranceRateBp,
          dealerFeeAmount: BigInt(bieuPhiThu.dealerFeeAmount),
          dealerFeeLabel: bieuPhiThu.dealerFeeLabel,
          effectiveFrom: bieuPhiThu.effectiveFrom,
        },
      );
    } catch {
      return null;
    }
  }, [bieuPhiThu, giaThu]);

  const hieuLucSom = rows.map((r) => r.effectiveFrom).sort()[0] ?? null;

  return (
    <PageShell
      title="Biểu phí lăn bánh"
      subtitle={
        dangTai
          ? 'Đang tải…'
          : `${tinhs.length} tỉnh/thành · nguồn của mọi con số lăn bánh trên landing`
      }
    >
      {error !== null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem biểu phí lăn bánh.</Alert>
      ) : dangTai ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,820fr)_minmax(300px,320fr)]">
          <div className="flex flex-col gap-4">
            <Alert tone="warn" className="items-start">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Sửa một dòng ở đây là đổi giá lăn bánh của <strong>mọi mẫu xe</strong> thuộc tỉnh/thành đó,
                trên toàn bộ landing. Đây không phải cấu hình của một mẫu xe.
              </span>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle>Biểu phí theo tỉnh/thành</CardTitle>
                <span className="tech-label text-text-muted">đang hiệu lực</span>
              </CardHeader>
              <CardContent className="p-0">
                {tinhs.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[13px] text-text-muted">
                    Chưa khai biểu phí cho tỉnh/thành nào. Trang xe sẽ không hiện được giá lăn bánh.
                  </p>
                ) : (
                  <TableWrap>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead pinned className="bg-ink-1">
                            Tỉnh/thành
                          </TableHead>
                          <TableHead>Trước bạ xăng</TableHead>
                          <TableHead>Trước bạ điện</TableHead>
                          <TableHead>Biển số</TableHead>
                          <TableHead>Đăng kiểm</TableHead>
                          <TableHead>Đường bộ</TableHead>
                          <TableHead>BHTNDS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tinhs.map((t) => {
                          const ice = t.theoDongCo.get('ICE') ?? null;
                          const bev = t.theoDongCo.get('BEV') ?? null;
                          const mau = ice ?? bev;
                          return (
                            <TableRow key={t.provinceCode}>
                              <TableCell pinned className="bg-ink-1 text-text">
                                {t.provinceName}
                              </TableCell>
                              <TableCell className="numeric text-text-muted">
                                {ice === null ? '—' : phanTram(ice.registrationFeeRateBp)}
                              </TableCell>
                              {/* Trước bạ 0% cho xe điện là một CHÍNH SÁCH, không
                                  phải ô bỏ trống — tô bằng màu nhãn kỹ thuật để
                                  không ai đọc nhầm thành "chưa khai". */}
                              <TableCell className="numeric text-signal-dark light:text-signal-light">
                                {bev === null ? '—' : phanTram(bev.registrationFeeRateBp)}
                              </TableCell>
                              <TableCell className="numeric text-text-muted">
                                {mau === null ? '—' : soNguyen(Number(mau.plateFeeAmount))}
                              </TableCell>
                              <TableCell className="numeric text-text-muted">
                                {mau === null ? '—' : soNguyen(Number(mau.inspectionFeeAmount))}
                              </TableCell>
                              <TableCell className="numeric text-text-muted">
                                {mau === null ? '—' : soNguyen(Number(mau.roadMaintenanceFeeAmount))}
                              </TableCell>
                              <TableCell className="numeric text-text-muted">
                                {mau === null ? '—' : soNguyen(Number(mau.civilInsuranceFeeAmount))}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableWrap>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Hiệu lực</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                <div className="flex items-baseline gap-3">
                  <span className="shrink-0 text-xs text-text-muted">Áp dụng từ</span>
                  <span className="h-px min-w-4 flex-1 self-center bg-line" aria-hidden="true" />
                  <span className="numeric text-xs text-text">{hieuLucSom === null ? '—' : ngay(hieuLucSom)}</span>
                </div>
                <p className="text-[11px] text-text-muted">
                  Biểu phí không có trường “căn cứ pháp lý”, “người cập nhật” hay “lần sửa gần nhất” trong
                  mô hình dữ liệu, nên màn này không hiện ba dòng đó thay vì điền bừa.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Thử phép cộng</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gia-thu">Giá niêm yết giả định</Label>
                  <Input
                    id="gia-thu"
                    inputMode="numeric"
                    className="numeric"
                    value={giaThu}
                    onChange={(e) => setGiaThu(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(['ICE', 'HYBRID', 'BEV'] as Powertrain[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDongCoThu(p)}
                      aria-pressed={dongCoThu === p}
                      className={
                        dongCoThu === p
                          ? 'rounded-md bg-ink-3 px-2.5 py-1 text-xs text-text'
                          : 'rounded-md px-2.5 py-1 text-xs text-text-muted hover:bg-ink-2 hover:text-text'
                      }
                    >
                      {POWERTRAIN_LABEL[p]}
                    </button>
                  ))}
                </div>

                {thu === null ? (
                  <p className="text-xs text-text-muted">
                    Chưa có biểu phí cho tổ hợp tỉnh/thành và loại động cơ này.
                  </p>
                ) : (
                  <div className="rounded-md bg-ink-2 p-3.5">
                    <dl className="flex flex-col gap-1.5">
                      {thu.lines
                        .filter((l) => l.insideTotal)
                        .map((l) => (
                          <div key={l.key} className="flex items-baseline gap-3">
                            <dt className="shrink-0 text-[11px] text-text-muted">{l.label}</dt>
                            <span className="h-px min-w-4 flex-1 self-center bg-line" aria-hidden="true" />
                            <dd className="numeric text-[11px] text-text-muted">{tien(l.amount)}</dd>
                          </div>
                        ))}
                    </dl>
                    <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
                      <span className="text-xs text-text">Tổng lăn bánh</span>
                      <span className="numeric text-[15px] font-semibold text-brand">{tien(thu.total)}</span>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-text-muted">
                  Con số này tính bằng đúng hàm mà máy chủ dùng, không phải công thức chép lại — đổi một ô
                  bên trái là nó chạy lại ngay.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}
