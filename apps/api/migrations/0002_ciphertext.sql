-- Содержимое записей упаковывается в legacy, чтобы клиент зашифровал его своим ключом.
-- Сервер ключ не знает, поэтому сам превратить поля в ciphertext не может.

alter table families add column ciphertext text;
alter table families add column legacy jsonb;
update families set legacy = jsonb_build_object(
  'name', name,
  'savingsNorm', savings_norm,
  'expectedIncome', expected_income
);
alter table families drop column name, drop column savings_norm, drop column expected_income;

alter table accounts add column ciphertext text;
alter table accounts add column legacy jsonb;
update accounts set legacy = jsonb_build_object(
  'name', name,
  'kind', kind,
  'scope', scope,
  'ownerMemberId', owner_member_id,
  'openingBalance', opening_balance,
  'creditLimit', credit_limit,
  'icon', icon,
  'color', color,
  'sort', sort,
  'archived', archived
);
alter table accounts
  drop column name,
  drop column kind,
  drop column scope,
  drop column owner_member_id,
  drop column opening_balance,
  drop column credit_limit,
  drop column icon,
  drop column color,
  drop column sort,
  drop column archived;

alter table categories add column ciphertext text;
alter table categories add column legacy jsonb;
update categories set legacy = jsonb_build_object(
  'name', name,
  'flow', flow,
  'icon', icon,
  'color', color,
  'sort', sort,
  'archived', archived
);
alter table categories
  drop column name,
  drop column flow,
  drop column icon,
  drop column color,
  drop column sort,
  drop column archived;

drop index if exists transactions_occurred_idx;
alter table transactions add column ciphertext text;
alter table transactions add column legacy jsonb;
update transactions set legacy = jsonb_build_object(
  'flow', flow,
  'amount', amount,
  'accountId', account_id,
  'counterAccountId', counter_account_id,
  'categoryId', category_id,
  'memberId', member_id,
  'occurredAt', occurred_at,
  'note', note,
  'tags', tags
);
alter table transactions
  drop column flow,
  drop column amount,
  drop column account_id,
  drop column counter_account_id,
  drop column category_id,
  drop column member_id,
  drop column occurred_at,
  drop column note,
  drop column tags;

drop index if exists budgets_period_idx;
alter table budgets add column ciphertext text;
alter table budgets add column legacy jsonb;
update budgets set legacy = jsonb_build_object(
  'categoryId', category_id,
  'periodMonth', period_month,
  'amount', amount
);
alter table budgets drop column category_id, drop column period_month, drop column amount;

create table if not exists family_keys (
  family_id uuid primary key references families (id) on delete cascade,
  wrapped_key text not null,
  created_at timestamptz not null default now()
);
