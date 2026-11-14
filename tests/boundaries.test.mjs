import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const biome = require.resolve("@biomejs/biome/bin/biome");
function lint(source, filePath) {
	const fixture = join(dirname(filePath), `.boundary-probe-${randomUUID()}.ts`);
	writeFileSync(fixture, source);
	try {
		const result = spawnSync(
			process.execPath,
			[
				biome,
				"lint",
				fixture,
				"--only=style/noRestrictedImports",
				"--reporter=json",
			],
			{ encoding: "utf8" },
		);
		assert.ifError(result.error);
		assert.ok(result.status === 0 || result.status === 1, result.stderr);
		const report = JSON.parse(result.stdout);
		return {
			status: result.status,
			restricted: report.diagnostics.some(
				(entry) => entry.category === "lint/style/noRestrictedImports",
			),
		};
	} finally {
		rmSync(fixture);
	}
}
test("shared UI blocks aliases, upward imports, re-exports and dynamic imports", () => {
	for (const source of [
		"@/app/page",
		"@/integrations/core",
		"@/modules/customer",
		"../../app/page",
	]) {
		for (const statement of [
			`import value from '${source}';`,
			`export { value } from '${source}';`,
			`const value = import('${source}');`,
		]) {
			const diagnostics = lint(statement, "src/shared/ui/boundary-probe.ts");
			assert.equal(diagnostics.status, 1, statement);
			assert.ok(diagnostics.restricted, statement);
		}
	}
});
test("integration adapters cannot depend on vertical or route internals", () => {
	for (const source of [
		"@/modules/customer/internal",
		"@/app/page",
		"@/shared/ui",
		"../app/page",
	]) {
		assert.ok(
			lint(
				`import value from '${source}';`,
				"src/integrations/boundary-probe.ts",
			).restricted,
			source,
		);
	}
});
test("allowed presentation dependencies and composition stay available", () => {
	for (const [source, filePath] of [
		["react", "src/shared/ui/boundary-probe.ts"],
		["./experimental-notice", "src/shared/ui/boundary-probe.ts"],
		["@/shared/ui", "src/app/boundary-probe.ts"],
	]) {
		const result = lint(`import value from '${source}';`, filePath);
		assert.equal(result.status, 0, source);
		assert.equal(result.restricted, false, source);
	}
});

test("security kernel rejects framework, identity provider, database driver and vertical dependencies", () => {
	for (const source of [
		"next/server",
		"react",
		"better-auth",
		"pg",
		"@electric-sql/pglite",
		"@/app/api/_identity",
		"../operations/store.mjs",
	]) {
		assert.equal(
			lint(
				`import value from '${source}';`,
				"src/modules/security/boundary-probe.ts",
			).restricted,
			true,
			source,
		);
	}
	for (const source of ["node:crypto", "./policy.mjs"]) {
		assert.equal(
			lint(
				`import value from '${source}';`,
				"src/modules/security/boundary-probe.ts",
			).restricted,
			false,
			source,
		);
	}
});
