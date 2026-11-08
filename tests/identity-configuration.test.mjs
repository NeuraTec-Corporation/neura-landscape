import { test } from "node:test";
import assert from "node:assert/strict";
import {
	identityMode,
	identityReadiness,
} from "../src/modules/identity/configuration.mjs";
const complete = {
	APP_AUTH_ENABLED: "true",
	VERCEL: "1",
	VERCEL_ENV: "preview",
	GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
	GOOGLE_CLIENT_SECRET: "private-google-value",
	BETTER_AUTH_SECRET: "private-session-value-01234567890123456789",
	BETTER_AUTH_URL: "https://landscape.example.invalid",
	DATABASE_URL: "postgresql://user:password@example.invalid/landscape",
};
test("hosted identity requires an explicit mode and never grants production evaluation access", () => {
	assert.equal(identityMode({ VERCEL: "1", VERCEL_ENV: "preview" }), "blocked");
	assert.equal(
		identityMode({
			VERCEL: "1",
			VERCEL_ENV: "preview",
			APP_AUTH_ENABLED: "flase",
		}),
		"blocked",
	);
	assert.equal(
		identityMode({
			VERCEL: "1",
			VERCEL_ENV: "preview",
			APP_AUTH_ENABLED: "false",
		}),
		"evaluation",
	);
	assert.equal(
		identityMode({
			VERCEL: "1",
			VERCEL_ENV: "production",
			APP_AUTH_ENABLED: "false",
		}),
		"blocked",
	);
	assert.equal(identityMode(complete), "google");
	assert.equal(identityMode({}), "evaluation");
});
test("readiness reports missing configuration without disclosing secrets", () => {
	const status = identityReadiness(complete);
	assert.equal(status.ready, true);
	assert.equal(
		status.callbackUrl,
		"https://landscape.example.invalid/api/auth/callback/google",
	);
	for (const key of [
		"GOOGLE_CLIENT_SECRET",
		"BETTER_AUTH_SECRET",
		"DATABASE_URL",
	])
		assert.equal(JSON.stringify(status).includes(complete[key]), false);
	const missing = identityReadiness({ ...complete, GOOGLE_CLIENT_SECRET: "" });
	assert.equal(missing.ready, false);
	assert.deepEqual(missing.missing, ["GOOGLE_CLIENT_SECRET"]);
});
test("readiness rejects insecure hosted callbacks and malformed storage/session configuration", () => {
	for (const origin of [
		"http://landscape.example.invalid",
		"https://user:password@landscape.example.invalid",
		"https://landscape.example.invalid/api/auth",
		"https://landscape.example.invalid?secret=value",
		"https://landscape.example.invalid/#fragment",
	]) {
		const status = identityReadiness({ ...complete, BETTER_AUTH_URL: origin });
		assert.equal(status.ready, false);
		assert.equal(status.callbackUrl, null);
		assert.equal(JSON.stringify(status).includes("secret=value"), false);
	}
	assert.equal(
		identityReadiness({ ...complete, BETTER_AUTH_SECRET: "short" }).ready,
		false,
	);
	assert.equal(
		identityReadiness({ ...complete, DATABASE_URL: "file://local" }).ready,
		false,
	);
	assert.equal(
		identityReadiness({
			...complete,
			VERCEL: "",
			VERCEL_ENV: "",
			BETTER_AUTH_URL: "http://localhost:3000",
		}).ready,
		true,
	);
	assert.equal(
		identityReadiness({
			...complete,
			VERCEL: "",
			VERCEL_ENV: "",
			BETTER_AUTH_URL: "http://evil.example.invalid",
		}).ready,
		false,
	);
});
