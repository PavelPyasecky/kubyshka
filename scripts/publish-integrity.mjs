import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildReleaseManifest, manifestJson } from './release-manifest.mjs';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'apps/web/dist');
const manifest = await buildReleaseManifest(dist);
const json = manifestJson(manifest);

await writeFile(join(dist, 'integrity.json'), json);
await writeFile(join(root, 'integrity.json'), json);
console.log(`integrity.json: ${Object.keys(manifest.files).length} файлов`);
console.log('Закоммитьте integrity.json в этот же pull request. CI отклонит сборку, если файл не совпадёт с dist.');
console.log('Файл должен оказаться в main до выката: клиент сверяет с ним ответ сервера.');
