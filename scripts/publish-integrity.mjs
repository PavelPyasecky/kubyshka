import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'apps/web/dist');

const files = [];
const walk = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name !== 'integrity.json') files.push(path);
  }
};

await walk(dist);
files.sort();

const manifest = { version: 1, algo: 'sha256', files: {} };
for (const file of files) {
  const hash = createHash('sha256').update(await readFile(file)).digest('hex');
  manifest.files[relative(dist, file).split('\\').join('/')] = hash;
}

const json = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(join(dist, 'integrity.json'), json);
await writeFile(join(root, 'integrity.json'), json);
console.log(`integrity.json: ${Object.keys(manifest.files).length} файлов`);
console.log('Дальше закоммитьте integrity.json и запушьте его до выката этой же сборки.');
console.log('Репозиторий закрытый: выложите файл публично и соберите клиент с VITE_RELEASE_MANIFEST_URL.');
