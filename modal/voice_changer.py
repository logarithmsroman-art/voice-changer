"""
Seed-VC voice conversion model wrapper.

Loads SeedVCWrapper on GPU startup and exposes convert_chunk() which
takes raw PCM float32 audio bytes and returns converted audio bytes.
"""

import io
import os
import sys
import tempfile
import urllib.request
import numpy as np
import torch
import torchaudio

# ---------------------------------------------------------------------------
# Model + profile cache (per container instance)
# ---------------------------------------------------------------------------
_wrapper = None
_profile_cache: dict[str, str] = {}  # profile_url → local temp file path


def _load_model():
    """Load SeedVCWrapper on first call; cached for the lifetime of the container."""
    global _wrapper
    if _wrapper is not None:
        return _wrapper

    sys.path.insert(0, "/opt/seed-vc")
    try:
        from seed_vc_wrapper import SeedVCWrapper  # type: ignore
        _wrapper = SeedVCWrapper()
        print("[voice_changer] SeedVCWrapper loaded")
    except Exception as e:
        print(f"[voice_changer] WARNING: SeedVCWrapper not loaded ({e}) — using passthrough")
        _wrapper = None

    return _wrapper


def _get_ref_path(profile_url: str) -> str:
    """Download reference audio to a temp file once; return path."""
    if profile_url in _profile_cache:
        return _profile_cache[profile_url]

    print(f"[voice_changer] Downloading profile: {profile_url}")
    ext = profile_url.rsplit(".", 1)[-1] if "." in profile_url.split("/")[-1] else "wav"

    # Use a browser User-Agent — Cloudflare R2 blocks Python's default UA
    req = urllib.request.Request(
        profile_url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; VoiceChanger/1.0)"},
    )
    with urllib.request.urlopen(req) as resp:
        data = resp.read()

    tmp = tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False)
    tmp.write(data)
    tmp.close()
    _profile_cache[profile_url] = tmp.name
    print(f"[voice_changer] Profile cached at {tmp.name}")
    return tmp.name


def convert_chunk(audio_bytes: bytes, profile_url: str, sample_rate: int = 16000) -> bytes:
    """
    Convert a PCM float32 audio chunk to the target voice.

    Args:
        audio_bytes: Raw PCM float32 LE bytes (mono, 16 kHz)
        profile_url: URL of the voice sample stored in R2
        sample_rate: Input sample rate (should always be 16000)

    Returns:
        Raw PCM float32 LE bytes of converted audio
    """
    sys.path.insert(0, "/opt/seed-vc")
    wrapper = _load_model()

    # Decode input bytes → tensor [1, T]
    audio_np = np.frombuffer(audio_bytes, dtype=np.float32).copy()
    source_t = torch.tensor(audio_np).unsqueeze(0)

    if wrapper is None:
        # Passthrough — model not loaded
        return source_t.squeeze(0).numpy().astype(np.float32).tobytes()

    # Seed-VC runs at 22050 Hz — upsample from 16 kHz
    source_22k = torchaudio.functional.resample(source_t, sample_rate, 22050)

    # Write source to a temp WAV so SeedVCWrapper can read it
    src_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    torchaudio.save(src_tmp.name, source_22k, 22050)
    src_tmp.close()

    try:
        ref_path = _get_ref_path(profile_url)
        # convert_voice is a generator that yields (mp3_bytes, full_audio) tuples.
        # When stream_output=False it uses `return` inside the generator body, so
        # list() would return [] — must use stream_output=True to get actual output.
        # convert_voice yields (mp3_bytes, full_audio) where full_audio is a
        # 1-D numpy array at 22050 Hz (f0_condition=False). stream_output=False
        # uses `return` inside a generator so list() gives [] — must use True.
        out_sr = 22050
        full_audio_np = None
        for _mp3_bytes, audio in wrapper.convert_voice(
            source=src_tmp.name,
            target=ref_path,
            diffusion_steps=10,
            inference_cfg_rate=0.9,
            f0_condition=False,
            auto_f0_adjust=True,
            pitch_shift=0,
            stream_output=True,
        ):
            # full_audio is (sample_rate, numpy_array) on the last chunk
            if audio is not None:
                out_sr, full_audio_np = audio

        if full_audio_np is None:
            print("[voice_changer] No output from convert_voice — passthrough")
            return audio_bytes

        out_t = torch.from_numpy(full_audio_np.astype(np.float32)).unsqueeze(0)

        # Downsample model SR → 16 kHz for browser playback
        out_16k = torchaudio.functional.resample(out_t, out_sr, sample_rate)
        result = out_16k.squeeze(0).numpy().astype(np.float32)

        # BigVGAN outputs very quiet audio — normalize to match input RMS
        input_rms = float(np.sqrt(np.mean(audio_np ** 2))) + 1e-8
        output_rms = float(np.sqrt(np.mean(result ** 2))) + 1e-8
        result = result * (input_rms / output_rms)
        # Hard-clip to prevent distortion
        result = np.clip(result, -1.0, 1.0)

        print(f"[voice_changer] OK: in_rms={input_rms:.4f} out_rms_before={output_rms:.4f} gain={input_rms/output_rms:.1f}x", flush=True)
        return result.tobytes()

    except Exception as e:
        print(f"[voice_changer] Conversion error: {e}")
        return audio_bytes  # passthrough on error

    finally:
        os.unlink(src_tmp.name)
