import Dashboard from "@/components/Dashboard";
import { getDashboardData } from "@/lib/data";


export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getDashboardData();
  return <Dashboard data={data} />;
}
