# Запуск и развёртывание

## Локально

Нужны Node 22+ и Postgres.

```bash
npm install
createdb kubyshka_dev

# сервер
cd apps/api
DATABASE_URL="postgres://$USER@127.0.0.1:5432/kubyshka_dev" COOKIE_SECURE=false PORT=3100 npm run dev

# клиент, в другом окне
npm run dev --workspace @kubyshka/web
```

Приложение откроется на `http://127.0.0.1:5173`, запросы к `/api` проксируются на сервер. Миграции накатываются при старте сервера.

Проверить сервер целиком, включая разрешение конфликтов:

```bash
node scripts/smoke.mjs http://127.0.0.1:3100
```

## На своём VPS

Нужны Docker с плагином compose и домен, A-запись которого указывает на сервер.

```bash
git clone <репозиторий> kubyshka && cd kubyshka
cp .env.example .env
```

Заполнить `.env`:

```
DOMAIN=kubyshka.example.com
POSTGRES_PASSWORD=<openssl rand -base64 24>
SETUP_CODE=<необязательно>
```

Собрать клиент и поднять всё:

```bash
npm install
npm run build --workspace @kubyshka/web
docker compose up -d --build
```

Caddy сам получит сертификат Let's Encrypt, поэтому порты 80 и 443 должны быть свободны. Если на сервере уже работает nginx или Traefik, уберите сервис `web` из `docker-compose.yml`, пробросьте порт сервиса `api` наружу и направьте на него `/api`, а содержимое `apps/web/dist` отдайте существующим веб-сервером.

### Первый вход

Откройте домен в Safari на iPhone, нажмите «Поделиться» и «На экран Домой». Запускать приложение дальше нужно именно с иконки: без этого iOS не включит полноэкранный режим и будет агрессивнее вытеснять локальную базу.

При первом открытии приложение предложит создать семью: имя и PIN. После этого регистрация закрывается навсегда, второй человек входит только по коду приглашения из раздела «Ещё».

Если между развёртыванием и вашим первым открытием пройдёт заметное время, задайте `SETUP_CODE` — тогда создать семью сможет только тот, кто знает код.

### Обновление

```bash
git pull
npm install
npm run build --workspace @kubyshka/web
docker compose up -d --build
```

### Резервные копии

Контейнер `backup` каждые сутки кладёт сжатый дамп в `./backups` и хранит последние четырнадцать. Восстановление:

```bash
gunzip -c backups/kubyshka-2026-11-19.sql.gz | docker compose exec -T db psql -U kubyshka kubyshka
```

### Если что-то не работает

```bash
docker compose logs -f api      # ошибки сервера
docker compose logs -f web      # выпуск сертификата
docker compose exec db psql -U kubyshka kubyshka -c '\dt'
```

Состояние синхронизации на устройстве видно в разделе «Ещё». Кнопка «Выйти на этом устройстве» стирает локальную базу и отзывает токен, данные на сервере остаются.
