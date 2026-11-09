# PostgreSQL recovery and concurrency drill

First executed successfully in [CI 42568189488, PostgreSQL job](https://github.com/NeuraTec-Corporation/neura-landscape/actions/runs/42568189488/job/128999252169)
on 2026-11-09, source `94bf21470ac839d2a1b51753537ccda71203da7f`.
This closes the synthetic PostgreSQL restore and bounded contention checks only;
the hosted recovery and commercial capacity limits below still apply.

`scripts/postgres-drill.mjs` runs only against loopback PostgreSQL on port 5432.
It requires `LANDSCAPE_POSTGRES_DRILL=local-disposable-only` and
`LANDSCAPE_DRILL_PASSWORD` for that disposable server. It does not read
DATABASE_URL, Vercel secrets or application credentials. Never point a tunnel or
port-forward to a real database at this port while running it.

The existing CI workflow supplies PostgreSQL 16 as a job-scoped service and uses
version 16 client tools. No persistent database service is provisioned. No dumps,
row contents or credentials are uploaded as artifacts. The password in the workflow
belongs only to the isolated disposable CI service, not Landscape.

The runner creates two randomly named `landscape_drill_*` databases, records only
the names it created and drops those databases on completion. A temporary custom
format dump is removed afterward. CI also destroys the service when the job ends.

Checks:

- Two concurrent application migration runners serialize on the advisory lock.
- Two company namespaces receive synthetic operational scenarios and identity
  structure; binary photo payload preservation is included.
- 48 overlapping transactions exercise the actual pool on more than one backend,
  verify tenant search paths and counters, and test rollback without lost updates.
- Two concurrent saves through the real employee service use the same revision:
  exactly one succeeds and the other must return conflict 409.
- Pool search paths return to their original value after success and rollback.
- `pg_dump` custom backup restores with `pg_restore --single-transaction` into the
  second, empty database, never the source.
- Every application table row, table column signature, constraint definition and
  sequence state is fingerprinted before backup and after restore. Binary data,
  JSON snapshots, money and shared identity/security rows participate in this check.
- A new employee and its identity-backed audit entry can be written after restore.

This is an executable synthetic recovery drill, not proof of recovery of the hosted
Neon database or external Blob objects. External object storage, OAuth secrets,
Vercel configuration, privileged roles, provider retention and infrastructure are
outside the dump. A commercial recovery policy still needs approved RPO/RTO,
retention, encryption, independent backups and a hosted recovery exercise.

The 48-operation check verifies bounded contention correctness, not enterprise
capacity, latency objectives or a production load test. Browser authorization and
hosted company separation are verified separately in SEC06. Local Windows without
PostgreSQL tools or a running container engine cannot execute this job; CI is the
reproducible execution environment. Passing results must be linked to the actual run.
