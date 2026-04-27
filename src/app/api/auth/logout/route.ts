import { cookies } from "next/headers";

import { getSessionCookieName, getSessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const session = await cookies();
  session.set(getSessionCookieName(), "", getSessionCookieOptions(Date.now() - 1000));

  return Response.json({ ok: true });
}
