// One-time, transaction-only transfer of an existing evaluation portfolio.
// Physical resources have exactly one live owner. Archived foreign references
// preserve the crews/personnel named on historical visits, never live capacity.
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const idset = (kind) => `SELECT id FROM _distribution_ids WHERE kind='${kind}'`;
const has = (column, kind) => `${column} IN (${idset(kind)})`;
const baselineTables = [
	"customers",
	"properties",
	"contracts",
	"visits",
	"invoices",
	"payments",
	"property_zones",
	"property_elements",
	"property_photos",
	"property_photo_data",
	"estimate_drafts",
	"estimate_revisions",
	"estimate_offers",
	"contract_baselines",
];
export async function portfolioCounts(tx, schema = "public") {
	const q = quote(schema),
		result = {};
	for (const table of baselineTables)
		result[table] = Number(
			(await tx.query(`SELECT count(*)::int n FROM ${q}.${table}`)).rows[0].n,
		);
	for (const table of ["crews", "employees"])
		result[table] = Number(
			(
				await tx.query(
					`SELECT count(*)::int n FROM ${q}.${table} WHERE NOT reference_only AND deleted_at IS NULL`,
				)
			).rows[0].n,
		);
	result.invoice_cents = String(
		(
			await tx.query(
				`SELECT coalesce(sum(total_cents),0)::text n FROM ${q}.invoices`,
			)
		).rows[0].n,
	);
	result.payment_cents = String(
		(
			await tx.query(
				`SELECT coalesce(sum(amount_cents),0)::text n FROM ${q}.payments`,
			)
		).rows[0].n,
	);
	result.visit_labor_cents = String(
		(
			await tx.query(
				`SELECT coalesce(sum(labor_cents),0)::text n FROM ${q}.visits`,
			)
		).rows[0].n,
	);
	return result;
}
// Whole customer dossiers; select a deterministic subset close to half the
// localities while also keeping the number of accounts close to half.
export function balancedCustomers(rows, totalProperties) {
	const count = Math.round(rows.length / 2),
		dp = new Map([["0:0", []]]);
	for (const row of rows) {
		for (const [key, ids] of [...dp]) {
			const [n, sum] = key.split(":").map(Number);
			if (n < count && !dp.has(`${n + 1}:${sum + Number(row.properties)}`))
				dp.set(`${n + 1}:${sum + Number(row.properties)}`, [...ids, row.id]);
		}
	}
	return (
		[...dp]
			.filter(([key]) => Number(key.split(":")[0]) === count)
			.sort(
				(a, b) =>
					Math.abs(Number(a[0].split(":")[1]) - totalProperties / 2) -
					Math.abs(Number(b[0].split(":")[1]) - totalProperties / 2),
			)[0]?.[1] || []
	);
}
export async function distributePortfolio(
	tx,
	targetSchema,
	sourceCompany,
	targetCompany,
) {
	if (
		!/^[a-zA-Z0-9_-]{1,80}$/.test(sourceCompany) ||
		!/^[a-zA-Z0-9_-]{1,80}$/.test(targetCompany)
	)
		throw Error("Invalid company id");
	if (!/^tenant_[a-f0-9]{32}$/.test(targetSchema))
		throw Error("Invalid destination namespace");
	const expected = [
		"customers",
		"properties",
		"contracts",
		"crews",
		"visits",
		"activity",
		"customer_profiles",
		"customer_contacts",
		"customer_addresses",
		"customer_reminders",
		"customer_audit",
		"location_sequences",
		"service_audit",
		"operator_settings",
		"property_zones",
		"property_elements",
		"property_photos",
		"property_photo_data",
		"app_crew_members",
		"catalog_options",
		"catalog_categories",
		"entity_sequences",
		"employees",
		"crew_employees",
		"visit_personnel",
		"visit_tasks",
		"visit_cost_lines",
		"invoices",
		"invoice_lines",
		"payments",
		"change_history",
		"production_rates",
		"estimate_drafts",
		"estimate_revisions",
		"estimate_offers",
		"contract_baselines",
		"sample_data_batches",
		"sample_data_records",
		"sample_scenario_records",
	];
	const actual = (
		await tx.query(
			"SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'security_%' AND tablename NOT IN ('schema_migrations','app_members','user','account','session','verification','rateLimit','media_budget') ORDER BY tablename",
		)
	).rows.map((r) => r.tablename);
	if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
		throw Error(
			`Portfolio schema needs an explicit transfer contract: unexpected=${actual.filter((t) => !expected.includes(t))}; missing=${expected.filter((t) => !actual.includes(t))}`,
		);
	await tx.exec(
		`LOCK TABLE ${expected.map((t) => `public.${quote(t)}`).join(",")} IN ACCESS EXCLUSIVE MODE`,
	);
	const target = quote(targetSchema),
		before = await portfolioCounts(tx);
	if ((await portfolioCounts(tx, targetSchema)).customers !== 0)
		throw Error("Destination must be empty");
	if (
		(
			await tx.query(
				"SELECT id FROM visits WHERE status='started' AND deleted_at IS NULL LIMIT 1",
			)
		).rows.length
	)
		throw Error("Finish or cancel running visits before redistribution");
	const customers = (
		await tx.query(
			"SELECT c.id,count(p.id)::int properties FROM customers c LEFT JOIN properties p ON p.customer_id=c.id GROUP BY c.id ORDER BY c.name,c.id",
		)
	).rows;
	if (customers.length < 2)
		throw Error("At least two existing customer dossiers are required");
	const customerIds = balancedCustomers(customers, before.properties);
	const crews = (
		await tx.query(
			"SELECT id,name FROM crews WHERE deleted_at IS NULL AND NOT reference_only ORDER BY name,id",
		)
	).rows;
	const links = (
		await tx.query("SELECT crew_id,employee_id FROM crew_employees")
	).rows;
	// Crew components sharing people must stay together; no employee is cloned.
	const groups = crews.map((c) => new Set([c.id]));
	for (const employee of new Set(links.map((r) => r.employee_id))) {
		const memberCrews = links
				.filter((r) => r.employee_id === employee)
				.map((r) => r.crew_id),
			matching = groups.filter((g) => memberCrews.some((c) => g.has(c)));
		if (matching.length > 1) {
			const merged = new Set(matching.flatMap((g) => [...g]));
			for (const g of matching) groups.splice(groups.indexOf(g), 1);
			groups.push(merged);
		}
	}
	const activeEmployees = (
			await tx.query(
				"SELECT id FROM employees WHERE deleted_at IS NULL AND NOT reference_only ORDER BY code,id",
			)
		).rows.map((r) => r.id),
		activeSet = new Set(activeEmployees);
	let options = [{ crews: [], employees: [] }];
	for (const group of groups) {
		const employees = [
			...new Set(
				links
					.filter((l) => group.has(l.crew_id) && activeSet.has(l.employee_id))
					.map((l) => l.employee_id),
			),
		];
		options = options.concat(
			options.map((o) => ({
				crews: [...o.crews, ...group],
				employees: [...new Set([...o.employees, ...employees])],
			})),
		);
		if (options.length > 32768)
			throw Error(
				"Too many connected resource components for automatic distribution",
			);
	}
	const chosen = options
		.filter((o) => o.crews.length && o.crews.length < crews.length)
		.sort(
			(a, b) =>
				Math.abs(a.employees.length - activeEmployees.length / 2) +
				Math.abs(a.crews.length - crews.length / 2) -
				Math.abs(b.employees.length - activeEmployees.length / 2) -
				Math.abs(b.crews.length - crews.length / 2),
		)[0];
	if (!chosen)
		throw Error("Resource sharing prevents a safe two-company split");
	const assigned = new Set(links.map((l) => l.employee_id));
	for (const id of activeEmployees.filter((id) => !assigned.has(id)))
		if (chosen.employees.length < Math.round(activeEmployees.length / 2))
			chosen.employees.push(id);
	await tx.exec(
		"CREATE TEMP TABLE _distribution_ids(kind text NOT NULL,id text NOT NULL,PRIMARY KEY(kind,id)) ON COMMIT DROP",
	);
	for (const [kind, ids] of [
		["customer", customerIds],
		["crew_owner", chosen.crews],
		["employee_owner", chosen.employees],
	])
		for (const id of ids)
			await tx.query("INSERT INTO _distribution_ids VALUES($1,$2)", [kind, id]);
	const collect = async (kind, sql) =>
		tx.exec(
			`INSERT INTO _distribution_ids SELECT '${kind}',id FROM (${sql}) selected ON CONFLICT DO NOTHING`,
		);
	await collect(
		"property",
		`SELECT id FROM properties WHERE ${has("customer_id", "customer")}`,
	);
	await collect(
		"contract",
		`SELECT id FROM contracts WHERE ${has("property_id", "property")}`,
	);
	await collect(
		"visit",
		`SELECT id FROM visits WHERE ${has("contract_id", "contract")}`,
	);
	await collect(
		"invoice",
		`SELECT id FROM invoices WHERE ${has("customer_id", "customer")}`,
	);
	await collect(
		"payment",
		`SELECT id FROM payments WHERE ${has("invoice_id", "invoice")}`,
	);
	for (const [kind, table] of [
		["zone", "property_zones"],
		["element", "property_elements"],
		["photo", "property_photos"],
	])
		await collect(
			kind,
			`SELECT id FROM ${table} WHERE ${has("property_id", "property")}`,
		);
	await collect(
		"estimate",
		`SELECT id FROM estimate_drafts WHERE ${has("customer_id", "customer")}`,
	);
	await collect(
		"offer",
		`SELECT id FROM estimate_offers WHERE ${has("estimate_id", "estimate")}`,
	);
	await collect(
		"crew",
		`SELECT id FROM crews WHERE ${has("id", "crew_owner")} OR id IN(SELECT crew_id FROM visits WHERE ${has("id", "visit")})`,
	);
	await collect(
		"employee",
		`SELECT id FROM employees WHERE ${has("id", "employee_owner")} OR id IN(SELECT employee_id FROM crew_employees WHERE ${has("crew_id", "crew")}) OR id IN(SELECT employee_id FROM visit_personnel WHERE ${has("visit_id", "visit")}) OR id IN(SELECT employee_id FROM visit_tasks WHERE ${has("visit_id", "visit")})`,
	);
	const copy = async (table, condition = "true", overrides = {}) => {
		const columns = (
			await tx.query(
				"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
				[table],
			)
		).rows.map((c) => c.column_name);
		if (!columns.length) throw Error(`Missing source table ${table}`);
		await tx.exec(
			`INSERT INTO ${target}.${quote(table)} (${columns.map(quote).join(",")}) OVERRIDING SYSTEM VALUE SELECT ${columns.map((c) => overrides[c] ?? quote(c)).join(",")} FROM public.${quote(table)} WHERE ${condition}`,
		);
	};
	// Reference catalogs/counters are independent configuration, not new assets.
	await tx.exec(
		`DELETE FROM ${target}.catalog_options;DELETE FROM ${target}.catalog_categories;`,
	);
	for (const t of [
		"catalog_categories",
		"catalog_options",
		"entity_sequences",
		"location_sequences",
		"production_rates",
		"sample_data_batches",
	])
		await copy(t);
	await copy("employees", has("id", "employee"), {
		reference_only: `NOT (${has("id", "employee_owner")})`,
		origin_company_id: `CASE WHEN ${has("id", "employee_owner")} THEN '${targetCompany}' ELSE '${sourceCompany}' END`,
		deleted_at: `CASE WHEN ${has("id", "employee_owner")} THEN deleted_at ELSE now() END`,
		status: `CASE WHEN ${has("id", "employee_owner")} THEN status ELSE 'inactive' END`,
		hourly_cents: `CASE WHEN ${has("id", "employee_owner")} THEN hourly_cents ELSE NULL END`,
		email: `CASE WHEN ${has("id", "employee_owner")} THEN email ELSE '' END`,
		phone: `CASE WHEN ${has("id", "employee_owner")} THEN phone ELSE '' END`,
		skills: `CASE WHEN ${has("id", "employee_owner")} THEN skills ELSE '' END`,
	});
	await copy("crews", has("id", "crew"), {
		reference_only: `NOT (${has("id", "crew_owner")})`,
		origin_company_id: `CASE WHEN ${has("id", "crew_owner")} THEN '${targetCompany}' ELSE '${sourceCompany}' END`,
		deleted_at: `CASE WHEN ${has("id", "crew_owner")} THEN deleted_at ELSE now() END`,
	});
	await copy("crew_employees", has("crew_id", "crew"));
	await copy("customers", has("id", "customer"));
	for (const t of [
		"customer_profiles",
		"customer_contacts",
		"customer_addresses",
		"customer_reminders",
		"customer_audit",
	])
		await copy(t, has("customer_id", "customer"));
	await copy("properties", has("id", "property"));
	await copy("property_zones", has("id", "zone"));
	await copy("property_elements", has("id", "element"));
	await copy("property_photos", has("id", "photo"));
	await copy("property_photo_data", has("photo_id", "photo"));
	await copy("contracts", has("id", "contract"), {
		source_offer_id: "NULL",
		current_offer_id: "NULL",
	});
	await copy("estimate_drafts", has("id", "estimate"));
	await copy("estimate_revisions", has("estimate_id", "estimate"));
	await copy("estimate_offers", has("id", "offer"), {
		replaces_offer_id: "NULL",
	});
	await tx.exec(
		`UPDATE ${target}.estimate_offers d SET replaces_offer_id=s.replaces_offer_id FROM public.estimate_offers s WHERE d.id=s.id;UPDATE ${target}.contracts d SET source_offer_id=s.source_offer_id,current_offer_id=s.current_offer_id FROM public.contracts s WHERE d.id=s.id;`,
	);
	await copy("contract_baselines", has("contract_id", "contract"));
	await copy("visits", has("id", "visit"));
	for (const t of [
		"activity",
		"visit_personnel",
		"visit_tasks",
		"visit_cost_lines",
	])
		await copy(t, has("visit_id", "visit"));
	await copy("invoices", has("id", "invoice"));
	await copy("invoice_lines", has("invoice_id", "invoice"));
	await copy("payments", has("id", "payment"));
	const entityMap = {
		customer: "customer",
		property: "property",
		locality: "property",
		location: "property",
		contract: "contract",
		visit: "visit",
		invoice: "invoice",
		payment: "payment",
		zone: "zone",
		element: "element",
		photo: "photo",
		employee: "employee_owner",
		crew: "crew_owner",
		estimate: "estimate",
	};
	const auditWhere = Object.entries(entityMap)
		.map(([e, k]) => `(entity='${e}' AND ${has("entity_id", k)})`)
		.join(" OR ");
	await copy("service_audit", auditWhere);
	await copy("change_history", auditWhere);
	const markerWhere = `(entity='customer' AND ${has("entity_id", "customer")}) OR (entity='property' AND ${has("entity_id", "property")})`;
	const scenarioWhere = Object.entries({ ...entityMap, rate: "rate" })
		.filter(
			([e]) =>
				![
					"locality",
					"location",
					"photo",
					"customer",
					"property",
					"payment",
				].includes(e),
		)
		.map(([e, k]) => `(entity='${e}' AND ${has("entity_id", k)})`)
		.join(" OR ");
	await copy("sample_data_records", markerWhere);
	await copy(
		"sample_scenario_records",
		`(${scenarioWhere}) OR entity IN ('rate','catalog')`,
	);
	// Resources/counters are retained only as archived references where necessary.
	// All customer and financial rows are moved, not left as a second live copy.
	await tx.exec(
		`UPDATE contracts SET source_offer_id=NULL,current_offer_id=NULL WHERE ${has("id", "contract")};UPDATE estimate_offers SET replaces_offer_id=NULL WHERE ${has("id", "offer")};`,
	);
	const removals = [
		["contract_baselines", has("contract_id", "contract")],
		["estimate_offers", has("id", "offer")],
		["estimate_revisions", has("estimate_id", "estimate")],
		["estimate_drafts", has("id", "estimate")],
		["activity", has("visit_id", "visit")],
		["visit_cost_lines", has("visit_id", "visit")],
		["visit_tasks", has("visit_id", "visit")],
		["visit_personnel", has("visit_id", "visit")],
		["visits", has("id", "visit")],
		["contracts", has("id", "contract")],
		["payments", has("id", "payment")],
		["invoice_lines", has("invoice_id", "invoice")],
		["invoices", has("id", "invoice")],
		["property_photo_data", has("photo_id", "photo")],
		["property_photos", has("id", "photo")],
		["property_elements", has("id", "element")],
		["property_zones", has("id", "zone")],
		["properties", has("id", "property")],
		...[
			"customer_audit",
			"customer_reminders",
			"customer_addresses",
			"customer_contacts",
			"customer_profiles",
		].map((t) => [t, has("customer_id", "customer")]),
		["customers", has("id", "customer")],
		["service_audit", auditWhere],
		["change_history", auditWhere],
		["sample_data_records", markerWhere],
		["sample_scenario_records", scenarioWhere],
	];
	for (const [table, where] of removals)
		await tx.exec(`DELETE FROM public.${quote(table)} WHERE ${where}`);
	await tx.query(
		`UPDATE public.crews SET reference_only=true,origin_company_id=$1,deleted_at=coalesce(deleted_at,now()) WHERE ${has("id", "crew_owner")}`,
		[targetCompany],
	);
	await tx.query(
		`UPDATE public.employees SET reference_only=true,origin_company_id=$1,status='inactive',hourly_cents=NULL,deleted_at=coalesce(deleted_at,now()),email='',phone='',skills='' WHERE ${has("id", "employee_owner")}`,
		[targetCompany],
	);
	for (const schema of ["public", targetSchema]) {
		const q = quote(schema);
		await tx.exec(
			`UPDATE ${q}.visits v SET assignment_review_required=true,assignment_review_reason='Distribución empresarial: selecciona una cuadrilla y personal propios antes de iniciar.',revision=revision+1 WHERE v.status='scheduled' AND (EXISTS(SELECT 1 FROM ${q}.crews c WHERE c.id=v.crew_id AND c.reference_only) OR EXISTS(SELECT 1 FROM ${q}.visit_personnel p JOIN ${q}.employees e ON e.id=p.employee_id WHERE p.visit_id=v.id AND e.reference_only));`,
		);
		for (const table of [
			"customer_audit",
			"service_audit",
			"change_history",
			"activity",
		])
			await tx.query(
				`SELECT setval(pg_get_serial_sequence($1,'id'),greatest(coalesce((SELECT max(id) FROM ${q}.${table}),0),1),(SELECT count(*)>0 FROM ${q}.${table}))`,
				[`${schema}.${table}`],
			);
		const counts = await portfolioCounts(tx, schema);
		await tx.query(
			`UPDATE ${q}.sample_data_batches SET manifest=manifest||$1::jsonb`,
			[
				JSON.stringify({
					...counts,
					distributed: true,
					distribution: "enterprise-v1",
				}),
			],
		);
	}
	const source = await portfolioCounts(tx),
		destination = await portfolioCounts(tx, targetSchema);
	for (const key of Object.keys(before))
		if (BigInt(source[key]) + BigInt(destination[key]) !== BigInt(before[key]))
			throw Error(`Conservation failed: ${key}`);
	for (const table of baselineTables) {
		const keys = {
			property_photo_data: ["photo_id"],
			estimate_revisions: ["estimate_id", "revision"],
			contract_baselines: ["contract_id", "version"],
		}[table] || ["id"];
		const overlap = (
			await tx.query(
				`SELECT count(*)::int n FROM public.${table} a JOIN ${target}.${table} b USING(${keys.join(",")})`,
			)
		).rows[0].n;
		if (overlap) throw Error(`Duplicate ownership: ${table}`);
	}
	return {
		before,
		source,
		destination,
		movedCustomerIds: customerIds,
		liveCrewIds: chosen.crews,
		liveEmployeeIds: chosen.employees,
	};
}
