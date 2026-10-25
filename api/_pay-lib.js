// api/_pay-lib.js  (underscore se shuru: Vercel me route nahi banta)
// Payments: Supabase REST + Razorpay + Resend + invoice template
import crypto from 'node:crypto';

export const HOTEL = {
  nameEn: 'Shri Sitaram Seva Trust',
  nameHi: 'श्री सीताराम सेवा ट्रस्ट',
  address: 'Luvkushnagar, Ramghat, Ayodhya Dham, Uttar Pradesh 224123',
  phones: ['9918310009', '8303333309'],
  helpline: '05278-424511',
};

export const siteUrl = () => (process.env.SITE_URL || 'https://shrisitaramsevatrust.com').replace(/\/$/, '');
export const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const inr = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(
    paise / 100
  );
export const httpError = (status, message, details) => Object.assign(new Error(message), { status, details });
export const newToken = () => crypto.randomBytes(16).toString('base64url');
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const safeEq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ---------- Supabase (service role) ----------
const supaBase = () => (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');

export async function sb(pathAndQuery, { method = 'GET', body, prefer } = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaBase() || !key) throw httpError(503, 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY Vercel me set nahi hain');
  const r = await fetch(`${supaBase()}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) throw httpError(500, (data && data.message) || `Supabase error ${r.status}`, data);
  return data;
}

export const byToken = async (t) => (await sb(`payment_requests?token=eq.${encodeURIComponent(t)}&select=*`))[0];
export const byId = async (id) => (await sb(`payment_requests?id=eq.${encodeURIComponent(id)}&select=*`))[0];

// ---------- Admin check (Supabase Auth token) ----------
export async function requireAdmin(req) {
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) throw httpError(401, 'Login zaroori hai');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const r = await fetch(`${supaBase()}/auth/v1/user`, { headers: { apikey: anon || '', Authorization: `Bearer ${jwt}` } });
  if (!r.ok) throw httpError(401, 'Session expire ho gaya, dobara login karo');
  const user = await r.json();
  const allow = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(String(user.email || '').toLowerCase())) throw httpError(403, 'Is account ko permission nahi hai');
  return user;
}

// ---------- Razorpay ----------
export const gatewayReady = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

export async function rzp(path, { method = 'GET', body } = {}) {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw httpError(503, 'Payment gateway abhi set nahi hai (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
  const r = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw httpError(502, j?.error?.description || `Razorpay error ${r.status}`, j);
  return j;
}

export function verifyCheckoutSignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return Boolean(signature) && safeEq(expected, signature);
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  if (!secret || !signature) return false;
  return safeEq(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'), signature);
}

// ---------- Email (Resend) ----------
export async function sendMail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY set nahi hai' };
  const from = process.env.MAIL_FROM || `${HOTEL.nameEn} <onboarding@resend.dev>`;
  const reply = process.env.BOOKING_NOTIFY_EMAIL || 'shrisitaram6151@gmail.com';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text, reply_to: reply }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: j.id } : { ok: false, error: j.message || `Resend error ${r.status}` };
}

// ---------- Invoice ----------
const METHOD = { upi: 'UPI', card: 'Card', netbanking: 'Net Banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay Later' };
export const methodLabel = (m) => METHOD[m] || m || '-';
const fmtDate = (iso) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const C = { maroon: '#4b0718', deep: '#2a0611', gold: '#d7a84f', light: '#f5d891', cream: '#fbf4ea', text: '#3b2a30', muted: '#7a6a70', line: '#eadfce', green: '#1f7a3d', mint: '#eaf6ee' };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "'Noto Sans Devanagari','Mangal',Arial,Helvetica,sans-serif";
export const logoUrl = () => process.env.INVOICE_LOGO_URL || `${siteUrl()}/images/trust-logo.png`;

// Indian numbering: 1,50,050 -> "One Lakh Fifty Thousand and Fifty"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const under100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const under1000 = (n) => `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${n % 100 ? under100(n % 100) : ''}`;
function wordsIN(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(`${under100(crore)} Crore`);
  if (lakh) parts.push(`${under100(lakh)} Lakh`);
  if (thousand) parts.push(`${under100(thousand)} Thousand`);
  if (rest) parts.push(under1000(rest));
  return parts.join(' ');
}
export function amountInWords(paise) {
  const rupees = Math.floor(paise / 100);
  const ps = paise % 100;
  return `Rupees ${wordsIN(rupees)}${ps ? ` and ${under100(ps)} Paise` : ''} Only`;
}

const label = (t) => `<div style="font-family:${SANS};font-size:10px;letter-spacing:2px;color:${C.gold};font-weight:bold;text-transform:uppercase;margin-bottom:6px;">${esc(t)}</div>`;
const kv = (k, v, strong = true) =>
  v ? `<tr><td style="padding:3px 12px 3px 0;font-family:${SANS};font-size:12px;color:${C.muted};white-space:nowrap;">${esc(k)}</td><td style="padding:3px 0;font-family:${SANS};font-size:13px;color:${C.text};${strong ? 'font-weight:bold;' : ''}">${esc(v)}</td></tr>` : '';

// Poora invoice "kagaz" (email aur print page dono me wahi)
function invoicePaper(p) {
  const balance = p.total_amount_paise && p.total_amount_paise > p.amount_paise ? p.total_amount_paise - p.amount_paise : 0;
  const main = p.description || p.room || 'Booking payment';
  const sub = [p.description ? p.room : '', p.check_in ? `Check-in: ${p.check_in}` : '', p.guests ? `Guests: ${p.guests}` : ''].filter(Boolean).join('  ·  ');
  const gst = process.env.INVOICE_GSTIN ? `GSTIN: ${esc(process.env.INVOICE_GSTIN)}<br>` : '';
  const note = process.env.INVOICE_NOTE ? `${esc(process.env.INVOICE_NOTE)}<br>` : '';

  return `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:14px;overflow:hidden;">
  <tr><td style="height:6px;line-height:6px;font-size:0;background-color:${C.gold};background-image:linear-gradient(90deg,#b7812d,#f5d891,#b7812d);">&nbsp;</td></tr>

  <tr><td style="background:${C.deep};padding:22px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="106" valign="middle"><img src="${esc(logoUrl())}" width="94" height="94" alt="${esc(HOTEL.nameEn)}" style="display:block;width:94px;height:94px;border-radius:50%;border:2px solid ${C.gold};background:#ffffff;"></td>
      <td valign="middle" style="padding-left:6px;">
        <div style="font-family:${SERIF};font-size:21px;line-height:1.25;font-weight:bold;color:#ffffff;">${esc(HOTEL.nameHi)}</div>
        <div style="font-family:${SANS};font-size:11px;letter-spacing:2.5px;color:${C.light};margin-top:4px;text-transform:uppercase;">${esc(HOTEL.nameEn)}</div>
        <div style="font-family:${SANS};font-size:11px;color:#cdb9bf;margin-top:6px;line-height:1.5;">Ramghat, Ayodhya Dham · ${esc(HOTEL.phones[0])}</div>
      </td>
      <td valign="middle" align="right">
        <div style="font-family:${SANS};font-size:10px;letter-spacing:3px;color:${C.gold};">${process.env.INVOICE_GSTIN ? 'TAX INVOICE' : 'INVOICE / RECEIPT'}</div>
        <div style="font-family:${SERIF};font-size:15px;color:#ffffff;margin-top:6px;white-space:nowrap;">${esc(p.invoice_no)}</div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="background:${C.mint};border-bottom:1px solid #cfe8d6;padding:11px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${SANS};font-size:13px;color:${C.green};font-weight:bold;">&#10004; PAID &nbsp;<span style="font-weight:normal;color:#3d6b4a;">Payment received${p.paid_at ? ` on ${esc(fmtDate(p.paid_at))}` : ''}</span></td>
      <td align="right" style="font-family:${SERIF};font-size:18px;font-weight:bold;color:${C.green};white-space:nowrap;">${esc(inr(p.amount_paise))}</td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:24px 26px 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="50%" valign="top" style="padding-right:10px;">
        ${label('Billed To')}
        <div style="font-family:${SERIF};font-size:17px;font-weight:bold;color:${C.maroon};margin-bottom:4px;">${esc(p.guest_name)}</div>
        <table role="presentation" cellpadding="0" cellspacing="0">${kv('Phone', p.guest_phone, false)}${kv('Email', p.guest_email, false)}</table>
      </td>
      <td width="50%" valign="top" style="padding-left:10px;border-left:1px solid ${C.line};">
        ${label('Invoice Details')}
        <table role="presentation" cellpadding="0" cellspacing="0">${kv('Invoice No.', p.invoice_no)}${kv('Date', p.paid_at ? fmtDate(p.paid_at) : '')}${kv('Booking ID', p.booking_id)}</table>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:14px 26px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr style="background:${C.maroon};">
        <td style="padding:10px 14px;font-family:${SANS};font-size:11px;letter-spacing:2px;color:${C.light};font-weight:bold;">DESCRIPTION</td>
        <td align="right" style="padding:10px 14px;font-family:${SANS};font-size:11px;letter-spacing:2px;color:${C.light};font-weight:bold;">AMOUNT</td>
      </tr>
      <tr>
        <td style="padding:14px;border-bottom:1px solid ${C.line};font-family:${SANS};">
          <div style="font-size:14px;font-weight:bold;color:${C.text};">${esc(main)}</div>
          ${sub ? `<div style="font-size:12px;color:${C.muted};margin-top:4px;line-height:1.5;">${esc(sub)}</div>` : ''}
        </td>
        <td align="right" valign="top" style="padding:14px;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:14px;font-weight:bold;color:${C.text};white-space:nowrap;">${esc(inr(p.amount_paise))}</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:6px 26px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="top" width="52%" style="padding:10px 14px 0 0;font-family:${SANS};font-size:11px;color:${C.muted};line-height:1.6;"><b style="color:${C.text};">Amount in words</b><br>${esc(amountInWords(p.amount_paise))}</td>
      <td valign="top" width="48%">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${SANS};font-size:13px;">
          ${p.total_amount_paise ? `<tr><td style="padding:6px 0;color:${C.muted};">Total booking amount</td><td align="right" style="padding:6px 0;color:${C.text};">${esc(inr(p.total_amount_paise))}</td></tr>` : ''}
          <tr><td style="padding:10px 12px;background:${C.cream};border-top:2px solid ${C.maroon};font-weight:bold;color:${C.maroon};">Amount Paid</td><td align="right" style="padding:10px 12px;background:${C.cream};border-top:2px solid ${C.maroon};font-family:${SERIF};font-size:18px;font-weight:bold;color:${C.maroon};white-space:nowrap;">${esc(inr(p.amount_paise))}</td></tr>
          ${balance ? `<tr><td style="padding:8px 0;color:${C.muted};">Balance payable at hotel</td><td align="right" style="padding:8px 0;font-weight:bold;color:${C.text};">${esc(inr(balance))}</td></tr>` : ''}
        </table>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:14px 26px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};border:1px solid ${C.line};border-radius:10px;"><tr>
      <td valign="middle" style="padding:14px 16px;">
        ${label('Payment Details')}
        <table role="presentation" cellpadding="0" cellspacing="0">${kv('Method', methodLabel(p.payment_method))}${kv('Payment ID', p.razorpay_payment_id)}${kv('Reference', p.payment_reference)}</table>
      </td>
      <td width="120" align="center" valign="middle" style="padding:14px 16px;"><div style="display:inline-block;border:2px solid ${C.green};color:${C.green};font-family:${SANS};font-weight:bold;font-size:18px;letter-spacing:4px;padding:6px 14px;border-radius:8px;transform:rotate(-6deg);">PAID</div></td>
    </tr></table>
  </td></tr>

  <tr><td align="center" style="padding:18px 26px 22px;font-family:${SANS};">
    <div style="font-family:${SERIF};font-size:16px;color:${C.maroon};font-weight:bold;">धन्यवाद! जय श्री राम 🙏</div>
    <div style="font-size:12px;color:${C.muted};margin-top:4px;line-height:1.6;">आपकी अयोध्या यात्रा मंगलमय हो। किसी भी जानकारी के लिए संपर्क करें।</div>
  </td></tr>

  <tr><td style="background:${C.deep};padding:16px 26px;text-align:center;font-family:${SANS};font-size:11px;line-height:1.8;color:#cdb9bf;">
    ${gst}${note}
    📍 ${esc(HOTEL.address)}<br>
    📞 ${HOTEL.phones.map(esc).join(' · ')} &nbsp;|&nbsp; ☎ ${esc(HOTEL.helpline)}<br>
    <a href="${esc(siteUrl())}" style="color:${C.light};text-decoration:none;">${esc(siteUrl().replace(/^https?:\/\//, ''))}</a><br>
    <span style="color:#8d7a82;">This is a computer-generated invoice and does not require a signature.</span>
  </td></tr>
</table>`;
}

export const invoiceUrl = (p) => `${siteUrl()}/api/pay-invoice?t=${encodeURIComponent(p.token)}`;

export function invoiceEmail(p) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${esc(p.invoice_no)}</title></head>
<body style="margin:0;padding:0;background:#f1e8dc;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Payment received ${esc(inr(p.amount_paise))}. Invoice ${esc(p.invoice_no)} - ${esc(HOTEL.nameEn)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;"><tr><td style="padding:0 4px 14px;font-family:${SANS};font-size:15px;line-height:1.7;color:${C.text};">
    नमस्ते <b>${esc(p.guest_name)}</b> जी, आपका <b>${esc(inr(p.amount_paise))}</b> का payment मिल गया है। आपकी booking के लिए धन्यवाद। आपका invoice नीचे है।
  </td></tr></table>
  ${invoicePaper(p)}
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;"><tr><td align="center" style="padding:20px 0 6px;">
    <a href="${esc(invoiceUrl(p))}" style="display:inline-block;background:${C.maroon};color:${C.light};font-family:${SANS};font-weight:bold;font-size:14px;text-decoration:none;padding:13px 30px;border-radius:999px;border:1px solid ${C.gold};">View / Print / Save as PDF</a>
  </td></tr></table>
</td></tr></table></body></html>`;
  const text = [
    `${HOTEL.nameEn} - Payment Received`,
    `Invoice: ${p.invoice_no}`,
    `Booking: ${p.booking_id || '-'}`,
    `Name: ${p.guest_name}`,
    `Amount paid: ${inr(p.amount_paise)}`,
    `Payment ID: ${p.razorpay_payment_id || p.payment_reference || '-'}`,
    `Invoice link: ${invoiceUrl(p)}`,
    `Call: ${HOTEL.phones.join(', ')}`,
  ].join('\n');
  return { html, text, subject: `Payment received ${inr(p.amount_paise)} - Invoice ${p.invoice_no} | ${HOTEL.nameEn}` };
}

export function invoicePage(p) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Invoice ${esc(p.invoice_no)} - ${esc(HOTEL.nameEn)}</title>
<style>body{margin:0;background:#f1e8dc}.wrap{max-width:640px;margin:24px auto;padding:0 12px}.btn{display:inline-block;background:${C.gold};color:${C.maroon};font-family:${SANS};font-weight:700;border:0;border-radius:999px;padding:12px 30px;font-size:15px;cursor:pointer}@page{size:A4;margin:12mm}@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.wrap{margin:0;max-width:none;padding:0}.noprint{display:none}}</style></head>
<body><div class="wrap">${invoicePaper(p)}<p class="noprint" style="text-align:center;margin:22px 0 0;"><button class="btn" onclick="window.print()">Print / Save as PDF</button></p></div></body></html>`;
}

export function adminAlertEmail(p) {
  const html = `<p>💰 <b>Payment received ${esc(inr(p.amount_paise))}</b></p><p>${esc(p.guest_name)} · ${esc(p.guest_phone || '')} · ${esc(p.guest_email || '')}<br>Booking: ${esc(p.booking_id || '-')} · Room: ${esc(p.room || '-')}<br>Invoice: ${esc(p.invoice_no)} · Method: ${esc(methodLabel(p.payment_method))}<br>Payment ID: ${esc(p.razorpay_payment_id || p.payment_reference || '-')}</p><p><a href="${esc(invoiceUrl(p))}">Open invoice</a></p>`;
  return { html, text: `Payment received ${inr(p.amount_paise)} from ${p.guest_name} (${p.invoice_no})`, subject: `💰 Payment ${inr(p.amount_paise)} - ${p.guest_name} (${p.invoice_no})` };
}

// ---------- Mark paid + invoice (idempotent) ----------
const financialYear = (d = new Date()) => {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
};

export async function emailInvoice(p, { force = false } = {}) {
  if (!p.guest_email) return { ok: false, error: 'Guest ka email nahi hai' };
  if (!force) {
    const claim = await sb(`payment_requests?id=eq.${p.id}&invoice_emailed_at=is.null`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { invoice_emailed_at: new Date().toISOString() },
    });
    if (!claim.length) return { ok: true, skipped: true }; // koi aur pehle hi bhej raha/chuka hai
  }
  const guestMail = invoiceEmail(p);
  const sent = await sendMail({ to: p.guest_email, ...guestMail });
  if (!sent.ok) {
    await sb(`payment_requests?id=eq.${p.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { invoice_emailed_at: null } });
    return sent;
  }
  if (force) await sb(`payment_requests?id=eq.${p.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { invoice_emailed_at: new Date().toISOString() } });
  const admin = process.env.BOOKING_NOTIFY_EMAIL || 'shrisitaram6151@gmail.com';
  if (!force) await sendMail({ to: admin, ...adminAlertEmail(p) });
  return sent;
}

export async function finalizePayment(row, { paymentId = null, method = null, reference = null } = {}) {
  const won = await sb(`payment_requests?id=eq.${row.id}&status=eq.created`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { status: 'paid', razorpay_payment_id: paymentId, payment_method: method, payment_reference: reference, paid_at: new Date().toISOString() },
  });
  let cur = won[0] || (await byId(row.id));
  if (!cur || cur.status !== 'paid') throw httpError(409, 'Ye payment request ab active nahi hai');
  if (!won.length && !cur.invoice_no) {
    // doosra process (browser/webhook) abhi invoice number bana raha hai, thoda ruko taaki number skip na ho
    await new Promise((r) => setTimeout(r, 1200));
    cur = await byId(row.id);
  }
  if (!cur.invoice_no) {
    const n = await sb('rpc/next_invoice_no', { method: 'POST', body: {} });
    const invoiceNo = `SST/${financialYear(new Date(cur.paid_at))}/${n}`;
    const upd = await sb(`payment_requests?id=eq.${cur.id}&invoice_no=is.null`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { invoice_no: invoiceNo },
    });
    cur = upd[0] || (await byId(cur.id));
  }
  const mail = await emailInvoice(cur);
  return { row: (await byId(cur.id)) || cur, mail };
}
