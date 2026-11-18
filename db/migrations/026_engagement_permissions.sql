UPDATE security_profiles SET grants=grants||'["communications.read","communications.create","communications.update","portal.read"]'::jsonb,revision=revision+1 WHERE system_key IN('it_admin','owner','company_admin','manager');
INSERT INTO security_profiles(company_id,id,name,system_key,scope,grants,authority_level)
SELECT id,'default-customer','Cliente · portal privado','customer','company','["portal.read"]'::jsonb,100 FROM security_companies;
UPDATE security_profiles p SET grants=(SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT value FROM jsonb_array_elements_text(p.grants) AS g(value)) x);
INSERT INTO schema_migrations VALUES(26);
