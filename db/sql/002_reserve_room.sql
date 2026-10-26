-- ROOT PATH: db/sql/002_reserve_room.sql
-- Run AFTER 001. Single source of price + availability truth (R1, R5). Safe to re-run.
-- The client never sends an amount: everything below is computed from room_inventory.

-- An earlier draft of reserve_room returned a table; drop it so the jsonb version below can replace it.
drop function if exists public.reserve_room(text,date,date,int,int,text,text,text,text,int);

-- Peak simultaneous rooms booked on any night of [ci, co) (confirmed + unexpired holds).
create or replace function public.room_peak(p_room_id text, p_ci date, p_co date, p_exclude uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(occ), 0)::int from (
    select (select coalesce(sum(b.rooms_count), 0)
              from public.guest_bookings b
             where b.room_id = p_room_id
               and (p_exclude is null or b.id <> p_exclude)
               and b.check_in <= n::date and b.check_out > n::date
               and (b.status = 'confirmed' or (b.status = 'pending' and b.hold_expires_at > now()))) as occ
    from generate_series(p_ci::timestamp, (p_co - 1)::timestamp, interval '1 day') n
  ) t;
$$;

-- Validates + prices a stay. Returns jsonb. No writes. Raises coded exceptions.
create or replace function public.quote_room(
  p_room_id text, p_check_in date, p_check_out date, p_rooms int, p_guests int, p_pay_mode text default 'advance'
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.room_inventory%rowtype;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_nights int; v_peak int; v_sub int; v_tax int; v_total int; v_adv int;
begin
  select * into r from public.room_inventory ri where ri.room_id = p_room_id and ri.active;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then raise exception 'BAD_DATES'; end if;
  if p_check_in < v_today then raise exception 'PAST_DATE'; end if;
  v_nights := p_check_out - p_check_in;
  if v_nights > 30 then raise exception 'TOO_LONG'; end if;
  if p_check_in > v_today + 365 then raise exception 'TOO_FAR'; end if;
  if p_rooms is null or p_rooms < 1 or p_rooms > 30 then raise exception 'BAD_ROOMS'; end if;
  if p_guests is null or p_guests < 1 or p_guests > r.max_guests_per_unit * p_rooms then raise exception 'BAD_GUESTS'; end if;
  if p_pay_mode not in ('full','advance') then raise exception 'BAD_PAY_MODE'; end if;

  v_peak := public.room_peak(p_room_id, p_check_in, p_check_out, null);
  if v_peak + p_rooms > r.total_units then raise exception 'SOLD_OUT'; end if;

  v_sub   := r.unit_price_paise * v_nights * p_rooms;
  v_tax   := r.tax_paise_per_night * v_nights * p_rooms;
  v_total := v_sub + v_tax;
  -- advance rounded UP to whole rupees, min Rs 100, never above total
  v_adv   := least(v_total, greatest(10000, (ceil(v_total * r.advance_percent / 10000.0) * 100)::int));
  return jsonb_build_object(
    'room_id', r.room_id, 'room_name', r.room_name, 'nights', v_nights, 'rooms', p_rooms,
    'unit_price_paise', r.unit_price_paise, 'tax_paise_per_night', r.tax_paise_per_night,
    'subtotal_paise', v_sub, 'tax_paise', v_tax, 'total_paise', v_total,
    'advance_paise', v_adv, 'advance_percent', r.advance_percent,
    'pay_now_paise', case when p_pay_mode = 'full' then v_total else v_adv end,
    'units_left', r.total_units - v_peak, 'max_guests', r.max_guests_per_unit * p_rooms
  );
end;
$$;

-- Atomic hold. Advisory lock per room serializes racing callers; the check + insert are in one transaction.
create or replace function public.reserve_room(
  p_room_id text, p_check_in date, p_check_out date, p_rooms int, p_guests int,
  p_name text, p_phone text, p_email text,
  p_pay_mode text default 'advance', p_hold_minutes int default 20
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q jsonb; v_ref text; v_try int := 0; v_row public.guest_bookings%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_room_id));
  q := public.quote_room(p_room_id, p_check_in, p_check_out, p_rooms, p_guests, p_pay_mode);  -- raises SOLD_OUT etc.

  loop
    v_try := v_try + 1;
    v_ref := 'SST-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' ||
             (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random()*32)::int, 1), '')
                from generate_series(1, 4));
    exit when not exists (select 1 from public.guest_bookings g where g.booking_ref = v_ref);
    if v_try > 20 then raise exception 'REF_FAILED'; end if;
  end loop;

  insert into public.guest_bookings (
    booking_ref, room_id, room_name, check_in, check_out, rooms_count, guests,
    guest_name, guest_phone, guest_email,
    subtotal_paise, tax_paise, total_paise, advance_paise, status, hold_expires_at
  ) values (
    v_ref, p_room_id, q->>'room_name', p_check_in, p_check_out, p_rooms, p_guests,
    left(trim(p_name), 100), left(trim(p_phone), 20), lower(left(trim(p_email), 254)),
    (q->>'subtotal_paise')::int, (q->>'tax_paise')::int, (q->>'total_paise')::int,
    (q->>'advance_paise')::int, 'pending', now() + make_interval(mins => p_hold_minutes)
  ) returning * into v_row;

  return q || jsonb_build_object(
    'id', v_row.id, 'booking_ref', v_row.booking_ref, 'public_token', v_row.public_token,
    'hold_expires_at', v_row.hold_expires_at);
end;
$$;

-- Frees inventory of unpaid holds (reconcile cron).
create or replace function public.expire_stale_holds() returns int
language sql security definer set search_path = public as $$
  with x as (
    update public.guest_bookings set status = 'expired', updated_at = now()
     where status = 'pending' and hold_expires_at < now()
    returning 1
  ) select count(*)::int from x;
$$;

do $$ declare f text; begin
  foreach f in array array[
    'public.room_peak(text,date,date,uuid)',
    'public.quote_room(text,date,date,int,int,text)',
    'public.reserve_room(text,date,date,int,int,text,text,text,text,int)',
    'public.expire_stale_holds()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---- Smoke test (after seeding room_inventory; clean up afterwards) ----
-- insert into public.room_inventory (room_id, room_name, total_units, unit_price_paise, tax_paise_per_night)
--   values ('test-room','Test Room',1,100000,5000) on conflict do nothing;
-- select public.quote_room('test-room', current_date+1, current_date+2, 1, 2, 'advance');
-- select public.reserve_room('test-room', current_date+1, current_date+2, 1, 2, 'T', '9999999999', 't@t.com');  -- ok
-- select public.reserve_room('test-room', current_date+1, current_date+2, 1, 2, 'T', '9999999999', 't@t.com');  -- SOLD_OUT
-- delete from public.guest_bookings where room_id='test-room'; delete from public.room_inventory where room_id='test-room';
