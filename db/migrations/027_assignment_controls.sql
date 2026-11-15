CREATE TABLE employee_qualifications(
 id text PRIMARY KEY,employee_id text NOT NULL REFERENCES employees(id),service_key text NOT NULL,
 valid_from date NOT NULL,valid_until date CHECK(valid_until>=valid_from),certificate_ref text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,retired_at timestamptz,UNIQUE(employee_id,service_key)
);
CREATE TABLE service_qualification_rules(service_key text PRIMARY KEY,required boolean NOT NULL,revision integer NOT NULL DEFAULT 1);
CREATE TABLE property_access_policies(property_id text PRIMARY KEY REFERENCES properties(id),revision integer NOT NULL DEFAULT 1);
CREATE TABLE property_access_windows(
 property_id text NOT NULL REFERENCES property_access_policies(property_id),weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 opens_at text NOT NULL CHECK(opens_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),closes_at text NOT NULL CHECK(closes_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 PRIMARY KEY(property_id,weekday),CHECK(opens_at<closes_at)
);
CREATE TABLE visit_asset_reservations(
 visit_id text NOT NULL REFERENCES visits(id),asset_id text NOT NULL REFERENCES equipment_assets(id),
 PRIMARY KEY(visit_id,asset_id)
);
CREATE TABLE maintenance_orders(
 id text PRIMARY KEY,asset_id text NOT NULL REFERENCES equipment_assets(id),description text NOT NULL,
 due_on date NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN('open','completed','cancelled')),
 completed_on date,cost_cents integer CHECK(cost_cents>=0),notes text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1
);
INSERT INTO schema_migrations VALUES(27);
