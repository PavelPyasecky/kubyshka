import type { FastifyInstance } from 'fastify';
import type { TransactionSql } from 'postgres';
import { emptyChanges, syncRequestSchema, syncTableNames, syncTables } from '@kubyshka/shared';
import type { SyncTable } from '@kubyshka/shared';
import { sql } from '../db/client.ts';
import { requireSession } from '../lib/session.ts';

type Row = Record<string, unknown>;

const toColumn = (field: string): string => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const toField = (column: string): string => column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const columnsOf = (table: SyncTable): string[] =>
  Object.keys(syncTables[table].shape)
    .filter((field) => field !== 'seq')
    .map(toColumn);

const toParameter = (value: unknown): string | number | boolean | null =>
  Array.isArray(value) ? JSON.stringify(value) : (value as string | number | boolean | null) ?? null;

const toEntity = (row: Row): Row =>
  Object.fromEntries(Object.entries(row).map(([column, value]) => [toField(column), value]));

const push = async (tx: TransactionSql, table: SyncTable, familyId: string, rows: Row[]): Promise<void> => {
  if (rows.length === 0) return;

  const columns = columnsOf(table);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const assignments = columns
    .filter((column) => column !== 'id' && column !== 'family_id')
    .map(
      (column) =>
        `${column} = case when ${table}.updated_at < excluded.updated_at then excluded.${column} else ${table}.${column} end`,
    )
    .join(', ');

  const statement = `
    insert into ${table} (${columns.join(', ')})
    values (${placeholders})
    on conflict (id) do update
      set ${assignments}, seq = nextval('sync_seq')
  `;

  for (const row of rows) {
    const source: Row = { ...row, familyId };
    await tx.unsafe(
      statement,
      columns.map((column) => toParameter(source[toField(column)])),
    );
  }
};

const pull = (tx: TransactionSql, table: SyncTable, familyId: string, cursor: number): Promise<Row[]> =>
  tx.unsafe(`select * from ${table} where family_id = $1 and seq > $2 order by seq`, [familyId, cursor]) as Promise<Row[]>;

export const syncRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/', { preHandler: requireSession }, async (request) => {
    const { familyId } = request.session!;
    const body = syncRequestSchema.parse(request.body);

    const changes = emptyChanges();
    let cursor = body.cursor;

    await sql.begin(async (tx) => {
      for (const table of syncTableNames) {
        await push(tx, table, familyId, body.changes[table] as Row[]);
      }

      for (const table of syncTableNames) {
        for (const row of await pull(tx, table, familyId, body.cursor)) {
          cursor = Math.max(cursor, Number(row.seq));
          (changes[table] as unknown[]).push(toEntity(row));
        }
      }
    });

    return { cursor, serverTime: Date.now(), changes };
  });
};
