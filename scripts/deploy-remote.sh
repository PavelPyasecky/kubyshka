#!/usr/bin/env bash
# Выполняется на сервере. apps/web/dist нельзя заменять каталогом:
# Caddy держит inode bind-mount и после rm/mv начинает отдавать 404.
set -euo pipefail
umask 077

action=${1:?}
sha=${2:?}
app_dir=${3:?}

if [[ ! "$action" =~ ^(check|prepare|release|rollback)$ ]]; then
  echo "Неизвестное действие выката." >&2
  exit 1
fi
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Ожидался полный хеш коммита." >&2
  exit 1
fi
if [[ ! "$app_dir" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "Небезопасный путь приложения." >&2
  exit 1
fi

cd "$app_dir"
snap="$app_dir/.deploy"

gitc() {
  git -c safe.directory="$app_dir" "$@"
}

require_tools() {
  local tool
  for tool in rsync git gzip sha256sum docker; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "На сервере нет команды ${tool}. Выкат остановлен до изменений." >&2
      exit 1
    fi
  done
  if ! docker compose version >/dev/null 2>&1; then
    echo "На сервере нет Docker Compose v2. Выкат остановлен до изменений." >&2
    exit 1
  fi
}

env_digest() {
  sha256sum .env | awk '{print $1}'
}

assert_env() {
  if [ ! -s "$snap/env.sha256" ]; then
    return 0
  fi
  if [ ! -f .env ] || [ "$(env_digest)" != "$(cat "$snap/env.sha256")" ]; then
    echo "Файл .env изменился или пропал. Выкат остановлен, содержимое .env не печатается." >&2
    exit 1
  fi
}

fetch_commit() {
  local target=$1
  gitc fetch origin main
  if ! gitc cat-file -e "${target}^{commit}" >/dev/null 2>&1; then
    gitc fetch origin "$target"
  fi
  gitc cat-file -e "${target}^{commit}"
}

check() {
  require_tools
  export GIT_TERMINAL_PROMPT=0
  if [ "${DEPLOY_ALLOW_NO_ENV:-}" != "1" ] && [ ! -f .env ]; then
    echo "В ${app_dir} нет .env. Выкат остановлен, файл не создаётся и не печатается." >&2
    exit 1
  fi
  fetch_commit "$sha"
  if [ "${DEPLOY_REQUIRE_TIP:-}" = "1" ]; then
    local tip
    tip=$(gitc rev-parse --verify origin/main)
    if [ "$tip" != "$sha" ]; then
      echo "origin/main сейчас ${tip}, этот выкат собран из ${sha}." >&2
      exit 42
    fi
  fi
}

prepare() {
  require_tools
  install -d -m 700 "$snap" "$snap/backups"
  chmod 700 "$snap" "$snap/backups"
  if [ -f .env ]; then
    env_digest > "$snap/env.sha256"
    chmod 600 "$snap/env.sha256"
  fi

  local dump size cid
  dump="$snap/backups/kubyshka-pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-${sha}.sql.gz"
  docker compose exec -T db pg_dump -U kubyshka --no-owner kubyshka | gzip -c > "$dump"
  gzip -t "$dump"
  size=$(wc -c < "$dump")
  if [ "$size" -lt 20 ]; then
    echo "Дамп базы пустой. Выкат остановлен до замены файлов." >&2
    exit 1
  fi
  chmod 600 "$dump"

  mkdir -p apps/web/dist
  stat -c %i apps/web/dist > "$snap/dist-inode"
  chmod 600 "$snap/dist-inode"
  rm -rf "$snap/previous-dist"
  install -d -m 700 "$snap/previous-dist"
  rsync -a apps/web/dist/ "$snap/previous-dist/"
  gitc rev-parse HEAD > "$snap/previous-commit"
  chmod 600 "$snap/previous-commit"

  cid=""
  while IFS= read -r line; do
    cid=$line
    break
  done < <(docker compose ps -aq api || true)
  if [ -n "$cid" ]; then
    docker inspect --format '{{.Image}}' "$cid" > "$snap/previous-image-id"
    docker inspect --format '{{.Config.Image}}' "$cid" > "$snap/previous-image-name"
    chmod 600 "$snap/previous-image-id" "$snap/previous-image-name"
    docker tag "$(cat "$snap/previous-image-id")" kubyshka-api:rollback
  else
    rm -f "$snap/previous-image-id" "$snap/previous-image-name"
  fi
}

assert_dist_inode() {
  local inode
  inode=$(stat -c %i apps/web/dist)
  if [ "$inode" != "$(cat "$snap/dist-inode")" ]; then
    echo "Каталог apps/web/dist заменили целиком. Caddy остался бы на старом inode и отдавал 404." >&2
    exit 1
  fi
}

release() {
  export GIT_TERMINAL_PROMPT=0
  assert_dist_inode
  fetch_commit "$sha"
  gitc checkout --detach --force "$sha"
  if [ "$(gitc rev-parse HEAD)" != "$sha" ]; then
    echo "После checkout HEAD не равен ${sha}." >&2
    exit 1
  fi
  assert_env
  assert_dist_inode
  rm -f "$snap/env.sha256"
  docker compose up -d --build --wait --wait-timeout 300
}

restore_image() {
  local id name
  if [ ! -s "$snap/previous-image-id" ]; then
    return 0
  fi
  id=$(cat "$snap/previous-image-id")
  name=$(cat "$snap/previous-image-name")
  docker tag "$id" "$name"
  docker tag "$id" kubyshka-api
  docker tag "$id" kubyshka-api:latest
  docker tag "$id" kubyshka-api:rollback
}

rollback() {
  export GIT_TERMINAL_PROMPT=0
  local prev
  prev=$(tr -d '[:space:]' < "$snap/previous-commit")
  gitc fetch origin "$prev" || true
  gitc checkout --detach --force "$prev"
  mkdir -p apps/web/dist
  rsync -a --delete "$snap/previous-dist/" apps/web/dist/
  restore_image
  rm -f "$snap/env.sha256"
  docker compose up -d --no-build --force-recreate --wait --wait-timeout 300
  echo "Откат выполнен: коммит ${prev}." >&2
}

case "$action" in
  check) check ;;
  prepare) prepare ;;
  release) release ;;
  rollback) rollback ;;
esac
