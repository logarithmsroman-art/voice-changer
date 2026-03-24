"use client";

import { useEffect, useState } from "react";
import type { VoiceProfile } from "@/lib/supabase";

interface Props {
  onSelect: (profile: VoiceProfile) => void;
  selected: VoiceProfile | null;
}

export default function ProfileSelector({ onSelect, selected }: Props) {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = async () => {
    setLoading(true);
    const res = await fetch("/api/profiles");
    if (res.ok) setProfiles(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading profiles…</p>;
  }

  if (profiles.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No voice profiles yet.{" "}
        <a href="/setup" className="text-violet-400 hover:underline">
          Upload one →
        </a>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {profiles.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150
            ${selected?.id === p.id
              ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}
          `}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
