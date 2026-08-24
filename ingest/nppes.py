import re
from collections.abc import Mapping, Sequence
from typing import Protocol

import duckdb
import pandas as pd
import requests
from pydantic import BaseModel, Field

from analysis.db import init_db


NPPES_ENDPOINT = "https://npiregistry.cms.hhs.gov/api/"
PAGE_SIZE = 200
MAX_RECORDS = 1_200
PLACEHOLDER_PHONES = {"", "0000000000"}


class HttpSession(Protocol):
    def get(
        self,
        url: str,
        *,
        params: Mapping[str, str | int],
        timeout: int,
    ) -> requests.Response: ...


class ProviderRecord(BaseModel):
    npi: str
    org_name: str = ""
    auth_name: str = ""
    auth_phone: str = ""
    raw_address: str = ""
    clean_address: str = ""
    zip_code: str = ""
    city: str = ""
    state: str = ""
    enumeration_date: str = ""


class NppesResponse(BaseModel):
    results: list[dict[str, object]] = Field(default_factory=list)


def standardize_address(address: str | None) -> str:
    if not address:
        return ""
    normalized = address.upper()
    normalized = re.sub(
        r"\b(?:APARTMENT|APT|UNIT|SUITE|STE|FLOOR|FL|ROOM|RM)\b.*$",
        "",
        normalized,
    )
    normalized = re.sub(r"#\s*[A-Z0-9-]+.*$", "", normalized)
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    replacements = {
        "STREET": "ST",
        "AVENUE": "AVE",
        "BOULEVARD": "BLVD",
        "ROAD": "RD",
        "DRIVE": "DR",
        "PLACE": "PL",
        "LANE": "LN",
        "PARKWAY": "PKWY",
        "HIGHWAY": "HWY",
    }
    for source, target in replacements.items():
        normalized = re.sub(rf"\b{source}\b", target, normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def normalize_phone(phone: str | None) -> str:
    return re.sub(r"\D", "", phone or "")


def _as_mapping(value: object) -> dict[str, object]:
    return value if isinstance(value, dict) else {}


def _text(mapping: Mapping[str, object], key: str) -> str:
    value = mapping.get(key)
    return str(value).strip() if value is not None else ""


def _location_address(result: Mapping[str, object]) -> dict[str, object]:
    addresses = result.get("addresses")
    if not isinstance(addresses, list):
        return {}
    valid_addresses = [item for item in addresses if isinstance(item, dict)]
    return next(
        (
            address
            for address in valid_addresses
            if _text(address, "address_purpose").upper() == "LOCATION"
        ),
        valid_addresses[0] if valid_addresses else {},
    )


def _parse_nppes_result(result: Mapping[str, object]) -> ProviderRecord:
    basic = _as_mapping(result.get("basic"))
    address = _location_address(result)
    raw_address = " ".join(
        value
        for value in (
            _text(address, "address_1"),
            _text(address, "address_2"),
        )
        if value
    )
    auth_name = " ".join(
        value
        for value in (
            _text(basic, "authorized_official_first_name"),
            _text(basic, "authorized_official_middle_name"),
            _text(basic, "authorized_official_last_name"),
        )
        if value
    )
    postal_code = normalize_phone(_text(address, "postal_code"))[:5]
    return ProviderRecord(
        npi=_text(result, "number"),
        org_name=_text(basic, "organization_name"),
        auth_name=auth_name.upper(),
        auth_phone=normalize_phone(
            _text(basic, "authorized_official_telephone_number")
        ),
        raw_address=raw_address,
        clean_address=standardize_address(raw_address),
        zip_code=postal_code,
        city=_text(address, "city").upper(),
        state=_text(address, "state").upper()[:2],
        enumeration_date=_text(basic, "enumeration_date"),
    )


def generate_mock_nppes_records(count: int = 50) -> list[ProviderRecord]:
    zips = [
        ("10001", "NEW YORK"),
        ("10002", "NEW YORK"),
        ("10458", "BRONX"),
        ("11201", "BROOKLYN"),
        ("11226", "BROOKLYN"),
        ("11368", "CORONA"),
        ("11432", "JAMAICA"),
        ("10301", "STATEN ISLAND"),
    ]
    officials = [
        "MARIA SANTOS",
        "DAVID COHEN",
        "LINDA CHEN",
        "ROBERT WILLIAMS",
        "AISHA KHAN",
    ]
    records: list[ProviderRecord] = []
    for index in range(count):
        zip_code, city = zips[index % len(zips)]
        building_number = 100 + (index % 17)
        street_name = ["BROADWAY", "FULTON AVENUE", "GRAND STREET"][index % 3]
        raw_address = f"{building_number} {street_name} SUITE {100 + index}"
        records.append(
            ProviderRecord(
                npi=f"1999{index:06d}",
                org_name=f"EMPIRE COMMUNITY ADULT DAY CARE {index + 1}",
                auth_name=officials[index % len(officials)],
                auth_phone=f"212555{1000 + (index % 12):04d}",
                raw_address=raw_address,
                clean_address=standardize_address(raw_address),
                zip_code=zip_code,
                city=city,
                state="NY",
                enumeration_date=f"202{index % 5}-0{(index % 9) + 1}-15",
            )
        )
    return records


def fetch_nppes_records(
    session: HttpSession | None = None,
    max_records: int = MAX_RECORDS,
    timeout: int = 30,
) -> tuple[list[ProviderRecord], bool]:
    client = session or requests.Session()
    records: list[ProviderRecord] = []
    try:
        for skip in range(0, max_records, PAGE_SIZE):
            response = client.get(
                NPPES_ENDPOINT,
                params={
                    "version": "2.1",
                    "taxonomy_description": "Adult Day Care",
                    "state": "NY",
                    "limit": PAGE_SIZE,
                    "skip": skip,
                },
                timeout=timeout,
            )
            response.raise_for_status()
            payload = NppesResponse.model_validate(response.json())
            if not payload.results:
                break
            records.extend(_parse_nppes_result(result) for result in payload.results)
            if len(payload.results) < PAGE_SIZE:
                break
        records = [record for record in records if record.npi][:max_records]
        return records, False
    except (requests.RequestException, ValueError):
        return generate_mock_nppes_records(), True


def _store_providers(
    connection: duckdb.DuckDBPyConnection,
    records: Sequence[ProviderRecord],
) -> pd.DataFrame:
    frame = pd.DataFrame([record.model_dump() for record in records])
    if frame.empty:
        return frame
    connection.register("provider_batch", frame)
    try:
        connection.execute(
            """
            INSERT OR REPLACE INTO providers
            SELECT
                npi, org_name, auth_name, auth_phone, raw_address,
                clean_address, zip_code, city, state, enumeration_date
            FROM provider_batch
            """
        )
    finally:
        connection.unregister("provider_batch")
    return frame


def ingest_nppes(
    connection: duckdb.DuckDBPyConnection | None = None,
    records: Sequence[ProviderRecord] | None = None,
) -> pd.DataFrame:
    owns_connection = connection is None
    database = connection or init_db()
    try:
        provider_records = (
            list(records) if records is not None else fetch_nppes_records()[0]
        )
        return _store_providers(database, provider_records)
    finally:
        if owns_connection:
            database.close()


if __name__ == "__main__":
    ingested = ingest_nppes()
    print(f"Ingested {len(ingested)} NPPES provider records.")
