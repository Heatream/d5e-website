import { NextRequest, NextResponse } from "next/server";
import { authConfig, clearSessionCookies, requireSession, serviceHeaders, sessionResponse } from "../../../lib/server-auth";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return clearSessionCookies(NextResponse.json({ authenticated: false }, { status: 401 }));
  const { url } = authConfig();
  const profileResponse = await fetch(`${url}/rest/v1/account_profiles?user_id=eq.${encodeURIComponent(session.user.id)}&select=username,limit_unlocked&limit=1`, {
    headers: serviceHeaders(), cache: "no-store",
  });
  const profiles = await profileResponse.json().catch(() => []);
  const profile = profiles[0];
  if (!profileResponse.ok || !profile) return clearSessionCookies(NextResponse.json({ authenticated: false }, { status: 401 }));
  const countResponse = await fetch(`${url}/rest/v1/player_digimon?user_id=eq.${encodeURIComponent(session.user.id)}&parent_digimon_id=is.null&select=id`, {
    headers: serviceHeaders({ Prefer: "count=exact" }), cache: "no-store",
  });
  const count = Number(countResponse.headers.get("content-range")?.split("/")[1] ?? 0);
  return sessionResponse(session, { authenticated: true, username: profile.username, rootCount: count, limit: 50, limitUnlocked: profile.limit_unlocked });
}
