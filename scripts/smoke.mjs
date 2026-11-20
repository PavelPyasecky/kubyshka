// Проверяет живой сервер: шифротекст, миграцию открытых колонок и разрешение конфликта.
// Запуск: node scripts/smoke.mjs http://127.0.0.1:3100

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { sealContent } from '../packages/shared/src/payload.ts';
import { createFamilyVault, decryptJson, encryptJson, recordAad, unwrapFamilyKey } from '../packages/shared/src/vault.ts';

const base = process.argv[2] ?? 'http://127.0.0.1:3100';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://ubuntu@/kubyshka_dev?host=/var/run/postgresql';
let cookie = '';

const call = async (path, body) => {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];

  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${JSON.stringify(payload)}`);
  return payload;
};

const check = (label, condition) => {
  if (!condition) throw new Error(`провалено: ${label}`);
  console.log(`  ок: ${label}`);
};

const postgresOptions = { user: 'ubuntu', host: '/var/run/postgresql', onnotice: () => {} };

const migrationCheck = async () => {
  const root = postgres({ ...postgresOptions, database: 'postgres' });
  await root.unsafe('drop database if exists kubyshka_migrate_check');
  await root.unsafe('create database kubyshka_migrate_check');
  await root.end();

  const db = postgres({ ...postgresOptions, database: 'kubyshka_migrate_check' });
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../apps/api/migrations');
  await db.unsafe(await readFile(join(dir, '0001_init.sql'), 'utf8'));

  const familyId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const txId = crypto.randomUUID();
  await db.unsafe('insert into families (id, family_id, updated_at, name) values ($1, $1, 1, $2)', [familyId, 'Семья']);
  await db.unsafe(
    `insert into transactions (
      id, family_id, updated_at, updated_by, flow, amount, account_id, category_id, member_id, occurred_at, note, tags
    ) values ($1, $2, 10, $3, 'expense', 124000, $4, $5, $3, 10, 'секрет', '["тест"]'::jsonb)`,
    [txId, familyId, memberId, accountId, categoryId],
  );

  await db.unsafe(await readFile(join(dir, '0002_ciphertext.sql'), 'utf8'));
  const [row] = await db`select legacy, ciphertext from transactions where id = ${txId}`;
  const [family] = await db`select legacy from families where id = ${familyId}`;
  check('миграция сохранила заметку и сумму для повторной загрузки', row.legacy.note === 'секрет' && Number(row.legacy.amount) === 124000);
  check('миграция сохранила название семьи', family.legacy.name === 'Семья');
  check('сервер сам запись не шифрует', row.ciphertext === null);

  const columns = await db`
    select column_name from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name in ('amount', 'note', 'flow', 'tags')
  `;
  check('после миграции у операции нет открытых колонок', columns.length === 0);
  await db.end();

  const cleanup = postgres({ ...postgresOptions, database: 'postgres' });
  await cleanup.unsafe('drop database if exists kubyshka_migrate_check');
  await cleanup.end();
};

await migrationCheck();

const vault = await createFamilyVault();
const state = await call('/api/auth/state');
if (state.needsBootstrap) {
  await call('/api/auth/bootstrap', { name: 'Аня', pin: '1234', device: 'smoke', wrappedKey: vault.wrappedKey });
} else {
  await call('/api/auth/restore', { name: 'Аня', pin: '1234', device: 'smoke' });
}

const me = await call('/api/auth/me');
check('семья и участник существуют', Boolean(me.familyId) && Boolean(me.memberId));
check('у участника есть устройство', me.members.some((member) => member.id === me.memberId && member.deviceCount >= 1));
check('имя участника не является содержимым записи', me.members.some((member) => member.name === 'Аня'));

const sealed = async (table, id, updatedAt, content) => ({
  id,
  familyId: me.familyId,
  updatedAt,
  updatedBy: me.memberId,
  deleted: false,
  ciphertext: await encryptJson(vault.key, recordAad(table, id, me.familyId, updatedAt), sealContent(table, content)),
});

const categoryId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const now = Date.now();
const category = await sealed('categories', categoryId, now, {
  name: 'Продукты',
  flow: 'expense',
  icon: '🛒',
  color: '#15724C',
  sort: 0,
  archived: false,
});
const account = await sealed('accounts', accountId, now, {
  name: 'Карта',
  kind: 'debit',
  scope: 'shared',
  ownerMemberId: null,
  openingBalance: 500_000,
  creditLimit: null,
  icon: '💳',
  color: '#3478F6',
  sort: 0,
  archived: false,
});

const prepared = await call('/api/sync', { cursor: 0, changes: { categories: [category], accounts: [account] } });
check('курсор продвинулся', prepared.cursor > 0);

const id = crypto.randomUUID();
const transaction = {
  flow: 'expense',
  amount: 124_000,
  accountId,
  counterAccountId: null,
  categoryId,
  memberId: me.memberId,
  occurredAt: now,
  note: 'проверка',
  tags: ['смоук'],
};
const envelope = await sealed('transactions', id, now, transaction);
const pushed = await call('/api/sync', { cursor: prepared.cursor, changes: { transactions: [envelope] } });
const returned = pushed.changes.transactions.find((item) => item.id === id);
check('операция вернулась шифротекстом', Boolean(returned?.ciphertext) && !returned.legacy);
check('ответ сервера не содержит заметку и название категории', !JSON.stringify(returned).includes('проверка') && !JSON.stringify(prepared).includes('Продукты'));

const opened = await decryptJson(vault.key, recordAad('transactions', id, me.familyId, returned.updatedAt), returned.ciphertext);
check('клиент читает исходную сумму', opened.amount === 124_000 && opened.note === 'проверка');

const staleEnvelope = await sealed('transactions', id, now - 1000, { ...transaction, note: 'устаревшая правка' });
const stale = await call('/api/sync', { cursor: pushed.cursor, changes: { transactions: [staleEnvelope] } });
check('устаревшая правка не затирает шифротекст', stale.changes.transactions[0]?.ciphertext === returned.ciphertext);

const freshEnvelope = await sealed('transactions', id, now + 1000, { ...transaction, note: 'свежая правка' });
const fresh = await call('/api/sync', { cursor: pushed.cursor, changes: { transactions: [freshEnvelope] } });
const freshNote = await decryptJson(
  vault.key,
  recordAad('transactions', id, me.familyId, fresh.changes.transactions[0].updatedAt),
  fresh.changes.transactions[0].ciphertext,
);
check('свежая правка применилась', freshNote.note === 'свежая правка');

const empty = await call('/api/sync', { cursor: fresh.cursor, changes: {} });
check('повторный запрос ничего не возвращает', empty.changes.transactions.length === 0);

const remoteKey = await call('/api/auth/key');
const restored = await unwrapFamilyKey(remoteKey.wrappedKey, vault.recoveryKey);
const viaRecovery = await decryptJson(
  restored,
  recordAad('transactions', id, me.familyId, fresh.changes.transactions[0].updatedAt),
  fresh.changes.transactions[0].ciphertext,
);
check('ключ с сервера разворачивается ключом восстановления', viaRecovery.note === 'свежая правка');

const live = postgres(databaseUrl);
const forbidden = await live`
  select table_name, column_name from information_schema.columns
  where table_schema = 'public'
    and table_name in ('families', 'accounts', 'categories', 'transactions', 'budgets')
    and column_name in ('name', 'amount', 'note', 'flow', 'tags', 'opening_balance', 'savings_norm', 'expected_income')
`;
check('в живой базе нет открытых колонок с содержимым', forbidden.length === 0);

const [stored] = await live`select ciphertext::text, legacy from transactions where id = ${id}`;
const storedText = `${stored.ciphertext} ${JSON.stringify(stored.legacy)}`;
check('в строке операции нет заметки и названия категории', !storedText.includes('проверка') && !storedText.includes('Продукты') && !storedText.includes('Карта'));
check('legacy после загрузки пуст', stored.legacy === null);

const [wrapped] = await live`select wrapped_key from family_keys where family_id = ${me.familyId}`;
check('на сервере лежит обёрнутый ключ, а не ключ восстановления', wrapped.wrapped_key === vault.wrappedKey && !vault.recoveryKey.includes(wrapped.wrapped_key));
await live.end();

const invite = await call('/api/auth/invite', {});
check('код приглашения из шести цифр', /^\d{6}$/.test(invite.code));

console.log('\nвсе проверки пройдены');
