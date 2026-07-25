import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, secureSecretMatches, serviceHeaders, sessionResponse } from "../../../lib/server-auth";

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const body = await request.json().catch(() => null) as { password?: string } | null;
  if (!secureSecretMatches(body?.password, process.env.D5E_DM_OVERRIDE_PASSWORD)) return sessionResponse(session, { error: "Incorrect DM password." }, { status: 403 });
  const { url } = authConfig();
  const updateResponse = await fetch(`${url}/rest/v1/account_profiles?user_id=eq.${encodeURIComponent(session.user.id)}`, {
    method: "PATCH", headers: serviceHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ limit_unlocked: true, limit_unlocked_at: new Date().toISOString() }), cache: "no-store",
  });
  if (!updateResponse.ok) return sessionResponse(session, { error: "Could not unlock this account." }, { status: 500 });
  return sessionResponse(session, { limitUnlocked: true });
}
