# Operational controls — implementation and activation

This document records the OPS05 baseline. Current assignment, warehouse, asset,
portal and provider-port extensions are in [assignment-controls.md](assignment-controls.md).

This release extends the existing Landscape application and company namespaces.
There is no second application, database copy, branch or paid service.

## What is executable

- **Resource tariffs:** Materials and equipment can receive clearly identified
  evaluation tariffs (equipment USD 18 per catalog unit, bags USD 12, other
  material units USD 5). Only missing prices are filled. The action is explicit,
  audited and repeatable. Existing visit baselines are not rewritten. These prices
  are invented evaluation inputs, not market research or commercial prices.
- **Availability:** In Employees, confirm company working weekdays and register,
  edit or cancel full-day absences. New visit saves and schedule suggestions
  enforce them. Existing incompatible scheduled visits are marked for review,
  with revision increments; no visit is silently cancelled or reassigned. An
  unconfigured calendar is explicitly reported, not assumed to mean weekdays.
  Existing crew shifts, travel, breaks, overlap and property access-window checks
  continue to apply. Structured qualification validity and day-specific property access policies
  are now implemented by the assignment-controls extension.
- **Maps:** Daily company/crew itinerary lists registered locations and opens
  Google Maps links. Mobile routes are split into at most four destinations per
  segment (three intermediate waypoints); the previous destination starts the
  next segment. Missing coordinates block route links. This preserves the planned
  order and all stops; it does not optimize the order, import road durations or
  track employees. No API key or paid Maps API is activated. See the
  [official Maps URL documentation](https://developers.google.com/maps/documentation/urls/get-started).
- **Inventory:** Material entries/adjustments have immutable, audited movements,
  idempotent references and negative-stock protection. Posting visit consumption
  computes the difference from previously posted totals, including returns after
  corrections. It does not duplicate visit costs. An initial balance is not
  assumed: materials with no movement are shown as not inventoried. Equipment
  assets have unique codes, serials, responsible crews, status and maintenance
  dates. Editing preserves audit history. The assignment-controls extension adds multiple warehouses, physical asset
  reservations and maintenance orders; purchasing is separate.
- **Communications:** Drafts and reminders are stored per customer, with revision
  control, cancellation and history. Prepared messages may be opened manually in
  email/SMS/WhatsApp applications. A handoff record is not a delivery receipt.
  Scheduled dates do not trigger background sends. No provider is configured.
- **Customer portal:** A `Cliente · portal privado` profile grants only
  `portal.read`. Create a normal native user/code (or Google-linked identity) in
  Users, then explicitly map the account to a customer in Portal. Revocation is
  enforced on subsequent requests. Queries scope by the authenticated subject and
  customer inside the selected company; the caller cannot supply a customer ID to
  widen access. Only issued invoices appear. Photos require explicit publication
  and a separate authenticated, customer-scoped image endpoint. Internal notes,
  employee costs, private photos and draft invoices are not part of the payload.
- **Operational readiness:** Integrations shows actual counts for missing tariffs,
  calendars, pending assignments, coordinates, maintenance, messages and portal
  mappings, with commercial blockers explicitly pending. It does not turn a
  configured module into a commercial certification.

## Activation in the existing Preview

1. Open the selected operating company as an authorized administrator.
2. Materials and equipment: fill missing evaluation rates explicitly; enter actual
   evaluation stock balances and identify physical equipment if desired. These are
   separate from rates and are never fabricated automatically.
3. Employees: confirm working weekdays and any full-day absences. Review the
   affected assignments in Agenda; the application preserves historical visits.
4. Routes: select day/crew, complete missing property coordinates, and open the
   itinerary in Maps. Review actual road times there before adjusting Agenda.
5. Communications: compose a draft or reminder. Delivery remains manual unless a
   provider is later authorized and configured.
6. Users: create a customer account with only the customer portal profile. Portal:
   assign its customer record and expressly publish approved pictures.
7. Integrations: inspect readiness and the remaining commercial dependencies.

## Dependencies that prevent closing all seven checklist items

- Places autocomplete and automatic road/traffic optimization require a verified
  routing provider and its credentials/usage policy. They are not activated.
- Automatic messaging, delivery receipts and background reminder delivery require
  an approved channel provider. No messages are sent by this release.
- Hosted recovery is not demonstrated by a local or CI synthetic restore. Provider
  retention, independent backups, private object recovery, approved RPO/RTO and
  an actual hosted restore exercise remain pending, as do representative capacity
  and availability objectives. See [recovery.md](recovery.md).
- The subsequent assignment-controls release implements recorded qualification
  validity, weekly access policies, multiple warehouses, reservations and
  maintenance orders. See [assignment-controls.md](assignment-controls.md) for
  current behavior. Initial operational data and real provider/hosted recovery
  acceptance remain distinct from implementation.

## Architecture and verification

Business persistence is in migrations 023–025, replayed in public and every
existing/new company namespace. Migration 026 updates shared profile permissions
and creates the least-privileged customer profile. Module code stays under
`src/modules/operations`; HTTP authorization and company context remain in the
existing adapters. New capabilities are explicit in the permission registry and
do not grant access to other customer/company records.

Targeted functional scenarios cover availability and tenant migration compatibility,
inventory retries/corrections, portal isolation/revocation/private photo filtering,
and communication status semantics. Security regression coverage is relevant
because this release adds profiles and permissions. CI also runs the repository's
existing checks; see the linked run in the delivery report for actual outcomes.
No claim about hosted execution follows solely from compilation or unit tests.
