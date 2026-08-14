-- SECURITY DEFINER không được kế thừa search_path của caller. Các hàm landing
-- được tạo trước migration này cần được khóa rõ public, pg_temp như toàn bộ
-- hàm privileged khác trong hệ thống (INV-S-DEF-SEARCH-PATH).

ALTER FUNCTION public.resolve_site_domain(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.marketing_promote_product_draft(uuid, uuid, uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.marketing_promote_experience_draft(uuid, uuid, uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.marketing_set_product_draft(uuid, uuid, uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.marketing_set_experience_draft(uuid, uuid, uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.marketing_publish_site_profile(uuid, uuid, uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.marketing_publish_branch_profile(uuid, uuid, uuid)
  SET search_path = public, pg_temp;
