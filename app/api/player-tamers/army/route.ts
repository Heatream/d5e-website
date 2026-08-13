import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../../lib/server-auth";

type ArmyMemberPayload = {
  name?: string;
  field_id?: number;
  main_ability?: string;
  stage?: string;
  image_path?: string | null;
  is_xrossed?: boolean;
};

const ABILITIES = new Set(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);
const STAGES = new Set(["Rookie", "Champion", "Ultimate", "Mega", "7th Stage"]);

export async function PUT(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { tamerId?: string; members?: ArmyMemberPayload[] } | null;
  if (!body?.tamerId || !Array.isArray(body.members)) {
    return sessionResponse(session, { error: "Invalid Army data." }, { status: 400 });
  }
  const members = body.members.map((member) => ({
    name: String(member.name ?? "").trim(),
    field_id: Number(member.field_id),
    main_ability: String(member.main_ability ?? "").toLowerCase(),
    stage: String(member.stage ?? ""),
    image_path: String(member.image_path ?? "").trim() || null,
    is_xrossed: Boolean(member.is_xrossed),
  }));
  if (members.some((member) => !member.name || !Number.isInteger(member.field_id)
    || !ABILITIES.has(member.main_ability) || !STAGES.has(member.stage))) {
    return sessionResponse(session, { error: "Every Army Digimon needs a name, Field, main stat, and valid stage." }, { status: 400 });
  }
  const { url, publishableKey } = authConfig();
  const response = await fetch(`${url}/rest/v1/rpc/replace_tamer_army`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ target_tamer_id: body.tamerId, members }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => []);
  if (!response.ok) {
    const message = String(result?.message ?? "");
    const error = message.includes("D5E_ARMY_LIMIT_REACHED")
      ? "The Army cannot exceed maximum Partner Points."
      : message.includes("D5E_ARMY_STAGE_NOT_ALLOWED")
        ? "That Army Digimon stage is not allowed in its current slot."
        : "Could not save the Digimon Army.";
    return sessionResponse(session, { error }, { status: 409 });
  }
  return sessionResponse(session, result);
}

export async function PATCH(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { tamerId?: string; memberId?: string; clear?: boolean } | null;
  if (!body?.tamerId || (!body.memberId && !body.clear)) {
    return sessionResponse(session, { error: "Invalid Digixross request." }, { status: 400 });
  }
  const { url, publishableKey } = authConfig();
  const response = await fetch(`${url}/rest/v1/rpc/update_tamer_army_xross`, {
    method: "POST",
    headers: { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ target_tamer_id: body.tamerId, target_member_id: body.memberId ?? null, clear_all: Boolean(body.clear) }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => []);
  if (!response.ok) return sessionResponse(session, { error: "Could not update Digixross." }, { status: 409 });
  return sessionResponse(session, result);
}
