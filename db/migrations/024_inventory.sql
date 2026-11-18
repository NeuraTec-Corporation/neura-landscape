ALTER TABLE operating_resources ADD COLUMN rate_basis text NOT NULL DEFAULT 'unconfirmed' CHECK(rate_basis IN('unconfirmed','evaluation','operator'));
ALTER TABLE visit_resources ADD COLUMN rate_basis text NOT NULL DEFAULT 'unconfirmed';
CREATE TABLE stock_movements (
 id text PRIMARY KEY,resource_id text NOT NULL REFERENCES operating_resources(id),
 quantity numeric NOT NULL CHECK(quantity<>0),reason text NOT NULL,
 visit_id text REFERENCES visits(id),reference text NOT NULL UNIQUE,occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_resource ON stock_movements(resource_id);
CREATE TABLE equipment_assets (
 id text PRIMARY KEY,resource_id text NOT NULL REFERENCES operating_resources(id),code text NOT NULL UNIQUE,
 name text NOT NULL,serial_number text NOT NULL DEFAULT '',crew_id text REFERENCES crews(id),
 status text NOT NULL CHECK(status IN('available','assigned','maintenance','retired')),
 maintenance_due date,notes text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,
 CHECK(status<>'assigned' OR crew_id IS NOT NULL)
);
INSERT INTO schema_migrations VALUES(24);
