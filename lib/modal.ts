"use client";

export type ModalMessage =
  | { type: "profile"; url: string }
  | { type: "audio"; data: ArrayBuffer };

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export class ModalWSClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private onAudio: (data: ArrayBuffer) => void;
  private onStateChange: (state: ConnectionState) => void;
  private onLatency: (ms: number) => void;
  private pingTime = 0;

  constructor(
    wsUrl: string,
    onAudio: (data: ArrayBuffer) => void,
    onStateChange: (state: ConnectionState) => void,
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

  sendProfile(url: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "profile", url }));
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
