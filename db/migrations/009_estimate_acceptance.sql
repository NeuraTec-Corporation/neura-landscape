CREATE TABLE estimate_offers (
 id text PRIMARY KEY, estimate_id text NOT NULL REFERENCES estimate_drafts(id),
 estimate_revision integer NOT NULL, status text NOT NULL CHECK(status IN ('issued','accepted','withdrawn','declined')),
 revision integer NOT NULL DEFAULT 1, snapshot jsonb NOT NULL, terms jsonb NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(), issued_by text NOT NULL,
 accepted_at timestamptz, accepted_by text, acceptance_authority text, evidence_method text, evidence_reference text,
 recorded_at timestamptz, recorded_by text, closed_reason text,
 contract_id text REFERENCES contracts(id), replaces_offer_id text REFERENCES estimate_offers(id),
 target_contract_id text REFERENCES contracts(id), target_baseline_version integer,
 FOREIGN KEY(estimate_id,estimate_revision) REFERENCES estimate_revisions(estimate_id,revision),
 UNIQUE(estimate_id,estimate_revision)
);
CREATE UNIQUE INDEX one_open_estimate_offer ON estimate_offers(estimate_id) WHERE status IN ('issued','accepted') AND contract_id IS NULL;
ALTER TABLE contracts ADD COLUMN source_offer_id text UNIQUE REFERENCES estimate_offers(id);
ALTER TABLE contracts ADD COLUMN current_offer_id text UNIQUE REFERENCES estimate_offers(id);
ALTER TABLE contracts ADD COLUMN baseline_version integer NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN effective_from date;
ALTER TABLE contracts ADD COLUMN effective_until date;
ALTER TABLE contracts ADD COLUMN billing_timing text CHECK(billing_timing IN ('advance','arrears'));
ALTER TABLE contracts ADD COLUMN due_days integer CHECK(due_days>=0 AND due_days<=90);
CREATE TABLE contract_baselines (
 contract_id text NOT NULL REFERENCES contracts(id), version integer NOT NULL,
 offer_id text NOT NULL UNIQUE REFERENCES estimate_offers(id), snapshot jsonb NOT NULL,
 effective_from date NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL,
 PRIMARY KEY(contract_id,version)
);
CREATE INDEX estimate_offer_family ON estimate_offers(estimate_id);
INSERT INTO schema_migrations VALUES(9);
