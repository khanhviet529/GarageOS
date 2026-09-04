import { loadSite } from '@/lib/site';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { LeadForm } from '@/components/lead-form';
import { noIndex } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function ContactPage(): Promise<React.ReactElement> {
  const site = await loadSite();

  return (
    <>
      <SiteHeader site={site} />
      {noIndex() && <meta name="robots" content="noindex,nofollow" />}
      <main className="container contact-layout" id="main" tabIndex={-1}>
        <section className="contact-intro">
          <p className="eyebrow">Đặt lịch theo thời gian của bạn</p>
          <h1>Gặp chiếc xe phù hợp, theo cách thoải mái hơn.</h1>
          <p>Để lại nhu cầu; tư vấn viên sẽ liên hệ xác nhận lịch lái thử hoặc gửi thông tin chi tiết. Không có cam kết mua xe.</p>
          {site !== null && site.publicBranches.length > 0 && (
          <section aria-label="Danh sách chi nhánh">
            {/*
              Dấu gạch ngang là dấu phân cách GIỮA hai phần, nên nó chỉ xuất hiện
              khi có phần đứng trước nó.

              ⚠️ Bản trước đặt " — " trước cả địa chỉ. Nhưng tên chi nhánh là
                 `<strong>` với `display: block`, tức nó nằm trên dòng riêng — nên
                 địa chỉ MỞ ĐẦU bằng một gạch ngang không phân cách gì cả. Dấu đó
                 chỉ đúng khi tên và địa chỉ nằm cùng một dòng.
            */}
            <ul className="branch-list">
              {site.publicBranches.map((b) => (
                <li key={b.id}>
                  <strong>{b.name}</strong>
                  {b.address !== null && <>{b.address}</>}
                  {b.phone !== null && (
                    <>
                      {b.address !== null && ' — '}
                      <a href={`tel:${b.phone}`}>{b.phone}</a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        </section>
        <aside className="contact-aside"><LeadForm site={site} /></aside>
      </main>
      <SiteFooter site={site} />
    </>
  );
}
