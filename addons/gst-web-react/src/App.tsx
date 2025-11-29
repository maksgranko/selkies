import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { WebRTCDemo } from './webrtc';
import { WebRTCDemoSignalling } from './signalling';
import { ConnectionConfig, getConnectionConfig, createSignallingUrl } from './config';
import { stringToBase64 } from './util';
import './App.css';

export interface AppProps {
  /** Конфигурация подключения (если не указана, используется из window.location или config) */
  connectionConfig?: ConnectionConfig;
  /** Глобальная конфигурация приложения */
  appConfig?: {
    dev?: {
      enabled: boolean;
      connection?: ConnectionConfig;
    };
    defaultConnection?: ConnectionConfig;
  };
}

interface ConnectionStat {
  connectionStatType: string;
  connectionLatency: number;
  connectionVideoLatency: number;
  connectionAudioLatency: number;
  connectionAudioCodecName: string;
  connectionAudioBitrate: number;
  connectionPacketsReceived: number;
  connectionPacketsLost: number;
  connectionBytesReceived: string;
  connectionBytesSent: string;
  connectionCodec: string;
  connectionVideoDecoder: string;
  connectionResolution: string;
  connectionFrameRate: number;
  connectionVideoBitrate: number;
  connectionAvailableBandwidth: string;
}

interface GPUStat {
  gpuLoad: number;
  gpuMemoryTotal: number;
  gpuMemoryUsed: number;
}

interface CPUStat {
  serverCPUUsage: number;
  serverMemoryTotal: number;
  serverMemoryUsed: number;
}

interface GamepadState {
  gamepadState: 'disconnected' | 'connected';
  gamepadName: string;
}

const App: React.FC<AppProps> = ({ connectionConfig, appConfig }) => {
  // Получаем конфигурацию подключения СРАЗУ и мемоизируем, чтобы избежать перерендеров
  const config = useMemo(() => {
    const cfg = connectionConfig || getConnectionConfig(appConfig);
    console.log('[App] Using connection config:', cfg);
    return cfg;
  }, [connectionConfig, appConfig]);

  // Функции для работы с localStorage - определяем ДО использования
  const getIntParam = (key: string, defaultValue: number | null): number | null => {
    const prefixedKey = `${config.appName || 'webrtc'}_${key}`;
    const value = window.localStorage.getItem(prefixedKey);
    return value ? parseInt(value) : defaultValue;
  };

  const getBoolParam = (key: string, defaultValue: boolean | null): boolean | null => {
    const prefixedKey = `${config.appName || 'webrtc'}_${key}`;
    const value = window.localStorage.getItem(prefixedKey);
    if (value === null) {
      return defaultValue;
    }
    return value.toLowerCase() === "true";
  };

  // КРИТИЧНО: Загружаем debug и turnSwitch ДО создания state (как в оригинале)
  const initialDebug = getBoolParam("debug", false) ?? false;
  const initialTurnSwitch = getBoolParam("turnSwitch", false) ?? false;
  const initialResizeRemote = getBoolParam("resizeRemote", true) ?? true;
  const initialScaleLocalFromStorage = getBoolParam("scaleLocal", null);
  const initialScaleLocal = initialScaleLocalFromStorage !== null ? initialScaleLocalFromStorage : !initialResizeRemote;

  const videoElementRef = useRef<HTMLVideoElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const webrtcRef = useRef<WebRTCDemo | null>(null);
  const audioWebrtcRef = useRef<WebRTCDemo | null>(null);
  const statWatchIntervalRef = useRef<number | null>(null);
  const metricsIntervalRef = useRef<number | null>(null);
  const initializedRef = useRef<boolean>(false);

  const [videoBitRate, setVideoBitRate] = useState(getIntParam("videoBitRate", 8000) ?? 8000);
  const [videoFramerate, setVideoFramerate] = useState(getIntParam("videoFramerate", 60) ?? 60);
  const [audioBitRate, setAudioBitRate] = useState(getIntParam("audioBitRate", 128000) ?? 128000);
  const [showStart, setShowStart] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [debugEntries, setDebugEntries] = useState<string[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed' | 'checkconnect'>('connecting');
  const [loadingText, setLoadingText] = useState('');
  const [clipboardStatus, setClipboardStatus] = useState<'disabled' | 'enabled'>('disabled');
  const [windowResolution, setWindowResolution] = useState<[number, number]>([0, 0]);
  const [encoderName, setEncoderName] = useState('');
  const [gamepad, setGamepad] = useState<GamepadState>({ gamepadState: 'disconnected', gamepadName: 'none' });
  const [connectionStat, setConnectionStat] = useState<ConnectionStat>({
    connectionStatType: "unknown",
    connectionLatency: 0,
    connectionVideoLatency: 0,
    connectionAudioLatency: 0,
    connectionAudioCodecName: "NA",
    connectionAudioBitrate: 0,
    connectionPacketsReceived: 0,
    connectionPacketsLost: 0,
    connectionBytesReceived: "0 MBytes",
    connectionBytesSent: "0 MBytes",
    connectionCodec: "unknown",
    connectionVideoDecoder: "unknown",
    connectionResolution: "",
    connectionFrameRate: 0,
    connectionVideoBitrate: 0,
    connectionAvailableBandwidth: "0 mbps"
  });
  const [gpuStat, setGpuStat] = useState<GPUStat>({ gpuLoad: 0, gpuMemoryTotal: 0, gpuMemoryUsed: 0 });
  const [cpuStat, setCpuStat] = useState<CPUStat>({ serverCPUUsage: 0, serverMemoryTotal: 0, serverMemoryUsed: 0 });
  const [serverLatency, setServerLatency] = useState(0);
  const [resizeRemote, setResizeRemote] = useState(initialResizeRemote);
  const [scaleLocal, setScaleLocal] = useState(initialScaleLocal);
  const [debug, setDebug] = useState(initialDebug);
  const [turnSwitch, setTurnSwitch] = useState(initialTurnSwitch);

  const videoConnectedRef = useRef<string>('');
  const audioConnectedRef = useRef<string>('');
  const statWatchEnabledRef = useRef<boolean>(false);
  const connectionStatusRef = useRef<'connecting' | 'connected' | 'failed' | 'checkconnect'>('connecting');

  // Функция для добавления временной метки к логам
  const applyTimestamp = useCallback((msg: string): string => {
    const now = new Date();
    const ts = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    return `[${ts}] ${msg}`;
  }, []);

  // Инициализация WebRTC
  useEffect(() => {
    // Защита от двойной инициализации в StrictMode
    if (initializedRef.current) {
      console.log('[App] Skipping double initialization in StrictMode');
      return;
    }
    if (!videoElementRef.current || !audioElementRef.current) return;
    
    // Помечаем как инициализированное сразу, чтобы предотвратить повторную инициализацию
    initializedRef.current = true;

    // Функция для включения отслеживания статистики
    const enableStatWatch = () => {
      if (!webrtcRef.current || !audioWebrtcRef.current) return;

      let videoBytesReceivedStart = 0;
      let audioBytesReceivedStart = 0;
      let previousVideoJitterBufferDelay = 0.0;
      let previousVideoJitterBufferEmittedCount = 0;
      let previousAudioJitterBufferDelay = 0.0;
      let previousAudioJitterBufferEmittedCount = 0;
      let statsStart = new Date().getTime() / 1000;

      const statsLoop = setInterval(async () => {
        if (!webrtcRef.current || !audioWebrtcRef.current) {
          clearInterval(statsLoop);
          return;
        }

        if (videoConnectedRef.current !== "connected" || audioConnectedRef.current !== "connected") {
          clearInterval(statsLoop);
          statWatchEnabledRef.current = false;
          return;
        }

        try {
          const stats = await webrtcRef.current.getConnectionStats();
          const audioStats = await audioWebrtcRef.current.getConnectionStats();

          if (videoConnectedRef.current !== "connected" || audioConnectedRef.current !== "connected") {
            clearInterval(statsLoop);
            statWatchEnabledRef.current = false;
            return;
          }

          statWatchEnabledRef.current = true;
          const now = new Date().getTime() / 1000;

          const newConnectionStat: ConnectionStat = {
            connectionLatency: 0.0,
            connectionVideoLatency: stats.general.currentRoundTripTime !== null
              ? stats.general.currentRoundTripTime * 1000.0
              : serverLatency,
            connectionAudioLatency: audioStats.general.currentRoundTripTime !== null
              ? audioStats.general.currentRoundTripTime * 1000.0
              : serverLatency,
            connectionStatType: stats.general.connectionType === audioStats.general.connectionType
              ? stats.general.connectionType
              : `${stats.general.connectionType} / ${audioStats.general.connectionType}`,
            connectionBytesReceived: `${((stats.general.bytesReceived + audioStats.general.bytesReceived) * 1e-6).toFixed(2)} MBytes`,
            connectionBytesSent: `${((stats.general.bytesSent + audioStats.general.bytesSent) * 1e-6).toFixed(2)} MBytes`,
            connectionAvailableBandwidth: `${((parseInt(String(stats.general.availableReceiveBandwidth)) + parseInt(String(audioStats.general.availableReceiveBandwidth))) / 1e+6).toFixed(2)} mbps`,
            connectionPacketsReceived: stats.video.packetsReceived + audioStats.audio.packetsReceived,
            connectionPacketsLost: stats.video.packetsLost + audioStats.audio.packetsLost,
            connectionCodec: stats.video.codecName,
            connectionVideoDecoder: stats.video.decoder,
            connectionResolution: `${stats.video.frameWidth}x${stats.video.frameHeight}`,
            connectionFrameRate: stats.video.framesPerSecond,
            connectionVideoBitrate: parseFloat((((stats.video.bytesReceived - videoBytesReceivedStart) / (now - statsStart)) * 8 / 1e+6).toFixed(2)),
            connectionAudioCodecName: audioStats.audio.codecName,
            connectionAudioBitrate: parseFloat((((audioStats.audio.bytesReceived - audioBytesReceivedStart) / (now - statsStart)) * 8 / 1e+3).toFixed(2))
          };

          newConnectionStat.connectionLatency = newConnectionStat.connectionVideoLatency + newConnectionStat.connectionAudioLatency;

          // Latency stats
          newConnectionStat.connectionVideoLatency = parseInt(String(Math.round(
            newConnectionStat.connectionVideoLatency +
            (1000.0 * (stats.video.jitterBufferDelay - previousVideoJitterBufferDelay) /
              (stats.video.jitterBufferEmittedCount - previousVideoJitterBufferEmittedCount) || 0)
          )));
          previousVideoJitterBufferDelay = stats.video.jitterBufferDelay;
          previousVideoJitterBufferEmittedCount = stats.video.jitterBufferEmittedCount;

          newConnectionStat.connectionAudioLatency = parseInt(String(Math.round(
            newConnectionStat.connectionAudioLatency +
            (1000.0 * (audioStats.audio.jitterBufferDelay - previousAudioJitterBufferDelay) /
              (audioStats.audio.jitterBufferEmittedCount - previousAudioJitterBufferEmittedCount) || 0)
          )));
          previousAudioJitterBufferDelay = audioStats.audio.jitterBufferDelay;
          previousAudioJitterBufferEmittedCount = audioStats.audio.jitterBufferEmittedCount;

          newConnectionStat.connectionLatency = parseInt(String(Math.round(newConnectionStat.connectionLatency)));

          videoBytesReceivedStart = stats.video.bytesReceived;
          audioBytesReceivedStart = audioStats.audio.bytesReceived;
          statsStart = now;

          setConnectionStat(newConnectionStat);

          webrtcRef.current.sendDataChannelMessage("_stats_video," + JSON.stringify(stats.allReports));
          webrtcRef.current.sendDataChannelMessage("_stats_audio," + JSON.stringify(audioStats.allReports));
        } catch (error) {
          console.error("Error getting connection stats:", error);
        }
      }, 1000);

      statWatchIntervalRef.current = statsLoop as any;
    };

    const videoElement = videoElementRef.current;
    const audioElement = audioElementRef.current;

    // Создаем signalling клиенты
    const signallingUrl = createSignallingUrl(config);
    const audioSignallingUrl = createSignallingUrl(config);

    const getWindowResolution = () => {
      if (webrtcRef.current?.input) {
        return webrtcRef.current.input.getWindowResolution();
      }
      return [1920, 1080] as [number, number];
    };

    const signalling = new WebRTCDemoSignalling(new URL(signallingUrl), getWindowResolution);
    const audioSignalling = new WebRTCDemoSignalling(new URL(audioSignallingUrl), getWindowResolution);

    // Создаем WebRTC клиенты
    const webrtc = new WebRTCDemo(signalling, videoElement, 1);
    const audioWebrtc = new WebRTCDemo(audioSignalling, audioElement, 3);

    webrtcRef.current = webrtc;
    audioWebrtcRef.current = audioWebrtc;

    // Настраиваем callbacks для signalling
    signalling.setCallbacks({
      onstatus: (message) => {
        setLoadingText(message);
        setLogEntries(prev => [...prev, applyTimestamp(`[signalling] ${message}`)]);
      },
      onerror: (message) => {
        setLogEntries(prev => [...prev, applyTimestamp(`[signalling] [ERROR] ${message}`)]);
      },
      ondisconnect: () => {
        const checkconnect = connectionStatusRef.current === 'checkconnect';
        console.log("signalling disconnected");
        setStatus('connecting');
        connectionStatusRef.current = 'connecting';
        videoElement.style.cursor = "auto";
        webrtc.reset();
        setStatus('checkconnect');
        connectionStatusRef.current = 'checkconnect';
        if (!checkconnect) audioSignalling.disconnect();
      }
    });

    audioSignalling.setCallbacks({
      onstatus: (message) => {
        setLoadingText(message);
        setLogEntries(prev => [...prev, applyTimestamp(`[audio signalling] ${message}`)]);
      },
      onerror: (message) => {
        setLogEntries(prev => [...prev, applyTimestamp(`[audio signalling] [ERROR] ${message}`)]);
      },
      ondisconnect: () => {
        const checkconnect = connectionStatusRef.current === 'checkconnect';
        console.log("audio signalling disconnected");
        setStatus('connecting');
        connectionStatusRef.current = 'connecting';
        videoElement.style.cursor = "auto";
        audioWebrtc.reset();
        setStatus('checkconnect');
        connectionStatusRef.current = 'checkconnect';
        if (!checkconnect) signalling.disconnect();
      }
    });

    // Настраиваем callbacks для WebRTC
    webrtc.setCallbacks({
      onstatus: (message) => {
        setLogEntries(prev => [...prev, applyTimestamp(`[webrtc] ${message}`)]);
      },
      onerror: (message) => {
        setLogEntries(prev => [...prev, applyTimestamp(`[webrtc] [ERROR] ${message}`)]);
      },
      onconnectionstatechange: (state) => {
        videoConnectedRef.current = state;
        if (state === "connected") {
          webrtc.peerConnection?.getReceivers().forEach((receiver) => {
            const intervalLoop = setInterval(() => {
              if (receiver.track.readyState !== "live" || (receiver as any).transport?.state !== "connected") {
                clearInterval(intervalLoop);
                return;
              } else {
                (receiver as any).jitterBufferTarget = (receiver as any).jitterBufferDelayHint = (receiver as any).playoutDelayHint = 0;
              }
            }, 15);
          });
        }
        if (videoConnectedRef.current === "connected" && audioConnectedRef.current === "connected") {
          const newStatus = state as any;
          setStatus(newStatus);
          connectionStatusRef.current = newStatus;
          if (!statWatchEnabledRef.current) {
            enableStatWatch();
          }
          // Проверяем, не играет ли уже видео (на случай если событие play не сработало)
          if (videoElementRef.current && !videoElementRef.current.paused && videoElementRef.current.readyState >= 2) {
            setIsVideoPlaying(true);
            setShowStart(false);
          }
        } else {
          const newStatus = (state === "connected" ? audioConnectedRef.current : videoConnectedRef.current) as any;
          setStatus(newStatus);
          connectionStatusRef.current = newStatus;
        }
      },
      ondatachannelopen: () => {
        if (webrtc.input) {
          webrtc.input.setCallbacks({
            ongamepadconnected: (gamepadId) => {
              webrtc.setCallbacks({ onstatus: (msg) => console.log(msg) });
              setGamepad({ gamepadState: "connected", gamepadName: gamepadId });
            },
            ongamepaddisconnected: () => {
              setGamepad({ gamepadState: "disconnected", gamepadName: "none" });
            },
            onmenuhotkey: () => {
              setShowDrawer(prev => !prev);
            },
            onresizeend: () => {
              if (webrtc.input) {
                const res = webrtc.input.getWindowResolution();
                setWindowResolution(res);
                const newRes = `${parseInt(String(res[0]))}x${parseInt(String(res[1]))}`;
                console.log(`Window size changed: ${res[0]}x${res[1]}, scaled to: ${newRes}`);
                webrtc.sendDataChannelMessage(`r,${newRes}`);
                webrtc.sendDataChannelMessage(`s,${window.devicePixelRatio}`);
              }
            }
          });
          webrtc.input.attach();
        }

        // Отправляем клиентские метрики через data channel каждые 5 секунд
        metricsIntervalRef.current = window.setInterval(() => {
          if (!webrtcRef.current) return;
          const currentFrameRate = connectionStat.connectionFrameRate;
          const currentLatency = connectionStat.connectionLatency;
          if (currentFrameRate === parseInt(String(currentFrameRate), 10)) {
            webrtcRef.current.sendDataChannelMessage(`_f,${currentFrameRate}`);
          }
          if (currentLatency === parseInt(String(currentLatency), 10)) {
            webrtcRef.current.sendDataChannelMessage(`_l,${currentLatency}`);
          }
        }, 5000);
      },
      ondatachannelclose: () => {
        if (webrtc.input) {
          webrtc.input.detach();
        }
        if (metricsIntervalRef.current) {
          clearInterval(metricsIntervalRef.current);
          metricsIntervalRef.current = null;
        }
      },
      onplaystreamrequired: () => {
        setShowStart(true);
      },
      onclipboardcontent: (content) => {
        if (clipboardStatus === 'enabled') {
          navigator.clipboard.writeText(content).catch(err => {
            console.error('Could not copy text to clipboard: ' + err);
          });
        }
      },
      oncursorchange: (handle, curdata, hotspot, override) => {
        if (parseInt(String(handle)) === 0) {
          videoElement.style.cursor = "auto";
          return;
        }
        if (override) {
          videoElement.style.cursor = override;
          return;
        }
        if (!webrtc.cursor_cache.has(handle)) {
          const cursor_url = `url('data:image/png;base64,${curdata}')`;
          webrtc.cursor_cache.set(handle, cursor_url);
        }
        let cursor_url = webrtc.cursor_cache.get(handle)!;
        if (hotspot) {
          cursor_url += ` ${hotspot.x} ${hotspot.y}, auto`;
        } else {
          cursor_url += ", auto";
        }
        videoElement.style.cursor = cursor_url;
      },
      onsystemaction: (action) => {
        console.log("Executing system action: " + action);
        if (action === 'reload') {
          setTimeout(() => {
            signalling.disconnect();
          }, 700);
        } else if (action.startsWith('framerate')) {
          const framerateSetting = getIntParam("videoFramerate", null);
          if (framerateSetting !== null) {
            setVideoFramerate(framerateSetting);
          } else {
            setVideoFramerate(parseInt(action.split(",")[1]));
          }
        } else if (action.startsWith('video_bitrate')) {
          const videoBitrateSetting = getIntParam("videoBitRate", null);
          if (videoBitrateSetting !== null) {
            setVideoBitRate(videoBitrateSetting);
          } else {
            setVideoBitRate(parseInt(action.split(",")[1]));
          }
        } else if (action.startsWith('audio_bitrate')) {
          const audioBitrateSetting = getIntParam("audioBitRate", null);
          if (audioBitrateSetting !== null) {
            setAudioBitRate(audioBitrateSetting);
          } else {
            setAudioBitRate(parseInt(action.split(",")[1]));
          }
        } else if (action.startsWith('resize')) {
          const resizeSetting = getBoolParam("resizeRemote", null);
          if (resizeSetting !== null) {
            setResizeRemote(resizeSetting);
          } else {
            const newResizeRemote = action.split(",")[1].toLowerCase() === 'true';
            setResizeRemote(newResizeRemote);
            if (!newResizeRemote && getBoolParam("scaleLocal", null) === null) {
              setScaleLocal(true);
            }
          }
        } else if (action.startsWith("resolution")) {
          const remote_res = action.split(",")[1];
          console.log("received remote resolution of: " + remote_res);
          // Используем setResizeRemote callback чтобы получить актуальное значение
          setResizeRemote(currentResizeRemote => {
            if (currentResizeRemote) {
              const toks = remote_res.split("x");
              const pixelRatio = window.devicePixelRatio || 1; // Защита от 0
              videoElement.style.width = `${parseInt(toks[0]) / pixelRatio}px`;
              videoElement.style.height = `${parseInt(toks[1]) / pixelRatio}px`;
              if (webrtc.input) {
                webrtc.input.getCursorScaleFactor({ remoteResolutionEnabled: true });
              }
            }
            return currentResizeRemote;
          });
        } else if (action.startsWith("local_scaling")) {
          const scalingSetting = getBoolParam("scaleLocal", null);
          if (scalingSetting !== null) {
            setScaleLocal(scalingSetting);
          } else {
            setScaleLocal(action.split(",")[1].toLowerCase() === 'true');
          }
        } else if (action.startsWith("encoder")) {
          const encoderType = action.split(",")[1];
          if (encoderType && (encoderType.startsWith("nv") || encoderType.startsWith("va"))) {
            setEncoderName("hardware" + " (" + encoderType + ")");
          } else {
            setEncoderName("software" + " (" + (encoderType || "unknown") + ")");
          }
        } else {
          console.warn('Unhandled system action: ' + action);
        }
      },
      onlatencymeasurement: (latency_ms) => {
        setServerLatency(latency_ms * 2.0);
      },
      ongpustats: async (data) => {
        setGpuStat({
          gpuLoad: Math.round(data.load * 100),
          gpuMemoryTotal: data.memory_total,
          gpuMemoryUsed: data.memory_used
        });
      },
      onsystemstats: async (stats) => {
        if (stats.cpu_percent !== undefined || stats.mem_total !== undefined || stats.mem_used !== undefined) {
          setCpuStat(prev => ({
            serverCPUUsage: stats.cpu_percent !== undefined ? stats.cpu_percent : prev.serverCPUUsage,
            serverMemoryTotal: stats.mem_total !== undefined ? stats.mem_total : prev.serverMemoryTotal,
            serverMemoryUsed: stats.mem_used !== undefined ? stats.mem_used : prev.serverMemoryUsed
          }));
        }
      }
    });

    if (debug) {
      signalling.setCallbacks({
        ondebug: (message) => {
          setDebugEntries(prev => [...prev, `[signalling] ${message}`]);
        }
      });
      audioSignalling.setCallbacks({
        ondebug: (message) => {
          setDebugEntries(prev => [...prev, `[audio signalling] ${message}`]);
        }
      });
      webrtc.setCallbacks({
        ondebug: (message) => {
          setDebugEntries(prev => [...prev, applyTimestamp(`[webrtc] ${message}`)]);
        }
      });
      audioWebrtc.setCallbacks({
        ondebug: (message) => {
          setDebugEntries(prev => [...prev, applyTimestamp(`[audio webrtc] ${message}`)]);
        }
      });
    }

    audioWebrtc.setCallbacks({
      onstatus: (message) => {
        setLogEntries(prev => [...prev, applyTimestamp(`[audio webrtc] ${message}`)]);
      },
      onerror: (message) => {
        setLogEntries(prev => [...prev, applyTimestamp(`[audio webrtc] [ERROR] ${message}`)]);
      },
      onconnectionstatechange: (state) => {
        audioConnectedRef.current = state;
        if (state === "connected") {
          audioWebrtc.peerConnection?.getReceivers().forEach((receiver) => {
            const intervalLoop = setInterval(() => {
              if (receiver.track.readyState !== "live" || (receiver as any).transport?.state !== "connected") {
                clearInterval(intervalLoop);
                return;
              } else {
                (receiver as any).jitterBufferTarget = (receiver as any).jitterBufferDelayHint = (receiver as any).playoutDelayHint = 0;
              }
            }, 15);
          });
        }
        if (audioConnectedRef.current === "connected" && videoConnectedRef.current === "connected") {
          const newStatus = state as any;
          setStatus(newStatus);
          connectionStatusRef.current = newStatus;
          if (!statWatchEnabledRef.current) {
            enableStatWatch();
          }
          // Проверяем, не играет ли уже видео (на случай если событие play не сработало)
          if (videoElementRef.current && !videoElementRef.current.paused && videoElementRef.current.readyState >= 2) {
            setIsVideoPlaying(true);
            setShowStart(false);
          }
        } else {
          const newStatus = (state === "connected" ? videoConnectedRef.current : audioConnectedRef.current) as any;
          setStatus(newStatus);
          connectionStatusRef.current = newStatus;
        }
      },
      onplaystreamrequired: () => {
        setShowStart(true);
      }
    });

    // Используем конфигурацию TURN из config
    const iceServers = config.iceServers || [];

    webrtc.forceTurn = turnSwitch;
    audioWebrtc.forceTurn = turnSwitch;

    // Получаем начальное разрешение (как в оригинале строка 837)
    const windowRes = webrtc.input.getWindowResolution();
    setWindowResolution(windowRes);

    // Если scaleLocal === false, устанавливаем фиксированные размеры (строка 839-841)
    if (scaleLocal === false) {
      const pixelRatio = window.devicePixelRatio || 1; // Защита от 0
      videoElement.style.width = `${windowRes[0] / pixelRatio}px`;
      videoElement.style.height = `${windowRes[1] / pixelRatio}px`;
    }

    if (iceServers.length > 0) {
      setDebugEntries(prev => [...prev, applyTimestamp(`[app] using TURN servers: ${iceServers[0].urls}`)]);
      // Обновляем конфиг с переданными серверами
      const rtcConfig: RTCConfiguration = {
        iceServers: iceServers,
        iceTransportPolicy: turnSwitch ? 'relay' : 'all'
      };
      webrtc.rtcPeerConfig = rtcConfig;
      audioWebrtc.rtcPeerConfig = rtcConfig;
    } else {
      setDebugEntries(prev => [...prev, applyTimestamp("[app] no TURN servers provided, using default STUN.")]);
    }

    webrtc.connect();
    audioWebrtc.connect();

    // Обработка событий окна
    const handleFocus = () => {
      if (webrtcRef.current) {
        webrtcRef.current.sendDataChannelMessage("kr");
        navigator.clipboard.readText()
          .then(text => {
            if (webrtcRef.current) {
              webrtcRef.current.sendDataChannelMessage("cw," + stringToBase64(text));
            }
          })
          .catch(err => {
            console.error('Failed to read clipboard contents: ' + err);
          });
      }
    };

    const handleBlur = () => {
      if (webrtcRef.current) {
        webrtcRef.current.sendDataChannelMessage("kr");
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Проверка разрешений clipboard
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'clipboard-read' as PermissionName }).then(permissionStatus => {
        if (permissionStatus.state === 'granted') {
          setClipboardStatus('enabled');
        }
        permissionStatus.onchange = () => {
          if (permissionStatus.state === 'granted') {
            setClipboardStatus('enabled');
          }
        };
      });
    }

    // Обработка события loadeddata для video элемента
    const handleLoadedData = () => {
      if (webrtc.input) {
        webrtc.input.getCursorScaleFactor();
      }
    };

    // Обработка события play для video элемента - скрываем спиннер когда видео начинает играть
    const handleVideoPlay = () => {
      setIsVideoPlaying(true);
      setShowStart(false); // Сбрасываем showStart когда видео начинает играть автоматически
    };

    // Обработка события pause для video элемента
    const handleVideoPause = () => {
      setIsVideoPlaying(false);
    };

    // Обработка события ended для video элемента
    const handleVideoEnded = () => {
      setIsVideoPlaying(false);
    };

    videoElement.addEventListener('loadeddata', handleLoadedData);
    videoElement.addEventListener('play', handleVideoPlay);
    videoElement.addEventListener('pause', handleVideoPause);
    videoElement.addEventListener('ended', handleVideoEnded);

    return () => {
      // В StrictMode cleanup вызывается дважды - нужно проверять состояние перед закрытием
      const isConnected = connectionStatusRef.current === 'connected' || connectionStatusRef.current === 'checkconnect';
      const hasActivePeerConnection = webrtcRef.current?.peerConnection && 
        (webrtcRef.current.peerConnection.connectionState === 'connected' || 
         webrtcRef.current.peerConnection.connectionState === 'connecting');
      
      // Не закрываем соединения, если они активны (в реальном размонтировании компонента закроются автоматически)
      if (isConnected || hasActivePeerConnection) {
        console.log('[App] Skipping cleanup - connection is active (this is likely StrictMode double cleanup)');
        // Сбрасываем флаг инициализации только если соединение действительно закрыто
        // Это позволит переинициализации в случае реального размонтирования
        return;
      }
      
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      videoElement.removeEventListener('loadeddata', handleLoadedData);
      videoElement.removeEventListener('play', handleVideoPlay);
      videoElement.removeEventListener('pause', handleVideoPause);
      videoElement.removeEventListener('ended', handleVideoEnded);
      if (statWatchIntervalRef.current) {
        clearInterval(statWatchIntervalRef.current);
        statWatchIntervalRef.current = null;
      }
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
        metricsIntervalRef.current = null;
      }
      if (webrtcRef.current?.input) {
        webrtcRef.current.input.detach();
      }
      
      // Закрываем соединения только если они не активны
      if (signalling && signalling.state !== 'connected') {
        signalling.disconnect();
      }
      if (audioSignalling && audioSignalling.state !== 'connected') {
        audioSignalling.disconnect();
      }
      
      // Сбрасываем флаг инициализации только при реальном cleanup
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Запускается только один раз при монтировании

  // Функции для записи в localStorage
  const setIntParam = (key: string, value: number | null): void => {
    if (value === null) return;
    const prefixedKey = `${config.appName || 'webrtc'}_${key}`;
    window.localStorage.setItem(prefixedKey, value.toString());
  };

  const setBoolParam = (key: string, value: boolean | null): void => {
    if (value === null) return;
    const prefixedKey = `${config.appName || 'webrtc'}_${key}`;
    window.localStorage.setItem(prefixedKey, value.toString());
  };

  const getUsername = (): string => {
    const cookieValue = document.cookie.match('(^|[^;]+)\\s*broker_' + (config.appName || 'webrtc') + '\\s*=\\s*([^;]+)');
    return cookieValue ? cookieValue.pop()?.split("#")[0] || "webrtc" : "webrtc";
  };

  // Обработчики событий
  const handleEnterFullscreen = () => {
    if (showDrawer) {
      setShowDrawer(false);
    }
    if (webrtcRef.current?.input) {
      webrtcRef.current.input.enterFullscreen();
    }
  };

  const handlePlayStream = () => {
    if (webrtcRef.current) {
      webrtcRef.current.playStream();
    }
    if (audioWebrtcRef.current) {
      audioWebrtcRef.current.playStream();
    }
    setShowStart(false);
    setIsVideoPlaying(true);
  };

  const handleEnableClipboard = () => {
    navigator.clipboard.readText()
      .then(text => {
        if (webrtcRef.current) {
          webrtcRef.current.setCallbacks({ onstatus: (msg) => console.log(msg) });
          webrtcRef.current.sendDataChannelMessage("cr");
        }
      })
      .catch(err => {
        console.error('Failed to read clipboard contents: ' + err);
      });
  };

  // Эффекты для синхронизации настроек
  useEffect(() => {
    if (!initializedRef.current) return;
    if (webrtcRef.current && webrtcRef.current._send_channel && webrtcRef.current._send_channel.readyState === 'open') {
      webrtcRef.current.sendDataChannelMessage(`vb,${videoBitRate}`);
      setIntParam("videoBitRate", videoBitRate);
    } else {
      console.log(`[App] Skipping videoBitRate update - data channel not open (readyState: ${webrtcRef.current?._send_channel?.readyState || 'null'})`);
    }
  }, [videoBitRate]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (webrtcRef.current && webrtcRef.current._send_channel && webrtcRef.current._send_channel.readyState === 'open') {
      console.log("video framerate changed to " + videoFramerate);
      webrtcRef.current.sendDataChannelMessage(`_arg_fps,${videoFramerate}`);
      setIntParam("videoFramerate", videoFramerate);
    } else {
      console.log(`[App] Skipping videoFramerate update - data channel not open (readyState: ${webrtcRef.current?._send_channel?.readyState || 'null'})`);
    }
  }, [videoFramerate]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (webrtcRef.current && videoElementRef.current && webrtcRef.current._send_channel && webrtcRef.current._send_channel.readyState === 'open') {
      console.log("resize remote changed to " + resizeRemote);
      setWindowResolution(webrtcRef.current.input.getWindowResolution());
      const res = webrtcRef.current.input.getWindowResolution();
      const resStr = `${res[0]}x${res[1]}`;
      webrtcRef.current.sendDataChannelMessage(`_arg_resize,${resizeRemote},${resStr}`);
      setBoolParam("resizeRemote", resizeRemote);
    } else {
      console.log(`[App] Skipping resizeRemote update - data channel not open (readyState: ${webrtcRef.current?._send_channel?.readyState || 'null'})`);
    }
  }, [resizeRemote]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (webrtcRef.current && videoElementRef.current) {
      console.log("scaleLocal changed to " + scaleLocal);
      const videoElement = videoElementRef.current;
      if (scaleLocal) {
        videoElement.style.width = '';
        videoElement.style.height = '';
        videoElement.setAttribute("class", "video scale");
      } else {
        videoElement.setAttribute("class", "video");
      }
      setBoolParam("scaleLocal", scaleLocal);
    }
  }, [scaleLocal]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (webrtcRef.current && webrtcRef.current._send_channel && webrtcRef.current._send_channel.readyState === 'open') {
      webrtcRef.current.sendDataChannelMessage(`ab,${audioBitRate}`);
      setIntParam("audioBitRate", audioBitRate);
    } else {
      console.log(`[App] Skipping audioBitRate update - data channel not open (readyState: ${webrtcRef.current?._send_channel?.readyState || 'null'})`);
    }
  }, [audioBitRate]);

  useEffect(() => {
    if (!initializedRef.current) return;
    setBoolParam("turnSwitch", turnSwitch);
    
    // Никогда не перезагружаем, если соединение активно или находится в процессе установки
    const currentStatus = connectionStatusRef.current;
    const peerConnectionState = webrtcRef.current?.peerConnection?.connectionState;
    
    // Проверяем состояние соединения через ref (актуальное значение)
    if (currentStatus === 'checkconnect' || currentStatus === 'connected' || 
        peerConnectionState === 'connected' || peerConnectionState === 'connecting') {
      console.log(`[App] Skipping reload for turnSwitch change - connection is ${currentStatus} (peerConnection: ${peerConnectionState})`);
      return;
    }
    
    // Если нет peerConnection, можно безопасно перезагрузить
    if (!webrtcRef.current || !webrtcRef.current.peerConnection) {
      console.log(`[App] Reloading page due to turnSwitch change - no active connection`);
      setTimeout(() => {
        document.location.reload();
      }, 700);
      return;
    }
    
    // Перезагружаем только если соединение действительно неактивно
    setTimeout(() => {
      // Проверяем еще раз перед перезагрузкой через ref (актуальное значение)
      const statusBeforeReload = connectionStatusRef.current;
      const peerStateBeforeReload = webrtcRef.current?.peerConnection?.connectionState;
      
      if (statusBeforeReload === 'checkconnect' || statusBeforeReload === 'connected' || 
          peerStateBeforeReload === 'connected' || peerStateBeforeReload === 'connecting') {
        console.log(`[App] Cancelling reload for turnSwitch - connection became active (status: ${statusBeforeReload}, peerConnection: ${peerStateBeforeReload})`);
        return;
      }
      
      console.log(`[App] Reloading page due to turnSwitch change`);
      document.location.reload();
    }, 700);
  }, [turnSwitch]);

  useEffect(() => {
    if (!initializedRef.current) return;
    setBoolParam("debug", debug);
    
    // Никогда не перезагружаем, если соединение активно или находится в процессе установки
    const currentStatus = connectionStatusRef.current;
    const peerConnectionState = webrtcRef.current?.peerConnection?.connectionState;
    
    // Проверяем состояние соединения через ref (актуальное значение)
    if (currentStatus === 'connecting' || currentStatus === 'checkconnect' || currentStatus === 'connected' || 
        peerConnectionState === 'connected' || peerConnectionState === 'connecting') {
      console.log(`[App] Skipping reload for debug change - connection is ${currentStatus} (peerConnection: ${peerConnectionState})`);
      return;
    }
    
    // Если нет peerConnection, можно безопасно перезагрузить
    if (!webrtcRef.current || !webrtcRef.current.peerConnection) {
      console.log(`[App] Reloading page due to debug change - no active connection`);
      setTimeout(() => {
        document.location.reload();
      }, 700);
      return;
    }
    
    // Перезагружаем только если соединение действительно неактивно
    setTimeout(() => {
      // Проверяем еще раз перед перезагрузкой через ref (актуальное значение)
      const statusBeforeReload = connectionStatusRef.current;
      const peerStateBeforeReload = webrtcRef.current?.peerConnection?.connectionState;
      
      if (statusBeforeReload === 'connecting' || statusBeforeReload === 'checkconnect' || statusBeforeReload === 'connected' || 
          peerStateBeforeReload === 'connected' || peerStateBeforeReload === 'connecting') {
        console.log(`[App] Cancelling reload for debug - connection became active (status: ${statusBeforeReload}, peerConnection: ${peerStateBeforeReload})`);
        return;
      }
      
      console.log(`[App] Reloading page due to debug change`);
      document.location.reload();
    }, 700);
  }, [debug]);

  useEffect(() => {
    if (showDrawer && webrtcRef.current?.input) {
      webrtcRef.current.input.detach_context();
    } else if (!showDrawer && webrtcRef.current?.input) {
      webrtcRef.current.input.attach_context();
    }
  }, [showDrawer]);

  // Обновляем document.title при изменении appName
  useEffect(() => {
    document.title = `Selkies - ${config.appName || 'webrtc'}`;
  }, [config.appName]);


  const videoBitRateOptions = [
    { text: '250 kbps', value: 250 },
    { text: '500 kbps', value: 500 },
    { text: '750 kbps', value: 750 },
    { text: '1 mbps', value: 1000 },
    { text: '2 mbps', value: 2000 },
    { text: '3 mbps', value: 3000 },
    { text: '4 mbps', value: 4000 },
    { text: '6 mbps', value: 6000 },
    { text: '8 mbps', value: 8000 },
    { text: '10 mbps', value: 10000 },
    { text: '12 mbps', value: 12000 },
    { text: '16 mbps', value: 16000 },
    { text: '20 mbps', value: 20000 },
    { text: '25 mbps', value: 25000 },
    { text: '30 mbps', value: 30000 },
    { text: '40 mbps', value: 40000 },
    { text: '50 mbps', value: 50000 },
    { text: '60 mbps', value: 60000 },
    { text: '75 mbps', value: 75000 },
    { text: '80 mbps', value: 80000 },
    { text: '100 mbps', value: 100000 },
    { text: '150 mbps', value: 150000 },
    { text: '200 mbps', value: 200000 },
    { text: '300 mbps', value: 300000 },
    { text: '400 mbps', value: 400000 },
  ];

  const videoFramerateOptions = [
    { text: '10 fps', value: 10 },
    { text: '15 fps', value: 15 },
    { text: '30 fps', value: 30 },
    { text: '45 fps', value: 45 },
    { text: '60 fps', value: 60 },
    { text: '75 fps', value: 75 },
    { text: '90 fps', value: 90 },
    { text: '100 fps', value: 100 },
    { text: '120 fps', value: 120 },
    { text: '144 fps', value: 144 },
    { text: '165 fps', value: 165 },
    { text: '180 fps', value: 180 },
    { text: '200 fps', value: 200 },
    { text: '240 fps', value: 240 },
  ];

  const audioBitRateOptions = [
    { text: '24 kb/s', value: 24000 },
    { text: '32 kb/s', value: 32000 },
    { text: '48 kb/s', value: 48000 },
    { text: '64 kb/s', value: 64000 },
    { text: '96 kb/s', value: 96000 },
    { text: '128 kb/s', value: 128000 },
    { text: '192 kb/s', value: 192000 },
    { text: '256 kb/s', value: 256000 },
    { text: '320 kb/s', value: 320000 },
    { text: '510 kb/s', value: 510000 },
  ];

  return (
    <div className="app">
      <div className="video-container">
        <video
          ref={videoElementRef}
          id="stream"
          className={scaleLocal ? "video scale" : "video"}
          preload="none"
          disablePictureInPicture={true}
          playsInline
        >
          Your browser doesn't support video
        </video>
      </div>

      <div className="audio-container">
        <audio
          ref={audioElementRef}
          id="audio_stream"
          className="audio"
          preload="none"
          playsInline
        >
          Your browser doesn't support audio
        </audio>
      </div>

      {showDrawer && (
        <div className="drawer">
          <div className="drawer-header">
            <h2>Settings</h2>
            <button onClick={() => setShowDrawer(false)}>×</button>
          </div>
          <div className="drawer-content">
            <div className="settings-section">
              <label>
                Video bitrate:
                <select value={videoBitRate} onChange={(e) => setVideoBitRate(parseInt(e.target.value))}>
                  {videoBitRateOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.text}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="settings-section">
              <label>
                Video framerate:
                <select value={videoFramerate} onChange={(e) => setVideoFramerate(parseInt(e.target.value))}>
                  {videoFramerateOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.text}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="settings-section">
              <label>
                Audio bitrate:
                <select value={audioBitRate} onChange={(e) => setAudioBitRate(parseInt(e.target.value))}>
                  {audioBitRateOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.text}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="settings-section">
              <label>
                <input
                  type="checkbox"
                  checked={resizeRemote}
                  onChange={(e) => setResizeRemote(e.target.checked)}
                />
                Resize remote to fit window
              </label>
            </div>

            <div className="settings-section">
              <label>
                <input
                  type="checkbox"
                  checked={scaleLocal}
                  onChange={(e) => setScaleLocal(e.target.checked)}
                />
                Scale to fit window
              </label>
            </div>

            <div className="settings-section">
              <label>
                <input
                  type="checkbox"
                  checked={debug}
                  onChange={(e) => setDebug(e.target.checked)}
                />
                Debug logs
              </label>
            </div>

            <div className="settings-section">
              <label>
                <input
                  type="checkbox"
                  checked={turnSwitch}
                  onChange={(e) => setTurnSwitch(e.target.checked)}
                />
                Force relay connection
              </label>
            </div>

            <div className="stats-section">
              <h3>Connection Stats</h3>
              <p>Status: <strong>{status}</strong></p>
              <p>Connection type: <strong>{connectionStat.connectionStatType}</strong></p>
              <p>Latency: <strong>{connectionStat.connectionLatency} ms</strong></p>
              <p>Video: <strong>{connectionStat.connectionCodec} {connectionStat.connectionResolution}</strong></p>
              <p>Framerate: <strong>{connectionStat.connectionFrameRate} fps</strong></p>
              <p>Video bitrate: <strong>{connectionStat.connectionVideoBitrate} mbps</strong></p>
              <p>Audio codec: <strong>{connectionStat.connectionAudioCodecName}</strong></p>
              <p>Audio bitrate: <strong>{connectionStat.connectionAudioBitrate} kbps</strong></p>
            </div>

            <div className="logs-section">
              <h3>Status Logs</h3>
              <textarea readOnly value={logEntries.join('\n\n')} />
            </div>

            {debug && (
              <div className="logs-section">
                <h3>Debug Logs</h3>
                <textarea readOnly value={debugEntries.join('\n\n')} />
              </div>
            )}
          </div>
        </div>
      )}

      <button
        className="fab-container"
        onClick={() => setShowDrawer(!showDrawer)}
        title="Toggle menu"
      >
        ☰
      </button>

      <div className="loading">
        {status === 'failed' ? (
          <div>
            <button onClick={() => window.location.reload()}>Reload</button>
            <div className="loading-text">Connection failed.</div>
          </div>
        ) : (
          <div>
            {/* Показываем спиннер только если видео не играет И (соединение не установлено ИЛИ требуется запуск) */}
            {!isVideoPlaying && (status !== 'connected' || showStart) && (
              <>
                <div className="spinner"></div>
                <div className="loading-text">{loadingText || 'Connecting...'}</div>
              </>
            )}
            {/* Показываем кнопку Start когда соединение установлено, но стрим ещё не запущен */}
            {status === 'connected' && showStart && !isVideoPlaying && (
              <button onClick={handlePlayStream}>Start</button>
            )}
            {/* Спиннер автоматически скрывается когда видео играет (isVideoPlaying === true) */}
          </div>
        )}
      </div>

      <div className="toolbar">
        <button onClick={handleEnterFullscreen} title="Enter fullscreen (Ctrl+Shift+F)">
          ⛶
        </button>
        {clipboardStatus === 'enabled' ? (
          <span title="Clipboard enabled">📋</span>
        ) : (
          <button onClick={handleEnableClipboard} title="Enable clipboard">
            📋
          </button>
        )}
        {gamepad.gamepadState === 'connected' ? (
          <span title={`Gamepad connected: ${gamepad.gamepadName}`}>🎮</span>
        ) : (
          <span title="Gamepad disconnected">🎮</span>
        )}
        <span title={`Logged in as ${getUsername()}`}>👤</span>
      </div>
    </div>
  );
};

export default App;

