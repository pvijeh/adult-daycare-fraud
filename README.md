# SADC Data Investigation

`sadc-data-investigation` is an open-source data journalism and forensic-analysis
pipeline for auditing New York adult day care (ADC) and social adult day care
(SADC) operations. It cross-references federal provider registrations, Census
demographics, and New York City property records to surface geographic
saturation, shared corporate identifiers, and multiple licenses at one address.

The indicators produced by this project are reporting leads, not proof of fraud,
licensure violations, or improper care. Confirm every finding against primary
records and with the organizations involved before publication.

## Data sources

- [CMS National Plan and Provider Enumeration System](https://npiregistry.cms.hhs.gov/)
- [2022 ACS 5-year estimates](https://api.census.gov/data/2022/acs/acs5.html)
- [NYC Primary Land Use Tax Lot Output (PLUTO)](https://data.cityofnewyork.us/resource/64uk-42ks)

The NPPES request searches New York organizations whose taxonomy description is
`Adult Day Care`. If NPPES is unavailable, the pipeline generates 50 clearly
identified mock records so the dashboard can still be developed and tested.
Never use the mock records for reporting.

## Quick start

Python 3.11 or newer is required.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
streamlit run app.py
```

Use **Ingest Data** in the sidebar to load all three sources. Data is stored in
`data/investigation.duckdb`; generated PNG and SVG charts are written to
`exports/`.

Each ingestion module can also run independently:

```bash
python -m ingest.nppes
python -m ingest.census
python -m ingest.pluto
```

## Dashboard

1. **Geographic Density** maps and ranks ZIP Code Tabulation Areas by adult day
   care providers per 1,000 residents age 65 or older.
2. **Corporate Webs** builds a heterogeneous NetworkX graph linking facilities
   to authorized officials, phone numbers, and registered addresses.
3. **Spatial Sanity Check** compares commercial floor area with the count of
   distinct provider licenses registered at a matched PLUTO address.

## Methodology

The density view uses:

```sql
ROUND(
  (COUNT(provider_npi)::FLOAT / NULLIF(senior_population_65_plus, 0)) * 1000,
  2
)
```

Address matching is deterministic rather than probabilistic: text is
uppercased, punctuation and unit designators are removed, whitespace is
collapsed, and common street suffixes are abbreviated. This makes the process
auditable, but it can miss legitimate matches or merge distinct locations.

Other important limitations:

- NPPES taxonomy searches may omit facilities registered under another taxonomy.
- A shared official, phone, or address can reflect legitimate common ownership.
- ZIP Code Tabulation Areas are approximations and do not exactly match USPS ZIP
  delivery areas.
- PLUTO describes tax lots and buildings; floor area does not establish the
  space occupied by an individual provider.
- Source systems update on different schedules.

## Tests

```bash
pytest
```

The test suite uses temporary DuckDB databases and does not require live API
access. It covers schema creation, the NPPES fallback, normalization, graph
clustering, density calculations, and spatial outlier detection.

## Project structure

```text
.
├── README.md
├── requirements.txt
├── app.py
├── ingest/
│   ├── __init__.py
│   ├── nppes.py
│   ├── census.py
│   └── pluto.py
├── analysis/
│   ├── __init__.py
│   ├── db.py
│   ├── network_graph.py
│   └── metrics.py
├── tests/
│   ├── __init__.py
│   └── test_pipeline.py
├── exports/
└── data/
```

## License and contributions

No license has been selected yet. Add an OSI-approved license before distributing
or accepting external contributions.
