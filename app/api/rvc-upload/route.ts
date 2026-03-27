import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase";
import { randomUUID } from "crypto";

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB — model files can be large

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const pthFile = formData.get("pth") as File | null;
  const indexFile = formData.get("index") as File | null;
  const name = formData.get("name") as string | null;

  if (!pthFile) return NextResponse.json({ error: "No .pth file provided" }, { status: 400 });
  if (!name?.trim()) return NextResponse.json({ error: "No model name provided" }, { status: 400 });
  if (pthFile.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 500 MB)" }, { status: 400 });
  }

  const uuid = randomUUID();

  // Upload .pth file
  const pthKey = `rvc-models/${uuid}.pth`;
  const pthBuffer = Buffer.from(await pthFile.arrayBuffer());
  const pthUrl = await uploadToR2(pthKey, pthBuffer, "application/octet-stream");

  // Upload .index file if provided
  let indexUrl: string | null = null;
  if (indexFile && indexFile.size > 0) {
    const indexKey = `rvc-models/${uuid}.index`;
    const indexBuffer = Buffer.from(await indexFile.arrayBuffer());
    indexUrl = await uploadToR2(indexKey, indexBuffer, "application/octet-stream");
  }

  // Save metadata to Supabase
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("rvc_models")
    .insert({ name: name.trim(), pth_url: pthUrl, index_url: indexUrl })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
