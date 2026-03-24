import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { deleteFromR2, keyFromUrl } from "@/lib/r2";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: profile, error: fetchErr } = await supabase
    .from("voice_profiles")
    .select("sample_url")
    .eq("id", id)
    .single();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 404 });

  // Delete from R2
  await deleteFromR2(keyFromUrl(profile.sample_url));

  // Delete from Supabase
  const { error } = await supabase.from("voice_profiles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  // If setting active, clear other actives first
  if (body.is_active) {
    await supabase.from("voice_profiles").update({ is_active: false }).neq("id", id);
  }

  const { data, error } = await supabase
    .from("voice_profiles")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
