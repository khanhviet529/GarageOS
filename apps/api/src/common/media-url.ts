/**
 * URL công khai của một file media đã publish.
 *
 * 🔒 MỘT chỗ dựng URL cho cả API. Bản trước nằm private trong
 *    `PublicLandingService`, nên màn quản trị muốn hiện ảnh bìa phải chép lại —
 *    và hai bản ghép URL là hai cơ hội để một bản quên `PUBLIC_MEDIA_ORIGIN`
 *    rồi hiện ảnh vỡ ở đúng môi trường không ai mở.
 */
export function urlMediaCongKhai(storageKey: string): string {
  const origin = (process.env['PUBLIC_MEDIA_ORIGIN'] ?? 'http://localhost:3001/media')
    .replace(/\/+$/, '');
  return `${origin}/${storageKey}`;
}
