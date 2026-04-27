import { requireSession } from "@/lib/guards";
import { listAvailableModels } from "@/lib/provider";

export async function GET() {
  const { error } = await requireSession();

  if (error) {
    return error;
  }

  return Response.json({
    models: await listAvailableModels(),
  });
}
