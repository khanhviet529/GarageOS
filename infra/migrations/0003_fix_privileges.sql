-- =============================================================================
-- 0003_fix_privileges — Sửa hai lỗ hổng quyền do codex-review phát hiện
--
-- GARAGEOS-001 (INV-S-03): ALTER DEFAULT PRIVILEGES ở 0001 cấp UPDATE/DELETE
--   cho MỌI bảng tạo sau này. Khi migration sau tạo `stock_movement`, nó sẽ
--   tự động được cấp DELETE — phá bất biến "sổ kho chỉ thêm" một cách âm thầm,
--   không ai nhận ra cho tới khi mất dữ liệu.
--
--   Đây là loại lỗi nguy hiểm nhất: nó không sai *bây giờ*, nó sai *về sau*.
--
-- GARAGEOS-006: 0001 ghi cứng mật khẩu role và ALTER PASSWORD mỗi lần chạy.
--   Chạy migration ở production sẽ reset mật khẩu thật về giá trị công khai
--   có trong repo.
-- =============================================================================

-- --- GARAGEOS-001 -----------------------------------------------------------
-- Bỏ quyền mặc định cấp sẵn UPDATE/DELETE. Từ nay mỗi bảng phải cấp quyền
-- TƯỜNG MINH — bảng sổ/chứng từ sẽ chỉ được SELECT + INSERT.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE UPDATE, DELETE ON TABLES FROM garageos_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT ON TABLES TO garageos_app;

-- Các bảng hiện có VẪN cần UPDATE/DELETE (không phải bảng sổ) — cấp tường minh
GRANT UPDATE, DELETE ON tenant, branch, app_user, user_branch, refresh_token
  TO garageos_app;

-- 🔒 audit_log: chỉ thêm (INV-A-01) — khẳng định lại cho chắc
REVOKE UPDATE, DELETE ON audit_log FROM garageos_app;

COMMENT ON SCHEMA public IS
  'QUY TẮC QUYỀN: quyền mặc định chỉ có SELECT + INSERT. Bảng nào cần '
  'UPDATE/DELETE phải GRANT tường minh trong chính migration tạo nó. '
  'Bảng sổ và chứng từ (stock_movement, audit_log, invoice sau ISSUED) '
  'KHÔNG BAO GIỜ được cấp UPDATE/DELETE — xem docs/adr/0002-immutable-ledger.md';

-- --- GARAGEOS-006 -----------------------------------------------------------
-- Không đổi mật khẩu nếu role đã tồn tại. Mật khẩu production được đặt ngoài
-- migration (secret manager / lệnh ALTER ROLE thủ công một lần).
--
-- Migration 0001 vẫn tạo role với mật khẩu dev để môi trường local chạy được
-- ngay; production phải đổi theo hướng dẫn ở docs/DEPLOY.md.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 90600 THEN
    RAISE NOTICE
      'Nhắc: nếu đây là production, đổi mật khẩu garageos_app ngay: '
      'ALTER ROLE garageos_app PASSWORD ''<mật khẩu mạnh>'';';
  END IF;
END $$;
