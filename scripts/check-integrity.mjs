import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseReleaseManifest } from '../packages/shared/src/release.ts';
import { buildReleaseManifest } from './release-manifest.mjs';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
let dist = join(root, 'apps/web/dist');
let manifestPath = join(root, 'integrity.json');

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--dist') dist = args[++index];
  else if (args[index] === '--manifest') manifestPath = args[++index];
  else {
    console.error(`Неизвестный аргумент: ${args[index]}`);
    process.exit(1);
  }
}

const built = await buildReleaseManifest(dist);
let committedRaw;
try {
  committedRaw = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Не удалось прочитать ${manifestPath}: ${error.message}`);
  process.exit(1);
}

const committed = parseReleaseManifest(committedRaw);
if (!committed) {
  console.error(`${manifestPath} клиент отвергнет: нужны version 1, algo sha256, index.html, sw.js и хеши файлов без выхода из каталога.`);
  process.exit(1);
}

const problems = [];
for (const [path, hash] of Object.entries(built.files)) {
  if (!(path in committed)) problems.push(`нет в integrity.json: ${path}`);
  else if (committed[path] !== hash) {
    problems.push(`другой хеш: ${path}\n  в integrity.json: ${committed[path]}\n  в сборке:         ${hash}`);
  }
}
for (const path of Object.keys(committed)) {
  if (!(path in built.files)) problems.push(`нет в сборке: ${path}`);
}

if (problems.length === 0) {
  console.log(`integrity.json совпадает со сборкой: ${Object.keys(built.files).length} файлов`);
  process.exit(0);
}

console.error('integrity.json не совпадает со сборкой.');
console.error('CI не перезаписывает этот файл и не коммитит его в main.');
console.error('Манифест на main — это публикация, с которой клиент сверяет файлы сервера. Автокоммит из workflow сделал бы сборку и публикацию одним и тем же субъектом.');
console.error('');
console.error('Обновите манифест локально и закоммитьте его в этот же pull request:');
console.error('');
console.error('  npm run build --workspace @kubyshka/web');
console.error('  node scripts/publish-integrity.mjs');
console.error('  git add integrity.json');
console.error('');
console.error(problems.join('\n'));
process.exit(1);
