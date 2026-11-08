import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalPageRedirect } from "../src/modules/identity/canonical.mjs";

const env = {
	VERCEL: "1",
	APP_AUTH_ENABLED: "true",
	BETTER_AUTH_URL: "https://stable.example.invalid",
	VERCEL_URL: "deployment.example.invalid",
};
test("deployment pages use the configured Google origin while preserving route and ordinary filters", () => {
	assert.equal(
		canonicalPageRedirect(
			"https://deployment.example.invalid/contratos?cliente=42&_vercel_share=private",
			"GET",
			env,
		),
		"https://stable.example.invalid/contratos?cliente=42",
	);
	assert.equal(
		canonicalPageRedirect("https://deployment.example.invalid/", "HEAD", env),
		"https://stable.example.invalid/",
	);
	assert.equal(
		canonicalPageRedirect("https://stable.example.invalid/", "GET", env),
		null,
	);
});
test("canonical routing never redirects APIs, writes, assets, unknown hosts or local evaluation", () => {
	for (const path of [
		"/api/auth/sign-in/social",
		"/_next/static/app.js",
		"/robots.txt",
	])
		assert.equal(
			canonicalPageRedirect(
				`https://deployment.example.invalid${path}`,
				"GET",
				env,
			),
			null,
		);
	assert.equal(
		canonicalPageRedirect("https://deployment.example.invalid/", "POST", env),
		null,
	);
	assert.equal(
		canonicalPageRedirect("https://evil.example.invalid/", "GET", env),
		null,
	);
	assert.equal(
		canonicalPageRedirect("https://deployment.example.invalid/", "GET", {
			...env,
			VERCEL: "",
		}),
		null,
	);
	assert.equal(
		canonicalPageRedirect("https://deployment.example.invalid/", "GET", {
			...env,
			APP_AUTH_ENABLED: "false",
		}),
		null,
	);
	assert.equal(
		canonicalPageRedirect("https://deployment.example.invalid/", "GET", {
			...env,
			BETTER_AUTH_URL: "https://user:secret@evil.example.invalid",
		}),
		null,
	);
});
