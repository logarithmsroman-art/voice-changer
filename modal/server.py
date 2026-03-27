"""
Modal WebSocket server for real-time voice conversion.

Deploy:
    modal deploy server.py

The server exposes a single WebSocket endpoint at /ws.

Protocol (client → server):
    Binary frame:  Raw PCM float32 LE audio chunk (mono, 16kHz)
    Text frame:    JSON {"type": "profile", "url": "<R2 URL>"}

Protocol (server → client):
    Binary frame:  Raw PCM float32 LE converted audio chunk

The GPU stays warm (keep_warm=1) to avoid cold-start latency.
"""

import json
import asyncio
import modal

# ---------------------------------------------------------------------------
# Modal app definition
# ---------------------------------------------------------------------------

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg")
    .pip_install(
        "torch",
        "torchaudio",
        "numpy",
        "scipy",
        "huggingface_hub",
        "websockets",
        "fastapi",
        "einops",
        "librosa",
        "conformer",
        "diffusers",
        "transformers",
        "accelerate",
        "soundfile",
        "pydub",
        "edge-tts",
    )
    .run_commands(
        "git clone https://github.com/Plachtaa/seed-vc.git /opt/seed-vc",
        "pip install -r /opt/seed-vc/requirements.txt || true",
    )
    .env({"PYTHONPATH": "/opt/seed-vc"})
    .add_local_file(
        "/Users/macpro/Documents/web-me/voice-changer-app/modal/voice_changer.py",
        remote_path="/root/voice_changer.py",
    )
)

app = modal.App("voice-changer", image=image)


# ---------------------------------------------------------------------------
# WebSocket server
# ---------------------------------------------------------------------------

@app.function(
    gpu="A10G",
    min_containers=0,
    timeout=3600,  # 1 hour max session
    max_containers=10,
)
@modal.asgi_app()
def web():
    """ASGI app wrapping the WebSocket endpoint."""
    from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
    from voice_changer import convert_chunk, _load_model, _wrapper

    fastapi_app = FastAPI()

    # Pre-load model on startup
    _load_model()

    @fastapi_app.get("/health")
    async def health():
        return {"status": "ok", "model_loaded": _wrapper is not None}

    @fastapi_app.post("/tts-convert")
    async def tts_convert(request: Request):
        import asyncio
        import tempfile
        import os
        import edge_tts
        import librosa
        import numpy as np
        from voice_changer import convert_chunk

        body = await request.json()
        text = body.get("text", "")
        profile_url = body.get("profile_url", "")

        if not text or not profile_url:
            from fastapi.responses import JSONResponse
            return JSONResponse({"error": "text and profile_url required"}, status_code=400)

        # Generate TTS audio to a temp file
        tts_tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tts_tmp.close()
        try:
            communicate = edge_tts.Communicate(text, "en-US-AriaNeural")
            await communicate.save(tts_tmp.name)

            # Load audio at 16 kHz mono
            audio_np, _ = librosa.load(tts_tmp.name, sr=16000, mono=True)
            audio_bytes = audio_np.astype(np.float32).tobytes()

            # Run voice conversion in thread pool
            loop = asyncio.get_event_loop()
            converted = await loop.run_in_executor(None, convert_chunk, audio_bytes, profile_url)

            from fastapi.responses import Response
            return Response(content=converted, media_type="application/octet-stream")
        finally:
            os.unlink(tts_tmp.name)

    @fastapi_app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket):
        await websocket.accept()
        active_profile_url: str | None = None

        print("[server] Client connected")

        try:
            while True:
                # Receive next message (text or binary)
                message = await websocket.receive()

                if "text" in message and message["text"]:
                    # Control message (profile selection)
                    try:
                        data = json.loads(message["text"])
                        if data.get("type") == "profile":
                            active_profile_url = data["url"]
                            print(f"[server] Profile set: {active_profile_url}")
                    except json.JSONDecodeError:
                        pass

                elif "bytes" in message and message["bytes"]:
                    audio_bytes = message["bytes"]
                    samples = len(audio_bytes) // 4
                    print(f"[server] Audio received: {len(audio_bytes)} bytes = {samples} samples", flush=True)

                    if not active_profile_url:
                        print("[server] No profile yet — echoing back", flush=True)
                        await websocket.send_bytes(audio_bytes)
                        continue

                    # Run conversion in thread pool to avoid blocking event loop
                    converted = await asyncio.get_event_loop().run_in_executor(
                        None,
                        convert_chunk,
                        audio_bytes,
                        active_profile_url,
                    )
                    print(f"[server] Sending back {len(converted)} bytes", flush=True)
                    await websocket.send_bytes(converted)

        except WebSocketDisconnect:
            print("[server] Client disconnected")
        except Exception as e:
            print(f"[server] Error: {e}")
            await websocket.close()

    return fastapi_app
