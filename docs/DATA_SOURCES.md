# NYC Social Adult Day Care Data Sources

Last reviewed: August 2026

This document inventories the data sources that can support an audit of New
York City Social Adult Day Care (SADC) providers. It records what each source
contains, how it can be accessed, how it can be joined to other records, and
how suitable it is for detecting or corroborating possible fraud.

## How to read the suitability annotations

No public dataset, by itself, establishes that a provider committed fraud.
Fraud generally requires evidence about intent, services actually delivered,
participants, claims, money flows, or an official adjudication. The
annotations below use these categories:

| Suitability | Meaning |
| --- | --- |
| **Official outcome** | Can establish that an agency or court took a specific action, made a finding, accepted a plea, or entered a judgment. It applies only to the named parties, dates, conduct, and disposition in that record. |
| **Strong corroboration** | Can materially corroborate a provider-level allegation when identity and dates are verified, but normally cannot establish intent or fraud alone. |
| **Lead-generating** | Can identify inconsistencies, unusual patterns, or records worth requesting. It should not be described as evidence of fraud without stronger records. |
| **Context only** | Describes a neighborhood, market, property, plan, or industry condition that should not be attributed to a named provider. |
| **Unsuitable** | Coverage, attribution, or bias problems make the source inappropriate for provider-level fraud detection. |

Availability is described as:

- **Open API** — machine-readable and available without a records request.
- **Open download** — public bulk file, spreadsheet, PDF, or Parquet file.
- **Public lookup** — searchable online, but not necessarily exposed through a
  documented API.
- **Manual public records** — public documents that require human collection
  and review.
- **FOIL** — records that should be requested under New York's Freedom of
  Information Law.
- **Restricted** — claims, encounter, participant, or investigative records
  that may not be publicly releasable.

## Source map

| Domain | Best current source | Project status | Fraud-detection suitability |
| --- | --- | --- | --- |
| Current SADC universe | NYC Aging registered SADC dataset | Integrated | Lead-generating identity spine |
| Historical operating list | NYC Aging Local Law 9 annual reports | Researched; not integrated | Strong for dated registration history |
| NPI identity | NPPES | Integrated | Lead-generating |
| Medicaid enrollment | NYS Medicaid Enrolled Provider Listing | Researched; not integrated | Strong corroboration |
| Medicaid activity | HHS Medicaid Provider Spending by HCPCS | Researched; not integrated | Strong corroboration with attribution limits |
| MLTC network history | NYS Provider Network Data System | Researched; not integrated | Strong corroboration |
| State exclusions | OMIG Medicaid exclusions | Integrated | Official outcome |
| Federal exclusions | HHS-OIG LEIE | Planned | Official outcome |
| SADC certification | OMIG certification submissions | Form public; submissions unavailable | Strong corroboration if obtained |
| Food-service inspections | NYC Health SADC inspection portal | Researched; not integrated | Compliance context; weak fraud signal |
| Summonses and hearings | OATH case-status data | Researched; not integrated | Official procedural/outcome record |
| Property facts | PLUTO | Integrated | Lead-generating |
| Occupancy records | DOB NOW and historical certificates of occupancy | Integrated as metadata | Strong compliance corroboration with document review |
| Corporate identity | NYS Department of State corporation records | Planned | Lead-generating |
| Demographics | American Community Survey | Integrated | Context only |
| Facility capacity | NYC Aging / plan records | FOIL needed | Strong corroboration when paired with claims and premises records |
| Claims and encounters | NY Medicaid / MLTC plans | Restricted or FOIL | Highest-value fraud evidence if legally obtainable |
| Complaints and investigations | NYC Aging, DOH, OMIG | FOIL or restricted | Strong corroboration; disposition is essential |

## 1. Facility identity and registration

### NYC Aging registered SADC dataset

- **Publisher:** New York City Department for the Aging, also known as NYC
  Aging.
- **Access:** [NYC Open Data dataset](https://data.cityofnewyork.us/City-Government/Department-for-the-Aging-NYC-Aging-Social-Adult-Da/32cj-z7va)
  and [Socrata API](https://data.cityofnewyork.us/resource/32cj-z7va.json).
- **Availability:** Open API.
- **Project status:** Integrated as the canonical current facility universe.
- **Unit:** One current registered facility/location.
- **Important fields:** DFTA ID, program name, sponsor name, program address,
  borough, ZIP, phone, funded status, hours, latitude/longitude, BIN, BBL, and
  neighborhood fields.
- **Snapshot observed during research:** 359 facilities, 359 unique DFTA IDs,
  358 normalized addresses, 318 records with BIN/BBL, and 320 with
  coordinates.
- **Useful joins:** DFTA ID; exact sponsor name; normalized phone; normalized
  address; BIN; BBL; latitude/longitude.
- **What it can show:** Which facilities currently appear in the city's
  registry, their stated operator/sponsor, and their stated location.
- **Fraud-detection suitability:** **Lead-generating.** It is the best current
  denominator and identity spine, but registration is not a license,
  certification, quality finding, Medicaid enrollment, or proof that the
  facility is operating.
- **Major limitations:** NYC Aging warns that the data may be incomplete,
  inaccurate, or out of date. A missing facility may reflect stale data,
  delayed updates, a closed program, a medical-model adult day program outside
  the registry's scope, or an actual registration issue.
- **Publication rule:** Say "listed in the NYC Aging registry" or "not found in
  the retrieved registry," never "licensed," "unlicensed," "open," or "closed"
  without another source.

### NYC Aging Local Law 9 annual reports and attached facility lists

- **Publisher:** NYC Aging SADC Ombuds Office.
- **Access:** Manual public PDF downloads from the
  [NYC Government Publications Portal](https://a860-gpp.nyc.gov/).
  Verified examples:
  - [2020 SADC list](https://a860-gpp.nyc.gov/downloads/sq87bw46r)
  - [2022 annual report](https://a860-gpp.nyc.gov/downloads/wp988n93m)
  - [2023 annual report](https://a860-gpp.nyc.gov/downloads/g445ch56q)
  - [2024 annual report](https://a860-gpp.nyc.gov/downloads/mg74qr14c)
- **Availability:** Open download; PDF extraction required.
- **Project status:** High-priority planned source.
- **Unit:** Facility as of the report's stated date; annual reports also contain
  citywide complaint totals and categories.
- **Useful joins:** Program name, raw address, separately preserved
  floor/suite, borough, ZIP, council district, and community district.
- **What it can show:** Year-by-year appearance, disappearance, relocation,
  operator-name changes, and the exact floor/suite listed at a point in time.
- **Fraud-detection suitability:** **Strong for dated registration history;
  lead-generating for fraud.** A facility disappearing from one list does not
  prove deregistration, closure, termination, or wrongdoing.
- **Major limitations:** PDF schemas differ by year. Historical linkage is
  vulnerable to rebrands and address formatting changes. Aggregate complaint
  counts cannot be assigned to individual facilities.
- **Quality gate:** Preserve floor/suite as a separate field. Validate each
  parse against the facility count stated in the report narrative and fail a
  run when the count materially differs.

### NYC Aging registration history, complaints, and dispositions

- **Publisher:** NYC Aging SADC Ombuds Office.
- **Access:** FOIL.
- **Availability:** FOIL; some complaint information may be redacted.
- **Project status:** Deferred until records requests are authorized.
- **Records to request:** Initial registration date, amendments, inactive or
  cessation notices, re-registration, complaint date/category, investigation
  status, disposition, corrective action, notice of violation, and facility
  identity fields.
- **What it can show:** Whether a provider was registered during a specific
  operating period and whether complaints were substantiated, unresolved, or
  closed without a finding.
- **Fraud-detection suitability:** **Strong corroboration**, especially for
  dated status and substantiated complaint outcomes.
- **Major limitations:** Complaints are allegations unless and until a source
  states a finding or disposition. Complaint volume is also affected by
  awareness, language access, and reporting behavior.

## 2. Provider identity, enrollment, and network participation

### National Plan and Provider Enumeration System (NPPES)

- **Publisher:** Centers for Medicare & Medicaid Services.
- **Access:** [NPI Registry API](https://npiregistry.cms.hhs.gov/api-page) and
  [monthly bulk files](https://download.cms.gov/nppes/NPI_Files.html).
- **Availability:** Open API and open download.
- **Project status:** API integrated; bulk file not integrated.
- **Unit:** NPI record. Relevant taxonomy:
  `261QA0600X — Clinic/Center, Adult Day Care`.
- **Important fields:** NPI, organization name, authorized official, practice
  and mailing addresses, phone, taxonomy, enumeration date, and update date.
- **Useful joins:** Exact NPI; exact normalized legal name; address; phone.
- **What it can show:** The identity and contact information associated with an
  NPI and whether an adult-day-care taxonomy is present.
- **Fraud-detection suitability:** **Lead-generating.** Address, phone, and
  authorized-official reuse can identify relationships or stale records.
- **Major limitations:** NPI issuance is not licensure, certification, Medicaid
  enrollment, network participation, service delivery, or operating status.
  NPPES data is self-reported and can lag business changes. API searches may
  not return the full historical universe.
- **Publication rule:** Describe a result as an "NPPES identity record" or
  "reconciled NPI candidate." Do not describe an active NPI as an active
  facility.

### NYS Medicaid Enrolled Provider Listing

- **Publisher:** New York State Department of Health.
- **Access:** [Health Data NY dataset](https://health.data.ny.gov/Health/Medicaid-Enrolled-Provider-Listing/keti-qx5t)
  and Socrata API.
- **Availability:** Open API and download; snapshot data.
- **Project status:** Researched; not integrated.
- **Unit:** Medicaid provider enrollment record.
- **Important fields:** MMIS ID, NPI, name, Medicaid type, profession/service,
  specialty, service address, phone, enrollment begin date, anticipated
  revalidation date, and file update date.
- **Useful joins:** NPI and MMIS ID first; exact name/address as secondary
  corroboration.
- **What it can show:** Whether a provider appears in the public enrollment
  snapshot and the enrollment category reported.
- **Fraud-detection suitability:** **Strong corroboration** for identity and
  enrollment-period questions.
- **Major limitations:** A snapshot is not a complete history. `MCO` means
  Managed Care Only and does not imply fee-for-service billing authority.
  Absence from the current file does not, by itself, establish that a provider
  was unenrolled during an earlier period.

### Provider Network Data System (PNDS)

- **Publisher:** New York State Department of Health.
- **Access:** Quarterly Provider Network Data datasets in the
  [Health Data NY catalog](https://health.data.ny.gov/). Each quarter may have
  a separate dataset, such as
  [Provider Network Data: 2024 Quarter 2](https://health.data.ny.gov/Health/Provider-Network-Data-2024-Quarter-2/2dv5-pfwk).
- **Availability:** Open API/download, but assembling history requires
  collecting many quarter-specific datasets and adapting schema changes.
- **Project status:** Researched; not integrated.
- **Unit:** Plan/provider/location observation for a reporting quarter.
- **Important fields:** Plan, line of business, provider type, organization,
  NPI, address, county, and quarter.
- **Research coverage:** 27 archive-level periods were located from 2019 Q1
  through 2025 Q3. The compiled SADC observations contained 48,456 NYC rows and
  4,373 NPI/address/plan spans; one quarter had no identified SADC rows.
- **What it can show:** Whether a plan reported an NPI/location in its network
  in a specific quarter and whether the same NPI appeared at multiple
  addresses.
- **Fraud-detection suitability:** **Strong corroboration** for network and
  identity timelines.
- **Major limitations:** Presence does not prove service delivery. Absence may
  reflect reporting errors, schema changes, taxonomy changes, single-case
  agreements, or extraction mistakes. A network observation is not the same as
  a contract effective date or termination reason.
- **Effective-date warning:** Site-level NPI requirements in
  [MLTC Policy 25.05](https://www.health.ny.gov/health_care/medicaid/redesign/mrt90/mltc_policy/2025/25-05.htm)
  apply prospectively. Historical multi-location NPI use must not be labeled a
  violation without checking the rule and date that governed the period.

### MLTC plan directories, contracts, and termination records

- **Publisher:** Individual Managed Long Term Care plans and NYS Department of
  Health.
- **Access:** Public plan directories where available; contracts, evaluation
  records, single-case agreements, termination dates, and reasons generally
  require FOIL or plan records.
- **Availability:** Fragmented public lookup plus FOIL/restricted records.
- **Project status:** Not integrated.
- **What it can show:** The actual contractual and oversight relationship
  between an MLTC plan and a specific SADC site.
- **Fraud-detection suitability:** **Strong corroboration** for claims or
  network activity alleged to occur outside an authorized period.
- **Major limitations:** Public directories change and are not reliable
  historical archives. A termination may be administrative and is not a fraud
  finding.

### OMIG SADC certification

- **Publisher:** New York State Office of the Medicaid Inspector General.
- **Access:** The
  [public certification form](https://apps.omig.ny.gov/sadc/sadccertification.aspx)
  is available online; a complete downloadable list of submissions and status
  history was not identified.
- **Availability:** Form is public; provider-level submission history is FOIL
  or otherwise unavailable.
- **Project status:** Not integrated.
- **Unit:** The form states that a separate certification is required for each
  location.
- **What it can show if obtained:** The site, NPI, MLTC relationships, answers
  certified by the provider, certificate-of-occupancy representation, and
  submission date.
- **Fraud-detection suitability:** **Strong corroboration** because the record
  can be compared with independently observed facts and dated activity.
- **Major limitations:** The form's existence does not reveal which providers
  submitted it or whether an agency validated each answer.

## 3. Medicaid activity and financial evidence

### HHS Medicaid Provider Spending by HCPCS

- **Publisher:** U.S. Department of Health and Human Services.
- **Access:** [HHS Open Data](https://opendata.hhs.gov/) bulk Parquet/download.
- **Availability:** Open download.
- **Project status:** Researched; not integrated.
- **Coverage:** January 2018 through December 2024 in the February 2026
  release.
- **Unit:** Billing NPI × servicing NPI × HCPCS code × claim month.
- **Relevant codes:** `S5105` for social adult day care and `S5102` for adult
  day health care.
- **Important measures:** Aggregated beneficiaries/patients, claim lines, and
  total paid.
- **Research snapshot:** The nationwide `S5105` subset contained 21,617 rows,
  495 billing NPIs, and about $1.685 billion paid. A conservative subset of
  accepted NPIs contained 9,391 provider-month rows, 172 NPIs, and about
  $790.4 million paid.
- **What it can show:** Dated Medicaid activity associated with billing and
  servicing NPIs; abrupt changes; unusually high volume; billing-versus-
  servicing relationships; activity before or after independently verified
  events.
- **Fraud-detection suitability:** **Strong corroboration**, but not proof.
- **Major limitations:** It is aggregated, not claim-level. Monthly patient
  totals are not unique people across months. Billing and servicing roles can
  double-count a row if summed incorrectly. An NPI can represent more than one
  site, and managed-care encounter data quality varies. Spending cannot be
  assigned to a facility unless site identity is independently established.
- **Publication rule:** Say "Medicaid activity associated with NPI X in the HHS
  aggregate," not "facility X billed" unless the facility/NPI relationship is
  verified for that period.

### Claim-level Medicaid and MLTC encounter records

- **Publisher/custodian:** NYS Department of Health, OMIG, and MLTC plans.
- **Access:** Restricted; possibly obtainable in de-identified or aggregated
  form through FOIL, litigation records, audits, or authorized investigative
  access.
- **Availability:** Restricted.
- **Project status:** Unavailable.
- **Records of interest:** Service date, place of service, billing and
  servicing NPI, facility/site identifier, HCPCS, units, paid amount, encounter
  status, reversal/adjustment, plan, and participant-level attendance linkage
  under appropriate privacy controls.
- **What it can show:** Duplicate or overlapping services, billing outside an
  authorized period, impossible utilization, services not supported by
  attendance, and money flows.
- **Fraud-detection suitability:** **Highest-value direct investigative
  evidence**, but intent and service reality still require corroboration.
- **Major limitations:** Protected health information, data-use restrictions,
  incomplete encounter submissions, adjustments, and complex payment rules.
  This project should not collect identifiable participant data.

### Public audits, court cases, and enforcement releases

- **Publishers:** OMIG, NYS Office of the State Comptroller, New York Attorney
  General Medicaid Fraud Control Unit, U.S. Department of Justice, and courts.
- **Access:** Manual public records and press releases; underlying dockets may
  require PACER, NYSCEF, or a records request.
- **Availability:** Manual public records.
- **Project status:** Researched case-by-case; not systematically integrated.
- **Examples:** DOJ has described SADC cases involving alleged or admitted
  kickbacks, participant recruitment, services not provided, and laundering
  through related entities, including the
  [Happy Family guilty plea](https://www.justice.gov/opa/pr/leader-68m-adult-day-care-fraud-scheme-pleads-guilty)
  and a separate
  [2026 complaint involving adult day care and pharmacy claims](https://www.justice.gov/opa/pr/two-queens-men-charged-120m-adult-day-care-and-pharmacy-fraud-medicare-and-medicaid).
- **What it can show:** Allegations, pleas, judgments, exclusions, settlements,
  audit findings, and the conduct described by the issuing authority.
- **Fraud-detection suitability:** **Official outcome** for final dispositions;
  **allegation** for complaints, indictments, and unresolved charges.
- **Major limitations:** A press release is not a substitute for the charging
  document, plea, judgment, or audit. Findings cannot be generalized to other
  providers with similar business structures.

## 4. Enforcement, exclusions, inspections, and hearings

### OMIG Medicaid exclusions

- **Publisher:** New York State Office of the Medicaid Inspector General.
- **Access:** [Exclusions page](https://omig.ny.gov/medicaid-fraud/medicaid-exclusions) and
  [tab-delimited list](https://apps.omig.ny.gov/exclusions/tabdelimited.aspx).
- **Availability:** Open download.
- **Project status:** Integrated using exact NPI and exact normalized entity
  matching.
- **Unit:** Excluded individual or entity.
- **Research snapshot:** 9,023 rows were observed; three current NYC Aging
  facilities had exact entity-name and/or NPI matches.
- **What it can show:** That the named individual or entity was excluded
  effective on a stated date.
- **Fraud-detection suitability:** **Official outcome.**
- **Major limitations:** Exclusion scope, affiliates, locations, and historical
  conduct cannot be inferred. Reinstatement must be handled as an effective
  date interval. Common-name matches are dangerous.
- **Publication rule:** Require an exact NPI or a corroborated legal-entity
  match, verify reinstatement status, and human-review every match.

### HHS-OIG List of Excluded Individuals/Entities (LEIE)

- **Publisher:** U.S. Department of Health and Human Services Office of
  Inspector General.
- **Access:** [LEIE downloads and lookup](https://oig.hhs.gov/exclusions/exclusions_list.asp).
- **Availability:** Open monthly download and public lookup.
- **Project status:** Planned.
- **What it can show:** Federal health-program exclusion status.
- **Fraud-detection suitability:** **Official outcome.**
- **Major limitations:** State and federal exclusions are separate. Name-only
  matches require identifiers and human review.

### NYC Health SADC food-service inspections

- **Publisher:** NYC Department of Health and Mental Hygiene.
- **Access:** [Senior Center and SADC inspection search](https://www.nyc.gov/site/doh/health/health-topics/senior-and-social-adult-day-care-food-service-inspection-results.page).
  The page calls an internal reporting endpoint, but no stable public data
  contract is documented.
- **Availability:** Public lookup; programmatic access is fragile.
- **Project status:** Researched; not integrated.
- **Unit:** Food-service entity, inspection date, and violation row.
- **Research snapshot:** 400 SADC entities, 1,186 unique entity/date pairs, and
  2,751 violation rows were observed. High/medium-confidence facility matching
  was possible for 278 of 359 NYC Aging facilities.
- **What it can show:** Food preparation, storage, and service violations found
  during an inspection.
- **Fraud-detection suitability:** **Compliance context; weak fraud signal.**
- **Major limitations:** It concerns food safety, not Medicaid billing. Entity
  names may not include usable addresses. Shared owner names and ZIPs can cause
  false attribution. A critical food violation is not evidence of fraud.

### OATH Hearings Division Case Status

- **Publisher:** NYC Office of Administrative Trials and Hearings.
- **Access:** [NYC Open Data dataset](https://data.cityofnewyork.us/City-Government/OATH-Hearings-Division-Case-Status/jz4z-kudi)
  and Socrata API.
- **Availability:** Open API/download.
- **Project status:** Researched; not integrated.
- **Unit:** Summons/hearing case.
- **Research snapshot:** Registry-BBL candidate searches returned 14,332 rows;
  only 3,248 had exact normalized violation-address matches, 77 had exact
  respondent-name matches, and 39 had both.
- **What it can show:** The summons, respondent, charge, hearing status, and
  disposition reported in the case record.
- **Fraud-detection suitability:** **Official procedural/outcome record** for
  the cited violation; generally **weak for Medicaid fraud**.
- **Major limitations:** Multiple addresses can share a tax lot. BBL-only
  attribution is unsafe. Require exact address, unit/floor, respondent, date,
  and operating-period alignment. Distinguish allegation, default, dismissal,
  settlement, and sustained finding.

## 5. Property, premises, and corporate records

### PLUTO and MapPLUTO

- **Publisher:** NYC Department of City Planning.
- **Access:** [PLUTO on NYC Open Data](https://data.cityofnewyork.us/Housing-Development/Primary-Land-Use-Tax-Lot-Output-PLUTO-/64uk-42ks)
  and DCP bulk releases.
- **Availability:** Open API/download.
- **Project status:** PLUTO attributes integrated; MapPLUTO geometry not yet
  integrated.
- **Unit:** Tax lot.
- **Important fields:** BBL, building and commercial area, building class,
  land use, floors, units, year built, and owner name.
- **What it can show:** Lot-level physical context and property ownership as
  recorded in PLUTO.
- **Fraud-detection suitability:** **Lead-generating.**
- **Major limitations:** PLUTO describes the whole lot, not the square footage
  leased by a facility. Owner name is not the SADC operator. Building class is
  not a certificate of occupancy. Never divide lot-level commercial area by
  participants and present the result as facility space without premises-level
  records.

### NYC GeoSupport

- **Publisher:** NYC Department of City Planning.
- **Access:** NYC GeoSupport desktop/data products and supported wrappers.
- **Availability:** Public tooling; local setup and versioned data required.
- **Project status:** Planned.
- **What it can show:** Deterministic address-to-BBL/BIN/geographic coding and
  standardized address components.
- **Fraud-detection suitability:** **Infrastructure, not evidence.**
- **Major limitations:** Geocoding confidence and rejected addresses must be
  retained. A guessed BBL creates false property, violation, and ownership
  matches.

### DOB certificates of occupancy

- **Publisher:** NYC Department of Buildings.
- **Access:** [DOB NOW Certificate of Occupancy dataset](https://data.cityofnewyork.us/Housing-Development/DOB-NOW-Certificate-of-Occupancy/pkdm-hqz6),
  historical NYC Open Data/BIS datasets, and document lookup.
- **Availability:** Open API plus public documents.
- **Project status:** Metadata integrated; occupancy schedule/document parsing
  not integrated.
- **Unit:** Certificate filing or issued certificate associated with BIN/BBL.
- **Research coverage:** Of 313 unique registry BINs, 127 had current metadata,
  151 had historical metadata, and 212 had at least one of the two.
- **What it can show:** Certificate existence, type, status, and issue dates;
  underlying documents may show legal use and occupancy by floor.
- **Fraud-detection suitability:** **Strong compliance corroboration** after
  document-level review.
- **Major limitations:** Structured metadata does not reliably expose the full
  occupancy schedule, legal use, maximum occupancy, or SADC-specific capacity.
  The governing requirement and effective date must be cited before calling a
  mismatch a compliance concern.

### DOB violations, complaints, and job filings

- **Publisher:** NYC Department of Buildings.
- **Access:** Multiple NYC Open Data datasets and DOB NOW/BIS lookups.
- **Availability:** Open API/public lookup; schemas are fragmented.
- **Project status:** Planned.
- **What it can show:** Building complaints, violations, work permits, changes
  of use, and construction activity.
- **Fraud-detection suitability:** **Compliance context or strong corroboration**
  when a case is precisely attributed and relevant to operation.
- **Major limitations:** Most records concern the property or owner, not the
  SADC. A violation at the same BBL may involve another tenant or floor.

### NYS Department of State active corporations

- **Publisher:** New York State Department of State.
- **Access:** [Active Corporations dataset](https://data.ny.gov/Economic-Development/Active-Corporations-Beginning-1800/n9v6-gdp6),
  [bulk CSV](https://data.ny.gov/api/views/n9v6-gdp6/rows.csv?accessType=DOWNLOAD),
  and Socrata API.
- **Availability:** Open API/download.
- **Project status:** Planned.
- **Important fields:** DOS ID, entity name/type, jurisdiction, filing date,
  county, process address, chief executive, and registered agent.
- **What it can show:** Legal-entity identity, filing date, process address,
  and shared officers/agents among active corporations.
- **Fraud-detection suitability:** **Lead-generating.**
- **Major limitations:** The open dataset contains active entities and is not a
  complete dissolved-entity history. Commercial registered agents connect
  unrelated businesses. Natural-person names should not be fuzzily linked or
  published without review.

### Historical corporate filings

- **Publisher:** New York State Department of State.
- **Access:** Entity lookup, purchased documents, or FOIL.
- **Availability:** Manual/FOIL.
- **Project status:** Not integrated.
- **What it can show:** Dissolutions, former names, historical addresses,
  mergers, and prior officers.
- **Fraud-detection suitability:** **Strong identity corroboration** and
  lead-generating network history.
- **Major limitations:** Entity churn is not inherently suspicious. Ordinary
  reorganization, lease changes, acquisitions, and naming changes are common.

### ACRIS property transactions

- **Publisher:** NYC Department of Finance.
- **Access:** ACRIS public lookup and NYC Open Data tables.
- **Availability:** Open API/public lookup.
- **Project status:** Not integrated.
- **What it can show:** Deeds, mortgages, parties, and transaction dates for
  many NYC properties.
- **Fraud-detection suitability:** **Lead-generating financial/property
  context.**
- **Major limitations:** It usually concerns the property owner, not the SADC
  tenant. Party names need careful entity resolution.

### IRS nonprofit filings

- **Publisher:** Internal Revenue Service; third-party mirrors can improve
  usability.
- **Access:** IRS Tax Exempt Organization Search and Form 990 bulk data.
- **Availability:** Open download/public lookup for tax-exempt entities.
- **Project status:** Not integrated.
- **What it can show:** Nonprofit status, officers, revenue, related
  organizations, grants, and major contractor disclosures.
- **Fraud-detection suitability:** **Lead-generating.**
- **Major limitations:** Only relevant to nonprofit operators, filings lag,
  accounting categories are broad, and financial scale is not proof of
  improper conduct.

## 6. Demographic and geographic context

### American Community Survey

- **Publisher:** U.S. Census Bureau.
- **Access:** [ACS 5-year API](https://www.census.gov/data/developers/data-sets/acs-5year.html)
  and official bulk summary files.
- **Availability:** Open API/download; annual releases.
- **Project status:** Integrated at ZCTA level.
- **Important measures:** Total population, age 65+, disability, poverty,
  language, household characteristics, and other area-level measures.
- **What it can show:** The potential service population and neighborhood
  context.
- **Fraud-detection suitability:** **Context only.**
- **Major limitations:** ZCTAs are not service areas. Population is not
  enrollment or demand. Demographics can encode race, ethnicity, immigration,
  language, and poverty; using them in provider risk scores can create
  discriminatory rankings.
- **Publication rule:** Keep demographics in clearly labeled area context and
  bias audits. Do not use them as provider-level suspicion features.

### MODZCTA boundaries

- **Publisher:** NYC Department of Health and Mental Hygiene.
- **Access:** [NYC Open Data](https://data.cityofnewyork.us/Business/Modified-Zip-Code-Tabulation-Areas-MODZCTA-/pri4-ifjk).
- **Availability:** Open API/download.
- **Project status:** Integrated for map geometry.
- **What it can show:** Approximate geographic boundaries for ZIP-level
  visualization.
- **Fraud-detection suitability:** **Context only.**
- **Major limitations:** Geometry does not establish facility catchment,
  participant residence, or market share.

### MLTC performance data

- **Publisher:** New York State Department of Health.
- **Access:** [Managed Long-Term Care Performance Data](https://health.data.ny.gov/Health/Managed-Long-Term-Care-Performance-Data-Beginni/cmqt-68bp).
- **Availability:** Open API/download.
- **Project status:** Not integrated.
- **Unit:** Plan-level performance and enrollment context.
- **Fraud-detection suitability:** **Context only.**
- **Major limitations:** It is plan-level and cannot be allocated to individual
  facilities. Any derived facility-level dollar, utilization, or outcome
  estimate would be fabricated.

## 7. Sources that should not be used as fraud signals

### Web presence, social media, and online reviews

- **Availability:** Public but unstable, platform-dependent, and difficult to
  archive reproducibly.
- **Fraud-detection suitability:** **Unsuitable.**
- **Reason:** Small immigrant-serving and community businesses may have little
  English-language web presence or few reviews. "Digital thinness" is a proxy
  for language, age, resources, and community marketing practices. Reviews are
  gameable and do not establish service delivery or billing.
- **Permitted use:** Locating a public phone number or archived business name
  for manual research, never as a scored or published suspicion signal.

### Neighborhood saturation attributed to a named provider

- **Availability:** Derivable from registry counts and Census denominators.
- **Fraud-detection suitability:** **Unsuitable as a provider attribute;
  context only.**
- **Reason:** Facilities per senior resident is primarily a property of the
  area and other operators' decisions. It can motivate market-level reporting
  but should not increase a named provider's risk or priority score.

### Property-owner and commercial-agent networks

- **Availability:** Public.
- **Fraud-detection suitability:** **Unsuitable unless direct control is
  established.**
- **Reason:** A landlord can lease to unrelated SADCs, and a commercial
  registered agent can represent thousands of unrelated corporations.

## 8. Highest-value records that remain unavailable

| Record | Why it matters | Likely access | Safe public interpretation |
| --- | --- | --- | --- |
| Registered capacity by site and effective date | Allows premises-level capacity checks and comparison with claims/attendance | NYC Aging or plan FOIL | Capacity discrepancy, not fraud |
| Registration and cessation history | Establishes whether a site was listed during an activity period | NYC Aging FOIL | Dated registration status |
| SADC certification submissions and amendments | Establishes site representations, NPI, CoO, and plan relationships | OMIG FOIL | Certified representation versus observed record |
| MLTC contracts, evaluations, remediation, and termination | Establishes authorization and oversight periods | DOH/plan FOIL | Network/compliance timeline |
| Site-level claims and encounters | Establishes service dates, billing/service NPIs, units, and paid amounts | Restricted/DOH/OMIG | Activity; fraud only with stronger proof |
| Attendance and transportation logs | Helps test whether services occurred | Restricted; investigative records | Corroboration under privacy controls |
| Facility complaints and dispositions | Distinguishes allegations from substantiated findings | NYC Aging/DOH FOIL | Allegation or finding, accurately labeled |
| Historical corporate filings | Resolves dissolved entities and ownership changes | DOS lookup/FOIL | Entity history |
| Detailed certificate-of-occupancy schedules | Establishes legal use and floor-level occupancy | DOB documents/FOIL | Compliance fact with rule/date |

## 9. Minimum publication standard

A provider-level statement should not be published unless the project records:

1. The exact source URL or document.
2. Source record identifier.
3. Retrieval date and source effective/as-of date.
4. Facility, legal entity, NPI, address, and floor/suite used in the match.
5. Matching rule and confidence.
6. The values compared and calculation performed.
7. A plausible benign explanation.
8. Records needed to confirm or disprove the observation.
9. Human-review status.
10. Accurate disposition language: allegation, pending case, dismissal,
    settlement, finding, plea, judgment, exclusion, or unresolved discrepancy.

The public product should display independently verifiable observations, not a
composite fraud score. Internal prioritization, if ever implemented, should be
kept outside the public application and should never replace source review.
