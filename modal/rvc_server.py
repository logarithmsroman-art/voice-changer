"""
Modal WebSocket server for real-time RVC voice conversion.

Deploy:
    modal deploy modal/rvc_server.py

Protocol (client → server):
    Binary frame:  Raw PCM float32 LE audio chunk (mono, 16kHz)
    Text frame:    JSON {"type": "model", "pth_url": "...", "index_url": "..."}
                   JSON {"type": "config", "pitch": 0}

Protocol (server → client):
    Binary frame:  Raw PCM float32 LE converted audio chunk
"""

import json
import asyncio
import tempfile
import os
import urllib.request
import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "build-essential", "libsndfile1")
    # Install numpy + torch first so downstream packages can find them at build time
    .pip_install("numpy==1.26.4", "torch", "torchaudio")
    # Install all rvc-python runtime deps at known-good versions
    .pip_install(
        "scipy",
        "faiss-cpu",
        "librosa",
        "soundfile",
        "fastapi",
        "praat-parselmouth",
        "pyworld",
    )
    # Install rvc-python without its deps so it cannot force-downgrade numpy
    .run_commands("pip install rvc-python --no-deps")
)

app = modal.App("rvc-voice-changer", image=image)

# Per-container caches — survive across WebSocket connections on the same container
_model_cache: dict = {}   # pth_url  → RVCInference instance
_index_cache: dict = {}   # index_url → local .index file path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download(url: str, suffix: str) -> str:
    """Download a URL to a temp file and return its path."""
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; VoiceChanger/1.0)"}
    )
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp.write(data)
    tmp.close()
    print(f"[rvc] Downloaded {len(data)} bytes → {tmp.name}", flush=True)
    return tmp.name


def _convert(
    rvc_instance,
    audio_bytes: bytes,
    index_path: str | None,
    pitch: int,
) -> bytes:
    """Run RVC inference on a PCM float32 chunk and return converted PCM float32."""
    import numpy as np
    import soundfile as sf

    audio_np = np.frombuffer(audio_bytes, dtype=np.float32).copy()

    in_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(in_tmp.name, audio_np, 16000, subtype="PCM_16")
    in_tmp.close()

    out_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    out_tmp.close()

    try:
        rvc_instance.infer_file(
            input_path=in_tmp.name,
            output_path=out_tmp.name,
            f0method="rmvpe",
            f0up_key=pitch,
            index_path=index_path or "",
            index_rate=0.75 if index_path else 0.0,
            filter_radius=3,
            resample_sr=16000,
            rms_mix_rate=0.25,
            protect=0.33,
        )

        out_np, _ = sf.read(out_tmp.name, dtype="float32")
        if out_np.ndim > 1:
            out_np = out_np[:, 0]

        # Normalize output RMS to match input so volume stays consistent
        in_rms = float(np.sqrt(np.mean(audio_np ** 2))) + 1e-8
        out_rms = float(np.sqrt(np.mean(out_np ** 2))) + 1e-8
        out_np = out_np * (in_rms / out_rms)
        out_np = np.clip(out_np, -1.0, 1.0)

        print(f"[rvc] OK pitch={pitch} index={'yes' if index_path else 'no'}", flush=True)
        return out_np.astype(np.float32).tobytes()

    except Exception as e:
        print(f"[rvc] Conversion error: {e}", flush=True)
        return audio_bytes  # passthrough on error

    finally:
        os.unlink(in_tmp.name)
        try:
            os.unlink(out_tmp.name)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# WebSocket server
# ---------------------------------------------------------------------------

@app.function(
    gpu="A10G",
    min_containers=0,
    timeout=3600,
    max_containers=10,
)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect

    fastapi_app = FastAPI()

    @fastapi_app.get("/health")
    async def health():
        return {"status": "ok"}

    @fastapi_app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket):
        await websocket.accept()
        active_pth_url: str | None = None
        active_index_url: str | None = None
        pitch: int = 0

        print("[rvc] Client connected", flush=True)

        try:
            while True:
                message = await websocket.receive()

                if "text" in message and message["text"]:
                    try:
                        data = json.loads(message["text"])

                        if data.get("type") == "model":
                            pth_url = data.get("pth_url")
                            idx_url = data.get("index_url") or None

                            if pth_url and pth_url not in _model_cache:
                                print(f"[rvc] Loading model: {pth_url}", flush=True)
                                from rvc_python.infer import RVCInference
                                pth_path = _download(pth_url, ".pth")
                                instance = RVCInference(device="cuda:0")
                                instance.load_model(pth_path)
                                _model_cache[pth_url] = instance
                                print("[rvc] Model ready", flush=True)

                            active_pth_url = pth_url

                            if idx_url and idx_url not in _index_cache:
                                print(f"[rvc] Downloading index: {idx_url}", flush=True)
                                _index_cache[idx_url] = _download(idx_url, ".index")

                            active_index_url = idx_url

                        elif data.get("type") == "config":
                            pitch = int(data.get("pitch", 0))
                            print(f"[rvc] Pitch set to {pitch}", flush=True)

                    except Exception as e:
                        print(f"[rvc] Control error: {e}", flush=True)

                elif "bytes" in message and message["bytes"]:
                    audio_bytes = message["bytes"]
                    samples = len(audio_bytes) // 4
                    print(f"[rvc] Audio: {len(audio_bytes)} bytes = {samples} samples", flush=True)

                    if not active_pth_url or active_pth_url not in _model_cache:
                        print("[rvc] No model loaded — echoing back", flush=True)
                        await websocket.send_bytes(audio_bytes)
                        continue

                    index_path = _index_cache.get(active_index_url) if active_index_url else None

                    converted = await asyncio.get_event_loop().run_in_executor(
                        None,
                        _convert,
                        _model_cache[active_pth_url],
                        audio_bytes,
                        index_path,
                        pitch,
                    )
                    print(f"[rvc] Sending {len(converted)} bytes", flush=True)
                    await websocket.send_bytes(converted)

        except WebSocketDisconnect:
            print("[rvc] Client disconnected", flush=True)
        except Exception as e:
            print(f"[rvc] Error: {e}", flush=True)
            await websocket.close()

    return fastapi_app
