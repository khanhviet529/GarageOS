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
import { api, ApiCallError, type JobCard as TJobCard } from '../lib/api';
import { Loi, Trong } from '../lib/trang-thai';
import { useThongBao } from '../lib/thong-bao';
import { co, mau } from '../theme';

/**
 * Lịch sử việc đã xong của thợ — 30 ngày gần nhất.
 *
 * Vì sao 30 ngày:
 *   - 7 ngày quá ngắn: thợ vừa nghỉ cuối tuần mở app thứ Hai không thấy gì.
 *   - 90 ngày quá dài: danh sách dài, kéo mãi không đến đầu.
 *   - 30 ngày đúng một tháng — khớp với chu kỳ lương, và đủ để xem lại
 *     "tuần trước tôi làm gì" mà không cần tải lại.
 *
 * Vì sao nhóm theo ngày thay vì một danh sách phẳng:
 *   - Thợ tra cứu theo NGÀY ("Hôm qua tôi làm gì?", "Thứ Tư tuần trước"),
 *     không phải theo ID đơn. Nhóm theo ngày phù hợp câu hỏi thật.
 *
 * Vì sao chỉ hiện trạng thái đã đóng (DONE, QC_PASSED, CANCELLED):
 *   - Mục đích của màn này là xem LẠI, không phải xem tiếp. Việc đang chạy
 *     vẫn ở màn hôm nay.
 */

const SO_NGAY = 30;

const NHAN_NGAY: Record<string, string> = {
  SCHEDULED: 'Chờ làm',
  IN_PROGRESS: 'Đang làm',
  PAUSED: 'Tạm dừng',
  DONE: 'Đã xong',
  QC_PASSED: 'Đạt kiểm tra',
  QC_FAILED: 'Phải làm lại',
  CANCELLED: 'Đã huỷ',
};

/**
 * 🔒 MỘT cách tính ngày cho cả màn hình — giờ ĐỊA PHƯƠNG của điện thoại.
 *
 * ⚠️ Bản trước dùng hai cách khác nhau cho hai việc liên quan chặt với nhau:
 *
 *     homNay()     -> getFullYear/getMonth/getDate   (giờ máy)
 *     cachNNgay(n) -> toISOString().slice(0, 10)     (giờ UTC)
 *
 *    Ở Việt Nam (UTC+7) hai cách đó lệch nhau đúng một ngày trong khoảng
 *    00:00–07:00. Hậu quả đo được: thợ mở app lúc 2 giờ sáng thì nhãn "Hôm qua"
 *    gắn vào nhóm của ngày kia, và mốc bắt đầu 30 ngày lùi thêm một ngày.
 *
 *    Đây là lần thứ NĂM dự án dính bẫy múi giờ — bốn lần trước đã ghi ở
 *    `STATUS.md`. Khuôn chung của cả năm lần đều giống nhau: hai chỗ trong cùng
 *    một luồng hỏi "hôm nay là ngày nào" bằng hai cách khác nhau.
 *
 * 💡 Chọn giờ ĐỊA PHƯƠNG chứ không phải UTC: người thợ hỏi "hôm qua tôi làm
 *    gì", và "hôm qua" của họ là hôm qua ở chỗ họ đứng.
 */
function ngayDiaPhuong(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function homNay(): string {
  return ngayDiaPhuong(new Date());
}

function cachNNgay(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ngayDiaPhuong(d);
}

/** Định dạng tiêu đề nhóm: "Hôm nay", "Hôm qua", "Thứ Hai 5/8" */
function tieuDeNhom(ngay: string): string {
  const hom = homNay();
  if (ngay === hom) return 'Hôm nay';
  const qua = cachNNgay(1);
  if (ngay === qua) return 'Hôm qua';
  /*
   * `new Date('2026-08-11')` được ECMAScript quy định là 00:00 **UTC**, rồi
   * `getDay()`/`getDate()` lại đọc theo giờ máy — nên ở múi giờ âm nó lùi một
   * ngày. Tách sẵn từng phần thì ngày hiển thị đúng bằng ngày trong khoá nhóm,
   * ở mọi múi giờ.
   */
  const [nam, thang, ngayTrongThang] = ngay.split('-').map(Number);
  const d = new Date(nam!, thang! - 1, ngayTrongThang!);
  const thu = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][d.getDay()];
  return `${thu} ${d.getDate()}/${d.getMonth() + 1}`;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const DA_DONG = new Set(['DONE', 'QC_PASSED', 'CANCELLED']);

export function LichSu({ onQuayLai }: { onQuayLai: () => void }) {
  const [nhom, setNhom] = useState<Record<string, TJobCard[]> | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const thongBao = useThongBao();

  const tai = useCallback(async () => {
    setDangTai(true);
    try {
      const ds = await api.lichSu(cachNNgay(SO_NGAY - 1), homNay());
      const daDong = ds.filter((v) => DA_DONG.has(v.status));
      // Gom theo ngày kế hoạch bắt đầu
      const gom: Record<string, TJobCard[]> = {};
      for (const v of daDong) {
        /*
         * 🔒 Đổi mốc thời gian sang ngày ĐỊA PHƯƠNG, không cắt 10 ký tự đầu.
         *
         * `plannedStart` là chuỗi ISO ở múi UTC, nên `.slice(0, 10)` cho ra
         * ngày UTC. Việc xếp lúc 6 giờ sáng giờ Việt Nam là 23 giờ UTC hôm
         * trước — nó sẽ nhảy sang nhóm của ngày hôm trước, trong khi tiêu đề
         * nhóm lại so với `homNay()` tính theo giờ máy. Hai thước đo khác nhau
         * cho cùng một trục thời gian.
         */
        const ngay = ngayDiaPhuong(new Date(v.plannedStart));
        const dsNgay = gom[ngay];
        if (dsNgay === undefined) gom[ngay] = [v];
        else dsNgay.push(v);
      }
      setNhom(gom);
    } catch (e) {
      thongBao.loi(e instanceof ApiCallError ? e.api.message : 'Không tải được lịch sử');
    } finally {
      setDangTai(false);
    }
  }, [thongBao]);

  useEffect(() => {
    void tai();
  }, [tai]);

  // Sắp xếp ngày giảm dần (mới nhất trên)
  const dsNgay: string[] = nhom === null ? [] : Object.keys(nhom).sort((a, b) => b.localeCompare(a));
  const nhomHang: Record<string, TJobCard[]> = nhom ?? {};
  const tongCong = dsNgay.reduce((s, n) => s + (nhomHang[n]?.length ?? 0), 0);

  return (
    <View style={kieu.boc}>
      <View style={kieu.dau}>
        <Pressable
          style={kieu.nutQuayLai}
          onPress={onQuayLai}
          accessibilityRole="button"
          accessibilityLabel="Quay lại việc hôm nay"
        >
          <Text style={kieu.chuNutQuayLai}>‹ Hôm nay</Text>
        </Pressable>
        <Text style={kieu.tieuDe}>Lịch sử 30 ngày</Text>
      </View>

      {dangTai && nhom === null ? (
        <View style={kieu.giua}>
          <ActivityIndicator size="large" color={mau.chinh} />
        </View>
      ) : nhom === null ? (
        <Loi message="Không tải được lịch sử" onThuLai={() => void tai()} />
      ) : tongCong === 0 ? (
        <Trong
          title="30 ngày qua chưa có việc nào hoàn thành."
          moTa="Việc đang chạy hiện ở màn 'Hôm nay'. Lịch sử chỉ hiện việc đã đóng (đã xong, đạt kiểm tra, hoặc huỷ)."
        />
      ) : (
        <ScrollView
          contentContainerStyle={kieu.cuon}
          refreshControl={
            <RefreshControlWrap dangTai={dangTai} onTai={() => void tai()} />
          }
        >
          {dsNgay.map((ngay) => (
            <View key={ngay} style={kieu.khoiNgay}>
              <Text style={kieu.tieuDeNhom}>
                {tieuDeNhom(ngay)}
                <Text style={kieu.demNhom}> · {(nhomHang[ngay] ?? []).length} việc</Text>
              </Text>
              {(nhomHang[ngay] ?? []).map((v) => (
                <View key={v.id} style={kieu.the}>
                  <View style={kieu.hangTren}>
                    <Text style={kieu.bien}>{v.plateNumber}</Text>
                    <Text
                      style={[
                        kieu.nhan,
                        v.status === 'QC_PASSED' && kieu.nhanXanh,
                        v.status === 'CANCELLED' && kieu.nhanXam,
                      ]}
                    >
                      {NHAN_NGAY[v.status] ?? v.status}
                    </Text>
                  </View>
                  <Text style={kieu.viec}>{v.description}</Text>
                  <Text style={kieu.phu}>
                    {v.repairOrderCode} · {hhmm(v.plannedStart)}–{hhmm(v.plannedEnd)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** Bọc `RefreshControl` để truyền props rõ ràng cho điểm gọi. */
function RefreshControlWrap({
  dangTai,
  onTai,
}: {
  dangTai: boolean;
  onTai: () => void;
}) {
  return <RefreshControl refreshing={dangTai} onRefresh={onTai} />;
}

const kieu = StyleSheet.create({
  boc: { flex: 1, backgroundColor: mau.nen },
  dau: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: mau.chinh,
    paddingHorizontal: co.dem3,
    paddingVertical: co.dem3,
    gap: co.dem3,
  },
  nutQuayLai: {
    paddingHorizontal: co.dem3,
    paddingVertical: co.dem2,
    minHeight: co.vungBamToiThieu,
    justifyContent: 'center',
  },
  chuNutQuayLai: { color: '#fff', fontSize: co.chuThuong, fontWeight: '600' },
  tieuDe: { color: '#fff', fontSize: co.chuTo, fontWeight: '700', flex: 1 },
  cuon: { padding: co.dem3, gap: co.dem4, paddingBottom: co.dem5 },
  giua: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  khoiNgay: { gap: co.dem2 },
  tieuDeNhom: {
    fontSize: co.chuThuong,
    fontWeight: '700',
    color: mau.chu,
  },
  demNhom: { fontSize: co.chuNho, fontWeight: '400', color: mau.chuMo },
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
  nhan: {
    fontSize: co.chuNho,
    fontWeight: '600',
    color: mau.chuMo,
    backgroundColor: mau.nen,
    paddingHorizontal: co.dem2,
    paddingVertical: co.dem1,
    borderRadius: co.dem1,
    overflow: 'hidden',
  },
  nhanXanh: { color: mau.thanhCong, backgroundColor: '#e4f2ea' },
  nhanXam: { color: mau.chuMo, backgroundColor: mau.nen },
  viec: { fontSize: co.chuThuong, color: mau.chu, fontWeight: '600' },
  phu: { fontSize: co.chuNho, color: mau.chuMo },
});
