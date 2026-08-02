import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../../lib/server-auth";

type Payload = { tamerId?: string; specialSkill?: Record<string, unknown>; builderChoices?: Record<string, unknown> };

export async function PUT(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const body = await request.json().catch(() => null) as Payload | null;
  if (!body?.tamerId || !body.specialSkill || !body.builderChoices) {
    return sessionResponse(session, { error: "Complete the Double Landing Special Skill." }, { status: 400 });
  }
  const { url, publishableKey } = authConfig();
  const headers = { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" };
  const select = "level,tamer_subclasses!inner(slug),player_tamer_partners(id)";
  const response = await fetch(`${url}/rest/v1/player_tamers?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(body.tamerId)}`, { headers, cache: "no-store" });
  const rows = await response.json().catch(() => []);
  const tamer = rows[0] as { level?: number; tamer_subclasses?: { slug?: string }; player_tamer_partners?: unknown[] } | undefined;
  if (!tamer || tamer.tamer_subclasses?.slug?.toLowerCase() !== "dual-wielder") {
    return sessionResponse(session, { error: "That Dual Wielder could not be found." }, { status: 404 });
  }
  if (Number(tamer.level ?? 1) < 17) return sessionResponse(session, { error: "Bond unlocks at level 17." }, { status: 400 });
  if ((tamer.player_tamer_partners?.length ?? 0) < 2) return sessionResponse(session, { error: "Double Landing requires two partners." }, { status: 400 });

  const payload = {
    tamer_id: body.tamerId, special_skill: body.specialSkill, builder_choices: body.builderChoices,
    updated_at: new Date().toISOString(),
  };
  const saved = await fetch(`${url}/rest/v1/player_tamer_dual_wielder?on_conflict=tamer_id`, {
    method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload), cache: "no-store",
  });
  const result = await saved.json().catch(() => []);
  if (!saved.ok) return sessionResponse(session, { error: result?.message ?? "Could not save Double Landing." }, { status: saved.status });
  return sessionResponse(session, result[0] ?? payload);
}
