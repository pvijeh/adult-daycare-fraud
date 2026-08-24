export type DensityRow = {
  zcta: string;
  totalPopulation: number;
  seniorPopulation: number;
  providerCount: number;
  providersPerThousandSeniors: number | null;
};

export type NetworkNodeType = "provider" | "official" | "phone" | "address";

export type NetworkNode = {
  id: string;
  label: string;
  type: NetworkNodeType;
};

export type NetworkEdge = {
  source: string;
  target: string;
  relationship: string;
};

export type NetworkCluster = {
  clusterId: string;
  providerCount: number;
  nodeCount: number;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
};

export type SpatialOutlier = {
  cleanAddress: string;
  zipCode: string;
  providerCount: number;
  providerNpis: string;
  buildingArea: number;
  commercialArea: number;
  buildingClass: string;
  ownerName: string;
};

export type DashboardMeta = {
  source: "database" | "demo" | "demo-fallback";
  completedAt: string | null;
  usedMock: boolean;
  providerCount: number;
  parcelCount: number;
};

export type DashboardData = {
  density: DensityRow[];
  clusters: NetworkCluster[];
  outliers: SpatialOutlier[];
  meta: DashboardMeta;
};
