"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import RvcVoiceChanger from "@/components/RvcVoiceChanger";
import RvcModelSelector, { type RvcModel } from "@/components/RvcModelSelector";
import RvcUploader from "@/components/RvcUploader";

export default function RvcPage() {
  const [activeModel, setActiveModel] = useState<RvcModel | null>(null);
  const [pitch, setPitch] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="min-h-screen bg-[#0f172a] text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-400" />
          <span className="font-semibold tracking-tight text-lg">VoiceShift</span>
          <span className="text-xs font-medium bg-emerald-900/50 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full">
            RVC
          </span>
        </div>
        <Link
          href="/"
          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          ← Seed-VC
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-10 max-w-xl mx-auto w-full">

        {/* Model selector */}
        <section className="w-full">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Active RVC Model
          </h2>
          <RvcModelSelector
            key={refreshKey}
            selected={activeModel}
            onSelect={setActiveModel}
          />
          {activeModel && (
            <p className="mt-2 text-xs text-zinc-500">
              Using:{" "}
              <span className="text-emerald-400">{activeModel.name}</span>
              {activeModel.index_url
                ? <span className="text-zinc-600"> · with index</span>
                : <span className="text-zinc-600"> · no index</span>
              }
            </p>
          )}
        </section>

        {/* Pitch control */}
        <section className="w-full">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
              Pitch Shift
            </h2>
            <span className="text-sm font-mono text-cyan-400">
              {pitch > 0 ? `+${pitch}` : pitch} semitones
            </span>
          </div>
          <input
            type="range"
            min={-24}
            max={24}
            step={1}
            value={pitch}
            onChange={(e) => setPitch(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>-24 (lower)</span>
            <button
              onClick={() => setPitch(0)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Reset
            </button>
            <span>+24 (higher)</span>
          </div>
        </section>

        {/* Voice changer */}
        <section className="w-full">
          <RvcVoiceChanger activeModel={activeModel} pitch={pitch} />
        </section>

        {/* Upload model */}
        <section className="w-full">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Upload Trained Model
          </h2>
          <RvcUploader onUploaded={handleUploaded} />
          <p className="mt-2 text-xs text-zinc-600">
            Train your model externally (Google Colab, Applio, etc.) then upload the{" "}
            <span className="text-zinc-400">.pth</span> and optionally the{" "}
            <span className="text-zinc-400">.index</span> file here.
          </p>
        </section>

      </main>
    </div>
  );
}
