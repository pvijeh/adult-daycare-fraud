import os
from pathlib import Path

import psycopg
from psycopg import Connection
from psycopg.types.json import Jsonb

from pipeline.nppes import ProviderRecord


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = PROJECT_ROOT / "sql" / "schema.sql"


def connect() -> Connection:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for pipeline jobs.")
    return psycopg.connect(database_url)


def initialize_schema(connection: Connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute(SCHEMA_PATH.read_text())


def replace_providers(
    connection: Connection,
    providers: list[ProviderRecord],
) -> None:
    rows = [
        (
            provider.npi,
            provider.org_name,
            provider.auth_name,
            provider.auth_phone,
            provider.raw_address,
            provider.clean_address,
            provider.zip_code,
            provider.city,
            provider.state,
            provider.enumeration_date,
        )
        for provider in providers
    ]
    with connection.cursor() as cursor:
        cursor.execute("TRUNCATE providers")
        cursor.executemany(
            """
            INSERT INTO providers (
                npi, org_name, auth_name, auth_phone, raw_address,
                clean_address, zip_code, city, state, enumeration_date
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            rows,
        )


def replace_census(
    connection: Connection,
    demographics: list[dict[str, str | int]],
) -> None:
    rows = [
        (
            str(row["zcta"]),
            int(row["total_population"]),
            int(row["senior_pop_65_plus"]),
        )
        for row in demographics
    ]
    with connection.cursor() as cursor:
        cursor.execute("TRUNCATE census_demographics")
        cursor.executemany(
            """
            INSERT INTO census_demographics (
                zcta, total_population, senior_pop_65_plus
            ) VALUES (%s, %s, %s)
            """,
            rows,
        )


def replace_pluto(
    connection: Connection,
    parcels: list[dict[str, str | float]],
) -> None:
    rows = [
        (
            str(parcel["clean_address"]),
            str(parcel["zip_code"]),
            float(parcel["bldg_area"]),
            float(parcel["com_area"]),
            str(parcel["bldg_class"]),
            str(parcel["owner_name"]),
        )
        for parcel in parcels
    ]
    with connection.cursor() as cursor:
        cursor.execute("TRUNCATE pluto_parcels")
        cursor.executemany(
            """
            INSERT INTO pluto_parcels (
                clean_address, zip_code, bldg_area, com_area,
                bldg_class, owner_name
            ) VALUES (%s, %s, %s, %s, %s, %s)
            """,
            rows,
        )


def replace_clusters(
    connection: Connection,
    clusters: list[dict[str, object]],
) -> None:
    rows = [
        (
            str(cluster["cluster_id"]),
            int(cluster["provider_count"]),
            int(cluster["node_count"]),
            Jsonb(cluster),
        )
        for cluster in clusters
    ]
    with connection.cursor() as cursor:
        cursor.execute("TRUNCATE network_clusters")
        cursor.executemany(
            """
            INSERT INTO network_clusters (
                cluster_id, provider_count, node_count, payload
            ) VALUES (%s, %s, %s, %s)
            """,
            rows,
        )


def record_run(
    connection: Connection,
    *,
    used_mock: bool,
    provider_count: int,
    census_count: int,
    parcel_count: int,
    cluster_count: int,
) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO pipeline_runs (
                status, used_mock, provider_count, census_count,
                parcel_count, cluster_count
            ) VALUES ('success', %s, %s, %s, %s, %s)
            """,
            (
                used_mock,
                provider_count,
                census_count,
                parcel_count,
                cluster_count,
            ),
        )
