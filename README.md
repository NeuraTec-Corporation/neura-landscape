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

Phone inputs show a country/calling-code selector and accept the national number.
Empty phone fields initially use the home/first address country (US defaults to +1).
Each phone can override that country. Existing international numbers retain their
own calling code when addresses change; storage remains E.164. Validation summaries
identify the contact/address and field, and open the corresponding dossier section.

Addresses support manual structured entry and Google Maps links. Real autocomplete
and georeferencing require a configured server-side GOOGLE_PLACES_API_KEY (Places API
New) and provider quotas. Without it, manual entry remains available and the UI says
search is unavailable. No fake address predictions or geocoding are supplied.

Follow-up reminders are persisted internal tasks. This release does not send SMS,
WhatsApp or email: a delivery provider and verified consent/delivery controls are
required for outbound automation.

## Properties and service locations

Each person/company customer can own multiple service locations in the existing
properties table. Select a customer in Propiedades y localidades to see only their
locations, or open the same workspace from the customer dossier's sixth tab.
Create/edit location names, per-customer codes, type/status, complete addresses,
optional coordinates, local contact, service hours, measured areas and access notes.
Customer addresses/contacts can be explicitly copied; they do not synchronize later.
Contracts retain the same property IDs, and new contract selectors identify customer,
location and code. Historical unstructured addresses are preserved and flagged for
completion; unknown areas can remain empty rather than recording false zero values.

## Persistence and hosting

Vercel project: NeuraTec Corporation / neura-landscape (existing project).
Durable hosted PostgreSQL: Neon project neura-landscape (Free plan).
DATABASE_URL is stored as a Vercel Secret for Preview and Production; never commit it.
The hosted runtime refuses to fall back to an ephemeral local database.

Migrations:
- db/migrations/001_foundation.sql — operational relationships and visits.
- db/migrations/002_customer_profiles.sql — profiles, related contacts, structured
  addresses, reminders and revision history.
- db/migrations/003_property_locations.sql — additive service-location fields on
  properties; existing IDs, customer ownership, contract and visit links are preserved.

MIGRATE_ON_START=true applies pending numbered migrations only, using schema_migrations
under a PostgreSQL transaction/advisory lock on first runtime access. A separate npm run db:migrate
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


## Contracts and monthly service control

- Set the landscaping operator identifier once under Integraciones → Empresa operadora.
  New locations receive `LOC-OPERATOR-YEAR-0001` using a transactional counter shared
  across customers, per operator/year (UTC). Existing codes never change on edits.
  `LANDSCAPE_OPERATOR_CODE` is an optional environment fallback. No client name is used.
- Contratos manages customer/site associations, selectable frequency, monthly quota,
  monthly USD price, planned minutes, lifecycle status, editing and deletion.
  Site ownership cannot be moved by editing a contract. Revisions reject stale edits.
- Trabajos y agenda schedules and executes visits; only active contracts can receive
  new visits. Frequency does not automatically create a recurring calendar.
- Control de servicio follows Agenda. Choose the scheduled service month (America/New_York)
  and customer to inspect completed, scheduled, started and cancelled visits, remaining
  visits against the CURRENT agreed quota, and completed-visit cost components.
  Historical quotas and partial-month proration are not reconstructed in this release.
  Allocated revenue and contribution are operational allocations, not cash collections.
- Newly scheduled visits snapshot allocated revenue; editing contract prices does not
  reprice existing visits. Completed costs/revenue remain unchanged. The migration
  backfills pending allocations using current contract terms, without rewriting completed totals.
- Delete confirms before a logical deletion. Contract deletion cancels scheduled visits,
  blocks while a visit is started, and retains completed visits and costs. Locations
  with undeleted contracts must have those contracts deleted first. Records, foreign keys
  and an audit trail remain in PostgreSQL; there is no permanent deletion or restore UI.
- Migration 004 is additive and runs through the existing migration mechanism; no second
  source base, checkout, database service or paid integration is introduced.


## Mobile property surveys and Google access

Open Propiedades y localidades → select customer → Zonas, elementos y fotos.
Zones keep area and original ft²/m² unit, measurement quality and an optional point.
Elements belong to a zone: type/count/unit, primary planned service, frequency,
season, protection instructions, notes and optional coordinates. This is inventory,
not an automatic work order or a measured property boundary. Do not double-count
nested or overlapping zones. Existing aggregate property areas remain legacy values;
the survey does not overwrite them or infer rates, labor, materials or prices.

Photos attach to a property, zone or individual element. The browser resizes before
upload; the server decodes/re-encodes JPEG, strips EXIF and limits input to 2 MiB /
20 MP and output dimensions to 1600 px. Database metadata and bytes are private,
served through the authorized API with no-store. Storage adapter uses private Vercel
Blob if explicitly configured; otherwise uses a separate bytea table in the existing
PostgreSQL. This bounded evaluation adapter has a shared 100 MiB budget and at most
40 active photos per locality. Archived bytes still count; no automatic purge or
large-scale media-library claim. The connector denied creation of private Blob
with 403; no store or paid service was created. Existing photo records carry a
backend identifier, so a future backend change does not invalidate old images.

Map view is an OpenStreetMap point/area-of-surroundings embed with attribution,
plus external Maps/Earth links. It is not satellite imagery hosted by Landscape,
3D mapping, parcel boundaries, automatic measurements or route optimization.
GPS captures device position with its reported accuracy; it does not identify the
element remotely. Coordinates can be entered manually. Google Places remains off.

Usuarios y niveles manages Google-account allowlist, roles, active status and crew
assignments. User identities belong in private storage/configuration, never public
source. Google authentication uses pinned Better Auth 1.7 with email/password off,
account linking off, database rate-limit storage, no session cookie-cache of roles,
and twelve-hour sessions. Roles and assigned sites are rechecked server-side.
Workers/crew leads have a dedicated mobile read-only assignment view, no financial
API access; the assignment query returns only pending/started visits from their
crews and no financial columns. It is not an execution/time-entry portal yet.

Individual access is NOT active until OAuth is configured and tested. With
APP_AUTH_ENABLED=false the previous Vercel-protected evaluation mode remains;
roles are not represented as enforced individual identity in that mode. Setting
APP_AUTH_ENABLED=true without valid configuration fails closed. Prepare these
Vercel environment variables without putting credentials in chat or source:

- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (Google OAuth Web application).
- BETTER_AUTH_SECRET (strong random server secret) and BETTER_AUTH_URL (stable host).
- LANDSCAPE_IT_ADMIN_EMAIL (private, explicitly authorized first IT administrator).
- Then APP_AUTH_ENABLED=true, redeploy and verify the first Google login.

Register exactly BETTER_AUTH_URL + /api/auth/callback/google in Google Cloud OAuth.
Use a stable approved branch alias, not an expiring individual deployment hostname.
Better Auth creates/updates its own auth tables on first configured access under a
separate advisory lock; migrations 005/006 version the survey and role tables.
OAuth completion requires the Google project client credentials; this release does
not claim an executed Google sign-in without them. Vercel deployment protection
remains enabled throughout. Revoke a user's access by disabling their member row;
removing crew membership immediately removes access to its sites/assignments.
