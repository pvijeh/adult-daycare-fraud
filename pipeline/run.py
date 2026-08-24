import json

from pipeline.census import fetch_census_demographics
from pipeline.db import (
    connect,
    initialize_schema,
    record_run,
    replace_census,
    replace_clusters,
    replace_pluto,
    replace_providers,
)
from pipeline.graph import build_provider_graph, find_provider_clusters
from pipeline.nppes import fetch_nppes_records
from pipeline.pluto import fetch_pluto_parcels


def run_pipeline() -> dict[str, int | bool]:
    providers, used_mock = fetch_nppes_records()
    demographics = fetch_census_demographics()
    if not providers:
        raise RuntimeError("NPPES returned no provider records; refresh aborted.")
    if not demographics:
        raise RuntimeError("Census returned no New York demographics; refresh aborted.")
    zip_codes = sorted(
        {
            provider.zip_code
            for provider in providers
            if provider.zip_code.startswith(("10", "11"))
        }
    )
    parcels = fetch_pluto_parcels(zip_codes)
    clusters = find_provider_clusters(build_provider_graph(providers))

    with connect() as connection:
        initialize_schema(connection)
        replace_providers(connection, providers)
        replace_census(connection, demographics)
        replace_pluto(connection, parcels)
        replace_clusters(connection, clusters)
        record_run(
            connection,
            used_mock=used_mock,
            provider_count=len(providers),
            census_count=len(demographics),
            parcel_count=len(parcels),
            cluster_count=len(clusters),
        )

    return {
        "used_mock": used_mock,
        "providers": len(providers),
        "census_zctas": len(demographics),
        "pluto_parcels": len(parcels),
        "network_clusters": len(clusters),
    }


if __name__ == "__main__":
    print(json.dumps(run_pipeline(), indent=2))
