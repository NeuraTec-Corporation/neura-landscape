import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { test } from "node:test";

test("Google mode renders an access gate and denies anonymous operational requests", async () => {
	const socket = createServer();
	socket.listen(0, "127.0.0.1");
	await once(socket, "listening");
	const port = socket.address().port;
	await new Promise((resolve) => socket.close(resolve));
	const base = `http://127.0.0.1:${port}`;
	const server = spawn(
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
				APP_AUTH_ENABLED: "true",
				GOOGLE_CLIENT_ID: "",
				GOOGLE_CLIENT_SECRET: "",
				DATABASE_URL: "",
				BETTER_AUTH_SECRET: "",
				BETTER_AUTH_URL: "",
				MIGRATE_ON_START: "",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let output = "";
	server.stdout.on("data", (data) => {
		output += data;
	});
	server.stderr.on("data", (data) => {
		output += data;
	});
	try {
		let response;
		for (let attempt = 0; attempt < 300; attempt++) {
			if (server.exitCode !== null) throw new Error(output);
			try {
				response = await fetch(base);
				if (response.ok) break;
			} catch {}
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
		assert.equal(response?.status, 200, output);
		const html = await response.text();
		assert.match(html, /Comprobando acceso/);
		assert.doesNotMatch(html, /aria-current="page"/);
		const me = await (await fetch(`${base}/api/me`)).json();
		assert.deepEqual(me, { enabled: true, configured: false, member: null });
		for (const path of [
			"/api/customers",
			"/api/contracts",
			"/api/users",
			"/api/management?area=visits",
		]) {
			assert.equal((await fetch(base + path)).status, 403, path);
		}
	} finally {
		if (server.exitCode === null) {
			const stopped = once(server, "exit");
			server.kill();
			await stopped;
		}
	}
});
