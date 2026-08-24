import { NextRequest, NextResponse } from "next/server";
import { requireSession, sessionResponse } from "../../../lib/server-auth";
import { previewSharedTamer } from "../../../lib/tamer-share";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "Log in to import a character." }, { status: 401 });
  try {
    const preview = await previewSharedTamer(new URL(request.url).searchParams.get("code") ?? "");
    if (!preview) return sessionResponse(session, { error: "Character code not found." }, { status: 404 });
    return sessionResponse(session, preview);
  } catch {
    return sessionResponse(session, { error: "Character sharing is currently unavailable." }, { status: 503 });
  }
}
