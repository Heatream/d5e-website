import { NextRequest, NextResponse } from "next/server";
import { accountEmail, applySessionCookies, authConfig, serviceHeaders, validateUsername, type TokenResult } from "../../../lib/server-auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null;
  const username = validateUsername(body?.username);
  if ("error" in username) return NextResponse.json({ error: username.error }, { status: 400 });
  if (!body?.password || body.password.length < 8) return NextResponse.json({ error: "Password must contain at least 8 characters." }, { status: 400 });
  const { url, publishableKey } = authConfig();
  const email = accountEmail(username.normalized);
  try {
    const createResponse = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST", headers: serviceHeaders(),
      body: JSON.stringify({ email, password: body.password, email_confirm: true }), cache: "no-store",
    });
    const created = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
      const duplicate = String(created?.message ?? "").toLowerCase().includes("already");
      return NextResponse.json({ error: duplicate ? "That username is already taken." : "Could not create the account." }, { status: duplicate ? 409 : 500 });
    }
    const profileResponse = await fetch(`${url}/rest/v1/account_profiles`, {
      method: "POST", headers: serviceHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ user_id: created.id, username: username.display, normalized_username: username.normalized }), cache: "no-store",
    });
    if (!profileResponse.ok) {
      await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(created.id)}`, { method: "DELETE", headers: serviceHeaders(), cache: "no-store" });
      return NextResponse.json({ error: profileResponse.status === 409 ? "That username is already taken." : "Could not finish creating the account." }, { status: profileResponse.status === 409 ? 409 : 500 });
    }
    const loginResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: body.password }), cache: "no-store",
    });
    const session = await loginResponse.json().catch(() => ({})) as TokenResult;
    if (!loginResponse.ok) return NextResponse.json({ error: "Account created, but login failed. Please log in." }, { status: 500 });
    return applySessionCookies(NextResponse.json({ username: username.display }, { status: 201 }), session);
  } catch (error) {
    console.error("Account creation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Account creation is temporarily unavailable." }, { status: 500 });
  }
}
