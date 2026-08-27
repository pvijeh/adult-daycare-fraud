# Ghosts in the Grid

An open-source data journalism pipeline for auditing New York City Adult Day
Care and Social Adult Day Care registrations. It connects federal provider
records, Census demographics, and municipal property data to surface leads
around geographic saturation, shared corporate identifiers, and multiple
licenses registered at one address.

The public dashboard is a Next.js application designed for Vercel. Scheduled
Python jobs fetch and analyze public data, then persist read-optimized results
to Postgres.

## Architecture

```text
NPPES ─┐
ACS ───┼─ Python 3.11 / GitHub Actions ─ Postgres ─ Next.js / Vercel
PLUTO ─┘                │
                 NetworkX clusters
```

- **Next.js + TypeScript:** server-side Postgres reads, MapLibre ZIP choropleth,
  interactive investigation views, provider dossiers, and browser-side PNG/SVG
  exports.
- **Python 3.11:** API ingestion, deterministic NPPES fallback fixtures,
  normalization, and NetworkX connected-component analysis.
- **Postgres:** durable provider, demographic, property, graph, and pipeline-run
  tables plus density and spatial-outlier views.
- **GitHub Actions:** weekly Monday refresh and manual `workflow_dispatch`.

Without `DATABASE_URL`, the frontend starts in demonstration mode with
illustrative records. Those records are visibly labeled and are not findings.

## Data sources

| Source | Use |
| --- | --- |
| [NPPES NPI Registry](https://npiregistry.cms.hhs.gov/api-page) | Organizations, authorized officials, phones, and practice addresses |
| [NYC Aging SADC registry](https://data.cityofnewyork.us/City-Government/Department-for-the-Aging-NYC-Aging-Social-Adult-Da/32cj-z7va) | Canonical current facility directory, sponsor identity, address, phone, BIN, and BBL |
| [NYS OMIG exclusions](https://omig.ny.gov/medicaid-fraud/medicaid-exclusions) | Exact entity-name and NPI exclusion records |
| [2022 ACS 5-year API](https://www.census.gov/data/developers/data-sets/acs-5year.html) | Total and age-65+ population by ZCTA |
| [NYC PLUTO](https://data.cityofnewyork.us/Housing-Development/Primary-Land-Use-Tax-Lot-Output-PLUTO-/64uk-42ks) | Building area, commercial area, class, and owner |
| [DOB NOW Certificates of Occupancy](https://data.cityofnewyork.us/Housing-Development/DOB-NOW-Certificate-of-Occupancy/pkdm-hqz6) | Certificate filing and issuance metadata |
| [NYC modified ZIP boundaries](https://data.cityofnewyork.us/Business/Modified-Zip-Code-Tabulation-Areas-MODZCTA-/pri4-ifjk) | Lightweight dashboard geometry |

The output is a lead-generation tool, not a determination of fraud. Entity
links and spatial anomalies need source-document review and reporting.

## Research documentation

- [NYC Social Adult Day Care data sources](docs/DATA_SOURCES.md) — availability,
  join keys, limitations, project status, and suitability for detecting or
  corroborating possible fraud.
- [NYC Social Adult Day Care industry primer](docs/NYC_SADC_INDUSTRY.md) —
  services, oversight, payment and identity relationships, investigative
  typologies, and evidence-safe publication rules.

## Local frontend

Requirements:

- Node.js 20.9+ (Node 22 is used in CI)
- npm 10+

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. With no environment file, the dashboard uses demo
data. Copy `.env.example` to `.env.local` and set a project-specific
`DATABASE_URL` to read refreshed results.

Validation:

```bash
npm run typecheck
npm run lint
npm run build
```

## Python pipeline

Requirements:

- Python 3.11+
- Access to the same Postgres database used by the dashboard

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --requirement requirements.txt
export DATABASE_URL='postgresql://...'
python -m pipeline.run
```

For a deterministic NPPES run:

```bash
USE_MOCK_NPPES=true python -m pipeline.run
```

NPPES failures automatically fall back to 50 deterministic records so graph
and storage stages can still execute. Census requests use `CENSUS_API_KEY` when
available and otherwise fall back to the official ACS table-based summary file.
Census and PLUTO failures remain fatal to avoid publishing partially refreshed
demographic or property results.

Tests:

```bash
python -m pytest -q
```

## Database

`sql/schema.sql` is applied automatically by every pipeline start. It creates:

- `providers`
- `census_demographics`
- `pluto_parcels`
- `network_clusters`
- `pipeline_runs`
- `v_zip_density_analysis`
- `v_spatial_outliers`

The density view uses:

```sql
(provider_count / NULLIF(senior_pop_65_plus, 0)) * 1000
```

The spatial view only includes normalized addresses with at least three
distinct NPIs and a matching PLUTO record.

## Scheduled refresh

Add these GitHub Actions repository secrets:

- `DATABASE_URL` — the project-specific Postgres connection string.
- `SOCRATA_APP_TOKEN` — optional but recommended for NYC Open Data limits.

The `Refresh investigation data` workflow runs every Monday at 09:17 UTC.
It can also be started manually from the Actions page, with an option to force
deterministic NPPES fixtures.

## Vercel deployment

1. Import this GitHub repository into Vercel.
2. Set the framework preset to Next.js.
3. Add `DATABASE_URL` to Production, Preview, and Development environments.
4. Optionally add `SOCRATA_APP_TOKEN` for the ZIP geometry proxy.
5. Deploy.

Use the same project-specific database URL in Vercel and GitHub Actions. Do not
reuse a connection string belonging to another application.

## Investigation views

1. **Geographic density** — NYC ZIP shading and a ranked provider-per-1,000
   senior population chart.
2. **Corporate webs** — provider, authorized official, phone, and address
   connected components with two or more provider nodes.
3. **Spatial sanity check** — commercial area against distinct licenses for
   PLUTO-matched addresses with three or more provider registrations.
4. **Provider dossiers** — searchable NYC Aging facilities with deterministic
   NPPES reconciliation, exact OMIG exclusion matches, property and certificate
   metadata, source provenance, limitations, and a visible human-review gate.

The export control downloads each visible story chart as both SVG and
high-resolution PNG in the browser.
