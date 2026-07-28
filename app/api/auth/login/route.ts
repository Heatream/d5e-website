import { NextRequest, NextResponse } from "next/server";
import { accountEmail, applySessionCookies, authConfig, getAccountSummary, normalizeUsername, type TokenResult } from "../../../lib/server-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { username?: string; password?: string } | null;
    const normalized = normalizeUsername(body?.username);
    if (!normalized || !body?.password) return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
    const { url, publishableKey } = authConfig();
    const authResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: accountEmail(normalized), password: body.password }), cache: "no-store",
    });
    const session = await authResponse.json().catch(() => ({})) as TokenResult;
    if (!authResponse.ok) return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
    const summary = await getAccountSummary(session.user.id, session.access_token);
    if (!summary) return NextResponse.json({ error: "This account is missing its D5e profile." }, { status: 409 });
    return applySessionCookies(NextResponse.json(summary), session);
  } catch (error) {
    console.error("[auth/login] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Login is temporarily unavailable." }, { status: 500 });
  }
}
