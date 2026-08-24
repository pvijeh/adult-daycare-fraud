from collections.abc import Mapping

import duckdb
import pandas as pd
import requests
from pydantic import TypeAdapter

from analysis.db import init_db


CENSUS_ENDPOINT = "https://api.census.gov/data/2022/acs/acs5"
TOTAL_POPULATION_FIELD = "B01001_001E"
SENIOR_FIELDS = [
    "B01001_020E",
    "B01001_021E",
    "B01001_022E",
    "B01001_023E",
    "B01001_024E",
    "B01001_025E",
    "B01001_044E",
    "B01001_045E",
    "B01001_046E",
    "B01001_047E",
    "B01001_048E",
    "B01001_049E",
]
CENSUS_ROWS = TypeAdapter(list[list[str]])


def is_new_york_zcta(zcta: str) -> bool:
    if zcta in {"00501", "00544", "06390"}:
        return True
    return len(zcta) == 5 and zcta.isdigit() and 10000 <= int(zcta) <= 14999


def _nonnegative_int(value: str) -> int:
    try:
        return max(int(value), 0)
    except ValueError:
        return 0


def parse_census_rows(rows: list[list[str]]) -> pd.DataFrame:
    if len(rows) < 2:
        return pd.DataFrame(
            columns=["zcta", "total_population", "senior_pop_65_plus"]
        )
    headers = rows[0]
    parsed: list[dict[str, str | int]] = []
    for values in rows[1:]:
        row: Mapping[str, str] = dict(zip(headers, values, strict=False))
        zcta = row.get("zip code tabulation area", "")
        if not is_new_york_zcta(zcta):
            continue
        parsed.append(
            {
                "zcta": zcta,
                "total_population": _nonnegative_int(
                    row.get(TOTAL_POPULATION_FIELD, "0")
                ),
                "senior_pop_65_plus": sum(
                    _nonnegative_int(row.get(field, "0")) for field in SENIOR_FIELDS
                ),
            }
        )
    return pd.DataFrame(parsed)


def fetch_census_demographics(timeout: int = 60) -> pd.DataFrame:
    fields = ["NAME", TOTAL_POPULATION_FIELD, *SENIOR_FIELDS]
    response = requests.get(
        CENSUS_ENDPOINT,
        params={
            "get": ",".join(fields),
            "for": "zip code tabulation area:*",
        },
        timeout=timeout,
    )
    response.raise_for_status()
    return parse_census_rows(CENSUS_ROWS.validate_python(response.json()))


def ingest_census(
    connection: duckdb.DuckDBPyConnection | None = None,
    frame: pd.DataFrame | None = None,
) -> pd.DataFrame:
    owns_connection = connection is None
    database = connection or init_db()
    demographics = frame.copy() if frame is not None else fetch_census_demographics()
    try:
        if demographics.empty:
            return demographics
        database.register("census_batch", demographics)
        try:
            database.execute(
                """
                INSERT OR REPLACE INTO census_demographics
                SELECT zcta, total_population, senior_pop_65_plus
                FROM census_batch
                """
            )
        finally:
            database.unregister("census_batch")
        return demographics
    finally:
        if owns_connection:
            database.close()


if __name__ == "__main__":
    ingested = ingest_census()
    print(f"Ingested demographics for {len(ingested)} New York ZCTAs.")
