ALTER TABLE security_companies ADD COLUMN kind text NOT NULL DEFAULT 'operator' CHECK(kind IN ('operator','platform'));
CREATE UNIQUE INDEX security_one_platform_company ON security_companies(kind) WHERE kind='platform';
CREATE TABLE security_scenarios(id text PRIMARY KEY,actor text NOT NULL,manifest jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE security_setup_attempts(id text PRIMARY KEY,status text NOT NULL,message text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations VALUES(19);
