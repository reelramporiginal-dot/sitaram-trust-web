-- ROOT PATH: db/sql/005_finalize_and_limits.sql
-- Run AFTER 001, 002, 003, 004. Safe to re-run.
-- Contains: extra columns, rate limiter, finalize_booking_payment (the single winner-takes-all path), finalize_refund.

alter table public.guest_bookings
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists consent_text text,
  add column if not exists cancel_reason text;

alter table public.booking_payments
  add column if not exists refund_id text,
  add column if not exists refund_amount_paise int,
  add column if not exists refund_status text,
  add column if not exists refund_reason text,
  add column if not exists attempt int not null default 1;

-- allow up to 30 rooms/beds in one booking (dormitory groups); older installs had 1..10
alter table public.guest_bookings drop constraint if exists guest_bookings_rooms_count_check;
alter table public.guest_bookings add constraint guest_bookings_rooms_count_check check (rooms_count between 1 and 30);

-- ---------- rate limiter (fixed window, atomic) ----------
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  insert into public.rate_limits as rl (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.hits + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end; $$;

-- ---------- finalize (R2, R3, R9) ----------
-- Called ONLY by server code that has already verified the payment with the gateway.
-- Everything happens in one transaction; only the call that flips the payment to 'success' gets won=true.
create or replace function public.finalize_booking_payment(
  p_order_id text, p_payment_id text, p_amount_paise int, p_currency text, p_method text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pay public.booking_payments%rowtype;
  b   public.guest_bookings%rowtype;
  v_peak int; v_fy int; v_inv text; v_contact uuid; v_confirm boolean := false; v_reason text;
  v_now_ist timestamp := (now() at time zone 'Asia/Kolkata');
begin
  select * into pay from public.booking_payments where gateway_order_id = p_order_id for update;
  if not found then return jsonb_build_object('result','UNKNOWN_ORDER'); end if;

  perform pg_advisory_xact_lock(hashtext((select room_id from public.guest_bookings where id = pay.booking_id)));
  select * into b from public.guest_bookings where id = pay.booking_id for update;

  if pay.status in ('success','refunded') then
    return jsonb_build_object('result','ALREADY','won',false,'booking_id',b.id,'booking_ref',b.booking_ref,
                              'invoice_no',pay.invoice_no,'booking_status',b.status,'payment_raw',pay.raw_status);
  end if;

  if p_amount_paise is distinct from pay.amount_paise or upper(coalesce(p_currency,'INR')) <> upper(pay.currency) then
    update public.booking_payments set raw_status = 'AMOUNT_MISMATCH' where id = pay.id;
    return jsonb_build_object('result','AMOUNT_MISMATCH','won',false,'booking_id',b.id,'booking_ref',b.booking_ref);
  end if;

  -- Decide whether the booking can be confirmed.
  if exists (select 1 from public.booking_payments o where o.booking_id = b.id and o.status = 'success' and o.id <> pay.id) then
    v_reason := 'DUPLICATE_PAYMENT';
  elsif b.status = 'confirmed' then
    v_confirm := true;                                   -- already confirmed (e.g. payment row was lagging)
  elsif b.status = 'pending' and b.hold_expires_at > now() then
    v_confirm := true;                                   -- normal path: hold still valid
  elsif b.status in ('pending','expired') then
    -- late success: only if inventory is still free for these dates
    v_peak := public.room_peak(b.room_id, b.check_in, b.check_out, b.id);
    if v_peak + b.rooms_count <= (select total_units from public.room_inventory where room_id = b.room_id) then
      v_confirm := true;
    else
      v_reason := 'NO_INVENTORY';
    end if;
  else
    v_reason := 'NO_INVENTORY';                          -- cancelled / refunded / completed
  end if;

  if not v_confirm then
    -- Money was taken but we cannot honour the booking: record it and let the server refund.
    update public.booking_payments
       set status = 'success', gateway_payment_id = p_payment_id, method = p_method, paid_at = now(), raw_status = v_reason
     where id = pay.id;
    return jsonb_build_object('result', v_reason, 'won', true, 'needs_refund', true,
                              'payment_row_id', pay.id, 'booking_id', b.id, 'booking_ref', b.booking_ref);
  end if;

  v_fy  := case when extract(month from v_now_ist) >= 4 then extract(year from v_now_ist)::int else extract(year from v_now_ist)::int - 1 end;
  v_inv := 'SST/' || v_fy || '-' || lpad(((v_fy + 1) % 100)::text, 2, '0') || '/' || public.next_invoice_no();

  update public.booking_payments
     set status = 'success', gateway_payment_id = p_payment_id, method = p_method,
         paid_at = now(), raw_status = 'SUCCESS', invoice_no = v_inv
   where id = pay.id;

  update public.guest_bookings set status = 'confirmed', hold_expires_at = null, updated_at = now() where id = b.id;

  insert into public.email_contacts as ec
    (email, full_name, phone, source, marketing_consent, consent_at, consent_text, last_booking_id, paid_bookings_count)
  values
    (b.guest_email, b.guest_name, b.guest_phone, 'booking', b.marketing_consent,
     case when b.marketing_consent then now() end, case when b.marketing_consent then b.consent_text end, b.id, 1)
  on conflict (email_lower) do update set
    full_name = coalesce(excluded.full_name, ec.full_name),
    phone = coalesce(excluded.phone, ec.phone),
    last_booking_id = excluded.last_booking_id,
    paid_bookings_count = ec.paid_bookings_count + 1,
    marketing_consent = ec.marketing_consent or excluded.marketing_consent,
    consent_at = case when not ec.marketing_consent and excluded.marketing_consent then now() else ec.consent_at end,
    consent_text = case when not ec.marketing_consent and excluded.marketing_consent then excluded.consent_text else ec.consent_text end
  returning ec.id into v_contact;

  insert into public.email_jobs (contact_id, booking_id, kind, is_marketing, send_at, dedupe_key) values
    (v_contact, b.id, 'booking_confirmed', false, now(), 'booking_confirmed:' || b.id)
  on conflict (dedupe_key) do nothing;

  if ((b.check_in - 1)::timestamp + time '18:00') at time zone 'Asia/Kolkata' > now() then
    insert into public.email_jobs (contact_id, booking_id, kind, is_marketing, send_at, dedupe_key) values
      (v_contact, b.id, 'pre_arrival', false, ((b.check_in - 1)::timestamp + time '18:00') at time zone 'Asia/Kolkata', 'pre_arrival:' || b.id)
    on conflict (dedupe_key) do nothing;
  end if;

  insert into public.email_jobs (contact_id, booking_id, kind, is_marketing, send_at, dedupe_key) values
    (v_contact, b.id, 'thank_you', false, ((b.check_out + 1)::timestamp + time '10:00') at time zone 'Asia/Kolkata', 'thank_you:' || b.id)
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object('result','CONFIRMED','won',true,'booking_id',b.id,'booking_ref',b.booking_ref,
                            'invoice_no',v_inv,'contact_id',v_contact);
end; $$;

-- ---------- refund completion ----------
create or replace function public.finalize_refund(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pay public.booking_payments%rowtype; v_full boolean; v_other boolean;
begin
  select * into pay from public.booking_payments where id = p_payment_id for update;
  if not found then return jsonb_build_object('result','UNKNOWN_PAYMENT'); end if;
  if pay.status = 'refunded' then return jsonb_build_object('result','ALREADY','booking_id',pay.booking_id); end if;
  v_full := coalesce(pay.refund_amount_paise, 0) >= pay.amount_paise;
  update public.booking_payments set refund_status = 'SUCCESS',
         status = case when v_full then 'refunded' else status end
   where id = pay.id;
  select exists (select 1 from public.booking_payments o where o.booking_id = pay.booking_id and o.id <> pay.id and o.status = 'success')
    into v_other;
  if v_full and not v_other then
    update public.guest_bookings set status = 'refunded', updated_at = now()
     where id = pay.booking_id and status in ('pending','confirmed','expired','cancelled');
    update public.email_jobs set status = 'skipped', last_error = 'booking refunded'
     where booking_id = pay.booking_id and status in ('queued') and kind in ('pre_arrival','thank_you');
  end if;
  return jsonb_build_object('result','REFUNDED','full',v_full,'booking_id',pay.booking_id);
end; $$;

do $$ declare f text; begin
  foreach f in array array[
    'public.hit_rate_limit(text,int,int)',
    'public.finalize_booking_payment(text,text,int,text,text)',
    'public.finalize_refund(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
