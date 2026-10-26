-- ROOT PATH: db/sql/004_payment_requests_migrate.sql
-- Run AFTER 001. payment_requests already exists in production; this only EXTENDS it.
-- Existing Razorpay columns stay (current code uses them). Safe to re-run.

alter table public.payment_requests
  add column if not exists gateway text not null default 'razorpay',
  add column if not exists gateway_order_id text,
  add column if not exists gateway_payment_id text,
  add column if not exists guest_booking_id uuid references public.guest_bookings(id);

-- Backfill neutral columns from the Razorpay ones for old rows
update public.payment_requests
   set gateway_order_id = razorpay_order_id
 where gateway_order_id is null and razorpay_order_id is not null;
update public.payment_requests
   set gateway_payment_id = razorpay_payment_id
 where gateway_payment_id is null and razorpay_payment_id is not null;

create unique index if not exists pr_gateway_order_uq
  on public.payment_requests (gateway_order_id) where gateway_order_id is not null;

-- Status guard (existing values: created | paid | cancelled)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pr_status_chk') then
    alter table public.payment_requests
      add constraint pr_status_chk check (status in ('created','paid','cancelled'));
  end if;
end $$;

-- Defence in depth (RLS already on): browser roles get nothing.
revoke all on public.payment_requests from anon, authenticated;
