# Corporate integration boundary

Reserved for project-owned adapters to approved, versioned NeuraTec packages.
No Core package, canonical customer contract or tenant isolation is implemented.
Do not import routes or vertical internals here. Export each future adapter through
its own public index.ts; consumers must not reach into implementation files.
Record provenance, version, license clearance, compatibility tests and acceptance
before adopting any corporate asset. Never copy another project's configuration.
