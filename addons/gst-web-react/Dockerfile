# Multi-stage build для gst-web-react
# Создает production-ready сборку React+TypeScript приложения

FROM node:18-alpine AS builder

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production=false

# Копируем исходники
COPY . .

# Собираем проект
RUN npm run build

# Проверяем что сборка успешна
RUN test -f /app/dist/index.html || (echo "Build failed: index.html not found" && exit 1)

# Создаем финальный образ с архивом
FROM alpine:latest

WORKDIR /opt

# Копируем собранные файлы
COPY --from=builder /app/dist /opt/gst-web-react

# Создаем tar.gz архив
RUN cd /opt && tar -czf gst-web-react.tar.gz gst-web-react

# Проверяем архив
RUN tar -tzf /opt/gst-web-react.tar.gz | head -10

CMD ["sh"]

