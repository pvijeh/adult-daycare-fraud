from pathlib import Path

import duckdb
import networkx as nx
import pandas as pd
import plotly.graph_objects as go
import pydeck as pdk
import requests
import streamlit as st

from analysis.db import DEFAULT_DB_PATH, init_db
from analysis.metrics import (
    get_all_density_zips,
    get_spatial_outliers,
    get_top_density_zips,
)
from analysis.network_graph import get_provider_clusters
from ingest.census import ingest_census
from ingest.nppes import fetch_nppes_records, ingest_nppes
from ingest.pluto import ingest_pluto


PROJECT_ROOT = Path(__file__).resolve().parent
EXPORT_DIR = PROJECT_ROOT / "exports"
NY_ZIP_GEOJSON_URL = (
    "https://raw.githubusercontent.com/OpenDataDE/"
    "State-zip-code-GeoJSON/master/ny_new_york_zip_codes_geo.min.json"
)
NODE_COLORS = {
    "provider": "#2563EB",
    "official": "#16A34A",
    "phone": "#DC2626",
    "address": "#F59E0B",
}
NODE_NAMES = {
    "provider": "Facility",
    "official": "Officer",
    "phone": "Phone",
    "address": "Address",
}


@st.cache_data(ttl=86_400)
def load_ny_zip_geojson() -> dict[str, object]:
    response = requests.get(NY_ZIP_GEOJSON_URL, timeout=30)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("New York ZIP GeoJSON did not return an object.")
    return payload


def density_bar_figure(density: pd.DataFrame) -> go.Figure:
    figure = go.Figure()
    if not density.empty:
        ordered = density.sort_values("adc_per_1000_seniors", ascending=True)
        figure.add_trace(
            go.Bar(
                x=ordered["adc_per_1000_seniors"],
                y=ordered["zcta"],
                orientation="h",
                marker={
                    "color": ordered["adc_per_1000_seniors"],
                    "colorscale": "Blues",
                },
                customdata=ordered[
                    ["total_adc_providers", "senior_pop_65_plus"]
                ],
                hovertemplate=(
                    "ZIP %{y}<br>ADC per 1,000 seniors: %{x:.2f}"
                    "<br>Providers: %{customdata[0]}"
                    "<br>Residents 65+: %{customdata[1]:,.0f}<extra></extra>"
                ),
            )
        )
    figure.update_layout(
        title="Highest provider density relative to residents age 65+",
        xaxis_title="Adult day care providers per 1,000 seniors",
        yaxis_title="ZIP Code",
        margin={"l": 20, "r": 20, "t": 60, "b": 20},
        height=470,
    )
    return figure


def spatial_scatter_figure(outliers: pd.DataFrame) -> go.Figure:
    figure = go.Figure()
    if not outliers.empty:
        figure.add_trace(
            go.Scatter(
                x=outliers["com_area"],
                y=outliers["provider_count"],
                mode="markers",
                marker={
                    "size": 14,
                    "color": outliers["provider_count"],
                    "colorscale": "Oranges",
                    "showscale": True,
                    "colorbar": {"title": "Licenses"},
                },
                text=outliers["clean_address"],
                customdata=outliers[["zip_code", "owner_name"]],
                hovertemplate=(
                    "%{text}<br>ZIP: %{customdata[0]}"
                    "<br>Commercial area: %{x:,.0f} sq ft"
                    "<br>Distinct licenses: %{y}"
                    "<br>Owner: %{customdata[1]}<extra></extra>"
                ),
            )
        )
    figure.update_layout(
        title="Commercial floor area versus licenses at one address",
        xaxis_title="Commercial area (square feet)",
        yaxis_title="Distinct provider licenses",
        margin={"l": 20, "r": 20, "t": 60, "b": 20},
        height=480,
    )
    return figure


def network_figure(cluster: dict[str, object]) -> go.Figure:
    graph = nx.Graph()
    raw_nodes = cluster.get("nodes", [])
    raw_edges = cluster.get("edges", [])
    nodes = [node for node in raw_nodes if isinstance(node, dict)]
    edges = [edge for edge in raw_edges if isinstance(edge, dict)]
    for node in nodes:
        node_id = str(node.get("id", ""))
        if node_id:
            graph.add_node(
                node_id,
                label=str(node.get("label", node_id)),
                type=str(node.get("type", "")),
            )
    for edge in edges:
        source = str(edge.get("source", ""))
        target = str(edge.get("target", ""))
        if source in graph and target in graph:
            graph.add_edge(source, target)

    positions = nx.spring_layout(graph, seed=42, k=1.2)
    edge_x: list[float | None] = []
    edge_y: list[float | None] = []
    for source, target in graph.edges:
        source_x, source_y = positions[source]
        target_x, target_y = positions[target]
        edge_x.extend([float(source_x), float(target_x), None])
        edge_y.extend([float(source_y), float(target_y), None])

    figure = go.Figure(
        go.Scatter(
            x=edge_x,
            y=edge_y,
            mode="lines",
            line={"width": 1, "color": "#94A3B8"},
            hoverinfo="skip",
            showlegend=False,
        )
    )
    for node_type, color in NODE_COLORS.items():
        typed_nodes = [
            node
            for node in graph.nodes
            if graph.nodes[node].get("type") == node_type
        ]
        figure.add_trace(
            go.Scatter(
                x=[float(positions[node][0]) for node in typed_nodes],
                y=[float(positions[node][1]) for node in typed_nodes],
                mode="markers",
                name=NODE_NAMES[node_type],
                text=[
                    str(graph.nodes[node].get("label", node)) for node in typed_nodes
                ],
                hovertemplate="%{text}<extra></extra>",
                marker={
                    "size": 18 if node_type == "provider" else 13,
                    "color": color,
                    "line": {"width": 1, "color": "white"},
                },
            )
        )
    figure.update_layout(
        title=(
            f"{cluster.get('provider_count', 0)} linked facilities across "
            f"{cluster.get('node_count', 0)} entities"
        ),
        height=610,
        margin={"l": 10, "r": 10, "t": 60, "b": 10},
        xaxis={"visible": False},
        yaxis={"visible": False},
        legend={"orientation": "h", "y": -0.04},
        hovermode="closest",
    )
    return figure


def density_map(density: pd.DataFrame) -> pdk.Deck | None:
    if density.empty:
        return None
    geojson = load_ny_zip_geojson()
    features = geojson.get("features")
    if not isinstance(features, list):
        raise ValueError("New York ZIP GeoJSON has no feature collection.")
    rates = {
        str(row["zcta"]): float(row["adc_per_1000_seniors"] or 0)
        for row in density.to_dict(orient="records")
    }
    max_rate = max(rates.values(), default=0)
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            continue
        zcta = next(
            (
                str(properties[key])
                for key in ("ZCTA5CE10", "ZCTA5CE20", "postalCode", "ZIP")
                if key in properties
            ),
            "",
        )
        rate = rates.get(zcta, 0)
        intensity = int(40 + 200 * (rate / max_rate)) if max_rate else 40
        properties["zcta"] = zcta
        properties["adc_per_1000_seniors"] = rate
        properties["fill_color"] = [24, 92, intensity, 175]

    layer = pdk.Layer(
        "GeoJsonLayer",
        geojson,
        pickable=True,
        stroked=True,
        filled=True,
        get_fill_color="properties.fill_color",
        get_line_color=[255, 255, 255, 150],
        line_width_min_pixels=1,
    )
    return pdk.Deck(
        layers=[layer],
        initial_view_state=pdk.ViewState(
            latitude=40.7128,
            longitude=-74.0060,
            zoom=9.2,
            pitch=0,
        ),
        map_provider="carto",
        map_style="light",
        tooltip={
            "html": (
                "<b>ZIP {zcta}</b><br/>"
                "ADC providers per 1,000 seniors: {adc_per_1000_seniors}"
            )
        },
    )


def run_ingestion() -> tuple[bool, list[str]]:
    messages: list[str] = []
    connection = init_db()
    try:
        records, used_mock = fetch_nppes_records()
        ingest_nppes(connection=connection, records=records)
        messages.append(f"NPPES: {len(records):,} providers")
        if used_mock:
            messages.append("NPPES API unavailable: mock fallback used")

        census = ingest_census(connection=connection)
        messages.append(f"Census: {len(census):,} New York ZCTAs")

        parcels = ingest_pluto(connection=connection)
        messages.append(f"PLUTO: {len(parcels):,} parcels")
        return used_mock, messages
    finally:
        connection.close()


def export_story_figures(
    density_figure: go.Figure,
    outlier_figure: go.Figure,
) -> list[Path]:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    exported: list[Path] = []
    for name, figure in (
        ("zip_density", density_figure),
        ("spatial_outliers", outlier_figure),
    ):
        for extension in ("png", "svg"):
            path = EXPORT_DIR / f"{name}.{extension}"
            figure.write_image(path, width=1400, height=800, scale=2)
            exported.append(path)
    return exported


st.set_page_config(page_title="Ghosts in the Grid", page_icon="🔎", layout="wide")
init_db().close()

st.title("Ghosts in the Grid: An Open-Data Audit of NYC Adult Day Care Facilities")
st.caption(
    "Cross-referencing provider registrations, senior demographics, and property "
    "records to surface leads for reporting—not determinations of wrongdoing."
)

with st.sidebar:
    st.header("Pipeline Controls")
    ingest_clicked = st.button("Ingest Data", use_container_width=True)
    export_clicked = st.button(
        "Export Story Figures (PNG/SVG)",
        use_container_width=True,
    )
    st.caption(f"DuckDB: {DEFAULT_DB_PATH.name}")

if ingest_clicked:
    try:
        with st.spinner("Ingesting federal, Census, and municipal records..."):
            used_mock_data, ingestion_messages = run_ingestion()
        st.success(" · ".join(ingestion_messages))
        if used_mock_data:
            st.warning(
                "The provider registry request failed, so this run uses 50 mock "
                "records. Do not publish findings from mock data."
            )
        st.cache_data.clear()
    except (requests.RequestException, duckdb.Error, ValueError) as error:
        st.error(f"Ingestion stopped: {error}")

density = get_all_density_zips()
top_density = get_top_density_zips()
outliers = get_spatial_outliers()
clusters = get_provider_clusters()
density_figure = density_bar_figure(top_density)
outlier_figure = spatial_scatter_figure(outliers)

if export_clicked:
    try:
        files = export_story_figures(density_figure, outlier_figure)
        st.sidebar.success(f"Saved {len(files)} files to exports/")
    except (OSError, ValueError, RuntimeError) as error:
        st.sidebar.error(f"Figure export failed: {error}")

density_tab, network_tab, spatial_tab = st.tabs(
    ["Geographic Density", "Corporate Webs", "Spatial Sanity Check"]
)

with density_tab:
    st.subheader("Provider saturation relative to the senior population")
    if density.empty:
        st.info("Ingest NPPES and Census records to populate density analysis.")
    else:
        try:
            deck = density_map(density)
            if deck is not None:
                st.pydeck_chart(deck, use_container_width=True)
        except (requests.RequestException, ValueError) as error:
            st.warning(f"ZIP boundary map unavailable: {error}")
        st.plotly_chart(density_figure, use_container_width=True)
        st.dataframe(top_density, use_container_width=True, hide_index=True)

with network_tab:
    st.subheader("Shared officers, phones, and registered addresses")
    if not clusters:
        st.info("No multi-provider corporate clusters are available.")
    else:
        cluster_labels = {
            f"Cluster {index}: {cluster['provider_count']} facilities": index - 1
            for index, cluster in enumerate(clusters, start=1)
        }
        selected_label = st.selectbox(
            "Select a linked provider cluster",
            list(cluster_labels),
        )
        selected_cluster = clusters[cluster_labels[selected_label]]
        st.plotly_chart(
            network_figure(selected_cluster),
            use_container_width=True,
        )
        st.dataframe(
            pd.DataFrame(selected_cluster["nodes"]),
            use_container_width=True,
            hide_index=True,
        )

with spatial_tab:
    st.subheader("Multiple licenses registered in one physical building")
    if outliers.empty:
        st.info(
            "No addresses with three or more licenses matched to PLUTO parcels."
        )
    else:
        st.plotly_chart(outlier_figure, use_container_width=True)
        st.dataframe(outliers, use_container_width=True, hide_index=True)
