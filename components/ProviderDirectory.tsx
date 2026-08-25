"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type {
  EvidenceLabel,
  ProviderDirectoryData,
} from "@/lib/provider-types";


type ProviderDirectoryProps = {
  data: ProviderDirectoryData;
};

const labelOptions: EvidenceLabel[] = [
  "enforcement record",
  "data discrepancy",
  "lead",
  "requires records",
  "compliance concern",
  "allegation",
];

const severityRank = { high: 3, medium: 2, low: 1 };

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\w]+/g, " ").trim();
}

export default function ProviderDirectory({ data }: ProviderDirectoryProps) {
  const [query, setQuery] = useState("");
  const [borough, setBorough] = useState("all");
  const [label, setLabel] = useState<"all" | EvidenceLabel>("all");
  const boroughs = useMemo(
    () =>
      [...new Set(data.providers.map((provider) => provider.borough).filter(Boolean))].sort(),
    [data.providers],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query);
    return data.providers
      .filter((provider) => {
        const searchable = normalize(
          [
            provider.programName,
            provider.sponsorName,
            provider.address,
            provider.zipCode,
            provider.phone,
            provider.dftaId,
            provider.npiMatch.npi ?? "",
          ].join(" "),
        );
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (borough === "all" || provider.borough === borough) &&
          (label === "all" ||
            provider.flags.some((flag) => flag.label === label))
        );
      })
      .sort((left, right) => {
        const leftSeverity = Math.max(
          0,
          ...left.flags.map((flag) => severityRank[flag.severity]),
        );
        const rightSeverity = Math.max(
          0,
          ...right.flags.map((flag) => severityRank[flag.severity]),
        );
        return (
          rightSeverity - leftSeverity ||
          right.flags.length - left.flags.length ||
          left.programName.localeCompare(right.programName)
        );
      });
  }, [borough, data.providers, label, query]);
  const reconciledCount = data.providers.filter((provider) =>
    ["high", "medium"].includes(provider.npiMatch.confidence),
  ).length;
  const enforcementCount = data.providers.filter((provider) =>
    provider.flags.some((flag) => flag.label === "enforcement record"),
  ).length;
  const discrepancyCount = data.providers.filter((provider) =>
    provider.flags.some((flag) => flag.label === "data discrepancy"),
  ).length;

  return (
    <>
      <section className="provider-stats" aria-label="Provider directory summary">
        <div>
          <span>Current registry</span>
          <strong>{data.registryCount}</strong>
          <p>NYC Aging facilities</p>
        </div>
        <div>
          <span>Reconciled</span>
          <strong>{reconciledCount}</strong>
          <p>High or medium NPI matches</p>
        </div>
        <div>
          <span>Discrepancies</span>
          <strong>{discrepancyCount}</strong>
          <p>Facilities with a data mismatch</p>
        </div>
        <div>
          <span>Enforcement</span>
          <strong>{enforcementCount}</strong>
          <p>Exact OMIG roster matches</p>
        </div>
      </section>

      <section className="provider-controls" aria-label="Provider filters">
        <label>
          Search providers
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, sponsor, address, NPI, DFTA ID…"
            type="search"
            value={query}
          />
        </label>
        <label>
          Borough
          <select
            onChange={(event) => setBorough(event.target.value)}
            value={borough}
          >
            <option value="all">All boroughs</option>
            {boroughs.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Evidence label
          <select
            onChange={(event) =>
              setLabel(event.target.value as "all" | EvidenceLabel)
            }
            value={label}
          >
            <option value="all">All labels</option>
            {labelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="directory-meta">
        <p>
          Showing <strong>{filtered.length}</strong> of {data.providers.length}{" "}
          facilities, ordered by evidence severity and flag count.
        </p>
        <p>
          {data.nppesCount.toLocaleString()} NPPES records and{" "}
          {data.exclusionCount.toLocaleString()} OMIG exclusions compared.
        </p>
      </div>

      <section className="provider-list">
        {filtered.map((provider) => (
          <article className="provider-row" key={provider.dftaId}>
            <div className="provider-row-main">
              <p className="provider-id">DFTA {provider.dftaId}</p>
              <h2>
                <Link href={`/providers/${encodeURIComponent(provider.dftaId)}`}>
                  {provider.programName}
                </Link>
              </h2>
              <p>{provider.sponsorName}</p>
              <address>
                {provider.address}, {provider.borough}, NY {provider.zipCode}
              </address>
            </div>
            <div className="provider-row-npi">
              <span>NPI reconciliation</span>
              <strong>{provider.npiMatch.npi ?? "No match"}</strong>
              <small className={`match-state ${provider.npiMatch.confidence}`}>
                {provider.npiMatch.confidence}
              </small>
            </div>
            <div className="provider-row-flags">
              <span>{provider.flags.length} evidence flags</span>
              <div>
                {provider.flags.slice(0, 3).map((flag) => (
                  <span
                    className={`evidence-pill ${flag.label.replaceAll(" ", "-")}`}
                    key={flag.id}
                  >
                    {flag.label}
                  </span>
                ))}
              </div>
              <Link
                className="provider-link"
                href={`/providers/${encodeURIComponent(provider.dftaId)}`}
              >
                Open dossier
              </Link>
            </div>
          </article>
        ))}
        {filtered.length === 0 ? (
          <div className="empty-state">
            No providers match the current filters.
          </div>
        ) : null}
      </section>
    </>
  );
}
