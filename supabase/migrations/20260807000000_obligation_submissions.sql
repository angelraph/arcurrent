-- Tracks IP addresses that have submitted an obligation through the public
-- dashboard form, to enforce a short per-IP cooldown. The "Add obligation"
-- form has no login (autonomy is the point: no human approving each
-- transaction), which also means no login gate on who can trigger a real
-- payout from the escrow. This table backs a lightweight cooldown, not
-- real access control, real access control would defeat the "try it
-- yourself" point of the demo.
-- No policies defined, same convention as the rest of the schema: only the
-- service role (used server-side) can read or write this table.

create table obligation_submissions (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);

create index obligation_submissions_ip_created_at_idx on obligation_submissions (ip, created_at desc);

alter table obligation_submissions enable row level security;
