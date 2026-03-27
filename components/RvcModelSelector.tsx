"use client";

import { useEffect, useState } from "react";

export type RvcModel = {
  id: string;
  name: string;
  pth_url: string;
  index_url: string | null;
  created_at: string;
};

interface Props {
  selected: RvcModel | null;
  onSelect: (model: RvcModel) => void;
}

export default function RvcModelSelector({ selected, onSelect }: Props) {
  const [models, setModels] = useState<RvcModel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModels = async () => {
    setLoading(true);
    const res = await fetch("/api/rvc-models");
    if (res.ok) setModels(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchModels(); }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading models…</p>;
  }

  if (models.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No RVC models yet. Upload a trained <span className="text-zinc-300">.pth</span> file below.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {models.map((m) => (
        <button
          key={m.id}
          onClick={() => onSelect(m)}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150
            ${selected?.id === m.id
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}
          `}
        >
          <span>{m.name}</span>
          {m.index_url && (
            <span className="ml-2 text-xs opacity-60">+index</span>
          )}
        </button>
      ))}
    </div>
  );
}
