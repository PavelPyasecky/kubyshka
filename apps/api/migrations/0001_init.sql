create sequence if not exists sync_seq;

create table if not exists families (
  id uuid primary key,
  family_id uuid not null,
  updated_at bigint not null,
  updated_by uuid,
  deleted boolean not null default false,
  seq bigint not null default nextval('sync_seq'),
  name text not null,
  savings_norm bigint not null default 0,
  expected_income bigint not null default 0
);

create table if not exists members (
  id uuid primary key,
  family_id uuid not null references families (id) on delete cascade,
  name text not null,
  pin_hash text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create table if not exists devices (
  id uuid primary key,
  member_id uuid not null references members (id) on delete cascade,
  label text not null,
  token_hash text not null unique,
  last_seen_at timestamptz not null default now()
);

create table if not exists invites (
  id uuid primary key,
  family_id uuid not null references families (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null
);

create table if not exists accounts (
  id uuid primary key,
  family_id uuid not null,
  updated_at bigint not null,
  updated_by uuid,
  deleted boolean not null default false,
  seq bigint not null default nextval('sync_seq'),
  name text not null,
  kind text not null,
  scope text not null,
  owner_member_id uuid,
  opening_balance bigint not null default 0,
  credit_limit bigint,
  icon text not null default '',
  color text not null default '',
  sort integer not null default 0,
  archived boolean not null default false
);

create table if not exists categories (
  id uuid primary key,
  family_id uuid not null,
  updated_at bigint not null,
  updated_by uuid,
  deleted boolean not null default false,
  seq bigint not null default nextval('sync_seq'),
  name text not null,
  flow text not null,
  icon text not null default '',
  color text not null default '',
  sort integer not null default 0,
  archived boolean not null default false
);

create table if not exists transactions (
  id uuid primary key,
  family_id uuid not null,
  updated_at bigint not null,
  updated_by uuid,
  deleted boolean not null default false,
  seq bigint not null default nextval('sync_seq'),
  flow text not null,
  amount bigint not null,
  account_id uuid not null,
  counter_account_id uuid,
  category_id uuid,
  member_id uuid not null,
  occurred_at bigint not null,
  note text not null default '',
  tags jsonb not null default '[]'::jsonb
);

create table if not exists budgets (
  id uuid primary key,
  family_id uuid not null,
  updated_at bigint not null,
  updated_by uuid,
  deleted boolean not null default false,
  seq bigint not null default nextval('sync_seq'),
  category_id uuid not null,
  period_month text not null,
  amount bigint not null
);

create index if not exists families_seq_idx on families (family_id, seq);
create index if not exists accounts_seq_idx on accounts (family_id, seq);
create index if not exists categories_seq_idx on categories (family_id, seq);
create index if not exists transactions_seq_idx on transactions (family_id, seq);
create index if not exists transactions_occurred_idx on transactions (family_id, occurred_at desc);
create index if not exists budgets_seq_idx on budgets (family_id, seq);
create unique index if not exists budgets_period_idx on budgets (family_id, category_id, period_month);
