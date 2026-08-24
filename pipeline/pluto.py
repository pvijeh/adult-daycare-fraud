import os
from collections.abc import Iterable

import requests
from pydantic import BaseModel, TypeAdapter

from pipeline.normalize import standardize_address


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


ROWS = TypeAdapter(list[PlutoApiRow])


def _float_value(value: str | float | int) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _chunks(values: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def fetch_pluto_parcels(
    zip_codes: list[str],
    timeout: int = 60,
) -> list[dict[str, str | float]]:
    parcels: list[dict[str, str | float]] = []
    headers: dict[str, str] = {}
    if app_token := os.environ.get("SOCRATA_APP_TOKEN"):
        headers["X-App-Token"] = app_token

    for zip_batch in _chunks(sorted(set(zip_codes)), ZIP_BATCH_SIZE):
        quoted = ", ".join(f"'{zip_code}'" for zip_code in zip_batch)
        offset = 0
        while True:
            response = requests.get(
                PLUTO_ENDPOINT,
                params={
                    "$select": (
                        "address,zipcode,bldgarea,comarea,bldgclass,ownername"
                    ),
                    "$where": f"zipcode in ({quoted})",
                    "$limit": PAGE_SIZE,
                    "$offset": offset,
                    "$order": ":id",
                },
                headers=headers,
                timeout=timeout,
            )
            response.raise_for_status()
            page = ROWS.validate_python(response.json())
            parcels.extend(
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
    return parcels
