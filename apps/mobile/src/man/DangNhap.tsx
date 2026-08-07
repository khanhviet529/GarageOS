import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiCallError, phien, type NguoiDung } from '../lib/api';
import { co, mau } from '../theme';

export function DangNhap({ onXong }: { onXong: (nguoi: NguoiDung) => void }) {
  const [sdt, setSdt] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  async function gui(): Promise<void> {
    setLoi(null);
    setDangGui(true);
    try {
      const r = await api.dangNhap(sdt.trim(), matKhau);

      /*
       * 🔒 Chặn vai không phải thợ NGAY ở đây.
       *
       * Không phải vì bảo mật — API đã chặn từng endpoint rồi. Mà vì app này
       * chỉ có màn hình cho thợ: một cố vấn đăng nhập vào sẽ thấy một giao
       * diện trống rỗng và tưởng hệ thống hỏng. Nói rõ ngay còn hơn để họ đoán.
       */
      if (!r.user.roles.includes('TECHNICIAN')) {
        await phien.xoa();
        setLoi('Ứng dụng này dành cho kỹ thuật viên. Vai khác dùng bản web.');
        return;
      }

      await phien.luu(r.accessToken, r.user);
      onXong(r.user);
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không đăng nhập được');
    } finally {
      setDangGui(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={kieu.boc}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={kieu.cuon} keyboardShouldPersistTaps="handled">
        <Text style={kieu.tieuDe}>GarageOS</Text>
        <Text style={kieu.phu}>Ứng dụng kỹ thuật viên</Text>

        {loi !== null && (
          <View style={kieu.hopLoi} accessibilityRole="alert">
            <Text style={kieu.chuLoi}>{loi}</Text>
          </View>
        )}

        <Text style={kieu.nhan}>Số điện thoại</Text>
        <TextInput
          style={kieu.o}
          value={sdt}
          onChangeText={setSdt}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoComplete="tel"
          accessibilityLabel="Số điện thoại"
          placeholder="09xxxxxxxx"
          placeholderTextColor={mau.chuMo}
        />

        <Text style={kieu.nhan}>Mật khẩu</Text>
        <TextInput
          style={kieu.o}
          value={matKhau}
          onChangeText={setMatKhau}
          secureTextEntry
          accessibilityLabel="Mật khẩu"
          onSubmitEditing={() => void gui()}
        />

        <Pressable
          style={({ pressed }) => [kieu.nut, pressed && kieu.nutBam, dangGui && kieu.nutTat]}
          onPress={() => void gui()}
          disabled={dangGui}
          accessibilityRole="button"
        >
          {dangGui ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={kieu.chuNut}>Đăng nhập</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const kieu = StyleSheet.create({
  boc: { flex: 1, backgroundColor: mau.nen },
  cuon: { padding: co.dem5, justifyContent: 'center', flexGrow: 1 },
  tieuDe: { fontSize: 32, fontWeight: '700', color: mau.chinh, textAlign: 'center' },
  phu: {
    fontSize: co.chuThuong,
    color: mau.chuMo,
    textAlign: 'center',
    marginBottom: co.dem5,
  },
  nhan: {
    fontSize: co.chuNho,
    fontWeight: '600',
    color: mau.chuMo,
    marginBottom: co.dem1,
    marginTop: co.dem3,
  },
  o: {
    backgroundColor: mau.the,
    borderWidth: 1,
    borderColor: mau.vien,
    borderRadius: co.bo,
    padding: co.dem3,
    fontSize: co.chuThuong,
    color: mau.chu,
    minHeight: co.vungBamToiThieu,
  },
  nut: {
    backgroundColor: mau.chinh,
    borderRadius: co.bo,
    minHeight: co.vungBamToiThieu,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: co.dem5,
  },
  nutBam: { opacity: 0.85 },
  // Không dùng opacity cho trạng thái tắt: nó kéo cả chữ xuống dưới ngưỡng
  // tương phản. Cùng lập luận đã áp cho web ở đợt giao diện.
  nutTat: { backgroundColor: mau.chuMo },
  chuNut: { color: '#fff', fontSize: co.chuTo, fontWeight: '600' },
  hopLoi: {
    backgroundColor: mau.loiNhat,
    borderColor: mau.loi,
    borderWidth: 1,
    borderRadius: co.bo,
    padding: co.dem3,
    marginBottom: co.dem3,
  },
  chuLoi: { color: mau.loi, fontSize: co.chuNho },
});
