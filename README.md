# Shri Sitaram Seva Trust - Luxury Hospitality Website

A production-ready Vite + React + TypeScript + Tailwind CSS website for Shri Sitaram Seva Trust, Ayodhya Dham.

## Features

- Luxury public website with Ram Mandir themed hero section
- Room inventory sections for AC / Non-AC / Dormitory
- Custom OTT video player
- Promo video popup
- QR code payment / check-in / room-service sections
- Explore Ayodhya Dham guide
- Food, transport, and local guide services section
- Guest reviews and booking requests
- Floating WhatsApp and call buttons
- PWA install prompt with service worker
- Secure admin dashboard
- Supabase Auth login
- Supabase database publishing
- Supabase Storage direct file uploads for:
  - Logo
  - Hero images
  - QR images
  - Room images
  - Room gallery images
  - Temple images
  - Service images
  - Promo / OTT videos
  - Video thumbnails

## Tech Stack

- Vite
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase Auth / Database / Storage
- Framer Motion
- Lucide Icons
- React Router

## Local Setup

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

The build output is generated in `dist/`.

## Environment Variables

Create `.env.local` locally or configure these in Vercel / hosting panel:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Supabase SQL Setup

Run this in Supabase SQL Editor.

### 1. Site Config Table

```sql
create table if not exists public.site_config (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.site_config enable row level security;

drop policy if exists "Allow public read site config" on public.site_config;
drop policy if exists "Allow authenticated admin insert site config" on public.site_config;
drop policy if exists "Allow authenticated admin update site config" on public.site_config;

create policy "Allow public read site config"
on public.site_config
for select
using (true);

create policy "Allow authenticated admin insert site config"
on public.site_config
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "Allow authenticated admin update site config"
on public.site_config
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

insert into public.site_config (id, data, updated_at)
values ('main', '{}'::jsonb, now())
on conflict (id) do nothing;
```

### 2. Media Storage Bucket

```sql
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "Allow public read media" on storage.objects;
drop policy if exists "Allow authenticated upload media" on storage.objects;
drop policy if exists "Allow authenticated update media" on storage.objects;
drop policy if exists "Allow authenticated delete media" on storage.objects;

create policy "Allow public read media"
on storage.objects
for select
using (bucket_id = 'media');

create policy "Allow authenticated upload media"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'media');

create policy "Allow authenticated update media"
on storage.objects
for update
to authenticated
using (bucket_id = 'media')
with check (bucket_id = 'media');

create policy "Allow authenticated delete media"
on storage.objects
for delete
to authenticated
using (bucket_id = 'media');
```

## Create Admin User

In Supabase Dashboard:

1. Go to **Authentication → Users**
2. Click **Add user**
3. Add the owner's email and a **strong, unique password** (12+ characters). Never write the password in this repository.
4. Put the same email in the `ADMIN_EMAILS` environment variable on Vercel (comma separated) so the payment/booking admin API accepts it.

Use these credentials at `/login`. If an older password was ever published in this README, change it now in **Authentication → Users**.

## Admin Panel

Admin URL:

```txt
/admin
```

The navbar does not show the admin link publicly.

### Admin can manage

- General settings
- Contact details
- Logo / theme colors
- Hero images
- QR images
- Promo / OTT videos
- Video visibility: public / unlisted
- Room inventory
- Room images and galleries
- Temple guide
- Food / transport / guide services
- Bookings
- Reviews

## Hosting Notes

This is a static SPA. For Hostinger / Netlify style hosting, `_redirects` is included:

```txt
/* /index.html 200
```

For Vercel, `vercel.json` rewrites are included.

## Important

If Supabase environment variables or policies are missing, admin changes may save only in local browser storage and public users will not see them. Always confirm admin panel shows:

```txt
Supabase publish successful
```


## Online booking + payments (Cashfree)

The full rulebook is `PAYMENT_BIBLE.md`. Quick start:

1. Supabase SQL Editor: run `db/sql/001` ... `005` in order (each is safe to re-run).
2. Vercel env: copy every name from `.env.example` (sandbox keys first).
3. Cashfree dashboard: webhook URL `https://<your-domain>/api/pay-webhook`.
4. cron-job.org (header `Authorization: Bearer <CRON_SECRET>`): `/api/cron/reconcile` every 5 min, `/api/cron/send-emails` every 15 min, `/api/cron/enqueue-greetings` daily 08:00 IST.
5. Admin > Rooms > Save (this syncs prices/units into `room_inventory`), then test the walkthrough in section 14 of the Bible.

Status and history: `PROJECT_STATUS.md`, `CHANGELOG.md`.
