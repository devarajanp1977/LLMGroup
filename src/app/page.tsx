import { AtriumDashboard } from "@/components/atrium-dashboard";
import { LoginPanel } from "@/components/login-panel";
import { env } from "@/lib/env";
import { getSession } from "@/lib/auth";
import { listAvailableModels } from "@/lib/provider";
import { getDashboardData } from "@/lib/store";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    return <LoginPanel defaultUsername={env.ATRIUM_USERNAME} />;
  }

  const models = await listAvailableModels();
  const dashboard = await getDashboardData(models);

  return <AtriumDashboard initialData={dashboard} />;
}
