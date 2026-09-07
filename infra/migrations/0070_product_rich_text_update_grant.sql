-- 0056 limits app-role updates on revisions. Rich-text and its rehashed revision
-- are both normal draft edits, so grant the two new persisted fields explicitly.
GRANT UPDATE (description_document, content_hash) ON vehicle_product_revision TO garageos_app;
