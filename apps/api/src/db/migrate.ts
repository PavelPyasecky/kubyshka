import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from './client.ts';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

export const migrate = async (): Promise<void> => {
  await sql`create table if not exists migrations (name text primary key, applied_at timestamptz not null default now())`;

  const applied = new Set((await sql<{ name: string }[]>`select name from migrations`).map((row) => row.name));
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();

  for (const name of files) {
    if (applied.has(name)) continue;
    const statements = await readFile(join(migrationsDir, name), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(statements);
      await tx`insert into migrations (name) values (${name})`;
    });
    console.log(`migration applied: ${name}`);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate();
  await sql.end();
}
