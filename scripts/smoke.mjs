// Проверяет живой сервер: создание семьи, синхронизация, разрешение конфликта.
// Запуск: node scripts/smoke.mjs http://127.0.0.1:3100

const base = process.argv[2] ?? 'http://127.0.0.1:3100';
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

const state = await call('/api/auth/state');
if (state.needsBootstrap) await call('/api/auth/bootstrap', { name: 'Аня', pin: '1234', device: 'smoke' });
else await call('/api/auth/restore', { name: 'Аня', pin: '1234', device: 'smoke' });

const me = await call('/api/auth/me');
check('семья и участник существуют', Boolean(me.family?.id) && Boolean(me.memberId));

const first = await call('/api/sync', { cursor: 0, changes: {} });
check('предустановленные категории пришли', first.changes.categories.length >= 20);
check('предустановленные счета пришли', first.changes.accounts.length >= 3);
check('курсор продвинулся', first.cursor > 0);

const id = crypto.randomUUID();
const now = Date.now();
const transaction = {
  id,
  familyId: me.family.id,
  updatedAt: now,
  updatedBy: me.memberId,
  deleted: false,
  flow: 'expense',
  amount: 124_000,
  accountId: first.changes.accounts[0].id,
  counterAccountId: null,
  categoryId: first.changes.categories[0].id,
  memberId: me.memberId,
  occurredAt: now,
  note: 'проверка',
  tags: ['смоук'],
};

const pushed = await call('/api/sync', { cursor: first.cursor, changes: { transactions: [transaction] } });
check('операция вернулась в том же ответе', pushed.changes.transactions.some((item) => item.id === id));
check('сумма сохранилась числом', pushed.changes.transactions[0].amount === 124_000);
check('теги сохранились массивом', Array.isArray(pushed.changes.transactions[0].tags));

const stale = await call('/api/sync', {
  cursor: pushed.cursor,
  changes: { transactions: [{ ...transaction, updatedAt: now - 1000, note: 'устаревшая правка' }] },
});
check('устаревшая правка отклонена', stale.changes.transactions.length === 0);

const fresh = await call('/api/sync', {
  cursor: pushed.cursor,
  changes: { transactions: [{ ...transaction, updatedAt: now + 1000, note: 'свежая правка' }] },
});
check('свежая правка применилась', fresh.changes.transactions[0]?.note === 'свежая правка');

const empty = await call('/api/sync', { cursor: fresh.cursor, changes: {} });
check('повторный запрос ничего не возвращает', empty.changes.transactions.length === 0);

const invite = await call('/api/auth/invite', {});
check('код приглашения из шести цифр', /^\d{6}$/.test(invite.code));

console.log('\nвсе проверки пройдены');
