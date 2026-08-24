CREATE TABLE IF NOT EXISTS providers (
    npi VARCHAR(10) PRIMARY KEY,
    org_name TEXT NOT NULL,
    auth_name TEXT NOT NULL DEFAULT '',
    auth_phone TEXT NOT NULL DEFAULT '',
    raw_address TEXT NOT NULL DEFAULT '',
    clean_address TEXT NOT NULL DEFAULT '',
    zip_code VARCHAR(5) NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state VARCHAR(2) NOT NULL DEFAULT '',
    enumeration_date TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS census_demographics (
    zcta VARCHAR(5) PRIMARY KEY,
    total_population INTEGER NOT NULL,
    senior_pop_65_plus INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pluto_parcels (
    id BIGSERIAL PRIMARY KEY,
    clean_address TEXT NOT NULL,
    zip_code VARCHAR(5) NOT NULL DEFAULT '',
    bldg_area DOUBLE PRECISION NOT NULL DEFAULT 0,
    com_area DOUBLE PRECISION NOT NULL DEFAULT 0,
    bldg_class TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_providers_zip_code
    ON providers (zip_code);
CREATE INDEX IF NOT EXISTS idx_providers_clean_address
    ON providers (clean_address);
CREATE INDEX IF NOT EXISTS idx_pluto_clean_address
    ON pluto_parcels (clean_address);

CREATE TABLE IF NOT EXISTS network_clusters (
    cluster_id TEXT PRIMARY KEY,
    provider_count INTEGER NOT NULL,
    node_count INTEGER NOT NULL,
    payload JSONB NOT NULL,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id BIGSERIAL PRIMARY KEY,
    status TEXT NOT NULL,
    used_mock BOOLEAN NOT NULL DEFAULT FALSE,
    provider_count INTEGER NOT NULL DEFAULT 0,
    census_count INTEGER NOT NULL DEFAULT 0,
    parcel_count INTEGER NOT NULL DEFAULT 0,
    cluster_count INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE VIEW v_zip_density_analysis AS
SELECT
    census.zcta,
    census.total_population,
    census.senior_pop_65_plus,
    COUNT(providers.npi)::INTEGER AS total_adc_providers,
    ROUND(
        (
            COUNT(providers.npi)::NUMERIC
            / NULLIF(census.senior_pop_65_plus, 0)
        ) * 1000,
        2
    ) AS adc_per_1000_seniors
FROM census_demographics census
LEFT JOIN providers ON census.zcta = providers.zip_code
GROUP BY
    census.zcta,
    census.total_population,
    census.senior_pop_65_plus;

CREATE OR REPLACE VIEW v_spatial_outliers AS
WITH provider_buildings AS (
    SELECT
        clean_address,
        MAX(zip_code) AS zip_code,
        COUNT(DISTINCT npi)::INTEGER AS provider_count,
        STRING_AGG(DISTINCT npi, ', ' ORDER BY npi) AS provider_npis
    FROM providers
    WHERE clean_address <> ''
    GROUP BY clean_address
    HAVING COUNT(DISTINCT npi) >= 3
),
parcel_buildings AS (
    SELECT
        clean_address,
        MAX(zip_code) AS parcel_zip_code,
        MAX(bldg_area) AS bldg_area,
        MAX(com_area) AS com_area,
        STRING_AGG(DISTINCT bldg_class, ', ' ORDER BY bldg_class)
            AS bldg_class,
        STRING_AGG(DISTINCT owner_name, '; ' ORDER BY owner_name)
            AS owner_name
    FROM pluto_parcels
    WHERE clean_address <> ''
    GROUP BY clean_address
)
SELECT
    providers.clean_address,
    COALESCE(providers.zip_code, parcels.parcel_zip_code) AS zip_code,
    providers.provider_count,
    providers.provider_npis,
    parcels.bldg_area,
    parcels.com_area,
    parcels.bldg_class,
    parcels.owner_name
FROM provider_buildings providers
INNER JOIN parcel_buildings parcels
    ON providers.clean_address = parcels.clean_address;
