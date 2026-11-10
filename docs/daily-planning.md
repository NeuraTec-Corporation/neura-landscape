# Daily crew planning — OPS02

In Trabajos y agenda, company planners see a daily crew board before the visit
editor. Each card shows current crew members, shift, break, scheduled service and
travel minutes, remaining total time and warnings. Search and pagination reuse the
existing seven-record collection controls. The crew portal and its assigned-only
permissions remain separate.

Available minutes = shift end − shift start − break. Reserved minutes = planned
service duration + manually estimated previous-leg travel. Remaining is the positive
difference; overcapacity is shown separately. Crew headcount never automatically
divides visit duration. Remaining minutes may be fragmented, not a continuous slot.
Completed visits retain their planned allocation in this planning view; this is not
an actual-hours or employee-productivity report. Day and shift checks use New York;
the visit input explicitly follows device-local time and is converted to an instant.

Warnings identify overlapping crew/person reservations, out-of-shift work including
travel, incomplete/inactive crew membership, missing planned duration, excess daily
minutes and assignments still marked for review. Cancelled/withdrawn visits do not
reserve time. The same employee scheduled in different crews is checked through
recorded visit personnel; old records without snapshots use current crew members.

Selecting a date, crew or duration updates the projected day before saving, excluding
the edited visit's old reservation. Existing saveVisit transaction checks remain the
authority: permission checks, crew/person locks, active own resources, revision,
contract validity, overlap, shift and daily capacity. The preview is informational,
not an authorization or a replacement for those checks.

The reassignment queue includes all marked scheduled visits across dates. Reviewing
one opens its existing record with its date and tasks intact. Changing crew clears
old task-person assignments so the manager can choose an eligible responsible person
or the whole new crew. Only a valid save clears the review flag and replaces personnel
snapshots, with before/after audit. Failed saves preserve the pending flag. There is
no silent bulk assignment, cancellation, route reordering or synthetic staff creation.

Current scope: time/personnel reservations in the selected company. No road-routing
provider, live GPS, weather, absence calendar, skill certification, material inventory
availability or equipment conflict calculation is inferred. Travel remains manually
estimated; Google Maps integration is a separate step.

Focused acceptance: tests/daily-capacity.test.mjs contains two cases: planning
calculations/calendar/conflict behavior and transactional reassignment with failed
save preservation, successful review clearance and audit. Lint/type validation and
one desktop/mobile UI walkthrough complete the change-specific verification; do not
claim a hosted walkthrough until it has actually been observed.
