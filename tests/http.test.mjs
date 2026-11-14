import sharp from "sharp";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { after, before, test } from "node:test";

let server;
let base;
let output = "";
before(async () => {
	const socket = createServer();
	socket.listen(0, "127.0.0.1");
	await once(socket, "listening");
	const port = socket.address().port;
	await new Promise((resolve) => socket.close(resolve));
	base = `http://127.0.0.1:${port}`;
	server = spawn(
		process.execPath,
		[
			"node_modules/next/dist/bin/next",
			process.env.LANDSCAPE_TEST_DEV === "true" ? "dev" : "start",
			...(process.env.LANDSCAPE_TEST_DEV === "true" ? ["--webpack"] : []),
			"--hostname",
			"127.0.0.1",
			"--port",
			String(port),
		],
		{
			env: {
				...process.env,
				NEXT_TELEMETRY_DISABLED: "1",
				LANDSCAPE_DATA_DIR: "memory://",
				DATABASE_URL: "",
				VERCEL: "",
				VERCEL_ENV: "",
				MIGRATE_ON_START: "",
				APP_AUTH_ENABLED: "false",
				BLOB_STORE_ID: "",
				BLOB_READ_WRITE_TOKEN: "",
				LANDSCAPE_IT_ADMIN_EMAIL: "",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	server.stdout.on("data", (data) => {
		output += data;
	});
	server.stderr.on("data", (data) => {
		output += data;
	});
	let failure;
	server.on("error", (error) => {
		failure = error;
	});
	for (
		let attempt = 0;
		attempt < (process.env.LANDSCAPE_TEST_DEV === "true" ? 300 : 100);
		attempt++
	) {
		if (failure || server.exitCode !== null)
			throw new Error(`Server failed: ${failure ?? output}`);
		try {
			if ((await fetch(base)).ok) return;
		} catch {
			/* Wait for readiness. */
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(`Server readiness timeout: ${output}`);
});
after(async () => {
	if (server && server.exitCode === null) {
		const stopped = once(server, "exit");
		server.kill();
		await stopped;
	}
});
test("home serves experimental Spanish content with noindex metadata", async () => {
	const response = await fetch(base);
	assert.equal(response.status, 200);
	const html = await response.text();
	assert.match(html, /<html lang="es"/);
	assert.match(html, /Neura Landscape/);
	assert.match(html, /Acceso anticipado/);
	assert.match(html, /<meta name="robots" content="[^"]*noindex[^"]*"/);
	assert.match(html, /Command Center/);
	assert.match(html, /OPERATIONS WORKSPACE/);
	assert.match(html, /aria-current="page"/);
});
test("home, robots and missing routes carry the noindex header", async () => {
	for (const path of ["/", "/robots.txt", "/missing-mission-001"]) {
		const response = await fetch(`${base}${path}`);
		assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
		assert.equal(response.status, path.includes("missing") ? 404 : 200);
	}
});
test("robots.txt disallows all crawlers", async () => {
	const response = await fetch(`${base}/robots.txt`);
	const body = await response.text();
	assert.match(body, /User-Agent: \*/i);
	assert.match(body, /Disallow: \//);
});

test("prototype routes expose distinct screens and retain noindex", async () => {
	for (const [path, content] of [
		["clientes", "Clientes"],
		["contratos", "Contratos"],
		["presupuestos", "Presupuestos"],
		["propiedades", "Propiedades"],
		["agenda", "Trabajos y agenda"],
		["control", "Panel gerencial"],
		["cuadrillas", "Cuadrillas"],
		["empleados", "Empleados"],
		["costos", "Costos"],
		["facturacion", "Facturas y cobros"],
		["configuracion", "Configuración"],
		["integraciones", "Integraciones"],
		["usuarios", "Usuarios y permisos"],
        ["empresas", "Empresas"],
	]) {
		const response = await fetch(`${base}/${path}`);
		assert.equal(response.status, 200, path);
		assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
		const html = await response.text();
		assert.ok(html.includes(content), path);
		assert.match(html, /Abrir menú/);
		assert.match(html, /OPERATIONS WORKSPACE/);
	}
});

test("HTTP workflow saves related records and computes completed visit costs", async () => {
	async function post(input, expected = 201, extra = {}) {
		const response = await fetch(`${base}/api/operations`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: base, ...extra },
			body: JSON.stringify(input),
		});
		const value = await response.json();
		assert.equal(response.status, expected, JSON.stringify(value));
		return value;
	}
	await post({ action: "customer", name: "Rejected" }, 403, {
		Origin: "https://external.invalid",
	});
	await post({ action: "customer", name: "" }, 422);
	const customerResponse = await fetch(`${base}/api/customers`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: base },
		body: JSON.stringify({
			kind: "person",
			first_name: "Cliente",
			last_name: "HTTP",
			company_name: "",
			status: "active",
			marital_status: "",
			language: "es",
			timezone: "America/New_York",
			notes: "",
			contacts: [
				{
					first_name: "Cliente",
					last_name: "HTTP",
					relationship: "self",
					roles: ["primary", "signer"],
					phone_mobile: "+12015550123",
					phone_home: "",
					phone_office: "",
					email: "http@example.invalid",
					preferred_channel: "call",
					preferred_phone: "mobile",
					contact_from: "09:00",
					contact_to: "17:00",
					consent_sms: false,
					consent_whatsapp: false,
					consent_email: false,
				},
			],
			addresses: [
				{
					label: "home",
					line1: "12 Test Street",
					line2: "",
					city: "Newark",
					region: "NJ",
					postal_code: "07102",
					country: "US",
					latitude: null,
					longitude: null,
					place_id: "",
				},
			],
		}),
	});
	assert.equal(customerResponse.status, 201);
	const customer = await customerResponse.json();
	await post(
		{ action: "property", customer_id: customer.id, name: "Incomplete" },
		422,
	);
	const propertyResponse = await fetch(`${base}/api/properties`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: base },
		body: JSON.stringify({
			customer_id: customer.id,
			name: "Jardín HTTP",
			code: "HTTP-1",
			kind: "residential",
			status: "active",
			line1: "12 Test Street",
			line2: "",
			city: "Newark",
			region: "NJ",
			postal_code: "07102",
			country: "US",
			latitude: null,
			longitude: null,
			contact_name: "",
			contact_phone: "",
			lawn_sqft: 1000,
			garden_sqft: null,
			paved_sqft: null,
			access_instructions: "",
			service_hours: "",
			notes: "",
		}),
	});
	assert.equal(propertyResponse.status, 201);
	const property = await propertyResponse.json();
	const customerLocations = await (
		await fetch(`${base}/api/properties?customer_id=${customer.id}`)
	).json();
	assert.equal(customerLocations.length, 1);
	assert.equal(customerLocations[0].city, "NEWARK");
	const contractResponse = await fetch(`${base}/api/contracts`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: base },
		body: JSON.stringify({
			property_id: property.id,
			service: "Corte",
			frequency: "Semanal",
			monthly: 400,
			visits_per_month: 4,
			estimated_minutes: 30,
			status: "active",
		}),
	});
	assert.equal(contractResponse.status, 200);
	const contract = await contractResponse.json();
	const linked = await (await fetch(`${base}/api/contracts`)).json();
	assert.equal(linked[0].customer_name, "CLIENTE HTTP");
	assert.equal(linked[0].property_id, property.id);
	async function manage(area, input, expected = 200) {
		const r = await fetch(`${base}/api/management?area=${area}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: base },
			body: JSON.stringify(input),
		});
		const v = await r.json();
		assert.equal(r.status, expected, JSON.stringify(v));
		return v;
	}
	const one = await manage("workforce", {
		entity: "employee",
		first_name: "Persona",
		last_name: "Uno",
		email: "",
		phone: "",
		role_key: "operator",
		skills: "",
		hourly: 20,
		status: "active",
	});
	const two = await manage("workforce", {
		entity: "employee",
		first_name: "Persona",
		last_name: "Dos",
		email: "",
		phone: "",
		role_key: "leader",
		skills: "",
		hourly: 20,
		status: "active",
	});
	const crew = await manage("workforce", {
		entity: "crew",
		name: "Equipo HTTP",
		shift_start: "08:00",
		shift_end: "17:00",
		break_minutes: 30,
		members: [
			{ employee_id: one.id, duty: "operator" },
			{ employee_id: two.id, duty: "leader" },
		],
	});
	const visit = await manage("visits", {
		action: "save",
		contract_id: contract.id,
		crew_id: crew.id,
		title: "Corte de césped",
		scheduled_at: "2026-11-02T15:00:00Z",
		planned_minutes: 60,
		travel_minutes: 0,
		tasks: [
			{
				service_key: "mowing",
				description: "Cortar el césped frontal",
				element_id: null,
				employee_id: one.id,
				quantity: 1000,
				unit: "sqft",
			},
		],
	});
	const visits = await (
		await fetch(`${base}/api/management?area=visits`)
	).json();
	await manage("visits", { action: "start", id: visit.id, revision: 1 });
	await manage("visits", {
		action: "complete",
		id: visit.id,
		revision: 2,
		notes: "Ejecución de prueba HTTP",
		personnel: [
			{ employee_id: one.id, actual_minutes: 60 },
			{ employee_id: two.id, actual_minutes: 60 },
		],
		tasks: [
			{
				id: visits[0].tasks[0].id,
				completed_quantity: 1000,
				status: "done",
				notes: "",
			},
		],
	});
	await manage("costs", {
		id: visit.id,
		revision: 3,
		reason: "Consumos de prueba HTTP",
		lines: [
			{
				category: "materials",
				description: "Materiales",
				quantity: 1,
				unit_price: 10,
			},
			{
				category: "equipment",
				description: "Equipo",
				quantity: 1,
				unit_price: 5,
			},
			{
				category: "travel",
				description: "Traslado",
				quantity: 1,
				unit_price: 5,
			},
			{
				category: "overhead",
				description: "Indirectos",
				quantity: 1,
				unit_price: 10,
			},
		],
	});
	const response = await fetch(`${base}/api/operations`);
	assert.equal(response.status, 200);
	const state = await response.json();
	assert.equal(state.customers.length, 1);
	assert.equal(state.visits[0].status, "completed");
	assert.deepEqual(state.visits[0].profitability, {
		cost_cents: 7000,
		revenue_cents: 10000,
		contribution_cents: 3000,
		margin: 30,
	});
	await manage("visits", { action: "start", id: visit.id, revision: 4 }, 422);
	const after = await (await fetch(`${base}/api/operations`)).json();
	assert.equal(after.visits[0].profitability.cost_cents, 7000);
	assert.equal((await fetch(`${base}/api/contracts?month=`)).status, 400);
	const dashboard = await (
		await fetch(
			`${base}/api/management?area=dashboard&from=2026-11-01&to=2026-11-30&service=mowing`,
		)
	).json();
	assert.equal(dashboard.summary.completed, 1);
	assert.equal(dashboard.production[0].quantity, 1000);
	const report = await (
		await fetch(`${base}/api/contracts?month=2026-11`)
	).json();
	assert.equal(report[0].completed, 1);
	assert.equal(report[0].total_cost_cents, 7000);
	const zoneResponse = await fetch(`${base}/api/survey`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: base },
		body: JSON.stringify({
			entity: "zone",
			property_id: property.id,
			name: "Jardín frontal",
			kind: "lawn",
			area: 150,
			unit: "sqft",
			measurement_status: "measured",
			latitude: null,
			longitude: null,
			notes: "Medición de campo",
		}),
	});
	assert.equal(zoneResponse.status, 200);
	const zone = await zoneResponse.json();
	const picture = await sharp({
		create: { width: 40, height: 30, channels: 3, background: "#405c38" },
	})
		.jpeg()
		.toBuffer();
	const photoResponse = await fetch(
		`${base}/api/photos?property_id=${property.id}&zone_id=${zone.id}&viewpoint=front&caption=Vista%20frontal`,
		{
			method: "POST",
			headers: { "Content-Type": "application/octet-stream", Origin: base },
			body: picture,
		},
	);
	assert.equal(photoResponse.status, 200);
	const photo = await photoResponse.json();
	const image = await fetch(`${base}/api/photos?id=${photo.id}`);
	assert.equal(image.status, 200);
	assert.match(image.headers.get("content-type"), /image\/jpeg/);
	assert.match(image.headers.get("cache-control"), /private/);
	assert.ok((await image.arrayBuffer()).byteLength > 0);
	const forbiddenImage = await fetch(`${base}/api/photos?id=${photo.id}`, {
		headers: { Origin: "https://external.invalid" },
	});
	assert.equal(forbiddenImage.status, 403);
	const dossier = await (
		await fetch(`${base}/api/survey?property_id=${property.id}`)
	).json();
	assert.equal(dossier.zones[0].name, "Jardín frontal");
	assert.equal(dossier.photos.length, 1);
	assert.equal(dossier.uploadReady, true);
	assert.equal((await fetch(`${base}/api/auth/ok`)).status, 503);
	const denied = await fetch(`${base}/api/contracts`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Origin: "https://external.invalid",
		},
		body: JSON.stringify({ action: "delete", id: contract.id, revision: 1 }),
	});
	assert.equal(denied.status, 403);
});

test("estimate HTTP workflow persists calculations and historical rates without changing contracts", async () => {
	const get = await fetch(`${base}/api/estimates`);
	assert.equal(get.status, 200);
	assert.match(get.headers.get("cache-control"), /no-store/);
	const workspace = await get.json(),
		property = workspace.properties.find(
			(p) => p.name.toUpperCase() === "JARDÍN HTTP",
		),
		zone = workspace.zones.find((z) => z.property_id === property.id);
	assert.ok(zone);
	assert.equal(workspace.canEdit, true);
	const post = async (input) => {
		const r = await fetch(`${base}/api/estimates`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: base },
			body: JSON.stringify(input),
		});
		const v = await r.json();
		assert.equal(r.status, 200, JSON.stringify(v));
		return v;
	};
	const rateInput = {
		action: "rate",
		name: "Rendimiento HTTP",
		unit: "sqft",
		quantity_per_person_hour: 100,
		setup_person_minutes: 0,
		source: "Medición sintética HTTP",
		confidence: "estimated",
		active: true,
	};
	const rate = await post(rateInput);
	const input = {
		action: "save",
		property_id: property.id,
		title: "Presupuesto HTTP",
		rate_id: rate.id,
		rate_revision: 1,
		zone_ids: [zone.id],
		zone_revisions: { [zone.id]: zone.revision },
		areas_independent: true,
		resources_reviewed: true,
		labor_hourly: 20,
		overhead_percent: 0,
		margin_percent: 20,
		lines: [],
		reason: "Versión inicial HTTP",
		notes: "",
	};
	const contractCount = (await (await fetch(`${base}/api/contracts`)).json())
		.length;
	const saved = await post(input);
	assert.equal(saved.snapshot.calculation.price_cents, 3750);
	assert.equal(saved.revision, 1);
	await post({
		...rateInput,
		id: rate.id,
		revision: 1,
		quantity_per_person_hour: 200,
	});
	const current = await (await fetch(`${base}/api/estimates`)).json();
	assert.equal(
		current.estimates.find((e) => e.id === saved.id).snapshot.calculation
			.price_cents,
		3750,
	);
	const stale = await fetch(`${base}/api/estimates`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: base },
		body: JSON.stringify({ ...input, id: saved.id, revision: 1 }),
	});
	assert.equal(stale.status, 409);
	assert.equal(
		(await (await fetch(`${base}/api/contracts`)).json()).length,
		contractCount,
	);
	assert.equal(
		(
			await fetch(`${base}/api/estimates`, {
				headers: { Origin: "https://external.invalid" },
			})
		).status,
		403,
	);
	assert.equal(
		(
			await fetch(`${base}/api/estimates`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: base },
				body: "{",
			})
		).status,
		400,
	);
});

test("offer HTTP lifecycle creates a single linked contract and exposes accepted baseline history", async () => {
	const post = async (body) => {
		const r = await fetch(`${base}/api/estimates`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: base },
			body: JSON.stringify(body),
		});
		const v = await r.json();
		assert.equal(r.status, 200, JSON.stringify(v));
		return v;
	};
	const ws = await (await fetch(`${base}/api/estimates`)).json();
	const e = ws.estimates.find((e) => e.title === "Presupuesto HTTP");
	assert.ok(e);
	const today = new Date().toLocaleDateString("sv-SE", {
		timeZone: "America/New_York",
	});
	const offered = await post({
		action: "issue",
		id: e.id,
		revision: e.revision,
		terms: {
			valid_until: today,
			start_date: today,
			end_date: "",
			frequency: "Semanal",
			visits_per_month: 4,
			estimated_minutes: 30,
			billing_timing: "advance",
			due_days: 15,
			scope: "Corte de césped HTTP",
			exclusions: "Sin poda",
			payment_terms: "Cuota mensual sintética QA",
			reviewed: true,
		},
	});
	await post({
		action: "accept",
		offer_id: offered.id,
		revision: 1,
		accepted_by: "Titular HTTP QA",
		authority: "Representante autorizado QA",
		accepted_at: new Date().toISOString(),
		evidence_method: "written_confirmation",
		evidence_reference: "Prueba HTTP sintética local",
		confirmed: true,
	});
	const linked = await post({
		action: "bind",
		offer_id: offered.id,
		revision: 2,
	});
	assert.equal(
		(await post({ action: "bind", offer_id: offered.id, revision: 2 })).id,
		linked.id,
	);
	const current = await (await fetch(`${base}/api/estimates`)).json();
	assert.equal(
		current.baselines.filter((b) => b.contract_id === linked.id).length,
		1,
	);
	const c = current.contracts.find((c) => c.id === linked.id);
	assert.equal(c.status, "draft");
	assert.equal(c.monthly_cents, 15000);
	assert.equal(c.source_offer_id, offered.id);
	const rejected = await fetch(`${base}/api/contracts`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: base },
		body: JSON.stringify({
			id: c.id,
			revision: c.revision,
			property_id: c.property_id,
			service: c.service,
			service_key: c.service_key,
			frequency: c.frequency,
			monthly: 200,
			visits_per_month: c.visits_per_month,
			estimated_minutes: c.estimated_minutes,
			status: "active",
		}),
	});
	assert.equal(rejected.status, 422);
	const page = await fetch(`${base}/presupuestos`);
	assert.equal(page.status, 200);
	assert.match(await page.text(), /Ofertas y acuerdos/);
});

test("UX01 sample API loads 33 customers and 78 locations once and rejects cross-origin writes", async () => {
	const post = async (origin) =>
		fetch(`${base}/api/sample-data`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: origin },
			body: JSON.stringify({ action: "load", confirmed: true }),
		});
	assert.equal((await post("https://external.invalid")).status, 403);
	const first = await post(base);
	assert.equal(first.status, 200);
	const a = await first.json();
	assert.equal(a.customers, 33);
	assert.equal(a.properties, 78);
	const second = await post(base);
	assert.equal(second.status, 200);
	assert.equal((await second.json()).replayed, true);
	const customers = await (await fetch(`${base}/api/customers`)).json();
	assert.equal(
		customers.filter((c) => c.sample_batch_id === "ux01-customers-v1").length,
		33,
	);
	const properties = await (await fetch(`${base}/api/properties`)).json();
	assert.equal(
		properties.filter((p) => p.sample_batch_id === "ux01-customers-v1").length,
		78,
	);
});

test("operational sample API populates the dashboard and isolates synthetic records", async () => {
	const response = await fetch(`${base}/api/sample-data`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: base },
		body: JSON.stringify({ action: "load_operations", confirmed: true }),
	});
	const r = await response.json();
	assert.equal(response.status, 200, JSON.stringify(r));
	assert.equal(r.operations.visits, 296);
	assert.equal(r.operations.estimates, 78);
	const get = await fetch(
		`${base}/api/management?area=dashboard&origin=sample&from=${r.operations.history_from}&to=${r.operations.to}`,
	);
	assert.equal(get.status, 200);
	const d = await get.json();
	assert.equal(d.portfolio.customers, 33);
	assert.equal(d.portfolio.active_contracts, 74);
	assert.ok(d.summary.completed > 0);
	assert.ok(d.production.length >= 7);
	assert.ok(d.summary.billed_cents > 0);
	assert.ok(d.summary.receivable_cents > 0);
});

test("security HTTP workflow stores profile grants and memberships atomically without changing company scope", async () => {
	const get = async () => {
		const r = await fetch(`${base}/api/users`);
		assert.equal(r.status, 200);
		return r.json();
	};
	const post = async (path, input, status = 200, origin = base) => {
		const r = await fetch(base + path, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: origin },
			body: JSON.stringify(input),
		});
		const v = await r.json();
		assert.equal(r.status, status, JSON.stringify(v));
		return v;
	};
	let data = await get();
	assert.equal(data.company.id, "landscape");
	assert.equal(data.profiles.length, 7);
	const profile = await post("/api/security", {
		action: "profile",
		name: "Consulta comercial",
		description: "Acceso de consulta",
		scope: "company",
		status: "active",
		grants: ["customers.read"],
		version: data.company.version,
	});
	data = await get();
	await post("/api/users", {
		email: "elena.navarro@example.invalid",
		name: "Elena Navarro",
		status: "active",
		profile_ids: [profile.id],
		crew_ids: [],
		version: data.company.version,
	});
	data = await get();
	const user = data.users.find(
		(u) => u.email === "elena.navarro@example.invalid",
	);
	assert.ok(user);
	assert.deepEqual(user.profile_ids, [profile.id]);
	await post(
		"/api/security",
		{
			action: "profile",
			id: profile.id,
			name: profile.name,
			description: "",
			scope: "company",
			status: "active",
			grants: ["customers.read"],
			version: 1,
		},
		409,
	);
	await post(
		"/api/security",
		{
			action: "profile",
			company_id: "another-company",
			version: data.company.version,
		},
		403,
	);
	await post(
		"/api/security",
		{
			action: "profile",
			id: "default-it_admin",
			name: "Otro",
			description: "",
			scope: "company",
			status: "active",
			grants: [],
			version: data.company.version,
		},
		409,
	);
	await post(
		"/api/security",
		{
			action: "profile",
			name: "No guardar",
			description: "",
			scope: "company",
			status: "active",
			grants: [],
			version: data.company.version,
		},
		403,
		"https://external.invalid",
	);
	await post(
		"/api/users",
		{
			email: user.email,
			name: user.name,
			status: "active",
			revision: user.revision,
			profile_ids: [],
			crew_ids: [],
			version: data.company.version,
		},
		422,
	);
	const unchanged = (await get()).users.find((u) => u.email === user.email);
	assert.equal(unchanged.revision, user.revision);
	await post("/api/security", {
		action: "profile",
		id: profile.id,
		name: profile.name,
		description: "Retirado",
		scope: "company",
		status: "retired",
		grants: ["customers.read"],
		version: data.company.version,
	});
	data = await get();
	assert.equal(
		data.profiles.find((p) => p.id === profile.id).status,
		"retired",
	);
	assert.ok(data.history.length >= 3);
});
