// ROOT PATH: api/cron.js
// External scheduler (cron-job.org) -> Authorization: Bearer <CRON_SECRET>. No ?key= (leaks in logs). 503 if secret unset.
//   GET /api/cron/reconcile          every 5 min
//   GET /api/cron/send-emails        every 15 min
//   GET /api/cron/enqueue-greetings  daily 08:00 IST
// (vercel.json rewrites /api/cron/:job -> /api/cron?job=:job)
import { sb, httpError } from './_pay-lib.js';
import { greetingCalendar, runJobs, enqueueJob, IST } from './_mail.js';
import { q, rpc, requireCron, syncOrder, syncRefund, startRefund, alertOnce } from './_booking-lib.js';

const istYmd = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

async function reconcile() {
  const out = { expired: 0, synced: 0, confirmed: 0, refundsRetried: 0, refundsSynced: 0, completed: 0, errors: [] };
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      out.errors.push(`${name}: ${e.message}`);
      console.error(`reconcile ${name} failed:`, e.message);
    }
  };

  await step('expire_holds', async () => { out.expired = (await rpc('expire_stale_holds', {})) || 0; });

  await step('pending_payments', async () => {
    const rows = await sb(
      `booking_payments?status=in.(created,pending)&created_at=lt.${q(new Date(Date.now() - 3 * 60000).toISOString())}&created_at=gt.${q(daysAgo(2).toISOString())}&select=gateway_order_id&order=created_at.asc&limit=30`
    );
    for (const r of rows) {
      try {
        const res = await syncOrder(r.gateway_order_id);
        out.synced++;
        if (res.result === 'CONFIRMED') out.confirmed++;
      } catch (e) {
        out.errors.push(`sync ${r.gateway_order_id}: ${e.message}`);
      }
    }
    // abandoned for 2+ days: close the row (gateway orders expire within the hold window)
    await sb(`booking_payments?status=in.(created,pending)&created_at=lt.${q(daysAgo(2).toISOString())}`, {
      method: 'PATCH', prefer: 'return=minimal', body: { status: 'cancelled', raw_status: 'STALE' },
    });
  });

  await step('refunds', async () => {
    const rows = await sb(`booking_payments?refund_status=in.(REQUESTED,PENDING)&select=*&limit=20`);
    for (const p of rows) {
      try {
        if (p.refund_status === 'PENDING') {
          await syncRefund(p);
          out.refundsSynced++;
        } else if (Date.now() - new Date(p.paid_at || p.created_at).getTime() > 2 * 60000) {
          const kind = p.raw_status === 'NO_INVENTORY' ? 'apology' : 'refund_notice';
          await startRefund(p, p.refund_amount_paise, p.refund_reason, { kind });
          out.refundsRetried++;
        }
      } catch (e) {
        out.errors.push(`refund ${p.id}: ${e.message}`);
      }
    }
  });

  await step('complete_stays', async () => {
    const done = await sb(`guest_bookings?status=eq.confirmed&check_out=lt.${istYmd()}`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'completed', updated_at: new Date().toISOString() } });
    out.completed = done.length;
  });

  await step('cleanup', async () => {
    await sb(`rate_limits?window_start=lt.${q(daysAgo(1).toISOString())}`, { method: 'DELETE', prefer: 'return=minimal' });
  });

  if (out.errors.length) await alertOnce('reconcile', 'Reconcile cron errors', out);
  return out;
}

async function enqueueGreetings() {
  const out = { festival: 0, winback: 0, greetings: 0 };
  const today = istYmd();
  const todays = greetingCalendar().filter((g) => g.active && g.date === today);
  out.greetings = todays.length;

  const eligible = async (extra = '') => {
    const all = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await sb(`email_contacts?marketing_consent=eq.true&unsubscribed_at=is.null&email_status=eq.ok&paid_bookings_count=gte.1${extra}&select=id&order=created_at.asc&limit=1000&offset=${offset}`);
      all.push(...page);
      if (page.length < 1000) break;
    }
    return all;
  };
  const enqueueMany = (rows) =>
    rows.length
      ? sb('email_jobs?on_conflict=dedupe_key', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: rows })
      : null;

  if (todays.length) {
    const contacts = await eligible();
    for (const g of todays) {
      const rows = contacts.map((c) => ({ contact_id: c.id, kind: 'festival', is_marketing: true, send_at: new Date().toISOString(), dedupe_key: `festival:${g.date}:${c.id}` }));
      for (let i = 0; i < rows.length; i += 500) await enqueueMany(rows.slice(i, i + 500));
      out.festival += rows.length;
    }
  }

  if (process.env.WINBACK_ENABLED === 'true') {
    const stays = await sb(`guest_bookings?status=eq.completed&check_out=lte.${istYmd(daysAgo(90))}&check_out=gte.${istYmd(daysAgo(97))}&select=id&limit=500`);
    if (stays.length) {
      const contacts = await eligible(`&last_booking_id=in.(${stays.map((s) => s.id).join(',')})`);
      await enqueueMany(contacts.map((c) => ({ contact_id: c.id, kind: 'winback', is_marketing: true, send_at: new Date().toISOString(), dedupe_key: `winback:${c.id}` })));
      out.winback = contacts.length;
    }
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    requireCron(req);
    if (req.method !== 'GET' && req.method !== 'POST') throw httpError(405, 'Method not allowed');
    const job = String(req.query?.job || '');
    if (job === 'reconcile') return res.status(200).json({ success: true, ...(await reconcile()) });
    if (job === 'send-emails') return res.status(200).json({ success: true, ...(await runJobs({ limit: 40 })) });
    if (job === 'enqueue-greetings') return res.status(200).json({ success: true, ...(await enqueueGreetings()) });
    throw httpError(404, 'Unknown job');
  } catch (e) {
    if (!e.status || e.status >= 500) {
      console.error('cron failed:', e.message);
      await alertOnce(`cron:${req.query?.job}`, `Cron ${req.query?.job} failed`, e.message).catch(() => {});
    }
    return res.status(e.status || 500).json({ success: false, error: e.status && e.status < 500 ? e.message : 'Server error' });
  }
}
