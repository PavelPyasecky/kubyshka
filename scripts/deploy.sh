#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$script_dir/.." && pwd)

DEPLOY_HOST=${DEPLOY_HOST:-62.182.102.96}
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/kubyshka}
SITE_URL=${SITE_URL:-https://kubyshka.prosandbox.ru}
DEPLOY_SSH_PORT=${DEPLOY_SSH_PORT:-22}
DIST_DIR=${DIST_DIR:-$root/apps/web/dist}
MANIFEST=${MANIFEST:-$root/integrity.json}
DEPLOY_VERIFY_ATTEMPTS=${DEPLOY_VERIFY_ATTEMPTS:-10}
DEPLOY_VERIFY_INTERVAL=${DEPLOY_VERIFY_INTERVAL:-3}

if [ -z "${DEPLOY_SHA:-}" ]; then
  echo "Нужен DEPLOY_SHA — полный хеш коммита." >&2
  exit 1
fi
if [ -z "${DEPLOY_SSH_KEY_FILE:-}" ]; then
  echo "Нужен DEPLOY_SSH_KEY_FILE — путь к приватному ключу." >&2
  exit 1
fi
if [[ ! "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "DEPLOY_SHA должен быть полным хешем коммита из 40 шестнадцатеричных знаков." >&2
  exit 1
fi
if [[ ! "$DEPLOY_HOST" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "DEPLOY_HOST содержит недопустимые символы." >&2
  exit 1
fi
if [[ ! "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
  echo "DEPLOY_USER содержит недопустимые символы." >&2
  exit 1
fi
if [[ ! "$DEPLOY_PATH" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "DEPLOY_PATH должен быть абсолютным путём без пробелов." >&2
  exit 1
fi
if [[ ! "$DEPLOY_SSH_PORT" =~ ^[0-9]+$ ]]; then
  echo "DEPLOY_SSH_PORT должен быть числом." >&2
  exit 1
fi
if [[ "$SITE_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
  :
elif [[ "$SITE_URL" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?$ ]]; then
  :
else
  echo "SITE_URL должен быть https-адресом сайта. Для локальной проверки допускается http://127.0.0.1:порт." >&2
  exit 1
fi
if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "В ${DIST_DIR} нет index.html. Сначала соберите клиент." >&2
  exit 1
fi
if [ ! -f "$MANIFEST" ]; then
  echo "Нет файла манифеста ${MANIFEST}." >&2
  exit 1
fi

if [ "${GITHUB_EVENT_NAME:-}" = "push" ] && [ -z "${DEPLOY_REQUIRE_TIP+x}" ]; then
  DEPLOY_REQUIRE_TIP=1
fi

key_file=$(mktemp)
known_hosts=$(mktemp)
cleanup() {
  rm -f "$key_file" "$known_hosts"
}
trap cleanup EXIT

tr -d '\r' < "$DEPLOY_SSH_KEY_FILE" > "$key_file"
printf '\n' >> "$key_file"
chmod 600 "$key_file"
if ! ssh-keygen -y -f "$key_file" >/dev/null 2>&1; then
  echo "Ключ в DEPLOY_SSH_KEY_FILE не читается как приватный ключ OpenSSH." >&2
  exit 1
fi

if [ -n "${DEPLOY_KNOWN_HOSTS_FILE:-}" ]; then
  cat "$DEPLOY_KNOWN_HOSTS_FILE" > "$known_hosts"
elif [ -n "${DEPLOY_KNOWN_HOSTS:-}" ]; then
  printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$known_hosts"
elif [ "$DEPLOY_HOST" = "62.182.102.96" ]; then
  printf '%s\n' '62.182.102.96 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDUoF8WScNFhPISBQ8DpqryzBXnUER2JgxSQfD3+6rHM' > "$known_hosts"
else
  echo "Для ${DEPLOY_HOST} нет записанного ключа хоста. Задайте DEPLOY_KNOWN_HOSTS или DEPLOY_KNOWN_HOSTS_FILE." >&2
  echo "Проверка ключа хоста не отключается." >&2
  exit 1
fi
chmod 644 "$known_hosts"

node "$script_dir/check-integrity.mjs" --dist "$DIST_DIR" --manifest "$MANIFEST"
cp "$MANIFEST" "$DIST_DIR/integrity.json"

ssh_opts=(
  -i "$key_file"
  -p "$DEPLOY_SSH_PORT"
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$known_hosts"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o ConnectTimeout=20
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
)

run_remote() {
  local action=$1
  ssh "${ssh_opts[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
    "DEPLOY_REQUIRE_TIP=$(printf '%q' "${DEPLOY_REQUIRE_TIP:-}") DEPLOY_ALLOW_NO_ENV=$(printf '%q' "${DEPLOY_ALLOW_NO_ENV:-}") bash -s -- $(printf '%q' "$action") $(printf '%q' "$DEPLOY_SHA") $(printf '%q' "$DEPLOY_PATH")" \
    < "$script_dir/deploy-remote.sh"
}

rollback() {
  echo "Выкат не удался. Возвращаю предыдущие dist, коммит и образ api." >&2
  if ! run_remote rollback; then
    echo "Автоматический откат не удался. Смотрите ${DEPLOY_PATH}/.deploy: previous-commit, previous-dist и дамп в backups." >&2
    return 1
  fi
}

verify_site() {
  local attempt=1
  while [ "$attempt" -le "$DEPLOY_VERIFY_ATTEMPTS" ]; do
    if node "$script_dir/verify-release.mjs" --site "$SITE_URL" --manifest "$MANIFEST"; then
      return 0
    fi
    if [ "$attempt" -lt "$DEPLOY_VERIFY_ATTEMPTS" ]; then
      echo "Проверка сайта не прошла, повтор ${attempt} из ${DEPLOY_VERIFY_ATTEMPTS}." >&2
      sleep "$DEPLOY_VERIFY_INTERVAL"
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

set +e
run_remote check
status=$?
set -e
if [ "$status" -eq 42 ]; then
  echo "Выкат ${DEPLOY_SHA} пропущен: origin/main на сервере уже указывает на другой коммит."
  exit 0
fi
if [ "$status" -ne 0 ]; then
  exit "$status"
fi

run_remote prepare

rsh="ssh -i $(printf '%q' "$key_file") -p $(printf '%q' "$DEPLOY_SSH_PORT") -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$(printf '%q' "$known_hosts") -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20"
if ! RSYNC_RSH="$rsh" rsync -a --delete "$DIST_DIR/" "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/apps/web/dist/"; then
  rollback || true
  exit 1
fi

if ! run_remote release; then
  rollback || true
  exit 1
fi

if ! verify_site; then
  rollback || true
  exit 1
fi

echo "Выкат ${DEPLOY_SHA} готов: ${SITE_URL}"
