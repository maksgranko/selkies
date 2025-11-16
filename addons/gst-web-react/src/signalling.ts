/**
 * WebRTC Signalling клиент
 * Протокол: https://github.com/GStreamer/gstreamer/blob/main/subprojects/gst-examples/webrtc/signalling/Protocol.md
 */

export interface SignallingCallbacks {
  onstatus?: (message: string) => void;
  onerror?: (message: string) => void;
  ondebug?: (message: string) => void;
  onice?: (icecandidate: RTCIceCandidate) => void;
  onsdp?: (sdp: RTCSessionDescription) => void;
  ondisconnect?: () => void;
}

export class WebRTCDemoSignalling {
  private server: URL;
  public peer_id: number = 1;
  private ws_conn: WebSocket | null = null;
  private callbacks: SignallingCallbacks = {};
  public state: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private retry_count: number = 0;
  private getWindowResolution?: () => [number, number];

  constructor(server: URL, getWindowResolution?: () => [number, number]) {
    this.server = server;
    this.getWindowResolution = getWindowResolution;
  }

  setCallbacks(callbacks: SignallingCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  private setStatus(message: string): void {
    if (this.callbacks.onstatus) {
      this.callbacks.onstatus(message);
    }
  }

  private setDebug(message: string): void {
    if (this.callbacks.ondebug) {
      this.callbacks.ondebug(message);
    }
  }

  private setError(message: string): void {
    if (this.callbacks.onerror) {
      this.callbacks.onerror(message);
    }
  }

  private setSDP(sdp: RTCSessionDescription): void {
    if (this.callbacks.onsdp) {
      this.callbacks.onsdp(sdp);
    }
  }

  private setICE(icecandidate: RTCIceCandidate): void {
    if (this.callbacks.onice) {
      this.callbacks.onice(icecandidate);
    }
  }

  private onServerOpen = (): void => {
    // Отправляем разрешение устройства и масштаб с HELLO сообщением
    const currRes = this.getWindowResolution ? this.getWindowResolution() : [1920, 1080];
    const meta = {
      res: `${parseInt(String(currRes[0]))}x${parseInt(String(currRes[1]))}`,
      scale: window.devicePixelRatio
    };
    this.state = 'connected';
    if (this.ws_conn) {
      this.ws_conn.send(`HELLO ${this.peer_id} ${btoa(JSON.stringify(meta))}`);
    }
    this.setStatus(`Registering with server, peer ID: ${this.peer_id}`);
    this.retry_count = 0;
  };

  private onServerError = (): void => {
    this.setStatus("Connection error, retry in 3 seconds.");
    this.retry_count++;
    if (this.ws_conn && this.ws_conn.readyState === WebSocket.CLOSED) {
      setTimeout(() => {
        if (this.retry_count > 3) {
          window.location.reload();
        } else {
          this.connect();
        }
      }, 3000);
    }
  };

  private onServerMessage = (event: MessageEvent): void => {
    this.setDebug("server message: " + event.data);

    if (event.data === "HELLO") {
      this.setStatus("Registered with server.");
      this.setStatus("Waiting for stream.");
      return;
    }

    if (typeof event.data === 'string' && event.data.startsWith("ERROR")) {
      this.setStatus("Error from server: " + event.data);
      return;
    }

    // Пытаемся распарсить JSON SDP или ICE сообщение
    let msg: any;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      if (e instanceof SyntaxError) {
        this.setError("error parsing message as JSON: " + event.data);
      } else {
        this.setError("failed to parse message: " + event.data);
      }
      return;
    }

    if (msg.sdp != null) {
      this.setSDP(new RTCSessionDescription(msg.sdp));
    } else if (msg.ice != null) {
      const icecandidate = new RTCIceCandidate(msg.ice);
      this.setICE(icecandidate);
    } else {
      this.setError("unhandled JSON message: " + JSON.stringify(msg));
    }
  };

  private onServerClose = (): void => {
    if (this.state !== 'connecting') {
      this.state = 'disconnected';
      this.setError("Server closed connection.");
      if (this.callbacks.ondisconnect) {
        this.callbacks.ondisconnect();
      }
    }
  };

  /**
   * Инициирует подключение к signalling серверу
   */
  connect(): void {
    this.state = 'connecting';
    this.setStatus("Connecting to server.");

    this.ws_conn = new WebSocket(this.server);

    // Привязываем обработчики событий
    this.ws_conn.addEventListener('open', this.onServerOpen);
    this.ws_conn.addEventListener('error', this.onServerError);
    this.ws_conn.addEventListener('message', this.onServerMessage);
    this.ws_conn.addEventListener('close', this.onServerClose);
  }

  /**
   * Закрывает подключение к signalling серверу
   */
  disconnect(): void {
    if (this.ws_conn) {
      this.ws_conn.close();
    }
  }

  /**
   * Отправляет ICE кандидата
   */
  sendICE(ice: RTCIceCandidate): void {
    this.setDebug("sending ice candidate: " + JSON.stringify(ice));
    if (this.ws_conn && this.ws_conn.readyState === WebSocket.OPEN) {
      this.ws_conn.send(JSON.stringify({ 'ice': ice }));
    }
  }

  /**
   * Отправляет локальное session description
   */
  sendSDP(sdp: RTCSessionDescription): void {
    this.setDebug("sending local sdp: " + JSON.stringify(sdp));
    if (this.ws_conn && this.ws_conn.readyState === WebSocket.OPEN) {
      this.ws_conn.send(JSON.stringify({ 'sdp': sdp }));
    }
  }
}


