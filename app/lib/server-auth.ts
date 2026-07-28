import { NextRequest, NextResponse } from "next/server";
export { accountEmail, normalizeUsername, secureSecretMatches, validateUsername } from "./account-rules";

export const ACCESS_COOKIE = "d5e-access-token";
export const REFRESH_COOKIE = "d5e-refresh-token";

type AuthUser = { id: string; is_anonymous?: boolean };
export type TokenResult = {
  access_token: string; refresh_token: string; expires_in: number; user: AuthUser;
};

export function authConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase is not configured.");
  return { url, publishableKey, secretKey };
}

function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

export function applySessionCookies(response: NextResponse, session: TokenResult) {
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(ACCESS_COOKIE, session.access_token, cookieOptions(session.expires_in));
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, cookieOptions(60 * 60 * 24 * 30));
  return response;
}

export async function getAccountSummary(userId: string, accessToken?: string) {
  const { url, publishableKey } = authConfig();
  const headers = accessToken
    ? { apikey: publishableKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    : serviceHeaders();
  const profileResponse = await fetch(`${url}/rest/v1/account_profiles?user_id=eq.${encodeURIComponent(userId)}&select=username,limit_unlocked&limit=1`, {
    headers, cache: "no-store",
  });
  const profiles = await profileResponse.json().catch(() => []);
  const profile = profiles[0];
  if (!profileResponse.ok || !profile) return null;
  const countResponse = await fetch(`${url}/rest/v1/player_digimon?user_id=eq.${encodeURIComponent(userId)}&parent_digimon_id=is.null&select=id`, {
    headers: { ...headers, Prefer: "count=exact" }, cache: "no-store",
  });
  const rootCount = Number(countResponse.headers.get("content-range")?.split("/")[1] ?? 0);
  return { authenticated: true, username: profile.username, rootCount, limit: 50, limitUnlocked: Boolean(profile.limit_unlocked) };
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", cookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, "", cookieOptions(0));
  return response;
}

async function getUser(accessToken: string) {
  const { url, publishableKey } = authConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }, cache: "no-store",
  });
  return response.ok ? await response.json() as AuthUser : null;
}

async function refreshSession(refreshToken: string) {
  const { url, publishableKey } = authConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST", headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }), cache: "no-store",
  });
  return response.ok ? await response.json() as TokenResult : null;
}

export async function requireSession(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const user = await getUser(accessToken);
    if (user && !user.is_anonymous) return { accessToken, user, refreshed: null as TokenResult | null };
  }
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;
  const refreshed = await refreshSession(refreshToken);
  if (!refreshed || refreshed.user.is_anonymous) return null;
  return { accessToken: refreshed.access_token, user: refreshed.user, refreshed };
}

export function sessionResponse(session: Awaited<ReturnType<typeof requireSession>>, body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  if (session?.refreshed) applySessionCookies(response, session.refreshed);
  return response;
}

export function serviceHeaders(extra: Record<string, string> = {}) {
  const { secretKey } = authConfig();
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is required for account management.");
  return { apikey: secretKey, "Content-Type": "application/json", ...extra };
}
