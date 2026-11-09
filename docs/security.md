# Security kernel — 0.1 candidate

This is the first functional SEC01 increment in the existing Landscape application,
not a certified corporate Core package or a completed multi-tenant product.
Canonical decision: https://app.notion.com/p/40b839ef360281d0af28ff7278f0d908 (SEC01).

## Ownership and composition

| Piece | Responsibility |
| --- | --- |
| `src/modules/security` | Generic membership/profile resolution, grant validation, authorization, transactions and security audit. |
| `src/app/_security-manifest.mjs` | Landscape resource/action registry, allowed scopes, dependencies and initial profile definitions. |
| `src/app/_permission-policy.mjs` | Adapter from HTTP/business operations to declared capabilities. |
| `src/app/api/_security.ts` | Trusted compatibility enrollment and current operational-company selection. |
| `src/modules/identity` | Native credentials and optional Google/Better Auth sessions; activation and legacy assignment scope; not a dependency of the kernel. |
| `src/app/api/security`, `src/app/api/users` | HTTP transport and composition with existing identities/crews. |
| `security-profiles.tsx`, `users-workspace.tsx` | Profile matrix and user-to-profile checkbox administration. |

The kernel imports only its own policy and Node's UUID generator. It does not import
Next.js, React, Google, Better Auth, a database driver, employees or Landscape business
services. Biome boundaries and executable boundary probes reject those imports.
Authentication remains an external identity-provider adapter; permission labels are
not conditions such as `if profile.name === 'Supervisor'`.

## Public contracts

- `resolveSecurity(db, companyId, subjectId, registry)` returns effective scope,
  active profiles and known grants, or null. No credentials are returned.
- `permits(access, capability, companyId)` denies inactive or foreign-company access.
- `validateGrants(registry, grants, scope)` rejects unknown keys, incompatible scopes,
  missing read permission and declared dependencies.
- `securityService(db, registry).snapshot(context)` exposes company-scoped profiles,
  memberships and the latest audit metadata to an authorized administrator.
- `.saveProfile(context, input)` creates, revises or retires a profile; `.assign`
  replaces a membership's profile assignments. Both require the observed company
  version and re-read the actor inside a transaction.
- `enrollMembership` and the optional `.assign` preparation callback are trusted
  integration ports, not public signup operations. The callback shares the same
  transaction, so identity/crew updates roll back when authorization fails.

Database port: `query(sql, parameters)` returning `{ rows }`, and
`transaction(callback)` with a transaction-local query port. PostgreSQL JSONB and
composite foreign keys are required. PGlite is the isolated test adapter; no driver
is imported by the kernel. Declaration files describe the interface; runtime
validation and tests remain necessary for the JavaScript implementation.

## Data and transition

Migration 013 adds `security_companies`, `security_profiles`,
`security_memberships`, `security_assignments` and `security_audit`. Company-qualified
foreign keys prevent assigning a profile from another company. Applied migrations
are not edited. The generic schema precedes the explicitly marked Landscape seed
section and is tested independently without Landscape tables.

The migration adopts the existing company and maps existing accounts to initial
TI, Dueños, Supervisor, Finanzas, Jefe de cuadrilla and Cuadrillas profiles. It does
not create Google accounts, duplicate business records or reload the synthetic
portfolio. A trusted bridge enrolls subsequently authenticated legacy identities
once; an existing disabled membership is never silently re-enrolled.

`app_members.role` remains a compatibility hint for the existing crew portal and
assignment SQL, not the source of module/action authorization. Application API
guards use effective grants. The old string-based `canUse`/`canManage` exports are
legacy domain-test compatibility and must not be used to authorize new routes.

## Rules enforced now

- Deny by default; capabilities must exist in the application manifest.
- Several active profiles may combine grants within one company. Company-wide and
  assignment-only scopes cannot be mixed in this first version.
- Assigned crews retain the existing active-assignment/property/photo checks and
  cannot receive financial/company-wide capabilities.
- Read is required before managing a resource. Planning creation/updates also
  require the contract and workforce lookup capabilities.
- Offer binding additionally checks contract creation/update capabilities.
- Profile administrators cannot delegate capabilities they do not hold or alter
  higher-privilege profiles/memberships. Only protected TI can assign protected TI.
- The immutable TI continuity profile, last active protected administrator and
  acting administrator's own security access are protected against lockout.
  The configured bootstrap IT identity also retains its protected membership.
- Company version locks reject concurrent/stale security writes. Identity fields,
  crew assignments and profile assignment updates share one transaction.
- Profile, membership and user/crew changes are audited without passwords/tokens.
- Disabled company/membership or retired profiles revoke authorization on the next
  request; there is no role-cookie cache. Revocation does not retroactively abort
  an operation already authorized and executing in another transaction.
- Menus reflect grants. The server independently checks reads and action-specific
  mutations; a hidden button is not the authorization mechanism.
- Operational visit responses omit financial fields without `costs.read`.
  Dashboard access deliberately includes financial aggregates, and workforce
  access includes employment/rate records; the profile editor makes that clear.
- Photos, contracts and other current business records still belong to the sole
  operational workspace. They are not yet tenant-keyed resources.

## Current application experience

Sistema → Usuarios y permisos has Users, Profiles and Company/audit views.
Users receive profiles through checkboxes rather than a role dropdown. Profiles
have a searchable module/action matrix; unsupported actions are unavailable.
Selection helpers affect only visible modules; hidden selections remain intact.
Save reviews additions/removals; stale writes retain the editor and are rejected.
Lists use the existing seven-row search/pagination controls. Assigned profiles have
limited scope; protected TI can be inspected but its grants cannot be changed.

The account menu shows effective profile names and company. Finance now uses the
shared authorized workspace rather than being forced into a dashboard-only portal.
Users landing on an unauthorized page see links to their permitted modules.
The server refreshes effective permissions per request; the browser refreshes its
session view after a security change and on focus. Some existing module editors
may still show an action the server denies; per-action UI treatment is not claimed
complete outside the security editor and the updated agenda controls.

## Acceptance and pending gates

Executed test coverage is recorded in CI/release evidence, not inferred from this
document. The suite exercises a standalone generic schema; A/B company membership
and profile boundaries; foreign assignment keys; grant changes and retirement;
disabled memberships/companies; delegated escalation; administrative lockout and
rollback; manifest/request policy; legacy migration replay; and the actual protected
HTTP profile/user lifecycle using an isolated evaluation database.

The following remain separate, unimplemented or unaccepted gates:

- Operational multi-company isolation across customers, contracts, visits, files,
  financial records, caches and all relationships. The runtime pins the current
  company; **there is no second-company selector or activation API**. The schema's
  company rows do not establish business-data isolation or PostgreSQL RLS.
- A platform-global administrator and cross-company company provisioning.
- Automatic recovery email delivery, MFA, public signup and account linking. Native
  password access and administrator-assisted recovery are implemented below.
- A direct employee-to-membership link. Existing employee and login records remain
  distinct; crew assignments continue through the trusted Landscape adapter.
- Separate real-browser sessions for all profiles, real PostgreSQL contention,
  backup/restore acceptance and production operational use. PGlite tests do not
  certify these properties.
- Full per-action hiding/disable behavior in every older business editor.

## Reuse and versioning

This original project-owned implementation is a reusable candidate. Adoption by
another project requires registry review, provenance/IP/confidentiality assessment,
versioned interfaces and migrations, project-specific acceptance and a maintenance
owner. A consumer registers its own resources and supplies ports; its identities,
secrets and configuration remain independent. No other repository was changed and
no package, central Core release or automatic cross-project propagation was created.

New manifest keys require an explicit reviewed profile migration; a label or new
screen does not automatically grant access. Before rollout, back up the database,
validate legacy-account mapping and keep the existing protected Google/Preview
access. Roll back application code only with a compatible schema; retain additive
security tables and audit history rather than deleting them to repair access.

## SEC02 — Native credentials and controlled activation

The identity adapter now enables Better Auth email/password (12–128 characters), with public signup disabled and optional Google. Existing Google identity/account rows are preserved when the same person establishes a local credential. A separate local-identity reference allows administrator-provisioned identities without falsely asserting verified ownership of an email inbox. Verified Google identities retain existing checks and bootstrap behavior.

`localAccessService(db, registry, passwordPort)` is outside the permission kernel. It re-resolves security.update, active membership/profile scope and delegation rules inside a company lock before issuance and redemption. It rejects managing identities shared with another company, pending a platform-global recovery authority. Only hashes of 256-bit random one-use tokens are stored. Links expire after 30 minutes, bind the member revision and current issuer authority, and replace older links. Issuance is limited to 10 per administrator per minute in persistent storage. Redemption hashes through Better Auth, then atomically consumes links, writes the provider credential, records an administrative local-identity reference, revokes every prior session for that identity and writes credential-event metadata without secrets. Google accounts and business records are not replaced.

The small pinned Better Auth SQL adapter in local-access.mjs targets library-generated user/account/session tables. It must be acceptance-tested on library upgrades; tests generate the real provider schema and execute real sign-in, cookie-session lookup and recovery against PGlite through a pg-compatible test transport. These tests do not certify hosted PostgreSQL contention or email delivery.

The browser receives the activation token once, in a URL fragment (never a query string), captures it in component memory, removes it from the address bar and uses a same-origin JSON POST. No token is stored in browser storage. Referrer-Policy is no-referrer. Reloading requires reopening the original link. No public registration, email changes, account linking or native provider recovery endpoints are exposed through the HTTP catch-all. A new credential never grants profiles. The reusable authorization kernel still has no dependency on Better Auth, Next.js or business tables.

Recovery is administrator assisted: verify the person through an independent private channel, generate a link and deliver it privately. Automatic email recovery, MFA, global recovery of multi-company identities and end-user password management remain future increments. Production acceptance and separate live sessions for every profile remain pending.

Identity-schema initialization uses a transaction-scoped advisory coordinator (703922), explicit lock timeout and bounded pool queries. Session-level advisory locks are not safe through transaction poolers and are no longer used; the coordinator releases on commit or rollback. This fixes an initialization stall found during hosted verification.

## SEC03 — Operator user codes and evaluation profiles

Native sign-in now accepts an operator-prefixed code, not an email address. Migration 015 allocates immutable, unique codes under a company row lock, using a reserved three-letter prefix and a monotonically increasing sequence (ROJ001; values beyond 999 expand naturally). The optional email remains an identity adapter/contact for Google; a native-only user does not need to enter email. The code maps server-side to the existing identity and uses Better Auth HTTP authentication, cookies and persistent rate limits. Google remains optional and unchanged. Codes grant no permissions: membership, profiles, assigned scope and current status are still checked.

Six requested evaluation accounts (one per default profile) are provisioned idempotently only when VERCEL=1, VERCEL_ENV=preview and LANDSCAPE_EVALUATION_USERS=true. LANDSCAPE_LOGIN_PREFIX=ROJ reserves the requested example prefix for this Preview. Their initial key is taken from server-only LANDSCAPE_EVALUATION_PASSWORD, never source or audit. This explicit evaluation exception accepts the requested seven-character preset without lowering normal password activation requirements. Existing accounts/passwords and later changes to evaluation credentials are not overwritten on redeployment. Seed identities are marked evaluation_only; both code resolution and application-session authorization deny them outside the enabled Preview, even if a native email endpoint issued a session. Existing Google identities are preserved and receive codes after the six requested evaluation accounts. The reserved company prefix is kept stable after first allocation.

Provisioning creates only the six access identities, profile memberships and an existing crew assignment for the two crew profiles where available; it does not create business customers, employees or new companies. The bootstrap uses the existing database and audited transactions. Disable evaluation access by turning off LANDSCAPE_EVALUATION_USERS; no schema or history deletion is required. Google support alone does not establish commercial readiness. The multi-company and commercial acceptance gates remain separate.

## SEC04 — NeuraTec platform administrator and editable usernames

The existing evaluation administrator is renamed in place from ROJ001 to NEU001, labeled Administración NeuraTec, with profile IT. Migration 016 marks that identity as platform-owned and renames the protected profile label; it preserves internal subject, provider account, password hash, sessions and grants. Business memberships remain scoped to the existing Landscape company; this account-ownership classification does not claim implemented global cross-company authorization. Fresh evaluation bootstraps use the same NEU001 identity, while redeployments never reset subsequent edits.

Authorized user maintenance now accepts code and name changes with existing company-version/user-revision checks and audit. The stable internal identity remains unchanged. Codes normalize to uppercase, enforce the owning namespace (NEU for the platform account; the operator prefix for company users) and reject duplicates before commit, with the database unique constraint as the final barrier. A conflict rolls back name, code, membership and revision changes. Manual company-code changes advance the sequence counter so automatic allocation does not collide. Passwords are not modified by user/name edits. Names remain display labels and need not be globally unique; login codes and underlying identity keys cannot duplicate. This supersedes SEC03’s read-only code field.
