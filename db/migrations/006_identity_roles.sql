CREATE TABLE app_members(email text PRIMARY KEY,name text NOT NULL,role text NOT NULL CHECK(role IN ('it_admin','owner','manager','crew_lead','worker','finance')),status text NOT NULL CHECK(status IN ('active','disabled')),revision integer NOT NULL DEFAULT 1);
CREATE TABLE app_crew_members(email text NOT NULL REFERENCES app_members(email),crew_id text NOT NULL REFERENCES crews(id),PRIMARY KEY(email,crew_id));
INSERT INTO schema_migrations VALUES(6);
