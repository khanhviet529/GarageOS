import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, ApiCallError, type GioCong, type JobCard as TJobCard } from '../lib/api';
import { BaoPhatSinh } from './BaoPhatSinh';
import { co, mau } from '../theme';

const NHAN_TRANG_THAI: Record<string, string> = {
  SCHEDULED: 'Chờ làm',
  IN_PROGRESS: 'Đang làm',
  PAUSED: 'Tạm dừng',
  DONE: 'Đã xong',
  QC_PASSED: 'Đạt kiểm tra',
  QC_FAILED: 'Phải làm lại',
  CANCELLED: 'Đã huỷ',
};

/** Lý do tạm dừng — khớp enum `pause_reason` ở migration 0030 */
const LY_DO_DUNG = [
  { ma: 'WAITING_PARTS', nhan: 'Chờ phụ tùng' },
  { ma: 'WAITING_APPROVAL', nhan: 'Chờ khách duyệt' },
  { ma: 'WAITING_EQUIPMENT', nhan: 'Chờ thiết bị' },
  { ma: 'SHIFT_END', nhan: 'Hết ca' },
  { ma: 'OTHER', nhan: 'Lý do khác' },
] as const;

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function homNay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function ManJobCard({
  tenNguoi,
  onDangXuat,
}: {
  tenNguoi: string;
  onDangXuat: () => void;
}) {
  const [viec, setViec] = useState<TJobCard[] | null>(null);
  const [gio, setGio] = useState<Record<string, GioCong>>({});
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  /** Việc đang mở bảng chọn lý do tạm dừng */
  const [chonLyDo, setChonLyDo] = useState<string | null>(null);
  /** Việc đang mở màn báo phát sinh — `null` = không mở */
  const [baoPhatSinh, setBaoPhatSinh] = useState<TJobCard | null>(null);

  const tai = useCallback(async () => {
    setDangTai(true);
    try {
      const ds = await api.lichHomNay(homNay());
      setViec(ds);
      setLoi(null);

      // Giờ công lấy song song — mỗi thẻ cần con số của riêng nó, và chờ tuần
      // tự N lời gọi làm màn hình đứng vài giây trên mạng 3G ở xưởng.
      const cap = await Promise.all(
        ds.map(async (v) => [v.id, await api.gioCong(v.id).catch(() => null)] as const),
      );
      const m: Record<string, GioCong> = {};
      for (const [id, g] of cap) if (g !== null) m[id] = g;
      setGio(m);
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không tải được lịch hôm nay');
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => {
    void tai();
  }, [tai]);

  async function batDau(id: string): Promise<void> {
    setLoi(null);
    try {
      await api.batDau(id);
      await tai();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không bấm giờ được');
    }
  }

  async function ketThuc(id: string, lyDo?: string): Promise<void> {
    setLoi(null);
    setChonLyDo(null);
    try {
      await api.ketThuc(id, lyDo);
      await tai();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không kết thúc được');
    }
  }

  if (baoPhatSinh !== null) {
    return (
      <BaoPhatSinh
        viec={baoPhatSinh}
        vehicleId={baoPhatSinh.vehicleId}
        // Các việc KHÁC của cùng chiếc xe — ứng viên bị chặn bởi phát sinh
        cacViecKhac={(viec ?? []).filter(
          (v) => v.id !== baoPhatSinh.id && v.vehicleId === baoPhatSinh.vehicleId,
        )}
        onXong={() => {
          setBaoPhatSinh(null);
          void tai();
        }}
        onHuy={() => setBaoPhatSinh(null)}
      />
    );
  }

  return (
    <View style={kieu.boc}>
      <View style={kieu.dau}>
        <View style={{ flex: 1 }}>
          <Text style={kieu.tenApp}>Việc hôm nay</Text>
          <Text style={kieu.tenNguoi}>{tenNguoi}</Text>
        </View>
        <Pressable style={kieu.nutPhu} onPress={onDangXuat} accessibilityRole="button">
          <Text style={kieu.chuNutPhu}>Đăng xuất</Text>
        </Pressable>
      </View>

      {loi !== null && (
        <View style={kieu.hopLoi} accessibilityRole="alert">
          <Text style={kieu.chuLoi}>{loi}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={kieu.cuon}
        refreshControl={<RefreshControl refreshing={dangTai} onRefresh={() => void tai()} />}
      >
        {viec === null ? (
          <ActivityIndicator size="large" color={mau.chinh} style={{ marginTop: co.dem5 }} />
        ) : viec.length === 0 ? (
          <View style={kieu.trong}>
            <Text style={kieu.chuTrong}>Hôm nay chưa có việc nào được giao cho bạn.</Text>
          </View>
        ) : (
          viec.map((v) => {
            const g = gio[v.id];
            const dangLam = v.status === 'IN_PROGRESS';
            return (
              <View key={v.id} style={kieu.the}>
                <View style={kieu.hangTren}>
                  <Text style={kieu.bien}>{v.plateNumber}</Text>
                  <Text style={[kieu.nhanTrangThai, dangLam && kieu.nhanDangLam]}>
                    {NHAN_TRANG_THAI[v.status] ?? v.status}
                  </Text>
                </View>

                <Text style={kieu.viec}>{v.description}</Text>
                <Text style={kieu.phu}>
                  {v.repairOrderCode} · {v.bayName} · {hhmm(v.plannedStart)}–
                  {hhmm(v.plannedEnd)}
                </Text>

                {g !== undefined && (
                  <Text style={kieu.phu}>
                    Đã làm {g.actualHours}h / định mức {g.standardHours}h
                    {/* Đoạn bị job đóng hộ thì nói rõ — con số đó không đáng
                        tin để tính lương, và thợ cần biết để báo lại */}
                    {g.coDoanDongHo ? ' · có đoạn hệ thống đóng hộ' : ''}
                  </Text>
                )}

                {chonLyDo === v.id ? (
                  <View style={kieu.khungLyDo}>
                    <Text style={kieu.nhanLyDo}>Tạm dừng vì</Text>
                    {LY_DO_DUNG.map((l) => (
                      <Pressable
                        key={l.ma}
                        style={kieu.nutLyDo}
                        onPress={() => void ketThuc(v.id, l.ma)}
                        accessibilityRole="button"
                      >
                        <Text style={kieu.chuLyDo}>{l.nhan}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      style={kieu.nutLyDo}
                      onPress={() => setChonLyDo(null)}
                      accessibilityRole="button"
                    >
                      <Text style={[kieu.chuLyDo, { color: mau.chuMo }]}>Bỏ qua</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={kieu.hangNut}>
                    {(v.status === 'SCHEDULED' || v.status === 'PAUSED') && (
                      <Pressable
                        style={kieu.nut}
                        onPress={() => void batDau(v.id)}
                        accessibilityRole="button"
                      >
                        <Text style={kieu.chuNut}>Bắt đầu</Text>
                      </Pressable>
                    )}
                    {dangLam && (
                      <>
                        <Pressable
                          style={kieu.nut}
                          onPress={() => void ketThuc(v.id)}
                          accessibilityRole="button"
                        >
                          <Text style={kieu.chuNut}>Hoàn thành</Text>
                        </Pressable>
                        <Pressable
                          style={[kieu.nut, kieu.nutXam]}
                          onPress={() => setChonLyDo(v.id)}
                          accessibilityRole="button"
                        >
                          <Text style={[kieu.chuNut, { color: mau.chu }]}>Tạm dừng</Text>
                        </Pressable>
                      </>
                    )}
                    {/*
                      Báo phát sinh mở được ở MỌI trạng thái còn sống, không
                      chỉ khi đang làm: thợ hay phát hiện vấn đề lúc vừa mở
                      nắp capo, trước khi kịp bấm bắt đầu.
                    */}
                    {v.status !== 'CANCELLED' && v.status !== 'QC_PASSED' && (
                      <Pressable
                        style={[kieu.nut, kieu.nutXam]}
                        onPress={() => setBaoPhatSinh(v)}
                        accessibilityRole="button"
                      >
                        <Text style={[kieu.chuNut, { color: mau.chu }]}>Báo phát sinh</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const kieu = StyleSheet.create({
  boc: { flex: 1, backgroundColor: mau.nen },
  dau: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: mau.chinh,
    paddingHorizontal: co.dem4,
    paddingVertical: co.dem3,
    gap: co.dem3,
  },
  tenApp: { color: '#fff', fontSize: co.chuTo, fontWeight: '700' },
  tenNguoi: { color: '#cfe0f2', fontSize: co.chuNho },
  nutPhu: {
    borderWidth: 1,
    borderColor: '#cfe0f2',
    borderRadius: co.bo,
    paddingHorizontal: co.dem3,
    minHeight: co.vungBamToiThieu,
    justifyContent: 'center',
  },
  chuNutPhu: { color: '#fff', fontSize: co.chuNho, fontWeight: '600' },
  cuon: { padding: co.dem3, gap: co.dem3, paddingBottom: co.dem5 },
  the: {
    backgroundColor: mau.the,
    borderRadius: co.bo,
    borderWidth: 1,
    borderColor: mau.vien,
    padding: co.dem4,
    gap: co.dem2,
  },
  hangTren: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bien: { fontSize: co.chuTieuDe, fontWeight: '700', color: mau.chu, letterSpacing: 0.5 },
  nhanTrangThai: {
    fontSize: co.chuNho,
    fontWeight: '600',
    color: mau.chuMo,
    backgroundColor: mau.nen,
    paddingHorizontal: co.dem2,
    paddingVertical: co.dem1,
    borderRadius: co.dem1,
    overflow: 'hidden',
  },
  nhanDangLam: { color: mau.canhBao, backgroundColor: mau.canhBaoNhat },
  viec: { fontSize: co.chuThuong, color: mau.chu, fontWeight: '600' },
  phu: { fontSize: co.chuNho, color: mau.chuMo },
  hangNut: { flexDirection: 'row', gap: co.dem2, marginTop: co.dem2, flexWrap: 'wrap' },
  nut: {
    backgroundColor: mau.chinh,
    borderRadius: co.bo,
    minHeight: co.vungBamToiThieu,
    paddingHorizontal: co.dem4,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  nutXam: { backgroundColor: mau.nen, borderWidth: 1, borderColor: mau.vien },
  chuNut: { color: '#fff', fontSize: co.chuThuong, fontWeight: '600' },
  khungLyDo: { gap: co.dem2, marginTop: co.dem2 },
  nhanLyDo: { fontSize: co.chuNho, fontWeight: '600', color: mau.chuMo },
  nutLyDo: {
    borderWidth: 1,
    borderColor: mau.vien,
    borderRadius: co.bo,
    minHeight: co.vungBamToiThieu,
    justifyContent: 'center',
    paddingHorizontal: co.dem3,
    backgroundColor: mau.the,
  },
  chuLyDo: { fontSize: co.chuThuong, color: mau.chu },
  trong: { padding: co.dem5, alignItems: 'center' },
  chuTrong: { fontSize: co.chuThuong, color: mau.chuMo, textAlign: 'center' },
  hopLoi: {
    backgroundColor: mau.loiNhat,
    borderColor: mau.loi,
    borderWidth: 1,
    margin: co.dem3,
    borderRadius: co.bo,
    padding: co.dem3,
  },
  chuLoi: { color: mau.loi, fontSize: co.chuNho },
});
