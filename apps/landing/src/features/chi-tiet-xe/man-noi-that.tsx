'use client';

import type { ExperienceSummary, PublicProductMedia } from '@garageos/contracts';
import { Icon } from '@/components/ui/icon';
import { useTrangXe } from '@/features/chi-tiet-xe/boi-canh-trai-nghiem';
import { ViewerErrorBoundary } from '@/features/chi-tiet-xe/error-boundary';
import { Showroom } from '@/features/chi-tiet-xe/showroom';
import css from './man-noi-that.module.css';

/**
 * Màn 4 · Nội thất & 360°.
 *
 * 🔒 Viewer chỉ tải khi khách CHẠM (poster-first). Trước đó màn này là ảnh và
 *    chữ — nếu viewer hỏng thì thư viện ảnh, chữ và CTA vẫn dùng được. Viewer
 *    không bao giờ là nguồn duy nhất của nội dung.
 */
export function ManNoiThat({
  trainghiem,
  anh,
  slug,
  ten,
}: {
  trainghiem: ExperienceSummary[];
  anh: PublicProductMedia[];
  slug: string;
  ten: string;
}): React.ReactElement {
  const { datChon } = useTrangXe();
  const noiThat = trainghiem.filter((e) => e.kind === 'INTERIOR_PANORAMA');
  const conLai = trainghiem.filter((e) => e.kind !== 'INTERIOR_PANORAMA');
  const hienThi = [...noiThat, ...conLai];

  return (
    <section id="thu-vien" className={`${css.man} man-anh`} aria-labelledby="noi-that-tieu-de">
      <div className={css.chu}>
        <p className="nhan hien">Nội thất</p>
        <h2 id="noi-that-tieu-de" className="hien">Khám phá khoang nội thất</h2>
        <p className={`${css.dan} hien hien-2`}>
          Xoay quanh khoang lái, phóng to bảng đồng hồ và màn hình trung tâm. Ảnh chụp đúng
          phiên bản và màu nội thất đang chọn.
        </p>
        {hienThi.length === 0 && anh.length > 0 && (
          <p className={`${css.nut} uoc-tinh`}>Showroom chưa công bố trải nghiệm 360° cho mẫu xe này.</p>
        )}
      </div>

      <div className={css.giengAnh}>
        {hienThi.length > 0 ? (
          <div className={css.viewer}>
            {hienThi.map((e) => (
              <ViewerErrorBoundary
                key={e.stableKey}
                fallback="Trải nghiệm 360° không tải được. Thư viện ảnh và biểu mẫu bên dưới vẫn dùng được."
              >
                <Showroom
                  slug={slug}
                  experience={e}
                  onActivated={() =>
                    datChon({
                      experienceStableKey: e.stableKey,
                      revision: e.revision,
                      contentHash: e.contentHash,
                    })
                  }
                />
              </ViewerErrorBoundary>
            ))}
          </div>
        ) : anh.length > 0 ? (
          <div className={css.thuVien}>
            {anh.slice(0, 5).map((m, i) => (
              <img
                key={m.id}
                src={m.url}
                alt={m.alt !== '' ? m.alt : `${ten} — ảnh ${i + 1}`}
                width={1200}
                height={800}
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <div className={css.trong}>
            <Icon ten="orbit" size={120} />
            <p className={css.ghiChuAnh}>Panorama nội thất · tỉ lệ 2:1 · tải khi chạm</p>
          </div>
        )}
      </div>
    </section>
  );
}
