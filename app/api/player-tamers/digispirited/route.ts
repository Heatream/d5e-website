import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../../lib/server-auth";

type DigispiritedPayload = {
  tamerId?: string;
  selectedFieldId?: number | null;
  elementalTypeId?: string | null;
  weapon?: {
    name?: string;
    damage?: string;
    power?: string;
    range?: string;
    damageType?: string;
  } | null;
};

const ABILITIES = new Set(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);
const DAMAGE_TYPES = new Set(["bludgeoning", "piercing", "slashing"]);

export async function PUT(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const body = await request.json().catch(() => null) as DigispiritedPayload | null;
  if (!body?.tamerId) return sessionResponse(session, { error: "A saved tamer is required." }, { status: 400 });

  const { url, publishableKey } = authConfig();
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
  const tamerResponse = await fetch(`${url}/rest/v1/player_tamers?select=level,tamer_subclasses!inner(slug)&id=eq.${encodeURIComponent(body.tamerId)}`, {
    headers, cache: "no-store",
  });
  const tamers = await tamerResponse.json().catch(() => []);
  const tamer = tamers[0] as { level?: number; tamer_subclasses?: { slug?: string } } | undefined;
  if (!tamer || tamer.tamer_subclasses?.slug?.toLowerCase() !== "digispirited") {
    return sessionResponse(session, { error: "That Digispirited tamer could not be found." }, { status: 404 });
  }

  const level = Number(tamer.level ?? 1);
  const selectedFieldId = body.selectedFieldId == null ? null : Number(body.selectedFieldId);
  if (selectedFieldId != null && (!Number.isInteger(selectedFieldId) || level < 9)) {
    return sessionResponse(session, { error: "Field selection unlocks at level 9." }, { status: 400 });
  }
  if (selectedFieldId != null) {
    const fieldResponse = await fetch(`${url}/rest/v1/Field?select=id&id=eq.${selectedFieldId}`, { headers, cache: "no-store" });
    const fields = await fieldResponse.json().catch(() => []);
    if (!fieldResponse.ok || !fields.length) return sessionResponse(session, { error: "Unknown Field." }, { status: 400 });
  }

  const elementalTypeId = String(body.elementalTypeId ?? "").trim() || null;
  if (elementalTypeId) {
    const typeResponse = await fetch(`${url}/rest/v1/Type%20Elements?select=id&id=eq.${encodeURIComponent(elementalTypeId)}`, { headers, cache: "no-store" });
    const types = await typeResponse.json().catch(() => []);
    if (!typeResponse.ok || !types.length) return sessionResponse(session, { error: "Unknown elemental type." }, { status: 400 });
  }

  const weapon = body.weapon;
  const normalizedWeapon = weapon ? {
    name: String(weapon.name ?? "").trim(),
    damage: String(weapon.damage ?? "").trim(),
    power: String(weapon.power ?? "").trim().toLowerCase(),
    range: String(weapon.range ?? "").trim(),
    damageType: String(weapon.damageType ?? "").trim().toLowerCase(),
  } : null;
  if (normalizedWeapon && level < 14) {
    return sessionResponse(session, { error: "Digi-Arms unlocks at level 14." }, { status: 400 });
  }
  if (normalizedWeapon && (!normalizedWeapon.name || !normalizedWeapon.damage || !normalizedWeapon.range
    || !ABILITIES.has(normalizedWeapon.power) || !DAMAGE_TYPES.has(normalizedWeapon.damageType))) {
    return sessionResponse(session, { error: "Complete the Digi-Arms weapon profile." }, { status: 400 });
  }

  const payload = {
    tamer_id: body.tamerId,
    selected_field_id: selectedFieldId,
    weapon_name: normalizedWeapon?.name ?? null,
    weapon_damage: normalizedWeapon?.damage ?? null,
    weapon_power: normalizedWeapon?.power ?? null,
    weapon_range: normalizedWeapon?.range ?? null,
    weapon_damage_type: normalizedWeapon?.damageType ?? null,
    elemental_type_id: elementalTypeId,
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(`${url}/rest/v1/player_tamer_digispirited?on_conflict=tamer_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const result = await response.json().catch(() => []);
  if (!response.ok) return sessionResponse(session, { error: result?.message ?? "Could not save Digispirited settings." }, { status: response.status });
  return sessionResponse(session, result[0] ?? payload);
}
