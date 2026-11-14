UPDATE security_profiles SET grants=(SELECT jsonb_agg(DISTINCT x ORDER BY x) FROM jsonb_array_elements_text(grants||'["my_work.execute"]'::jsonb) x)
WHERE system_key IN('it_admin','owner','company_admin','manager','crew_lead','worker');
INSERT INTO schema_migrations VALUES(21);
