import duckdb
import pandas as pd

from analysis.db import init_db


def get_top_density_zips(
    limit: int = 10,
    connection: duckdb.DuckDBPyConnection | None = None,
) -> pd.DataFrame:
    owns_connection = connection is None
    database = connection or init_db()
    try:
        return database.execute(
            """
            SELECT
                zcta,
                total_population,
                senior_pop_65_plus,
                total_adc_providers,
                adc_per_1000_seniors
            FROM v_zip_density_analysis
            ORDER BY adc_per_1000_seniors DESC NULLS LAST, total_adc_providers DESC
            LIMIT ?
            """,
            [max(limit, 0)],
        ).fetchdf()
    finally:
        if owns_connection:
            database.close()


def get_all_density_zips(
    connection: duckdb.DuckDBPyConnection | None = None,
) -> pd.DataFrame:
    owns_connection = connection is None
    database = connection or init_db()
    try:
        return database.execute(
            """
            SELECT
                zcta,
                total_population,
                senior_pop_65_plus,
                total_adc_providers,
                adc_per_1000_seniors
            FROM v_zip_density_analysis
            WHERE zcta BETWEEN '10000' AND '11699'
            ORDER BY zcta
            """
        ).fetchdf()
    finally:
        if owns_connection:
            database.close()


def get_spatial_outliers(
    connection: duckdb.DuckDBPyConnection | None = None,
) -> pd.DataFrame:
    owns_connection = connection is None
    database = connection or init_db()
    try:
        return database.execute(
            """
            WITH provider_buildings AS (
                SELECT
                    clean_address,
                    MAX(zip_code) AS zip_code,
                    COUNT(DISTINCT npi) AS provider_count,
                    STRING_AGG(DISTINCT npi, ', ' ORDER BY npi) AS provider_npis
                FROM providers
                WHERE clean_address IS NOT NULL AND clean_address <> ''
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
                WHERE clean_address IS NOT NULL AND clean_address <> ''
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
                ON providers.clean_address = parcels.clean_address
            ORDER BY providers.provider_count DESC, parcels.com_area ASC NULLS FIRST
            """
        ).fetchdf()
    finally:
        if owns_connection:
            database.close()
