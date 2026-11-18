CREATE TABLE message_outbox(
 message_id text PRIMARY KEY REFERENCES customer_messages(id),state text NOT NULL CHECK(state IN('pending','processing','accepted','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0,lease_id text,lease_until timestamptz,retry_after timestamptz NOT NULL DEFAULT now(),
 provider_id text,error_code text,updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customer_messages DROP CONSTRAINT customer_messages_status_check;
ALTER TABLE customer_messages ADD CONSTRAINT customer_message_state CHECK(status IN('draft','ready','handed_off','cancelled','accepted','delivered','failed'));
INSERT INTO schema_migrations VALUES(29);
