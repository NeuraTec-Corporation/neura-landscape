-- Identity adapter state. Better Auth owns user/account/session schema and hashing.
CREATE TABLE security_local_identities (
 email text PRIMARY KEY REFERENCES app_members(email),
 user_id text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE security_access_links (
 id text PRIMARY KEY,
 company_id text NOT NULL REFERENCES security_companies(id),
 subject_id text NOT NULL REFERENCES app_members(email),
 issuer text NOT NULL,
 member_revision integer NOT NULL,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 FOREIGN KEY(company_id,subject_id) REFERENCES security_memberships(company_id,subject_id)
);
CREATE INDEX security_access_links_subject ON security_access_links(company_id,subject_id,created_at);
CREATE INDEX security_access_links_issuer ON security_access_links(company_id,issuer,created_at);
INSERT INTO schema_migrations VALUES(14);
