import csv
import os
from collections.abc import Iterable

import requests
from pydantic import TypeAdapter


CENSUS_ENDPOINT = "https://api.census.gov/data/2022/acs/acs5"
CENSUS_BULK_ENDPOINT = (
    "https://www2.census.gov/programs-surveys/acs/summary_file/2022/"
    "table-based-SF/data/5YRData/acsdt5y2022-b01001.dat"
)
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
BULK_TOTAL_POPULATION_FIELD = "B01001_E001"
BULK_SENIOR_FIELDS = [
    f"B01001_E{field.removeprefix('B01001_').removesuffix('E')}"
    for field in SENIOR_FIELDS
]
ROWS = TypeAdapter(list[list[str]])


def is_new_york_zcta(zcta: str) -> bool:
    if zcta in {"00501", "00544", "06390"}:
        return True
    return len(zcta) == 5 and zcta.isdigit() and 10000 <= int(zcta) <= 14999


def _nonnegative_int(value: str) -> int:
    try:
        return max(int(value), 0)
    except ValueError:
        return 0


def parse_census_rows(rows: list[list[str]]) -> list[dict[str, str | int]]:
    if len(rows) < 2:
        return []
    headers = rows[0]
    parsed: list[dict[str, str | int]] = []
    for values in rows[1:]:
        row = dict(zip(headers, values, strict=False))
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
    return parsed


def parse_census_bulk_lines(
    lines: Iterable[str],
) -> list[dict[str, str | int]]:
    parsed: list[dict[str, str | int]] = []
    for row in csv.DictReader(lines, delimiter="|"):
        geo_id = row.get("GEO_ID", "")
        if not geo_id.startswith("860Z200US"):
            continue
        zcta = geo_id.removeprefix("860Z200US")
        if not is_new_york_zcta(zcta):
            continue
        parsed.append(
            {
                "zcta": zcta,
                "total_population": _nonnegative_int(
                    row.get(BULK_TOTAL_POPULATION_FIELD, "0")
                ),
                "senior_pop_65_plus": sum(
                    _nonnegative_int(row.get(field, "0"))
                    for field in BULK_SENIOR_FIELDS
                ),
            }
        )
    return parsed


def fetch_census_bulk_demographics(
    timeout: int = 60,
) -> list[dict[str, str | int]]:
    with requests.get(
        CENSUS_BULK_ENDPOINT,
        stream=True,
        timeout=timeout,
    ) as response:
        response.raise_for_status()
        lines = (line.decode("utf-8") for line in response.iter_lines())
        return parse_census_bulk_lines(lines)


def fetch_census_demographics(timeout: int = 60) -> list[dict[str, str | int]]:
    params = {
        "get": ",".join(["NAME", TOTAL_POPULATION_FIELD, *SENIOR_FIELDS]),
        "for": "zip code tabulation area:*",
    }
    census_api_key = os.environ.get("CENSUS_API_KEY")
    if census_api_key:
        params["key"] = census_api_key

    try:
        response = requests.get(CENSUS_ENDPOINT, params=params, timeout=timeout)
        response.raise_for_status()
        demographics = parse_census_rows(
            ROWS.validate_python(response.json())
        )
        if demographics:
            return demographics
    except (requests.RequestException, ValueError):
        pass

    return fetch_census_bulk_demographics(timeout=timeout)
