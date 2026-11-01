# Landscape application boundaries

| Boundary | Ownership |
| --- | --- |
| src/app | Routing, form composition and HTTP transport |
| src/modules/customers | Customer contract, validation, relational persistence and revision conflicts |
| src/modules/operations | Properties/contracts/crews/visits, costs, persistence adapters |
| src/shared/ui | Neutral presentation |
| src/integrations | Future approved external adapters |
| db/migrations | Versioned PostgreSQL schema |

Customer services have no Next.js, Vercel or Landscape property-table dependency.
The HTTP endpoint composes the public operations count with customer records.
UI imports customer types, not server services. Server-only Google Places key is
used by the address endpoint; no key is sent to the browser.

Hosted storage uses pg/PostgreSQL; development/isolated tests can use PGlite.
DATABASE_URL is mandatory on Vercel. SQL migrations are included in function tracing.
Host/same-Origin checks remain, and Vercel Authentication protects every deployment.
No local-filesystem hosted fallback or automatic local-data upload is permitted.

This release is a protected single-workspace customer/operations evaluation.
Application OIDC/RBAC, tenant isolation, delivery adapters, observability and backup
acceptance remain separate capabilities; no complete production-enterprise claim.

ARGOS/SAAC were read-only design references. No corporate repository or frozen source
was modified, cloned or copied. Current decisions/evidence remain in Landscape's
existing canonical Notion page. There is one active checkout and existing task branch.
