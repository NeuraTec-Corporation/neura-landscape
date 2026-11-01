# Architecture — local foundation proposal

Status: proposed technical baseline; corporate acceptance remains in Notion.

A single Next.js App Router application with strict TypeScript. No monorepo tooling,
UI framework, database, authentication or external runtime service is needed.

| Boundary | Responsibility | Allowed dependencies |
| --- | --- | --- |
| src/app | Routing, metadata, page composition | shared public UI; future module public APIs |
| src/shared/ui | Project-neutral presentation, public index.ts | React and same-boundary components |
| src/integrations | Future adapters to approved corporate packages | Approved versioned contracts; no routes or vertical internals |
| src/modules/<capability> (future) | Vertical capability with public index.ts | shared; approved integration ports; other modules only through public contracts |

Shared code cannot import app, business modules or integrations. Integrations cannot
import routes, vertical modules or UI. Biome enforces these current alias limits
and upward relative imports. Future modules need dependency/cycle checks
before implementation; this scaffold does not claim complete architectural enforcement.

NeuraTec Core is not reimplemented here. Reuse requires an approved package and
immutable version, canonical contract, provenance/license review, isolated settings,
compatibility evidence and acceptance. Customer Core and tenant authorization must
be designed and tested before any customer data or multi-tenant capability.

Server Components by default; no client state or external fonts. CSS is local.
Noindex metadata, global X-Robots-Tag and robots.txt discourage indexing; they do
not authenticate users. Local servers bind to loopback. Exposure requires a later
access-control review and explicit publication approval.

Technical choice follows the Next.js installation and headers documentation:
https://nextjs.org/docs/app/getting-started/installation
https://nextjs.org/docs/app/api-reference/config/next-config-js/headers

Rollback: foundation changes are kept on feat/bootstrap-foundation; main remains at the
initial commit. Review and selectively revert branch files if needed. Generated
node_modules and .next can be rebuilt using npm ci and npm run build.

Lint uses pinned Biome 2.6.4 recommended rules and explicit noRestrictedImports
overrides. Next.js supports Biome as a linter. TypeScript remains a separate strict
check. This is not an assertion that every ESLint plugin rule is reproduced.
Boundary tests exercise denied aliases/relative paths, re-exports, dynamic imports
and allowed UI composition against the actual CLI configuration.
