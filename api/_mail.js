// ROOT PATH: api/_mail.js
// Booking emails: templates, queue worker, admin alerts. Reuses sendMail + invoice HTML from _pay-lib.js.
import fs from 'node:fs';
import path from 'node:path';
import { sb, sendMail, esc, inr, siteUrl, HOTEL, C, SERIF, SANS, invoicePaper, invoicePage, logoUrl } from './_pay-lib.js';

const q = encodeURIComponent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const IST = 'Asia/Kolkata';

// ---------- static data files (data/**) ----------
function readJson(rel, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', rel), 'utf8')); // same approach as api/post-facebook.js
  } catch {
    return fallback;
  }
}
export const policy = () => readJson('hotelPolicy.json', { refundTiers: [], refundProcessingDays: '5-7' });
export const greetingCalendar = () => readJson('greetingCalendar.json', { greetings: [] }).greetings || [];

export function refundLinesHi(p = policy()) {
  const tiers = [...(p.refundTiers || [])].sort((a, b) => b.daysBeforeCheckInMin - a.daysBeforeCheckInMin);
  return tiers.map((t, i) => {
    const prev = i === 0 ? null : tiers[i - 1].daysBeforeCheckInMin;
    const range = prev === null ? `Check-in se ${t.daysBeforeCheckInMin}+ din pehle` : `Check-in se ${t.daysBeforeCheckInMin} se ${prev - 1} din pehle`;
    return t.refundPercent === 0 ? `${range}: refund nahi` : `${range}: ${t.refundPercent}% refund`;
  });
}

// ---------- hotel settings (check-in time etc. from site_config) ----------
let settingsCache = { at: 0, v: null };
export async function hotelSettings() {
  if (settingsCache.v && Date.now() - settingsCache.at < 300000) return settingsCache.v;
  let s = {};
  try {
    const rows = await sb('site_config?id=eq.main&select=data');
    s = rows?.[0]?.data?.settings || {};
  } catch (e) {
    console.error('hotelSettings failed:', e.message);
  }
  const v = {
    checkIn: s.checkIn || '12:00 PM',
    checkOut: s.checkOut || '11:00 AM',
    whatsapp: String(s.whatsapp || HOTEL.phones[0]).replace(/\D/g, '').slice(-10),
    mapQuery: s.mapQuery || `${HOTEL.nameEn} ${HOTEL.address}`,
  };
  settingsCache = { at: Date.now(), v };
  return v;
}
export const mapsUrl = (st) => `https://www.google.com/maps/search/?api=1&query=${q(st.mapQuery)}`;
export const waUrl = (st, text) => `https://wa.me/91${st.whatsapp}${text ? `?text=${q(text)}` : ''}`;

export const fmtD = (ymd) =>
  new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST });

// ---------- admin alert ----------
export async function notifyAdmin(subject, detail) {
  console.error('ALERT:', subject, typeof detail === 'string' ? detail : JSON.stringify(detail));
  try {
    const to = process.env.BOOKING_NOTIFY_EMAIL || 'shrisitaram6151@gmail.com';
    const body = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2);
    await sendMail({ to, subject: `[SST] ${subject}`, html: `<pre style="font-family:monospace;white-space:pre-wrap">${esc(body)}</pre>`, text: body });
  } catch (e) {
    console.error('notifyAdmin failed:', e.message);
  }
}

// ---------- invoice shape (maps booking + payment onto the existing invoice template) ----------
export function bookingInvoiceShape(b, pay) {
  return {
    id: pay.id,
    token: b.public_token,
    invoice_url: `${siteUrl()}/api/booking-invoice?ref=${q(b.booking_ref)}&t=${q(b.public_token)}`,
    invoice_no: pay.invoice_no,
    guest_name: b.guest_name,
    guest_phone: b.guest_phone,
    guest_email: b.guest_email,
    booking_id: b.booking_ref,
    room: `${b.room_name}${b.rooms_count > 1 ? ` x ${b.rooms_count}` : ''}`,
    description: `Room booking (${b.check_out && b.check_in ? Math.round((new Date(b.check_out) - new Date(b.check_in)) / 86400000) : ''} night)`,
    check_in: `${fmtD(b.check_in)} · Check-out: ${fmtD(b.check_out)}`,
    guests: String(b.guests),
    amount_paise: pay.amount_paise,
    total_amount_paise: b.total_paise,
    subtotal_paise: b.subtotal_paise,
    tax_paise: b.tax_paise,
    payment_method: pay.method,
    razorpay_payment_id: pay.gateway_payment_id, // template label is "Payment ID"
    payment_reference: pay.gateway_order_id,
    paid_at: pay.paid_at,
  };
}
export const bookingInvoicePage = (b, pay) => invoicePage(bookingInvoiceShape(b, pay));

// ---------- templates ----------
const btn = (href, label, solid = true) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:4px 3px;background:${solid ? C.maroon : '#ffffff'};color:${solid ? C.light : C.maroon};font-family:${SANS};font-weight:bold;font-size:13px;text-decoration:none;padding:11px 22px;border-radius:999px;border:1px solid ${C.gold};">${esc(label)}</a>`;
const row = (k, v) =>
  v ? `<tr><td style="padding:5px 12px 5px 0;font-family:${SANS};font-size:12px;color:${C.muted};white-space:nowrap;">${esc(k)}</td><td style="padding:5px 0;font-family:${SANS};font-size:13px;color:${C.text};font-weight:bold;">${esc(v)}</td></tr>` : '';

function shell({ preheader, inner, footerExtra = '' }) {
  return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(HOTEL.nameEn)}</title></head>
<body style="margin:0;padding:0;background:#f1e8dc;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:14px;overflow:hidden;">
<tr><td style="height:6px;line-height:6px;font-size:0;background-color:${C.gold};">&nbsp;</td></tr>
<tr><td style="background:${C.deep};padding:18px 22px;"><table role="presentation" width="100%"><tr>
<td width="70"><img src="${esc(logoUrl())}" width="60" height="60" alt="" style="display:block;border-radius:50%;border:2px solid ${C.gold};background:#fff;"></td>
<td style="padding-left:8px;"><div style="font-family:${SERIF};font-size:19px;font-weight:bold;color:#ffffff;">${esc(HOTEL.nameHi)}</div>
<div style="font-family:${SANS};font-size:10px;letter-spacing:2px;color:${C.light};text-transform:uppercase;margin-top:3px;">${esc(HOTEL.nameEn)}</div></td></tr></table></td></tr>
<tr><td style="padding:22px;font-family:${SANS};font-size:15px;line-height:1.7;color:${C.text};">${inner}</td></tr>
<tr><td style="background:${C.deep};padding:16px 22px;text-align:center;font-family:${SANS};font-size:11px;line-height:1.8;color:#cdb9bf;">
📍 ${esc(HOTEL.address)}<br>📞 ${HOTEL.phones.map(esc).join(' · ')} &nbsp;|&nbsp; ☎ ${esc(HOTEL.helpline)}<br>${footerExtra}</td></tr>
</table></td></tr></table></body></html>`;
}

const detailsCard = (b, st, paidPaise) => {
  const balance = Math.max(b.total_paise - paidPaise, 0);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};border:1px solid ${C.line};border-radius:10px;margin:14px 0;"><tr><td style="padding:14px 16px;"><table role="presentation" cellpadding="0" cellspacing="0">
${row('Booking ID', b.booking_ref)}${row('Room', `${b.room_name}${b.rooms_count > 1 ? ` x ${b.rooms_count}` : ''}`)}${row('Check-in', `${fmtD(b.check_in)}, ${st.checkIn}`)}${row('Check-out', `${fmtD(b.check_out)}, ${st.checkOut}`)}${row('Guests', String(b.guests))}${row('Total', inr(b.total_paise))}${row('Paid now', inr(paidPaise))}${balance ? row('Balance at hotel', inr(balance)) : ''}
</table></td></tr></table>`;
};

export function renderEmail(job, ctx) {
  const { contact, booking: b, payment: pay, settings: st, greeting } = ctx;
  const name = esc(contact.full_name || 'Guest');
  const unsub = `${siteUrl()}/api/unsubscribe?t=${q(contact.unsubscribe_token)}`;
  const marketingFooter = job.is_marketing
    ? `<a href="${esc(unsub)}" style="color:${C.light};">Unsubscribe</a> · aap ye mail isliye pa rahe hain kyunki aapne booking ke samay offers ke liye haan kaha tha.<br>`
    : '';
  const map = mapsUrl(st);
  const wa = waUrl(st, b ? `Namaste, booking ${b.booking_ref} ke baare me jaankari chahiye.` : 'Namaste');
  const out = { subject: '', html: '', text: '' };

  if (job.kind === 'booking_confirmed') {
    const shape = bookingInvoiceShape(b, pay);
    out.subject = `Booking confirmed ${b.booking_ref} - ${HOTEL.nameEn}`;
    out.text = [`Namaste ${contact.full_name || ''} ji, aapki booking confirm ho gayi hai.`, `Booking ID: ${b.booking_ref}`, `Room: ${b.room_name} x ${b.rooms_count}`, `Check-in: ${fmtD(b.check_in)} (${st.checkIn})`, `Check-out: ${fmtD(b.check_out)} (${st.checkOut})`, `Paid: ${inr(pay.amount_paise)} | Total: ${inr(b.total_paise)}`, `Invoice: ${shape.invoice_url}`, `Address: ${HOTEL.address}`, `Map: ${map}`, `Call: ${HOTEL.phones.join(', ')}`, '', ...refundLinesHi()].join('\n');
    out.html = shell({
      preheader: `Booking ${b.booking_ref} confirmed. ${inr(pay.amount_paise)} received.`,
      inner: `<div style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${C.maroon};">जय श्री राम 🙏 ${name} जी,</div>
<p style="margin:8px 0;">आपकी booking <b>confirm</b> हो गई है। आपका <b>${esc(inr(pay.amount_paise))}</b> का payment मिल गया है।</p>
${detailsCard(b, st, pay.amount_paise)}
<p style="margin:8px 0;font-size:13px;">📍 ${esc(HOTEL.address)}</p>
<div style="text-align:center;margin:10px 0;">${btn(shape.invoice_url, 'Invoice dekhein / Print')}${btn(map, 'Google Maps', false)}${btn(wa, 'WhatsApp', false)}</div>
<p style="margin:12px 0 4px;font-size:12px;color:${C.muted};"><b>Cancellation / Refund</b><br>${refundLinesHi().map(esc).join('<br>')}<br>Refund ${esc(policy().refundProcessingDays)} working days me original payment method me aata hai.</p>
<p style="margin:12px 0 4px;font-size:12px;color:${C.muted};">${esc(policy().idRequirementHi || '')}</p>
<div style="margin-top:18px;">${invoicePaper(shape)}</div>`,
    });
  } else if (job.kind === 'pre_arrival') {
    out.subject = `Kal aapka check-in hai - ${b.booking_ref}`;
    out.text = [`Namaste ${contact.full_name || ''} ji,`, `Kal (${fmtD(b.check_in)}) aapka check-in hai, time ${st.checkIn}.`, `Address: ${HOTEL.address}`, `Map: ${map}`, policy().idRequirementHi || '', `Helpline: ${HOTEL.helpline} / ${HOTEL.phones.join(', ')}`].join('\n');
    out.html = shell({
      preheader: `Kal check-in: ${b.room_name}`,
      inner: `<div style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${C.maroon};">जय श्री राम 🙏 ${name} जी,</div>
<p>कल <b>${esc(fmtD(b.check_in))}</b> को आपका check-in है (समय: <b>${esc(st.checkIn)}</b>)। हम आपका स्वागत करने के लिए तैयार हैं।</p>
${detailsCard(b, st, pay ? pay.amount_paise : 0)}
<p style="font-size:13px;">📍 ${esc(HOTEL.address)}<br>${esc(policy().idRequirementHi || '')}<br>किसी भी मदद के लिए: ${HOTEL.phones.map(esc).join(', ')} · ${esc(HOTEL.helpline)}</p>
<div style="text-align:center;">${btn(map, 'Raasta dekhein (Google Maps)')}${btn(wa, 'WhatsApp', false)}</div>`,
    });
  } else if (job.kind === 'thank_you') {
    const review = process.env.GOOGLE_REVIEW_URL;
    out.subject = `Dhanyavaad ${contact.full_name || ''} ji - ${HOTEL.nameEn}`;
    out.text = [`Namaste ${contact.full_name || ''} ji, hamare yahan thaharne ke liye dhanyavaad. Jai Shri Ram!`, review ? `Aapka review hamare liye bahut keemti hai: ${review}` : ''].join('\n');
    out.html = shell({
      preheader: 'Aapke thaharne ke liye dhanyavaad',
      inner: `<div style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${C.maroon};">धन्यवाद ${name} जी 🙏</div>
<p>हमारे यहाँ ठहरने के लिए आपका आभार। आशा है आपकी अयोध्या यात्रा मंगलमय रही।</p>
${review ? `<p>आपका अनुभव दूसरों की मदद करता है — कृपया एक छोटा review दें:</p><div style="text-align:center;">${btn(review, 'Google par review dein')}</div>` : ''}
<p style="font-size:13px;color:${C.muted};">Phir milenge. Jai Shri Ram! 🙏</p>`,
    });
  } else if (job.kind === 'festival') {
    const g = greeting || {};
    out.subject = g.title_hi || `Shubhkamnayein - ${HOTEL.nameEn}`;
    out.text = [g.message_hi || '', g.message_en || '', `Unsubscribe: ${unsub}`].filter(Boolean).join('\n\n');
    out.html = shell({
      preheader: g.title_hi || 'Shubhkamnayein',
      footerExtra: marketingFooter,
      inner: `<div style="font-family:${SERIF};font-size:22px;font-weight:bold;color:${C.maroon};text-align:center;">${esc(g.title_hi || '')}</div>
<p>${name} जी,</p><p style="white-space:pre-line;">${esc(g.message_hi || '')}</p>
${g.message_en ? `<p style="color:${C.muted};font-size:13px;white-space:pre-line;">${esc(g.message_en)}</p>` : ''}
<div style="text-align:center;margin-top:10px;">${btn(siteUrl(), 'Website dekhein', false)}</div>`,
    });
  } else if (job.kind === 'winback') {
    out.subject = `Phir se Ayodhya aayiye - ${HOTEL.nameEn}`;
    out.text = [`Namaste ${contact.full_name || ''} ji, ek baar phir Ayodhya Dham darshan ke liye hamare yahan padhariye.`, siteUrl(), `Unsubscribe: ${unsub}`].join('\n\n');
    out.html = shell({
      preheader: 'Ayodhya Dham me phir swagat hai',
      footerExtra: marketingFooter,
      inner: `<div style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${C.maroon};">जय श्री राम ${name} जी 🙏</div>
<p>आपके पिछले प्रवास को काफ़ी समय हो गया। अगली अयोध्या यात्रा पर हमें फिर सेवा का अवसर दें।</p>
<div style="text-align:center;">${btn(siteUrl(), 'Room dekhein aur book karein')}</div>`,
    });
  } else if (job.kind === 'refund_notice') {
    out.subject = `Refund process ho gaya - ${b.booking_ref}`;
    out.text = `Namaste ${contact.full_name || ''} ji, booking ${b.booking_ref} ka refund ${inr(pay?.refund_amount_paise || 0)} process ho gaya hai. Ye ${policy().refundProcessingDays} working days me aapke original payment method me aayega. Call: ${HOTEL.phones.join(', ')}`;
    out.html = shell({
      preheader: 'Aapka refund process ho gaya hai',
      inner: `<div style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${C.maroon};">नमस्ते ${name} जी,</div>
<p>Booking <b>${esc(b.booking_ref)}</b> का <b>${esc(inr(pay?.refund_amount_paise || 0))}</b> का refund process हो गया है। यह ${esc(policy().refundProcessingDays)} working days में आपके original payment method में आ जाएगा।</p>
<p style="font-size:13px;">मदद के लिए: ${HOTEL.phones.map(esc).join(', ')}</p>`,
    });
  } else if (job.kind === 'apology') {
    out.subject = `Maaf kijiye - booking ${b.booking_ref} confirm nahi ho saki`;
    out.text = `Namaste ${contact.full_name || ''} ji, payment ke baad room dobara available nahi mila, isliye booking ${b.booking_ref} confirm nahi ho saki. Aapka poora paisa refund kar diya gaya hai (${policy().refundProcessingDays} working days). Is takleef ke liye kshama. Call: ${HOTEL.phones.join(', ')}`;
    out.html = shell({
      preheader: 'Poora refund kiya ja raha hai',
      inner: `<div style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${C.maroon};">क्षमा कीजिए ${name} जी 🙏</div>
<p>आपके payment के बाद इन तारीख़ों के लिए room उपलब्ध नहीं रहा, इसलिए booking <b>${esc(b.booking_ref)}</b> confirm नहीं हो सकी। आपका <b>पूरा पैसा refund</b> किया जा रहा है (${esc(policy().refundProcessingDays)} working days)।</p>
<p>इस असुविधा के लिए हमें खेद है। दूसरी तारीख़ या room के लिए हमें call करें: ${HOTEL.phones.map(esc).join(', ')}</p>`,
    });
  } else {
    throw new Error(`Unknown email kind ${job.kind}`);
  }
  return out;
}

// ---------- queue ----------
export async function enqueueJob({ contactId, bookingId = null, kind, key, sendAt = new Date().toISOString(), marketing = false }) {
  await sb('email_jobs?on_conflict=dedupe_key', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body: { contact_id: contactId, booking_id: bookingId, kind, is_marketing: marketing, send_at: sendAt, dedupe_key: key },
  });
}

const BACKOFF_MIN = [5, 15, 60, 180, 360];
const MAX_ATTEMPTS = 5;

async function loadContext(job) {
  const contact = job.email_contacts;
  const booking = job.guest_bookings || null;
  let payment = null;
  if (booking) {
    const rows = await sb(`booking_payments?booking_id=eq.${booking.id}&status=in.(success,refunded)&select=*&order=paid_at.desc&limit=1`);
    payment = rows[0] || null;
  }
  let greeting = null;
  if (job.kind === 'festival') {
    const date = String(job.dedupe_key).split(':')[1];
    greeting = greetingCalendar().find((g) => g.date === date && g.active) || null;
  }
  return { contact, booking, payment, greeting, settings: await hotelSettings() };
}

// Returns {skip:'reason'} when the job must not be sent
function eligibility(job, ctx) {
  const { contact, booking, payment, greeting } = ctx;
  if (!contact) return { skip: 'no contact' };
  if (contact.email_status && contact.email_status !== 'ok') return { skip: `email ${contact.email_status}` };
  if (job.is_marketing) {
    if (contact.unsubscribed_at) return { skip: 'unsubscribed' };
    if (!contact.marketing_consent) return { skip: 'no consent' };
    if (!(contact.paid_bookings_count >= 1)) return { skip: 'no paid booking' };
    if (Date.now() - new Date(job.send_at).getTime() > 48 * 3600 * 1000) return { skip: 'stale' };
  }
  if (job.kind === 'festival' && !greeting) return { skip: 'greeting not active' };
  if (['booking_confirmed', 'pre_arrival', 'thank_you'].includes(job.kind)) {
    if (!booking || !payment) return { skip: 'no paid booking' };
    if (job.kind === 'booking_confirmed' && !['confirmed', 'completed'].includes(booking.status)) return { skip: `booking ${booking.status}` };
    if (job.kind !== 'booking_confirmed' && !['confirmed', 'completed'].includes(booking.status)) return { skip: `booking ${booking.status}` };
  }
  if (['refund_notice', 'apology'].includes(job.kind) && !booking) return { skip: 'no booking' };
  return null;
}

async function patchJob(id, body) {
  await sb(`email_jobs?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body });
}

async function processClaimed(job) {
  try {
    const ctx = await loadContext(job);
    const skip = eligibility(job, ctx);
    if (skip) {
      await patchJob(job.id, { status: 'skipped', last_error: skip.skip });
      return { id: job.id, result: 'skipped', reason: skip.skip };
    }
    const mail = renderEmail(job, ctx);
    const headers = job.is_marketing
      ? {
          'List-Unsubscribe': `<${siteUrl()}/api/unsubscribe?t=${q(ctx.contact.unsubscribe_token)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      : undefined;
    const sent = await sendMail({ to: ctx.contact.email, ...mail, headers });
    if (sent.ok) {
      await patchJob(job.id, { status: 'sent', sent_at: new Date().toISOString(), last_error: null });
      if (job.kind === 'booking_confirmed' && ctx.payment) {
        await sb(`booking_payments?id=eq.${ctx.payment.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { invoice_emailed_at: new Date().toISOString() } });
      }
      return { id: job.id, result: 'sent' };
    }
    throw new Error(sent.error || 'send failed');
  } catch (e) {
    const attempts = (job.attempts || 0) + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    await patchJob(job.id, {
      status: dead ? 'failed' : 'queued',
      attempts,
      last_error: String(e.message || e).slice(0, 300),
      send_at: dead ? job.send_at : new Date(Date.now() + BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60000).toISOString(),
    }).catch((x) => console.error('patchJob failed:', x.message));
    if (dead) await notifyAdmin(`Email job failed ${job.kind}`, { job: job.id, key: job.dedupe_key, error: String(e.message || e) });
    return { id: job.id, result: dead ? 'failed' : 'retry', error: String(e.message || e) };
  }
}

// Claim with a conditional UPDATE (queued -> sending ... returning): two runs can never take the same row.
export async function runJobs({ keys = null, limit = 40, throttleMs = 500, deadlineMs = 50000 } = {}) {
  const started = Date.now();
  if (!keys) {
    // rescue rows stuck in "sending" (crashed run)
    await sb(`email_jobs?status=eq.sending&claimed_at=lt.${q(new Date(Date.now() - 10 * 60000).toISOString())}`, {
      method: 'PATCH', prefer: 'return=minimal', body: { status: 'queued' },
    });
  }
  const due = keys
    ? `dedupe_key=in.(${keys.map(q).join(',')})&status=eq.queued`
    : `status=eq.queued&send_at=lte.${q(new Date().toISOString())}&order=send_at.asc&limit=${limit}`;
  const candidates = await sb(`email_jobs?${due}&select=id`);
  if (!candidates.length) return { claimed: 0, results: [] };
  const ids = candidates.map((c) => c.id).join(',');
  const won = await sb(`email_jobs?id=in.(${ids})&status=eq.queued&select=id`, {
    method: 'PATCH', prefer: 'return=representation', body: { status: 'sending', claimed_at: new Date().toISOString() },
  });
  if (!won.length) return { claimed: 0, results: [] };
  const claimed = await sb(`email_jobs?id=in.(${won.map((w) => w.id).join(',')})&select=*,email_contacts(*),guest_bookings(*)&order=send_at.asc`);
  const results = [];
  for (const job of claimed) {
    if (Date.now() - started > deadlineMs) {
      await patchJob(job.id, { status: 'queued' }); // give back what we did not reach
      continue;
    }
    results.push(await processClaimed(job));
    if (claimed.length > 1) await sleep(throttleMs);
  }
  return { claimed: claimed.length, results };
}
