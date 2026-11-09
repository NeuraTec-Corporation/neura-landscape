-- Historical references are not additional deployable employees or crews.
ALTER TABLE crews ADD COLUMN reference_only boolean NOT NULL DEFAULT false;
ALTER TABLE crews ADD COLUMN origin_company_id text;
ALTER TABLE employees ADD COLUMN reference_only boolean NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN origin_company_id text;
ALTER TABLE visits ADD COLUMN assignment_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE visits ADD COLUMN assignment_review_reason text NOT NULL DEFAULT '';
INSERT INTO schema_migrations VALUES(18);
