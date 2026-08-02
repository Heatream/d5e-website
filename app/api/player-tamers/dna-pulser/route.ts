import { NextRequest, NextResponse } from "next/server";
import { authConfig, requireSession, sessionResponse } from "../../../lib/server-auth";

const ALLOWED_FEATURES = new Set(["power-of-friendship", "fated-encounter", "spirit-evolution", "digimon-army"]);

export async function PUT(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "A permanent account is required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { tamerId?: string; adaptedFeatureId?: number | null } | null;
  if (!body?.tamerId || (body.adaptedFeatureId != null && !Number.isInteger(Number(body.adaptedFeatureId)))) {
    return sessionResponse(session, { error: "Invalid Adaptation selection." }, { status: 400 });
  }

  const { url, publishableKey } = authConfig();
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
  const tamerResponse = await fetch(`${url}/rest/v1/player_tamers?id=eq.${encodeURIComponent(body.tamerId)}&select=subclass_id`, { headers, cache: "no-store" });
  const tamers = await tamerResponse.json().catch(() => []);
  if (!tamerResponse.ok || !tamers[0]) return sessionResponse(session, { error: "Tamer not found." }, { status: 404 });
  const subclassResponse = await fetch(`${url}/rest/v1/tamer_subclasses?id=eq.${encodeURIComponent(String(tamers[0].subclass_id))}&select=slug`, { headers, cache: "no-store" });
  const subclasses = await subclassResponse.json().catch(() => []);
  if (!subclassResponse.ok || subclasses[0]?.slug !== "dna-pulser") {
    return sessionResponse(session, { error: "Adaptation is only available to DNA Pulsers." }, { status: 409 });
  }

  let featureId: number | null = null;
  if (body.adaptedFeatureId != null) {
    featureId = Number(body.adaptedFeatureId);
    const featureResponse = await fetch(`${url}/rest/v1/tamer_subclass_features?id=eq.${featureId}&select=id,slug,level_required`, { headers, cache: "no-store" });
    const features = await featureResponse.json().catch(() => []);
    if (!featureResponse.ok || !features[0] || !ALLOWED_FEATURES.has(String(features[0].slug)) || Number(features[0].level_required) !== 2) {
      return sessionResponse(session, { error: "That feature cannot be selected for Adaptation." }, { status: 400 });
    }
  }

  const response = await fetch(`${url}/rest/v1/player_tamer_dna_pulser?on_conflict=tamer_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ tamer_id: body.tamerId, adapted_feature_id: featureId, updated_at: new Date().toISOString() }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => []);
  if (!response.ok) return sessionResponse(session, { error: result?.message ?? "Could not save Adaptation." }, { status: response.status });
  return sessionResponse(session, result[0] ?? result);
}
