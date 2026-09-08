import type { RichTextDocumentV1 } from '@garageos/contracts';

/**
 * Render nội dung bài viết.
 *
 * 🔒 KHÔNG có `dangerouslySetInnerHTML` ở đây, và đó là nửa còn lại của
 *    `INV-LS-10`. Nửa thứ nhất là Zod từ chối mọi khối ngoài danh sách trước
 *    khi jsonb chạm database; nửa thứ hai là chỗ đọc chỉ biết dựng phần tử React
 *    từ những khối đã biết tên. Kể cả khi một chuỗi HTML lọt được vào database
 *    bằng đường nào khác, nó ra đây vẫn chỉ là chữ.
 *
 * Hàm này duyệt CẠN theo đúng hình dạng schema thay vì đệ quy tổng quát: schema
 * chỉ sâu ba tầng (khối → mục danh sách → đoạn → chữ), và viết thẳng ra thì
 * TypeScript kiểm được từng nhánh. Một hàm đệ quy `any` sẽ biên dịch được cho cả
 * những khối chưa từng tồn tại.
 */
type Doan = Extract<RichTextDocumentV1['content'][number], { type: 'paragraph' }>;
/** Mảng nút chữ của một đoạn. `undefined` = đoạn rỗng, hợp lệ theo schema. */
type NoiDungChu = Doan['content'];

function Chu({ content }: { content: NoiDungChu }): React.ReactElement {
  return (
    <>
      {(content ?? []).map((n, i) => {
        if (n.type === 'hardBreak') return <br key={i} />;
        const marks = n.marks ?? [];
        const lienKet = marks.find((m) => m.type === 'link');
        let node: React.ReactNode = n.text;
        if (marks.some((m) => m.type === 'bold')) node = <strong>{node}</strong>;
        if (marks.some((m) => m.type === 'italic')) node = <em>{node}</em>;
        if (lienKet !== undefined && lienKet.type === 'link') {
          /*
           * `rel="nofollow ugc"` cho mọi liên kết trong thân bài: biên tập viên
           * chèn link ra ngoài là chuyện bình thường, nhưng trang bán xe không
           * nên cho mượn uy tín tìm kiếm của mình theo mặc định.
           */
          node = (
            <a href={lienKet.attrs.href} rel="nofollow ugc noopener" target="_blank">
              {node}
            </a>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

export function VanBanGiau({ doc }: { doc: RichTextDocumentV1 }): React.ReactElement {
  return (
    <>
      {doc.content.map((khoi, i) => {
        switch (khoi.type) {
          case 'paragraph':
            return (
              <p key={i}>
                <Chu content={khoi.content} />
              </p>
            );
          case 'heading':
            return khoi.attrs.level === 2 ? (
              <h2 key={i}>
                <Chu content={khoi.content} />
              </h2>
            ) : (
              <h3 key={i}>
                <Chu content={khoi.content} />
              </h3>
            );
          case 'blockquote':
            return (
              <blockquote key={i}>
                {khoi.content.map((p, j) => (
                  <p key={j}>
                    <Chu content={p.content} />
                  </p>
                ))}
              </blockquote>
            );
          case 'bulletList':
            return (
              <ul key={i}>
                {khoi.content.map((li, j) => (
                  <li key={j}>
                    {li.content.map((p, k) => (
                      <p key={k}>
                        <Chu content={p.content} />
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            );
          case 'orderedList':
            return (
              <ol key={i}>
                {khoi.content.map((li, j) => (
                  <li key={j}>
                    {li.content.map((p, k) => (
                      <p key={k}>
                        <Chu content={p.content} />
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            );
        }
      })}
    </>
  );
}
