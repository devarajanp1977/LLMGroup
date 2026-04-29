import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    return {
      session: null,
      error: jsonError("Unauthorized", 401),
    };
  }

  return { session, error: null };
}
