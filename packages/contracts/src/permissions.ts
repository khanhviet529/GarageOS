import type { Role } from './roles.js';

/**
 * 🔒 Ai được làm gì — `docs/02-actors-and-permissions.md` mục 3 (ma trận quyền).
 *
 * Vì sao bảng này tồn tại, viết ra để lần sau không ai gỡ nó đi:
 *
 * Trước bảng này, dự án có hàm `hasRole()` trong `actor.ts` mà **không nơi nào
 * gọi**, và kiểm tra vai chỉ được cài ở đúng MỘT endpoint (`changeStatus`, sau
 * codex-review GARAGEOS-REV-002). Kết quả đo được bằng thực nghiệm: một
 * `TECHNICIAN` đăng nhập rồi gọi thẳng API là tạo được khách hàng, tạo được xe,
 * tiếp nhận được đơn, lập được báo giá, và đẩy đơn qua hai bước máy trạng thái —
 * trong khi cùng người đó bị chặn 403 ở endpoint đổi trạng thái. Một cửa khoá,
 * năm cửa mở.
 *
 * Bài học: kiểm tra quyền rải rác theo từng service thì chỗ nào có người review
 * kỹ mới có. Khai báo tập trung thì thiếu sót nhìn thấy được.
 *
 * Đây là DANH SÁCH CHO PHÉP: vai không có tên thì không làm được. Thêm vai mới
 * mà quên khai báo sẽ bị chặn, chứ không phải được thả.
 */
export const ACTION_ROLES = {
  /** Tạo hồ sơ khách hàng — biển số và hồ sơ khách là khoá của toàn bộ lịch sử xe */
  'customer:create': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  'vehicle:create': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /** Tiếp nhận xe — docs/02 mục 3, hàng "Đơn sửa chữa / Tạo" */
  'repairOrder:create': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Tải ảnh hiện trạng lên — BC-01 bước 6.
   *
   * THỢ có quyền này, khác với `repairOrder:create`. Người đứng cạnh chiếc xe
   * lúc phát hiện một vết trầy là người thợ, không phải cố vấn dịch vụ ngồi ở
   * quầy — bắt họ đi tìm cố vấn để chụp hộ là cách chắc chắn khiến tấm ảnh đó
   * không bao giờ được chụp.
   *
   * Thu ngân và thủ kho KHÔNG có: họ không đứng ở khoang sửa chữa, và mọi quyền
   * ghi thừa đều là một đường vào thừa.
   */
  'repairOrder:photoWrite': [
    'SERVICE_ADVISOR',
    'BRANCH_MANAGER',
    'OWNER',
    'TECHNICIAN',
  ],

  /**
   * 🔒 ĐỌC đơn sửa chữa — danh sách xe trong xưởng và chi tiết đơn.
   *
   * Suốt Phase 1–4 quyền này không tồn tại: mọi vai đều là người của xưởng,
   * nên "đã đăng nhập" cộng với phạm vi chi nhánh là đủ. Nhánh landing bán xe
   * phá vỡ giả định đó — `MARKETING_EDITOR` và `SALES_ADVISOR` cũng đăng nhập
   * và cũng thuộc một chi nhánh, nên `branchScope()` không lọc họ ra.
   *
   * Bằng chứng: `LS-T13` trả `200` với **100 bản ghi** cho `MARKETING_EDITOR` —
   * biển số, khiếu nại của khách và trạng thái đơn của cả chi nhánh.
   *
   * Sáu vai dưới đây là toàn bộ vai vận hành xưởng. Thợ có mặt vì họ cần thấy
   * việc; phần TIỀN trong cùng phản hồi đã được lược riêng ở tầng khác
   * (`tho-khong-thay-tien.spec.ts`), đọc được đơn không có nghĩa là thấy giá.
   */
  'repairOrder:read': [
    'SERVICE_ADVISOR',
    'BRANCH_MANAGER',
    'OWNER',
    'TECHNICIAN',
    'STORE_KEEPER',
    'CASHIER',
  ],

  /** Lập và sửa báo giá — hàng "Báo giá / Lập-sửa (bản nháp)" */
  'quotation:write': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  /** Gửi báo giá cho khách — hàng "Báo giá / Gửi cho khách" */
  'quotation:send': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 ĐỌC báo giá — tức là thấy TIỀN.
   *
   * Tách khỏi `quotation:write` vì thu ngân phải thấy số tiền để thu, nhưng
   * không được lập báo giá. Và quan trọng hơn: THỢ không có quyền này.
   *
   * docs/02 mục 2.3 nói thẳng thợ "không được thấy bất kỳ số tiền nào". Trước
   * lát cắt 4.5, `QuotationService.getById` và `listForOrder` KHÔNG có kiểm tra
   * vai nào cả — một tài khoản thợ đọc được đơn giá từng dòng, tổng tiền, và
   * đơn giá giờ công của cả xưởng.
   *
   * Đây là đúng hình dạng lỗ hổng mà vòng rà soát Phase 1 đã ghi lại: kiểm tra
   * quyền rải rác theo từng phương thức thì chỗ nào không được review kỹ là chỗ
   * đó thiếu.
   */
  'quotation:read': ['SERVICE_ADVISOR', 'CASHIER', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Xem GIÁ BÁN trong danh mục — docs/02 ma trận, hàng "Xem giá bán".
   *
   * Thợ VẪN cần danh mục để báo phát sinh (chọn hạng mục đề xuất, BC-03 mục 4
   * bước 2), nên không chặn cả endpoint — chỉ lược bỏ các trường tiền. Chặn
   * hẳn sẽ làm hỏng luồng báo phát sinh trên app thợ.
   *
   * Thủ kho cũng ❌ ở đây: họ xem GIÁ VỐN (`stock:readCost`), không xem giá bán.
   */
  'catalog:readPrice': ['SERVICE_ADVISOR', 'CASHIER', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Áp chiết khấu vượt ngưỡng của tenant — PR-03.
   * Cố vấn áp được chiết khấu trong ngưỡng; vượt ngưỡng cần quản lý duyệt.
   */
  'quotation:discountOverThreshold': ['BRANCH_MANAGER', 'OWNER'],

  /*
   * Kho — docs/02 mục 3, nhóm hàng "Kho".
   *
   * Cố vấn dịch vụ KHÔNG có mặt ở đây, kể cả ở `stock:read`: ma trận cho cố vấn
   * dấu 👁 (xem tồn) chứ không phải ✅. Phase 2.1 chưa có endpoint chỉ-đọc-hạn-chế
   * nên để cố vấn ngoài; mở đúng lúc làm màn "kiểm tra còn hàng không" ở 2.2,
   * đi kèm test — chứ không mở sẵn.
   *
   * 🔒 `stock:readCost` tách riêng khỏi `stock:read` vì giá vốn là bí mật kinh
   * doanh: nó cho biết xưởng lãi bao nhiêu trên mỗi phụ tùng. docs/02 mục 2.4
   * cho thủ kho xem giá vốn, mục 2.3 cấm thợ thấy MỌI số tiền.
   */
  'stock:read': ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'],
  'stock:readCost': ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'],
  'stock:receive': ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Điều chỉnh tồn — KHÔNG cho thủ kho.
   *
   * Ma trận docs/02 để thủ kho ✅ ở "Kiểm kê" nhưng ❌ ở "Duyệt điều chỉnh >
   * ngưỡng", và mục 2.4 ghi rõ thủ kho không được "điều chỉnh tồn vượt ngưỡng
   * giá trị mà không có duyệt của quản lý".
   *
   * Điều chỉnh trực tiếp (khác với kiểm kê có quy trình ở 5.4) là đường duy
   * nhất để một dòng tồn đổi mà không có chứng từ mua bán nào — tức là đường
   * che một mất mát. Người đếm hàng và người duyệt chênh lệch phải là hai
   * người; ngưỡng giá trị sẽ thêm ở 5.4 cùng luồng kiểm kê.
   */
  'stock:adjust': ['BRANCH_MANAGER', 'OWNER'],

  /**
   * Xuất kho cho đơn và trả hàng về — docs/02 ma trận, hàng "Xuất kho" và
   * "Trả hàng về kho": thủ kho ✅, kèm điều kiện "đơn phải có báo giá duyệt".
   * Điều kiện đó enforce ở DB (INV-S-04, trigger ở 0029), không ở đây.
   */
  'stock:issue': ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'],

  /*
   * Phân công — docs/02 mục 3, nhóm "Phân công & thi công".
   *
   * Ma trận để cố vấn dịch vụ 🔶 "đề xuất" chứ không ✅ "xếp": xếp khoang và
   * thợ là quyết định điều phối, cần nhìn cả xưởng. Phase 2.3 chưa làm luồng
   * ĐỀ XUẤT riêng nên cố vấn đứng ngoài — mở khi có luồng đó, kèm test, chứ
   * không mở sẵn.
   */
  'assignment:read': ['TECHNICIAN', 'SERVICE_ADVISOR', 'STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'],
  'assignment:write': ['BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Kiểm tra chất lượng — KHÔNG cho thợ ở đây.
   *
   * Ma trận để thợ 🔶 "không phải người đã làm", tức là thợ khác được QC. Ràng
   * buộc "khác người" đã enforce ở DB (`qc_by_different_person`, 0028), nên
   * chỗ này chỉ cần chặn vai không liên quan. Thợ vẫn QC được cho nhau, và
   * database bảo đảm không ai tự QC việc của chính mình.
   */
  'assignment:qc': ['TECHNICIAN', 'SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 BR-02-2 — thợ ĐỀ XUẤT phát sinh, cố vấn mới lập báo giá.
   *
   * Hai quyền tách hẳn nhau và đó là toàn bộ nội dung của quy tắc: người phát
   * hiện vấn đề không phải người định giá. Gộp lại thì thợ vừa báo vừa chào
   * giá, và không còn ai kiểm tra xem phát sinh có thật hay không.
   *
   * docs/02 ma trận, hàng "Đề xuất phát sinh": thợ ✅, cố vấn ✅.
   */
  'supplement:report': ['TECHNICIAN', 'SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  /** Quyết định sau khi khách từ chối — BC-03 mục 5.1/5.2, việc của cố vấn */
  'supplement:resolve': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * Bảo hành — BC-09.
   *
   * `warranty:read` rộng vì tra cứu bảo hành là việc thường ngày ở quầy: khách
   * hỏi "xe tôi còn bảo hành không" trước cả khi quyết định có mang xe tới.
   * Thợ cũng cần biết để không tháo nhầm một thứ đang còn bảo hành hãng.
   *
   * 🔒 `warranty:claim` HẸP: mở một đơn bảo hành nghĩa là garage tự nhận chi
   * phí. Đó là quyết định tiền bạc, không phải thao tác ghi nhận.
   */
  'warranty:read': ['TECHNICIAN', 'SERVICE_ADVISOR', 'CASHIER', 'BRANCH_MANAGER', 'OWNER'],
  'warranty:claim': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  /** Ghi nhận đòi lại được từ nhà cung cấp — đụng tới tiền thu về */
  'warranty:recover': ['BRANCH_MANAGER', 'OWNER'],

  /**
   * Bấm giờ công — docs/02 ma trận, hàng "Bấm giờ công": thợ 🔶 "của mình",
   * quản lý 🔶 "sửa hộ, có log", chủ ✅. Cố vấn và thu ngân ❌.
   *
   * 🔒 Điều kiện "của mình" KHÔNG enforce được ở đây — bảng phân quyền chỉ biết
   * vai, không biết phân công nào thuộc ai. Nó enforce ở trigger
   * `kiem_tra_bam_gio()` (0030): `time_log.technician_id` phải bằng
   * `work_assignment.technician_id`. Không có nó thì một thợ bấm giờ hộ việc
   * của người khác, và `INV-W-06` không bắt được vì nó chỉ kiểm theo người của
   * DÒNG GIỜ — giờ của người làm thật bị thiếu, của người bấm hộ thì thừa.
   */
  'timeLog:write': ['TECHNICIAN', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Nhập hộ một đoạn giờ đã xảy ra — KHÔNG cho thợ.
   *
   * Đây là đường duy nhất ghi được giờ công với mốc thời gian trong quá khứ,
   * tức là đường duy nhất tự khai giờ làm. PR-09 của docs/02 cho phép quản lý
   * làm, kèm nhật ký bắt buộc.
   */
  'timeLog:enterForOther': ['BRANCH_MANAGER', 'OWNER'],

  /*
   * Hoá đơn và tiền — Phase 3.
   *
   * 🔒 Bốn quyền chứ không một, và ranh giới giữa chúng là ranh giới TRÁCH
   * NHIỆM chứ không phải mức độ khó:
   *
   *  · `invoice:read`   — thấy số tiền. Thợ không có, mọi vai còn lại có.
   *  · `invoice:write`  — dựng bản nháp từ công việc thực tế. Sai thì sửa được.
   *  · `invoice:issue`  — PHÁT HÀNH. Sau bước này hoá đơn bất biến (INV-M-03)
   *    và đã khai với cơ quan thuế. Đây là việc của thu ngân, không phải của
   *    người vừa lập bản nháp.
   *  · `invoice:adjust` — lập hoá đơn điều chỉnh. Chỉ quản lý: nó là lời thừa
   *    nhận rằng một chứng từ đã phát hành có sai sót.
   */
  'invoice:read': ['SERVICE_ADVISOR', 'CASHIER', 'BRANCH_MANAGER', 'OWNER'],
  'invoice:write': ['SERVICE_ADVISOR', 'CASHIER', 'BRANCH_MANAGER', 'OWNER'],
  'invoice:issue': ['CASHIER', 'BRANCH_MANAGER', 'OWNER'],
  'invoice:adjust': ['BRANCH_MANAGER', 'OWNER'],

  /** Thu tiền — việc của thu ngân, docs/02 ma trận hàng "Thanh toán" */
  'payment:record': ['CASHIER', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Cho nợ vượt hạn mức — BC-13 mục 4.1.
   *
   * Chặn cứng là quá cứng (đội xe đang gấp, chặn là mất khách); cho tự do là
   * nợ chồng chất không kiểm soát. Phương án đã chọn: cảnh báo + cần duyệt.
   */
  'credit:approveOverLimit': ['BRANCH_MANAGER', 'OWNER'],

  /** Hồ sơ bồi thường bảo hiểm — BC-08, việc của cố vấn dịch vụ */
  'insurance:manage': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /*
   * Landing / Sales — SRS Phase 1 mục 5.2 (docs/superpowers/specs/).
   *
   * 🔒 Vai cũ không tự có action mới; OWNER được liệt kê tường minh từng dòng.
   * Vai mới (MARKETING_*, SALES_*) cũng không được nhận action cũ của xưởng.
   */
  'marketing:catalogRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'SALES_ADVISOR', 'SALES_MANAGER', 'OWNER'],
  'marketing:catalogWrite': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'SALES_MANAGER', 'OWNER'],
  'marketing:catalogPublish': ['MARKETING_PUBLISHER', 'SALES_MANAGER', 'OWNER'],
  'marketing:experienceRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'SALES_MANAGER', 'OWNER'],
  'marketing:experienceWrite': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'SALES_MANAGER', 'OWNER'],
  'marketing:experiencePublish': ['MARKETING_PUBLISHER', 'SALES_MANAGER', 'OWNER'],
  'marketing:seoRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:seoWrite': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:seoPublish': ['MARKETING_PUBLISHER', 'OWNER'],
  'marketing:landingRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:landingWrite': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:landingPublish': ['MARKETING_PUBLISHER', 'OWNER'],
  'marketing:mediaRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:categoryRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:categoryWrite': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:reviewRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:reviewWrite': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:reviewPublish': ['MARKETING_PUBLISHER', 'OWNER'],

  /**
   * Câu hỏi thường gặp — SRS-LS-EXP-001 §4.10.
   *
   * Ba bậc, cùng khuôn với đánh giá và trang landing: viết KHÁC công bố. Đó là
   * toàn bộ lý do có hai vai marketing. Câu trả lời cho "bảo hành bao lâu" là
   * một lời hứa với khách, không phải một dòng ghi chú nội bộ.
   */
  'marketing:faqRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:faqWrite': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:faqPublish': ['MARKETING_PUBLISHER', 'OWNER'],

  /**
   * Bài viết trên landing — SRS-LS-EXP-001 §4.10.
   *
   * Cùng ba bậc, và ở đây khoảng cách giữa viết và công bố là rõ nhất: một bài
   * viết là văn bản dài, có quan điểm, đứng dưới tên thương hiệu. Đó chính là
   * loại nội dung cần người thứ hai đọc lại trước khi nó ra tên miền của khách.
   */
  'marketing:articleRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:articleWrite': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:articlePublish': ['MARKETING_PUBLISHER', 'OWNER'],

  /**
   * Điều hướng và chuyển hướng — SRS-LS-EXP-001 §4.10.
   *
   * HAI bậc, không ba, và khác với nội dung có chủ ý: menu không có bản nháp.
   * Một mục menu là một dòng chữ và một đường dẫn — không có gì để "đọc lại
   * trước khi đăng", và bắt nó qua vòng duyệt sẽ khiến việc sửa một lỗi chính
   * tả trong menu mất hai người.
   *
   * 🔒 Đổi lại, cả hai quyền đều hẹp hơn quyền soạn nội dung: sai một dòng
   *    chuyển hướng là gãy đường vào của cả một nhóm URL đã được đánh chỉ mục.
   */
  'marketing:navigationRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'OWNER'],
  'marketing:navigationWrite': ['MARKETING_PUBLISHER', 'OWNER'],
  'sales:leadRead': ['SALES_ADVISOR', 'SALES_MANAGER', 'OWNER'],
  'sales:leadReadAllBranch': ['SALES_MANAGER', 'OWNER'],
  'sales:leadAssign': ['SALES_MANAGER', 'OWNER'],
  'sales:leadTransition': ['SALES_ADVISOR', 'SALES_MANAGER', 'OWNER'],
  'sales:leadAddActivity': ['SALES_ADVISOR', 'SALES_MANAGER', 'OWNER'],

  /**
   * 🔒 Xoá dữ liệu cá nhân của một lead theo yêu cầu của chính người đó.
   *
   * Hẹp hơn `sales:leadTransition` một bậc: tư vấn viên xử lý lead hằng ngày
   * không cần quyền này, và thao tác thì không hoàn tác được. Đây là hành động
   * pháp lý (rút đồng ý theo NĐ 13/2023), không phải một bước trong quy trình
   * bán hàng — người chịu trách nhiệm phải là quản lý.
   */
  'sales:leadRedact': ['SALES_MANAGER', 'OWNER'],

  /*
   * Catalog thương mại — SRS-LS-EXP-001 §4. Ba nhóm quyền, tách nhau có lý do.
   */

  /** Biểu phí lăn bánh: một bảng, cả tenant dùng chung, sai một dòng là sai mọi trang xe. */
  'showroom:feeScheduleRead': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'SALES_MANAGER', 'OWNER'],
  'showroom:feeScheduleWrite': ['MARKETING_PUBLISHER', 'OWNER'],

  /**
   * 🔒 `INV-LS-21` ở dạng cụ thể nhất: sửa GIÁ tách khỏi sửa NỘI DUNG.
   *
   * `marketing:catalogWrite` cho phép sửa mô tả, ảnh, SEO. Đổi giá công bố là
   * việc khác hẳn — nó để lại vết bất biến trong `vehicle_price_log` và là thứ
   * khách chụp màn hình mang đến showroom. Biên tập viên nội dung không cần
   * quyền đó, và trao thừa quyền thì không ai phát hiện cho đến khi giá sai.
   */
  'showroom:priceWrite': ['MARKETING_PUBLISHER', 'SALES_MANAGER', 'OWNER'],

  /** Ưu đãi, trả góp, màu — nội dung thương mại, đi qua revision. */
  'showroom:commerceWrite': ['MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'SALES_MANAGER', 'OWNER'],

  /**
   * 🔒 Cập nhật khả năng giao xe — quyền RỘNG NHẤT trong nhóm này, và đó là chủ ý.
   *
   * Người biết "Long Biên còn màu gì, giao sau bao lâu" là người đứng ở
   * showroom, không phải biên tập viên marketing. Bắt họ đi qua màn soạn nội
   * dung — đứng cạnh nút Xuất bản — là cách chắc chắn để hoặc dữ liệu không bao
   * giờ được cập nhật, hoặc nội dung chưa duyệt bị đẩy ra công khai.
   *
   * Đây là lý do `vehicle_availability` KHÔNG đi qua revision (§3 của SRS): dữ
   * liệu vận hành và nội dung marketing có hai vòng đời, hai nhóm người.
   */
  'showroom:availabilityWrite': ['SALES_ADVISOR', 'SALES_MANAGER', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * Danh sách chi nhánh của tenant — tên, mã, còn hoạt động hay không.
   *
   * 🔒 Rộng hơn hầu hết quyền khác, và có lý do: đây là DANH BẠ, không phải dữ
   *    liệu vận hành. Không số tiền, không đơn hàng, không khách hàng — đúng
   *    những gì đã in trên biển hiệu ngoài đường.
   *
   * Cần rộng vì nó là bảng tra cứu của nhiều màn: khai khả năng giao xe phải
   * chọn được chi nhánh CHƯA có khai báo nào (nên không lấy từ danh sách đã
   * khai được), lọc lead theo chi nhánh, và mọi chỗ hiện tên thay cho uuid.
   *
   * ⚠️ Quyền này KHÔNG mở phạm vi dữ liệu. Thấy tên một chi nhánh không phải là
   *    đọc được đơn hàng của nó — `branchScope()` vẫn chặn như cũ.
   */
  'org:branchRead': [
    'SERVICE_ADVISOR', 'BRANCH_MANAGER', 'STORE_KEEPER', 'CASHIER',
    'MARKETING_EDITOR', 'MARKETING_PUBLISHER', 'SALES_ADVISOR', 'SALES_MANAGER', 'OWNER',
  ],
} as const satisfies Record<string, readonly Role[]>;

export type PermissionAction = keyof typeof ACTION_ROLES;

export function canDo(roles: readonly string[], action: PermissionAction): boolean {
  return roles.some((r) => (ACTION_ROLES[action] as readonly string[]).includes(r));
}

/** Nhãn tiếng Việt cho thông báo lỗi — người dùng không đọc mã hành động */
export const ACTION_LABEL: Record<PermissionAction, string> = {
  'customer:create': 'tạo hồ sơ khách hàng',
  'vehicle:create': 'tạo hồ sơ xe',
  'repairOrder:create': 'tiếp nhận xe',
  'repairOrder:photoWrite': 'tải ảnh hiện trạng',
  'repairOrder:read': 'xem đơn sửa chữa',
  'quotation:write': 'lập hoặc sửa báo giá',
  'quotation:send': 'gửi báo giá cho khách',
  'quotation:read': 'xem báo giá',
  'catalog:readPrice': 'xem giá bán trong danh mục',
  'quotation:discountOverThreshold': 'áp chiết khấu vượt ngưỡng',
  'stock:read': 'xem tồn kho',
  'stock:readCost': 'xem giá vốn',
  'stock:receive': 'nhập kho',
  'stock:adjust': 'điều chỉnh tồn kho',
  'stock:issue': 'xuất kho và trả hàng về kho',
  'assignment:read': 'xem lịch xưởng',
  'assignment:write': 'xếp khoang và thợ',
  'assignment:qc': 'kiểm tra chất lượng',
  'supplement:report': 'báo phát sinh',
  'supplement:resolve': 'quyết định phát sinh bị từ chối',
  'warranty:read': 'tra cứu bảo hành',
  'warranty:claim': 'mở đơn bảo hành',
  'warranty:recover': 'ghi nhận đòi lại từ nhà cung cấp',
  'timeLog:write': 'bấm giờ công',
  'timeLog:enterForOther': 'nhập hộ giờ công',
  'invoice:read': 'xem hoá đơn',
  'invoice:write': 'lập hoá đơn nháp',
  'invoice:issue': 'phát hành hoá đơn',
  'invoice:adjust': 'lập hoá đơn điều chỉnh',
  'payment:record': 'thu tiền',
  'credit:approveOverLimit': 'duyệt cho nợ vượt hạn mức',
  'insurance:manage': 'quản lý hồ sơ bồi thường bảo hiểm',
  'marketing:catalogRead': 'xem catalog xe',
  'marketing:catalogWrite': 'tạo hoặc sửa catalog xe',
  'marketing:catalogPublish': 'publish hoặc rollback catalog xe',
  'marketing:experienceRead': 'xem trải nghiệm xe',
  'marketing:experienceWrite': 'tạo hoặc sửa trải nghiệm xe',
  'marketing:experiencePublish': 'publish hoặc rollback trải nghiệm xe',
  'marketing:seoRead': 'xem cấu hình SEO',
  'marketing:seoWrite': 'sửa bản nháp SEO',
  'marketing:seoPublish': 'publish SEO/site profile',
  'marketing:landingRead': 'xem landing page',
  'marketing:landingWrite': 'sửa bản nháp landing page',
  'marketing:landingPublish': 'publish hoặc rollback landing page',
  'marketing:mediaRead': 'xem media marketing',
  'marketing:categoryRead': 'xem danh mục showroom',
  'marketing:categoryWrite': 'quản lý danh mục showroom',
  'marketing:reviewRead': 'xem testimonial',
  'marketing:reviewWrite': 'soạn testimonial',
  'marketing:reviewPublish': 'publish hoặc ẩn testimonial',
  'marketing:faqRead': 'xem câu hỏi thường gặp',
  'marketing:faqWrite': 'sửa câu hỏi thường gặp',
  'marketing:faqPublish': 'công bố câu hỏi thường gặp',
  'marketing:articleRead': 'xem bài viết',
  'marketing:articleWrite': 'soạn và sửa bài viết',
  'marketing:articlePublish': 'công bố bài viết',
  'marketing:navigationRead': 'xem menu và chuyển hướng',
  'marketing:navigationWrite': 'sửa menu và chuyển hướng',
  'sales:leadRead': 'xem lead được gán',
  'sales:leadReadAllBranch': 'xem lead toàn chi nhánh',
  'sales:leadAssign': 'gán lead cho tư vấn',
  'sales:leadTransition': 'chuyển trạng thái lead',
  'sales:leadAddActivity': 'ghi hoạt động lên lead',
  'sales:leadRedact': 'xoá dữ liệu cá nhân của lead',
  'showroom:feeScheduleRead': 'xem biểu phí lăn bánh',
  'showroom:feeScheduleWrite': 'sửa biểu phí lăn bánh',
  'showroom:priceWrite': 'đổi giá công bố của xe',
  'showroom:commerceWrite': 'sửa ưu đãi, trả góp và màu xe',
  'showroom:availabilityWrite': 'cập nhật khả năng giao xe của chi nhánh',
  'org:branchRead': 'xem danh sách chi nhánh',
};
