"use client";

import { useState } from "react";
import Link from "next/link";
import VoiceChanger from "@/components/VoiceChanger";
import ProfileSelector from "@/components/ProfileSelector";
import type { VoiceProfile } from "@/lib/supabase";

const SAMPLE_RATE = 16000;

function playPcmFloat32(buffer: ArrayBuffer) {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const float32 = new Float32Array(buffer);
  const audioBuffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
  audioBuffer.copyToChannel(float32, 0);
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start();
}

export default function Home() {
  const [activeProfile, setActiveProfile] = useState<VoiceProfile | null>(null);
  const [ttsText, setTtsText] = useState("");
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#0f172a] text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400" />
          <span className="font-semibold tracking-tight text-lg">VoiceShift</span>
        </div>
        <Link
          href="/setup"
          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Manage voices →
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-10 max-w-xl mx-auto w-full">
        {/* Profile selector */}
        <section className="w-full">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Active Voice
          </h2>
          <ProfileSelector selected={activeProfile} onSelect={setActiveProfile} />
          {activeProfile && (
            <p className="mt-2 text-xs text-zinc-500">
              Converting to:{" "}
              <span className="text-violet-400">{activeProfile.name}</span>
            </p>
          )}
        </section>

        {/* Voice changer */}
        <section className="w-full">
          <VoiceChanger activeProfileUrl={activeProfile?.sample_url ?? null} />
        </section>

        {/* TTS test panel */}
        <section className="w-full">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Test Voice (no mic)
          </h2>
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex flex-col gap-3">
            <textarea
              className="w-full bg-zinc-800 text-zinc-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-600"
              rows={3}
              placeholder="Type anything… click Generate to hear it in the active voice"
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
            />
            {ttsError && (
              <p className="text-xs text-red-400">{ttsError}</p>
            )}
            <button
              disabled={ttsLoading || !ttsText.trim() || !activeProfile}
              onClick={async () => {
                if (!activeProfile) return;
                setTtsLoading(true);
                setTtsError(null);
                try {
                  const resp = await fetch("/api/tts-convert", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      text: ttsText.trim(),
                      profile_url: activeProfile.sample_url,
                    }),
                  });
                  if (!resp.ok) {
                    const msg = await resp.text();
                    setTtsError(`Error ${resp.status}: ${msg}`);
                    return;
                  }
                  playPcmFloat32(await resp.arrayBuffer());
                } catch (e: unknown) {
                  setTtsError(e instanceof Error ? e.message : "Unknown error");
                } finally {
                  setTtsLoading(false);
                }
              }}
              className="self-end px-5 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {ttsLoading ? "Generating…" : "Generate"}
            </button>
            {!activeProfile && (
              <p className="text-xs text-zinc-600">Select an active voice above to enable this test.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
