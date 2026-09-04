'use client';

import { useEffect, useState } from 'react';
import { browserApiOrigin } from '@/lib/api-client';
import type { BocGia } from '@/features/gia-lan-banh/kieu';

export interface ThamSoBocGia {
  slug: string;
  provinceCode: string;
  variantKey?: string | undefined;
  termMonths?: number | undefined;
  downPaymentBp?: number | undefined;
}

export type TrangThaiBocGia =
  | { pha: 'dang-tai' }
  | { pha: 'loi'; loi: string }
  | { pha: 'xong'; du: BocGia };

/**
 * Một chỗ duy nhất gọi `gia-lan-banh` từ trình duyệt.
 *
 * 🔒 `catch` NÓI RA, không nuốt. Hai lần trong dự án này một `catch` im lặng đã
 *    biến thứ HỎNG thành thứ TRỐNG — và trạng thái rỗng luôn trông vô hại, nên
 *    nó là chỗ trú tốt nhất cho lỗi.
 */
export function dungBocGia(t: ThamSoBocGia): TrangThaiBocGia {
  const { slug, provinceCode, variantKey, termMonths, downPaymentBp } = t;
  const [tt, setTt] = useState<TrangThaiBocGia>({ pha: 'dang-tai' });

  useEffect(() => {
    let huy = false;
    setTt({ pha: 'dang-tai' });
    const q = new URLSearchParams({ provinceCode });
    if (variantKey !== undefined) q.set('variantKey', variantKey);
    if (termMonths !== undefined) q.set('termMonths', String(termMonths));
    if (downPaymentBp !== undefined) q.set('downPaymentBp', String(downPaymentBp));

    fetch(`${browserApiOrigin()}/vehicle-products/${encodeURIComponent(slug)}/gia-lan-banh?${q.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as BocGia;
      })
      .then((du) => { if (!huy) setTt({ pha: 'xong', du }); })
      .catch(() => {
        if (!huy) {
          setTt({
            pha: 'loi',
            loi: 'Chưa lấy được bảng giá lăn bánh. Gọi showroom để nhận báo giá trực tiếp.',
          });
        }
      });
    return () => { huy = true; };
  }, [slug, provinceCode, variantKey, termMonths, downPaymentBp]);

  return tt;
}
