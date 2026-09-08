'use client';

import { Check, Lock, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  BANG_MAU_MAC_DINH,
  BO_GOC_CHO_PHEP,
  capMauLanding,
  hexHopLe,
  kiemCapMau,
  loiBangMau,
  nenQuaSang,
  type BangMauLanding,
} from '@garageos/domain';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSiteTheme, useSiteThemeMutation } from '@/features/giao-dien/queries';
import { errorMessage } from '@/lib/client';
import { cn } from '@/lib/utils';

/*
 * 🔒 Bốn token, bảng màu mặc định, danh sách bậc bo góc và toàn bộ phép đo AA
 *    đều đến từ `@garageos/domain`.
 *
 * Bản trước khai lại tất cả ở ngay đây, và tám cặp màu được dựng inline trong
 * một `useMemo`. Chừng nào chỉ có màn này kiểm thì không sao — nhưng máy chủ
 * bây giờ cũng từ chối bảng màu trượt chuẩn, và hai danh sách cặp khác nhau sẽ
 * cho hai kết luận khác nhau: nút sáng lên rồi lượt lưu trả 422, hoặc tệ hơn,
 * máy chủ nhận một bảng màu mà màn này đã chặn.
 */
type Khoa = keyof BangMauLanding;

const NHAN: Record<Khoa, { ten: string; mo: string }> = {
  nenChinh: { ten: 'Nền chính', mo: 'Nền của toàn trang' },
  nenNoi: { ten: 'Nền nổi', mo: 'Thẻ và khối nổi trên nền trang' },
  thuongHieu: { ten: 'Thương hiệu', mo: 'Nhấn số, nhãn, liên kết' },
  nutChinh: { ten: 'Nút chính', mo: 'Nền của nút hành động' },
};

export default function AppearancePage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:experienceRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:experienceWrite');

  const theme = useSiteTheme(canRead);
  const luuTheme = useSiteThemeMutation();

  const [mau, setMau] = useState<BangMauLanding>(BANG_MAU_MAC_DINH);
  const [boGoc, setBoGoc] = useState<number>(4);
  const [version, setVersion] = useState(0);
  const [daLuu, setDaLuu] = useState(false);
  const [loiLuu, setLoiLuu] = useState<string | null>(null);

  /*
   * ⚠️ Nạp ĐÚNG MỘT LẦN, không đồng bộ hai chiều.
   *
   * `theme.data` đổi lại sau mỗi lượt lưu (query bị invalidate) và sau mỗi lần
   * cửa sổ lấy lại tiêu điểm. Chép nó vào state mỗi lần như thế sẽ ghi đè lên
   * những gì người dùng đang gõ dở.
   *
   * ⚠️ Cờ riêng, KHÔNG so bằng `version`. Dòng vừa `INSERT` có `version = 0` —
   *    đúng bằng giá trị khởi tạo ở đây — nên phép so đó sẽ bỏ qua chính bảng
   *    màu đầu tiên mà showroom lưu, và màn hình hiện màu mặc định trong khi
   *    trang công khai đã đổi màu.
   */
  const [daNap, setDaNap] = useState(false);
  useEffect(() => {
    const d = theme.data;
    if (d === undefined || daNap) return;
    const { version: v, daLuu: _daLuu, boGoc: bg, ...bangMau } = d;
    setMau(bangMau);
    setBoGoc(bg);
    setVersion(v);
    setDaNap(true);
  }, [theme.data, daNap]);

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
  const ketQua = useMemo(() => kiemCapMau(capMauLanding(mau)), [mau]);

  const truot = ketQua.filter((k) => !k.dat);
  const moiHexHopLe = Object.values(mau).every(hexHopLe);
  /*
   * 🔒 MỘT hàm quyết định "lưu được hay không", và máy chủ gọi đúng hàm đó.
   *
   * `loiBangMau` bao cả ba loại: hex sai dạng, nền quá sáng, và cặp trượt AA.
   * Danh sách `truot` bên trên chỉ còn dùng để VẼ — nó không được là căn cứ
   * khoá nút, vì như thế màn hình lại có luật riêng của nó.
   */
  const loi = useMemo(() => loiBangMau(mau, boGoc), [mau, boGoc]);
  const khoaLuu = loi.length > 0;
  const nenSang = (['nenChinh', 'nenNoi'] as const).filter((k) => nenQuaSang(mau[k]));

  async function luu(): Promise<void> {
    setLoiLuu(null);
    try {
      const kq = await luuTheme.mutateAsync({ ...mau, boGoc, version });
      setVersion(kq.version);
      setDaLuu(true);
    } catch (cause) {
      setLoiLuu(errorMessage(cause));
    }
  }

  function doiMau(thay: Partial<BangMauLanding>): void {
    setMau((t) => ({ ...t, ...thay }));
    setDaLuu(false);
    setLoiLuu(null);
  }

  return (
    <PageShell
      title="Giao diện landing"
      subtitle="Mọi khối trên trang công khai lấy màu và bo góc từ đây"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={!canWrite}
            onClick={() => {
              setMau(BANG_MAU_MAC_DINH);
              setBoGoc(4);
              setDaLuu(false);
              setLoiLuu(null);
            }}
          >
            Khôi phục mặc định
          </Button>
          <Button
            disabled={khoaLuu || !canWrite || luuTheme.isPending}
            aria-describedby={khoaLuu ? 'ly-do-khoa' : undefined}
            onClick={() => void luu()}
          >
            {khoaLuu && <Lock className="h-3.5 w-3.5" />}
            {luuTheme.isPending ? 'Đang lưu…' : 'Lưu và áp dụng'}
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
                      style={{ background: hexHopLe(mau[k]) ? mau[k] : 'transparent' }}
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
                      onChange={(e) => doiMau({ [k]: e.target.value })}
                      className={cn('numeric w-28 shrink-0', !hexHopLe(mau[k]) && 'border-danger')}
                      readOnly={!canWrite}
                      aria-invalid={!hexHopLe(mau[k])}
                    />
                  </div>
                ))}

                {/* Dòng kết luận ngay dưới bảng màu — không phải ở chân trang. */}
                <div
                  className={cn(
                    'mt-1 flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13px]',
                    khoaLuu ? 'bg-danger/8 text-danger' : 'bg-ok/8 text-ok',
                  )}
                >
                  {!khoaLuu ? (
                    <>
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Cả {ketQua.length} cặp màu đều qua ngưỡng AA.</span>
                    </>
                  ) : (
                    <>
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {nenSang.length > 0
                          ? `${nenSang.map((k) => NHAN[k].ten.toLowerCase()).join(' và ')} quá sáng.`
                          : `${truot.length} cặp màu chưa đạt AA.`}{' '}
                        Nút “Lưu và áp dụng” khoá cho tới khi sửa xong.
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
                  {BO_GOC_CHO_PHEP.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setBoGoc(r);
                        setDaLuu(false);
                      }}
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
                  style={{ background: hexHopLe(mau.nenChinh) ? mau.nenChinh : undefined, borderRadius: `${boGoc}px` }}
                >
                  <div
                    className="p-3.5"
                    style={{ background: hexHopLe(mau.nenNoi) ? mau.nenNoi : undefined, borderRadius: `${boGoc}px` }}
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
                        background: hexHopLe(mau.nutChinh) ? mau.nutChinh : undefined,
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
                  {/*
                    * Liệt kê ĐÚNG những gì cổng `loiBangMau` trả về. Viết lại
                    * lý do bằng lời của màn hình là cách hai bên bắt đầu nói
                    * khác nhau — và người dùng sẽ tin màn hình.
                    */}
                  <ul className="mt-0.5 flex list-disc flex-col gap-0.5 pl-4 text-xs">
                    {loi.map((l) => (
                      <li key={l.thongDiep}>{l.thongDiep}</li>
                    ))}
                  </ul>
                  {moiHexHopLe && truot.length > 0 && (
                    <span className="mt-1 block text-xs">
                      Sửa theo gợi ý ở trên rồi lưu lại — bảng màu trượt chuẩn sẽ ra tới người dùng cuối và
                      không ai đo lại nó nữa.
                    </span>
                  )}
                </span>
              </Alert>
            )}

            {loiLuu !== null && <Alert tone="danger">{loiLuu}</Alert>}

            {daLuu && loiLuu === null && (
              <Alert tone="ok" className="items-start">
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-xs">
                  Đã lưu. Trang công khai lấy bảng màu mới ở lượt tải kế tiếp.
                </span>
              </Alert>
            )}

            {theme.data?.daLuu === false && !daLuu && (
              <Alert className="items-start">
                <span className="text-xs">
                  Showroom chưa lưu bảng màu nào — bốn giá trị đang hiện là mặc định của hệ thống, và trang
                  công khai đang dùng chính chúng.
                </span>
              </Alert>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
