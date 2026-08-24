import pandas as pd
import requests

from analysis.db import init_db
from analysis.metrics import get_spatial_outliers, get_top_density_zips
from analysis.network_graph import build_provider_graph, find_provider_clusters
from ingest.nppes import fetch_nppes_records, ingest_nppes, standardize_address


def test_init_db_creates_schema_and_density_view(tmp_path):
    connection = init_db(tmp_path / "test.duckdb")
    tables = {
        row[0]
        for row in connection.execute(
            "SELECT table_name FROM information_schema.tables"
        ).fetchall()
    }

    assert {"providers", "census_demographics", "pluto_parcels"}.issubset(tables)
    connection.execute(
        "INSERT INTO census_demographics VALUES ('10001', 20000, 4000)"
    )
    connection.execute(
        """
        INSERT INTO providers VALUES
        ('1000000001', 'ONE', '', '', '', '1 MAIN ST', '10001', 'NEW YORK', 'NY', ''),
        ('1000000002', 'TWO', '', '', '', '2 MAIN ST', '10001', 'NEW YORK', 'NY', '')
        """
    )

    density = get_top_density_zips(limit=1, connection=connection).iloc[0]
    assert density["total_adc_providers"] == 2
    assert density["adc_per_1000_seniors"] == 0.5


def test_address_standardization_removes_units_and_normalizes_suffixes():
    assert standardize_address("123 West 42nd Street, Suite 900") == "123 WEST 42ND ST"
    assert standardize_address("20-10 Example Avenue #4B") == "20 10 EXAMPLE AVE"


class FailingSession:
    def get(self, *args, **kwargs):
        raise requests.RequestException("offline")


def test_nppes_api_failure_uses_50_record_mock_fallback(tmp_path):
    records, used_mock = fetch_nppes_records(session=FailingSession())
    connection = init_db(tmp_path / "test.duckdb")
    frame = ingest_nppes(connection=connection, records=records)

    assert used_mock is True
    assert len(records) == 50
    assert len(frame) == 50
    assert connection.execute("SELECT COUNT(*) FROM providers").fetchone()[0] == 50


def test_graph_clusters_shared_officials_and_ignores_placeholder_phones():
    providers = pd.DataFrame(
        [
            {
                "npi": "1",
                "org_name": "ALPHA",
                "auth_name": "JANE DOE",
                "auth_phone": "0000000000",
                "clean_address": "1 MAIN ST",
            },
            {
                "npi": "2",
                "org_name": "BETA",
                "auth_name": "JANE DOE",
                "auth_phone": "",
                "clean_address": "2 MAIN ST",
            },
        ]
    )

    graph = build_provider_graph(providers)
    clusters = find_provider_clusters(graph)

    assert "PHONE:0000000000" not in graph
    assert len(clusters) == 1
    assert clusters[0]["provider_count"] == 2
    assert {node["id"] for node in clusters[0]["nodes"] if node["type"] == "provider"} == {
        "NPI:1",
        "NPI:2",
    }


def test_spatial_outliers_require_three_distinct_provider_licenses(tmp_path):
    connection = init_db(tmp_path / "test.duckdb")
    connection.execute(
        """
        INSERT INTO providers VALUES
        ('1', 'A', '', '', '', '10 SHARED AVE', '11201', 'BROOKLYN', 'NY', ''),
        ('2', 'B', '', '', '', '10 SHARED AVE', '11201', 'BROOKLYN', 'NY', ''),
        ('3', 'C', '', '', '', '10 SHARED AVE', '11201', 'BROOKLYN', 'NY', ''),
        ('4', 'D', '', '', '', '20 OTHER AVE', '11201', 'BROOKLYN', 'NY', '')
        """
    )
    connection.execute(
        """
        INSERT INTO pluto_parcels VALUES
        ('10 SHARED AVE', '11201', 12000, 9000, 'O5', 'SHARED OWNER'),
        ('20 OTHER AVE', '11201', 8000, 4000, 'O2', 'OTHER OWNER')
        """
    )

    outliers = get_spatial_outliers(connection=connection)

    assert list(outliers["clean_address"]) == ["10 SHARED AVE"]
    assert outliers.iloc[0]["provider_count"] == 3
