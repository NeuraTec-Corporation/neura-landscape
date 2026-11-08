CREATE TABLE security_company_logins (
 company_id text PRIMARY KEY REFERENCES security_companies(id),
 prefix text NOT NULL UNIQUE CHECK(prefix ~ '^[A-Z]{3}$'),
 last_sequence integer NOT NULL DEFAULT 0 CHECK(last_sequence>=0)
);
CREATE TABLE security_login_codes (
 company_id text NOT NULL,
 subject_id text NOT NULL,
 code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z]{3}[0-9]{3,10}$'),
 evaluation_only boolean NOT NULL DEFAULT false,
 PRIMARY KEY(company_id,subject_id),
 FOREIGN KEY(company_id,subject_id) REFERENCES security_memberships(company_id,subject_id)
);
INSERT INTO schema_migrations VALUES(15);
