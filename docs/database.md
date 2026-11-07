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

Single-workspace scope remains. There are no tenant keys/RLS or client portal grants.
Restore, production PostgreSQL concurrency, historical contract quotas and resource
inventory valuation are not certified by PGlite tests or this additive migration.

## B05 offer-to-contract lifecycle

Each estimate revision may be issued once with frozen commercial terms and source snapshot. Pending issued or accepted-but-unbound offers block draft changes. Withdrawal/decline stores a reason; another offer requires a new estimate revision. Received acceptance records name, authority, timestamp, evidence type/reference and the managing actor. This is an internal evidence record, not client authentication or electronic signing.

The accepted per-visit price is multiplied by the explicit visits/month to produce the monthly fee; frequency does not infer a monthly count. Binding creates one draft contract with service dates, advance/arrears billing and due days. Retries return that same contract. It creates no visits, invoices or payments. Existing manual contracts are unchanged.

New revisions of a bound estimate propose amendments to the same contract/current baseline. Applying an accepted amendment checks contract revision and baseline under transaction locks, appends contract_baselines, and preserves earlier offer/estimate snapshots. Future amendments remain pending until their start date; application is manual. Direct material edits of linked contracts are blocked; status edits remain supported. Scheduled and actual visit start dates must respect contract validity. Existing visit allocation snapshots remain unchanged; historical monthly quotas/proration are not reconstructed.

Application services preserve history; privileged SQL can still alter rows. PGlite tests do not certify multi-connection PostgreSQL contention.
