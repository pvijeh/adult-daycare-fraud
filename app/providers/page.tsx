import Link from "next/link";

import ProviderDirectory from "@/components/ProviderDirectory";
import { getProviderDirectory } from "@/lib/provider-data";


export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const data = await getProviderDirectory();

  return (
    <main>
      <header className="subpage-hero">
        <div className="subpage-hero-inner">
          <nav aria-label="Breadcrumb">
            <Link href="/">Ghosts in the Grid</Link>
            <span>/</span>
            <strong>Provider dossiers</strong>
          </nav>
          <p className="kicker">Facility-level public-record reconciliation</p>
          <h1>Provider dossiers</h1>
          <p>
            Search the current NYC Aging registry, inspect identity matches,
            and open source-backed leads without treating a mismatch as proof
            of fraud.
          </p>
        </div>
      </header>

      {data.source === "demo-fallback" ? (
        <div className="demo-banner">
          <strong>Demonstration dossiers.</strong> Live public sources were
          unavailable, so these records are illustrative and are not findings.
        </div>
      ) : null}

      <section className="provider-shell">
        <div className="method-banner">
          <strong>No fraud score.</strong>
          <p>
            Labels distinguish leads, data discrepancies, missing records, and
            official enforcement. Every flag includes its matching rule,
            limitations, benign explanations, and records needed for review.
          </p>
        </div>
        <ProviderDirectory data={data} />
      </section>

      <footer>
        <strong>Ghosts in the Grid</strong>
        <span>NYC Aging · NPPES · OMIG</span>
        <Link href="/">Return to citywide analysis</Link>
      </footer>
    </main>
  );
}
