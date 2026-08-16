import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../../lib/server-auth";
import type { EncounterParticipantKind } from "../../../lib/encounter-rules";

type Body = { id?: string; encounter_id?: string; participant_kind?: EncounterParticipantKind; source_id?: string | null; display_name?: string; initiative?: number | null; snapshot?: Record<string, unknown>; state?: Record<string, unknown>; tie_order?: number };
const kinds = new Set<EncounterParticipantKind>(["player", "official_digimon", "saved_digimon", "saved_tamer"]);

async function context(request: NextRequest, prefer = "return=representation") {
  const session = await requireSession(request);
  if (!session) return null;
  const { url, publishableKey } = authConfig();
  return { session, url, headers: { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Prefer: prefer } };
}

async function encounterExists(url: string, headers: Record<string, string>, id: string) {
  const response = await fetch(`${url}/rest/v1/encounters?id=eq.${encodeURIComponent(id)}&select=id&limit=1`, { headers, cache: "no-store" });
  const rows = await response.json().catch(() => []);
  return response.ok && Boolean(rows[0]);
}

async function sourceExists(url: string, headers: Record<string, string>, kind: EncounterParticipantKind, sourceId: string | null) {
  if (kind === "player") return true;
  if (!sourceId) return false;
  const table = kind === "official_digimon" ? "Digimon" : kind === "saved_digimon" ? "player_digimon" : "player_tamers";
  const response = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(sourceId)}&select=id&limit=1`, { headers, cache: "no-store" });
  const rows = await response.json().catch(() => []);
  return response.ok && Boolean(rows[0]);
}

export async function POST(request: NextRequest) {
  const auth = await context(request);
  if (!auth) return NextResponse.json({ error: "Log in to use the Encounter Manager." }, { status: 401 });
  const body = await request.json().catch(() => null) as Body | null;
  const kind = body?.participant_kind;
  const encounterId = String(body?.encounter_id ?? "");
  const name = String(body?.display_name ?? "").trim();
  if (!kind || !kinds.has(kind) || !encounterId || !name || !body?.snapshot || !body?.state) return sessionResponse(auth.session, { error: "Invalid participant data." }, { status: 400 });
  if (!await encounterExists(auth.url, auth.headers, encounterId)) return sessionResponse(auth.session, { error: "Encounter not found." }, { status: 404 });
  if (!await sourceExists(auth.url, auth.headers, kind, body.source_id ?? null)) return sessionResponse(auth.session, { error: "The selected source is unavailable." }, { status: 400 });
  const orderResponse = await fetch(`${auth.url}/rest/v1/encounter_participants?encounter_id=eq.${encodeURIComponent(encounterId)}&select=tie_order&order=tie_order.desc&limit=1`, { headers: auth.headers, cache: "no-store" });
  const orderRows = await orderResponse.json().catch(() => []);
  const tieOrder = Number(orderRows[0]?.tie_order ?? -1) + 1;
  const response = await fetch(`${auth.url}/rest/v1/encounter_participants`, { method: "POST", headers: auth.headers, body: JSON.stringify({ encounter_id: encounterId, participant_kind: kind, source_id: body.source_id ?? null, display_name: name.slice(0, 80), initiative: body.initiative == null ? null : Math.trunc(Number(body.initiative)), tie_order: tieOrder, snapshot: body.snapshot, state: body.state }), cache: "no-store" });
  const result = await response.json().catch(() => []);
  if (!response.ok || !result[0]) return sessionResponse(auth.session, { error: result?.message ?? "Could not add participant." }, { status: response.status });
  return sessionResponse(auth.session, result[0], { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await context(request);
  if (!auth) return NextResponse.json({ error: "Log in to use the Encounter Manager." }, { status: 401 });
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.id) return sessionResponse(auth.session, { error: "Participant id is required." }, { status: 400 });
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.display_name !== undefined) update.display_name = body.display_name.trim().slice(0, 80);
  if (body.initiative !== undefined) update.initiative = body.initiative == null ? null : Math.trunc(Number(body.initiative));
  if (body.tie_order !== undefined) update.tie_order = Math.max(0, Math.trunc(Number(body.tie_order)));
  if (body.state !== undefined) update.state = body.state;
  const response = await fetch(`${auth.url}/rest/v1/encounter_participants?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", headers: auth.headers, body: JSON.stringify(update), cache: "no-store" });
  const result = await response.json().catch(() => []);
  if (!response.ok || !result[0]) return sessionResponse(auth.session, { error: result?.message ?? "Could not update participant." }, { status: response.status || 404 });
  return sessionResponse(auth.session, result[0]);
}

export async function DELETE(request: NextRequest) {
  const auth = await context(request);
  if (!auth) return NextResponse.json({ error: "Log in to use the Encounter Manager." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return sessionResponse(auth.session, { error: "Participant id is required." }, { status: 400 });
  const response = await fetch(`${auth.url}/rest/v1/encounter_participants?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: auth.headers, cache: "no-store" });
  if (!response.ok) return sessionResponse(auth.session, { error: "Could not remove participant." }, { status: response.status });
  return sessionResponse(auth.session, { deleted: true });
}
