import { readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = join(import.meta.dirname, '..');
const dist = process.argv[2] ?? join(root, 'apps/web/dist');
const limit = 250 * 1000;

const attr = (tag, name) => {
  const match = new RegExp(`\\b${name}=(['"])(.*?)\\1`, 'i').exec(tag);
  return match?.[2] ?? null;
};

const html = await readFile(join(dist, 'index.html'), 'utf8');
const files = new Set();
for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
  const src = attr(tag[0], 'src');
  if (src?.endsWith('.js')) files.add(src);
}
for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
  if (attr(tag[0], 'rel') !== 'modulepreload') continue;
  const href = attr(tag[0], 'href');
  if (href?.endsWith('.js')) files.add(href);
}

if (files.size === 0) {
  console.error('В index.html нет локальных скриптов, бюджет проверить нельзя.');
  process.exit(1);
}

let total = 0;
const lines = [];
for (const href of [...files].sort()) {
  const relativePath = href.replace(/^\//, '');
  const file = join(dist, relativePath);
  if (file !== dist && !file.startsWith(`${dist}${sep}`)) {
    console.error(`Скрипт выходит из каталога сборки: ${href}`);
    process.exit(1);
  }
  const size = gzipSync(await readFile(file)).length;
  total += size;
  lines.push(`${(size / 1000).toFixed(1).padStart(7)} КБ  ${relativePath}`);
}

console.log(lines.join('\n'));
console.log(`${(total / 1000).toFixed(1).padStart(7)} КБ  итого gzip, бюджет 250 КБ`);

if (total > limit) {
  console.error(`Сжатый JavaScript начальной загрузки — ${total} байт, бюджет — ${limit} байт.`);
  console.error('В бюджет входят только скрипты из index.html. Service worker и workbox считаются отдельно и в этот предел не входят.');
  process.exit(1);
}
