import networkx as nx

from pipeline.nppes import PLACEHOLDER_PHONES, ProviderRecord


PREFIXES = {
    "provider": "NPI:",
    "official": "AUTH:",
    "phone": "PHONE:",
    "address": "ADDR:",
}


def _connect(
    graph: nx.Graph,
    provider_node: str,
    node_type: str,
    value: str,
) -> None:
    node_id = f"{PREFIXES[node_type]}{value}"
    graph.add_node(node_id, type=node_type, label=value)
    graph.add_edge(provider_node, node_id, relationship=node_type)


def build_provider_graph(providers: list[ProviderRecord]) -> nx.Graph:
    graph = nx.Graph()
    for provider in providers:
        provider_node = f"{PREFIXES['provider']}{provider.npi}"
        graph.add_node(
            provider_node,
            type="provider",
            label=provider.org_name or provider.npi,
            npi=provider.npi,
        )
        if provider.auth_name:
            _connect(graph, provider_node, "official", provider.auth_name)
        if provider.auth_phone not in PLACEHOLDER_PHONES:
            _connect(graph, provider_node, "phone", provider.auth_phone)
        if provider.clean_address:
            _connect(graph, provider_node, "address", provider.clean_address)
    return graph


def find_provider_clusters(graph: nx.Graph) -> list[dict[str, object]]:
    components: list[tuple[int, set[str]]] = []
    for component in nx.connected_components(graph):
        provider_count = sum(
            graph.nodes[node].get("type") == "provider" for node in component
        )
        if provider_count >= 2:
            components.append((provider_count, component))
    components.sort(key=lambda item: (-item[0], sorted(item[1])))

    clusters: list[dict[str, object]] = []
    for index, (provider_count, component) in enumerate(components, start=1):
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
        clusters.append(
            {
                "cluster_id": f"cluster-{index}",
                "provider_count": provider_count,
                "node_count": len(nodes),
                "nodes": nodes,
                "edges": sorted(
                    edges,
                    key=lambda edge: (
                        str(edge["source"]),
                        str(edge["target"]),
                    ),
                ),
            }
        )
    return clusters
