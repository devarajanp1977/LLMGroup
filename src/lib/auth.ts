import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { env, isProduction } from "@/lib/env";

const SESSION_COOKIE_NAME = "atrium-session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

type SessionPayload = {
  username: string;
  expiresAt: number;
};

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(payload).digest("base64url");
}

export function createSessionToken(username: string): string {
  const payload = JSON.stringify({
    username,
    expiresAt: Date.now() + SESSION_TTL_MS,
  } satisfies SessionPayload);
  const encodedPayload = toBase64Url(payload);
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, providedSignature] = token.split(".");

  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload;

    if (payload.expiresAt < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function readSessionTokenPayload(token: string): SessionPayload | null {
  const [encodedPayload] = token.split(".");

  if (!encodedPayload) {
    return null;
  }

  try {
    return JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return verifySessionToken(token);
}

export function credentialsMatch(username: string, password: string): boolean {
  return username === env.ATRIUM_USERNAME && password === env.ATRIUM_PASSWORD;
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function getSessionCookieOptions(expiresAt?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    expires: expiresAt ? new Date(expiresAt) : undefined,
  };
}
