"use client";

import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type {
  FillLayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Popup,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";

import type { DensityRow } from "@/lib/types";


type DensityMapProps = {
  rows: DensityRow[];
};

type HoveredZip = {
  longitude: number;
  latitude: number;
  zcta: string;
  rate: number;
  providers: number;
};

const fillLayer: FillLayerSpecification = {
  id: "zip-density-fill",
  type: "fill",
  source: "zip-density",
  paint: {
    "fill-color": [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "density"], 0],
      0,
      "#dbeafe",
      0.5,
      "#7dd3fc",
      1,
      "#2563eb",
      2,
      "#7137d7",
    ],
    "fill-opacity": 0.78,
    "fill-outline-color": "#ffffff",
  },
};

const baseMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    cartoLight: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 512,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "carto-light",
      type: "raster",
      source: "cartoLight",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

export default function DensityMap({ rows }: DensityMapProps) {
  const [geometry, setGeometry] =
    useState<FeatureCollection<Geometry, GeoJsonProperties> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredZip | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/zip-geometry", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`ZIP geometry request failed (${response.status}).`);
        }
        return response.json();
      })
      .then((payload: FeatureCollection<Geometry, GeoJsonProperties>) => {
        setGeometry(payload);
      })
      .catch((requestError: Error) => {
        if (requestError.name !== "AbortError") {
          setError(requestError.message);
        }
      });
    return () => controller.abort();
  }, []);

  const enrichedGeometry = useMemo(() => {
    if (!geometry) {
      return null;
    }
    const densityByZip = new globalThis.Map(rows.map((row) => [row.zcta, row]));
    return {
      ...geometry,
      features: geometry.features.map((feature) => {
        const zcta = String(feature.properties?.modzcta ?? "");
        const density = densityByZip.get(zcta);
        return {
          ...feature,
          properties: {
            ...feature.properties,
            zcta,
            density: density?.providersPerThousandSeniors ?? 0,
            providers: density?.providerCount ?? 0,
          },
        };
      }),
    };
  }, [geometry, rows]);

  const mapRef = useRef<MapRef>(null);
  const installDensityLayer = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !enrichedGeometry) {
      return;
    }
    if (!map.getSource("zip-density")) {
      map.addSource("zip-density", {
        type: "geojson",
        data: enrichedGeometry,
      });
    }
    if (!map.getLayer(fillLayer.id)) {
      map.addLayer(fillLayer);
    }
  }, [enrichedGeometry]);

  const handleMouseMove = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      setHovered(null);
      return;
    }
    setHovered({
      longitude: event.lngLat.lng,
      latitude: event.lngLat.lat,
      zcta: String(feature.properties?.zcta ?? ""),
      rate: Number(feature.properties?.density ?? 0),
      providers: Number(feature.properties?.providers ?? 0),
    });
  };

  if (error) {
    return <div className="map-fallback">Map geometry unavailable: {error}</div>;
  }
  if (!enrichedGeometry) {
    return <div className="map-fallback">Loading NYC ZIP boundaries…</div>;
  }

  return (
    <div className="map-shell">
      <Map
        initialViewState={{
          longitude: -73.94,
          latitude: 40.71,
          zoom: 9.25,
        }}
        interactiveLayerIds={["zip-density-fill"]}
        mapStyle={baseMapStyle}
        onLoad={installDensityLayer}
        onMouseLeave={() => setHovered(null)}
        onMouseMove={handleMouseMove}
        ref={mapRef}
      >
        {hovered ? (
          <Popup
            anchor="bottom"
            closeButton={false}
            latitude={hovered.latitude}
            longitude={hovered.longitude}
          >
            <strong>ZIP {hovered.zcta}</strong>
            <span>{hovered.providers} providers</span>
            <span>{hovered.rate.toFixed(2)} per 1,000 seniors</span>
          </Popup>
        ) : null}
      </Map>
    </div>
  );
}
