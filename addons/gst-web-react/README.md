# gst-web-react

React + TypeScript версия веб-клиента для Selkies GStreamer WebRTC.

## Особенности

- **Монолитный React компонент** - весь функционал в одном компоненте
- **TypeScript** - полная типизация
- **Конфигурация для отладки** - возможность подключения к серверу на другом хосте
- **Передача данных через props** - данные подключения передаются в компонент, а не парсятся из hostname

## Установка

```bash
npm install
```

## Разработка

```bash
npm run dev
```

Приложение будет доступно по адресу `http://localhost:3000`

## Сборка

```bash
npm run build
```

Собранные файлы будут в папке `dist/`

## Использование

### Базовое использование

```tsx
import App from './App';

<App />
```

### С конфигурацией подключения

```tsx
import App, { ConnectionConfig } from './App';

const config: ConnectionConfig = {
  host: '111.111.111.111',
  port: 8080,
  secure: false,
  appName: 'webrtc',
  basePath: '/'
};

<App connectionConfig={config} />
```

### С режимом разработки

```tsx
import App, { AppConfig } from './App';

const appConfig: AppConfig = {
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

<App appConfig={appConfig} />
```

## Конфигурация

### ConnectionConfig

- `host` (string, обязательное) - хост сервера
- `port` (number, опциональное) - порт сервера (по умолчанию 80/443)
- `secure` (boolean, опциональное) - использовать HTTPS/WSS (по умолчанию false)
- `appName` (string, опциональное) - имя приложения (по умолчанию "webrtc")
- `basePath` (string, опциональное) - базовый путь (по умолчанию "/")

### AppConfig

- `dev` (DevConfig, опциональное) - конфигурация режима разработки
  - `enabled` (boolean) - включен ли режим разработки
  - `connection` (ConnectionConfig) - конфигурация подключения для режима разработки
- `defaultConnection` (ConnectionConfig, опциональное) - конфигурация подключения по умолчанию

## Режим разработки

Режим разработки позволяет подключиться к серверу на другом хосте, что удобно для разработки, когда веб-часть находится на одном сервере, а серверная часть на другом.

Включите режим разработки через `appConfig.dev.enabled = true` и укажите конфигурацию подключения в `appConfig.dev.connection`.

## Структура проекта

```
gst-web-react/
├── src/
│   ├── App.tsx          # Монолитный React компонент
│   ├── App.css          # Стили компонента
│   ├── main.tsx         # Точка входа
│   ├── index.css        # Глобальные стили
│   ├── config.ts        # Конфигурация подключения
│   ├── webrtc.ts        # WebRTC логика
│   ├── signalling.ts    # Signalling логика
│   ├── input.ts         # Обработка ввода
│   ├── gamepad.ts       # Обработка геймпада
│   └── util.ts          # Утилиты
├── index.html           # HTML шаблон
├── package.json         # Зависимости
├── tsconfig.json        # TypeScript конфигурация
├── vite.config.ts      # Vite конфигурация
└── README.md            # Документация
```

## Отличия от оригинального gst-web

1. **TypeScript вместо JavaScript** - полная типизация
2. **React вместо Vue** - использование React для UI
3. **Монолитный компонент** - весь функционал в одном компоненте
4. **Конфигурация через props** - данные подключения передаются через props, а не парсятся из hostname
5. **Режим разработки** - возможность подключения к серверу на другом хосте

## Лицензия

См. LICENSE файл в корне проекта.


