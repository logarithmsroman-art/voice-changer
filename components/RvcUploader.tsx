"use client";

import { useRef, useState } from "react";

interface Props {
  onUploaded: () => void;
}

export default function RvcUploader({ onUploaded }: Props) {
  const [name, setName] = useState("");
  const [pthFile, setPthFile] = useState<File | null>(null);
  const [indexFile, setIndexFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const pthRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pthFile || !name.trim()) return;

    setUploading(true);
    setError(null);
    setSuccess(false);

    const form = new FormData();
    form.append("name", name.trim());
    form.append("pth", pthFile);
    if (indexFile) form.append("index", indexFile);

    try {
      const res = await fetch("/api/rvc-upload", { method: "POST", body: form });
      if (!res.ok) {
        const msg = await res.text();
        setError(`Upload failed: ${msg}`);
        return;
      }
      setSuccess(true);
      setName("");
      setPthFile(null);
      setIndexFile(null);
      if (pthRef.current) pthRef.current.value = "";
      if (indexRef.current) indexRef.current.value = "";
      onUploaded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex flex-col gap-3"
    >
      <input
        type="text"
        placeholder="Model name (e.g. Morgan Freeman)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full bg-zinc-800 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-zinc-600"
      />

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">
          Model file <span className="text-zinc-300">.pth</span> (required)
        </label>
        <input
          ref={pthRef}
          type="file"
          accept=".pth"
          onChange={(e) => setPthFile(e.target.files?.[0] ?? null)}
          className="text-sm text-zinc-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-zinc-700 file:text-zinc-300 hover:file:bg-zinc-600"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">
          Index file <span className="text-zinc-300">.index</span> (optional — improves quality)
        </label>
        <input
          ref={indexRef}
          type="file"
          accept=".index"
          onChange={(e) => setIndexFile(e.target.files?.[0] ?? null)}
          className="text-sm text-zinc-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-zinc-700 file:text-zinc-300 hover:file:bg-zinc-600"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">Model uploaded successfully.</p>}

      <button
        type="submit"
        disabled={uploading || !pthFile || !name.trim()}
        className="self-end px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? "Uploading…" : "Upload Model"}
      </button>
    </form>
  );
}
