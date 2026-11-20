import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const buildReleaseManifest = async (dist) => {
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
  return manifest;
};

export const manifestJson = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;
