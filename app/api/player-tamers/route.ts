import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../lib/server-auth";

type TamerPayload = {
  id?: string;
  tamer?: Record<string, unknown>;
  trainings?: Array<{ training_kind: "skill" | "save"; name: string }>;
  featIds?: number[];
  items?: Array<{ item_id: number | null; custom_name?: string | null; custom_description?: string | null; quantity: number }>;
};

async function auth(request: NextRequest, prefer = "return=representation") {
  const session = await requireSession(request);
  if (!session) return null;
  const { url, publishableKey } = authConfig();
  return {
    session, url,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
  };
}

function validBody(body: TamerPayload | null) {
  return Boolean(body?.tamer && Array.isArray(body.trainings) && Array.isArray(body.featIds) && Array.isArray(body.items));
}

async function replaceChildren(
  url: string,
  headers: Record<string, string>,
  tamerId: string,
  body: TamerPayload,
) {
  const resources = ["player_tamer_trainings", "player_tamer_feats", "player_tamer_items"];
  for (const resource of resources) {
    const response = await fetch(`${url}/rest/v1/${resource}?tamer_id=eq.${encodeURIComponent(tamerId)}`, {
      method: "DELETE", headers: { ...headers, Prefer: "return=minimal" }, cache: "no-store",
    });
    if (!response.ok) return response;
  }
  const inserts: Array<[string, unknown[]]> = [
    ["player_tamer_trainings", (body.trainings ?? []).map((row) => ({ ...row, tamer_id: tamerId }))],
    ["player_tamer_feats", (body.featIds ?? []).map((feat_id) => ({ tamer_id: tamerId, feat_id }))],
    ["player_tamer_items", (body.items ?? []).map((row) => ({ ...row, tamer_id: tamerId }))],
  ];
  for (const [resource, rows] of inserts) {
    if (!rows.length) continue;
    const response = await fetch(`${url}/rest/v1/${resource}`, {
      method: "POST", headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(rows), cache: "no-store",
    });
    if (!response.ok) return response;
  }
  return null;
}

async function clearSubclassState(url: string, headers: Record<string, string>, tamerId: string) {
  const resources = [
    "player_tamer_army",
    "player_tamer_digispirited",
    "player_tamer_dual_wielder",
    "player_tamer_dna_pulser",
  ];
  for (const resource of resources) {
    const response = await fetch(`${url}/rest/v1/${resource}?tamer_id=eq.${encodeURIComponent(tamerId)}`, {
      method: "DELETE", headers: { ...headers, Prefer: "return=minimal" }, cache: "no-store",
    });
    if (!response.ok) return response;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authenticated = await auth(request);
  if (!authenticated) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const { url, headers, session } = authenticated;
  const select = [
    "*",
    "player_tamer_trainings(id,training_kind,name)",
    "player_tamer_feats(id,feat_id)",
    "player_tamer_items(id,item_id,custom_name,custom_description,quantity,created_at)",
    "player_tamer_army(id,slot_number,name,field_id,main_ability,stage,image_path,is_xrossed,created_at,updated_at)",
    "player_tamer_digispirited(tamer_id,selected_field_id,weapon_name,weapon_damage,weapon_power,weapon_range,weapon_damage_type,elemental_type_id)",
    "player_tamer_dual_wielder(tamer_id,special_skill,builder_choices)",
    "player_tamer_dna_pulser(tamer_id,adapted_feature_id)",
    "player_tamer_partners(id,slot_number,partner_role,is_active,player_digimon_id,player_digimon(*,player_digimon_skills(*),player_digimon_items(slot_number,item_id),player_digimon_feats(feat_id)))",
  ].join(",");
  const response = await fetch(`${url}/rest/v1/player_tamers?select=${encodeURIComponent(select)}&order=created_at.desc`, {
    headers, cache: "no-store",
  });
  const result = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(result)) return sessionResponse(session, result, { status: response.status });

  // Items and feats belong to the root of an evolution chain. Hydrate each
  // attached form with that shared progression before returning the tamer.
  const digimonResponse = await fetch(`${url}/rest/v1/player_digimon?select=id,parent_digimon_id,player_digimon_items(slot_number,item_id),player_digimon_feats(feat_id)`, {
    headers, cache: "no-store",
  });
  const digimonRows = await digimonResponse.json().catch(() => []);
  if (digimonResponse.ok && Array.isArray(digimonRows)) {
    const byId = new Map(digimonRows.map((row) => [String(row.id), row]));
    const rootProgression = (id: string) => {
      let current = byId.get(id);
      const visited = new Set<string>();
      while (current?.parent_digimon_id && !visited.has(String(current.id))) {
        visited.add(String(current.id));
        current = byId.get(String(current.parent_digimon_id)) ?? current;
      }
      return {
        items: Array.isArray(current?.player_digimon_items) ? current.player_digimon_items : [],
        feats: Array.isArray(current?.player_digimon_feats) ? current.player_digimon_feats : [],
      };
    };
    result.forEach((tamer) => (tamer.player_tamer_partners ?? []).forEach((partner: Record<string, unknown>) => {
      const playerDigimon = partner.player_digimon as Record<string, unknown> | null;
      if (playerDigimon) {
        const progression = rootProgression(String(playerDigimon.id));
        playerDigimon.player_digimon_items = progression.items;
        playerDigimon.player_digimon_feats = progression.feats;
      }
    }));
  }
  return sessionResponse(session, result, { status: response.status });
}

export async function POST(request: NextRequest) {
  const authenticated = await auth(request);
  if (!authenticated) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const { url, headers, session } = authenticated;
  const body = await request.json().catch(() => null) as TamerPayload | null;
  if (!validBody(body)) return sessionResponse(session, { error: "Invalid tamer data." }, { status: 400 });
  const response = await fetch(`${url}/rest/v1/player_tamers`, {
    method: "POST", headers,
    body: JSON.stringify({ ...body!.tamer, user_id: session.user.id }), cache: "no-store",
  });
  const result = await response.json().catch(() => []);
  const created = result[0];
  if (!response.ok || !created) return sessionResponse(session, { error: result?.message ?? "Could not save the tamer." }, { status: response.status });
  const childError = await replaceChildren(url, headers, created.id, body!);
  if (childError) {
    await fetch(`${url}/rest/v1/player_tamers?id=eq.${encodeURIComponent(created.id)}`, {
      method: "DELETE", headers: { ...headers, Prefer: "return=minimal" }, cache: "no-store",
    });
    const error = await childError.json().catch(() => ({}));
    return sessionResponse(session, { error: error?.message ?? "Could not save tamer selections." }, { status: childError.status });
  }
  return sessionResponse(session, created, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const authenticated = await auth(request);
  if (!authenticated) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const { url, headers, session } = authenticated;
  const body = await request.json().catch(() => null) as TamerPayload | null;
  if (body?.id && body.tamer && !body.trainings && !body.featIds && !body.items) {
    const allowed = ["current_hp", "current_partner_points", "experience"] as const;
    const quick = Object.fromEntries(
      allowed
        .filter((key) => Object.prototype.hasOwnProperty.call(body.tamer, key))
        .map((key) => [key, Math.max(0, Math.trunc(Number(body.tamer?.[key] ?? 0)))]),
    );
    if (!Object.keys(quick).length) return sessionResponse(session, { error: "No editable tracker was supplied." }, { status: 400 });
    const response = await fetch(`${url}/rest/v1/player_tamers?id=eq.${encodeURIComponent(body.id)}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ ...quick, updated_at: new Date().toISOString() }), cache: "no-store",
    });
    const result = await response.json().catch(() => []);
    if (!response.ok || !result[0]) return sessionResponse(session, { error: result?.message ?? "Could not update the tracker." }, { status: response.status || 404 });
    return sessionResponse(session, result[0]);
  }
  if (!body?.id || !validBody(body)) return sessionResponse(session, { error: "Invalid tamer data." }, { status: 400 });
  const tamer = body.tamer!;
  const previousResponse = await fetch(`${url}/rest/v1/player_tamers?id=eq.${encodeURIComponent(body.id)}&select=subclass_id&limit=1`, {
    headers, cache: "no-store",
  });
  const previousRows = await previousResponse.json().catch(() => []);
  if (!previousResponse.ok || !previousRows[0]) {
    return sessionResponse(session, { error: "Could not load the existing tamer." }, { status: previousResponse.status || 404 });
  }
  const previousSubclassId = previousRows[0].subclass_id == null ? "" : String(previousRows[0].subclass_id);
  const nextSubclassId = tamer.subclass_id == null ? "" : String(tamer.subclass_id);
  const response = await fetch(`${url}/rest/v1/player_tamers?id=eq.${encodeURIComponent(body.id)}`, {
    method: "PATCH", headers,
    body: JSON.stringify({ ...tamer, user_id: session.user.id, updated_at: new Date().toISOString() }), cache: "no-store",
  });
  const result = await response.json().catch(() => []);
  if (!response.ok || !result[0]) return sessionResponse(session, { error: result?.message ?? "Could not update the tamer." }, { status: response.status || 404 });
  const childError = await replaceChildren(url, headers, body.id, body);
  if (childError) {
    const error = await childError.json().catch(() => ({}));
    return sessionResponse(session, { error: error?.message ?? "Could not update tamer selections." }, { status: childError.status });
  }
  if (previousSubclassId !== nextSubclassId) {
    const subclassError = await clearSubclassState(url, headers, body.id);
    if (subclassError) {
      const error = await subclassError.json().catch(() => ({}));
      return sessionResponse(session, { error: error?.message ?? "The tamer was updated, but old subclass data could not be cleared." }, { status: subclassError.status });
    }
  }
  return sessionResponse(session, result[0]);
}

export async function DELETE(request: NextRequest) {
  const authenticated = await auth(request);
  if (!authenticated) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return sessionResponse(authenticated.session, { error: "A tamer id is required." }, { status: 400 });
  const response = await fetch(`${authenticated.url}/rest/v1/player_tamers?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE", headers: authenticated.headers, cache: "no-store",
  });
  const result = await response.json().catch(() => []);
  if (!response.ok || !result[0]) return sessionResponse(authenticated.session, { error: result?.message ?? "Could not delete the tamer." }, { status: response.status || 404 });
  return sessionResponse(authenticated.session, { deleted: true });
}
