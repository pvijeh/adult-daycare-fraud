export type EvidenceLabel =
  | "lead"
  | "data discrepancy"
  | "compliance concern"
  | "requires records"
  | "allegation"
  | "enforcement record";

export type FlagSeverity = "low" | "medium" | "high";

export type ProviderFlag = {
  id: string;
  label: EvidenceLabel;
  severity: FlagSeverity;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  observedAt: string | null;
  matchConfidence: "exact" | "high" | "medium" | "ambiguous";
  limitations: string;
  sourceRecordId: string;
  reportingPeriod: string;
  identityBasis: string;
  npi: string | null;
  address: string;
  valuesCompared: string[];
  matchRule: string;
  benignExplanations: string;
  recordsNeeded: string;
  reviewStatus: "not reviewed" | "reviewed" | "cleared";
};

export type NpiMatch = {
  npi: string | null;
  confidence: "high" | "medium" | "ambiguous" | "unmatched";
  score: number;
  reasons: string[];
  orgName: string | null;
  rawAddress: string | null;
  cleanAddress: string | null;
  zipCode: string | null;
  phone: string | null;
  enumerationDate: string | null;
};

export type ProviderDirectoryEntry = {
  dftaId: string;
  programName: string;
  sponsorName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  borough: string;
  phone: string;
  funded: boolean;
  bin: string;
  bbl: string;
  latitude: number | null;
  longitude: number | null;
  npiMatch: NpiMatch;
  flags: ProviderFlag[];
  relatedFacilityCount: number;
};

export type ProviderDirectoryData = {
  providers: ProviderDirectoryEntry[];
  source: "live-public-data" | "demo-fallback";
  retrievedAt: string;
  registryCount: number;
  nppesCount: number;
  exclusionCount: number;
};

export type ProviderDirectoryListEntry = Pick<
  ProviderDirectoryEntry,
  | "dftaId"
  | "programName"
  | "sponsorName"
  | "address"
  | "zipCode"
  | "borough"
  | "phone"
> & {
  npiMatch: Pick<NpiMatch, "npi" | "confidence">;
  flags: Array<Pick<ProviderFlag, "id" | "label" | "severity">>;
};

export type ProviderDirectoryListData = Omit<
  ProviderDirectoryData,
  "providers"
> & {
  providers: ProviderDirectoryListEntry[];
};

export type PropertyRecord = {
  address: string;
  ownerName: string;
  buildingClass: string;
  buildingArea: number | null;
  commercialArea: number | null;
  floors: number | null;
  residentialUnits: number | null;
  totalUnits: number | null;
  yearBuilt: number | null;
};

export type CertificateMetadata = {
  currentFilingCount: number;
  historicalCertificateCount: number;
  latestIssueDate: string | null;
  statuses: string[];
};

export type ProviderDossier = ProviderDirectoryEntry & {
  relatedFacilities: ProviderDirectoryEntry[];
  property: PropertyRecord | null;
  certificateMetadata: CertificateMetadata | null;
  dataSource: ProviderDirectoryData["source"];
  retrievedAt: string;
};
