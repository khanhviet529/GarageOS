-- =============================================================================
-- 0064_lich_bao_duong — Lịch bảo dưỡng định kỳ và vật tư đi kèm
--
-- Mục đích: trả lời câu hỏi mà không trang bán xe nào khác trả lời được —
--   "nuôi chiếc xe này tốn bao nhiêu?"
--
-- Database đã biết CÓ NHỮNG HẠNG MỤC NÀO (`service_item`, kèm
-- `applicable_powertrains` và `standard_hours`) và GIÁ BAO NHIÊU (`price_list`,
-- `price_list_item`). Thứ còn thiếu duy nhất là BAO LÂU LÀM MỘT LẦN.
--
-- 🔒 Đây là dữ liệu của TỪNG TENANT, không phải hằng số của hệ thống. Mỗi xưởng
--    có khuyến cáo riêng theo hãng xe họ phục vụ và điều kiện vận hành ở địa
--    bàn của họ. Nên nó là bảng có `tenant_id` và RLS, không phải một mảng
--    hằng trong mã nguồn.
-- =============================================================================

CREATE TABLE IF NOT EXISTS maintenance_plan_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  service_item_id uuid NOT NULL,

  -- Ít nhất một trong hai mốc phải có; có cả hai thì lấy cái ĐẾN TRƯỚC.
  interval_km     integer,
  interval_months integer,

  created_at      timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, service_item_id) REFERENCES service_item(tenant_id, id),
  UNIQUE (tenant_id, service_item_id),

  /*
   * ⚠️ Không có mốc nào thì hạng mục KHÔNG BAO GIỜ được tính, và nó biến mất
   *    khỏi bảng chi phí trong im lặng. Một hàng vô nghĩa nằm im tệ hơn một
   *    lệnh INSERT bị từ chối.
   */
  CONSTRAINT plan_item_co_moc CHECK (
    interval_km IS NOT NULL OR interval_months IS NOT NULL
  ),
  CONSTRAINT plan_item_km_duong CHECK (interval_km IS NULL OR interval_km > 0),
  CONSTRAINT plan_item_thang_duong CHECK (interval_months IS NULL OR interval_months > 0),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_plan_item_tenant
  ON maintenance_plan_item (tenant_id, service_item_id);

-- --- Vật tư tiêu hao của mỗi lần làm ----------------------------------------
--
-- Tách bảng riêng vì một hạng mục dùng NHIỀU vật tư với số lượng khác nhau:
-- thay dầu là 4 lít dầu + 1 lọc, không phải "một thứ".

CREATE TABLE IF NOT EXISTS maintenance_plan_part (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  plan_item_id   uuid NOT NULL,
  part_id        uuid NOT NULL,

  -- `numeric` chứ không `integer`: dầu tính theo lít và có thể là 3,5 lít.
  quantity       numeric(8,2) NOT NULL,

  FOREIGN KEY (tenant_id, plan_item_id) REFERENCES maintenance_plan_item(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id) REFERENCES part(tenant_id, id),
  UNIQUE (tenant_id, plan_item_id, part_id),
  CONSTRAINT plan_part_so_luong_duong CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_plan_part_item
  ON maintenance_plan_part (tenant_id, plan_item_id);

-- --- RLS ---------------------------------------------------------------------
--
-- 🔒 INV-T-01: mọi bảng có `tenant_id` đều phải bật RLS, và bật FORCE để chính
--    chủ sở hữu bảng cũng không đi vòng được. `packages/db/test/privileges.spec.ts`
--    quét toàn bộ schema và sẽ đỏ nếu thiếu.

ALTER TABLE maintenance_plan_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_plan_item FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_maintenance_plan_item ON maintenance_plan_item;
CREATE POLICY p_maintenance_plan_item ON maintenance_plan_item
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE maintenance_plan_part ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_plan_part FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_maintenance_plan_part ON maintenance_plan_part;
CREATE POLICY p_maintenance_plan_part ON maintenance_plan_part
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- --- Quyền -------------------------------------------------------------------
--
-- Landing công khai chỉ ĐỌC. Việc sửa lịch bảo dưỡng là thao tác vận hành, chưa
-- có giao diện ở Phase này — nên chưa cấp quyền ghi cho role ứng dụng.
-- 🔒 `privileges.spec.ts` quét mọi bảng được cấp UPDATE toàn cột; không cấp là
--    cách chắc chắn nhất để không xuất hiện trong danh sách đó.

GRANT SELECT ON maintenance_plan_item TO garageos_app;
GRANT SELECT ON maintenance_plan_part TO garageos_app;

COMMENT ON TABLE maintenance_plan_item IS
  'Lịch bảo dưỡng định kỳ theo tenant. Có cả interval_km và interval_months thì '
  'lấy mốc ĐẾN TRƯỚC — đúng cách sổ bảo dưỡng thật viết. '
  '⚠️ Các mốc trong seed là giá trị thông dụng ở thị trường Việt Nam, CHƯA được '
  'xưởng thật xác nhận. Xem docs/reviews trước khi dùng cho quảng cáo.';
