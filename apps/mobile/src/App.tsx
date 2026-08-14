import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DangNhap } from './man/DangNhap';
import { ManJobCard } from './man/JobCard';
import { LichSu } from './man/LichSu';
import { phien, type NguoiDung } from './lib/api';
import { ThongBaoProvider } from './lib/thong-bao';
import { mau } from './theme';

/**
 * Hai màn hình trong app — `homNay` là mặc định, `lichSu` là màn phụ.
 *
 * Vì sao state chứ không dùng react-navigation:
 *   - App chỉ có 2 màn, cả hai đều cùng vai (TECHNICIAN), cùng dữ liệu phiên.
 *     Thêm react-navigation vào sẽ kéo theo react-native-screens, gesture-handler,
 *     và mất khoảng 200kB bundle — không tương xứng với một lần bấm nút.
 */
type ManHienTai = 'homNay' | 'lichSu';

export default function App() {
  const [nguoi, setNguoi] = useState<NguoiDung | null>(null);
  const [dangKhoiPhuc, setDangKhoiPhuc] = useState(true);
  const [manHienTai, setManHienTai] = useState<ManHienTai>('homNay');

  // Khôi phục phiên đã lưu: thợ mở app giữa ca không phải đăng nhập lại
  useEffect(() => {
    void phien.nguoiDung().then((n) => {
      setNguoi(n);
      setDangKhoiPhuc(false);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={mau.chinh} />
      <SafeAreaView style={kieu.boc} edges={['top', 'bottom']}>
        <ThongBaoProvider>
          {dangKhoiPhuc ? (
            <View style={kieu.giua}>
              <ActivityIndicator size="large" color={mau.chinh} />
            </View>
          ) : nguoi === null ? (
            <DangNhap onXong={setNguoi} />
          ) : manHienTai === 'homNay' ? (
            <ManJobCard
              tenNguoi={nguoi.fullName}
              onDangXuat={() => {
                void phien.xoa().then(() => setNguoi(null));
              }}
              onXemLichSu={() => setManHienTai('lichSu')}
            />
          ) : (
            <LichSu onQuayLai={() => setManHienTai('homNay')} />
          )}
        </ThongBaoProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const kieu = StyleSheet.create({
  boc: { flex: 1, backgroundColor: mau.nen },
  giua: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
