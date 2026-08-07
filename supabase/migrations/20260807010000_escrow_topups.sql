-- Tracks IP addresses that have used the public "Top up escrow" button on
-- the dashboard, to enforce a short per-IP cooldown. The action is public
-- and self-service on purpose, same philosophy as the obligation form: no
-- login, autonomy is the point. It's still safe to leave ungated because it
-- only ever moves funds the project already controls (treasury wallet into
-- the escrow contract), never to an outside address. This table backs a
-- lightweight cooldown, not real access control.
-- No policies defined, same convention as the rest of the schema: only the
-- service role (used server-side) can read or write this table.

create table escrow_topups (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);

create index escrow_topups_ip_created_at_idx on escrow_topups (ip, created_at desc);

alter table escrow_topups enable row level security;
