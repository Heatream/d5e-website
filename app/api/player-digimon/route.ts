import { NextRequest, NextResponse } from "next/server";

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return { url, key };
}

function authHeaders(request: NextRequest, extra: Record<string, string> = {}) {
  const authorization = request.headers.get("authorization");
  const { key } = config();
  if (!authorization?.startsWith("Bearer ")) return null;
  return { apikey: key, Authorization: authorization, "Content-Type": "application/json", ...extra };
}

export async function GET(request: NextRequest) {
  const headers = authHeaders(request);
  if (!headers) return NextResponse.json({ error: "A session is required." }, { status: 401 });
  const { url } = config();
  const response = await fetch(
    `${url}/rest/v1/player_digimon?select=*,player_digimon_skills(*)&order=created_at.desc`,
    { headers, cache: "no-store" },
  );
  return NextResponse.json(await response.json().catch(() => []), { status: response.status });
}

export async function POST(request: NextRequest) {
  const headers = authHeaders(request, { Prefer: "return=representation" });
  if (!headers) return NextResponse.json({ error: "A session is required." }, { status: 401 });
  const { url } = config();
  const body = await request.json().catch(() => null) as { digimon?: Record<string, unknown>; skills?: Record<string, unknown>[] } | null;
  if (!body?.digimon || !Array.isArray(body.skills)) return NextResponse.json({ error: "Invalid Digimon data." }, { status: 400 });

  const parentResponse = await fetch(`${url}/rest/v1/player_digimon`, {
    method: "POST", headers, body: JSON.stringify(body.digimon), cache: "no-store",
  });
  const parentResult = await parentResponse.json().catch(() => []);
  if (!parentResponse.ok) return NextResponse.json({ error: parentResult?.message ?? "Could not save the Digimon." }, { status: parentResponse.status });
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
      return NextResponse.json({ error: error?.message ?? "Could not save the Digimon skills." }, { status: skillResponse.status });
    }
  }
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const headers = authHeaders(request, { Prefer: "return=representation" });
  if (!headers) return NextResponse.json({ error: "A session is required." }, { status: 401 });
  const { url } = config();
  const body = await request.json().catch(() => null) as { id?: string; digimon?: Record<string, unknown>; skills?: Record<string, unknown>[] } | null;
  if (!body?.id || !body.digimon || !Array.isArray(body.skills)) return NextResponse.json({ error: "Invalid Digimon data." }, { status: 400 });

  const parentResponse = await fetch(`${url}/rest/v1/player_digimon?id=eq.${encodeURIComponent(body.id)}`, {
    method: "PATCH", headers, body: JSON.stringify({ ...body.digimon, updated_at: new Date().toISOString() }), cache: "no-store",
  });
  const parentResult = await parentResponse.json().catch(() => []);
  if (!parentResponse.ok || !parentResult[0]) return NextResponse.json({ error: parentResult?.message ?? "Could not update the Digimon." }, { status: parentResponse.status || 404 });

  const skillHeaders = { ...headers, Prefer: "return=minimal" };
  const deleteResponse = await fetch(`${url}/rest/v1/player_digimon_skills?player_digimon_id=eq.${encodeURIComponent(body.id)}`, {
    method: "DELETE", headers: skillHeaders, cache: "no-store",
  });
  if (!deleteResponse.ok) return NextResponse.json({ error: "Could not replace the Digimon skills." }, { status: deleteResponse.status });
  if (body.skills.length) {
    const skillResponse = await fetch(`${url}/rest/v1/player_digimon_skills`, {
      method: "POST", headers: skillHeaders,
      body: JSON.stringify(body.skills.map((skill) => ({ ...skill, player_digimon_id: body.id }))), cache: "no-store",
    });
    if (!skillResponse.ok) {
      const error = await skillResponse.json().catch(() => ({}));
      return NextResponse.json({ error: error?.message ?? "Could not update the Digimon skills." }, { status: skillResponse.status });
    }
  }
  return NextResponse.json(parentResult[0]);
}

export async function DELETE(request: NextRequest) {
  const headers = authHeaders(request, { Prefer: "return=representation" });
  if (!headers) return NextResponse.json({ error: "A session is required." }, { status: 401 });
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
  if (!response.ok || !result[0]) return NextResponse.json({ error: result?.message ?? "Could not delete the Digimon." }, { status: response.status || 404 });
  return NextResponse.json({ deleted: true });
}
