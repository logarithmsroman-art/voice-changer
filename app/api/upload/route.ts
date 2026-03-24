import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = ["audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac"];
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = formData.get("name") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!name?.trim()) return NextResponse.json({ error: "No profile name provided" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Upload .wav, .mp3, or .m4a" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "wav";
  const key = `profiles/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const url = await uploadToR2(key, buffer, file.type);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("voice_profiles")
    .insert({ name: name.trim(), sample_url: url })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
