-- Arcurrent core schema.
-- All access goes through Next.js API routes / the agent service using the
-- service role key — RLS is enabled with no public policies so the anon key
-- (if ever exposed client-side) can't read or write anything.

create type obligation_status as enum ('pending', 'scheduled', 'settled', 'failed');
create type obligation_currency as enum ('USDC', 'EURC');
create type decision_action as enum (
  'pay_now',
  'wait',
  'convert_currency',
  'request_liquidity',
  'insufficient_funds'
);

create table obligations (
  id uuid primary key default gen_random_uuid(),
  vendor_name text not null,
  amount numeric(20, 6) not null check (amount > 0),
  currency obligation_currency not null default 'USDC',
  due_date date not null,
  destination_address text not null,
  status obligation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agent_decisions (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations (id) on delete cascade,
  action decision_action not null,
  reasoning text not null,
  signals jsonb not null default '{}'::jsonb,
  tx_hash text,
  created_at timestamptz not null default now()
);

create index agent_decisions_obligation_id_idx on agent_decisions (obligation_id);
create index obligations_status_due_date_idx on obligations (status, due_date);

alter table obligations enable row level security;
alter table agent_decisions enable row level security;

-- No policies defined: every table is inaccessible to the anon/authenticated
-- roles by default under RLS. All reads/writes happen server-side via the
-- service role key, which bypasses RLS entirely.
