import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { co, mau } from '../theme';

/**
 * Thông báo nổi — phiên bản React Native của Toast ở web.
 *
 * Vì sao dùng Animated chứ không dùng thư viện:
 *   - App thợ chỉ cần đúng một dạng thông báo. Thêm react-native-toast-message
 *     hay react-native-paper vào để hiện một dòng chữ là đánh đổi 50–200kB
 *     native binding.
 *   - `Animated` có sẵn, không cần native module.
 *
 * Vì sao KHÔNG dùng `Modal`:
 *   - Modal chặn tương tác với phần còn lại — đúng cho hộp thoại xác nhận,
 *     sai cho phản hồi nhanh.
 *
 * Cú pháp giống web: `<ThongBao.Provider>{children}</ThongBao.Provider>` ở
 * gốc, `useThongBao()` ở component con. Hiện tại chưa gắn Provider ở App
 * — sẽ thêm khi F.4 refactor xong.
 */

type ThongBaoKieu = 'thanh-cong' | 'loi';

interface ThongBao {
  id: string;
  kieu: ThongBaoKieu;
  noiDung: string;
  /** Thời gian hiển thị (ms). Mặc định thành công 3s, lỗi 6s. */
  thoiLuong: number;
}

interface ThongBaoContextValue {
  show: (t: { kieu: ThongBaoKieu; noiDung: string; thoiLuong?: number }) => void;
  thanhCong: (noiDung: string) => void;
  loi: (noiDung: string) => void;
}

const Ctx = createContext<ThongBaoContextValue | null>(null);

export function useThongBao(): ThongBaoContextValue {
  const v = useContext(Ctx);
  if (v === null) {
    throw new Error('useThongBao phải được dùng bên trong <ThongBao.Provider>');
  }
  return v;
}

let demId = 0;
const idMoi = (): string => `tb-${++demId}`;

export function ThongBaoProvider({ children }: { children: ReactNode }) {
  const [ds, setDs] = useState<ThongBao[]>([]);

  const xoa = useCallback((id: string) => {
    setDs((d) => d.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ThongBaoContextValue['show']>(
    (t) => {
      const id = idMoi();
      const thoiLuong = t.thoiLuong ?? (t.kieu === 'loi' ? 6000 : 3000);
      setDs((d) => [...d, { id, kieu: t.kieu, noiDung: t.noiDung, thoiLuong }]);
    },
    [],
  );

  const thanhCong = useCallback<ThongBaoContextValue['thanhCong']>(
    (noiDung) => show({ kieu: 'thanh-cong', noiDung }),
    [show],
  );

  const loi = useCallback<ThongBaoContextValue['loi']>(
    (noiDung) => show({ kieu: 'loi', noiDung }),
    [show],
  );

  return (
    <Ctx.Provider value={{ show, thanhCong, loi }}>
      {children}
      <View pointerEvents="box-none" style={kieu.stack}>
        {ds.map((t) => (
          <MotThongBao key={t.id} tb={t} xoa={xoa} />
        ))}
      </View>
    </Ctx.Provider>
  );
}

function MotThongBao({ tb, xoa }: { tb: ThongBao; xoa: (id: string) => void }) {
  const an = useRef(new Animated.Value(0)).current;
  // Ẩn tự động — trừ khi thợ đang chạm vào (dùng onTouchStart thay vì onHover
  // vì RN không có hover; giữ logic "ngừng đếm khi đang đọc" nhưng phát hiện
  // qua touch). Ở đây đơn giản: đếm đúng một lần, ai cần đọc lâu thì bấm đóng.
  useEffect(() => {
    Animated.timing(an, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const t = setTimeout(() => xoa(tb.id), tb.thoiLuong);
    return () => clearTimeout(t);
  }, [an, tb.id, tb.thoiLuong, xoa]);

  const dong = (): void => {
    Animated.timing(an, { toValue: 0, duration: 150, useNativeDriver: true }).start(() =>
      xoa(tb.id),
    );
  };

  const dich = an.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  const role = tb.kieu === 'loi' ? 'alert' : 'status';
  const bieuTuong = tb.kieu === 'loi' ? '!' : '✓';

  return (
    <Animated.View
      style={[
        kieu.hop,
        tb.kieu === 'thanh-cong' ? kieu.hopThanhCong : kieu.hopLoi,
        { opacity: an, transform: [{ translateY: dich }] },
      ]}
      accessibilityLiveRegion={role === 'alert' ? 'assertive' : 'polite'}
    >
      <View style={[kieu.bieuTuong, tb.kieu === 'thanh-cong' ? kieu.bieuThanhCong : kieu.bieuLoi]}>
        <Text
          style={[
            kieu.chuBieuTuong,
            tb.kieu === 'thanh-cong' ? kieu.chuBieuTuongThanhCong : kieu.chuBieuTuongLoi,
          ]}
        >
          {bieuTuong}
        </Text>
      </View>
      <Text
        style={[kieu.chu, tb.kieu === 'thanh-cong' ? kieu.chuThanhCong : kieu.chuLoi]}
        numberOfLines={3}
      >
        {tb.noiDung}
      </Text>
      <Pressable onPress={dong} hitSlop={12} accessibilityLabel="Đóng thông báo">
        <Text
          style={[kieu.dong, tb.kieu === 'thanh-cong' ? kieu.dongThanhCong : kieu.dongLoi]}
        >
          ×
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const kieu = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: co.dem3,
    right: co.dem3,
    bottom: co.dem3,
    gap: co.dem2,
  },
  hop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: co.dem2,
    paddingVertical: co.dem3,
    paddingHorizontal: co.dem4,
    borderRadius: co.bo,
    borderWidth: 1,
    minHeight: co.vungBamToiThieu,
    // Đổ bóng tối thiểu để nổi lên khỏi nội dung — Android và iOS đều hỗ trợ.
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  hopThanhCong: { backgroundColor: mau.thanhCong, borderColor: mau.thanhCong },
  hopLoi: { backgroundColor: mau.loiNhat, borderColor: mau.loi },
  bieuTuong: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  bieuThanhCong: { backgroundColor: '#fff' },
  bieuLoi: { backgroundColor: mau.loi },
  chuBieuTuong: { fontSize: co.chuThuong, fontWeight: '700' },
  chu: { flex: 1, fontSize: co.chuThuong, lineHeight: 1.4 },
  chuThanhCong: { color: '#fff' },
  chuLoi: { color: mau.loi },
  chuBieuTuongThanhCong: { color: mau.thanhCong },
  chuBieuTuongLoi: { color: '#fff' },
  dong: { fontSize: co.chuTieuDe, fontWeight: '600' },
  dongThanhCong: { color: 'rgba(255, 255, 255, 0.8)' },
  dongLoi: { color: mau.chuMo },
});
