# Отладка CORS для gst-web-react

## Проблема

При разработке на локальной машине (Windows) с `npm run dev` (localhost:3000), браузер блокирует запросы к удалённому signalling серверу из-за политики CORS:

```
Access to fetch at 'http://209.250.236.147:8080/turn' from origin 'http://localhost:3000' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present 
on the requested resource.
```

## Решение

### 1. Изменения в Signalling сервере

Мы добавили CORS заголовки в Python signalling сервер (`src/selkies_gstreamer/signalling_web.py`):

#### Изменение 1: CORS заголовки в HTTP ответах
Метод `http_response` теперь включает:
- `Access-Control-Allow-Origin: *` - разрешает запросы с любого origin
- `Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE` - разрешённые методы
- `Access-Control-Allow-Headers: *` - разрешает любые заголовки
- `Access-Control-Max-Age: 86400` - кэширование preflight на 24 часа

#### Изменение 2: Обработка OPTIONS запросов
Метод `process_request` теперь обрабатывает CORS preflight (OPTIONS) запросы:
```python
# Обработка CORS preflight (OPTIONS) запросов
if request.method == "OPTIONS":
    web_logger.debug("Handling CORS preflight request for {}".format(path))
    return self.http_response(http.HTTPStatus.NO_CONTENT, response_headers, b'')
```

### 2. Перезапуск Signalling сервера

**ВАЖНО:** После изменений в Python коде **необходимо перезапустить** signalling сервер на удалённой машине!

#### На Linux сервере:

```bash
# 1. Найти процесс signalling сервера
ps aux | grep selkies

# 2. Остановить процесс
sudo kill <PID>
# или если запущен через systemd:
sudo systemctl restart selkies

# 3. Запустить заново
# Зависит от вашего способа запуска, например:
python3 -m selkies_gstreamer.gstwebrtc_app --enable_basic_auth ...
```

#### Проверка применения изменений:

```bash
# На Linux сервере с selkies
cd /path/to/selkies
python3 -c "from src.selkies_gstreamer.signalling_web import WebRTCSimpleServer; import inspect; print(inspect.getsource(WebRTCSimpleServer.http_response))"
```

Вы должны увидеть новые CORS заголовки в выводе.

### 3. Проверка в браузере

После перезапуска сервера:

1. **Откройте DevTools** (F12)
2. **Перейдите на вкладку Network**
3. **Обновите страницу** (Ctrl+R)
4. **Найдите запрос `/turn`**
5. **Проверьте Response Headers:**

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE
Access-Control-Allow-Headers: *
Access-Control-Max-Age: 86400
```

### 4. Тест CORS с curl

С вашей Windows машины:

```powershell
# Проверка GET запроса
curl -v -H "Origin: http://localhost:3000" http://209.250.236.147:8080/turn

# Проверка OPTIONS preflight
curl -v -X OPTIONS -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET" http://209.250.236.147:8080/turn
```

В ответе должны быть CORS заголовки.

## Альтернативное решение (если нет доступа к серверу)

Если вы не можете перезапустить signalling сервер, можно использовать **Vite proxy** (но мы этого избегали по вашей просьбе).

В `addons/gst-web-react/vite.config.ts`:

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/turn': {
        target: 'http://209.250.236.147:8080',
        changeOrigin: true,
      }
    }
  }
})
```

## Отладка на Windows

### Запуск dev сервера:

```powershell
# В директории addons/gst-web-react
npm run dev
```

Dev сервер запустится на `http://localhost:3000` (или другом порту, если 3000 занят).

### Подключение к удалённому серверу:

```
http://localhost:3000/?server=209.250.236.147&port=8080&app=desktop&debug=true
```

### Проверка логов:

1. **В браузере (F12 → Console):**
   - Сообщения от `App.tsx`
   - `[Config] URL params:` - показывает распарсенные параметры
   - `[Config] Signalling URL:` - показывает финальный URL для подключения
   - Ошибки WebRTC, WebSocket, и т.д.

2. **В терминале (где запущен npm run dev):**
   - Vite dev server логи
   - HMR (Hot Module Replacement) уведомления
   - Ошибки компиляции TypeScript

## Типичные ошибки

### 1. CORS всё ещё блокируется
**Причина:** Signalling сервер не перезапущен или изменения не применены.
**Решение:** Перезапустите сервер и проверьте, что новая версия кода используется.

### 2. "Failed to fetch"
**Причина:** Сервер недоступен или firewall блокирует запросы.
**Решение:** Проверьте доступность сервера (`curl http://209.250.236.147:8080/health`).

### 3. Параметры URL игнорируются
**Причина:** Кэш браузера или старый bundle.
**Решение:** Жёсткая перезагрузка (Ctrl+Shift+R) или очистка кэша.

## Production Build

Для production сборки CORS не нужен, так как клиент и сервер будут на одном домене:

```bash
npm run build
```

Результат в `dist/` можно разместить на том же сервере, где работает signalling server.

## Безопасность

**ВАЖНО:** `Access-Control-Allow-Origin: *` разрешает запросы с **любого** origin. Это удобно для разработки, но может быть риском в production.

Для production рекомендуется:
1. Ограничить origins через переменную окружения
2. Или размещать клиент и сервер на одном домене (CORS не нужен)

Пример с ограничением:

```python
# В __init__ класса WebRTCSimpleServer
self.cors_allowed_origins = os.environ.get('CORS_ALLOWED_ORIGINS', '*').split(',')

# В http_response
allowed_origin = '*'
if self.cors_allowed_origins != ['*'] and origin in self.cors_allowed_origins:
    allowed_origin = origin

headers = websockets.datastructures.Headers([
    # ...
    ("Access-Control-Allow-Origin", allowed_origin),
    # ...
])
```

## Итого: Чек-лист

- [x] Изменения в `signalling_web.py` применены
- [ ] Signalling сервер на 209.250.236.147:8080 **перезапущен**
- [ ] CORS заголовки присутствуют в `/turn` ответе (проверено через curl или DevTools)
- [ ] Dev сервер на Windows запущен (`npm run dev`)
- [ ] URL с параметрами работает: `http://localhost:3000/?server=209.250.236.147&port=8080&app=desktop&debug=true`
- [ ] Ошибки CORS в консоли исчезли
- [ ] Приложение успешно получает TURN конфигурацию

---

**Главное:** Обязательно перезапустите Python signalling сервер на удалённой машине!

