-- =============================================================================
-- 0042 — Nhật ký và ngân sách cho tầng AI (Phase 8)
--
-- Phase 8 của roadmap có sáu lát cắt. Cái không cần khoá API nào để làm — và
-- cũng là cái quan trọng nhất — là HẠ TẦNG QUANH mô hình ngôn ngữ:
--
--   8.2 🔒 authz enforce TRONG TOOL, không tin LLM
--   8.5 guardrail + giới hạn token/ngày
--   8.6 log mọi lời gọi: prompt, token, độ trễ, chi phí
--
-- Ba thứ đó không phụ thuộc mô hình nào cả. Chúng là lý do một tính năng AI
-- chạy được ở môi trường thật thay vì chỉ chạy được trong bản demo.
--
-- 💡 Điều dễ làm sai nhất của cả phase: coi LLM như một người dùng đã xác thực.
--    Nó không phải. Nó là một nguồn ĐẦU VÀO KHÔNG ĐÁNG TIN sinh ra lời gọi hàm
--    — cùng hạng với một request HTTP từ internet. Mọi lời gọi tool phải đi qua
--    đúng những kiểm tra mà một request của người dùng phải đi qua, cộng thêm
--    một điều nữa: `tenant_id` và `user_id` KHÔNG BAO GIỜ lấy từ tham số mô
--    hình sinh ra.
-- =============================================================================

CREATE TABLE llm_call_log (
  id              bigserial PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  /** Người dùng thay mặt ai gọi — mọi tool chạy DƯỚI danh nghĩa người này */
  actor_user_id   uuid NOT NULL,

  /** Mã phiên hội thoại, để nối nhiều lượt của một cuộc */
  conversation_id uuid NOT NULL,
  provider        text NOT NULL,
  model           text NOT NULL,

  /*
   * Câu hỏi của người dùng, KHÔNG phải toàn bộ prompt.
   *
   * 🔒 Cố ý không lưu system prompt và nội dung tài liệu đã nhét vào ngữ cảnh:
   * chúng lặp lại ở mọi lượt, làm bảng phình rất nhanh, và phần cần điều tra
   * khi có sự cố luôn là "người dùng hỏi gì" chứ không phải "hệ thống nhắc gì".
   */
  user_message    text NOT NULL,
  /** Câu trả lời cuối cùng đưa cho người dùng */
  assistant_message text,

  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  /** Chi phí ước tính, đơn vị ĐỒNG — cùng quy ước với mọi số tiền khác */
  cost_amount       bigint NOT NULL DEFAULT 0,
  latency_ms        integer NOT NULL DEFAULT 0,

  /** Danh sách tool đã gọi trong lượt này, kèm kết quả tóm tắt */
  tool_calls      jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** Nguồn đã trích dẫn — 8.3 đòi câu trả lời phải chỉ được nguồn */
  citations       jsonb NOT NULL DEFAULT '[]'::jsonb,

  /*
   * Vì sao lượt này bị chặn, nếu bị chặn.
   *
   * NULL = chạy bình thường. Có giá trị = guardrail đã can thiệp, và giá trị đó
   * chính là thứ cần đọc khi ai đó hỏi "sao nó không trả lời tôi".
   */
  blocked_reason  text,

  created_at      timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES app_user(tenant_id, id),
  CONSTRAINT llm_cost_within_safe_range
    CHECK (cost_amount BETWEEN 0 AND 9007199254740991),
  CONSTRAINT llm_tokens_non_negative
    CHECK (prompt_tokens >= 0 AND completion_tokens >= 0)
);

CREATE INDEX idx_llm_log_tenant_ngay
  ON llm_call_log (tenant_id, created_at DESC);
CREATE INDEX idx_llm_log_conversation
  ON llm_call_log (conversation_id, created_at);

COMMENT ON TABLE llm_call_log IS
  'INV-A-01 mo rong sang tang AI: chi INSERT. Mot cuoc goi da xay ra thi khong '
  'sua duoc — day la thu duy nhat giai thich duoc mot cau tra loi sai ve sau.';

-- =============================================================================
-- 🔒 Nhật ký chỉ THÊM — cùng hạng với `audit_log` và `stock_movement`
--
-- Một câu trả lời sai của trợ lý, ba tuần sau khách khiếu nại: thứ duy nhất
-- giải thích được là bản ghi của lượt đó. Sửa được nó thì không còn gì để đối
-- chiếu, và "AI nói thế" trở thành một câu không ai kiểm chứng nổi.
-- =============================================================================

ALTER TABLE llm_call_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_call_log FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON llm_call_log
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

REVOKE UPDATE, DELETE ON llm_call_log FROM garageos_app;

-- =============================================================================
-- Ngân sách token theo ngày — 8.5
--
-- Vì sao là bảng chứ không phải một hằng số trong mã: chi phí mô hình là chi
-- phí THẬT trả bằng tiền thật, và mỗi garage có mức chịu được khác nhau. Nhưng
-- lý do quan trọng hơn: một vòng lặp hỏng — agent gọi tool, tool trả lỗi, agent
-- thử lại — có thể đốt hết ngân sách tháng trong một buổi chiều mà không ai
-- biết, vì mỗi lượt riêng lẻ đều trông bình thường.
-- =============================================================================

ALTER TABLE tenant
  ADD COLUMN ai_enabled boolean NOT NULL DEFAULT false,
  /** Trần chi phí MỖI NGÀY, đơn vị đồng. 0 = tắt hẳn */
  ADD COLUMN ai_daily_cost_limit bigint NOT NULL DEFAULT 0,
  /** Trần số lượt mỗi ngày — chặn vòng lặp hỏng trước khi nó tốn tiền */
  ADD COLUMN ai_daily_call_limit integer NOT NULL DEFAULT 200,

  ADD CONSTRAINT ai_limit_khong_am
    CHECK (ai_daily_cost_limit >= 0 AND ai_daily_call_limit >= 0),
  ADD CONSTRAINT ai_cost_limit_within_safe_range
    CHECK (ai_daily_cost_limit BETWEEN 0 AND 9007199254740991);

GRANT UPDATE (ai_enabled, ai_daily_cost_limit, ai_daily_call_limit)
  ON tenant TO garageos_app;

/**
 * Đã dùng bao nhiêu hôm nay.
 *
 * 🔒 Tính từ chính nhật ký, không từ một bộ đếm riêng: bộ đếm là thứ có thể
 * lệch khỏi sự thật, và lệch theo hướng có lợi cho việc tiêu tiền.
 *
 * Đếm cả lượt BỊ CHẶN vào số lượt: một vòng lặp hỏng bị guardrail chặn vẫn là
 * một vòng lặp hỏng, và nếu nó không tính vào giới hạn thì nó chạy mãi.
 */
CREATE OR REPLACE FUNCTION ai_da_dung_hom_nay(p_tenant uuid)
RETURNS TABLE (so_luot bigint, tong_chi_phi bigint) AS $$
  SELECT count(*), COALESCE(sum(cost_amount), 0)::bigint
    FROM llm_call_log
   WHERE tenant_id = p_tenant
     AND created_at >= date_trunc('day', now());
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION ai_da_dung_hom_nay(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_da_dung_hom_nay(uuid) TO garageos_app;
