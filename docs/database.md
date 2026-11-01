# PostgreSQL schema and ownership

Hosted system of record: Landscape's dedicated Neon PostgreSQL database.
Local/CI PGlite is a development/test adapter, not deployed persistence. No local
customer records are automatically imported into the hosted system.

## Operational migration 001

customers → properties → contracts → visits; crews → visits.
activity records visit lifecycle. Completion captures labor, actual consumptions,
allocated income and contribution values. Money uses integer cents.

## Customer migration 002

| Table | Responsibility |
| --- | --- |
| customer_profiles | One profile per customer; person/company identity, status, marital status, language/timezone, notes, revision and timestamps |
| customer_contacts | Multiple related people; their responsibilities, phones, email, channel, contact hours and communication permissions |
| customer_addresses | Multiple labelled structured addresses, optional coordinates and provider place reference |
| customer_reminders | Internal next actions, due timestamps, channel and state; no delivery claim |
| customer_audit | Creation/update revision and server timestamp |
| schema_migrations | Applied schema versions |

## Service-location migration 003

The existing properties table now holds per-customer code, locality type/status,
structured service address, optional coordinates, local contact details, lawn/garden/
paved areas, service/access instructions and edit revision. One customer owns many
locations. Owner changes are rejected on edit; contract and visit foreign keys remain
unchanged. Codes are unique within a customer, not globally across different clients.
Legacy address text is retained as line1 without inventing city/country; missing
structured details are visibly marked for completion. Unknown measurements use NULL.
Copying customer address/contact information is explicit and creates site-owned values;
subsequent customer changes do not move the location. No second location table exists.
The migration runner reads schema_migrations and applies only pending versions under
one transaction (with a PostgreSQL advisory lock for hosted execution).

The existing customers ID remains stable for property/contract links.
All references are foreign keys. SQL is parameterized; profile edits are transactional
and require the current revision. Public customer services do not import vertical
operation internals. The directory's property count is composed through operations'
public API instead of being embedded in customer-domain logic.

These are project-owned records and contracts. They do not certify a corporate Core,
tenant model or portable component adoption. Single-workspace deployment protection
does not implement tenant authorization or per-user audit attribution.

Initial migrations use IF NOT EXISTS and execute under an advisory transaction lock
for hosted startup. Future schema revisions must use additional versioned migrations.
Managed backup/restore and production readiness require separate executed evidence.
