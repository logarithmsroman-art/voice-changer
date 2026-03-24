"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Uploader from "@/components/Uploader";
import type { VoiceProfile } from "@/lib/supabase";

export default function SetupPage() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/profiles");
    if (res.ok) setProfiles(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const deleteProfile = async (id: string) => {
    if (!confirm("Delete this voice profile?")) return;
    setDeleting(id);
    await fetch(`/api/profiles/${id}`, { method: "DELETE" });
    setDeleting(null);
    fetchProfiles();
  };

  const setActive = async (id: string, current: boolean) => {
    await fetch(`/api/profiles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    });
    fetchProfiles();
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400" />
          <span className="font-semibold tracking-tight text-lg">VoiceShift</span>
        </div>
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          ← Back to changer
        </Link>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 flex flex-col gap-10">
        {/* Upload section */}
        <section>
          <h1 className="text-xl font-semibold mb-1">Voice Profiles</h1>
          <p className="text-sm text-zinc-500 mb-6">
            Upload 10–30 seconds of a target voice. Seed-VC will clone it in real time.
          </p>
          <div className="bg-[#1e293b] rounded-xl p-6">
            <Uploader onUploaded={fetchProfiles} />
          </div>
        </section>

        {/* Profiles list */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
            Saved Profiles
          </h2>

          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-zinc-500">No profiles yet. Upload one above.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {profiles.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between bg-[#1e293b] rounded-xl px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${p.is_active ? "bg-emerald-400" : "bg-zinc-600"}`}
                    />
                    <span className="text-sm font-medium">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActive(p.id, p.is_active)}
                      className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                        p.is_active
                          ? "bg-emerald-900/50 text-emerald-400"
                          : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                      }`}
                    >
                      {p.is_active ? "Active" : "Set active"}
                    </button>
                    <button
                      onClick={() => deleteProfile(p.id)}
                      disabled={deleting === p.id}
                      className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {deleting === p.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
