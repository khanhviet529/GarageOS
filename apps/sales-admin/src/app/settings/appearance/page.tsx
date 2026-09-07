'use client';

import { Check, Lock, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { kiemCapMau, hopLe, type CapMau } from '@/lib/contrast';
import { cn } from '@/lib/utils';

/*
 * Bốn token ngữ nghĩa mà biên tập viên được đổi. Bốn — không phải hai mươi:
 * mỗi token thêm vào là một cặp màu nữa phải kiểm, và một cách nữa để bảng màu
 * của một tenant tự mâu thuẫn.
 */
const MAC_DINH = {
  nenChinh: '#08090a',
  nenNoi: '#15181b',
  thuongHieu: '#ff705c',
  nutChinh: '#c73526',
};

type Khoa = keyof typeof MAC_DINH;

const NHAN: Record<Khoa, { ten: string; mo: string }> = {
  nenChinh: { ten: 'Nền chính', mo: 'Nền của toàn trang' },
  nenNoi: { ten: 'Nền nổi', mo: 'Thẻ và khối nổi trên nền trang' },
  thuongHieu: { ten: 'Thương hiệu', mo: 'Nhấn số, nhãn, liên kết' },
  nutChinh: { ten: 'Nút chính', mo: 'Nền của nút hành động' },
};

const BO_GOC = [0, 4, 8, 16];

export default function AppearancePage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:experienceRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:experienceWrite');

  const [mau, setMau] = useState(MAC_DINH);
  const [boGoc, setBoGoc] = useState(4);

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * 🔒 KIỂM TRA MÀ KHÔNG CHẶN THÌ CHỈ LÀ TRANG TRÍ.
   *
   * Danh sách cặp màu dưới đây là những cặp THỰC SỰ xuất hiện trên landing.
   * Còn một cặp trượt AA thì nút "Lưu và áp dụng" khoá — không phải hiện một
   * dấu đỏ rồi vẫn cho lưu. Một cảnh báo bỏ qua được là một cảnh báo sẽ bị
   * bỏ qua, và bảng màu trượt chuẩn sẽ ra tới người dùng cuối.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const ketQua = useMemo(() => {
    const cap: CapMau[] = [
      { nhan: 'Chữ chính trên nền trang', chu: '#f5f5f3', nen: mau.nenChinh, nguong: 4.5 },
      { nhan: 'Chữ chính trên nền nổi', chu: '#f5f5f3', nen: mau.nenNoi, nguong: 4.5 },
      { nhan: 'Chữ phụ trên nền trang', chu: '#b5b7b4', nen: mau.nenChinh, nguong: 4.5 },
      { nhan: 'Chữ phụ trên nền nổi', chu: '#b5b7b4', nen: mau.nenNoi, nguong: 4.5 },
      { nhan: 'Thương hiệu làm chữ trên nền trang', chu: mau.thuongHieu, nen: mau.nenChinh, nguong: 4.5 },
      { nhan: 'Thương hiệu làm chữ trên nền nổi', chu: mau.thuongHieu, nen: mau.nenNoi, nguong: 4.5 },
      { nhan: 'Chữ trắng trên nút chính', chu: '#ffffff', nen: mau.nutChinh, nguong: 4.5 },
      { nhan: 'Viền nút chính trên nền trang', chu: mau.nutChinh, nen: mau.nenChinh, nguong: 3 },
    ];
    return kiemCapMau(cap);
  }, [mau]);

  const truot = ketQua.filter((k) => !k.dat);
  const moiHexHopLe = Object.values(mau).every(hopLe);
  const khoaLuu = truot.length > 0 || !moiHexHopLe;

  return (
    <PageShell
      title="Giao diện landing"
      subtitle="Mọi khối trên trang công khai lấy màu và bo góc từ đây"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setMau(MAC_DINH)}>
            Khôi phục mặc định
          </Button>
          <Button disabled={khoaLuu || !canWrite} aria-describedby={khoaLuu ? 'ly-do-khoa' : undefined}>
            {khoaLuu && <Lock className="h-3.5 w-3.5" />}
            Lưu và áp dụng
          </Button>
        </div>
      }
    >
      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem cấu hình giao diện.</Alert>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,736fr)_minmax(320px,400fr)]">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Bảng màu</CardTitle>
                <span className="tech-label text-text-muted">token ngữ nghĩa</span>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(Object.keys(NHAN) as Khoa[]).map((k) => (
                  <div key={k} className="flex items-center gap-3">
                    <span
                      className="h-[26px] w-[26px] shrink-0 rounded-sm border border-line"
                      style={{ background: hopLe(mau[k]) ? mau[k] : 'transparent' }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <Label htmlFor={`mau-${k}`} className="block text-[13px] text-text">
                        {NHAN[k].ten}
                      </Label>
                      <span className="block text-[11px] text-text-muted">{NHAN[k].mo}</span>
                    </span>
                    <Input
                      id={`mau-${k}`}
                      value={mau[k]}
                      onChange={(e) => setMau((t) => ({ ...t, [k]: e.target.value }))}
                      className={cn('numeric w-28 shrink-0', !hopLe(mau[k]) && 'border-danger')}
                      readOnly={!canWrite}
                      aria-invalid={!hopLe(mau[k])}
                    />
                  </div>
                ))}

                {/* Dòng kết luận ngay dưới bảng màu — không phải ở chân trang. */}
                <div
                  className={cn(
                    'mt-1 flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13px]',
                    truot.length === 0 ? 'bg-ok/8 text-ok' : 'bg-danger/8 text-danger',
                  )}
                >
                  {truot.length === 0 ? (
                    <>
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Cả {ketQua.length} cặp màu đều qua ngưỡng AA.</span>
                    </>
                  ) : (
                    <>
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {truot.length} cặp màu chưa đạt AA. Nút “Lưu và áp dụng” khoá cho tới khi sửa xong.
                      </span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hình khối</CardTitle>
              </CardHeader>
              <CardContent>
                <Label className="mb-2 block">Bo góc</Label>
                <div className="flex flex-wrap gap-2">
                  {BO_GOC.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setBoGoc(r)}
                      aria-pressed={boGoc === r}
                      className={cn(
                        'flex h-[62px] w-[100px] items-center justify-center border text-xs transition-colors',
                        boGoc === r ? 'border-line-strong bg-ink-2 text-text' : 'border-line text-text-muted hover:bg-ink-2',
                      )}
                      style={{ borderRadius: `${r}px` }}
                    >
                      <span className="numeric">{r}px</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Xem trước</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Xem trước dùng ĐÚNG giá trị đang gõ — đổi màu là khối này đổi
                    theo, nên người dùng thấy hậu quả trước khi lưu. */}
                <div
                  className="overflow-hidden border border-line p-4"
                  style={{ background: hopLe(mau.nenChinh) ? mau.nenChinh : undefined, borderRadius: `${boGoc}px` }}
                >
                  <div
                    className="p-3.5"
                    style={{ background: hopLe(mau.nenNoi) ? mau.nenNoi : undefined, borderRadius: `${boGoc}px` }}
                  >
                    <p className="tech-label" style={{ color: mau.thuongHieu }}>
                      Showroom
                    </p>
                    <p className="mt-1 text-sm" style={{ color: '#f5f5f3' }}>
                      Một hành trình sở hữu, liên tục.
                    </p>
                    <p className="mt-1 text-xs" style={{ color: '#b5b7b4' }}>
                      Giá lăn bánh ước tính, cập nhật theo tỉnh.
                    </p>
                    <span
                      className="mt-3 inline-flex px-3 py-1.5 text-xs"
                      style={{
                        background: hopLe(mau.nutChinh) ? mau.nutChinh : undefined,
                        color: '#ffffff',
                        borderRadius: `${boGoc}px`,
                      }}
                    >
                      Đăng ký lái thử
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kiểm tra tương phản</CardTitle>
                <span className="tech-label text-text-muted">WCAG 2.2 AA</span>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {ketQua.map((k) => (
                  <div
                    key={k.nhan}
                    className={cn(
                      'flex flex-col gap-1 rounded-sm px-2 py-1.5',
                      !k.dat && 'bg-danger/8',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {k.dat ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-ok" />
                      ) : (
                        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-danger" />
                      )}
                      <span className={cn('min-w-0 flex-1 text-[11px]', k.dat ? 'text-text-muted' : 'text-danger')}>
                        {k.nhan}
                        {!k.dat && ' — không đạt'}
                      </span>
                      <span className={cn('numeric shrink-0 text-[11px]', k.dat ? 'text-text-muted' : 'text-danger')}>
                        {k.tiLe.toFixed(2)} : 1
                      </span>
                    </div>

                    {/*
                     * 🔒 GỢI Ý MÀU THAY THẾ, không chỉ báo lỗi. Chặn mà không
                     *    nói "vậy dùng màu gì" thì người dùng sẽ thử từng giá
                     *    trị hex cho tới khi dấu đỏ tắt — và cái họ học được là
                     *    cách làm tắt dấu đỏ, không phải cách chọn màu đọc được.
                     */}
                    {!k.dat && k.goiY !== null && (
                      <div className="flex items-center gap-2 pl-5">
                        <span className="text-[11px] text-text-muted">Thử</span>
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-sm border border-line"
                          style={{ background: k.goiY }}
                          aria-hidden="true"
                        />
                        <span className="numeric text-[11px] text-text">{k.goiY}</span>
                        <span className="text-[11px] text-text-muted">— cùng sắc, đủ tương phản</span>
                      </div>
                    )}
                    {!k.dat && k.goiY === null && (
                      <p className="pl-5 text-[11px] text-text-muted">
                        Không màu chữ nào cùng sắc đạt ngưỡng trên nền này — cần đổi chính màu nền.
                      </p>
                    )}
                  </div>
                ))}

                <p className="mt-2 text-[11px] text-text-muted">
                  Ngưỡng AA là 4,5 : 1 cho chữ thường và 3 : 1 cho thành phần giao diện.
                </p>
              </CardContent>
            </Card>

            {khoaLuu && (
              <Alert tone="danger" className="items-start" id="ly-do-khoa">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Chưa lưu được bảng màu này</span>
                  <span className="mt-0.5 block text-xs">
                    {!moiHexHopLe
                      ? 'Có mã màu chưa đúng dạng #rrggbb.'
                      : `${truot.length} cặp màu dưới ngưỡng AA. Sửa theo gợi ý ở trên rồi lưu lại — bảng màu trượt chuẩn sẽ ra tới người dùng cuối và không ai đo lại nó nữa.`}
                  </span>
                </span>
              </Alert>
            )}

            <Alert className="items-start">
              <span className="text-xs">
                Màn này chưa nối được với máy chủ: chưa có endpoint lưu bảng màu cho landing. Phần kiểm tra
                và chặn đã hoạt động đầy đủ. Xem báo cáo cuối.
              </span>
            </Alert>
          </div>
        </div>
      )}
    </PageShell>
  );
}
