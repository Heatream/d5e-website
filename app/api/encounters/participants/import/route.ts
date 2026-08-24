import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../../../lib/server-auth";
import { snapshotSharedTamer } from "../../../../lib/tamer-share";

type Body = { encounter_id?: string; code?: string; selected_slots?: number[] };

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "Log in to import a character." }, { status: 401 });
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.encounter_id || !body.code || !Array.isArray(body.selected_slots) || body.selected_slots.length > 2) {
    return sessionResponse(session, { error: "Invalid character import." }, { status: 400 });
  }
  const { url, publishableKey } = authConfig();
  const headers = { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const encounterResponse = await fetch(`${url}/rest/v1/encounters?id=eq.${encodeURIComponent(body.encounter_id)}&select=id&limit=1`, { headers, cache: "no-store" });
  const encounterRows = await encounterResponse.json().catch(() => []);
  if (!encounterResponse.ok || !encounterRows[0]) return sessionResponse(session, { error: "Encounter not found." }, { status: 404 });
  try {
    const imported = await snapshotSharedTamer(body.code, body.selected_slots);
    if (!imported) return sessionResponse(session, { error: "Character code not found." }, { status: 404 });
    const orderResponse = await fetch(`${url}/rest/v1/encounter_participants?encounter_id=eq.${encodeURIComponent(body.encounter_id)}&select=tie_order&order=tie_order.desc&limit=1`, { headers, cache: "no-store" });
    const orderRows = await orderResponse.json().catch(() => []);
    const response = await fetch(`${url}/rest/v1/encounter_participants`, {
      method: "POST", headers, cache: "no-store",
      body: JSON.stringify({ encounter_id: body.encounter_id, participant_kind: "player", source_id: null, display_name: imported.displayName.slice(0, 80), initiative: null, tie_order: Number(orderRows[0]?.tie_order ?? -1) + 1, snapshot: imported.snapshot, state: imported.state }),
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok || !rows[0]) return sessionResponse(session, { error: rows?.message ?? "Could not import character." }, { status: response.status });
    return sessionResponse(session, rows[0], { status: 201 });
  } catch {
    return sessionResponse(session, { error: "Character sharing is currently unavailable." }, { status: 503 });
  }
}
