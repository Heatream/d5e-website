import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../../lib/server-auth";

type PartnerRequest = {
  tamerId?: string;
  playerDigimonId?: string;
  official?: {
    digimon: Record<string, unknown>;
    skills: Record<string, unknown>[];
  };
};

function abilityModifier(score: unknown) {
  return Math.floor((Number(score ?? 10) - 10) / 2);
}

async function refreshPartnerPoints(url: string, headers: Record<string, string>, tamerId: string) {
  const select = "id,level,charisma,current_partner_points,tamer_subclasses(slug),player_tamer_partners(slot_number,player_digimon(charisma))";
  const response = await fetch(`${url}/rest/v1/player_tamers?id=eq.${encodeURIComponent(tamerId)}&select=${encodeURIComponent(select)}&limit=1`, {
    headers, cache: "no-store",
  });
  const rows = await response.json().catch(() => []);
  const tamer = rows[0];
  if (!response.ok || !tamer) return;
  const partners = Array.isArray(tamer.player_tamer_partners)
    ? [...tamer.player_tamer_partners].sort((left, right) => Number(left.slot_number) - Number(right.slot_number))
    : [];
  const first = partners[0]?.player_digimon;
  const second = partners[1]?.player_digimon;
  const dualWielder = String(tamer.tamer_subclasses?.slug ?? "").toLowerCase() === "dual-wielder";
  const max = Math.max(0, 1 + abilityModifier(tamer.charisma) + abilityModifier(first?.charisma)
    + (dualWielder && Number(tamer.level ?? 1) >= 14 && second ? abilityModifier(second.charisma) : 0));
  await fetch(`${url}/rest/v1/player_tamers?id=eq.${encodeURIComponent(tamerId)}`, {
    method: "PATCH", headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ max_partner_points: max, current_partner_points: Math.min(Number(tamer.current_partner_points ?? 0), max) }),
    cache: "no-store",
  });
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const body = await request.json().catch(() => null) as PartnerRequest | null;
  if (!body?.tamerId || (!body.playerDigimonId && !body.official?.digimon)) {
    return sessionResponse(session, { error: "Choose a tamer and Digimon." }, { status: 400 });
  }
  const { url, publishableKey } = authConfig();
  const headers = {
    apikey: publishableKey, Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json", Prefer: "return=representation",
  };
  let digimonId = body.playerDigimonId ?? "";
  let createdId = "";
  if (body.official) {
    const createdResponse = await fetch(`${url}/rest/v1/player_digimon`, {
      method: "POST", headers,
      body: JSON.stringify({ ...body.official.digimon, user_id: session.user.id }), cache: "no-store",
    });
    const createdResult = await createdResponse.json().catch(() => []);
    if (!createdResponse.ok || !createdResult[0]) {
      const limitReached = String(createdResult?.message ?? "").includes("D5E_LIMIT_REACHED");
      return sessionResponse(session, {
        error: limitReached ? "This account has reached its 50 Digimon limit." : createdResult?.message ?? "Could not copy the official Digimon.",
        code: limitReached ? "DIGIMON_LIMIT_REACHED" : undefined,
      }, { status: limitReached ? 409 : createdResponse.status });
    }
    digimonId = createdResult[0].id;
    createdId = digimonId;
    if (body.official.skills.length) {
      const skillsResponse = await fetch(`${url}/rest/v1/player_digimon_skills`, {
        method: "POST", headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(body.official.skills.map((skill) => ({ ...skill, player_digimon_id: digimonId }))), cache: "no-store",
      });
      if (!skillsResponse.ok) {
        await fetch(`${url}/rest/v1/player_digimon?id=eq.${encodeURIComponent(digimonId)}`, { method: "DELETE", headers, cache: "no-store" });
        const skillError = await skillsResponse.json().catch(() => ({}));
        return sessionResponse(session, { error: skillError?.message ?? "Could not copy the official Digimon skills." }, { status: skillsResponse.status });
      }
    }
  }
  const slotsResponse = await fetch(`${url}/rest/v1/player_tamer_partners?tamer_id=eq.${encodeURIComponent(body.tamerId)}&select=slot_number&order=slot_number.desc&limit=1`, {
    headers, cache: "no-store",
  });
  const slots = await slotsResponse.json().catch(() => []);
  const slotNumber = Number(slots[0]?.slot_number ?? 0) + 1;
  const partnerResponse = await fetch(`${url}/rest/v1/player_tamer_partners`, {
    method: "POST", headers,
    body: JSON.stringify({ tamer_id: body.tamerId, player_digimon_id: digimonId, slot_number: slotNumber, partner_role: slotNumber === 1 ? "main" : "secondary", is_active: true }),
    cache: "no-store",
  });
  const partner = await partnerResponse.json().catch(() => []);
  if (!partnerResponse.ok || !partner[0]) {
    if (createdId) await fetch(`${url}/rest/v1/player_digimon?id=eq.${encodeURIComponent(createdId)}`, { method: "DELETE", headers, cache: "no-store" });
    return sessionResponse(session, { error: partner?.message ?? "Could not attach the Digimon." }, { status: partnerResponse.status });
  }
  await refreshPartnerPoints(url, headers, body.tamerId);
  return sessionResponse(session, partner[0], { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { tamerId?: string; partnerIds?: string[]; partnerId?: string; playerDigimonId?: string } | null;
  const { url, publishableKey } = authConfig();
  const headers = { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  if (body?.tamerId && body.partnerId && body.playerDigimonId) {
    const digimonResponse = await fetch(`${url}/rest/v1/player_digimon?id=eq.${encodeURIComponent(body.playerDigimonId)}&select=id&limit=1`, {
      headers, cache: "no-store",
    });
    const digimon = await digimonResponse.json().catch(() => []);
    if (!digimonResponse.ok || !digimon[0]) return sessionResponse(session, { error: "That Digimon form is unavailable." }, { status: 404 });
    const response = await fetch(`${url}/rest/v1/player_tamer_partners?id=eq.${encodeURIComponent(body.partnerId)}&tamer_id=eq.${encodeURIComponent(body.tamerId)}`, {
      method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ player_digimon_id: body.playerDigimonId, updated_at: new Date().toISOString() }), cache: "no-store",
    });
    const result = await response.json().catch(() => []);
    if (!response.ok || !result[0]) return sessionResponse(session, { error: "Could not change the partner's evolution." }, { status: response.status || 404 });
    await refreshPartnerPoints(url, headers, body.tamerId);
    return sessionResponse(session, result[0]);
  }
  if (!body?.tamerId || !Array.isArray(body.partnerIds)) return sessionResponse(session, { error: "Invalid partner order." }, { status: 400 });
  for (let index = 0; index < body.partnerIds.length; index += 1) {
    const response = await fetch(`${url}/rest/v1/player_tamer_partners?id=eq.${encodeURIComponent(body.partnerIds[index])}&tamer_id=eq.${encodeURIComponent(body.tamerId)}`, {
      method: "PATCH", headers, body: JSON.stringify({ slot_number: 1000 + index }), cache: "no-store",
    });
    if (!response.ok) return sessionResponse(session, { error: "Could not reorder partners." }, { status: response.status });
  }
  for (let index = 0; index < body.partnerIds.length; index += 1) {
    await fetch(`${url}/rest/v1/player_tamer_partners?id=eq.${encodeURIComponent(body.partnerIds[index])}`, {
      method: "PATCH", headers, body: JSON.stringify({ slot_number: index + 1, partner_role: index === 0 ? "main" : "secondary" }), cache: "no-store",
    });
  }
  await refreshPartnerPoints(url, headers, body.tamerId);
  return sessionResponse(session, { updated: true });
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return sessionResponse(session, { error: "A partner id is required." }, { status: 400 });
  const { url, publishableKey } = authConfig();
  const response = await fetch(`${url}/rest/v1/player_tamer_partners?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", Prefer: "return=representation" },
    cache: "no-store",
  });
  const result = await response.json().catch(() => []);
  if (!response.ok || !result[0]) return sessionResponse(session, { error: "Could not remove the partner." }, { status: response.status || 404 });
  await refreshPartnerPoints(url, {
    apikey: publishableKey, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json",
  }, String(result[0].tamer_id));
  return sessionResponse(session, { deleted: true });
}
