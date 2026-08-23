-- Structured rich text is the product-revision source of truth; description remains a safe plain-text projection.
ALTER TABLE vehicle_product_revision ADD COLUMN IF NOT EXISTS description_document jsonb;
UPDATE vehicle_product_revision
   SET description_document = jsonb_build_object(
     'type','doc','schemaVersion',1,
     'content', CASE WHEN btrim(description) = '' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',description)))) END
   )
 WHERE description_document IS NULL;
ALTER TABLE vehicle_product_revision ALTER COLUMN description_document SET NOT NULL;
ALTER TABLE vehicle_product_revision ADD CONSTRAINT product_revision_description_document_object CHECK (jsonb_typeof(description_document) = 'object') NOT VALID;
ALTER TABLE vehicle_product_revision VALIDATE CONSTRAINT product_revision_description_document_object;
