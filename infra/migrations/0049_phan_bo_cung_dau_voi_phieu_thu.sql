-- =============================================================================
-- 0049 — Phân bổ phải CÙNG DẤU với phiếu thu (F-2)
--
-- 0044 đặt hai ràng buộc về dấu:
--
--   payment.amount            > 0, hoặc < 0 nếu là chứng từ đảo
--   payment_allocation.amount <> 0
--
-- Vế thứ hai quá lỏng. Zod chặn số âm ở tầng API (`moneyAmount` không nhận số
-- âm), nên qua HTTP thì không lọt — nhưng đó là UI-không-bao-giờ-tính-là-enforce
-- viết lại bằng một chữ khác. Một script bảo trì, một lần import, hay một
-- service viết vội vẫn ghi được:
--
--   payment 1.000.000đ
--   ├── phân bổ dòng A: +2.000.000
--   └── phân bổ dòng B: −1.000.000     ← tiền bốc hơi khỏi dòng B
--
-- Tổng vẫn khớp 1.000.000 nên INV-M-05 cho qua. Dòng B tụt xuống "đã thu âm",
-- công nợ của khách tăng lên từ hư không, và không có gì báo động.
--
-- 💡 Điều kiện đúng không phải "không âm" mà là **CÙNG DẤU VỚI PHIẾU THU**:
--    chứng từ đảo mang số âm thì mọi phân bổ của nó cũng phải âm. CHECK không
--    diễn đạt được vì nó phải nhìn sang bảng `payment` — nên là trigger.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_phan_bo_cung_dau() RETURNS trigger AS $$
DECLARE
  tien_phieu bigint;
BEGIN
  SELECT amount INTO tien_phieu FROM payment WHERE id = NEW.payment_id;

  IF tien_phieu IS NULL THEN
    RETURN NULL;
  END IF;

  IF sign(NEW.amount) <> sign(tien_phieu) THEN
    RAISE EXCEPTION
      'ALLOCATION_SIGN: phân bổ % ngược dấu với phiếu thu % — chứng từ đảo thì mọi dòng phải âm',
      NEW.amount, tien_phieu
      USING ERRCODE = 'check_violation', CONSTRAINT = 'inv_m_05';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

/*
 * Kiểm NGAY, không hoãn: dấu của một dòng phân bổ không phụ thuộc những dòng
 * khác, nên không có lý do gì để đợi tới cuối giao dịch. Khác với
 * `trg_phan_bo_khop` (tổng phải khớp) — cái đó buộc phải hoãn.
 */
CREATE TRIGGER trg_phan_bo_cung_dau
  AFTER INSERT OR UPDATE ON payment_allocation
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_phan_bo_cung_dau();

-- =============================================================================
-- Và `kiem_tra_khong_thu_qua` phải kiểm CẢ HAI ĐẦU
--
-- Bản ở 0044 chỉ chặn `tong > gia_tri`. Với chứng từ đảo, tổng phân bổ của một
-- dòng đi xuống — và không có gì ngăn nó xuống dưới 0. Đảo hai lần một khoản
-- thu (nếu lọt qua kiểm tra ở service) sẽ để lại một dòng "đã thu −700.000đ".
--
-- 🔒 Khoảng đúng là [0, line_total]. Nói ra cả hai đầu, thay vì tin rằng đầu
--    dưới "không thể xảy ra".
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_khong_thu_qua() RETURNS trigger AS $$
DECLARE
  tong bigint;
  gia_tri bigint;
  mo_ta text;
BEGIN
  SELECT COALESCE(sum(a.amount), 0) INTO tong
    FROM payment_allocation a WHERE a.invoice_line_id = NEW.invoice_line_id;

  SELECT l.line_total, l.description INTO gia_tri, mo_ta
    FROM invoice_line l WHERE l.id = NEW.invoice_line_id;

  IF tong > gia_tri THEN
    RAISE EXCEPTION
      'OVERPAY: dòng "%" trị giá % mà đã phân bổ %', mo_ta, gia_tri, tong
      USING ERRCODE = 'check_violation', CONSTRAINT = 'inv_m_04';
  END IF;

  IF tong < 0 THEN
    RAISE EXCEPTION
      'NEGATIVE_COLLECTED: dòng "%" có tổng đã thu ÂM (%) — tiền không tự bốc hơi khỏi sổ',
      mo_ta, tong
      USING ERRCODE = 'check_violation', CONSTRAINT = 'inv_m_04';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;
