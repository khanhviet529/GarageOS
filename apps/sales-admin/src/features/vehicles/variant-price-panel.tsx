'use client';

import type { OnroadPriceBreakdown } from '@garageos/contracts';
import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { OnroadBreakdown } from '@/features/showroom/onroad-breakdown';
import { showroomApi } from '@/features/showroom/api';
import { tien } from '@/lib/format';
import type { VariantView } from './types';

/** Tỉnh mặc định để xem thử bóc giá. Người dùng đổi được ngay trên khối. */
const TINH_MAC_DINH = '01';

/**
 * Khối chi tiết một phiên bản: định danh, giá bán, bóc giá lăn bánh, thông số.
 *
 * Giá KHÔNG sửa trực tiếp trong ô nhập — mọi lần đổi đi qua hộp thoại có ô lý do
 * bắt buộc. Một ô nhập giá sửa tại chỗ thì không có chỗ nào hỏi "vì sao", và
 * nhật ký giá sẽ đầy những dòng không giải thích được.
 */
export function VariantPricePanel({
  variant,
  onOpenPriceDialog,
  canWrite,
}: {
  variant: VariantView;
  onOpenPriceDialog: () => void;
  canWrite: boolean;
}): React.ReactElement {
  const [tinh, setTinh] = useState(TINH_MAC_DINH);
  const [quote, setQuote] = useState<OnroadPriceBreakdown | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [loiQuote, setLoiQuote] = useState<string | null>(null);

  useEffect(() => {
    let huy = false;
    if (variant.displayPrice === null) {
      setQuote(null);
      setLoiQuote(null);
      return;
    }
    setDangTai(true);
    setLoiQuote(null);
    showroomApi
      .onroadQuote({ variantId: variant.id, provinceCode: tinh })
      .then((q) => {
        if (!huy) setQuote(q);
      })
      .catch(() => {
        /* Không có biểu phí cho tỉnh này là chuyện bình thường, không phải lỗi
           hệ thống — nói ra và mời người dùng đi khai, đừng hiện màn đỏ. */
        if (!huy) {
          setQuote(null);
          setLoiQuote('Chưa có biểu phí lăn bánh cho tỉnh/thành này.');
        }
      })
      .finally(() => {
        if (!huy) setDangTai(false);
      });
    return () => {
      huy = true;
    };
  }, [variant.id, variant.displayPrice, tinh]);

  const thongSo = Object.entries(variant.specifications);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Định danh</CardTitle>
          {variant.isFeatured && <Badge tone="brand">Nổi bật trang chủ</Badge>}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ten-phien-ban">Tên phiên bản</Label>
            <Input id="ten-phien-ban" defaultValue={variant.name} readOnly={!canWrite} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ma-sku">Mã SKU</Label>
            <Input id="ma-sku" defaultValue={variant.sku ?? ''} readOnly={!canWrite} className="numeric" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doi-xe">Đời xe</Label>
            <Input id="doi-xe" defaultValue={String(variant.modelYear)} readOnly={!canWrite} className="numeric" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Giá bán</CardTitle>
          <span className="tech-label text-text-muted">bắt buộc để hiện giá</span>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tech-label text-text-muted">Giá niêm yết</p>
              <p className="numeric mt-1 text-[22px] font-semibold text-text">
                {variant.displayPrice === null ? (
                  <span className="text-[15px] font-normal text-warn">Chưa đặt giá — trang xe sẽ không hiện giá</span>
                ) : (
                  tien(variant.displayPrice)
                )}
              </p>
            </div>
            {canWrite && (
              <Button variant="soft" onClick={onOpenPriceDialog}>
                <Pencil className="h-3.5 w-3.5" />
                Đổi giá
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="tinh-boc-gia" className="shrink-0">
              Xem bóc giá theo tỉnh
            </Label>
            <Input
              id="tinh-boc-gia"
              value={tinh}
              onChange={(e) => setTinh(e.target.value.replace(/\D/g, '').slice(0, 2))}
              className="numeric h-[29px] w-20"
              inputMode="numeric"
              aria-describedby="tinh-giai-thich"
            />
            <span id="tinh-giai-thich" className="text-[11px] text-text-muted">
              mã tỉnh/thành theo biểu phí đã khai
            </span>
          </div>

          {variant.displayPrice === null ? (
            <p className="text-xs text-text-muted">Đặt giá niêm yết trước thì mới bóc được giá lăn bánh.</p>
          ) : dangTai ? (
            <Skeleton className="h-[200px] w-full" />
          ) : quote !== null ? (
            <OnroadBreakdown quote={quote} />
          ) : (
            <p className="text-xs text-warn">{loiQuote}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thông số kỹ thuật</CardTitle>
          <span className="tech-label text-text-muted">hiện trên trang xe</span>
        </CardHeader>
        <CardContent>
          {thongSo.length === 0 ? (
            <p className="text-xs text-text-muted">
              Phiên bản này chưa khai thông số nào. Trang xe sẽ bỏ qua khối thông số thay vì hiện bảng rỗng.
            </p>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {thongSo.map(([khoa, giaTri]) => (
                <div key={khoa} className="flex flex-col gap-1">
                  <dt className="text-[11px] text-text-muted">{khoa}</dt>
                  <dd className="rounded-md bg-ink-2 px-3 py-2 text-[13px] text-text">{giaTri}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
