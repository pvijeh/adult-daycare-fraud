import os
from collections.abc import Mapping
from typing import Protocol

import requests
from pydantic import BaseModel, Field

from pipeline.normalize import normalize_phone, standardize_address


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


def _mapping(value: object) -> dict[str, object]:
    return value if isinstance(value, dict) else {}


def _text(mapping: Mapping[str, object], key: str) -> str:
    value = mapping.get(key)
    return str(value).strip() if value is not None else ""


def _location_address(result: Mapping[str, object]) -> dict[str, object]:
    addresses = result.get("addresses")
    if not isinstance(addresses, list):
        return {}
    valid = [address for address in addresses if isinstance(address, dict)]
    return next(
        (
            address
            for address in valid
            if _text(address, "address_purpose").upper() == "LOCATION"
        ),
        valid[0] if valid else {},
    )


def parse_nppes_result(result: Mapping[str, object]) -> ProviderRecord:
    basic = _mapping(result.get("basic"))
    address = _location_address(result)
    raw_address = " ".join(
        value
        for value in (_text(address, "address_1"), _text(address, "address_2"))
        if value
    )
    official = " ".join(
        value
        for value in (
            _text(basic, "authorized_official_first_name"),
            _text(basic, "authorized_official_middle_name"),
            _text(basic, "authorized_official_last_name"),
        )
        if value
    )
    return ProviderRecord(
        npi=_text(result, "number"),
        org_name=_text(basic, "organization_name"),
        auth_name=official.upper(),
        auth_phone=normalize_phone(
            _text(basic, "authorized_official_telephone_number")
        ),
        raw_address=raw_address,
        clean_address=standardize_address(raw_address),
        zip_code=normalize_phone(_text(address, "postal_code"))[:5],
        city=_text(address, "city").upper(),
        state=_text(address, "state").upper()[:2],
        enumeration_date=_text(basic, "enumeration_date"),
    )


def generate_mock_records(count: int = 50) -> list[ProviderRecord]:
    locations = [
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
        zip_code, city = locations[index % len(locations)]
        raw_address = (
            f"{100 + (index % 17)} "
            f"{['BROADWAY', 'FULTON AVENUE', 'GRAND STREET'][index % 3]} "
            f"SUITE {100 + index}"
        )
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
    force_mock: bool | None = None,
) -> tuple[list[ProviderRecord], bool]:
    use_mock = (
        os.environ.get("USE_MOCK_NPPES", "").lower() == "true"
        if force_mock is None
        else force_mock
    )
    if use_mock:
        return generate_mock_records(), True

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
            records.extend(parse_nppes_result(result) for result in payload.results)
            if len(payload.results) < PAGE_SIZE:
                break
        return [record for record in records if record.npi][:max_records], False
    except (requests.RequestException, ValueError):
        return generate_mock_records(), True
