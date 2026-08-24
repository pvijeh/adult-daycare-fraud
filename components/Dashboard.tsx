"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import DensityChart from "@/components/DensityChart";
import NetworkChart from "@/components/NetworkChart";
import SpatialChart from "@/components/SpatialChart";
import { exportStoryFigures } from "@/lib/export-figures";
import type { DashboardData } from "@/lib/types";


const DensityMap = dynamic(() => import("@/components/DensityMap"), {
  ssr: false,
  loading: () => <div className="map-fallback">Preparing map…</div>,
});

type DashboardProps = {
  data: DashboardData;
};

type TabId = "density" | "network" | "spatial";

const tabs: { id: TabId; label: string; eyebrow: string }[] = [
  { id: "density", label: "Geographic density", eyebrow: "Where" },
  { id: "network", label: "Corporate webs", eyebrow: "Who" },
  { id: "spatial", label: "Spatial sanity check", eyebrow: "How much space" },
];

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Demo dataset";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Dashboard({ data }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("density");
  const [selectedClusterId, setSelectedClusterId] = useState(
    data.clusters[0]?.clusterId ?? "",
  );
  const [exportState, setExportState] = useState("Export story figures");
  const selectedCluster = useMemo(
    () =>
      data.clusters.find((cluster) => cluster.clusterId === selectedClusterId) ??
      data.clusters[0],
    [data.clusters, selectedClusterId],
  );

  const handleExport = async () => {
    setExportState("Exporting…");
    try {
      const count = await exportStoryFigures();
      setExportState(count ? `Exported ${count} figures` : "No visible figures");
    } catch {
      setExportState("Export failed");
    }
    window.setTimeout(() => setExportState("Export story figures"), 2400);
  };

  return (
    <main>
      <section className="hero">
        <div className="hero-noise" />
        <div className="hero-content">
          <div>
            <p className="kicker">An open-data audit of NYC adult day care</p>
            <h1>
              Ghosts in
              <br />
              <span>the Grid</span>
            </h1>
            <p className="hero-deck">
              Following provider registrations across ZIP codes, shared identities,
              and city property records to find concentrations worth reporting.
            </p>
          </div>
          <aside className="hero-actions">
            <div className="refresh-card">
              <span>Latest pipeline run</span>
              <strong>{formatTimestamp(data.meta.completedAt)}</strong>
              <p>
                {data.meta.providerCount} providers · {data.meta.parcelCount.toLocaleString()} parcels
              </p>
              <a
                href="https://github.com/pvijeh/adult-daycare-fraud/actions/workflows/refresh-data.yml"
                rel="noreferrer"
                target="_blank"
              >
                Refresh data in GitHub Actions
              </a>
            </div>
            <button className="export-button" onClick={handleExport} type="button">
              {exportState}
            </button>
          </aside>
        </div>
      </section>

      {data.meta.source !== "database" || data.meta.usedMock ? (
        <div className="demo-banner">
          <strong>Demonstration data.</strong>{" "}
          {data.meta.source === "database"
            ? "The latest pipeline run used deterministic NPPES fixtures; do not treat these records as findings."
            : "Connect Postgres and run the data workflow to replace illustrative records with live public data."}
        </div>
      ) : null}

      <section className="investigation-shell">
        <nav aria-label="Investigation views" className="tabs">
          {tabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "tab active" : "tab"}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <span>{tab.eyebrow}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "density" ? (
          <section aria-labelledby="density-title" className="view-panel">
            <div className="section-heading">
              <div>
                <p className="section-index">01 / Geographic saturation</p>
                <h2 id="density-title">Which neighborhoods carry the highest concentration?</h2>
              </div>
              <p>
                Provider counts are normalized by the population age 65 and older,
                making unlike ZIP codes comparable.
              </p>
            </div>
            <div className="density-grid">
              <div className="panel map-panel">
                <DensityMap rows={data.density} />
                <div className="map-legend">
                  <span>Fewer</span>
                  <i />
                  <span>More providers per 1,000 seniors</span>
                </div>
              </div>
              <div className="panel chart-panel">
                <DensityChart rows={data.density} />
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ZIP code</th>
                    <th>Providers</th>
                    <th>Residents 65+</th>
                    <th>Per 1,000 seniors</th>
                  </tr>
                </thead>
                <tbody>
                  {data.density.slice(0, 10).map((row) => (
                    <tr key={row.zcta}>
                      <td>{row.zcta}</td>
                      <td>{row.providerCount}</td>
                      <td>{row.seniorPopulation.toLocaleString()}</td>
                      <td>{row.providersPerThousandSeniors?.toFixed(2) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "network" ? (
          <section aria-labelledby="network-title" className="view-panel">
            <div className="section-heading">
              <div>
                <p className="section-index">02 / Shared identifiers</p>
                <h2 id="network-title">Which registrations move together?</h2>
              </div>
              <label className="cluster-picker">
                Cluster
                <select
                  onChange={(event) => setSelectedClusterId(event.target.value)}
                  value={selectedClusterId}
                >
                  {data.clusters.map((cluster) => (
                    <option key={cluster.clusterId} value={cluster.clusterId}>
                      {cluster.clusterId} · {cluster.providerCount} providers
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectedCluster ? (
              <>
                <div className="panel network-panel">
                  <NetworkChart cluster={selectedCluster} />
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Label</th>
                        <th>Identifier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCluster.nodes.map((node) => (
                        <tr key={node.id}>
                          <td><span className={`node-pill ${node.type}`}>{node.type}</span></td>
                          <td>{node.label}</td>
                          <td>{node.id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="empty-state">No multi-provider clusters were found.</div>
            )}
          </section>
        ) : null}

        {activeTab === "spatial" ? (
          <section aria-labelledby="spatial-title" className="view-panel">
            <div className="section-heading">
              <div>
                <p className="section-index">03 / Property reality check</p>
                <h2 id="spatial-title">Do multiple licenses fit the listed space?</h2>
              </div>
              <p>
                Only addresses with three or more distinct registrations and a PLUTO
                property match appear here.
              </p>
            </div>
            <div className="panel spatial-panel">
              <SpatialChart rows={data.outliers} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Licenses</th>
                    <th>Commercial area</th>
                    <th>Building class</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {data.outliers.map((row) => (
                    <tr key={`${row.cleanAddress}-${row.zipCode}`}>
                      <td>{row.cleanAddress}</td>
                      <td>{row.providerCount}</td>
                      <td>{row.commercialArea.toLocaleString()} sq ft</td>
                      <td>{row.buildingClass}</td>
                      <td>{row.ownerName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>

      <footer>
        <strong>Ghosts in the Grid</strong>
        <span>NPPES · US Census ACS · NYC PLUTO</span>
        <a href="https://github.com/pvijeh/adult-daycare-fraud">Source and methodology</a>
      </footer>
    </main>
  );
}
