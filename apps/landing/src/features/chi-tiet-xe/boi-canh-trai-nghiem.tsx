'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { ExperienceSelection } from '@garageos/contracts';

/**
 * Ngữ cảnh trải nghiệm 360° — P1-LND-016.
 *
 * 🔒 Khi khách kích hoạt viewer, biểu mẫu lead phải gửi kèm `revision` và
 *    `contentHash` của đúng trải nghiệm đó; máy chủ xác minh lại trong published
 *    snapshot. Hai khối này nằm ở HAI MÀN KHÁC NHAU của trang chi tiết (nội thất
 *    ở màn 4, đăng ký ở màn 6), nên trạng thái phải nâng lên trên cả hai thay vì
 *    sống trong một component bọc chung — bọc chung nghĩa là ép hai màn dính vào
 *    nhau, tức phá cấu trúc màn hình.
 */
const BoiCanh = createContext<{
  chon: ExperienceSelection | null;
  datChon: (c: ExperienceSelection) => void;
}>({ chon: null, datChon: () => {} });

export function TrongTrangXe({ children }: { children: React.ReactNode }): React.ReactElement {
  const [chon, datChon] = useState<ExperienceSelection | null>(null);
  const giaTri = useMemo(() => ({ chon, datChon }), [chon]);
  return <BoiCanh.Provider value={giaTri}>{children}</BoiCanh.Provider>;
}

export function useTrangXe(): { chon: ExperienceSelection | null; datChon: (c: ExperienceSelection) => void } {
  return useContext(BoiCanh);
}
