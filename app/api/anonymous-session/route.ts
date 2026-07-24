import { NextRequest, NextResponse } from "next/server";

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return { url, key };
}

export async function POST(request: NextRequest) {
  try {
    const { url, key } = config();
    const body = await request.json().catch(() => ({})) as { refreshToken?: string };
    const refresh = body.refreshToken?.trim();
    const endpoint = refresh ? `${url}/auth/v1/token?grant_type=refresh_token` : `${url}/auth/v1/signup`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(refresh ? { refresh_token: refresh } : {}),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: result?.msg ?? result?.message ?? "Unable to create an anonymous session." }, { status: response.status });
    }
    return NextResponse.json({
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + Number(result.expires_in ?? 3600),
      userId: result.user?.id,
    });
  } catch {
    return NextResponse.json({ error: "Anonymous sessions are unavailable." }, { status: 500 });
  }
}
