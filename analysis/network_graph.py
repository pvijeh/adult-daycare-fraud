from collections.abc import Mapping

import duckdb
import networkx as nx
import pandas as pd

from analysis.db import init_db
from ingest.nppes import PLACEHOLDER_PHONES, normalize_phone


NODE_PREFIXES = {
    "provider": "NPI:",
    "official": "AUTH:",
    "phone": "PHONE:",
    "address": "ADDR:",
}


def _add_related_node(
    graph: nx.Graph,
    provider_node: str,
    node_type: str,
    value: str,
) -> None:
    node_id = f"{NODE_PREFIXES[node_type]}{value}"
    graph.add_node(node_id, type=node_type, label=value)
    graph.add_edge(provider_node, node_id, relationship=node_type)


def build_provider_graph(providers: pd.DataFrame) -> nx.Graph:
    graph = nx.Graph()
    if providers.empty:
        return graph

    for record in providers.fillna("").to_dict(orient="records"):
        npi = str(record.get("npi", "")).strip()
        if not npi:
            continue
        provider_node = f"{NODE_PREFIXES['provider']}{npi}"
        org_name = str(record.get("org_name", "")).strip() or npi
        graph.add_node(
            provider_node,
            type="provider",
            label=org_name,
            npi=npi,
        )

        official = str(record.get("auth_name", "")).strip().upper()
        phone = normalize_phone(str(record.get("auth_phone", "")))
        address = str(record.get("clean_address", "")).strip().upper()
        if official:
            _add_related_node(graph, provider_node, "official", official)
        if phone not in PLACEHOLDER_PHONES:
            _add_related_node(graph, provider_node, "phone", phone)
        if address:
            _add_related_node(graph, provider_node, "address", address)
    return graph


def _component_to_dict(
    graph: nx.Graph,
    component: set[str],
    cluster_index: int,
) -> dict[str, object]:
    subgraph = graph.subgraph(component)
    nodes = [
        {
            "id": node,
            "label": str(subgraph.nodes[node].get("label", node)),
            "type": str(subgraph.nodes[node].get("type", "")),
        }
        for node in sorted(subgraph.nodes)
    ]
    edges = [
        {
            "source": min(source, target),
            "target": max(source, target),
            "relationship": str(attributes.get("relationship", "")),
        }
        for source, target, attributes in subgraph.edges(data=True)
    ]
    edges.sort(key=lambda edge: (str(edge["source"]), str(edge["target"])))
    provider_count = sum(node["type"] == "provider" for node in nodes)
    return {
        "cluster_id": f"cluster-{cluster_index}",
        "provider_count": provider_count,
        "node_count": len(nodes),
        "nodes": nodes,
        "edges": edges,
    }


def find_provider_clusters(graph: nx.Graph) -> list[dict[str, object]]:
    qualifying_components = []
    for component in nx.connected_components(graph):
        provider_count = sum(
            graph.nodes[node].get("type") == "provider" for node in component
        )
        if provider_count >= 2:
            qualifying_components.append((provider_count, component))
    qualifying_components.sort(
        key=lambda item: (-item[0], sorted(item[1])),
    )
    return [
        _component_to_dict(graph, component, index)
        for index, (_, component) in enumerate(qualifying_components, start=1)
    ]


def get_provider_clusters(
    connection: duckdb.DuckDBPyConnection | None = None,
) -> list[dict[str, object]]:
    owns_connection = connection is None
    database = connection or init_db()
    try:
        providers = database.execute(
            """
            SELECT npi, org_name, auth_name, auth_phone, clean_address
            FROM providers
            """
        ).fetchdf()
        return find_provider_clusters(build_provider_graph(providers))
    finally:
        if owns_connection:
            database.close()


def cluster_nodes(cluster: Mapping[str, object]) -> list[dict[str, object]]:
    nodes = cluster.get("nodes")
    if not isinstance(nodes, list):
        return []
    return [node for node in nodes if isinstance(node, dict)]
