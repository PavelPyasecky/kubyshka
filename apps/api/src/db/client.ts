import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.ts';
import * as schema from './schema.ts';

const INT8_OID = 20;

export const sql = postgres(env.DATABASE_URL, {
  max: 5,
  types: {
    int8: {
      to: INT8_OID,
      from: [INT8_OID],
      serialize: (value: number) => String(value),
      parse: (value: string) => Number(value),
    },
  },
});

export const db = drizzle(sql, { schema });
