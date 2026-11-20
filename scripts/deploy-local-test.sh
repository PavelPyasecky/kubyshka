#!/usr/bin/env bash
# Проверяет scripts/deploy.sh через sshd в контейнере. К проду не ходит.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

if grep -n 'StrictHostKeyChecking=no' scripts/deploy.sh scripts/deploy-remote.sh; then
  echo "Проверка ключа хоста отключена." >&2
  exit 1
fi

if docker info >/dev/null 2>&1; then
  docker=(docker)
else
  docker=(sudo docker)
fi

tmp=$(mktemp -d)
cname="kubyshka-deploy-test-$$"
server_pid=""
secret='super-secret-test-value'

cleanup() {
  "${docker[@]}" rm -f "$cname" >/dev/null 2>&1 || true
  if [ -n "$server_pid" ]; then
    kill "$server_pid" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT

ssh-keygen -t ed25519 -f "$tmp/id" -N '' -q
printf '%s\n' "POSTGRES_PASSWORD=${secret}" > "$tmp/env"
chmod 600 "$tmp/env"

cat > "$tmp/docker-stub" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' "$*" >> /tmp/docker-calls.log
if [ "${1:-}" = "compose" ]; then
  shift
  case "${1:-}" in
    version)
      echo "Docker Compose version v2.99.0-stub"
      ;;
    exec)
      printf '%s\n' '-- stub dump'
      ;;
    ps)
      printf '%s\n' 'stubcid'
      ;;
    up)
      has_build=0
      for arg in "$@"; do
        if [ "$arg" = "--build" ]; then
          has_build=1
        fi
      done
      if [ "$has_build" = 1 ] && [ -f /tmp/fail-compose ]; then
        echo "compose up --build failed" >&2
        exit 1
      fi
      ;;
  esac
  exit 0
fi
if [ "${1:-}" = "inspect" ]; then
  case "$*" in
    *Config.Image*) printf '%s\n' 'kubyshka-api:latest' ;;
    *) printf '%s\n' 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' ;;
  esac
  exit 0
fi
if [ "${1:-}" = "tag" ]; then
  exit 0
fi
echo "unexpected docker invocation: $*" >&2
exit 1
EOF
chmod +x "$tmp/docker-stub"

cat > "$tmp/site.mjs" <<'EOF'
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const pointer = process.argv[2];
const failFlag = process.argv[3];
const csp = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://raw.githubusercontent.com; worker-src 'self'; manifest-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/api/auth/state') {
    if (request.method !== 'GET') {
      response.writeHead(405);
      response.end();
      return;
    }
    if (existsSync(failFlag)) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end('{"error":"down"}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"needsBootstrap":false,"needsSetupCode":false}');
    return;
  }

  const dist = readFileSync(pointer, 'utf8').trim();
  const relative = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, ''));
  const target = path.resolve(dist, relative);
  const root = path.resolve(dist);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    response.writeHead(404);
    response.end();
    return;
  }
  if (!existsSync(target)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
  });
  createReadStream(target).pipe(response);
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') process.exit(1);
  process.stdout.write(`${address.port}\n`);
});
EOF

write_dist() {
  local dir=$1 marker=$2
  rm -rf "$dir"
  mkdir -p "$dir/assets"
  printf '%s\n' "<!doctype html><title>${marker}</title>" > "$dir/index.html"
  printf '%s\n' "// ${marker}" > "$dir/sw.js"
  printf '%s\n' "console.log('${marker}');" > "$dir/assets/app.js"
}

write_manifest() {
  node --input-type=module -e '
    import { writeFile } from "node:fs/promises";
    import { buildReleaseManifest, manifestJson } from "./scripts/release-manifest.mjs";
    const manifest = await buildReleaseManifest(process.argv[1]);
    await writeFile(process.argv[2], manifestJson(manifest));
  ' "$1" "$2"
}

run_deploy() {
  local sha=$1 dist=$2 manifest=$3 known=$4 tip=${5-}
  env -u GITHUB_EVENT_NAME \
    DEPLOY_HOST=127.0.0.1 \
    DEPLOY_USER=root \
    DEPLOY_PATH=/opt/kubyshka \
    DEPLOY_SSH_PORT="$port" \
    DEPLOY_SSH_KEY_FILE="$tmp/id" \
    DEPLOY_KNOWN_HOSTS_FILE="$known" \
    DEPLOY_SHA="$sha" \
    DIST_DIR="$dist" \
    MANIFEST="$manifest" \
    SITE_URL="http://127.0.0.1:${site_port}" \
    DEPLOY_VERIFY_ATTEMPTS=1 \
    DEPLOY_VERIFY_INTERVAL=0 \
    DEPLOY_REQUIRE_TIP="$tip" \
    bash scripts/deploy.sh
}

assert_no_secret() {
  if printf '%s\n' "$1" | grep -F "$secret" >/dev/null; then
    echo "Журнал выката содержит содержимое .env." >&2
    exit 1
  fi
}

capture() {
  set +e
  capture_log=$(run_deploy "$@" 2>&1)
  capture_status=$?
  set -e
  assert_no_secret "$capture_log"
}

assert_inode() {
  local inode cwd
  inode=$("${docker[@]}" exec "$cname" stat -c %i /opt/kubyshka/apps/web/dist)
  if [ "$inode" != "$dist_inode" ]; then
    echo "inode apps/web/dist изменился: было ${dist_inode}, стало ${inode}." >&2
    exit 1
  fi
  cwd=$("${docker[@]}" exec "$cname" sh -c 'for d in /proc/[0-9]*; do target=$(readlink "$d/cwd" 2>/dev/null || true); case "$target" in /opt/kubyshka/apps/web/dist*) printf "%s\n" "$target";; esac; done')
  if [ "$cwd" != "/opt/kubyshka/apps/web/dist" ]; then
    echo "Процесс, державший каталог dist, видит «${cwd}»." >&2
    exit 1
  fi
}

dump_count() {
  "${docker[@]}" exec "$cname" sh -c 'find /opt/kubyshka/.deploy/backups -name "*.sql.gz" 2>/dev/null | wc -l' | tr -d '[:space:]'
}

head_sha() {
  "${docker[@]}" exec "$cname" git -C /opt/kubyshka rev-parse HEAD
}

"${docker[@]}" run -d --name "$cname" -p 127.0.0.1::22 alpine:3.20 tail -f /dev/null >/dev/null
"${docker[@]}" exec "$cname" apk add --no-cache openssh-server bash rsync git gzip >/dev/null
"${docker[@]}" cp "$tmp/docker-stub" "$cname:/usr/local/bin/docker"
"${docker[@]}" exec "$cname" sh -c '
  set -eu
  ssh-keygen -A
  printf "%s\n" "PermitRootLogin prohibit-password" "PasswordAuthentication no" "PubkeyAuthentication yes" >> /etc/ssh/sshd_config
  mkdir -p /var/run/sshd /root/.ssh
  chmod 700 /root/.ssh
'
"${docker[@]}" cp "$tmp/id.pub" "$cname:/root/.ssh/authorized_keys"
"${docker[@]}" exec "$cname" chown root:root /root/.ssh/authorized_keys
"${docker[@]}" exec "$cname" chmod 600 /root/.ssh/authorized_keys
"${docker[@]}" exec -d "$cname" /usr/sbin/sshd -D -e

port=$("${docker[@]}" port "$cname" 22/tcp | awk -F: 'NR==1 {print $NF}')
known="$tmp/known"
for _ in $(seq 1 50); do
  if ssh-keyscan -p "$port" -T 2 127.0.0.1 > "$known" 2>/dev/null && grep -q . "$known"; then
    break
  fi
  sleep 0.2
done
grep -q . "$known"

"${docker[@]}" exec "$cname" sh -c "
  set -eu
  git config --global init.defaultBranch main
  git init --bare /opt/origin.git
  git -C /opt/origin.git config uploadpack.allowReachableSHA1InWant true
  git init -b main /opt/kubyshka
  cd /opt/kubyshka
  git config user.email test@example.com
  git config user.name test
  printf '%s\n' '.env' '.deploy/' 'apps/web/dist/' > .gitignore
  printf '%s\n' A > VERSION
  mkdir -p apps/web/dist
  printf '%s\n' old > apps/web/dist/old.txt
  git add .gitignore VERSION
  git commit -m A
  git remote add origin /opt/origin.git
  git push -u origin main
  sha_a=\$(git rev-parse HEAD)
  printf '%s\n' B > VERSION
  git commit -am B
  git push origin main
  git checkout --detach \"\$sha_a\"
  printf '%s\n' \"\$sha_a\" > /tmp/sha-a
  git rev-parse origin/main > /tmp/sha-b
"
"${docker[@]}" cp "$tmp/env" "$cname:/opt/kubyshka/.env"
"${docker[@]}" exec "$cname" chmod 600 /opt/kubyshka/.env
"${docker[@]}" exec -d "$cname" sh -c 'cd /opt/kubyshka/apps/web/dist && exec sleep 3600'

sha_a=$("${docker[@]}" exec "$cname" cat /tmp/sha-a | tr -d '[:space:]')
sha_b=$("${docker[@]}" exec "$cname" cat /tmp/sha-b | tr -d '[:space:]')
dist_inode=$("${docker[@]}" exec "$cname" stat -c %i /opt/kubyshka/apps/web/dist)

write_dist "$tmp/dist-b" build-b
write_manifest "$tmp/dist-b" "$tmp/manifest-b"
printf '%s\n' "$tmp/dist-b" > "$tmp/pointer"
node "$tmp/site.mjs" "$tmp/pointer" "$tmp/fail-auth" > "$tmp/site.port" &
server_pid=$!
for _ in $(seq 1 50); do
  if [ -s "$tmp/site.port" ]; then
    break
  fi
  sleep 0.1
done
site_port=$(tr -d '[:space:]' < "$tmp/site.port")

wrong="$tmp/wrong-known"
printf '%s\n' "[127.0.0.1]:${port} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDUoF8WScNFhPISBQ8DpqryzBXnUER2JgxSQfD3+6rHM" > "$wrong"
capture "$sha_b" "$tmp/dist-b" "$tmp/manifest-b" "$wrong" 1 || true
if [ "$capture_status" -eq 0 ]; then
  echo "Чужой ключ хоста не должен проходить." >&2
  printf '%s\n' "$capture_log" >&2
  exit 1
fi
if [ "$(head_sha)" != "$sha_a" ] || [ "$(dump_count)" != "0" ]; then
  echo "Отказ ключа хоста успел изменить сервер." >&2
  exit 1
fi
assert_inode

capture "$sha_a" "$tmp/dist-b" "$tmp/manifest-b" "$known" 1
if [ "$capture_status" -ne 0 ] || ! printf '%s\n' "$capture_log" | grep -q 'пропущен'; then
  echo "Устаревший push должен пропускаться." >&2
  printf '%s\n' "$capture_log" >&2
  exit 1
fi
if [ "$(head_sha)" != "$sha_a" ] || [ "$(dump_count)" != "0" ]; then
  echo "Пропуск устаревшего push изменил сервер." >&2
  exit 1
fi

capture "$sha_b" "$tmp/dist-b" "$tmp/manifest-b" "$known" 1
if [ "$capture_status" -ne 0 ]; then
  echo "Успешный выкат завершился с ошибкой." >&2
  printf '%s\n' "$capture_log" >&2
  exit 1
fi
if [ "$(head_sha)" != "$sha_b" ]; then
  echo "После выката HEAD не равен целевому коммиту." >&2
  exit 1
fi
"${docker[@]}" exec -i "$cname" cmp -s - /opt/kubyshka/apps/web/dist/index.html < "$tmp/dist-b/index.html"
"${docker[@]}" exec "$cname" test ! -e /opt/kubyshka/apps/web/dist/old.txt
"${docker[@]}" exec "$cname" sh -c 'test "$(stat -c %a /opt/kubyshka/.deploy)" = 700 && test "$(stat -c %a /opt/kubyshka/.deploy/backups)" = 700'
"${docker[@]}" exec "$cname" sh -c 'for f in /opt/kubyshka/.deploy/backups/*.sql.gz; do test "$(stat -c %a "$f")" = 600; done'
"${docker[@]}" exec -i "$cname" cmp -s - /opt/kubyshka/.env < "$tmp/env"
assert_inode
if [ "$(dump_count)" != "1" ]; then
  echo "Ожидался один дамп перед выкатом, сейчас $(dump_count)." >&2
  exit 1
fi

bad="$tmp/manifest-bad"
node --input-type=module -e '
  import { readFile, writeFile } from "node:fs/promises";
  const manifest = JSON.parse(await readFile(process.argv[1], "utf8"));
  manifest.files["index.html"] = "a".repeat(64);
  await writeFile(process.argv[2], `${JSON.stringify(manifest, null, 2)}\n`);
' "$tmp/manifest-b" "$bad"
if node scripts/verify-release.mjs --site "http://127.0.0.1:${site_port}" --manifest "$bad" >/dev/null 2>&1; then
  echo "Сверка пропустила чужой хеш." >&2
  exit 1
fi

write_dist "$tmp/dist-c" build-c
write_manifest "$tmp/dist-c" "$tmp/manifest-c"
printf '%s\n' "$tmp/dist-c" > "$tmp/pointer"
touch "$tmp/fail-auth"
"${docker[@]}" exec "$cname" sh -c "cd /opt/kubyshka && printf '%s\n' C > VERSION && git add VERSION && git commit -m C && sha_c=\$(git rev-parse HEAD) && git checkout --detach ${sha_b} && git push origin \$sha_c:main && printf '%s\n' \$sha_c > /tmp/sha-c"
sha_c=$("${docker[@]}" exec "$cname" cat /tmp/sha-c | tr -d '[:space:]')
capture "$sha_c" "$tmp/dist-c" "$tmp/manifest-c" "$known" 1 || true
if [ "$capture_status" -eq 0 ]; then
  echo "Провал проверки сайта должен останавливать выкат." >&2
  printf '%s\n' "$capture_log" >&2
  exit 1
fi
if [ "$(head_sha)" != "$sha_b" ]; then
  echo "После отката HEAD не вернулся на предыдущий коммит." >&2
  printf '%s\n' "$capture_log" >&2
  exit 1
fi
"${docker[@]}" exec -i "$cname" cmp -s - /opt/kubyshka/apps/web/dist/index.html < "$tmp/dist-b/index.html"
"${docker[@]}" exec "$cname" grep -q build-b /opt/kubyshka/apps/web/dist/assets/app.js
"${docker[@]}" exec -i "$cname" cmp -s - /opt/kubyshka/.env < "$tmp/env"
assert_inode

rm -f "$tmp/fail-auth"
printf '%s\n' "$tmp/dist-b" > "$tmp/pointer"
"${docker[@]}" exec "$cname" touch /tmp/fail-compose
capture "$sha_c" "$tmp/dist-b" "$tmp/manifest-b" "$known" 1 || true
if [ "$capture_status" -eq 0 ]; then
  echo "Провал docker compose должен останавливать выкат." >&2
  printf '%s\n' "$capture_log" >&2
  exit 1
fi
if [ "$(head_sha)" != "$sha_b" ]; then
  echo "После отката сборки HEAD не вернулся на предыдущий коммит." >&2
  printf '%s\n' "$capture_log" >&2
  exit 1
fi
"${docker[@]}" exec -i "$cname" cmp -s - /opt/kubyshka/apps/web/dist/index.html < "$tmp/dist-b/index.html"
assert_inode
"${docker[@]}" exec "$cname" rm -f /tmp/fail-compose

echo "Локальная проверка выката прошла."
