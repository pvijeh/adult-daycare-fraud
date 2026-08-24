---
name: testing-sadc-dashboard
description: How to run and end-to-end test the "Ghosts in the Grid" NYC adult day care dashboard (Next.js 16 + Postgres + Python ingestion), including demo mode, an isolated local Postgres, deterministic seeding, MapLibre/figure-export gotchas.
---

# Testing the SADC investigation dashboard

## Stack layout
- `app/`, `components/`, `lib/` — Next.js 16 (Turbopack) App Router dashboard with three tabs
  (Geographic density, Corporate webs, Spatial sanity check).
- `lib/data.ts` — if `DATABASE_URL` is unset it returns bundled demo data and the UI shows a
  "Demonstration data." banner; with `DATABASE_URL` set it reads Postgres and the banner disappears.
- `sql/schema.sql` + `pipeline/` (Python 3.11) — ingestion/NetworkX clustering writers, run by
  scheduled GitHub Actions (`.github/workflows/refresh-data.yml`).

## Python setup (python3.11 is NOT on PATH)
```bash
/home/ubuntu/.pyenv/versions/3.11.11/bin/python -m venv .venv   # default python3 is 3.10
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m compileall pipeline tests && .venv/bin/python -m pytest -q
```
Python dependencies are exact pins in `requirements.txt`.

## Node setup and running
```bash
npm install
npm run typecheck && npm run lint
env -u DATABASE_URL npm run build
env -u DATABASE_URL npx next start -p 3000     # demo mode
```
Notes:
- Next 16 dev refuses a second dev server for the same directory; stop the first one before
  starting another (find the PID via `ss -ltnp | grep :3000`, do NOT `pkill -f "next dev"` from a
  shell whose own command line contains that string — it kills your shell).
- Prefer `next start` over `next dev` for UI verification: fewer HMR/overlay artifacts in recordings.

## Isolated Postgres for database mode (never reuse a machine-level DATABASE_URL)
```bash
docker run -d --name sadc-pg -e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=sadc \
  -p 127.0.0.1:55432:5432 postgres:16-alpine
docker exec -i sadc-pg psql -U postgres -d sadc < sql/schema.sql
# seed through the real writer functions with injected deterministic records, then:
env DATABASE_URL="postgresql://postgres:testpass@127.0.0.1:55432/sadc" npx next start -p 3000
```
`psql` is not installed on the host — use `docker exec sadc-pg psql -U postgres -d sadc`.
Good deterministic seed shape: one ZIP with a tiny senior population (gives an unmistakable
density like 8.00 that demo data can never produce), one address with 3+ NPIs but *no* PLUTO
parcel (negative control for the spatial INNER JOIN), and one singleton provider (must not appear
in any cluster).

## Regression checks
- Test `/api/zip-geometry` with and without `SOCRATA_APP_TOKEN`. NYC Open Data may reject an invalid
  token with 403; the route must retry anonymously rather than taking the map down.
- MapLibre uses an inline CARTO raster style so headless/SwiftShader Chrome does not need to finish
  loading a remote vector style before the MODZCTA layer can paint. Confirm recognizable NYC ZIP
  geometry and a hover popup with ZIP, provider count, and density.
- Figure export (`lib/export-figures.ts`) rasterizes SVG via `new Image()`. Open each downloaded PNG
  and assert its pixel dimensions are exactly twice the SVG viewBox dimensions, with the bottom and
  right edges intact. Browser downloads land in `/tmp/chisel_browser_downloads/`.

## Devin Secrets Needed
- None required. Explicitly avoid the machine-level `DATABASE_URL` (scoped to an unrelated project)
  and unset `SOCRATA_APP_TOKEN` unless you have confirmed it is valid.
