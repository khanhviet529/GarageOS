import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiCallError, type JobCard } from '../lib/api';
import { co, mau } from '../theme';

/**
 * Thợ báo phát sinh — BC-03 mục 4 bước 1–3.
 *
 * 🔒 BR-02-2: thợ ĐỀ XUẤT, cố vấn mới lập báo giá. Màn hình này không có ô nào
 * nhập giá, và danh mục lấy về đã bị API lược sạch tiền (`catalog:readPrice`).
 *
 * Phần khó nhất về mặt giao diện là bước 3: thợ phải chọn hạng mục nào BỊ CHẶN
 * bởi phát sinh. Không ai ngoài người đang cầm cờ-lê biết đĩa phanh vênh thì có
 * lắp được má phanh không — nên câu hỏi đặt bằng tiếng người, không phải bằng
 * thuật ngữ hệ thống.
 */
export function BaoPhatSinh({
  viec,
  vehicleId,
  cacViecKhac,
  onXong,
  onHuy,
}: {
  viec: JobCard;
  vehicleId: string;
  /** Các việc khác của cùng chiếc xe — ứng viên bị chặn */
  cacViecKhac: JobCard[];
  onXong: () => void;
  onHuy: () => void;
}) {
  const [dsHangMuc, setDsHangMuc] = useState<{ id: string; name: string }[] | null>(null);
  const [hangMucId, setHangMucId] = useState('');
  const [moTa, setMoTa] = useState('');
  const [chan, setChan] = useState<string[]>([viec.id]);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    api
      .danhMuc(vehicleId)
      .then((c) => setDsHangMuc(c.serviceItems.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => setDsHangMuc([]));
  }, [vehicleId]);

  async function gui(): Promise<void> {
    setLoi(null);
    setDangGui(true);
    try {
      await api.baoPhatSinh({
        repairOrderId: viec.repairOrderId,
        serviceItemId: hangMucId,
        foundInAssignmentId: viec.id,
        description: moTa.trim(),
        blocksAssignmentIds: chan,
      });
      onXong();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không gửi được báo phát sinh');
    } finally {
      setDangGui(false);
    }
  }

  const doiChan = (id: string): void =>
    setChan((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <ScrollView contentContainerStyle={kieu.cuon} keyboardShouldPersistTaps="handled">
      <Text style={kieu.tieuDe}>Báo phát sinh</Text>
      <Text style={kieu.phu}>
        {viec.plateNumber} · {viec.description}
      </Text>

      {loi !== null && (
        <View style={kieu.hopLoi} accessibilityRole="alert">
          <Text style={kieu.chuLoi}>{loi}</Text>
        </View>
      )}

      <Text style={kieu.nhan}>Cần làm thêm gì</Text>
      {dsHangMuc === null ? (
        <ActivityIndicator color={mau.chinh} />
      ) : (
        <View style={kieu.dsChon}>
          {dsHangMuc.map((h) => (
            <Pressable
              key={h.id}
              style={[kieu.oChon, hangMucId === h.id && kieu.oChonDaChon]}
              onPress={() => setHangMucId(h.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: hangMucId === h.id }}
            >
              <Text style={kieu.chuChon}>{h.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={kieu.nhan}>Mô tả cho cố vấn</Text>
      <TextInput
        style={[kieu.o, kieu.oNhieuDong]}
        value={moTa}
        onChangeText={setMoTa}
        multiline
        numberOfLines={3}
        accessibilityLabel="Mô tả phát sinh"
        placeholder="Ví dụ: đĩa phanh trước vênh và mòn quá giới hạn"
        placeholderTextColor={mau.chuMo}
      />

      {/*
        🔒 BR-07-5 — phát sinh chỉ dừng hạng mục PHỤ THUỘC.
        Câu hỏi đặt bằng tiếng người: "việc nào KHÔNG làm tiếp được".
        Mặc định tích sẵn chính việc đang làm, vì đó là trường hợp thường gặp
        nhất — nhưng thợ bỏ tích được, và những việc khác thì KHÔNG tự tích.
      */}
      <Text style={kieu.nhan}>Việc nào không làm tiếp được cho tới khi khách trả lời?</Text>
      <View style={kieu.dsChon}>
        {[viec, ...cacViecKhac].map((v) => (
          <Pressable
            key={v.id}
            style={[kieu.oChon, chan.includes(v.id) && kieu.oChonDaChon]}
            onPress={() => doiChan(v.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: chan.includes(v.id) }}
          >
            <Text style={kieu.chuChon}>
              {chan.includes(v.id) ? '☑ ' : '☐ '}
              {v.description}
              {v.id === viec.id ? ' (đang làm)' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={kieu.ghiChu}>
        Việc không tích vẫn chạy bình thường — cả xưởng không phải dừng vì một phát sinh.
      </Text>

      <View style={kieu.hangNut}>
        <Pressable
          style={[kieu.nut, (dangGui || hangMucId === '' || moTa.trim().length < 10) && kieu.nutTat]}
          onPress={() => void gui()}
          disabled={dangGui || hangMucId === '' || moTa.trim().length < 10}
          accessibilityRole="button"
        >
          <Text style={kieu.chuNut}>{dangGui ? 'Đang gửi…' : 'Gửi cho cố vấn'}</Text>
        </Pressable>
        <Pressable style={[kieu.nut, kieu.nutXam]} onPress={onHuy} accessibilityRole="button">
          <Text style={[kieu.chuNut, { color: mau.chu }]}>Quay lại</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const kieu = StyleSheet.create({
  cuon: { padding: co.dem4, gap: co.dem2, paddingBottom: co.dem5 },
  tieuDe: { fontSize: co.chuTieuDe, fontWeight: '700', color: mau.chu },
  phu: { fontSize: co.chuNho, color: mau.chuMo, marginBottom: co.dem3 },
  nhan: {
    fontSize: co.chuNho,
    fontWeight: '600',
    color: mau.chuMo,
    marginTop: co.dem4,
    marginBottom: co.dem1,
  },
  ghiChu: { fontSize: co.chuNho, color: mau.chuMo, fontStyle: 'italic' },
  dsChon: { gap: co.dem2 },
  oChon: {
    borderWidth: 1,
    borderColor: mau.vien,
    borderRadius: co.bo,
    backgroundColor: mau.the,
    paddingHorizontal: co.dem3,
    minHeight: co.vungBamToiThieu,
    justifyContent: 'center',
  },
  // Không dùng riêng màu để báo "đã chọn": ô đã chọn có cả viền đậm lẫn nền
  // khác, và ký hiệu ☑ nằm ngay trong chữ.
  oChonDaChon: { borderColor: mau.chinh, borderWidth: 2, backgroundColor: mau.chinhNhat },
  chuChon: { fontSize: co.chuThuong, color: mau.chu },
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
  oNhieuDong: { minHeight: 96, textAlignVertical: 'top' },
  hangNut: { flexDirection: 'row', gap: co.dem2, marginTop: co.dem5 },
  nut: {
    backgroundColor: mau.chinh,
    borderRadius: co.bo,
    minHeight: co.vungBamToiThieu,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  nutXam: { backgroundColor: mau.nen, borderWidth: 1, borderColor: mau.vien },
  nutTat: { backgroundColor: mau.chuMo },
  chuNut: { color: '#fff', fontSize: co.chuThuong, fontWeight: '600' },
  hopLoi: {
    backgroundColor: mau.loiNhat,
    borderColor: mau.loi,
    borderWidth: 1,
    borderRadius: co.bo,
    padding: co.dem3,
  },
  chuLoi: { color: mau.loi, fontSize: co.chuNho },
});
