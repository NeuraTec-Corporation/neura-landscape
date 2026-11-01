# Neura Landscape

Experimental modular foundation. No commercial launch approved.

## Local setup (PowerShell)

Use Node.js 24.19.0 and npm 11.17.0 (recorded in .node-version/package.json).
From this repository directory:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. Stop with Ctrl+C. No credentials are required.
The environment copy is optional; scripts disable anonymous Next.js telemetry.
Never commit real environment files or put secrets in NEXT_PUBLIC_* variables.

## Verification

```powershell
npm run lint
npm run typecheck
npm run build
npm test
```

Tests require a completed build, start their own production server on an available
loopback port, check HTTP output and stop the server. `npm run verify` executes the
same sequence. `npm start` runs the build locally at http://localhost:3000.
Lockfile pins the dependency graph; use npm ci for repeatable installation.

## Structure and scope

See docs/architecture.md for boundaries and the future Core adoption gate.
Includes one experimental page, shared notice component, noindex metadata,
X-Robots-Tag on all paths and robots.txt. No database, AI/API integration, real
customer data, business module or paid service. Noindex is not access control.

The canonical project record in Notion governs decisions; this repository versions
source code and technical verification. Corporate policy text is not copied here.
Push, merge, deployment and external service setup require separate approval.

## Working copy discipline

Continue in this checkout and the existing task branch. A Git branch records
history inside the same repository; it does not create another source directory.
Use commits for recovery. Avoid extra clones, worktrees, source ZIPs or copied
project folders. Dependencies and build caches are generated, ignored artifacts;
remove temporary recovery copies after verifying recovery. Keep current decisions
and open work in the existing canonical Notion project record; repository documents
contain runnable instructions, technical boundaries and verification evidence.
