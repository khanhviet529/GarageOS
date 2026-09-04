import { PlugZap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/*
 * Trang cho một mục điều hướng mà máy chủ chưa có endpoint tương ứng.
 *
 * 🔒 KHÔNG để mục menu dẫn tới 404, và cũng KHÔNG dựng một giao diện giả lưu
 *    vào chỗ trống. Cả hai đều làm người dùng mất thời gian theo cách tệ hơn
 *    việc nói thẳng: 404 làm họ nghĩ hệ thống hỏng, còn form giả làm họ nhập
 *    xong rồi mất trắng dữ liệu.
 *
 * Trang này nói ba điều: màn dùng để làm gì, còn thiếu gì ở máy chủ, và trong
 * lúc chờ thì làm việc đó ở đâu.
 */
export function PendingEndpoint({
  moTa,
  can,
  tamThoi,
}: {
  moTa: string;
  can: string[];
  tamThoi?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Màn này chưa nối được với máy chủ</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-[13px] text-text-muted">{moTa}</p>

          <div className="flex gap-3 rounded-md bg-ink-2 p-3.5">
            <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <div className="min-w-0">
              <p className="text-xs text-text">Cần bổ sung ở API trước khi dựng tiếp</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {can.map((c) => (
                  <li key={c} className="numeric text-[11px] text-text-muted">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {tamThoi !== undefined && <div className="text-[13px] text-text-muted">{tamThoi}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
