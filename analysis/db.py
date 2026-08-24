from pathlib import Path

import duckdb


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "investigation.duckdb"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS providers (
    npi VARCHAR PRIMARY KEY,
    org_name VARCHAR,
    auth_name VARCHAR,
    auth_phone VARCHAR,
    raw_address VARCHAR,
    clean_address VARCHAR,
    zip_code VARCHAR(5),
    city VARCHAR,
    state VARCHAR(2),
    enumeration_date VARCHAR
);

CREATE TABLE IF NOT EXISTS census_demographics (
    zcta VARCHAR(5) PRIMARY KEY,
    total_population INTEGER,
    senior_pop_65_plus INTEGER
);

CREATE TABLE IF NOT EXISTS pluto_parcels (
    clean_address VARCHAR,
    zip_code VARCHAR(5),
    bldg_area DOUBLE,
    com_area DOUBLE,
    bldg_class VARCHAR,
    owner_name VARCHAR
);

CREATE OR REPLACE VIEW v_zip_density_analysis AS
SELECT
    c.zcta,
    c.total_population,
    c.senior_pop_65_plus,
    COUNT(p.npi) AS total_adc_providers,
    ROUND((COUNT(p.npi)::FLOAT / NULLIF(c.senior_pop_65_plus, 0)) * 1000, 2) AS adc_per_1000_seniors
FROM census_demographics c
LEFT JOIN providers p ON c.zcta = p.zip_code
GROUP BY c.zcta, c.total_population, c.senior_pop_65_plus;
"""


def init_db(
    db_path: str | Path = DEFAULT_DB_PATH,
) -> duckdb.DuckDBPyConnection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect(str(path))
    connection.execute(SCHEMA_SQL)
    return connection
