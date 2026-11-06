# Verification — B05 accepted offer lifecycle

B05 local lint/types pass, npm audit reports zero vulnerabilities. The isolated development-server suite passes 39/39 tests, including 6 transactional lifecycle/validity scenarios and the HTTP offer → received acceptance → single draft contract workflow. Finance-read/worker-denial and cross-origin checks remain covered. PGlite duplicate binding tests exercise adapter serialization, not independent PostgreSQL connection contention.

The mobile browser issued a USD25/visit, four-visits USD100/month synthetic offer and recorded received written acceptance, preserving it on reopening. The browser confirmation adapter then blocked the final visual binding action. Binding passed service and HTTP tests; browser completion is not claimed. The UI now uses an inline review checkbox instead of a JavaScript confirmation for binding. No hosted customer fixtures were written. The isolated in-memory server was stopped.

Current workstation build compiled and passed TypeScript, then failed prerendering /integraciones with Windows EPERM mkdir .next/server/app/integraciones.segments/$d$section. This environment issue remains open. Production CI/Preview evidence is recorded in the release report after publication.

Historical evidence follows.

# Verification — scope correction and estimate drafts

Current local checks for the approved B00/B01/B04 increment: lint and TypeScript
passed; npm audit reported zero vulnerabilities; 32/32 tests passed using
LANDSCAPE_TEST_DEV=true, including isolated HTTP workflows. This is explicitly a
development-server run, not the default production-start run.

Local production builds compiled/typechecked but encountered Windows EPERM while
recreating generated .next folders (including API and prerender segment paths).
Preparing generated directories did not establish repeatable clean production
builds. Do not call that workstation issue fixed. Production CI evidence is
recorded separately in the release report/canonical Notion after publication.

Mobile browser at 390×844: page width 375, no horizontal overflow. Created a rate,
selected a 150 ft² zone, calculated 1.50 person-hours at USD20/h, saved USD30 cost /
USD37.50 price at 20% margin, reloaded, edited the margin, and selected revision 1
to confirm its original price. Fixtures existed only in an isolated in-memory
local server which was stopped after verification. No hosted fixtures inserted.

Regression cases revoke worker list/direct property access after archived visits,
contracts, localities or crews; inactive/disabled membership and lost crew linkage.
Estimate tests cover dimensional conversion, margin versus markup, pending costs,
source/draft revision conflicts, snapshot history and archive preservation.
They do not certify real Google login, tenant isolation, PostgreSQL restore,
multi-connection contention, road routing or production capacity.

The sections below preserve earlier foundation evidence; their counts and scope
are historical and do not describe the complete current application.

# Historical foundation evidence — Mission 001 verification notes

Baseline: origin https://github.com/NeuraTec-Corporation/neura-landscape.git
Initial main: bd38a638226579d0f4571cdeb8d53f19f3a0a910
Local branch: feat/bootstrap-foundation. Local source history only; no push, merge or deployment.
Tools: Git 2.55.0.windows.3, Node 24.19.0, npm 11.17.0.

Initial directory was not a repository. Cloned an isolated checkout under work/neura-landscape.
Only README.md and .gitignore existed; no repository AGENTS.md was present.

Commands used (diagnostics and implementation):
- Get-Location; git rev-parse --show-toplevel; git remote -v; git status --short --branch
- git --version; node --version; npm --version; rg --files --hidden -g '!.git/**'
- git clone https://github.com/NeuraTec-Corporation/neura-landscape.git work/neura-landscape
- git log -1 --oneline; git switch -c feat/bootstrap-foundation
- npm view next version; npm view react version; npm view eslint-config-next version
- npm init -y; npm install --save-exact next@16.4.3 react@19.3.1 react-dom@19.3.1
- npm install --save-dev --save-exact typescript @types/node @types/react @types/react-dom eslint@9 eslint-config-next@16.4.3
- npm audit --json
- Evaluated eslint@10.14.0; rejected due to plugin peer constraints; restored 9.39.5.
- npm install --package-lock-only --ignore-scripts --fetch-retries=0 --fetch-timeout=20000
- npm ci --fetch-retries=0 --fetch-timeout=20000
- npm run lint; npm run typecheck; npm run build; npm test
- git diff --check; git status --short --branch; git rev-parse main; git rev-parse HEAD

Recovery: first clone needed network access, granted for the turn. First build failed
because npm init set CommonJS; changed type to module. Windows EPERM interrupted an
ESLint adjustment; moved the generated node_modules to a workspace scratch directory
and reconstructed dependencies with npm ci. Source files were preserved.

Historical audit: the initial ESLint toolchain reported 16 moderate development
findings associated with minimatch. The supported replacement is pinned Biome
2.6.4; ESLint and eslint-config-next were removed, without forced overrides or
downgrades. Node type declarations now match runtime major 24. Installation audit
reported zero vulnerabilities. Final reproducible-install and verification results
are recorded in the delivered logs.

Scope of tests: HTTP production smoke tests and current lint boundary policy.
No browser visual, load, authentication, tenant isolation or database tests claimed.

Final validation: npm run verify exited 0 (lint 0 warnings, strict TypeScript,
optimized build, 5 tests passed / 0 failed). npm audit --omit=dev --json exited 0
with zero production vulnerabilities. npm ls --depth=0 exited 0.
The typecheck script explicitly generates Next.js route types so it also works
before the first build on a clean checkout.

Revalidation incident: a repeat build hit Windows EPERM while recreating .next
prerender directories. The generated cache was moved to workspace scratch and the
full verification was rerun from a fresh .next directory. This workstation can
require cache reconstruction after permission errors; never treat EPERM as a pass.

Toolchain correction commands: npm install; npm ci; npm run verify; npm audit
--json; npm audit --omit=dev --json; git diff --check. Biome boundary tests use
short-lived probe files with guaranteed finally cleanup, not extra working copies.

Toolchain correction validation: npm install completed and removed 328 packages.
Both npm audit --json and npm audit --omit=dev --json exited 0 with zero findings.
npm run verify exited 0: Biome lint, route type generation, TypeScript, optimized
Next.js build, and 6/6 tests. A useTemplate informational diagnostic in the probe
helper was corrected; the final separate npm run lint was clean. npm ci locally
hit Windows EPERM while recreating node_modules/@types/node; npm install restored
the same dependency directory successfully. No backup folder or alternate checkout
was created. A successful clean npm ci is still required in the remote build.
