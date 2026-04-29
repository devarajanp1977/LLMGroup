import { requireSession } from "@/lib/guards";
import { searchSchema } from "@/lib/schemas";
import { searchMessages } from "@/lib/store";

export async function POST(request: Request) {
  const { error } = await requireSession();

  if (error) {
    return error;
  }

  const payload = searchSchema.safeParse(await request.json());

  if (!payload.success) {
    return Response.json({ error: "Invalid search payload" }, { status: 400 });
  }

  const results = await searchMessages(payload.data);

  return Response.json({ results });
}
