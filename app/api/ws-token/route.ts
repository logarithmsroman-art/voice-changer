export const runtime = "edge";
import { NextResponse } from "next/server";

export async function GET() {
  const wsUrl = process.env.MODAL_WS_URL;
  if (!wsUrl) {
    return NextResponse.json({ error: "MODAL_WS_URL not configured" }, { status: 503 });
  }
  return NextResponse.json({ url: wsUrl });
}
