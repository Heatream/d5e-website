import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../lib/server-auth";

type EncounterBody = { id?: string; name?: string; round_number?: number; active_participant_id?: string | null };

async function context(request: NextRequest, prefer = "return=representation") {
  const session = await requireSession(request);
  if (!session) return null;
  const { url, publishableKey } = authConfig();
  return { session, url, headers: { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Prefer: prefer } };
}

export async function GET(request: NextRequest) {
  const auth = await context(request);
  if (!auth) return NextResponse.json({ error: "Log in to use the Encounter Manager." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  const query = id
    ? `id=eq.${encodeURIComponent(id)}&select=*,encounter_participants(*)&limit=1`
    : "select=*&order=updated_at.desc";
  const response = await fetch(`${auth.url}/rest/v1/encounters?${query}`, { headers: auth.headers, cache: "no-store" });
  const result = await response.json().catch(() => []);
  if (!response.ok) return sessionResponse(auth.session, { error: result?.message ?? "Could not load encounters." }, { status: response.status });
  if (id && !result[0]) return sessionResponse(auth.session, { error: "Encounter not found." }, { status: 404 });
  return sessionResponse(auth.session, id ? result[0] : result);
}

export async function POST(request: NextRequest) {
  const auth = await context(request);
  if (!auth) return NextResponse.json({ error: "Log in to use the Encounter Manager." }, { status: 401 });
  const body = await request.json().catch(() => null) as EncounterBody | null;
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 80) return sessionResponse(auth.session, { error: "Enter an encounter name (80 characters maximum)." }, { status: 400 });
  const response = await fetch(`${auth.url}/rest/v1/encounters`, { method: "POST", headers: auth.headers, body: JSON.stringify({ name, user_id: auth.session.user.id }), cache: "no-store" });
  const result = await response.json().catch(() => []);
  if (!response.ok || !result[0]) return sessionResponse(auth.session, { error: result?.message ?? "Could not create encounter." }, { status: response.status });
  return sessionResponse(auth.session, result[0], { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await context(request);
  if (!auth) return NextResponse.json({ error: "Log in to use the Encounter Manager." }, { status: 401 });
  const body = await request.json().catch(() => null) as EncounterBody | null;
  if (!body?.id) return sessionResponse(auth.session, { error: "Encounter id is required." }, { status: 400 });
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name || name.length > 80) return sessionResponse(auth.session, { error: "Invalid encounter name." }, { status: 400 });
    update.name = name;
  }
  if (body.round_number !== undefined) update.round_number = Math.max(1, Math.trunc(Number(body.round_number) || 1));
  if (body.active_participant_id !== undefined) update.active_participant_id = body.active_participant_id;
  const response = await fetch(`${auth.url}/rest/v1/encounters?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", headers: auth.headers, body: JSON.stringify(update), cache: "no-store" });
  const result = await response.json().catch(() => []);
  if (!response.ok || !result[0]) return sessionResponse(auth.session, { error: result?.message ?? "Could not update encounter." }, { status: response.status || 404 });
  return sessionResponse(auth.session, result[0]);
}

export async function DELETE(request: NextRequest) {
  const auth = await context(request);
  if (!auth) return NextResponse.json({ error: "Log in to use the Encounter Manager." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return sessionResponse(auth.session, { error: "Encounter id is required." }, { status: 400 });
  const response = await fetch(`${auth.url}/rest/v1/encounters?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: auth.headers, cache: "no-store" });
  if (!response.ok) return sessionResponse(auth.session, { error: "Could not delete encounter." }, { status: response.status });
  return sessionResponse(auth.session, { deleted: true });
}
