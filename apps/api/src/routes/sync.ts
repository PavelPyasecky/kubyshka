import type { FastifyInstance } from 'fastify';
import type { TransactionSql } from 'postgres';
import { emptyBatch, syncRequestSchema, syncTableNames } from '@kubyshka/shared';
import type { SyncTable } from '@kubyshka/shared';
import { sql } from '../db/client.ts';
import { requireSession } from '../lib/session.ts';

type Row = Record<string, unknown>;

const toField = (column: string): string => column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const toEntity = (row: Row): Row => Object.fromEntries(Object.entries(row).map(([column, value]) => [toField(column), value]));

const push = async (tx: TransactionSql, table: SyncTable, familyId: string, rows: Row[]): Promise<void> => {
  if (rows.length === 0) return;

  // Равенство updated_at заменяет только ещё не зашифрованную строку: это та же версия, а не новая правка.
  const statement = `
    insert into ${table} (id, family_id, updated_at, updated_by, deleted, ciphertext, legacy)
    values ($1, $2, $3, $4, $5, $6, null)
    on conflict (id) do update
      set updated_at = case when ${table}.updated_at < excluded.updated_at then excluded.updated_at else ${table}.updated_at end,
          updated_by = case when ${table}.updated_at < excluded.updated_at then excluded.updated_by else ${table}.updated_by end,
          deleted = case when ${table}.updated_at < excluded.updated_at then excluded.deleted else ${table}.deleted end,
          ciphertext = case
            when ${table}.updated_at < excluded.updated_at then excluded.ciphertext
            when ${table}.updated_at = excluded.updated_at and ${table}.legacy is not null then excluded.ciphertext
            else ${table}.ciphertext
          end,
          legacy = case
            when ${table}.updated_at < excluded.updated_at then null
            when ${table}.updated_at = excluded.updated_at and ${table}.legacy is not null then null
            else ${table}.legacy
          end,
          seq = nextval('sync_seq')
      where ${table}.family_id = excluded.family_id
  `;

  for (const row of rows) {
    const parameters: Array<string | number | boolean | null> = [
      String(row.id),
      familyId,
      Number(row.updatedAt),
      row.updatedBy == null ? null : String(row.updatedBy),
      Boolean(row.deleted),
      String(row.ciphertext),
    ];
    await tx.unsafe(statement, parameters);
  }
};

const pull = (tx: TransactionSql, table: SyncTable, familyId: string, cursor: number): Promise<Row[]> =>
  tx.unsafe(
    `select id, family_id, updated_at, updated_by, deleted, seq, ciphertext, legacy
     from ${table} where family_id = $1 and seq > $2 order by seq`,
    [familyId, cursor],
  ) as Promise<Row[]>;

export const syncRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/', { preHandler: requireSession }, async (request) => {
    const { familyId } = request.session!;
    const body = syncRequestSchema.parse(request.body);

    const changes = emptyBatch();
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
