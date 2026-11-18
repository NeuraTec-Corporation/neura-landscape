CREATE TABLE customer_portal_access (
 subject_id text PRIMARY KEY REFERENCES public.app_members(email),customer_id text NOT NULL REFERENCES customers(id),
 revision integer NOT NULL DEFAULT 1,active boolean NOT NULL DEFAULT true
);
CREATE TABLE portal_photos(photo_id text PRIMARY KEY REFERENCES property_photos(id),published_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE customer_messages (
 id text PRIMARY KEY,customer_id text NOT NULL REFERENCES customers(id),
 channel text NOT NULL CHECK(channel IN('email','sms','whatsapp')),recipient text NOT NULL,
 subject text NOT NULL DEFAULT '',body text NOT NULL,
 scheduled_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','ready','handed_off','cancelled')),
 revision integer NOT NULL DEFAULT 1,reference text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations VALUES(25);
