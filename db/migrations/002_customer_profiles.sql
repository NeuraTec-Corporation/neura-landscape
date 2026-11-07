CREATE TABLE IF NOT EXISTS customer_profiles (
 customer_id text PRIMARY KEY REFERENCES customers(id), kind text NOT NULL CHECK(kind IN ('person','company')),
 first_name text NOT NULL, last_name text NOT NULL, company_name text NOT NULL DEFAULT '',
 status text NOT NULL CHECK(status IN ('prospect','active','inactive')), marital_status text NOT NULL DEFAULT '',
 language text NOT NULL DEFAULT 'es', timezone text NOT NULL DEFAULT 'America/New_York',
 notes text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_contacts (
 id text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id), first_name text NOT NULL,
 last_name text NOT NULL, relationship text NOT NULL, roles jsonb NOT NULL,
 phone_mobile text NOT NULL DEFAULT '', phone_home text NOT NULL DEFAULT '', phone_office text NOT NULL DEFAULT '',
 email text NOT NULL DEFAULT '', preferred_channel text NOT NULL, preferred_phone text NOT NULL,
 contact_from text NOT NULL, contact_to text NOT NULL, consent_sms boolean NOT NULL DEFAULT false,
 consent_whatsapp boolean NOT NULL DEFAULT false, consent_email boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS customer_contacts_email_idx ON customer_contacts(lower(email)) WHERE email <> '';
CREATE TABLE IF NOT EXISTS customer_addresses (
 id text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id), label text NOT NULL,
 line1 text NOT NULL, line2 text NOT NULL DEFAULT '', city text NOT NULL, region text NOT NULL, postal_code text NOT NULL,
 country text NOT NULL, latitude double precision CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision CHECK(longitude BETWEEN -180 AND 180), place_id text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS customer_reminders (
 id text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id), title text NOT NULL,
 due_at timestamptz NOT NULL, channel text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id),
 action text NOT NULL, revision integer NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations VALUES(2) ON CONFLICT DO NOTHING;
