ALTER TABLE security_login_codes ADD COLUMN account_kind text NOT NULL DEFAULT 'company' CHECK(account_kind IN ('company','platform'));
-- Rename the existing identity; credentials, sessions and memberships stay intact.
INSERT INTO security_audit(company_id,actor,entity,entity_id,before_value,after_value)
SELECT company_id,'migration-016','user_code',subject_id,jsonb_build_object('code',code),jsonb_build_object('code','NEU001','account_kind','platform')
FROM security_login_codes WHERE company_id='landscape' AND subject_id='landscape.it_admin@access.neuratec.invalid' AND evaluation_only=true;
UPDATE security_login_codes SET code='NEU001',account_kind='platform'
WHERE company_id='landscape' AND subject_id='landscape.it_admin@access.neuratec.invalid' AND evaluation_only=true;
UPDATE app_members SET name='Administración NeuraTec',revision=revision+1
WHERE email='landscape.it_admin@access.neuratec.invalid' AND name='Isabel Rojas';
UPDATE security_profiles SET name='IT',revision=revision+1 WHERE system_key='it_admin' AND name='TI';
UPDATE security_companies SET version=version+1 WHERE id='landscape';
INSERT INTO schema_migrations VALUES(16);
