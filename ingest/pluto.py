import os
from collections.abc import Iterable

import duckdb
import pandas as pd
import requests
from pydantic import BaseModel, TypeAdapter

from analysis.db import init_db
from ingest.nppes import standardize_address


PLUTO_ENDPOINT = "https://data.cityofnewyork.us/resource/64uk-42ks.json"
PAGE_SIZE = 50_000
ZIP_BATCH_SIZE = 25


class PlutoApiRow(BaseModel):
    address: str = ""
    zipcode: str = ""
    bldgarea: str | float | int = 0
    comarea: str | float | int = 0
    bldgclass: str = ""
    ownername: str = ""


PLUTO_ROWS = TypeAdapter(list[PlutoApiRow])


def _float_value(value: str | float | int) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _chunks(values: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def get_provider_zip_codes(connection: duckdb.DuckDBPyConnection) -> list[str]:
    return [
        row[0]
        for row in connection.execute(
            """
            SELECT DISTINCT zip_code
            FROM providers
            WHERE zip_code IS NOT NULL AND zip_code <> ''
            ORDER BY zip_code
            """
        ).fetchall()
    ]


def fetch_pluto_parcels(
    zip_codes: list[str],
    timeout: int = 60,
) -> pd.DataFrame:
    rows: list[dict[str, str | float]] = []
    headers = {}
    app_token = os.environ.get("SOCRATA_APP_TOKEN")
    if app_token:
        headers["X-App-Token"] = app_token

    for zip_batch in _chunks(sorted(set(zip_codes)), ZIP_BATCH_SIZE):
        quoted_zips = ", ".join(f"'{zip_code}'" for zip_code in zip_batch)
        offset = 0
        while True:
            response = requests.get(
                PLUTO_ENDPOINT,
                params={
                    "$select": (
                        "address,zipcode,bldgarea,comarea,bldgclass,ownername"
                    ),
                    "$where": f"zipcode in ({quoted_zips})",
                    "$limit": PAGE_SIZE,
                    "$offset": offset,
                    "$order": ":id",
                },
                headers=headers,
                timeout=timeout,
            )
            response.raise_for_status()
            page = PLUTO_ROWS.validate_python(response.json())
            rows.extend(
                {
                    "clean_address": standardize_address(parcel.address),
                    "zip_code": parcel.zipcode[:5],
                    "bldg_area": _float_value(parcel.bldgarea),
                    "com_area": _float_value(parcel.comarea),
                    "bldg_class": parcel.bldgclass,
                    "owner_name": parcel.ownername,
                }
                for parcel in page
                if parcel.address
            )
            if len(page) < PAGE_SIZE:
                break
            offset += PAGE_SIZE

    return pd.DataFrame(
        rows,
        columns=[
            "clean_address",
            "zip_code",
            "bldg_area",
            "com_area",
            "bldg_class",
            "owner_name",
        ],
    )


def ingest_pluto(
    connection: duckdb.DuckDBPyConnection | None = None,
    frame: pd.DataFrame | None = None,
) -> pd.DataFrame:
    owns_connection = connection is None
    database = connection or init_db()
    try:
        zip_codes = get_provider_zip_codes(database)
        parcels = (
            frame.copy()
            if frame is not None
            else fetch_pluto_parcels(zip_codes) if zip_codes else pd.DataFrame()
        )
        if parcels.empty:
            return parcels
        database.execute("DELETE FROM pluto_parcels")
        database.register("pluto_batch", parcels)
        try:
            database.execute(
                """
                INSERT INTO pluto_parcels
                SELECT
                    clean_address, zip_code, bldg_area, com_area,
                    bldg_class, owner_name
                FROM pluto_batch
                """
            )
        finally:
            database.unregister("pluto_batch")
        return parcels
    finally:
        if owns_connection:
            database.close()


if __name__ == "__main__":
    ingested = ingest_pluto()
    print(f"Ingested {len(ingested)} NYC PLUTO parcel records.")
