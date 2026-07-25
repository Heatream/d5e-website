import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Anonymous sessions have been retired. Create a D5e account instead." },
    { status: 410 },
  );
}
