/**
 * Конфигурация для подключения к серверу
 * Используется для отладки, когда веб-часть на другом сервере
 */
export interface ConnectionConfig {
  /** Хост сервера (например, "111.111.111.111" или "localhost") */
  host: string;
  /** Порт сервера (по умолчанию 8080) */
  port?: number;
  /** Использовать HTTPS/WSS (по умолчанию false) */
  secure?: boolean;
  /** Путь к приложению (по умолчанию "webrtc") */
  appName?: string;
  /** Базовый путь (по умолчанию "/") */
  basePath?: string;
}

/**
 * Режим разработки - когда веб-часть на другом сервере
 */
export interface DevConfig {
  /** Включен ли режим разработки */
  enabled: boolean;
  /** Конфигурация подключения для режима разработки */
  connection?: ConnectionConfig;
}

/**
 * Глобальная конфигурация приложения
 */
export interface AppConfig {
  /** Режим разработки */
  dev?: DevConfig;
  /** Конфигурация подключения по умолчанию (используется если dev не включен) */
  defaultConnection?: ConnectionConfig;
}

/**
 * Получить конфигурацию подключения
 * Если включен dev режим, используется dev.connection
 * Иначе используется defaultConnection или значения из window.location
 * 
 * Поддерживает URL параметры:
 * - ?server=IP - указать сервер для подключения
 * - &port=PORT - указать порт
 * - &app=APPNAME - указать имя приложения
 * - &debug=true - включить отладку
 */
export function getConnectionConfig(config?: AppConfig): ConnectionConfig {
  if (config?.dev?.enabled && config.dev.connection) {
    return config.dev.connection;
  }

  if (config?.defaultConnection) {
    return config.defaultConnection;
  }

  // Парсим URL параметры
  const urlParams = new URLSearchParams(window.location.search);
  const serverParam = urlParams.get('server');
  const portParam = urlParams.get('port');
  const appParam = urlParams.get('app');
  const secureParam = urlParams.get('secure');

  // По умолчанию используем текущий location или параметры из URL
  const protocol = secureParam ? (secureParam === 'true' ? 'https' : 'http') 
                  : (window.location.protocol === 'https:' ? 'https' : 'http');
  const host = serverParam || window.location.hostname;
  
  // Если указан server в параметрах, но не указан port - используем стандартные порты
  // Иначе используем port из URL или из window.location
  let port: number;
  if (portParam) {
    port = parseInt(portParam);
  } else if (serverParam) {
    // Если указан внешний сервер, но порт не указан - используем стандартные порты
    port = protocol === 'https' ? 443 : 80;
  } else {
    // Если используем текущий location - берём его порт
    port = window.location.port ? parseInt(window.location.port) 
           : (protocol === 'https' ? 443 : 80);
  }
  
  // Парсим appName из URL параметров или pathname
  let appName = appParam;
  if (!appName) {
    const pathname = window.location.pathname;
    appName = pathname.endsWith('/') 
      ? pathname.split('/').filter(p => p)[0] || 'webrtc'
      : pathname.split('/').filter(p => p).pop() || 'webrtc';
  }

  return {
    host,
    port,
    secure: protocol === 'https',
    appName,
    basePath: '/',
  };
}

/**
 * Создать URL для WebSocket подключения
 */
export function createSignallingUrl(config: ConnectionConfig): string {
  const protocol = config.secure ? 'wss' : 'ws';
  const port = config.port ? `:${config.port}` : '';
  const basePath = config.basePath || '/';
  const appName = config.appName || 'webrtc';
  
  return `${protocol}://${config.host}${port}${basePath}${appName}/signalling/`;
}

/**
 * Создать URL для TURN конфигурации
 */
export function createTurnUrl(config: ConnectionConfig): string {
  const protocol = config.secure ? 'https' : 'http';
  const port = config.port ? `:${config.port}` : '';
  const basePath = config.basePath || '/';
  
  return `${protocol}://${config.host}${port}${basePath}turn`;
}


