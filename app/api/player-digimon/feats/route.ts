import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../../lib/server-auth";

type FeatRequest = {
  digimonId?: unknown;
  featIds?: unknown;
};

export async function PUT(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });

  const body = await request.json().catch(() => null) as FeatRequest | null;
  const digimonId = typeof body?.digimonId === "string" ? body.digimonId.trim() : "";
  const featIds = Array.isArray(body?.featIds) ? body.featIds : null;
  if (!digimonId || !featIds || featIds.some((id) => !Number.isInteger(id) || Number(id) <= 0)) {
    return sessionResponse(session, { error: "Choose valid Digimon feats." }, { status: 400 });
  }

  const { url, publishableKey } = authConfig();
  const response = await fetch(`${url}/rest/v1/rpc/replace_player_digimon_feats`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_digimon_id: digimonId, p_feat_ids: featIds }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    return sessionResponse(session, { error: result?.message ?? "Could not update feats." }, { status: response.status });
  }
  return sessionResponse(session, { feats: result });
}
