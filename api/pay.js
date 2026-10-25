// api/pay.js  — payment page ke liye public API
//   GET  /api/pay?t=TOKEN                       -> link ki details
//   POST /api/pay {action:'start', token, email} -> email lekar Razorpay order banata hai
//   POST /api/pay {action:'verify', token, razorpay_order_id, razorpay_payment_id, razorpay_signature}
import { byToken, sb, rzp, gatewayReady, isEmail, httpError, verifyCheckoutSignature, finalizePayment, invoiceUrl, HOTEL } from './_pay-lib.js';

const publicView = (p) => ({
  status: p.status,
  expired: p.status === 'created' && new Date(p.expires_at).getTime() < Date.now(),
  guestName: p.guest_name,
  bookingId: p.booking_id || null,
  room: p.room || null,
  checkIn: p.check_in || null,
  guests: p.guests || null,
  description: p.description || null,
  amount: p.amount_paise,
  total: p.total_amount_paise || null,
  email: p.guest_email || '',
  phone: p.guest_phone || '',
  invoiceUrl: p.status === 'paid' ? invoiceUrl(p) : null,
  gatewayReady: gatewayReady(),
  hotel: { name: HOTEL.nameEn, phones: HOTEL.phones },
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const p = req.query?.t ? await byToken(String(req.query.t)) : null;
      if (!p) throw httpError(404, 'Payment link sahi nahi hai');
      return res.status(200).json({ success: true, ...publicView(p) });
    }
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed');

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const p = body.token ? await byToken(String(body.token)) : null;
    if (!p) throw httpError(404, 'Payment link sahi nahi hai');

    if (body.action === 'start') {
      if (p.status === 'paid') throw httpError(409, 'Ye payment pehle hi ho chuka hai');
      if (p.status !== 'created') throw httpError(410, 'Ye payment link band kar diya gaya hai');
      if (new Date(p.expires_at).getTime() < Date.now()) throw httpError(410, 'Ye payment link expire ho gaya hai, hotel se naya link maangein');
      const email = String(body.email || '').trim().toLowerCase();
      if (!isEmail(email)) throw httpError(400, 'Sahi email daalein (invoice isi par aayega)');

      let orderId = p.razorpay_order_id;
      if (!orderId) {
        const order = await rzp('/orders', {
          method: 'POST',
          body: { amount: p.amount_paise, currency: 'INR', receipt: `SST-${p.token.slice(0, 12)}`, notes: { booking_id: p.booking_id || '', guest: p.guest_name } },
        });
        orderId = order.id;
      }
      await sb(`payment_requests?id=eq.${p.id}&status=eq.created`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { guest_email: email, razorpay_order_id: orderId },
      });
      return res.status(200).json({
        success: true,
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId,
        amount: p.amount_paise,
        currency: 'INR',
        name: HOTEL.nameEn,
        description: p.description || `Booking ${p.booking_id || ''}`.trim(),
        prefill: { name: p.guest_name, email, contact: p.guest_phone || '' },
      });
    }

    if (body.action === 'verify') {
      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = body;
      if (p.status === 'paid') return res.status(200).json({ success: true, alreadyPaid: true, invoiceUrl: invoiceUrl(p) });
      if (!orderId || !paymentId || orderId !== p.razorpay_order_id) throw httpError(400, 'Order match nahi hua');
      if (!verifyCheckoutSignature(orderId, paymentId, sig)) throw httpError(400, 'Payment signature sahi nahi hai');

      let pay = await rzp(`/payments/${encodeURIComponent(paymentId)}`);
      if (pay.order_id !== orderId || pay.amount !== p.amount_paise) throw httpError(400, 'Payment amount/order match nahi hua');
      if (pay.status === 'authorized') pay = await rzp(`/payments/${encodeURIComponent(paymentId)}/capture`, { method: 'POST', body: { amount: p.amount_paise, currency: 'INR' } });
      if (pay.status !== 'captured') throw httpError(402, 'Payment abhi confirm nahi hua. Paise kate hon to chinta na karein, hum verify karke invoice bhej denge.');

      const { row, mail } = await finalizePayment(p, { paymentId, method: pay.method });
      return res.status(200).json({ success: true, invoiceUrl: invoiceUrl(row), emailed: Boolean(mail.ok), email: row.guest_email });
    }
    throw httpError(400, 'Unknown action');
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('pay failed:', e.message, e.details || '');
    return res.status(e.status || 500).json({ success: false, error: e.status && e.status < 500 ? e.message : e.message || 'Server error' });
  }
}
