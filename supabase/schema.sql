-- Run once in the Supabase SQL editor. No mail text is ever stored here.
-- RLS with no policies: only the server's secret key can read or write.
create table if not exists events (
  id bigint generated always as identity primary key,
  level text not null,
  attack text,
  created_at timestamptz not null default now()
);
create table if not exists reports (
  id bigint generated always as identity primary key,
  target text not null, -- a domain, or a full address for free mail
  level text,
  attack text,
  dna text, -- Scam DNA: a 64-bit fingerprint of the mail's script, never its text
  created_at timestamptz not null default now()
);
alter table reports add column if not exists dna text; -- for databases made before Scam DNA
create table if not exists verdicts (
  target text primary key,
  verdict text not null check (verdict in ('fake', 'genuine')),
  updated_at timestamptz not null default now()
);
alter table events enable row level security;
alter table reports enable row level security;
alter table verdicts enable row level security;
