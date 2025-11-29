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
  private wasConnected: boolean = false;
  private lastConnectedTime: number = 0;
  private isReloading: boolean = false;
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
    this.wasConnected = true;
    this.lastConnectedTime = Date.now();
    this.retry_count = 0;
    this.isReloading = false; // Сбрасываем флаг перезагрузки при успешном подключении
    if (this.ws_conn) {
      this.ws_conn.send(`HELLO ${this.peer_id} ${btoa(JSON.stringify(meta))}`);
    }
    this.setStatus(`Registering with server, peer ID: ${this.peer_id}`);
    this.setDebug(`Connection opened successfully at ${new Date(this.lastConnectedTime).toISOString()}`);
  };

  private onServerError = (): void => {
    this.setDebug(`WebSocket error occurred. retry_count: ${this.retry_count}, wasConnected: ${this.wasConnected}, state: ${this.state}, isReloading: ${this.isReloading}`);
    
    // Проверяем существование соединения перед проверкой состояния
    if (!this.ws_conn) {
      this.setDebug("WebSocket connection is null, skipping error handling");
      return;
    }

    // Если уже идет перезагрузка, не обрабатываем ошибку
    if (this.isReloading) {
      this.setDebug("Page reload already in progress, skipping error handling");
      return;
    }

    // Если соединение в процессе открытия, не увеличиваем счетчик
    if (this.state === 'connecting') {
      this.setDebug("Connection is in 'connecting' state, not incrementing retry_count");
      return;
    }

    // Проверяем, было ли соединение успешно установлено недавно (в течение последних 10 секунд)
    // Если да, и соединение все еще активно, не увеличиваем счетчик
    const timeSinceLastConnection = Date.now() - this.lastConnectedTime;
    const recentlyConnected = this.wasConnected && timeSinceLastConnection < 10000; // 10 секунд
    const isConnectionActive = this.ws_conn && this.ws_conn.readyState === WebSocket.OPEN;
    
    if (recentlyConnected && isConnectionActive) {
      this.setDebug(`Connection was established recently (${Math.round(timeSinceLastConnection / 1000)}s ago) and is still active, not incrementing retry_count`);
      // Сбрасываем счетчик, так как соединение активно
      this.retry_count = 0;
      return;
    }

    // Если соединение было установлено, но сейчас закрыто и не может переподключиться,
    // нужно позволить увеличить счетчик и перезагрузить страницу после 3 попыток

    this.retry_count++;
    this.setDebug(`Incremented retry_count to ${this.retry_count}`);
    
    // Показываем сообщение об ошибке только если действительно будем пытаться переподключиться
    const willRetry = this.ws_conn.readyState === WebSocket.CLOSED || this.ws_conn.readyState === WebSocket.CLOSING;
    
    if (willRetry) {
      this.setStatus("Connection error, retry in 3 seconds.");
      
      // Ждём 3 секунды перед следующей попыткой
      setTimeout(() => {
        // Проверяем еще раз перед действием - если соединение активно, отменяем
        if (this.ws_conn && this.ws_conn.readyState === WebSocket.OPEN) {
          this.setDebug("Connection was established during retry delay, cancelling retry");
          this.setStatus("Connection restored.");
          this.retry_count = 0;
          return;
        }

        // Проверяем, не началась ли уже перезагрузка
        if (this.isReloading) {
          this.setDebug("Reload already in progress, skipping retry");
          return;
        }

        if (this.retry_count > 3) {
          if (!this.isReloading) {
            this.isReloading = true;
            this.setError(`Max retry count (${this.retry_count}) exceeded, reloading page`);
            this.setStatus("Reloading page...");
            window.location.reload();
          }
        } else {
          this.setDebug(`Retrying connection (attempt ${this.retry_count}/3)`);
          this.connect();
        }
      }, 3000);
    } else {
      this.setDebug(`WebSocket is not closed (readyState: ${this.ws_conn.readyState}), skipping retry`);
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

  private onServerClose = (event: CloseEvent): void => {
    const closeCode = event.code;
    const wasNormalClose = closeCode === 1000; // Normal closure
    const isProtocolError = closeCode === 1002; // Protocol error
    
    this.setDebug(`WebSocket closed. Code: ${closeCode}, wasConnected: ${this.wasConnected}, state: ${this.state}`);
    
    if (this.state !== 'connecting') {
      this.state = 'disconnected';
      
      // Не вызываем ondisconnect для нормального закрытия или если соединение никогда не было установлено
      if (wasNormalClose) {
        this.setDebug("Normal closure (code 1000), not calling ondisconnect");
        return;
      }
      
      if (!this.wasConnected) {
        this.setDebug("Connection was never successfully established, not calling ondisconnect");
        return;
      }
      
      // Для кода 1002 (Protocol error) проверяем, было ли соединение установлено недавно
      // Если да, не вызываем ondisconnect сразу, чтобы дать время для автоматического переподключения
      if (isProtocolError) {
        const timeSinceLastConnection = Date.now() - this.lastConnectedTime;
        const recentlyConnected = timeSinceLastConnection < 5000; // 5 секунд
        
        if (recentlyConnected) {
          this.setDebug(`Protocol error (code 1002) occurred shortly after connection (${Math.round(timeSinceLastConnection / 1000)}s ago), not calling ondisconnect to avoid reconnect loop`);
          // Сбрасываем флаг wasConnected, чтобы позволить переподключение через onServerError
          this.wasConnected = false;
          return;
        }
        
        this.setDebug(`Protocol error (code 1002) occurred ${Math.round(timeSinceLastConnection / 1000)}s after connection, will call ondisconnect`);
      }
      
      // Вызываем ondisconnect только для неожиданного закрытия после успешного подключения
      this.setError(`Server closed connection unexpectedly. Code: ${closeCode}`);
      if (this.callbacks.ondisconnect) {
        this.callbacks.ondisconnect();
      }
    } else {
      this.setDebug("Connection was in 'connecting' state, ignoring close event");
    }
  };

  /**
   * Инициирует подключение к signalling серверу
   */
  connect(): void {
    // Проверяем, не подключены ли уже
    if (this.ws_conn && (this.ws_conn.readyState === WebSocket.OPEN || this.ws_conn.readyState === WebSocket.CONNECTING)) {
      this.setDebug(`Skipping connect - WebSocket already ${this.ws_conn.readyState === WebSocket.OPEN ? 'open' : 'connecting'}`);
      return;
    }
    
    // Закрываем старое соединение если оно есть
    if (this.ws_conn && this.ws_conn.readyState !== WebSocket.CLOSED) {
      this.setDebug('Closing existing WebSocket before creating new connection');
      try {
        this.ws_conn.close();
      } catch (e) {
        this.setDebug(`Error closing existing WebSocket: ${e}`);
      }
    }
    
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
      // Проверяем состояние WebSocket перед закрытием
      // Закрываем только если соединение открыто или в процессе открытия
      if (this.ws_conn.readyState === WebSocket.OPEN || this.ws_conn.readyState === WebSocket.CONNECTING) {
        this.setDebug(`Closing WebSocket connection (state: ${this.state}, readyState: ${this.ws_conn.readyState})`);
        try {
          this.ws_conn.close(1000, 'Client disconnect'); // Normal closure
        } catch (e) {
          this.setDebug(`Error closing WebSocket: ${e}`);
        }
      } else {
        this.setDebug(`Skipping disconnect - WebSocket already closed (readyState: ${this.ws_conn.readyState})`);
      }
      this.ws_conn = null;
      this.state = 'disconnected';
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


