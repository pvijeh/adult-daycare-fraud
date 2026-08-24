import "server-only";

import { cache } from "react";
import { Pool, type QueryResultRow } from "pg";

import { demoData } from "@/lib/demo-data";
import type {
  DashboardData,
  DensityRow,
  NetworkCluster,
  NetworkEdge,
  NetworkNode,
  SpatialOutlier,
} from "@/lib/types";

const globalForDatabase = globalThis as unknown as { sadcPool?: Pool };

type RawNetworkCluster = {
  cluster_id: string;
  provider_count: number;
  node_count: number;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
};

function getPool(): Pool {
  if (!globalForDatabase.sadcPool) {
    globalForDatabase.sadcPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globalForDatabase.sadcPool;
}

async function queryRows<T extends QueryResultRow>(
  sql: string,
): Promise<T[]> {
  const result = await getPool().query<T>(sql);
  return result.rows;
}

export const getDashboardData = cache(async (): Promise<DashboardData> => {
  if (!process.env.DATABASE_URL) {
    return demoData;
  }

  try {
    const [densityRows, clusterRows, outlierRows, runRows] = await Promise.all([
      queryRows<{
        zcta: string;
        total_population: number;
        senior_pop_65_plus: number;
        total_adc_providers: number;
        adc_per_1000_seniors: string | null;
      }>(`
        SELECT *
        FROM v_zip_density_analysis
        WHERE zcta BETWEEN '10000' AND '11699'
        ORDER BY adc_per_1000_seniors DESC NULLS LAST
        LIMIT 100
      `),
      queryRows<{
        payload: RawNetworkCluster;
      }>(`
        SELECT payload
        FROM network_clusters
        ORDER BY provider_count DESC, cluster_id
        LIMIT 50
      `),
      queryRows<{
        clean_address: string;
        zip_code: string;
        provider_count: number;
        provider_npis: string;
        bldg_area: number;
        com_area: number;
        bldg_class: string;
        owner_name: string;
      }>(`
        SELECT *
        FROM v_spatial_outliers
        ORDER BY provider_count DESC, com_area ASC NULLS FIRST
        LIMIT 100
      `),
      queryRows<{
        completed_at: Date;
        used_mock: boolean;
        provider_count: number;
        parcel_count: number;
      }>(`
        SELECT completed_at, used_mock, provider_count, parcel_count
        FROM pipeline_runs
        WHERE status = 'success'
        ORDER BY completed_at DESC
        LIMIT 1
      `),
    ]);

    const density: DensityRow[] = densityRows.map((row) => ({
      zcta: row.zcta,
      totalPopulation: Number(row.total_population),
      seniorPopulation: Number(row.senior_pop_65_plus),
      providerCount: Number(row.total_adc_providers),
      providersPerThousandSeniors:
        row.adc_per_1000_seniors === null
          ? null
          : Number(row.adc_per_1000_seniors),
    }));
    const outliers: SpatialOutlier[] = outlierRows.map((row) => ({
      cleanAddress: row.clean_address,
      zipCode: row.zip_code,
      providerCount: Number(row.provider_count),
      providerNpis: row.provider_npis,
      buildingArea: Number(row.bldg_area),
      commercialArea: Number(row.com_area),
      buildingClass: row.bldg_class,
      ownerName: row.owner_name,
    }));
    const latestRun = runRows[0];

    return {
      density,
      clusters: clusterRows.map(
        (row): NetworkCluster => ({
          clusterId: row.payload.cluster_id,
          providerCount: Number(row.payload.provider_count),
          nodeCount: Number(row.payload.node_count),
          nodes: row.payload.nodes,
          edges: row.payload.edges,
        }),
      ),
      outliers,
      meta: {
        source: "database",
        completedAt: latestRun?.completed_at.toISOString() ?? null,
        usedMock: latestRun?.used_mock ?? false,
        providerCount: latestRun?.provider_count ?? 0,
        parcelCount: latestRun?.parcel_count ?? 0,
      },
    };
  } catch (error) {
    console.error("Dashboard database query failed; using demo data.", error);
    return {
      ...demoData,
      meta: { ...demoData.meta, source: "demo-fallback" },
    };
  }
});
