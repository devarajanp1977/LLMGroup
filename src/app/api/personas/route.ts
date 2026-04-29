import { requireSession } from "@/lib/guards";
import { jsonError } from "@/lib/http";
import { personaMutationSchema } from "@/lib/schemas";
import { upsertPersona } from "@/lib/store";

export async function POST(request: Request) {
  const { error } = await requireSession();

  if (error) {
    return error;
  }

  const payload = personaMutationSchema.safeParse(await request.json());

  if (!payload.success) {
    const firstIssue = payload.error.issues[0];
    const path = firstIssue?.path.join(".");
    const message = firstIssue?.message
      ? path
        ? `${path}: ${firstIssue.message}`
        : firstIssue.message
      : "Invalid persona payload";

    return jsonError(message, 400);
  }

  const personas = await upsertPersona(payload.data);
  return Response.json({ ok: true, personas });
}
