"use client";

import { useRef, useState, DragEvent } from "react";

interface Props {
  onUploaded: () => void;
}

export default function Uploader({ onUploaded }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    const name = nameRef.current?.value.trim() || file.name.replace(/\.[^.]+$/, "");
    setStatus("uploading");
    setProgress(10);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name);

    try {
      setProgress(40);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      setProgress(90);
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Upload failed");
      }
      setProgress(100);
      setStatus("success");
      if (nameRef.current) nameRef.current.value = "";
      setTimeout(() => { setStatus("idle"); setProgress(0); onUploaded(); }, 1500);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Upload failed");
      setStatus("error");
      setProgress(0);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={nameRef}
        type="text"
        placeholder="Profile name (e.g. Morgan Freeman)"
        className="w-full px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          cursor-pointer rounded-xl border-2 border-dashed px-8 py-10 text-center transition-colors duration-150
          ${isDragging ? "border-violet-500 bg-violet-950/30" : "border-zinc-700 hover:border-zinc-500"}
        `}
      >
        <p className="text-zinc-400 text-sm">
          Drop a voice sample here, or <span className="text-violet-400">click to browse</span>
        </p>
        <p className="text-zinc-600 text-xs mt-1">.wav · .mp3 · .m4a — up to 50 MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3,.m4a,audio/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
        />
      </div>

      {status === "uploading" && (
        <div className="rounded-full bg-zinc-800 h-1.5 overflow-hidden">
          <div
            className="h-full bg-violet-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {status === "success" && (
        <p className="text-emerald-400 text-sm">Profile uploaded successfully.</p>
      )}
      {status === "error" && (
        <p className="text-red-400 text-sm">{errorMsg}</p>
      )}
    </div>
  );
}
