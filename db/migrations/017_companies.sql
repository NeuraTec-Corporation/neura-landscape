CREATE UNIQUE INDEX security_company_name ON security_companies(lower(name));
CREATE TABLE security_platform_admins(subject_id text PRIMARY KEY REFERENCES app_members(email),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')));
INSERT INTO security_platform_admins(subject_id) SELECT email FROM app_members WHERE role='it_admin' AND status='active';
CREATE TABLE security_company_storage(company_id text PRIMARY KEY REFERENCES security_companies(id),schema_name text NOT NULL UNIQUE CHECK(schema_name='public' OR schema_name ~ '^tenant_[a-f0-9]{32}$'));
INSERT INTO security_company_storage VALUES('landscape','public');
ALTER TABLE security_memberships ADD COLUMN display_name text NOT NULL DEFAULT '';
ALTER TABLE security_profiles ADD COLUMN authority_level integer NOT NULL DEFAULT 100 CHECK(authority_level>=0);
UPDATE security_profiles SET authority_level=CASE system_key WHEN 'it_admin' THEN 0 WHEN 'owner' THEN 10 WHEN 'company_admin' THEN 20 WHEN 'manager' THEN 30 WHEN 'finance' THEN 40 WHEN 'crew_lead' THEN 50 ELSE 60 END WHERE system_key IS NOT NULL;
UPDATE security_login_codes SET account_kind='platform' WHERE subject_id IN(SELECT subject_id FROM security_platform_admins);
UPDATE security_profiles SET grants=grants||'["companies.read","companies.create","companies.update"]'::jsonb WHERE system_key='it_admin';
UPDATE security_profiles SET grants=grants||'["companies.read"]'::jsonb WHERE system_key='owner';
INSERT INTO security_profiles(company_id,id,name,system_key,scope,grants,authority_level)
SELECT id,'default-company_admin','Administrador general','company_admin','company',
(SELECT jsonb_agg(g) FROM security_profiles p CROSS JOIN LATERAL jsonb_array_elements_text(p.grants) g WHERE p.company_id=c.id AND p.system_key='owner' AND g NOT IN('companies.create','companies.update','finance.create','finance.update','finance.delete','finance.approve','finance.pay')),20
FROM security_companies c;
UPDATE security_profiles p SET grants=(SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements_text(p.grants) AS g(value));
INSERT INTO schema_migrations VALUES(17);
