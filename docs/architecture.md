# Landscape application boundaries

Current incremental model: one modular Next.js application, the existing PostgreSQL database, and the existing feature branch. No second product, Core clone or microservice was introduced.

| Boundary | Ownership |
| --- | --- |
| src/app | Routes, transport and UI composition |
| src/modules/customers | Project-owned customer contracts and persistence |
| src/modules/operations | Existing properties, contracts, visits, workforce and cost services |
| src/modules/identity | Session membership and resource authorization |
| src/modules/estimates | Typed mowing estimates, frozen offers and received acceptance |
| src/shared/ui | Project-neutral presentation |
| src/integrations | Reserved provider boundary; no live incumbent connector |
| db/migrations | Additive versioned PostgreSQL schema |

Estimates has two public entry points: index.ts for server cases and contract.ts for
pure validated types/calculation shared with the preview UI. Its structural database
port accepts existing PostgreSQL/PGlite adapters. It does not import Next.js or corporate packages. B05 invokes the public operations applyAcceptedOffer port for contract writes; operations owns contract and baseline transactions. lifecycle-contract.ts publishes the cross-module immutable offer shape, with type-only imports. No domain imports operations internals. It queries the existing locality/zone tables through
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

Google identity is configured in the protected branch Preview. The IT account
login/logout/re-entry was verified before SEC01. SEC01 adds company-scoped
profiles and server-enforced capabilities; see docs/security.md for contracts
and limits. Other real-role sessions, operational tenant isolation, restore
and offline execution remain separate acceptance gates.

The existing operations module is still broad and identity still uses its database
entry point. These known boundaries will be extracted incrementally against public
contracts; this release does not claim adoption of a production corporate Core.
Landscape Intelligence, routing, telematics, stock, voice agents and automated offers
are not implemented by the estimate increment.

B05 transport dispatches issue/accept/withdraw/decline/bind through the existing protected estimates API. Every mutation requires the managing role server-side. Finance can read; workers cannot read estimate costs. Acceptance does not infer a real client login. Commercial offer details omit internal cost breakdown; internal managers retain snapshot visibility. Same checkout, feature branch, database and Preview project.

SEC01 supersedes earlier role/login scope statements: see [security.md](security.md). The current delivery remains a single operational company; profile/membership isolation is not operational multi-tenancy.
