CREATE TABLE operating_resources(
 id text PRIMARY KEY,code text NOT NULL UNIQUE,name text NOT NULL,category text NOT NULL CHECK(category IN ('materials','equipment')),
 unit_key text NOT NULL,unit_cost_cents integer CHECK(unit_cost_cents>=0),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 revision integer NOT NULL DEFAULT 1,deleted_at timestamptz
);
CREATE UNIQUE INDEX operating_resource_names ON operating_resources(lower(name),category) WHERE deleted_at IS NULL;
CREATE TABLE visit_resources(
 id text PRIMARY KEY,visit_id text NOT NULL REFERENCES visits(id),resource_id text NOT NULL REFERENCES operating_resources(id),
 name_snapshot text NOT NULL,category text NOT NULL CHECK(category IN ('materials','equipment')),unit_key text NOT NULL,
 unit_cost_cents integer CHECK(unit_cost_cents>=0),planned_quantity numeric NOT NULL CHECK(planned_quantity>0),
 actual_quantity numeric CHECK(actual_quantity>=0),notes text NOT NULL DEFAULT '',UNIQUE(visit_id,resource_id)
);
CREATE INDEX visit_resources_visit ON visit_resources(visit_id);
ALTER TABLE visits ADD COLUMN resources_prepared boolean NOT NULL DEFAULT false;
INSERT INTO catalog_options(category,key,label) VALUES('element_unit','hour','Horas de uso'),('element_unit','bag','Bolsas'),('element_unit','gallon','Galones') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations VALUES(20);
