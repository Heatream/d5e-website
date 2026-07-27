import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../../lib/server-auth";

type HeldItemRequest = {
  digimonId?: unknown;
  itemIds?: unknown;
};

export async function PUT(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });

  const body = await request.json().catch(() => null) as HeldItemRequest | null;
  const digimonId = typeof body?.digimonId === "string" ? body.digimonId.trim() : "";
  const itemIds = Array.isArray(body?.itemIds) ? body.itemIds : null;
  if (!digimonId || !itemIds || itemIds.length > 2 || itemIds.some((id) => id !== null && (!Number.isInteger(id) || Number(id) <= 0))) {
    return sessionResponse(session, { error: "Choose up to two valid held items." }, { status: 400 });
  }

  const { url, publishableKey } = authConfig();
  const response = await fetch(`${url}/rest/v1/rpc/replace_player_digimon_items`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_digimon_id: digimonId, p_item_ids: itemIds }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    return sessionResponse(session, { error: result?.message ?? "Could not update held items." }, { status: response.status });
  }
  return sessionResponse(session, { items: result });
}
