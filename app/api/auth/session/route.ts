import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, getAccountSummary, requireSession, sessionResponse } from "../../../lib/server-auth";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return clearSessionCookies(NextResponse.json({ authenticated: false }, { status: 401 }));
  const summary = await getAccountSummary(session.user.id);
  if (!summary) return clearSessionCookies(NextResponse.json({ authenticated: false }, { status: 401 }));
  return sessionResponse(session, summary, { headers: { "Cache-Control": "private, no-store" } });
}
