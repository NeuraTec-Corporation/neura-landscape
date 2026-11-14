CREATE TABLE sample_scenario_records(batch_id text NOT NULL REFERENCES sample_data_batches(id),entity text NOT NULL CHECK(entity IN ('employee','crew','contract','visit','invoice','payment','zone','element','catalog','rate','estimate')),entity_id text NOT NULL,PRIMARY KEY(batch_id,entity,entity_id),UNIQUE(entity,entity_id));
CREATE INDEX scenario_entity ON sample_scenario_records(entity,entity_id);
INSERT INTO schema_migrations VALUES(11);
