ALTER TABLE visit_resources ADD COLUMN actual_unit_cost_cents integer CHECK(actual_unit_cost_cents>=0);
UPDATE visit_resources SET actual_unit_cost_cents=unit_cost_cents;
-- Recover the last prepared baseline from its audit when it exists; actual pricing
-- keeps the current value above. A captured unknown baseline remains unknown.
WITH prepared AS (
 SELECT DISTINCT ON(h.entity_id,l->>'id') h.entity_id visit_id,l->>'id' line_id,(l->>'unit_cost_cents')::integer planned
 FROM change_history h CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(h.details->'after')='array' THEN h.details->'after' ELSE '[]'::jsonb END) l
 WHERE h.entity='visit_resource_plan' AND h.event='prepared'
 ORDER BY h.entity_id,l->>'id',h.id DESC
)
UPDATE visit_resources r SET unit_cost_cents=p.planned FROM prepared p WHERE r.id=p.line_id AND r.visit_id=p.visit_id;
INSERT INTO schema_migrations VALUES(22);
