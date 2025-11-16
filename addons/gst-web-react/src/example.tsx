/**
 * Пример использования компонента App с различными конфигурациями
 */

import React from 'react';
import App, { AppProps } from './App';
import { ConnectionConfig } from './config';

// Пример 1: Базовое использование (использует window.location)
export const BasicExample: React.FC = () => {
  return <App />;
};

// Пример 2: С явной конфигурацией подключения
export const WithConnectionConfigExample: React.FC = () => {
  const connectionConfig: ConnectionConfig = {
    host: '111.111.111.111',
    port: 8080,
    secure: false,
    appName: 'webrtc',
    basePath: '/'
  };

  return <App connectionConfig={connectionConfig} />;
};

// Пример 3: С режимом разработки (dev mode)
export const WithDevModeExample: React.FC = () => {
  const appConfig: AppProps['appConfig'] = {
    dev: {
      enabled: true,
      connection: {
        host: '111.111.111.111',
        port: 8080,
        secure: false,
        appName: 'webrtc',
        basePath: '/'
      }
    }
  };

  return <App appConfig={appConfig} />;
};

// Пример 4: С конфигурацией по умолчанию
export const WithDefaultConfigExample: React.FC = () => {
  const appConfig: AppProps['appConfig'] = {
    defaultConnection: {
      host: 'localhost',
      port: 8080,
      secure: false,
      appName: 'webrtc',
      basePath: '/'
    }
  };

  return <App appConfig={appConfig} />;
};

// Пример 5: Полная конфигурация с приоритетом dev mode
export const FullConfigExample: React.FC = () => {
  const appConfig: AppProps['appConfig'] = {
    dev: {
      enabled: true, // Включен режим разработки
      connection: {
        host: '111.111.111.111', // Используется этот хост
        port: 8080,
        secure: false,
        appName: 'webrtc',
        basePath: '/'
      }
    },
    defaultConnection: {
      host: 'localhost', // Игнорируется, т.к. dev.enabled = true
      port: 8080,
      secure: false,
      appName: 'webrtc',
      basePath: '/'
    }
  };

  return <App appConfig={appConfig} />;
};


