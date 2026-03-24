"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ModalWSClient, ConnectionState } from "@/lib/modal";

const SAMPLE_RATE       = 16000;
const SILENCE_THRESHOLD = 0.01;
const SILENCE_SAMPLES   = Math.floor(SAMPLE_RATE * 0.25); // 250ms silence → end of phrase
const MIN_SAMPLES       = Math.floor(SAMPLE_RATE * 0.3);  // 300ms min before sending
const MAX_SAMPLES       = SAMPLE_RATE * 3;                 // 3s max (non-stop speech failsafe)
const FADE_SAMPLES      = Math.floor(SAMPLE_RATE * 0.02); // 20ms fade-in to smooth boundaries

interface Props {
  activeProfileUrl: string | null;
}

export default function VoiceChanger({ activeProfileUrl }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [connState, setConnState] = useState<ConnectionState>("disconnected");
  const [latency, setLatency] = useState<number | null>(null);

  const clientRef = useRef<ModalWSClient | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const playbackQueueRef = useRef<AudioBuffer[]>([]);
  const nextPlayTimeRef = useRef(0);
  const wsUrlRef = useRef<string | null>(null);
  const chunkBufferRef = useRef<Float32Array[]>([]);
  const chunkSamplesCollected = useRef(0);
  const silenceSamplesRef = useRef(0);
  const activeProfileUrlRef = useRef<string | null>(activeProfileUrl);

  // Fetch WS URL once
  useEffect(() => {
    fetch("/api/ws-token")
      .then((r) => r.json())
      .then((d) => { wsUrlRef.current = d.url; })
      .catch(() => {});
  }, []);

  // Keep ref in sync so connection callbacks can access the latest value
  useEffect(() => {
    activeProfileUrlRef.current = activeProfileUrl;
  }, [activeProfileUrl]);

  // Send profile whenever URL changes while connected
  useEffect(() => {
    if (clientRef.current && activeProfileUrl) {
      clientRef.current.sendProfile(activeProfileUrl);
    }
  }, [activeProfileUrl]);

  // Send profile the moment the WebSocket opens (avoids the 500ms race condition)
  useEffect(() => {
    if (connState === "connected" && clientRef.current && activeProfileUrlRef.current) {
      clientRef.current.sendProfile(activeProfileUrlRef.current);
    }
  }, [connState]);

  // Queue and play back converted audio chunks
  const enqueueAudio = useCallback((data: ArrayBuffer) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const float32 = new Float32Array(data);
    // Fade in the first 20ms to eliminate clicks at chunk boundaries
    for (let i = 0; i < FADE_SAMPLES && i < float32.length; i++) {
      float32[i] *= i / FADE_SAMPLES;
    }
    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.05, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  }, []);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx2d = canvas.getContext("2d")!;
    const bufLen = analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);
    analyser.getByteTimeDomainData(dataArr);

    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.strokeStyle = "#38bdf8";
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();

    const sliceW = canvas.width / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const v = dataArr[i] / 128.0;
      const y = (v * canvas.height) / 2;
      i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
      x += sliceW;
    }
    ctx2d.stroke();
    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const start = useCallback(async () => {
    if (!wsUrlRef.current) {
      alert("Modal WS URL not configured. Add MODAL_WS_URL to .env.local");
      return;
    }

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    audioCtxRef.current = ctx;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream;

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;
    source.connect(analyser);

    // ScriptProcessor to capture mic chunks
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    source.connect(processor);
    processor.connect(ctx.destination); // needed to keep it alive (silent output)

    const wsClient = new ModalWSClient(
      wsUrlRef.current,
      enqueueAudio,
      setConnState,
      setLatency
    );
    clientRef.current = wsClient;
    wsClient.connect();

    processor.onaudioprocess = (e) => {
      // Zero output — prevents raw mic passthrough to speakers
      e.outputBuffer.getChannelData(0).fill(0);
      const inputData = e.inputBuffer.getChannelData(0);
      chunkBufferRef.current.push(new Float32Array(inputData));
      chunkSamplesCollected.current += inputData.length;

      // Per-buffer silence detection
      let sumSq = 0;
      for (let i = 0; i < inputData.length; i++) sumSq += inputData[i] * inputData[i];
      const isSilent = Math.sqrt(sumSq / inputData.length) < SILENCE_THRESHOLD;
      if (isSilent) { silenceSamplesRef.current += inputData.length; }
      else          { silenceSamplesRef.current = 0; }

      const enoughAudio  = chunkSamplesCollected.current >= MIN_SAMPLES;
      const silencePause = silenceSamplesRef.current     >= SILENCE_SAMPLES;
      const tooLong      = chunkSamplesCollected.current >= MAX_SAMPLES;

      if (enoughAudio && (silencePause || tooLong)) {
        const merged = new Float32Array(chunkSamplesCollected.current);
        let offset = 0;
        for (const buf of chunkBufferRef.current) { merged.set(buf, offset); offset += buf.length; }
        chunkBufferRef.current        = [];
        chunkSamplesCollected.current = 0;
        silenceSamplesRef.current     = 0;

        // Skip if overall chunk is silent
        let s = 0; for (let i = 0; i < merged.length; i++) s += merged[i] * merged[i];
        if (Math.sqrt(s / merged.length) < SILENCE_THRESHOLD) return;

        wsClient.sendAudio(merged.buffer);
      }
    };

    drawWaveform();
    setIsRunning(true);
  }, [activeProfileUrl, enqueueAudio, drawWaveform]);

  const stop = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    clientRef.current?.disconnect();
    clientRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    nextPlayTimeRef.current = 0;
    chunkBufferRef.current = [];
    chunkSamplesCollected.current = 0;
    silenceSamplesRef.current = 0;
    setIsRunning(false);
    setConnState("disconnected");
    setLatency(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const connColor: Record<ConnectionState, string> = {
    disconnected: "text-zinc-500",
    connecting: "text-yellow-400",
    connected: "text-emerald-400",
    error: "text-red-400",
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Waveform */}
      <div className="w-full rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden" style={{ height: 96 }}>
        <canvas ref={canvasRef} width={800} height={96} className="w-full h-full" />
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-6 text-sm">
        <span className={connColor[connState]}>
          ● {connState}
        </span>
        {latency !== null && (
          <span className="text-zinc-400">
            <span className="text-cyan-400 font-mono">{latency}</span> ms
          </span>
        )}
      </div>

      {/* Big start/stop button */}
      <button
        onClick={isRunning ? stop : start}
        className={`
          w-40 h-40 rounded-full text-lg font-semibold transition-all duration-200 shadow-xl
          ${isRunning
            ? "bg-red-600 hover:bg-red-500 shadow-red-900/50 scale-105"
            : "bg-violet-600 hover:bg-violet-500 shadow-violet-900/60"}
        `}
      >
        {isRunning ? "Stop" : "Start"}
      </button>

      {/* Routing hint */}
      {isRunning && (
        <p className="text-xs text-zinc-500 max-w-xs text-center">
          To use in calls, route your default output to{" "}
          <span className="text-zinc-300">VB-Cable</span> (Windows) or{" "}
          <span className="text-zinc-300">BlackHole</span> (Mac), then select it as mic input in your call app.
        </p>
      )}
    </div>
  );
}
