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
			"start",
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
	for (let attempt = 0; attempt < 100; attempt++) {
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
		["propiedades", "Propiedades"],
		["agenda", "Trabajos y agenda"],
		["control", "Panel gerencial"],
		["cuadrillas", "Cuadrillas"],
		["empleados", "Empleados"],
		["costos", "Costos"],
		["facturacion", "Facturación y cobros"],
		["configuracion", "Configuración"],
		["integraciones", "Integraciones"],
		["usuarios", "Usuarios y niveles"],
	]) {
		const response = await fetch(`${base}/${path}`);
		assert.equal(response.status, 200, path);
		assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
		const html = await response.text();
		assert.ok(html.includes(content), path);
		const activeLink = html.match(/<a\b[^>]*aria-current="page"[^>]*>/g) ?? [];
		assert.equal(activeLink.length, path === "control" ? 0 : 1, path);
		if (path !== "control")
			assert.ok(activeLink[0].includes(`href="/${path}"`), path);
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
	assert.equal(forbiddenImage.status, 404);
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
