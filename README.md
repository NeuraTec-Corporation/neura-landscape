# Neura Landscape

Next.js + TypeScript application for customer relationships and landscaping operations.

## Customer workspace

The customer directory includes search, commercial-status filtering and pagination.
Each dossier has identity, contacts/responsibilities, addresses, follow-up and change
history. It supports person/company accounts, first/last names, optional marital status,
language/timezone, multiple related contacts, contract signer, approver, billing and
notification roles, mobile/home/office phones, email, preferred channel/phone, contact
hours and communication permissions.

Create and edit use the same server contract. Names/address text normalize to uppercase;
email to lowercase and phones to E.164. Invalid phones, required fields, contradictory
hours, missing primary/signer roles and duplicate contact email are rejected.
Revision checking prevents silent concurrent overwrites.

Addresses support manual structured entry and Google Maps links. Real autocomplete
and georeferencing require a configured server-side GOOGLE_PLACES_API_KEY (Places API
New) and provider quotas. Without it, manual entry remains available and the UI says
search is unavailable. No fake address predictions or geocoding are supplied.

Follow-up reminders are persisted internal tasks. This release does not send SMS,
WhatsApp or email: a delivery provider and verified consent/delivery controls are
required for outbound automation.

## Persistence and hosting

Vercel project: NeuraTec Corporation / neura-landscape (existing project).
Durable hosted PostgreSQL: Neon project neura-landscape (Free plan).
DATABASE_URL is stored as a Vercel Secret for Preview and Production; never commit it.
The hosted runtime refuses to fall back to an ephemeral local database.

Migrations:
- db/migrations/001_foundation.sql — operational relationships and visits.
- db/migrations/002_customer_profiles.sql — profiles, related contacts, structured
  addresses, reminders and revision history.

MIGRATE_ON_START=true applies these idempotent migrations under a PostgreSQL
transaction/advisory lock on first runtime access. A separate npm run db:migrate
command is available with a configured DATABASE_URL.
Local/CI tests use isolated PGlite PostgreSQL instances and never hosted credentials.
The old .data/landscape data is not uploaded or synchronized to Neon.

Vercel Authentication remains enabled for all deployments. This is a protected
single-workspace evaluation release, not an implemented multi-tenant/RBAC platform.
Keep deployment protection enabled. Real multi-company operation still needs governed
application identity, tenant isolation and operational acceptance.

## Local commands

Node 24.19.0 / npm 11.17.0:

```powershell
npm ci
npm run verify
npm start
```

Default local URL http://127.0.0.1:3000; npm run dev for editing.
Without DATABASE_URL, local development uses PGlite at .data/landscape, ignored by Git.
Run only one local app process against that directory. Do not delete it to repair a
build. The deployed application uses Neon instead.

## Verification and boundaries

Verify runs lint, strict TypeScript, production build and tests. HTTP test processes
explicitly clear hosted DATABASE_URL/VERCEL so CI cannot mutate the hosted database.
Tests cover customer validation, relational persistence, revision conflicts, duplicate
email, reminders, noindex, operational lifecycle and cost calculations.

src/modules/customers exposes a domain contract/service through its public entry.
It has no Next.js/Vercel dependency or Landscape property queries. HTTP composition
enriches the directory with counts from the operations module. This project-owned
candidate is not declared a certified NeuraTec Core release.
ARGOS and SAAC were consulted read-only for field-governance/interaction principles;
their private source and project data were not copied into this public repository.

Operations retain related properties/contracts/crews/visits and manual cost/margin
reporting. GPS, optimized routing, media, external billing, individual timesheets,
offline synchronization and AI are not implemented by the customer release.

Same repository and checkout; no new clone, worktree or source base.
Canonical project decisions remain in the existing Notion record.
