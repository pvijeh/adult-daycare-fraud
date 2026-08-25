import "server-only";

import { cache } from "react";

import { demoProviderDirectory } from "@/lib/demo-providers";
import type {
  CertificateMetadata,
  NpiMatch,
  PropertyRecord,
  ProviderDirectoryData,
  ProviderDirectoryEntry,
  ProviderDirectoryListData,
  ProviderDossier,
  ProviderFlag,
} from "@/lib/provider-types";


const REGISTRY_URL =
  "https://data.cityofnewyork.us/resource/32cj-z7va.json?$limit=500";
const REGISTRY_SOURCE =
  "https://data.cityofnewyork.us/City-Government/Department-for-the-Aging-NYC-Aging-Social-Adult-Da/32cj-z7va";
const NPPES_URL = "https://npiregistry.cms.hhs.gov/api/";
const NPPES_SOURCE = "https://npiregistry.cms.hhs.gov/";
const OMIG_EXCLUSIONS_URL =
  "https://apps.omig.ny.gov/exclusions/tabdelimited.aspx";
const OMIG_SOURCE = "https://omig.ny.gov/medicaid-exclusions";
const PLUTO_URL = "https://data.cityofnewyork.us/resource/64uk-42ks.json";
const PLUTO_SOURCE =
  "https://data.cityofnewyork.us/Housing-Development/Primary-Land-Use-Tax-Lot-Output-PLUTO-/64uk-42ks";
const DOB_NOW_URL = "https://data.cityofnewyork.us/resource/pkdm-hqz6.json";
const DOB_HISTORICAL_URL =
  "https://data.cityofnewyork.us/resource/9r28-dr8b.json";
const DOB_SOURCE =
  "https://data.cityofnewyork.us/Housing-Development/DOB-NOW-Certificate-of-Occupancy/pkdm-hqz6";
const REVALIDATE_SECONDS = 86_400;
const NAME_STOP_WORDS = new Set([
  "ADULT",
  "CARE",
  "CENTER",
  "CENTRE",
  "CORP",
  "CORPORATION",
  "DAY",
  "DAYCARE",
  "DBA",
  "INC",
  "LLC",
  "OF",
  "SOCIAL",
  "THE",
]);

type RegistryRow = {
  dfta_id?: string;
  programname?: string;
  sponsorname?: string;
  programaddress?: string;
  programcity?: string;
  programstate?: string;
  programzipcode?: string;
  borough?: string;
  programphone?: string;
  dfta_funded?: string;
  latitude?: string;
  longitude?: string;
  bin?: string;
  bbl?: string;
};

type NppesAddress = {
  address_purpose?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
};

type NppesResult = {
  number?: string;
  basic?: {
    organization_name?: string;
    enumeration_date?: string;
  };
  addresses?: NppesAddress[];
};

type NppesProvider = {
  npi: string;
  orgName: string;
  rawAddress: string;
  cleanAddress: string;
  zipCode: string;
  phone: string;
  enumerationDate: string;
};

type ExclusionRecord = {
  providerName: string;
  normalizedProviderName: string;
  npi: string;
  providerType: string;
  effectiveDate: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown): number | null {
  const raw = text(value);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeAddress(value: string): string {
  const withoutUnit = value
    .toUpperCase()
    .replace(
      /\b(?:APARTMENT|APT|UNIT|SUITE|STE|FLOOR|FL|ROOM|RM)\b.*$/,
      "",
    )
    .replace(/#\s*[A-Z0-9-]+.*$/, "");
  const replacements: Record<string, string> = {
    STREET: "ST",
    AVENUE: "AVE",
    BOULEVARD: "BLVD",
    ROAD: "RD",
    DRIVE: "DR",
    PLACE: "PL",
    LANE: "LN",
    PARKWAY: "PKWY",
    HIGHWAY: "HWY",
  };
  return withoutUnit
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => replacements[part] ?? part)
    .join(" ");
}

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\([A-Z]\d+\)\s*$/, "")
    .replace(/\bDAY\s+CARE\b/g, "DAYCARE")
    .replace(/\b(?:AKA|D\/B\/A)\b/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nppesSourceUrl(npi: string | null): string {
  const params = new URLSearchParams({ version: "2.1" });
  if (npi) {
    params.set("number", npi);
  } else {
    params.set("taxonomy_description", "Adult Day Care");
    params.set("state", "NY");
    params.set("limit", "200");
  }
  return `${NPPES_URL}?${params}`;
}

function nameTokens(value: string): Set<string> {
  return new Set(
    normalizeName(value)
      .split(" ")
      .filter((token) => token.length > 1 && !NAME_STOP_WORDS.has(token)),
  );
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

async function fetchSocrataJson<T>(url: string): Promise<T> {
  const token = process.env.SOCRATA_APP_TOKEN;
  const load = (includeToken: boolean) =>
    fetch(url, {
      headers:
        includeToken && token ? { "X-App-Token": token } : undefined,
      next: { revalidate: REVALIDATE_SECONDS },
    });
  let response = await load(Boolean(token));
  if (token && response.status === 403) {
    response = await load(false);
  }
  if (!response.ok) {
    throw new Error(`NYC Open Data returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

async function fetchRegistry(): Promise<RegistryRow[]> {
  return fetchSocrataJson<RegistryRow[]>(REGISTRY_URL);
}

function locationAddress(result: NppesResult): NppesAddress | null {
  const addresses = Array.isArray(result.addresses) ? result.addresses : [];
  return (
    addresses.find(
      (address) => text(address.address_purpose).toUpperCase() === "LOCATION",
    ) ??
    addresses[0] ??
    null
  );
}

function parseNppesResult(result: NppesResult): NppesProvider | null {
  const npi = text(result.number);
  const address = locationAddress(result);
  if (!npi || !address) {
    return null;
  }
  const rawAddress = [text(address.address_1), text(address.address_2)]
    .filter(Boolean)
    .join(" ");
  return {
    npi,
    orgName: text(result.basic?.organization_name),
    rawAddress,
    cleanAddress: normalizeAddress(rawAddress),
    zipCode: normalizePhone(text(address.postal_code)).slice(0, 5),
    phone: normalizePhone(text(address.telephone_number)),
    enumerationDate: text(result.basic?.enumeration_date),
  };
}

async function fetchNppesProviders(): Promise<NppesProvider[]> {
  const pages = await Promise.all(
    [0, 200, 400, 600, 800, 1000].map(async (skip) => {
      const params = new URLSearchParams({
        version: "2.1",
        taxonomy_description: "Adult Day Care",
        state: "NY",
        limit: "200",
        skip: String(skip),
      });
      const response = await fetch(`${NPPES_URL}?${params}`, {
        next: { revalidate: REVALIDATE_SECONDS },
      });
      if (!response.ok) {
        throw new Error(`NPPES returned ${response.status}.`);
      }
      const payload = (await response.json()) as { results?: NppesResult[] };
      return Array.isArray(payload.results) ? payload.results : [];
    }),
  );
  return pages
    .flat()
    .map(parseNppesResult)
    .filter((provider): provider is NppesProvider => provider !== null);
}

async function fetchExclusions(): Promise<ExclusionRecord[]> {
  const response = await fetch(OMIG_EXCLUSIONS_URL, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!response.ok) {
    throw new Error(`OMIG returned ${response.status}.`);
  }
  const rows = (await response.text()).split(/\r?\n/).slice(1);
  return rows.flatMap((row) => {
    const [providerName = "", , npi = "", providerType = "", effectiveDate = ""] =
      row.split("\t");
    if (!providerName.trim()) {
      return [];
    }
    return [
      {
        providerName: providerName.trim(),
        normalizedProviderName: normalizeName(providerName),
        npi: normalizePhone(npi),
        providerType: providerType.trim(),
        effectiveDate: effectiveDate.trim(),
      },
    ];
  });
}

function scoreCandidate(
  facility: RegistryRow,
  provider: NppesProvider,
): { score: number; reasons: string[] } {
  const programName = text(facility.programname);
  const sponsorName = text(facility.sponsorname);
  const address = normalizeAddress(text(facility.programaddress));
  const zipCode = text(facility.programzipcode).slice(0, 5);
  const phone = normalizePhone(text(facility.programphone));
  const exactAddress = Boolean(address && address === provider.cleanAddress);
  const exactSponsor =
    Boolean(sponsorName) &&
    normalizeName(sponsorName) === normalizeName(provider.orgName);
  const exactProgram =
    Boolean(programName) &&
    normalizeName(programName) === normalizeName(provider.orgName);
  const sameZip = Boolean(zipCode && zipCode === provider.zipCode);
  const samePhone = Boolean(phone && phone === provider.phone);
  const similarity = Math.max(
    tokenSimilarity(sponsorName, provider.orgName),
    tokenSimilarity(programName, provider.orgName),
  );
  let score = 0;
  const reasons: string[] = [];
  if (exactAddress) {
    score += 50;
    reasons.push("Exact normalized address");
  }
  if (exactSponsor || exactProgram) {
    score += 35;
    reasons.push(
      exactSponsor
        ? "Exact sponsor and organization name"
        : "Exact program and organization name",
    );
  } else if (similarity >= 0.8) {
    score += 25;
    reasons.push("Strong organization-name similarity");
  } else if (similarity >= 0.5) {
    score += 12;
    reasons.push("Partial organization-name similarity");
  }
  if (samePhone) {
    score += 20;
    reasons.push("Exact location phone");
  }
  if (sameZip) {
    score += 5;
    reasons.push("Same ZIP code");
  }
  return { score, reasons };
}

function matchNpi(
  facility: RegistryRow,
  providers: NppesProvider[],
): NpiMatch {
  const sponsorName = normalizeName(text(facility.sponsorname));
  const programName = normalizeName(text(facility.programname));
  const zipCode = text(facility.programzipcode).slice(0, 5);
  const candidates = providers.filter((provider) => {
    const providerName = normalizeName(provider.orgName);
    return (
      provider.zipCode === zipCode ||
      providerName === sponsorName ||
      providerName === programName
    );
  });
  const scored = candidates
    .map((provider) => ({
      provider,
      ...scoreCandidate(facility, provider),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.provider.npi.localeCompare(right.provider.npi),
    );
  const top = scored[0];
  if (!top || top.score < 30) {
    return {
      npi: null,
      confidence: "unmatched",
      score: top?.score ?? 0,
      reasons: top?.reasons ?? [],
      orgName: null,
      rawAddress: null,
      cleanAddress: null,
      zipCode: null,
      phone: null,
      enumerationDate: null,
    };
  }
  const tied = scored.slice(1).some((candidate) => candidate.score === top.score);
  const confidence =
    tied ? "ambiguous" : top.score >= 70 ? "high" : top.score >= 45 ? "medium" : "ambiguous";
  return {
    npi: top.provider.npi,
    confidence,
    score: top.score,
    reasons: top.reasons,
    orgName: top.provider.orgName,
    rawAddress: top.provider.rawAddress,
    cleanAddress: top.provider.cleanAddress,
    zipCode: top.provider.zipCode,
    phone: top.provider.phone,
    enumerationDate: top.provider.enumerationDate,
  };
}

type ProviderFlagDraft = Omit<
  ProviderFlag,
  | "id"
  | "sourceRecordId"
  | "reportingPeriod"
  | "identityBasis"
  | "npi"
  | "address"
  | "valuesCompared"
  | "matchRule"
  | "benignExplanations"
  | "recordsNeeded"
  | "reviewStatus"
> &
  Partial<
    Pick<
      ProviderFlag,
      | "sourceRecordId"
      | "reportingPeriod"
      | "identityBasis"
      | "npi"
      | "address"
      | "valuesCompared"
      | "matchRule"
      | "benignExplanations"
      | "recordsNeeded"
      | "reviewStatus"
    >
  >;

function createFlag(
  facility: RegistryRow,
  match: NpiMatch,
  suffix: string,
  flag: ProviderFlagDraft,
): ProviderFlag {
  const dftaId = text(facility.dfta_id);
  const address = [
    text(facility.programaddress),
    text(facility.programcity),
    text(facility.programstate),
    text(facility.programzipcode),
  ]
    .filter(Boolean)
    .join(", ");
  return {
    id: `${dftaId}-${suffix}`,
    sourceRecordId: flag.sourceRecordId ?? dftaId,
    reportingPeriod: flag.reportingPeriod ?? "Current public-data snapshot",
    identityBasis:
      flag.identityBasis ??
      `NYC Aging DFTA ID ${dftaId}; sponsor ${text(facility.sponsorname)}`,
    npi: flag.npi === undefined ? match.npi : flag.npi,
    address: flag.address ?? address,
    valuesCompared: flag.valuesCompared ?? [],
    matchRule:
      flag.matchRule ??
      "Deterministic comparison of normalized public-record identifiers",
    benignExplanations:
      flag.benignExplanations ??
      "The records may be stale, reformatted, incomplete, or represent different organizational roles.",
    recordsNeeded:
      flag.recordsNeeded ??
      "Current site-level registration, identity validation, and agency source documents.",
    reviewStatus: flag.reviewStatus ?? "not reviewed",
    ...flag,
  };
}

function buildFlags(
  facility: RegistryRow,
  match: NpiMatch,
  exclusions: ExclusionRecord[],
  groupCounts: {
    sponsors: Map<string, number>;
    phones: Map<string, number>;
    addresses: Map<string, number>;
    npis: Map<string, number>;
  },
): ProviderFlag[] {
  const sponsorName = text(facility.sponsorname);
  const address = normalizeAddress(text(facility.programaddress));
  const phone = normalizePhone(text(facility.programphone));
  const flags: ProviderFlag[] = [];
  const exactExclusions = exclusions.filter(
    (record) =>
      (record.npi && record.npi === match.npi) ||
      record.normalizedProviderName === normalizeName(sponsorName),
  );
  for (const [index, exclusion] of exactExclusions.entries()) {
    const basis =
      exclusion.npi && exclusion.npi === match.npi
        ? `exact NPI ${exclusion.npi}`
        : "exact normalized sponsor name";
    flags.push(
      createFlag(facility, match, `omig-${index}`, {
        label: "enforcement record",
        severity: "high",
        title: "Exact OMIG exclusion-roster match",
        summary: `${exclusion.providerName} appears on the OMIG exclusion roster effective ${exclusion.effectiveDate || "an undisclosed date"}; matched by ${basis}.`,
        sourceName: "NYS Office of the Medicaid Inspector General exclusions",
        sourceUrl: OMIG_SOURCE,
        observedAt: exclusion.effectiveDate || null,
        matchConfidence: "exact",
        limitations:
          "The roster establishes the named entity or NPI exclusion. It does not automatically establish the scope of affiliates, locations, or historical conduct.",
        sourceRecordId:
          exclusion.npi || `${exclusion.providerName}-${exclusion.effectiveDate}`,
        reportingPeriod: `Effective ${exclusion.effectiveDate || "date not stated"}`,
        identityBasis: basis,
        valuesCompared: [
          sponsorName,
          exclusion.providerName,
          ...(match.npi ? [match.npi] : []),
          ...(exclusion.npi ? [exclusion.npi] : []),
        ],
        matchRule:
          "Exact normalized entity-name or exact 10-digit NPI equality",
        benignExplanations:
          "A similarly named but distinct entity is possible for a name-only match; the NPI may represent an organization with multiple locations.",
        recordsNeeded:
          "OMIG exclusion order and records identifying the affected entity, affiliates, and locations.",
      }),
    );
  }
  if (!match.npi) {
    flags.push(
      createFlag(facility, match, "npi-unmatched", {
        label: "data discrepancy",
        severity: "medium",
        title: "No NPPES record was reconciled",
        summary:
          "The facility did not produce a sufficiently strong match in the first 1,200 New York Adult Day Care taxonomy records returned by NPPES.",
        sourceName: "NPPES NPI Registry",
        sourceUrl: nppesSourceUrl(null),
        observedAt: null,
        matchConfidence: "ambiguous",
        limitations:
          "NPPES is not a licensing or operating-status source, and the API result set is capped. The facility may use another entity name, taxonomy, address, or NPI.",
        valuesCompared: [
          text(facility.programname),
          sponsorName,
          text(facility.programaddress),
          text(facility.programphone),
        ],
        matchRule:
          "No candidate reached 30 points from exact address, entity name, location phone, ZIP, and token similarity",
        sourceRecordId: "NY Adult Day Care taxonomy query; first 1,200 results",
        benignExplanations:
          "The provider may use a parent entity, another taxonomy, a relocated address, or an NPI beyond the API result cap.",
        recordsNeeded:
          "Site-level NPI validation from the provider or contracted MLTC plans.",
      }),
    );
  } else if (match.confidence === "ambiguous") {
    flags.push(
      createFlag(facility, match, "npi-ambiguous", {
        label: "data discrepancy",
        severity: "medium",
        title: "NPPES identity match is ambiguous",
        summary: `The leading NPPES candidate scored ${match.score}, but the public identifiers do not support a unique high-confidence site match.`,
        sourceName: "NYC Aging registry and NPPES NPI Registry",
        sourceUrl: nppesSourceUrl(match.npi),
        observedAt: match.enumerationDate,
        matchConfidence: "ambiguous",
        limitations:
          "Names, addresses, and phone numbers can be stale, shared, reformatted, or attached to a parent organization.",
        valuesCompared: [
          text(facility.programname),
          sponsorName,
          text(facility.programaddress),
          match.orgName ?? "",
          match.rawAddress ?? "",
        ].filter(Boolean),
        matchRule: `Leading deterministic match score ${match.score}; ties or scores below 45 remain ambiguous`,
        sourceRecordId: match.npi ?? "No NPI",
        benignExplanations:
          "The leading record may belong to a parent organization, prior location, or similarly named provider.",
        recordsNeeded:
          "Site-level NPI validation and current organizational ownership records.",
      }),
    );
  }
  if (
    match.npi &&
    match.cleanAddress &&
    address &&
    match.cleanAddress !== address
  ) {
    flags.push(
      createFlag(facility, match, "npi-address", {
        label: "data discrepancy",
        severity: "medium",
        title: "NYC Aging and NPPES addresses differ",
        summary: `NYC Aging lists ${text(facility.programaddress)}; the matched NPPES location is ${match.rawAddress}.`,
        sourceName: "NYC Aging registry and NPPES NPI Registry",
        sourceUrl: nppesSourceUrl(match.npi),
        observedAt: match.enumerationDate,
        matchConfidence:
          match.confidence === "high"
            ? "high"
            : match.confidence === "medium"
              ? "medium"
              : "ambiguous",
        limitations:
          "The difference can reflect a move, mailing-versus-service location, stale registry data, normalization, or an incorrect identity match.",
        valuesCompared: [
          text(facility.programaddress),
          match.rawAddress ?? "",
        ],
        matchRule:
          "Matched NPPES normalized location address does not equal the normalized NYC Aging program address",
        sourceRecordId: match.npi,
        benignExplanations:
          "A move, stale record, mailing-versus-service location, or omitted unit information.",
        recordsNeeded:
          "Current site-level NPI validation and dated registration change records.",
      }),
    );
  }
  const sponsorCount =
    groupCounts.sponsors.get(normalizeName(sponsorName)) ?? 0;
  if (sponsorCount > 1) {
    flags.push(
      createFlag(facility, match, "multi-site-sponsor", {
        label: "lead",
        severity: "low",
        title: `Sponsor appears at ${sponsorCount} registered sites`,
        summary: `${sponsorName} is the listed sponsor for ${sponsorCount} current NYC Aging facilities.`,
        sourceName: "NYC Aging SADC registry",
        sourceUrl: REGISTRY_SOURCE,
        observedAt: null,
        matchConfidence: "exact",
        limitations:
          "Multi-site operation is common and is not evidence of misconduct. This flag only identifies a corporate footprint for reporting.",
        valuesCompared: [sponsorName, `${sponsorCount} registry records`],
        matchRule: "Exact normalized sponsor-name equality",
        benignExplanations:
          "A legitimate operator may run multiple separately registered facilities.",
        recordsNeeded:
          "Corporate filings and site-level ownership or management agreements if the relationship requires confirmation.",
      }),
    );
  }
  const phoneCount = groupCounts.phones.get(phone) ?? 0;
  if (phone && phoneCount > 1) {
    flags.push(
      createFlag(facility, match, "shared-phone", {
        label: "lead",
        severity: "low",
        title: `Phone appears at ${phoneCount} registered sites`,
        summary: `${text(facility.programphone)} is shared by ${phoneCount} current registry records.`,
        sourceName: "NYC Aging SADC registry",
        sourceUrl: REGISTRY_SOURCE,
        observedAt: null,
        matchConfidence: "exact",
        limitations:
          "A shared phone can represent a parent organization, centralized intake, or a data-entry convention.",
        valuesCompared: [
          text(facility.programphone),
          `${phoneCount} registry records`,
        ],
        matchRule: "Exact normalized 10-digit registry phone equality",
        benignExplanations:
          "Centralized intake, a parent-company switchboard, or duplicate data entry.",
        recordsNeeded:
          "Current site contact records and corporate affiliation documents.",
      }),
    );
  }
  const addressCount = groupCounts.addresses.get(address) ?? 0;
  if (address && addressCount > 1) {
    flags.push(
      createFlag(facility, match, "shared-address", {
        label: "lead",
        severity: "medium",
        title: `${addressCount} facilities share the normalized address`,
        summary: `${text(facility.programaddress)} appears on ${addressCount} current NYC Aging registrations.`,
        sourceName: "NYC Aging SADC registry",
        sourceUrl: REGISTRY_SOURCE,
        observedAt: null,
        matchConfidence: "exact",
        limitations:
          "The registry may omit unit or floor distinctions. Shared premises do not establish improper operation or capacity.",
        valuesCompared: [
          text(facility.programaddress),
          `${addressCount} registry records`,
        ],
        matchRule: "Exact normalized street-address equality with unit text removed",
        benignExplanations:
          "Separate floors, suites, programs, or legal entities may legitimately share a building.",
        recordsNeeded:
          "Unit-level leases, floor plans, attendance capacity, and certificate-of-occupancy schedules.",
      }),
    );
  }
  const npiCount = match.npi ? groupCounts.npis.get(match.npi) ?? 0 : 0;
  if (match.npi && npiCount > 1) {
    flags.push(
      createFlag(facility, match, "shared-npi", {
        label: "lead",
        severity: "medium",
        title: `Matched NPI is linked to ${npiCount} registry facilities`,
        summary: `NPI ${match.npi} is the leading identity match for ${npiCount} current facilities.`,
        sourceName: "NYC Aging registry and NPPES NPI Registry",
        sourceUrl: nppesSourceUrl(match.npi),
        observedAt: match.enumerationDate,
        matchConfidence:
          match.confidence === "high"
            ? "high"
            : match.confidence === "medium"
              ? "medium"
              : "ambiguous",
        limitations:
          "This is an algorithmic linkage, not confirmation that the NPI was used to bill at each site or used contrary to the rules in effect at the time.",
        valuesCompared: [match.npi, `${npiCount} leading facility matches`],
        matchRule:
          "The same leading NPPES candidate resulted from deterministic reconciliation for multiple registry sites",
        sourceRecordId: match.npi,
        benignExplanations:
          "A parent organization NPI, historical address, incomplete site identifiers, or an ambiguous match.",
        recordsNeeded:
          "Dated site-level NPI validation plus claims and encounter records separated by billing and servicing NPI.",
      }),
    );
  }
  if (!text(facility.bin) || !text(facility.bbl)) {
    flags.push(
      createFlag(facility, match, "property-identifiers", {
        label: "requires records",
        severity: "low",
        title: "Registry lacks a complete BIN/BBL property key",
        summary:
          "The current registry record cannot be linked reliably to building and occupancy records using both municipal property identifiers.",
        sourceName: "NYC Aging SADC registry",
        sourceUrl: REGISTRY_SOURCE,
        observedAt: null,
        matchConfidence: "exact",
        limitations:
          "Missing identifiers can be a registry data-quality issue and do not imply a certificate or occupancy problem.",
        valuesCompared: [
          `BIN: ${text(facility.bin) || "missing"}`,
          `BBL: ${text(facility.bbl) || "missing"}`,
        ],
        matchRule: "Either the registry BIN or BBL field is blank",
        benignExplanations:
          "Registry geocoding may be incomplete or the address may require manual resolution.",
        recordsNeeded:
          "Confirmed BIN/BBL plus certificate-of-occupancy and occupancy-schedule documents.",
      }),
    );
  }
  return flags.sort((left, right) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[right.severity] - rank[left.severity];
  });
}

function increment(map: Map<string, number>, key: string): void {
  if (key) {
    map.set(key, (map.get(key) ?? 0) + 1);
  }
}

function buildDirectory(
  registry: RegistryRow[],
  providers: NppesProvider[],
  exclusions: ExclusionRecord[],
): ProviderDirectoryData {
  const matches = new Map<string, NpiMatch>();
  const sponsors = new Map<string, number>();
  const phones = new Map<string, number>();
  const addresses = new Map<string, number>();
  const npis = new Map<string, number>();
  for (const facility of registry) {
    const dftaId = text(facility.dfta_id);
    const match = matchNpi(facility, providers);
    matches.set(dftaId, match);
    increment(sponsors, normalizeName(text(facility.sponsorname)));
    increment(phones, normalizePhone(text(facility.programphone)));
    increment(addresses, normalizeAddress(text(facility.programaddress)));
    increment(npis, match.npi ?? "");
  }
  const groupCounts = { sponsors, phones, addresses, npis };
  const entries = registry
    .map((facility): ProviderDirectoryEntry | null => {
      const dftaId = text(facility.dfta_id);
      if (!dftaId) {
        return null;
      }
      const match = matches.get(dftaId);
      if (!match) {
        return null;
      }
      return {
        dftaId,
        programName: text(facility.programname),
        sponsorName: text(facility.sponsorname),
        address: text(facility.programaddress),
        city: text(facility.programcity),
        state: text(facility.programstate),
        zipCode: text(facility.programzipcode).slice(0, 5),
        borough: text(facility.borough),
        phone: text(facility.programphone),
        funded: text(facility.dfta_funded).toUpperCase() === "Y",
        bin: text(facility.bin),
        bbl: text(facility.bbl),
        latitude: numberOrNull(facility.latitude),
        longitude: numberOrNull(facility.longitude),
        npiMatch: match,
        flags: buildFlags(facility, match, exclusions, groupCounts),
        relatedFacilityCount:
          sponsors.get(normalizeName(text(facility.sponsorname))) ?? 1,
      };
    })
    .filter((entry): entry is ProviderDirectoryEntry => entry !== null)
    .sort(
      (left, right) =>
        left.programName.localeCompare(right.programName) ||
        left.dftaId.localeCompare(right.dftaId),
    );
  return {
    providers: entries,
    source: "live-public-data",
    retrievedAt: new Date().toISOString(),
    registryCount: entries.length,
    nppesCount: providers.length,
    exclusionCount: exclusions.length,
  };
}

export const getProviderDirectory = cache(
  async (): Promise<ProviderDirectoryData> => {
    try {
      const [registry, providers, exclusions] = await Promise.all([
        fetchRegistry(),
        fetchNppesProviders(),
        fetchExclusions(),
      ]);
      return buildDirectory(registry, providers, exclusions);
    } catch (error) {
      console.error(
        "Provider public-data query failed; using demonstration dossiers.",
        error,
      );
      return demoProviderDirectory;
    }
  },
);

export const getProviderDirectoryList = cache(
  async (): Promise<ProviderDirectoryListData> => {
    const directory = await getProviderDirectory();
    return {
      ...directory,
      providers: directory.providers.map((provider) => ({
        dftaId: provider.dftaId,
        programName: provider.programName,
        sponsorName: provider.sponsorName,
        address: provider.address,
        zipCode: provider.zipCode,
        borough: provider.borough,
        phone: provider.phone,
        npiMatch: {
          npi: provider.npiMatch.npi,
          confidence: provider.npiMatch.confidence,
        },
        flags: provider.flags.map((flag) => ({
          id: flag.id,
          label: flag.label,
          severity: flag.severity,
        })),
      })),
    };
  },
);

async function fetchProperty(bbl: string): Promise<PropertyRecord | null> {
  if (!bbl) {
    return null;
  }
  const params = new URLSearchParams({
    "$limit": "1",
    "$select":
      "address,ownername,bldgclass,bldgarea,comarea,numfloors,unitsres,unitstotal,yearbuilt",
    "$where": `bbl='${bbl.replace(/'/g, "''")}'`,
  });
  const rows = await fetchSocrataJson<
    Array<Record<string, string | undefined>>
  >(`${PLUTO_URL}?${params}`);
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    address: text(row.address),
    ownerName: text(row.ownername),
    buildingClass: text(row.bldgclass),
    buildingArea: numberOrNull(row.bldgarea),
    commercialArea: numberOrNull(row.comarea),
    floors: numberOrNull(row.numfloors),
    residentialUnits: numberOrNull(row.unitsres),
    totalUnits: numberOrNull(row.unitstotal),
    yearBuilt: numberOrNull(row.yearbuilt),
  };
}

async function fetchCertificateMetadata(
  bin: string,
): Promise<CertificateMetadata | null> {
  if (!bin) {
    return null;
  }
  const escapedBin = bin.replace(/'/g, "''");
  const currentParams = new URLSearchParams({
    "$limit": "500",
    "$select": "c_of_o_status,c_of_o_issuance_date",
    "$where": `bin='${escapedBin}'`,
  });
  const historicalParams = new URLSearchParams({
    "$limit": "5000",
    "$select": "c_o_issue_date,application_status_raw,filing_status_raw",
    "$where": `bin_number='${escapedBin}'`,
  });
  const [currentRows, historicalRows] = await Promise.all([
    fetchSocrataJson<Array<Record<string, string | undefined>>>(
      `${DOB_NOW_URL}?${currentParams}`,
    ),
    fetchSocrataJson<Array<Record<string, string | undefined>>>(
      `${DOB_HISTORICAL_URL}?${historicalParams}`,
    ),
  ]);
  const dates = [
    ...currentRows.map((row) => text(row.c_of_o_issuance_date)),
    ...historicalRows.map((row) => text(row.c_o_issue_date)),
  ].filter(Boolean);
  const statuses = new Set(
    [
      ...currentRows.map((row) => text(row.c_of_o_status)),
      ...historicalRows.map((row) => text(row.application_status_raw)),
      ...historicalRows.map((row) => text(row.filing_status_raw)),
    ].filter(Boolean),
  );
  return {
    currentFilingCount: currentRows.length,
    historicalCertificateCount: historicalRows.length,
    latestIssueDate: dates.sort().at(-1) ?? null,
    statuses: [...statuses].sort(),
  };
}

export const getProviderDossier = cache(
  async (dftaId: string): Promise<ProviderDossier | null> => {
    const directory = await getProviderDirectory();
    const provider = directory.providers.find(
      (entry) => entry.dftaId === dftaId,
    );
    if (!provider) {
      return null;
    }
    const relatedFacilities = directory.providers.filter(
      (entry) =>
        entry.dftaId !== provider.dftaId &&
        normalizeName(entry.sponsorName) === normalizeName(provider.sponsorName),
    );
    let property: PropertyRecord | null = null;
    let certificateMetadata: CertificateMetadata | null = null;
    if (directory.source === "live-public-data") {
      const results = await Promise.allSettled([
        fetchProperty(provider.bbl),
        fetchCertificateMetadata(provider.bin),
      ]);
      property = results[0].status === "fulfilled" ? results[0].value : null;
      certificateMetadata =
        results[1].status === "fulfilled" ? results[1].value : null;
    }
    return {
      ...provider,
      relatedFacilities,
      property,
      certificateMetadata,
      dataSource: directory.source,
      retrievedAt: directory.retrievedAt,
    };
  },
);

export const providerSources = {
  registry: REGISTRY_SOURCE,
  nppes: NPPES_SOURCE,
  omig: OMIG_SOURCE,
  pluto: PLUTO_SOURCE,
  dob: DOB_SOURCE,
};
