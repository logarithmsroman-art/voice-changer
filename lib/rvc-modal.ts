"use client";

export type RvcConnectionState = "disconnected" | "connecting" | "connected" | "error";

export class RvcWSClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private onAudio: (data: ArrayBuffer) => void;
  private onStateChange: (state: RvcConnectionState) => void;
  private onLatency: (ms: number) => void;
  private pingTime = 0;

  constructor(
    wsUrl: string,
    onAudio: (data: ArrayBuffer) => void,
    onStateChange: (state: RvcConnectionState) => void,
    onLatency: (ms: number) => void
  ) {
    this.wsUrl = wsUrl;
    this.onAudio = onAudio;
    this.onStateChange = onStateChange;
    this.onLatency = onLatency;
  }

  connect(): void {
    this.onStateChange("connecting");
    this.ws = new WebSocket(this.wsUrl);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.onStateChange("connected");
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        if (this.pingTime > 0) {
          this.onLatency(Date.now() - this.pingTime);
          this.pingTime = 0;
        }
        this.onAudio(event.data);
      }
    };

    this.ws.onerror = () => this.onStateChange("error");
    this.ws.onclose = () => this.onStateChange("disconnected");
  }

  /** Tell the server which RVC model to use. index_url is optional. */
  sendModel(pthUrl: string, indexUrl: string | null): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "model", pth_url: pthUrl, index_url: indexUrl }));
  }

  /** Send pitch shift in semitones (0 = no change). */
  sendConfig(pitch: number): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "config", pitch }));
  }

  sendAudio(data: ArrayBuffer): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.pingTime = Date.now();
    this.ws.send(data);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
