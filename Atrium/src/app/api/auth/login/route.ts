import { cookies } from "next/headers";

import {
  createSessionToken,
  getSessionCookieName,
  getSessionCookieOptions,
  readSessionTokenPayload,
} from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { loginSchema } from "@/lib/schemas";
import { getStoredUser, validatePassword } from "@/lib/store";

export async function POST(request: Request) {
  const payload = loginSchema.safeParse(await request.json());

  if (!payload.success) {
    return jsonError("Invalid login payload", 400);
  }

  const user = await getStoredUser();
  const passwordMatches = await validatePassword(payload.data.password);

  if (!passwordMatches || payload.data.username !== user.name) {
    return jsonError("Invalid credentials", 401);
  }

  const token = createSessionToken(user.name);
  const session = await cookies();
  const verified = readSessionTokenPayload(token);

  if (!verified) {
    return jsonError("Failed to create session", 500);
  }

  session.set(
    getSessionCookieName(),
    token,
    getSessionCookieOptions(verified.expiresAt),
  );

  return Response.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
    },
  });
}
