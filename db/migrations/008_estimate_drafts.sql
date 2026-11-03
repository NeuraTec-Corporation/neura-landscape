CREATE TABLE production_rates (
 id text PRIMARY KEY, name text NOT NULL, service_key text NOT NULL CHECK(service_key='mowing'),
 unit text NOT NULL CHECK(unit IN ('sqft','sqm')), quantity_per_person_hour numeric NOT NULL CHECK(quantity_per_person_hour>0),
 setup_person_minutes numeric NOT NULL CHECK(setup_person_minutes>=0),
 source text NOT NULL, confidence text NOT NULL CHECK(confidence IN ('estimated','field_validated')),
 active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE estimate_drafts (
 id text PRIMARY KEY, number text NOT NULL UNIQUE, customer_id text NOT NULL REFERENCES customers(id),
 property_id text NOT NULL REFERENCES properties(id), title text NOT NULL,
 revision integer NOT NULL DEFAULT 1, deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE estimate_revisions (
 estimate_id text NOT NULL REFERENCES estimate_drafts(id), revision integer NOT NULL,
 snapshot jsonb NOT NULL, actor text NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(estimate_id,revision)
);
CREATE INDEX estimate_property ON estimate_drafts(property_id);
INSERT INTO schema_migrations VALUES(8);
