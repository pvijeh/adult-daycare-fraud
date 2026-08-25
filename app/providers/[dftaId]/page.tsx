import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getProviderDossier, providerSources } from "@/lib/provider-data";
import type { ProviderFlag } from "@/lib/provider-types";


export const dynamic = "force-dynamic";

type ProviderPageProps = {
  params: Promise<{ dftaId: string }>;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Not stated";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatNumber(value: number | null, suffix = ""): string {
  return value === null ? "Not available" : `${value.toLocaleString()}${suffix}`;
}

function FlagCard({ flag }: { flag: ProviderFlag }) {
  return (
    <article className={`flag-card severity-${flag.severity}`}>
      <div className="flag-heading">
        <span className={`evidence-pill ${flag.label.replaceAll(" ", "-")}`}>
          {flag.label}
        </span>
        <span className="severity-label">{flag.severity} priority</span>
      </div>
      <h3>{flag.title}</h3>
      <p className="flag-summary">{flag.summary}</p>
      <dl className="flag-evidence">
        <div>
          <dt>Source record</dt>
          <dd>
            <a href={flag.sourceUrl} rel="noreferrer" target="_blank">
              {flag.sourceName}
            </a>
            <small>{flag.sourceRecordId}</small>
          </dd>
        </div>
        <div>
          <dt>Reporting period</dt>
          <dd>{flag.reportingPeriod}</dd>
        </div>
        <div>
          <dt>Identity basis</dt>
          <dd>{flag.identityBasis}</dd>
        </div>
        <div>
          <dt>NPI used</dt>
          <dd>{flag.npi ?? "No NPI used"}</dd>
        </div>
        <div>
          <dt>Address used</dt>
          <dd>{flag.address}</dd>
        </div>
        <div>
          <dt>Match rule</dt>
          <dd>{flag.matchRule}</dd>
        </div>
        <div>
          <dt>Values compared</dt>
          <dd>
            {flag.valuesCompared.length
              ? flag.valuesCompared.join(" ↔ ")
              : "No cross-source value comparison"}
          </dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{flag.matchConfidence}</dd>
        </div>
        <div>
          <dt>Observed date</dt>
          <dd>{formatDate(flag.observedAt)}</dd>
        </div>
        <div>
          <dt>Human review</dt>
          <dd>{flag.reviewStatus}</dd>
        </div>
      </dl>
      <div className="flag-caveats">
        <p>
          <strong>Limitations</strong>
          {flag.limitations}
        </p>
        <p>
          <strong>Plausible benign explanation</strong>
          {flag.benignExplanations}
        </p>
        <p>
          <strong>Evidence needed to resolve</strong>
          {flag.recordsNeeded}
        </p>
      </div>
    </article>
  );
}

export async function generateMetadata({
  params,
}: ProviderPageProps): Promise<Metadata> {
  const { dftaId } = await params;
  const provider = await getProviderDossier(dftaId);
  return provider
    ? {
        title: `${provider.programName} | Provider dossier`,
        description: `Public-record reconciliation for ${provider.programName}, DFTA ${provider.dftaId}.`,
      }
    : { title: "Provider not found | Ghosts in the Grid" };
}

export default async function ProviderPage({ params }: ProviderPageProps) {
  const { dftaId } = await params;
  const provider = await getProviderDossier(dftaId);
  if (!provider) {
    notFound();
  }

  return (
    <main>
      <header className="dossier-hero">
        <div className="dossier-hero-inner">
          <nav aria-label="Breadcrumb">
            <Link href="/">Ghosts in the Grid</Link>
            <span>/</span>
            <Link href="/providers">Providers</Link>
            <span>/</span>
            <strong>DFTA {provider.dftaId}</strong>
          </nav>
          <div className="dossier-title">
            <div>
              <p className="kicker">
                Provider dossier · {provider.borough || "NYC"}
              </p>
              <h1>{provider.programName}</h1>
              <p>{provider.sponsorName}</p>
            </div>
            <aside>
              <span>Publication gate</span>
              <strong>Not human-reviewed</strong>
              <p>
                Treat every item below as a reporting lead until its source
                identity and operating-period relevance are verified.
              </p>
            </aside>
          </div>
        </div>
      </header>

      {provider.dataSource === "demo-fallback" ? (
        <div className="demo-banner">
          <strong>Demonstration dossier.</strong> This is not a real provider or
          public-record finding.
        </div>
      ) : null}

      <section className="dossier-shell">
        <section className="dossier-facts" aria-label="Provider identity">
          <div>
            <span>DFTA ID</span>
            <strong>{provider.dftaId}</strong>
          </div>
          <div>
            <span>Program address</span>
            <strong>
              {provider.address}, {provider.city}, {provider.state}{" "}
              {provider.zipCode}
            </strong>
          </div>
          <div>
            <span>Program phone</span>
            <strong>{provider.phone || "Not stated"}</strong>
          </div>
          <div>
            <span>NYC Aging funded</span>
            <strong>{provider.funded ? "Yes" : "No"}</strong>
          </div>
        </section>

        <section className="dossier-section">
          <div className="dossier-section-heading">
            <div>
              <p className="section-index">01 / Evidence flags</p>
              <h2>What deserves follow-up?</h2>
            </div>
            <p>
              {provider.flags.length} derived flags, separated by evidentiary
              status rather than collapsed into a risk score.
            </p>
          </div>
          <div className="flag-grid">
            {provider.flags.map((flag) => (
              <FlagCard flag={flag} key={flag.id} />
            ))}
            {provider.flags.length === 0 ? (
              <div className="empty-state">
                No automated flags were produced. This does not establish
                compliance or absence of risk.
              </div>
            ) : null}
          </div>
        </section>

        <section className="dossier-section">
          <div className="dossier-section-heading">
            <div>
              <p className="section-index">02 / Identity reconciliation</p>
              <h2>Do the facility and NPI records align?</h2>
            </div>
            <p>
              NPPES establishes an identifier record, not licensure, Medicaid
              eligibility, network status, or current operation.
            </p>
          </div>
          <div className="comparison-grid">
            <article className="source-card">
              <span>NYC Aging registration</span>
              <h3>{provider.programName}</h3>
              <dl>
                <div>
                  <dt>Sponsor</dt>
                  <dd>{provider.sponsorName}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{provider.address}</dd>
                </div>
                <div>
                  <dt>BIN / BBL</dt>
                  <dd>
                    {provider.bin || "Missing"} / {provider.bbl || "Missing"}
                  </dd>
                </div>
              </dl>
              <a href={providerSources.registry} rel="noreferrer" target="_blank">
                Open source
              </a>
            </article>
            <article className="source-card">
              <div className="source-card-heading">
                <span>NPPES candidate</span>
                <small
                  className={`match-state ${provider.npiMatch.confidence}`}
                >
                  {provider.npiMatch.confidence}
                </small>
              </div>
              <h3>{provider.npiMatch.orgName ?? "No reconciled record"}</h3>
              <dl>
                <div>
                  <dt>NPI</dt>
                  <dd>{provider.npiMatch.npi ?? "Not matched"}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{provider.npiMatch.rawAddress ?? "Not available"}</dd>
                </div>
                <div>
                  <dt>Enumeration</dt>
                  <dd>{formatDate(provider.npiMatch.enumerationDate)}</dd>
                </div>
                <div>
                  <dt>Match reasons</dt>
                  <dd>
                    {provider.npiMatch.reasons.join("; ") ||
                      "No candidate reached the display threshold"}
                  </dd>
                </div>
              </dl>
              <a href={providerSources.nppes} rel="noreferrer" target="_blank">
                Open source
              </a>
            </article>
          </div>
        </section>

        <section className="dossier-section">
          <div className="dossier-section-heading">
            <div>
              <p className="section-index">03 / Property and occupancy</p>
              <h2>What do building records establish?</h2>
            </div>
            <p>
              Structured metadata is a starting point. Legal use, maximum
              occupancy, and site capacity can require certificate documents.
            </p>
          </div>
          <div className="comparison-grid">
            <article className="source-card">
              <span>PLUTO property record</span>
              <h3>{provider.property?.ownerName || "No property match"}</h3>
              <dl>
                <div>
                  <dt>Building class</dt>
                  <dd>{provider.property?.buildingClass || "Not available"}</dd>
                </div>
                <div>
                  <dt>Building area</dt>
                  <dd>
                    {formatNumber(provider.property?.buildingArea ?? null, " sq ft")}
                  </dd>
                </div>
                <div>
                  <dt>Commercial area</dt>
                  <dd>
                    {formatNumber(
                      provider.property?.commercialArea ?? null,
                      " sq ft",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Floors / total units</dt>
                  <dd>
                    {formatNumber(provider.property?.floors ?? null)} /{" "}
                    {formatNumber(provider.property?.totalUnits ?? null)}
                  </dd>
                </div>
              </dl>
              <a href={providerSources.pluto} rel="noreferrer" target="_blank">
                Open source
              </a>
            </article>
            <article className="source-card">
              <span>DOB certificate metadata</span>
              <h3>
                {provider.certificateMetadata
                  ? `${provider.certificateMetadata.currentFilingCount + provider.certificateMetadata.historicalCertificateCount} metadata rows`
                  : "Requires records"}
              </h3>
              <dl>
                <div>
                  <dt>Current filings</dt>
                  <dd>
                    {provider.certificateMetadata?.currentFilingCount ??
                      "Not available"}
                  </dd>
                </div>
                <div>
                  <dt>Historical rows</dt>
                  <dd>
                    {provider.certificateMetadata?.historicalCertificateCount ??
                      "Not available"}
                  </dd>
                </div>
                <div>
                  <dt>Latest issue date</dt>
                  <dd>
                    {formatDate(
                      provider.certificateMetadata?.latestIssueDate ?? null,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Interpretation</dt>
                  <dd>
                    Metadata does not expose the detailed occupancy schedule or
                    prove SADC capacity.
                  </dd>
                </div>
              </dl>
              <a href={providerSources.dob} rel="noreferrer" target="_blank">
                Open source
              </a>
            </article>
          </div>
        </section>

        <section className="dossier-section">
          <div className="dossier-section-heading">
            <div>
              <p className="section-index">04 / Corporate footprint</p>
              <h2>Where else does the sponsor appear?</h2>
            </div>
            <p>
              Exact sponsor-name reuse identifies a reporting relationship, not
              common ownership beyond what the registry states.
            </p>
          </div>
          {provider.relatedFacilities.length ? (
            <div className="related-grid">
              {provider.relatedFacilities.map((related) => (
                <Link
                  href={`/providers/${encodeURIComponent(related.dftaId)}`}
                  key={related.dftaId}
                >
                  <span>DFTA {related.dftaId}</span>
                  <strong>{related.programName}</strong>
                  <small>
                    {related.address}, {related.zipCode}
                  </small>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No other current registry facility uses this exact normalized
              sponsor name.
            </div>
          )}
        </section>

        <section className="methodology-card">
          <div>
            <p className="section-index">Publication safeguards</p>
            <h2>What this page does not establish</h2>
          </div>
          <ul>
            <li>A registry or NPPES mismatch is not proof of fraud.</li>
            <li>NPPES is not a licensing or operating-status source.</li>
            <li>Shared names, phones, addresses, or NPIs can be legitimate.</li>
            <li>
              Structured DOB metadata does not establish legal use or maximum
              occupancy without the underlying documents.
            </li>
            <li>
              Enforcement records apply only to the named entity, NPI, and
              scope established by the agency record.
            </li>
          </ul>
          <p className="retrieval-note">
            Public sources retrieved {formatDate(provider.retrievedAt)}.
          </p>
        </section>
      </section>

      <footer>
        <strong>Ghosts in the Grid</strong>
        <span>Evidence-first provider dossier</span>
        <Link href="/providers">Browse all providers</Link>
      </footer>
    </main>
  );
}
