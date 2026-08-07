import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DangNhap } from './man/DangNhap';
import { ManJobCard } from './man/JobCard';
import { phien, type NguoiDung } from './lib/api';
import { mau } from './theme';

export default function App() {
  const [nguoi, setNguoi] = useState<NguoiDung | null>(null);
  const [dangKhoiPhuc, setDangKhoiPhuc] = useState(true);

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
        {dangKhoiPhuc ? (
          <View style={kieu.giua}>
            <ActivityIndicator size="large" color={mau.chinh} />
          </View>
        ) : nguoi === null ? (
          <DangNhap onXong={setNguoi} />
        ) : (
          <ManJobCard
            tenNguoi={nguoi.fullName}
            onDangXuat={() => {
              void phien.xoa().then(() => setNguoi(null));
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const kieu = StyleSheet.create({
  boc: { flex: 1, backgroundColor: mau.nen },
  giua: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
