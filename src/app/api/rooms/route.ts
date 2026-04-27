import { requireSession } from "@/lib/guards";
import { jsonError } from "@/lib/http";
import { roomMutationSchema } from "@/lib/schemas";
import { mutateRoom } from "@/lib/store";

export async function POST(request: Request) {
  const { error } = await requireSession();

  if (error) {
    return error;
  }

  const payload = roomMutationSchema.safeParse(await request.json());

  if (!payload.success) {
    return jsonError("Invalid room payload", 400);
  }

  const result = await mutateRoom(payload.data);
  return Response.json({ ok: true, ...result });
}
