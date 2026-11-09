# Neura Landscape

Next.js + TypeScript application for customer relationships and landscaping operations.

Current security scope: native email/password access with optional Google sign-in, plus company-scoped, configurable access profiles,
module/action checkboxes, transactional membership assignment and audited changes.
See [security contracts and limits](docs/security.md). The sole operational company
remains pinned until business-data tenant isolation is verified. Administrators create users, assign profiles and generate a private activation/recovery link; no Gmail account is required.
Earlier increment descriptions below retain their historical scope.

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
single operational workspace with profile-based authorization, not an accepted multi-tenant platform.
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
- Panel gerencial is the landing page: service status charts, quantities executed,
  named-person time, current-month contract commitments and financial ledger totals.
  Filters cover dates, customer, city/region, work status, service and crew. Date basis
  is scheduled or actual completion. `/control` is a compatibility alias, not another menu.
  Current monthly quotas do not reconstruct historical terms or prorate weeks.
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
season, protection instructions and notes. Elements use the property location;
previous optional element coordinates are retained, without asking for them again. This is inventory,
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

Historical Google-only increment (superseded by native access below): Usuarios y niveles managed Google-account allowlist, roles, active status and crew
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

The **Usuarios y niveles** screen now reports configuration readiness without exposing secret values.
Only a stable HTTPS origin is accepted on hosted environments, and session secrets require at least
32 characters. Hosted evaluation must be explicitly selected with APP_AUTH_ENABLED=false on Preview.
Missing/invalid mode settings fail closed; production never grants the evaluation administrator.
Local development retains evaluation access. Keep Preview protected while preparing OAuth.

For the existing Landscape branch, the approved callback is:
https://neura-landscape-git-feat-bootstrap-0ef63a-neuratec-corporation.vercel.app/api/auth/callback/google

Use one Google Cloud project for Landscape and a Web application OAuth client. Only identity
scopes (openid, email, profile) are needed; do not add Gmail, Drive or Maps permissions.
Enter GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET directly as Preview secrets in Vercel.
Reuse the existing session secret and database. The initial IT administrator is configured
by LANDSCAPE_IT_ADMIN_EMAIL; real sign-in and allowlist behavior must be checked before activation.
Creating credentials and configuring variables is not proof that a Google login was executed.

Use a stable approved branch alias, not an expiring individual deployment hostname.
Better Auth creates/updates its own auth tables on first configured access under a
separate advisory lock; migrations 005/006 version the survey and role tables.
OAuth completion requires the Google project client credentials; this release does
not claim an executed Google sign-in without them. Vercel deployment protection
remains enabled throughout. Revoke a user's access by disabling their member row;
removing crew membership immediately removes access to its sites/assignments.


## Operational management (migration 007)

The same PostgreSQL database now contains editable business catalogs, employees,
crew membership, visit personnel snapshots, task quantities, cost lines, invoices,
payments and change history. No additional checkout or database is required.
Existing migration runner applies 007 transactionally; keep a database backup before
operational upgrades. Legacy crews remain visible and require identified employees
before new scheduling. Legacy service prose is not guessed into production statistics.

- Configuración manages company codes and catalogs. Inline + buttons create/maintain
  business options; retirement preserves references. Workflow/security states and ISO
  country codes retain their defined semantics. New zones can be created inline too.
- Empleados manages identified people, functions, skills and optional hourly rates.
  Cuadrillas selects those people, functions, shift and break duration. No invented
  staff are inferred from legacy headcounts. Google user access is separate.
- Agenda schedules specific tasks with quantities, units, inventory elements and
  optional individual responsibility. It checks shared-person/crew overlap, shift
  bounds and daily service + entered travel minutes. These are capacity controls,
  not road routing or automatic productivity-rate estimation. Scheduled visits can
  be edited. Started visits can be cancelled with a reason and actual work, including
  zero time for mistaken starts. Completed records retain costs/history when archived.
- Complete visits with actual per-person minutes and task quantities/blockers. Labor
  = sum(person minutes / 60 × snapshotted hourly rate), rounded in cents per person.
  Unknown rates keep cost completeness pending. Costos separately records quantity ×
  unit price for materials, equipment, travel and overhead, with reasons for revisions.
- Facturación y cobros is an internal manual document/payment ledger. Drafts can be
  edited/deleted; issued documents require justified voiding. Payments can be reversed
  as records, not refunded. No email, fiscal certification, tax engine or charge occurs.
  Dashboard billed = issued invoice totals by issue date; collected = nonreversed
  payment amounts by received date; owed = all open issued balances in geographic/
  customer scope. Service/crew/work-status filters apply to operations, not ledger.
- Contribution uses allocated visit revenue minus complete recorded visit costs; it
  is neither net company profit nor cash. Pruned-tree totals require recorded pruning
  quantities linked to a tree/fruit-tree inventory element. Unstructured historical
  visits are flagged instead of inventing production. Comparisons require equivalent
  tasks, conditions and quality; visit count alone is not employee performance.
- API mutations enforce role permissions, optimistic revisions and relational guards;
  audit actors and before/after planning/cost snapshots are retained. Google identity is configured; separate real-user role acceptance remains pending.

Verify with `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` and
`npm audit --audit-level=low`. The HTTP suite uses an isolated in-memory database,
not the hosted evaluation records. Integraciones displays actual configured status;
Google Places, road routing and external billing remain disconnected.

## Traceable mowing estimate drafts (migration 008)

Open **Presupuestos**. Select a locality and its lawn zones; add a production rate
under Rendimientos (area per person-hour with source), review labor/resource costs,
indirects and target sales margin, and save. Missing rates/prices remain pending.
Rates have no invented defaults. Setup is person-minutes; effort is not a crew route
duration. Area overlap is operator-declared, not detected from a map.

Each save preserves a version with its original source and price. Editing a saved
draft recalculates against current sources; stale edits/references are rejected.
Changing/retiring a rate never silently reprices stored revisions. This increment
creates internal drafts only: no client approval, contract conversion or invoicing.

New estimates domain code is TypeScript checked directly and runtime-validated.
Regression tests cover revoked archived assignments and the estimate HTTP workflow.
On workstations where Windows blocks generated production prerender directories,
a diagnostic HTTP run is available with LANDSCAPE_TEST_DEV=true. It tests an
isolated development server; it does not substitute for the default CI production
build/start verification. Never report a failed production build as passed.

Historical B04 scope: Google identity was subsequently activated; Places, restoration tests,
multi-company isolation and later approved-estimate/work-order flows are pending.

## Accepted offers and contract baselines (B05 / migration 009)

Open Presupuestos → Ofertas y acuerdos. Select a complete saved mowing estimate; review the per-visit price, explicit visits/month, crew minutes, validity, scope/exclusions and payment terms. Issue the frozen offer. Record received written acceptance with the authorized person and evidence reference, then create its draft contract. Activate the contract under Contratos when operationally ready. No messages are sent and no invoice/visit is generated automatically.

To change an accepted agreement, prepare/save a new estimate revision, issue the amended terms, record another acceptance and apply it to the existing contract. Its earlier agreement remains in history. Pending offers can be withdrawn or marked declined with a reason. Accepted terms cannot be overwritten directly in Contratos. Future accepted changes require manual application on/after their effective date.

This internal acceptance register is not electronic signing or a client portal. Google OAuth remains a separate configuration/acceptance gate; no external services or charges were added.

## UX01 — grouped navigation, directories and synthetic portfolio (migration 010)

The workspace groups existing screens into Inicio, Comercial, Operación, Recursos, Finanzas and Sistema. Mobile navigation has four role-filtered shortcuts and Más; the full menu is a modal. API authorization continues to enforce access independently of navigation visibility.

Clientes retains its searchable, status-filtered ten-row table and links directly to each account's localities. Localidades, Empleados and Cuadrillas use sortable/searchable ten-row tables with explicit edit/detail actions. Localidades initially shows the complete portfolio; choose a customer before creating a new site. Mobile tables show essential columns and retain all fields in the detail/editor. Crew edits preserve an unchanged retired duty only for its original employee; new assignments require an active duty.

Catalog categories and options are stored in database tables. Contextual + controls manage identity/contact options, employee and contract status, user roles/status, offer conditions, rate quality, cost categories and photo viewpoints, alongside the existing survey/service catalogs. System keys retain validated behavior; editing a label does not create a permission, delivery channel or unit conversion. Countries/telephone prefixes follow ISO/libphonenumber reference data. Relationship selectors (client, property, contract, person) select actual records, not arbitrary catalog labels; their contextual creation workflows remain an explicit follow-up.

In **Clientes → Explorar con 33 clientes de prueba**, an owner or IT administrator can confirm loading one synthetic batch in development or Preview. It adds 28 people (one or two sites each), five companies (5, 6, 7, 8 and 10 sites), 78 sites total and one estimated lawn zone per site. All are marked as test data; emails use example.invalid, addresses are non-navigable and coordinates are absent. No contracts, invoices, messages, payments or real photos are generated. The operation is transactional and idempotent: repeated requests preserve edits and never recreate archived examples. Existing records are not reset. Production loading is denied. Preview must use an evaluation database: do not point its environment at an operational production database.

The one batch identifier is ux01-customers-v1; sample_data_batches and sample_data_records track its origin independently of operational names. No destructive reset endpoint exists. API request: POST /api/sample-data with JSON {"action":"load","confirmed":true}; same-origin and role checks apply. GET returns counts and status.

## OPS01 — connected synthetic operating scenario (migration 011)

The first UX01 batch contained dossiers and sites only; it could not populate production or financial dashboards. OPS01 completes those SAME synthetic accounts without overwriting their edited fields. In the dashboard, expand the sample loader and explicitly confirm the operational scenario (owner/IT only), or POST /api/sample-data with {"action":"load_operations","confirmed":true}. It is blocked in production and performs no external communication or payment.

On the unchanged original portfolio it creates 78 mowing estimates, one explicitly estimated production rate, 78 contracts (74 active and four draft for the three prospect customers), 18 synthetic employees in six crews, 156 additional zones and 234 cared-for elements. Only the 74 active sites receive work and simulated billing: 296 visits across the prior/current month, 148 invoices and 91 simulated payment records. Services include mowing, pruning, planting, inspection, fruit preservation, general care, snow, leaf collection, mulch, fertilizing and irrigation checks. Weather/history/measurements and financial values are declared synthetic, not real events or market benchmarks. No real photographs or geographic coordinates are invented.

The batch ID ops01-scenario-v1 is transactional and idempotent; its manifest records actual counts and anchor dates. Replays do not overwrite edits or regenerate history. Existing non-sample records and the original customer/property batch are retained. Existing sample properties that have been archived/inactivated are skipped; original customer statuses determine active/draft work, so counts may differ after user edits. No destructive reset exists.

Scheduling, task validation, estimates, labor/resource costing, invoice issuing and recorded payments reuse the operational services. The fixture importer explicitly backdates ONLY its newly created synthetic completed visits to their documented sample period after calculating their costs; it does not expose a general time-travel endpoint. Completed dates never precede their synthetic start or exceed the fixture anchor time. Current in-progress examples are added only within the synthetic crews' working window. Full and partial payments, unpaid/overdue invoices, canceled visits, blocked tasks and loss-making visits exercise the indicators.

Dashboard origin filters separate sample customers from other records. A visible banner identifies simulation; no synthetic amount is presented as a real bank transaction. Portfolio counts respect customer/geography/origin; operational dates/service/crew/status filter work, while invoices and receipts retain their own date basis. Open balances include earlier issued unpaid documents. Per-customer results reconcile with the underlying invoices/payments. Cost graphics sum the same categories as the execution cost, and production quantities retain their units. No total across incompatible physical units is displayed.

Use the sample-period button if reviewing these fixed fixtures in a later month. The fixture is not a continuously generated live business. Maps, live GPS, external messaging, authenticated customer portal and production inventory/procurement remain separate work; this scenario does not simulate their connection.

## Native access: no Google account required

1. Enter with the existing TI account, open Sistema → Usuarios y permisos → Autorizar usuario. Save name, email identifier, active status, profiles and any assigned crews.
2. Open Editar acceso for that user and generate a one-use activation link. Deliver it privately to the intended person. It expires in 30 minutes; issuing another invalidates pending links. No email is sent automatically.
3. The person opens the link, sets a 12–128 character password and uses Correo de ingreso / Contraseña. Their email identifier does not need to be Gmail or have a Google account. Synthetic example.invalid identifiers are suitable only for isolated demonstrations, not verified inbox ownership.
4. For recovery, the administrator verifies the requester outside the app and issues another link. Completing recovery revokes prior sessions. Disabled users and retired profiles remain denied by the same server authorization.

Better Auth owns hashing, session cookies and persistent login rate limits. Public registration, arbitrary account linking and public recovery endpoints remain disabled. Migration 014 adds only hashed activation links and explicitly provisioned local identity references, with no password or raw activation token in audit/source. Google credentials are optional; DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET and APP_AUTH_ENABLED=true are required for authenticated hosted access. The historical identityMode label google now means authenticated mode for either provider. Cross-company identity recovery is rejected pending a platform identity administrator. MFA and automatic recovery delivery are not implemented. Vercel Preview protection is a separate gate and is preserved.

## Native username update (SEC03)

The native login now asks Usuario / Clave. Users receive unique company codes such as ROJ001; emails are optional when creating a native-only user. The Google button remains the second sign-in method. Users and the account menu display the code. Activation/recovery links continue to establish a native password for that code.

For the requested Preview evaluation, six named accounts are provisioned once, one per default profile, with the initial key supplied privately through LANDSCAPE_EVALUATION_PASSWORD. LANDSCAPE_EVALUATION_USERS=true enables them only on Preview; production denies their application sessions. The normal activation password policy is unchanged. These accounts and their credentials are not recreated or reset on every deployment. LANDSCAPE_LOGIN_PREFIX reserves the operator abbreviation (e.g. ROJ); new codes retain a monotonically increasing sequence and assigned codes are never renamed automatically.
