export async function POST(req: Request) {
  const body = await req.json();

  const wsUrl = process.env.MODAL_WS_URL ?? "";
  const base = wsUrl.replace("wss://", "https://").replace(/\/ws$/, "");

  const resp = await fetch(`${base}/tts-convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    return new Response(await resp.text(), { status: resp.status });
  }

  const audio = await resp.arrayBuffer();
  return new Response(audio, {
    headers: { "Content-Type": "application/octet-stream" },
  });
}
