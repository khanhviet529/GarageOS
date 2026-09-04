import type { Metadata } from 'next';
import { buildPageTitle } from '@garageos/domain';
import { LeadForm } from '@/components/lead-form';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Icon } from '@/components/ui/icon';
import css from '@/features/lien-he/lien-he.module.css';
import { noIndex } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';
import { loadSite } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * Bốn câu hay được hỏi nhất, và câu trả lời là CHÍNH SÁCH của hệ thống — không
 * có con số nào ở đây được suy ra từ dữ liệu, nên không có con số nào bị lệch
 * khi dữ liệu đổi.
 */
const FAQ = [
  ['Lái thử có mất phí không?', 'Không. Lái thử miễn phí, không cần đặt cọc và không ràng buộc mua.'],
  ['Giá lăn bánh trên trang có đúng không?', 'Là số ước tính theo biểu phí đang hiệu lực, hiện kèm ngày hiệu lực ngay cạnh con số. Showroom xác nhận lại khi ký hợp đồng.'],
  ['Có hỗ trợ trả góp không?', 'Có. Khoản trả góp trên trang là con số tham khảo; ngân hàng xét hồ sơ và quyết định điều kiện vay riêng.'],
  ['Mua xe ở đây có bắt buộc bảo dưỡng ở đây không?', 'Không bắt buộc. Nhưng xe mua tại đây được tạo hồ sơ sẵn trong hệ thống xưởng, nên lần bảo dưỡng đầu không phải khai lại từ đầu.'],
] as const;

interface ThamSo { 'nhu-cau'?: string }

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<ThamSo>;
}): Promise<React.ReactElement> {
  const site = await loadSite();
  const tham = await searchParams;
  const laiThu = tham['nhu-cau'] === 'lai-thu';
  const chiNhanh = site?.publicBranches ?? [];
  const hotline = chiNhanh.find((b) => b.phone !== null)?.phone ?? null;

  return (
    <>
      <SiteHeader site={site} trang="lien-he" />
      {noIndex() && <meta name="robots" content="noindex,nofollow" />}
      <main id="main" tabIndex={-1}>
        <section className={css.dau}>
          <div className={`container ${css.dauTrong}`}>
            <div>
              <p className="nhan">Liên hệ</p>
              <h1>{laiThu ? 'Đăng ký lái thử' : 'Liên hệ'}</h1>
            </div>
            {hotline !== null && (
              <p className={css.hotline}>
                <span className="nhan nhan-mo">Gọi ngay</span>
                <b><a href={`tel:${hotline}`}>{hotline}</a></b>
              </p>
            )}
          </div>
        </section>

        <section className={`${css.than} man-giay`}>
          <div className={`container ${css.luoi}`}>
            <div className={css.hopBieuMau}>
              <LeadForm
                site={site}
                intentMacDinh={laiThu ? 'TEST_DRIVE' : 'REQUEST_QUOTE'}
              />
            </div>

            <div className={css.cot}>
              {/*
                ⚠️ Bản dựng chia theo BỘ PHẬN (bán hàng · dịch vụ · cứu hộ), mỗi
                   bộ phận một số. `PublicSiteView` chỉ có số điện thoại theo CHI
                   NHÁNH. Chia theo chi nhánh là sự thật; chia theo bộ phận sẽ
                   phải bịa ra hai số. Đã ghi vào báo cáo bàn giao.
              */}
              {chiNhanh.some((b) => b.phone !== null) && (
                <div className={css.boPhan}>
                  <h2>Gọi trực tiếp showroom</h2>
                  <ul>
                    {chiNhanh.filter((b) => b.phone !== null).map((b) => (
                      <li key={b.id}>
                        <span className={css.ten}>
                          {b.name}
                          {b.address !== null && <span>{b.address}</span>}
                        </span>
                        <a href={`tel:${b.phone}`}>{b.phone}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={css.kenh}>
                <h2>Trước khi gửi</h2>
                <ul>
                  <li>
                    <Icon ten="check" />
                    <div>
                      <strong>Thông tin chỉ dùng để tư vấn</strong>
                      <p>Không dùng cho mục đích khác, không chia sẻ cho bên thứ ba.</p>
                    </div>
                  </li>
                  <li>
                    <Icon ten="check" />
                    <div>
                      <strong>Có mã tham chiếu sau khi gửi</strong>
                      <p>Giữ mã đó để hỏi lại tình trạng yêu cầu.</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {chiNhanh.length > 0 && (
          <section className={css.showroom} aria-labelledby="showroom-tieu-de">
            <div className="container">
              <p className="nhan">{chiNhanh.length} địa điểm</p>
              <h2 id="showroom-tieu-de">Hệ thống showroom</h2>
              <ul className={css.dsShowroom}>
                {chiNhanh.map((b) => (
                  <li key={b.id} className={css.the}>
                    <Icon ten="map-pin" />
                    <div>
                      <h3>{b.name}</h3>
                      {b.address !== null && <p>{b.address}</p>}
                      {b.phone !== null && (
                        <p className={css.sdt}><a href={`tel:${b.phone}`}>{b.phone}</a></p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className={`${css.faq} man-giay`} aria-labelledby="faq-tieu-de">
          <div className="container">
            <h2 id="faq-tieu-de">Câu hỏi thường gặp</h2>
            <div className={css.dsFaq}>
              {FAQ.map(([hoi, dap]) => (
                <details key={hoi}>
                  <summary>{hoi}</summary>
                  <p>{dap}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/*
          Thanh dính đáy chỉ hiện trên điện thoại, và nó là *Gọi* chứ không phải
          *Gửi*: người ta mở trang Liên hệ trên điện thoại để gọi.
        */}
        {hotline !== null && (
          <div className={css.thanhGoi}>
            <a className="nut" href={`tel:${hotline}`}>
              <Icon ten="phone" />
              Gọi {hotline}
            </a>
          </div>
        )}
      </main>
      <SiteFooter site={site} />
    </>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<ThamSo>;
}): Promise<Metadata> {
  const site = await loadSite();
  const brand = site?.brandName ?? 'Showroom ô tô';
  const tham = await searchParams;

  return buildMetadata({
    site,
    title: buildPageTitle(tham['nhu-cau'] === 'lai-thu' ? 'Đăng ký lái thử' : 'Liên hệ', brand),
    description: `Gửi yêu cầu tư vấn hoặc gọi trực tiếp showroom ${brand}.`,
    path: '/lien-he',
    noindex: tham['nhu-cau'] !== undefined,
  });
}
