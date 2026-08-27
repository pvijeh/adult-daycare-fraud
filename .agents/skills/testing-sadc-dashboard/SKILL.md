---
name: testing-sadc-dashboard
description: How to run and runtime-test the "Ghosts in the Grid" SADC investigation app locally (Next.js dashboard + Python ingestion pipeline), including demo vs Postgres mode, the NYC ZIP geometry proxy, MapLibre rendering pitfalls, and figure-export verification.
---

# Testing the SADC investigation dashboard

## Python side
- `python3.11` is NOT on PATH and default `python3` is 3.10.x. Use
  `/home/ubuntu/.pyenv/versions/3.11.11/bin/python -m venv .venv`, then
  `.venv/bin/pip install -r requirements.txt`.
- Checks: `.venv/bin/python -m compileall .`, module imports, `.venv/bin/python -m pytest -q`.

## Next.js side
- `npm install`; then `npm run typecheck`, `npm run lint`, `env -u DATABASE_URL npm run build`.
- Run the app: `env -u DATABASE_URL npx next start -p 3000` (build first).
  Next 16 refuses a second dev server for the same directory, so stop the first one before
  starting another mode.
- Kill a stale server without killing your own shell (never `pkill -f "next dev -p 3000"`):
  ```bash
  for p in $(ss -ltnp 2>/dev/null | grep ':3000' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do kill "$p"; done
  ```

## Database vs demo mode
- The machine-level `DATABASE_URL` secret belongs to an UNRELATED project — never use it.
  Always start the app with `env -u DATABASE_URL ...` for demo mode.
- For database mode, use a throwaway container:
  ```bash
  docker run -d --name sadc-pg -e POSTGRES_PASSWORD=testpass -p 127.0.0.1:55432:5432 postgres:16-alpine
  ```
  then `DATABASE_URL=postgresql://postgres:testpass@127.0.0.1:55432/sadc`. Host `psql` is not
  installed; use `docker exec sadc-pg psql -U postgres -d sadc ...`. Apply `sql/schema.sql` and write
  deterministic rows through the real writer functions in `pipeline/` so values are distinguishable
  from demo data (demo max density is 1.51 — seed something impossible like 8.00 to prove it is live).
- Demo mode fingerprint: yellow "Demonstration data." banner + `Demo dataset · 89 providers · 4,120 parcels`.

## NYC ZIP geometry / SOCRATA token
- `/api/zip-geometry` proxies `https://data.cityofnewyork.us/resource/pri4-ifjk.geojson?$limit=300`
  (~3.15 MB, 178 MultiPolygon features keyed by `modzcta`).
- The injected `SOCRATA_APP_TOKEN` is rejected by NYC Open Data: the same URL returns 200 anonymously
  and 403 when `X-App-Token` is sent. The route now retries anonymously on a token-triggered 403, so
  200 is expected even with the token set — always test with the token PRESENT, since that is the
  regression-prone path.

## MapLibre rendering in the headless browser (important)
- This browser DOES render MapLibre raster layers AND geojson fill layers (verified with a control
  page). So a blank map is NOT automatically a headless/SwiftShader limitation — build a control page
  before blaming the environment:
  serve a static HTML from `/tmp` (`python3 -m http.server`), load `maplibre-gl` from unpkg, use the
  same inline raster style + the same geojson (copy the `/api/zip-geometry` payload to a local file)
  and the same paint spec, then read `map.queryRenderedFeatures({layers:['fill']}).length`.
- CURRENT STATE (verified at commit 3d7340e): the choropleth WORKS. `maplibre-gl` is pinned to exact
  `5.9.0` and the layer is installed imperatively in `onLoad`. Expected healthy readings on the density
  tab: `isStyleLoaded()` true, `getSource('zip-density').loaded()` true,
  `queryRenderedFeatures({layers:['zip-density-fill']}).length` ≈ 196, visible blue/purple ZIP fills over
  the CARTO basemap, and a hover popup (`ZIP 11226 / 18 providers / 1.51 per 1,000 seniors` in demo mode,
  `4 providers / 8.00` with the seeded DB). If any of those regress, the history below is the playbook.
- Historical failure (4e7cd21 → 1df671b, fixed by the 5.9.0 pin): the choropleth never painted and hover
  never fired in BOTH demo and database mode, while the CARTO raster basemap DID paint. It reproduced
  with react-map-gl `<Source>/<Layer>` children (4e7cd21), source+layer embedded in the `mapStyle` object
  (52586db), and imperative `addSource`/`addLayer` from `onLoad` (1df671b) — because the cause was
  bundling, not the React plumbing.
- ROOT CAUSE of that failure (any `maplibre-gl` 6.x bump can bring it back) — a **bundling/worker**
  problem, not a react-map-gl API problem. Diagnostic recipe (run in the page
  console, get the raw map via `mapRef.current?.getMap()`, or find it by walking the React fiber; the
  react-map-gl wrapper has no `addSource`, so calling it there throws `m.addSource is not a function`):
  - `map.getSource('zip-density')` and `map.getLayer('zip-density-fill')` both EXIST, yet
    `map.isStyleLoaded()` is false, `map.getSource(...).loaded()` is false,
    `map.queryRenderedFeatures({layers:['zip-density-fill']}).length` is 0, and `map.on('error')`
    fires nothing — silent failure.
  - Decisive test: add a one-feature inline geojson polygon layer by hand
    (`map.addSource('tiny',{type:'geojson',data:<single Polygon>})` + a solid `fill` layer). If even
    that never renders and `loaded()` stays false, the geojson **web worker** is dead: raster layers
    are decoded on the main thread (hence a working basemap) while all geojson goes through the worker.
  - Why it is dead here: `maplibre-gl` 6.x is ESM-only and ships a SEPARATE worker module. Next/Turbopack
    emits it as a static asset (`/_next/static/media/maplibre-gl-worker.<hash>.mjs`, serves 200) but does
    NOT rewrite that file's relative import — it still says `from "./maplibre-gl-shared.mjs"`, while the
    emitted shared chunk is hashed (`maplibre-gl-shared.<hash>.mjs`). So
    `GET /_next/static/media/maplibre-gl-shared.mjs` → **404**, the module worker never boots, and no
    error surfaces. Verify with:
    ```bash
    grep -o 'from"[^"]*"' .next/static/media/maplibre-gl-worker.*.mjs   # -> ./maplibre-gl-shared.mjs
    curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/_next/static/media/maplibre-gl-shared.mjs
    ```
  - The fix that worked: pin `maplibre-gl` to exact `5.9.0`, which ships classic browser files and
    creates its worker from a `Blob`, so nothing depends on Turbopack rewriting a worker's relative
    import. Healthy build fingerprint after `npm ci` + `env -u DATABASE_URL npm run build`:
    ```bash
    node -e "console.log(require('maplibre-gl/package.json').version)"   # -> 5.9.0
    ls .next/static/media | grep -i maplibre        # -> no maplibre assets at all
    grep -rl "maplibre-gl-worker" .next/static      # -> no matches
    grep -rl 'Blob(\[' .next/static/chunks | head   # -> blob worker present
    ```
    Note: `GET /_next/static/media/maplibre-gl-shared.mjs` still 404s at 5.9.0, but that is harmless
    now — nothing requests it. Judge health by rendered feature count, not by that URL.
    Other options if a 6.x bump is required: a `workerUrl`/CDN override, or webpack instead of Turbopack.
- When building the control page, match the app's maplibre MAJOR version or note the difference: a 5.9
  control page passing while the app runs 6.x conflates "version" with "bundling". Check
  `node -e "console.log(require('maplibre-gl/package.json').version)"`.
- Fixed at 52586db (regression to keep checking): switching density -> spatial -> density used to leave
  the map fully blank with an uncaught `TypeError: Cannot read properties of undefined (reading
  'center')` from react-map-gl's `reuseMaps`/`resize` path. Removing `reuseMaps` fixed it; the tab
  round trip now re-renders the basemap with a clean console.
- Always check `browser console` after tab switching — these map errors are uncaught but silent visually.
- Confirmed still fixed at 3d7340e: density -> spatial -> density comes back with the basemap AND the
  shaded ZIP fills and a working hover popup, console clean (no `reading 'center'` TypeError, no
  duplicate-source/layer MapLibre error). The remounted map refetches the 3.15 MB geometry, so it shows
  "Loading NYC ZIP boundaries…" for ~10 s — wait before calling it a failure.
- Getting the raw map instance for diagnostics: the app does not expose it globally. Walk the React
  fiber from the `<canvas>` upward to the root, then scan each fiber's `stateNode` / `memoizedState` /
  `memoizedProps` (a few levels deep) for an object with both `queryRenderedFeatures` and `addSource`,
  or one with `getMap()`. A shallow `v.current || v.next` hop chain is NOT enough — it misses the ref.
- To hover a specific ZIP reliably, project it instead of guessing pixels:
  `map.project([-73.9565, 40.6465])` is ZIP 11226; add the canvas `getBoundingClientRect()` offset and
  multiply by the screenshot scale factor (screenshot width / `window.innerWidth`, ~0.64 at 1599 px) to
  get the coordinates the browser tool expects.
- Browser HTTP cache gotcha: after restarting the server in the other mode, `http://localhost:3000/`
  can serve the PREVIOUS mode's HTML (demo banner while the server is on Postgres). Load with a
  cache-busting query (`/?db=1`) or verify with `curl` before believing the page.

## Figure exports
- The "Export story figures" button exports only the ACTIVE tab's `svg[data-export-name]`, so switch
  tabs and export again for each figure. Downloads land in `/tmp/chisel_browser_downloads/`
  (`zip-density.svg/.png`, `spatial-outliers.svg/.png`).
- Verify numerically, not visually: PNG pixel size must be exactly 2× the SVG `viewBox`. Confirmed
  dimensions at 52586db: BOTH figures are `viewBox="0 0 760 430"` with `width="760" height="430"` and
  PNGs exactly **1520×860** (zip-density was 760×390 → 1520×780 before 52586db; 1520×780 now means a
  stale build).
- A PNG can be the right size and still look cut off: check whether the chart's own SVG content
  overflows its viewBox. Parse `<rect y/height>` and `<text y>` from the exported SVG and compare the
  max against the viewBox height. Density chart geometry: rows are `y = 82 + i*33`, bar height 23, so
  with 10 rows the max rect bottom is 402 and max text y is 395 — fine in the current 430-tall viewBox,
  clipped in the old 390-tall one. Also eyeball the bottom row (`11373 / 0.55` in demo data).

## Provider directory / dossiers (`/providers`, `/providers/[dftaId]`)
- These routes are `force-dynamic` and read LIVE public sources at request time
  (NYC Aging `32cj-z7va`, NPPES `npiregistry.cms.hhs.gov/api/`, OMIG
  `apps.omig.ny.gov/exclusions/tabdelimited.aspx`, plus PLUTO `64uk-42ks` and DOB
  `pkdm-hqz6` / `9r28-dr8b` per dossier). They do NOT use Postgres, so no container is needed —
  just `env -u DATABASE_URL npx next start`. Keep `SOCRATA_APP_TOKEN` set (the anonymous-retry
  path is the one that works).
- Live fingerprint (values drift as the public data changes — re-derive with `curl`, do not hardcode
  in assertions blindly): registry ~359 facilities, ~1,198 NPPES records and ~9,023 OMIG exclusions
  compared, 3 `enforcement record` facilities, all APNA (`S34801`, `S52401`, `S266301`).
  `S266301` is the best dossier specimen: high-confidence NPI `1841167855`, exact OMIG name match,
  PLUTO owner + `S4` class, and 2 related facilities.
- The directory filter is CLIENT-side over a payload that does not render phone or NPI, so searching
  `718-513-4822` (phone) and `1841167855` (NPI) is the only way to prove those fields are in the
  search index. `normalize()` strips non-word chars, so `718-513-4822` and `718 513 4822` both match.
  CLEAR the search box between queries — the browser `type` action appends, which silently produces
  a 0-result "failure" that is really a test bug.
- Borough + evidence-label filters must AND: BROOKLYN + `enforcement record` → 3, BRONX +
  `enforcement record` → 0. If a filtered count equals the unfiltered total, one filter is ignored.
- Forcing the labeled demo fallback WITHOUT touching app code: `HTTPS_PROXY` does not work (Next 16
  fetch ignores it). Use a preload that rejects `fetch` to the source hosts:
  ```js
  // /tmp/block-sources.js  (TEST HARNESS ONLY)
  const blocked = ["data.cityofnewyork.us","npiregistry.cms.hhs.gov","apps.omig.ny.gov"];
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    return blocked.some((h) => url.includes(h))
      ? Promise.reject(new Error("TEST HARNESS: simulated outage for " + url))
      : real(input, init);
  };
  ```
  then `NODE_OPTIONS=--require /tmp/block-sources.js env -u DATABASE_URL npx next start -p 3001`.
  Expected: yellow `Demonstration dossiers.` banner, `Current registry 2`, rows `DEMO-001`/`DEMO-002`,
  `/providers/DEMO-001` labeled `Demonstration dossier.` with PLUTO `No property match` and DOB
  `Requires records`, and real IDs like `/providers/S266301` returning 404. The fallback server log
  legitimately contains `Provider public-data query failed; using demonstration dossiers.` with a
  stack — that line in the LIVE log would be a real defect.
- Unknown IDs (`/providers/S999999`) must render Next's `404 / This page could not be found.`, never a
  blank dossier shell or a 500.
- Mobile: emulation reports ~410 px wide. Check `document.documentElement.scrollWidth ===
  clientWidth` on both the directory and a dossier to prove there is no horizontal overflow.

## Devin Secrets Needed
- `SOCRATA_APP_TOKEN` (already injected; currently rejected by NYC Open Data — keep it set when
  testing the geometry route so the anonymous-retry path is exercised).
- Do NOT use the machine-level `DATABASE_URL`.
