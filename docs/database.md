## SEC06 — Distribution and resource ownership

018 adds reference-only ownership metadata and a visit-assignment review flag.
The runner applies that business delta to public and existing company namespaces;
new namespaces include it in bootstrap. 019 distinguishes platform/operator
companies, records successful one-time distributions and sanitized failure status.

The trusted Preview distribution transfers complete customer families: contacts,
addresses, reminders, surveys/photos, estimates/revisions/offers/baselines, contracts,
visits/tasks/personnel/costs, invoices/lines/payments and corresponding histories.
Original UUIDs, binary photo payloads, frozen snapshots, amounts and timestamps stay
unchanged. FK cycles between offers/contracts are reconstructed transactionally.
Static catalogs/rates/counters and synthetic-batch provenance are configuration;
company batch counts are reconciled after the split, without loading another scenario.

Live crew/person ownership is partitioned in connected groups so shared employees
are never split between live crews across companies. Reference-only archived rows
preserve already-recorded visit/personnel relationships and never enter live workforce
counts. Monetary totals, product row counts and disjoint customer/financial identifiers
must reconcile before commit. Source/dependent-row deletion is part of the same atomic
transfer; there is no intermediate published duplicate portfolio.

This is not a backup/restore drill. Transaction rollback is tested with an injected
failure after transfer and user creation; independent restore/concurrency acceptance
remains separate. No production setup flag or new database service is introduced.

## SEC05 — Company data namespaces (current)

Migration 017 adds the platform IT registry, company-storage mapping, membership display
names, authority levels and the general-administrator profile. Existing company
`landscape` remains in `public`; its business identifiers and records do not move.
New companies use generated `tenant_<UUID hex>` schemas in the same existing database.
Creation, empty schema bootstrap, default profiles, prefix reservation and audit commit
in one transaction. Failure rolls everything back. No new hosted service is provisioned.

Identity/session and security tables are shared. Business tables (customers, properties,
contracts, estimates, crews/personnel, visits/tasks/costs, invoices/payments, catalogs,
photo metadata and samples) are isolated by schema. The provider-wide media budget stays
shared deliberately. Private media retrieval first requires scoped photo metadata.

Bootstrap runs the trusted business SQL files 001–005 and 007–011 with **only** the new
namespace in search_path, so CREATE IF NOT EXISTS cannot resolve an existing company's
tables. It never replays identity or sample-identity migrations and never copies data.
Runtime uses transaction-local search_path; commit/rollback restores pooled connections.
A table/column/type/nullability manifest and foreign-key boundary check reject incomplete
or incompatible company schemas before requests. Invalid identifiers are rejected.

**Migration contract:** when future business migrations change the product structure,
upgrade every mapped company namespace transactionally before enabling its requests and
update bootstrap accordingly. The runtime fails closed on drift; it does not run a
request against public business tables as a compatibility fallback. Schema rollout and
restore drills across real production tenants remain operational acceptance work.

Isolated PGlite/PostgreSQL-engine fixtures verify duplicate prefixes/rollback, preservation
of existing data, duplicate IDs in separate companies, foreign-ID FK rejection, parallel
request contexts and restoration of search_path. These tests do not claim independent
PostgreSQL roles, RLS enforcement, penetration testing or production load certification.

# PostgreSQL schema and ownership

Hosted persistence is the existing dedicated Neon PostgreSQL database. Local/CI use
PGlite as an isolated adapter; no local customer data is uploaded automatically.
Money is integer cents. All current amounts are USD; no currency conversion is implied.

| Migration | Main responsibility |
| --- | --- |
| 001 | customers, properties, contracts, crews, visits and activity |
| 002 | customer profiles/contacts/addresses/reminders and customer audit |
| 003 | structured service localities, independent addresses and measurements |
| 004 | operator codes, revisions, contract lifecycle and service audit |
| 005 | zones, elements, private photo metadata/storage |
| 006 | invited app members and user-to-crew access |
| 007 | employees/crew membership, tasks/personnel snapshots, cost lines, internal invoices/payments |
| 008 | production_rates, estimate_drafts and append-only estimate_revisions |
| 009 | frozen estimate_offers, accepted contract_baselines and validity/payment terms |

The migration runner uses schema_migrations, transactions and a hosted advisory lock.
Do not edit applied migrations. Version 008 adds tables without changing existing IDs,
contracts or visits. No rate values or business fixtures are seeded.

production_rates stores mowing area per person-hour, area unit, setup person-minutes,
source, declared confidence, active status and revision. Updating/retiring a rate does
not rewrite captured estimates.

estimate_drafts holds identity, PRE-year-sequence number, customer/locality ownership,
latest revision, title and logical archive. estimate_revisions stores a full validated
input, source locality/zones/rate snapshot, calculation, missing fields, warnings,
actor and reason. Every save appends a revision. This is application-level historical
preservation, not a database immutability guarantee against privileged SQL access.

Server save validates active locality, lawn zones, no duplicate zone IDs, current zone
and rate revisions, money/units, overlap declaration and current draft revision.
Archiving preserves revision records. B04 drafts alone do not send, sign, invoice or create contracts. B05 adds the controlled offer lifecycle described below.

Original ft²/m² amounts remain in snapshots; conversion uses 1 ft² = 0.09290304 m².
Person-hours round to six decimals and monetary components round in cents. Setup is
person-minutes. Labor cost = person-hours × stated loaded hourly cost. Resources =
quantity × unit price. Indirects apply to direct cost; sale price = cost / (1 - margin).
Unknown inputs remain pending. Empty resource lines mean zero only after explicit
resource review. Geometric overlap is not inferred: the operator declares independent
areas. Measurements are not claimed field-verified merely by using them.

Historical B04/B05 used one workspace. SEC05 adds company namespaces as documented above; there is no RLS or client portal grant implementation.
Restore, production PostgreSQL concurrency, historical contract quotas and resource
inventory valuation are not certified by PGlite tests or this additive migration.

## B05 offer-to-contract lifecycle

Each estimate revision may be issued once with frozen commercial terms and source snapshot. Pending issued or accepted-but-unbound offers block draft changes. Withdrawal/decline stores a reason; another offer requires a new estimate revision. Received acceptance records name, authority, timestamp, evidence type/reference and the managing actor. This is an internal evidence record, not client authentication or electronic signing.

The accepted per-visit price is multiplied by the explicit visits/month to produce the monthly fee; frequency does not infer a monthly count. Binding creates one draft contract with service dates, advance/arrears billing and due days. Retries return that same contract. It creates no visits, invoices or payments. Existing manual contracts are unchanged.

New revisions of a bound estimate propose amendments to the same contract/current baseline. Applying an accepted amendment checks contract revision and baseline under transaction locks, appends contract_baselines, and preserves earlier offer/estimate snapshots. Future amendments remain pending until their start date; application is manual. Direct material edits of linked contracts are blocked; status edits remain supported. Scheduled and actual visit start dates must respect contract validity. Existing visit allocation snapshots remain unchanged; historical monthly quotas/proration are not reconstructed.

Application services preserve history; privileged SQL can still alter rows. PGlite tests do not certify multi-connection PostgreSQL contention.

## SEC01 / migration 013

Adds a generic company/profile/membership/assignment/audit schema and adopts existing access records without duplicating operational data. Profile assignments have company-qualified foreign keys; security writes serialize on a versioned company row. Operational business tables do not yet have tenant keys or RLS. See [security.md](security.md) for the complete current contract and pending acceptance gates.
