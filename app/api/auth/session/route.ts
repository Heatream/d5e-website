import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, getAccountSummary, requireSession, sessionResponse } from "../../../lib/server-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session) return clearSessionCookies(NextResponse.json({ authenticated: false }, { status: 401 }));
    const summary = await getAccountSummary(session.user.id, session.accessToken);
    if (!summary) return clearSessionCookies(NextResponse.json({ authenticated: false }, { status: 401 }));
    return sessionResponse(session, summary, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[auth/session] failed", error instanceof Error ? error.message : error);
    return clearSessionCookies(NextResponse.json({ authenticated: false, error: "Session check is temporarily unavailable." }, { status: 500 }));
  }
}
