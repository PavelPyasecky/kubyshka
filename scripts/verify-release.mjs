import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseReleaseManifest } from '../packages/shared/src/release.ts';

const args = process.argv.slice(2);
let site = '';
let manifestPath = '';
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--site') site = args[++index];
  else if (args[index] === '--manifest') manifestPath = args[++index];
  else {
    console.error(`Неизвестный аргумент: ${args[index]}`);
    process.exit(1);
  }
}

if (!site || !manifestPath) {
  console.error('Нужны --site и --manifest.');
  process.exit(1);
}

const requiredCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  'https://raw.githubusercontent.com',
];

const problems = [];
const note = (message) => problems.push(message);

const fetchBytes = async (url) => {
  try {
    return await fetch(url, {
      method: 'GET',
      headers: { 'accept-encoding': 'identity' },
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    note(`${url} не открылся: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const page = await fetchBytes(new URL('/', site));
if (!page) {
  // уже записано
} else if (page.status !== 200) note(`главная страница вернула ${page.status}, ожидался 200`);
else {
  const csp = page.headers.get('content-security-policy') ?? '';
  for (const part of requiredCsp) {
    if (!csp.includes(part)) note(`в Content-Security-Policy нет «${part}»`);
  }
  const nosniff = page.headers.get('x-content-type-options') ?? '';
  if (nosniff.toLowerCase() !== 'nosniff') note(`X-Content-Type-Options: «${nosniff || 'пусто'}», ожидался nosniff`);
}

const stateResponse = await fetchBytes(new URL('/api/auth/state', site));
if (!stateResponse) {
  // уже записано
} else if (stateResponse.status !== 200) note(`/api/auth/state вернул ${stateResponse.status}, ожидался 200`);
else {
  try {
    const body = await stateResponse.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) note('/api/auth/state отдал не объект JSON');
  } catch {
    note('/api/auth/state отдал не JSON');
  }
}

const committed = parseReleaseManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
if (!committed) note(`${manifestPath} не является манифестом, который примет клиент`);
else {
  for (const [path, expected] of Object.entries(committed)) {
    const url = new URL(path, site.endsWith('/') ? site : `${site}/`);
    url.searchParams.set('release', String(Date.now()));
    const response = await fetchBytes(url);
    if (!response.ok) {
      note(`${path} → ${response.status}`);
      continue;
    }
    const encoding = response.headers.get('content-encoding');
    if (encoding && encoding !== 'identity') {
      note(`${path} пришёл со сжатием ${encoding}, хеш считался бы не от файла`);
      continue;
    }
    const actual = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    if (actual !== expected) note(`${path}\n  ожидалось ${expected}\n  отдано    ${actual}`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`Сайт ${site} отдаёт страницу, CSP и файлы из манифеста.`);
