import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncTables } from './entities.ts';
import { openContent, sealContent } from './payload.ts';
import { parseReleaseManifest, releaseMatches } from './release.ts';
import { shouldApplyRemote } from './merge.ts';
import { contentKeys, syncMetaKeys, syncTableNames } from './sync-tables.ts';
import {
  canonicalRecoveryKey,
  createFamilyVault,
  decryptJson,
  encryptJson,
  recordAad,
  RecoveryKeyError,
  unwrapFamilyKey,
} from './vault.ts';

const meta = new Set<string>(syncMetaKeys);

test('ключи содержимого совпадают со схемами сущностей', () => {
  for (const table of syncTableNames) {
    const fields = Object.keys(syncTables[table].shape)
      .filter((field) => !meta.has(field))
      .sort();
    assert.deepEqual([...contentKeys[table]].sort(), fields);
  }
});

test('запись шифруется и расшифровывается тем же ключом', async () => {
  const vault = await createFamilyVault();
  const id = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  const updatedAt = 1_700_000_000_000;
  const content = sealContent('transactions', {
    flow: 'expense',
    amount: 124_000,
    accountId: crypto.randomUUID(),
    counterAccountId: null,
    categoryId: crypto.randomUUID(),
    memberId: crypto.randomUUID(),
    occurredAt: updatedAt,
    note: 'кофе у дома',
    tags: ['утро'],
  });
  const aad = recordAad('transactions', id, familyId, updatedAt);
  const ciphertext = await encryptJson(vault.key, aad, content);

  assert.equal(ciphertext.includes('кофе'), false);
  assert.equal(ciphertext.includes('утро'), false);
  assert.deepEqual(openContent('transactions', await decryptJson(vault.key, aad, ciphertext)), content);
  assert.equal(openContent('transactions', await decryptJson(vault.key, aad, ciphertext)).amount, 124_000);
});

test('чужая привязка или другой ключ не открывают запись', async () => {
  const vault = await createFamilyVault();
  const other = await createFamilyVault();
  const aad = recordAad('accounts', 'id', 'family', 10);
  const ciphertext = await encryptJson(vault.key, aad, sealContent('accounts', {
    name: 'Карта',
    kind: 'debit',
    scope: 'shared',
    ownerMemberId: null,
    openingBalance: 0,
    creditLimit: null,
    icon: '💳',
    color: '#3478F6',
    sort: 0,
    archived: false,
  }));

  await assert.rejects(() => decryptJson(other.key, aad, ciphertext));
  await assert.rejects(() => decryptJson(vault.key, recordAad('accounts', 'id', 'family', 11), ciphertext));
  await assert.rejects(() => decryptJson(vault.key, recordAad('categories', 'id', 'family', 10), ciphertext));
});

test('ключ восстановления разворачивает семейный ключ', async () => {
  const vault = await createFamilyVault();
  const restored = await unwrapFamilyKey(vault.wrappedKey, vault.recoveryKey);
  const aad = recordAad('budgets', 'id', 'family', 5);
  const content = { categoryId: crypto.randomUUID(), periodMonth: '2026-11', amount: 90_000 };
  const ciphertext = await encryptJson(vault.key, aad, content);

  assert.equal(restored.extractable, false);
  assert.equal(vault.key.extractable, false);
  assert.deepEqual(await decryptJson(restored, aad, ciphertext), content);
  assert.equal(await canonicalRecoveryKey(`  ${vault.recoveryKey}  `), vault.recoveryKey);
  assert.equal(await canonicalRecoveryKey(`https://kubyshka.example/#c=123456&k=${vault.recoveryKey.replaceAll(' ', '')}`), vault.recoveryKey);
});

test('опечатка в ключе восстановления отвергается до разворачивания', async () => {
  const vault = await createFamilyVault();
  const broken = `${vault.recoveryKey.slice(0, -1)}${vault.recoveryKey.endsWith('a') ? 'b' : 'a'}`;
  await assert.rejects(() => unwrapFamilyKey(vault.wrappedKey, broken), RecoveryKeyError);
  const other = await createFamilyVault();
  await assert.rejects(() => unwrapFamilyKey(vault.wrappedKey, other.recoveryKey));
});

test('при конфликте читается версия с большим временем', async () => {
  const vault = await createFamilyVault();
  const id = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  const local = { updatedAt: 2_000, note: 'локальная правка' };
  const remote = { updatedAt: 1_000, note: 'серверная правка' };
  const applyRemote = shouldApplyRemote({ pending: true, localUpdatedAt: local.updatedAt, remoteUpdatedAt: remote.updatedAt });
  const winner = applyRemote ? remote : local;
  const ciphertext = await encryptJson(vault.key, recordAad('transactions', id, familyId, winner.updatedAt), { note: winner.note });

  assert.equal(applyRemote, false);
  assert.equal(ciphertext.includes('локальная'), false);
  assert.deepEqual(await decryptJson(vault.key, recordAad('transactions', id, familyId, winner.updatedAt), ciphertext), { note: 'локальная правка' });
});

test('манифест публикации принимает только полный список хешей', () => {
  const files = { 'index.html': 'a'.repeat(64), 'sw.js': 'b'.repeat(64), 'assets/index.js': 'c'.repeat(64) };
  assert.deepEqual(parseReleaseManifest({ version: 1, algo: 'sha256', files }), files);
  assert.equal(parseReleaseManifest({ version: 1, algo: 'sha256', files: { 'index.html': 'a'.repeat(64) } }), null);
  assert.equal(parseReleaseManifest({ version: 2, algo: 'sha256', files }), null);
  assert.equal(parseReleaseManifest({ version: 1, algo: 'sha256', files: { ...files, '../sw.js': 'd'.repeat(64) } }), null);
  assert.equal(releaseMatches(files, files), true);
  assert.equal(releaseMatches(files, { ...files, 'sw.js': 'd'.repeat(64) }), false);
});
