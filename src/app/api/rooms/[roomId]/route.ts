import { requireSession } from "@/lib/guards";
import { jsonError } from "@/lib/http";
import { getRoomById } from "@/lib/store";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/rooms/[roomId]">,
) {
  const { error } = await requireSession();

  if (error) {
    return error;
  }

  const { roomId } = await context.params;
  const room = await getRoomById(roomId);

  if (!room) {
    return jsonError("Room not found", 404);
  }

  return Response.json({ room });
}
