import pytest
import requests

from pipeline import census
from pipeline.census import (
    BULK_SENIOR_FIELDS,
    BULK_TOTAL_POPULATION_FIELD,
    parse_census_bulk_lines,
    parse_census_rows,
)
from pipeline.graph import build_provider_graph, find_provider_clusters
from pipeline.normalize import standardize_address
from pipeline.nppes import (
    ProviderRecord,
    fetch_nppes_records,
    generate_mock_records,
)
from pipeline.pluto import fetch_pluto_parcels


def test_address_standardization_removes_units_and_normalizes_suffixes():
    assert standardize_address("123 West 42nd Street, Suite 900") == "123 WEST 42ND ST"
    assert standardize_address("20-10 Example Avenue #4B") == "20 10 EXAMPLE AVE"


class FailingSession:
    def get(self, *args, **kwargs):
        raise requests.RequestException("offline")


def test_nppes_failure_uses_50_record_mock_fallback():
    records, used_mock = fetch_nppes_records(session=FailingSession())

    assert used_mock is True
    assert len(records) == 50
    assert len({record.npi for record in records}) == 50


def test_forced_mock_mode_is_deterministic():
    assert fetch_nppes_records(force_mock=True)[0] == generate_mock_records()


def test_census_parser_sums_senior_bands_and_filters_to_new_york():
    headers = [
        "NAME",
        "B01001_001E",
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
        "zip code tabulation area",
    ]
    ny_row = ["NY ZIP", "1000", *["10"] * 12, "11201"]
    california_row = ["CA ZIP", "2000", *["20"] * 12, "90210"]

    parsed = parse_census_rows([headers, ny_row, california_row])

    assert parsed == [
        {
            "zcta": "11201",
            "total_population": 1000,
            "senior_pop_65_plus": 120,
        }
    ]


def test_census_bulk_parser_sums_senior_bands_and_filters_to_new_york():
    headers = [
        "GEO_ID",
        BULK_TOTAL_POPULATION_FIELD,
        *BULK_SENIOR_FIELDS,
    ]
    ny_row = ["860Z200US11201", "1000", *["10"] * 12]
    california_row = ["860Z200US90210", "2000", *["20"] * 12]

    parsed = parse_census_bulk_lines(
        [
            "|".join(headers),
            "|".join(ny_row),
            "|".join(california_row),
        ]
    )

    assert parsed == [
        {
            "zcta": "11201",
            "total_population": 1000,
            "senior_pop_65_plus": 120,
        }
    ]


class MissingKeyResponse:
    def raise_for_status(self):
        return None

    def json(self):
        raise ValueError("Census returned the missing-key HTML page")


def test_census_api_failure_uses_official_bulk_fallback(monkeypatch):
    expected = [
        {
            "zcta": "11201",
            "total_population": 1000,
            "senior_pop_65_plus": 120,
        }
    ]
    monkeypatch.setattr(
        census.requests,
        "get",
        lambda *args, **kwargs: MissingKeyResponse(),
    )
    monkeypatch.setattr(
        census,
        "fetch_census_bulk_demographics",
        lambda timeout: expected,
    )

    assert census.fetch_census_demographics() == expected


def test_graph_clusters_shared_entities_and_ignores_placeholder_phones():
    providers = [
        ProviderRecord(
            npi="1",
            org_name="ALPHA",
            auth_name="JANE DOE",
            auth_phone="0000000000",
            clean_address="1 MAIN ST",
        ),
        ProviderRecord(
            npi="2",
            org_name="BETA",
            auth_name="JANE DOE",
            auth_phone="",
            clean_address="2 MAIN ST",
        ),
        ProviderRecord(
            npi="3",
            org_name="SINGLETON",
            auth_name="UNIQUE PERSON",
            auth_phone="2125559999",
            clean_address="3 MAIN ST",
        ),
    ]

    graph = build_provider_graph(providers)
    clusters = find_provider_clusters(graph)

    assert "PHONE:0000000000" not in graph
    assert len(clusters) == 1
    assert clusters[0]["provider_count"] == 2


def test_pluto_rejects_zip_codes_that_are_not_five_digits():
    with pytest.raises(
        ValueError,
        match="PLUTO ZIP codes must contain exactly five digits.",
    ):
        fetch_pluto_parcels(["11201", "11201') OR 1=1 --"])
