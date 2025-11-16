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
 * Приоритет: URL параметры > config > window.location
 */
export function getConnectionConfig(config?: AppConfig): ConnectionConfig {
  // Читаем URL параметры
  const urlParams = new URLSearchParams(window.location.search);
  const serverParam = urlParams.get('server');
  const portParam = urlParams.get('port');
  const appParam = urlParams.get('app');
  
  console.log('[Config] URL params:', {
    server: serverParam,
    port: portParam,
    app: appParam
  });
  
  // Если есть URL параметры, используем их
  if (serverParam) {
    const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
    const port = portParam ? parseInt(portParam) : (protocol === 'https' ? 443 : 80);
    const appName = appParam || 'webrtc';
    
    const connectionConfig = {
      host: serverParam,
      port,
      secure: protocol === 'https',
      appName,
      basePath: '/',
    };
    
    console.log('[Config] Using URL params config:', connectionConfig);
    
    return connectionConfig;
  }
  
  // Если включен dev режим, используем dev.connection
  if (config?.dev?.enabled && config.dev.connection) {
    return config.dev.connection;
  }

  // Если есть defaultConnection, используем его
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

  const locationConfig = {
    host,
    port,
    secure: protocol === 'https',
    appName,
    basePath: '/',
  };
  
  console.log('[Config] Using location config:', locationConfig);

  return locationConfig;
}

/**
 * Создать URL для WebSocket подключения
 */
export function createSignallingUrl(config: ConnectionConfig): string {
  const protocol = config.secure ? 'wss' : 'ws';
  const port = config.port ? `:${config.port}` : '';
  const basePath = config.basePath || '/';
  const appName = config.appName || 'webrtc';
  
  const url = `${protocol}://${config.host}${port}${basePath}${appName}/signalling/`;
  console.log('[Config] Signalling URL:', url);
  
  return url;
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


