import { requireSession } from "@/lib/guards";
import { listAvailableModels } from "@/lib/provider";
import { getDashboardData } from "@/lib/store";

export async function GET() {
  const { error } = await requireSession();

  if (error) {
    return error;
  }

  const models = await listAvailableModels();
  const dashboard = await getDashboardData(models);

  return Response.json(dashboard);
}
