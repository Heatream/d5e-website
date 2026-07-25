import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, authConfig, clearSessionCookies } from "../../../lib/server-auth";

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const { url, publishableKey } = authConfig();
    await fetch(`${url}/auth/v1/logout`, { method: "POST", headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` }, cache: "no-store" }).catch(() => undefined);
  }
  return clearSessionCookies(NextResponse.json({ loggedOut: true }));
}
