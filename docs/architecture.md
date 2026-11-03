# Landscape application boundaries

Current incremental model: one modular Next.js application, the existing PostgreSQL database, and the existing feature branch. No second product, Core clone or microservice was introduced.

| Boundary | Ownership |
| --- | --- |
| src/app | Routes, transport and UI composition |
| src/modules/customers | Project-owned customer contracts and persistence |
| src/modules/operations | Existing properties, contracts, visits, workforce and cost services |
| src/modules/identity | Session membership and resource authorization |
| src/modules/estimates | Typed mowing rate/calculation contract and versioned draft estimates |
| src/shared/ui | Project-neutral presentation |
| src/integrations | Reserved provider boundary; no live incumbent connector |
| db/migrations | Additive versioned PostgreSQL schema |

Estimates has two public entry points: index.ts for server cases and contract.ts for
pure validated types/calculation shared with the preview UI. Its structural database
port accepts existing PostgreSQL/PGlite adapters. It does not import Next.js, corporate
packages or operations internals. It queries the existing locality/zone tables through
that port; those records are not duplicated. UI previews are advisory: the server
re-reads sources, checks their revisions and stores the authoritative snapshot.

TypeScript checks the new estimates implementation directly. Older .mjs domains
still rely on runtime validation/tests and declaration files; strict TypeScript does
not establish type coverage for every existing module. Boundary tests currently
enforce shared/integration restrictions, not the complete future module graph.

Both assignedWork and assignedProperty use one authorization scope requiring active
worker/crew-lead membership, a current crew link, undeleted pending/in-progress visit,
undeleted active contract/locality and undeleted crew. An archived assignment alone
cannot authorize property or photo reads.

Google individual authentication remains unconfigured/off in the hosted evaluation;
Vercel Authentication protects it externally. Enabled app-auth fails closed when not
configured. Per-role integration/tenant acceptance, real Google sessions, backup
restore, offline execution and multi-company isolation remain separate gates.

The existing operations module is still broad and identity still uses its database
entry point. These known boundaries will be extracted incrementally against public
contracts; this release does not claim adoption of a production corporate Core.
Landscape Intelligence, routing, telematics, stock, voice agents and automated offers
are not implemented by the estimate increment.
