-- Category deletion is allowed only when no product references it (0067 FK RESTRICT).
GRANT DELETE ON vehicle_product_category TO garageos_app;
