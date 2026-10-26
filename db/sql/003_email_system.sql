-- ROOT PATH: db/sql/003_email_system.sql
-- Run AFTER 001. Contacts + job queue. RLS on, service role only. Safe to re-run.

create table if not exists public.email_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_lower text generated always as (lower(email)) stored unique,
  full_name text,
  phone text,
  source text not null default 'booking',
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  consent_text text,
  unsubscribe_token text not null default encode(gen_random_bytes(16),'hex'),
  unsubscribed_at timestamptz,
  email_status text not null default 'ok' check (email_status in ('ok','bounced','complained')),
  last_booking_id uuid references public.guest_bookings(id),
  paid_bookings_count int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists ec_unsub_token on public.email_contacts (unsubscribe_token);

create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.email_contacts(id),
  booking_id uuid references public.guest_bookings(id),
  kind text not null,                     -- booking_confirmed | pre_arrival | thank_you | festival | winback | refund_notice | apology
  is_marketing boolean not null default false,
  send_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  claimed_at timestamptz,
  dedupe_key text unique not null,
  created_at timestamptz not null default now()
);
create index if not exists ej_due on public.email_jobs (status, send_at);

alter table public.email_contacts enable row level security;
alter table public.email_jobs     enable row level security;
revoke all on public.email_contacts, public.email_jobs from anon, authenticated;
