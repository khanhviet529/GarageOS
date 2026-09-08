import type { Metadata } from 'next';
import { buildPageTitle } from '@garageos/domain';
import { LeadForm } from '@/components/lead-form';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Icon } from '@/components/ui/icon';
import css from '@/features/lien-he/lien-he.module.css';
import { noIndex } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';
import { loadFaq, loadLeadForm, loadSite } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * Câu hỏi và câu trả lời đến từ máy chủ (`faq_item` + `faq_placement`, migration
 * 0076), lọc theo bề mặt `CONTACT`.
 *
 * 🔒 Trước đây bốn câu này là một mảng HẰNG ngay trong file. Sửa một câu trả lời
 *    là một lần deploy — nên trên thực tế không ai sửa, và câu trả lời cứ cũ dần
 *    trong khi chính sách đổi. Đó là hình dạng quen thuộc của nội dung chết:
 *    không ai xoá nó, chỉ là không ai cập nhật được nó.
 *
 * Khối rỗng thì cả phần biến mất, không hiện tiêu đề trống — xem dưới.
 */

interface ThamSo { 'nhu-cau'?: string }

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<ThamSo>;
}): Promise<React.ReactElement> {
  const [site, faq, cauHinhForm] = await Promise.all([loadSite(), loadFaq('CONTACT'), loadLeadForm()]);
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
                cauHinh={cauHinhForm}
                nenGiay
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

        {/*
          Không có câu nào công bố thì KHÔNG hiện tiêu đề rỗng. Một mục "Câu hỏi
          thường gặp" trống nói với khách rằng trang bị hỏng; không có mục đó thì
          không nói gì cả, và không nói gì là đúng.
        */}
        {faq.length > 0 && (
          <section className={`${css.faq} man-giay`} aria-labelledby="faq-tieu-de">
            <div className="container">
              <h2 id="faq-tieu-de">Câu hỏi thường gặp</h2>
              <div className={css.dsFaq}>
                {faq.map((c) => (
                  <details key={c.id}>
                    <summary>{c.question}</summary>
                    <p>{c.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

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
