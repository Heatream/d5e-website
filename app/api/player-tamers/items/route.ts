import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../../lib/server-auth";

type InventoryEntry = {
  itemId?: number | null;
  customName?: string | null;
  customDescription?: string | null;
  quantity?: number;
};

export async function PUT(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { tamerId?: string; items?: InventoryEntry[] } | null;
  if (!body?.tamerId || !Array.isArray(body.items)) return sessionResponse(session, { error: "Invalid inventory data." }, { status: 400 });

  const { url, publishableKey } = authConfig();
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
  const ownerResponse = await fetch(`${url}/rest/v1/player_tamers?id=eq.${encodeURIComponent(body.tamerId)}&select=id`, { headers, cache: "no-store" });
  const owned = await ownerResponse.json().catch(() => []);
  if (!ownerResponse.ok || !Array.isArray(owned) || !owned[0]) return sessionResponse(session, { error: "Tamer not found." }, { status: 404 });

  const rows = body.items.map((entry) => ({
    tamer_id: body.tamerId,
    item_id: entry.itemId == null ? null : Number(entry.itemId),
    custom_name: entry.itemId == null ? String(entry.customName ?? "").trim().slice(0, 100) || null : null,
    custom_description: entry.itemId == null ? String(entry.customDescription ?? "").trim().slice(0, 1000) : null,
    quantity: Math.max(1, Math.min(9999, Math.trunc(Number(entry.quantity ?? 1)))),
  }));
  if (rows.some((row) => row.item_id == null && !row.custom_name)) return sessionResponse(session, { error: "Custom items require a name." }, { status: 400 });

  const remove = await fetch(`${url}/rest/v1/player_tamer_items?tamer_id=eq.${encodeURIComponent(body.tamerId)}`, {
    method: "DELETE", headers: { ...headers, Prefer: "return=minimal" }, cache: "no-store",
  });
  if (!remove.ok) return sessionResponse(session, { error: "Could not update the inventory." }, { status: remove.status });
  if (rows.length) {
    const insert = await fetch(`${url}/rest/v1/player_tamer_items`, {
      method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(rows), cache: "no-store",
    });
    if (!insert.ok) {
      const error = await insert.json().catch(() => ({}));
      return sessionResponse(session, { error: error?.message ?? "Could not save the inventory." }, { status: insert.status });
    }
  }
  return sessionResponse(session, { saved: true });
}
