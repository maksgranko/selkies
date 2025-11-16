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
 */
export function getConnectionConfig(config?: AppConfig): ConnectionConfig {
  if (config?.dev?.enabled && config.dev.connection) {
    return config.dev.connection;
  }

  if (config?.defaultConnection) {
    return config.defaultConnection;
  }

  // По умолчанию используем текущий location
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  const host = window.location.hostname;
  const port = window.location.port ? parseInt(window.location.port) : (protocol === 'https' ? 443 : 80);
  
  // Парсим appName из pathname
  const pathname = window.location.pathname;
  const appName = pathname.endsWith('/') 
    ? pathname.split('/').filter(p => p)[0] || 'webrtc'
    : pathname.split('/').filter(p => p).pop() || 'webrtc';

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


