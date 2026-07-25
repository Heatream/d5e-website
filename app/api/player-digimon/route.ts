import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../lib/server-auth";

function config() {
  const { url, publishableKey: key } = authConfig();
  return { url, key };
}

async function authenticated(request: NextRequest, extra: Record<string, string> = {}) {
  const session = await requireSession(request);
  const { key } = config();
  if (!session) return null;
  return {
    session,
    headers: { apikey: key, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", ...extra },
  };
}

async function validateParent(url: string, headers: Record<string, string>, parentId: unknown) {
  if (!parentId) return null;
  const response = await fetch(`${url}/rest/v1/player_digimon?id=eq.${encodeURIComponent(String(parentId))}&select=id&limit=1`, {
    headers, cache: "no-store",
  });
  const rows = await response.json().catch(() => []);
  return response.ok && rows[0] ? null : NextResponse.json({ error: "The previous evolution is unavailable." }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const auth = await authenticated(request);
  if (!auth) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const { headers, session } = auth;
  const { url } = config();
  const response = await fetch(
    `${url}/rest/v1/player_digimon?select=*,player_digimon_skills(*)&order=created_at.desc`,
    { headers, cache: "no-store" },
  );
  return sessionResponse(session, await response.json().catch(() => []), { status: response.status });
}

export async function POST(request: NextRequest) {
  const auth = await authenticated(request, { Prefer: "return=representation" });
  if (!auth) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const { headers, session } = auth;
  const { url } = config();
  const body = await request.json().catch(() => null) as { digimon?: Record<string, unknown>; skills?: Record<string, unknown>[] } | null;
  if (!body?.digimon || !Array.isArray(body.skills)) return NextResponse.json({ error: "Invalid Digimon data." }, { status: 400 });
  const digimon = { ...body.digimon, user_id: session.user.id };
  const invalidParent = await validateParent(url, headers, digimon.parent_digimon_id);
  if (invalidParent) return invalidParent;

  const parentResponse = await fetch(`${url}/rest/v1/player_digimon`, {
    method: "POST", headers, body: JSON.stringify(digimon), cache: "no-store",
  });
  const parentResult = await parentResponse.json().catch(() => []);
  if (!parentResponse.ok) {
    const limitReached = String(parentResult?.message ?? "").includes("D5E_LIMIT_REACHED");
    return sessionResponse(session, { error: limitReached ? "This account has reached its 50 Digimon limit." : parentResult?.message ?? "Could not save the Digimon.", code: limitReached ? "DIGIMON_LIMIT_REACHED" : undefined }, { status: limitReached ? 409 : parentResponse.status });
  }
  const created = parentResult[0];

  if (body.skills.length) {
    const skillResponse = await fetch(`${url}/rest/v1/player_digimon_skills`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(body.skills.map((skill) => ({ ...skill, player_digimon_id: created.id }))),
      cache: "no-store",
    });
    if (!skillResponse.ok) {
      await fetch(`${url}/rest/v1/player_digimon?id=eq.${encodeURIComponent(created.id)}`, {
        method: "DELETE", headers: { ...headers, Prefer: "return=minimal" }, cache: "no-store",
      });
      const error = await skillResponse.json().catch(() => ({}));
      return sessionResponse(session, { error: error?.message ?? "Could not save the Digimon skills." }, { status: skillResponse.status });
    }
  }
  return sessionResponse(session, created, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticated(request, { Prefer: "return=representation" });
  if (!auth) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const { headers, session } = auth;
  const { url } = config();
  const body = await request.json().catch(() => null) as { id?: string; digimon?: Record<string, unknown>; skills?: Record<string, unknown>[] } | null;
  if (!body?.id || !body.digimon || !Array.isArray(body.skills)) return NextResponse.json({ error: "Invalid Digimon data." }, { status: 400 });
  const digimon = { ...body.digimon, user_id: session.user.id };
  const invalidParent = await validateParent(url, headers, digimon.parent_digimon_id);
  if (invalidParent) return invalidParent;

  const parentResponse = await fetch(`${url}/rest/v1/player_digimon?id=eq.${encodeURIComponent(body.id)}`, {
    method: "PATCH", headers, body: JSON.stringify({ ...digimon, updated_at: new Date().toISOString() }), cache: "no-store",
  });
  const parentResult = await parentResponse.json().catch(() => []);
  if (!parentResponse.ok || !parentResult[0]) return sessionResponse(session, { error: parentResult?.message ?? "Could not update the Digimon." }, { status: parentResponse.status || 404 });

  const skillHeaders = { ...headers, Prefer: "return=minimal" };
  const deleteResponse = await fetch(`${url}/rest/v1/player_digimon_skills?player_digimon_id=eq.${encodeURIComponent(body.id)}`, {
    method: "DELETE", headers: skillHeaders, cache: "no-store",
  });
  if (!deleteResponse.ok) return sessionResponse(session, { error: "Could not replace the Digimon skills." }, { status: deleteResponse.status });
  if (body.skills.length) {
    const skillResponse = await fetch(`${url}/rest/v1/player_digimon_skills`, {
      method: "POST", headers: skillHeaders,
      body: JSON.stringify(body.skills.map((skill) => ({ ...skill, player_digimon_id: body.id }))), cache: "no-store",
    });
    if (!skillResponse.ok) {
      const error = await skillResponse.json().catch(() => ({}));
      return sessionResponse(session, { error: error?.message ?? "Could not update the Digimon skills." }, { status: skillResponse.status });
    }
  }
  return sessionResponse(session, parentResult[0]);
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticated(request, { Prefer: "return=representation" });
  if (!auth) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const { headers, session } = auth;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "A Digimon id is required." }, { status: 400 });
  const { url } = config();
  await fetch(`${url}/rest/v1/player_digimon_skills?player_digimon_id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE", headers: { ...headers, Prefer: "return=minimal" }, cache: "no-store",
  });
  const response = await fetch(`${url}/rest/v1/player_digimon?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE", headers, cache: "no-store",
  });
  const result = await response.json().catch(() => []);
  if (!response.ok || !result[0]) return sessionResponse(session, { error: result?.message ?? "Could not delete the Digimon." }, { status: response.status || 404 });
  return sessionResponse(session, { deleted: true });
}
