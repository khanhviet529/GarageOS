import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { co, mau } from '../theme';

/**
 * Ba trạng thái rỗng của một màn hình — gom lại một chỗ để mọi nơi nói cùng
 * một câu và cùng một phong cách.
 *
 * Quy ước dùng:
 *  - `Loi`         mạng hỏng / API lỗi, cần nút "Thử lại" nếu có cách gọi lại
 *  - `Trong`       truy vấn trả về rỗng (không phải lỗi — danh sách có thể thật
 *                  sự rỗng), không có nút "Thử lại"
 *  - `KhungDangTai` chờ dữ liệu < 1 giây; chờ lâu hơn thì tự lặp lại để
 *                  người dùng không tưởng app đứng
 *
 * Vì sao KHÔNG có skeleton xám chạy ngang như web:
 *  - App thợ chỉ có 3 màn hình, danh sách thường chỉ 5–10 dòng. Một spinner
 *    đủ nói "đang chờ" và không gây khó chịu.
 *  - Skeleton ở màn 375×667 chỉ hiển thị được 2–3 khung, lợi ích thẩm mỹ
 *    không bù được chi phí viết animation. Nếu sau này có màn danh sách dài
 *    (lịch sử giờ công — Phase D), sẽ thêm skeleton riêng cho màn đó.
 */

export function Loi({
  message,
  onThuLai,
}: {
  message: string;
  onThuLai?: () => void;
}) {
  return (
    <View style={kieu.hopLoi} accessibilityRole="alert">
      <Text style={kieu.chuLoi}>{message}</Text>
      {onThuLai !== undefined && (
        <Pressable
          style={kieu.nutThuLai}
          onPress={onThuLai}
          accessibilityRole="button"
        >
          <Text style={kieu.chuNutThuLai}>Thử lại</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Trong({
  title,
  moTa,
  hanhDong,
}: {
  title: string;
  moTa?: string;
  hanhDong?: ReactNode;
}) {
  return (
    <View style={kieu.trong} accessibilityLiveRegion="polite">
      <Text style={kieu.chuTrong}>{title}</Text>
      {moTa !== undefined && <Text style={kieu.chuTrongMoTa}>{moTa}</Text>}
      {hanhDong !== undefined && <View style={kieu.hanhDongTrong}>{hanhDong}</View>}
    </View>
  );
}

export function KhungDangTai({ children }: { children?: ReactNode }) {
  return (
    <View style={kieu.dangTai} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={mau.chinh} />
      {children}
    </View>
  );
}

const kieu = StyleSheet.create({
  hopLoi: {
    backgroundColor: mau.loiNhat,
    borderColor: mau.loi,
    borderWidth: 1,
    borderRadius: co.bo,
    padding: co.dem3,
    gap: co.dem2,
  },
  chuLoi: {
    color: mau.loi,
    fontSize: co.chuThuong,
    lineHeight: 1.45,
  },
  nutThuLai: {
    alignSelf: 'flex-start',
    backgroundColor: mau.loi,
    borderRadius: co.bo,
    paddingHorizontal: co.dem4,
    paddingVertical: co.dem2,
    minHeight: co.vungBamToiThieu,
    justifyContent: 'center',
  },
  chuNutThuLai: {
    color: '#fff',
    fontSize: co.chuThuong,
    fontWeight: '600',
  },
  trong: {
    padding: co.dem5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: co.dem2,
  },
  chuTrong: {
    color: mau.chuMo,
    fontSize: co.chuThuong,
    fontWeight: '600',
    textAlign: 'center',
  },
  chuTrongMoTa: {
    color: mau.chuMo,
    fontSize: co.chuNho,
    textAlign: 'center',
    maxWidth: 320,
  },
  hanhDongTrong: {
    marginTop: co.dem3,
    alignItems: 'center',
  },
  dangTai: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: co.dem5,
    gap: co.dem3,
  },
});
