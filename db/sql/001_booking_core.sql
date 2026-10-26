-- ROOT PATH: db/sql/001_booking_core.sql
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- NOTE: invoice_seq and next_invoice_no() ALREADY exist (created with payment_requests, start 1001,
-- execute restricted to service_role). We reuse them so invoice numbers stay continuous across
-- manual payment links and online bookings. Do NOT recreate them here.

create extension if not exists pgcrypto;

create table if not exists public.room_inventory (
  room_id     text primary key,
  room_name   text not null,
  total_units int  not null check (total_units >= 0),
  unit_price_paise int not null check (unit_price_paise > 0),
  tax_paise_per_night int not null default 0 check (tax_paise_per_night >= 0),
  max_guests_per_unit int not null default 2 check (max_guests_per_unit > 0),
  advance_percent int not null default 50 check (advance_percent between 1 and 100),
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.guest_bookings (
  id           uuid primary key default gen_random_uuid(),
  booking_ref  text unique not null,
  room_id      text not null references public.room_inventory(room_id),
  room_name    text not null,
  check_in     date not null,
  check_out    date not null,
  rooms_count  int  not null default 1 check (rooms_count between 1 and 30),
  guests       int  not null check (guests between 1 and 50),
  guest_name   text not null,
  guest_phone  text not null,
  guest_email  text not null,
  subtotal_paise int not null check (subtotal_paise >= 0),
  tax_paise      int not null check (tax_paise >= 0),
  total_paise    int not null check (total_paise > 0),
  advance_paise  int not null check (advance_paise > 0 and advance_paise <= total_paise),
  status       text not null default 'pending'
               check (status in ('pending','confirmed','cancelled','expired','completed','refunded')),
  hold_expires_at timestamptz,
  public_token text not null default encode(gen_random_bytes(16),'hex'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint dates_ok check (check_out > check_in)
);
create index if not exists gb_room_dates on public.guest_bookings (room_id, check_in, check_out);
create index if not exists gb_status on public.guest_bookings (status, hold_expires_at);

create table if not exists public.booking_payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.guest_bookings(id),
  gateway       text not null default 'cashfree',
  gateway_order_id text unique not null,
  gateway_payment_id text,
  amount_paise  int not null check (amount_paise > 0),
  currency      text not null default 'INR',
  status        text not null default 'created'
                check (status in ('created','pending','success','failed','cancelled','refunded')),
  method        text,
  invoice_no    text unique,
  invoice_emailed_at timestamptz,
  paid_at       timestamptz,
  raw_status    text,
  created_at    timestamptz not null default now()
);
create index if not exists bp_booking on public.booking_payments (booking_id);

-- Service role only: RLS on, no policies, and no direct grants to browser roles.
alter table public.room_inventory   enable row level security;
alter table public.guest_bookings   enable row level security;
alter table public.booking_payments enable row level security;
revoke all on public.room_inventory, public.guest_bookings, public.booking_payments from anon, authenticated;
