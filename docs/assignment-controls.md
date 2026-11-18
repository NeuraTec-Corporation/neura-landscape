# Assignment controls and integration ports

This release extends the existing company namespaces. It does not introduce
another application, service, dependency, checkout or branch.

## Skills and access

Operation → Assignment rules manages qualifications by employee and service,
effective dates, certificate/reference and retirement. Services use the existing
editable catalog. Each service can explicitly require a qualification. When a task
has a named responsible employee, that employee must qualify; otherwise at least
one assigned crew member must qualify. Qualification text is a recorded business
assertion, not verification against an external licensing authority.

Properties can have a weekly access policy: checked days have one access interval,
unchecked days are closed. An explicit policy supersedes the legacy daily prose.
An empty policy closes all days. Without an explicit policy the existing daily
access handling is preserved. Updates mark scheduled visits for review, keeping
their history. Saves, schedule suggestions and actual starts revalidate the
relevant recorded policies. A future schedule does not imply current-day access.

## Physical resources

Each company's material balances belong to an editable warehouse. The initial
Principal warehouse is structural configuration, not an assertion about stock.
Physical count supports a verified zero balance and records the difference from
the ledger. A shortage discovered during counting is allowed to be recorded and
marks affected plans for review; the system must not reject a truthful count just
because previous promises exceeded it.

Strict stock validation is explicitly enabled per warehouse after initial
inventory. When enabled, available = physical less other active commitments.
Planning and starting check available quantities. Manual withdrawals and atomic
two-sided transfers cannot spend another visit's reservation. Posting actual
consumption releases the corresponding reserved quantity and never charges the
same visit again on a retry. Corrections return or withdraw only the difference.
Cancelled/completed/archived visits release unused commitments through their
status; historical physical movements remain. No stock balance or actual employee
qualification is invented by a deployment.

Equipment reservations identify actual assets for equipment in the visit plan.
The service checks company, resource type, responsible crew, maintenance dates
and overlapping visit/travel intervals. A visit with equipment in its plan needs
at least one valid asset for each equipment resource before starting. Catalog
usage units/hours do not represent a count of physical machines. Removing an
equipment resource removes its obsolete reservations. Reprogramming validates the
existing assets again. These records indicate assignment, not live GPS position.

Maintenance orders support pending, completed and cancelled records, actual date,
cost (unknown remains unknown), notes and next due date. Overdue open orders and
assets under maintenance block use. Changes flag future reservations for review.
Completion can release a maintenance status and advance a due date; another open
overdue order still blocks the asset. Corrections remain audited.

All assignment-related mutations acquire the same tenant-local operational lock
before other domain locks. This protects first-time calendar insertion, shared
stock, physical asset allocation and policy changes from conflicting saves. It
does not serialize different companies or replace optimistic revisions. Capacity
under this serialization must be measured with the intended production workload;
the bounded CI drill is correctness evidence, not an enterprise throughput SLA.

## Customer portal

The portal now shows recorded completed task quantities, consumed materials and
equipment usage, and issued invoice line items. Supplier prices and payroll rates
are excluded. Private photos still require express publication and authenticated
customer ownership checks.

In an explicitly enabled Preview, an administrator can provision a native login
for an existing synthetic customer. Provisioning uses the reusable security
service, exact least-privilege customer profile, normal code allocation and Better
Auth's password hashing. Codes are marked evaluation-only and cannot authenticate
in Production. The configured evaluation password is never returned or recorded
in public source. Creation is atomic and repeatable; an existing account, password,
mapping or revocation is never reset. Real customer records cannot use this
evaluation shortcut. Ordinary commercial invitations keep the existing private
activation flow and password policy.

## Provider-independent preparation

`src/integrations/road-planning.mjs` accepts an authorized road-time matrix port.
It constructs a nearest-feasible itinerary accounting for access, service duration,
break budget and return to base. Unreachable pairs remain unreachable. It reports
unplaced stops and explicitly does not claim a globally optimal solution.
Geographic distance is never substituted for road travel time. There is no active
road provider, traffic data or automatic itinerary application in the hosted UI.

`message-dispatch.mjs` persists a due-message outbox, claims with bounded leases,
retries and a stable idempotency key. The provider must support native
idempotency: a lease alone cannot prevent duplication after a lost provider
response. Queued message content is frozen; accepted/in-progress delivery cannot
be represented as cancelled without provider confirmation. Unsupported channels
are not sent. Five failed attempts or an exhausted expired lease stop retrying.
Accepted does not mean delivered. No provider is installed or enabled; no cron,
email, SMS or WhatsApp send is activated by this release. External identifiers
are acknowledgements, not delivery receipts.

Choosing/configuring the real providers and approved usage budgets is still
necessary. The ports and worker are executable with synthetic providers for
testing; tests do not establish real provider delivery or real road estimates.

## Recovery and verification

Business migrations 027–029 upgrade existing/new namespaces. The original
portfolio initializer recognizes these structures but refuses redistribution
when they contain operational data without an explicit transfer contract.

Three focused scenarios cover qualification/access enforcement and tenant schema
compatibility; warehouse/asset contention and maintenance; native customer access,
message retry/idempotency and road feasibility. The prior cost/resource scenario
now supplies its required physical equipment fixture.

The PostgreSQL CI drill also seeds actual synthetic qualification/access, stock
count/transfer, asset reservation/maintenance, published private photo and outbox
rows before dump/restore. Two simultaneous material commitments compete for
insufficient shared stock: exactly one must succeed. Full fingerprints and
post-restore writes still apply. Timings in CI describe only that disposable
database. Hosted recovery, external object recovery, independent retention,
approved RPO/RTO and representative production capacity remain separate acceptance
items. See recovery.md and the actual delivery report for executed outcomes.
