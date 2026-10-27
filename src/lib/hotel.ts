// ROOT PATH: src/lib/hotel.ts
// Hotel constants + policy numbers shared by the booking modal and the policy pages.
// Refund tiers / consent wording live in data/hotelPolicy.json (the server emails read the same file).
import policy from '../../data/hotelPolicy.json'

// Online payment switch. Keep OFF (default) until the Cashfree walkthrough has passed.
// OFF: "Book & Pay" opens the old booking form and the enquiry goes to the admin exactly as before.
// Public switch: VITE_ONLINE_PAYMENTS=true (Vercel env, needs redeploy).
// Private test switch (only YOUR browser, visitors/ads traffic unaffected):
//   open  https://<site>/?testpay=1   -> real Book & Pay in this browser
//   open  https://<site>/?testpay=0   -> back to the old form
const TEST_KEY = 'sst-testpay'
export const isPublicPayments = () => import.meta.env.VITE_ONLINE_PAYMENTS === 'true'
export function onlinePaymentsEnabled(): boolean {
  if (isPublicPayments()) return true
  try {
    const v = new URLSearchParams(window.location.search).get('testpay')
    if (v === '1') localStorage.setItem(TEST_KEY, '1')
    if (v === '0') localStorage.removeItem(TEST_KEY)
    return localStorage.getItem(TEST_KEY) === '1'
  } catch {
    return false
  }
}
export const isTestModeOnly = () => onlinePaymentsEnabled() && !isPublicPayments()

export const HOTEL_NAME_EN = 'Shri Sitaram Seva Trust'
export const HOTEL_NAME_HI = 'श्री सीताराम सेवा ट्रस्ट'
export const HOTEL_ADDRESS = 'Luvkushnagar, Ramghat, Ayodhya Dham, Uttar Pradesh 224123'
export const HOTEL_PHONES = ['9918310009', '8303333309']
export const HOTEL_HELPLINE = '05278-424511'
export const HOTEL_EMAIL = 'shrisitaram6151@gmail.com'

export const CONSENT_TEXT: string = policy.marketingConsentText
export const REFUND_PROCESSING_DAYS: string = policy.refundProcessingDays
export const ID_REQUIREMENT: string = policy.idRequirementHi

export const inr = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`

export function refundLines(): string[] {
  const tiers = [...policy.refundTiers].sort((a, b) => b.daysBeforeCheckInMin - a.daysBeforeCheckInMin)
  return tiers.map((t, i) => {
    const range =
      i === 0
        ? `Check-in se ${t.daysBeforeCheckInMin} ya usse zyada din pehle`
        : `Check-in se ${t.daysBeforeCheckInMin} se ${tiers[i - 1].daysBeforeCheckInMin - 1} din pehle`
    return t.refundPercent === 0 ? `${range}: refund nahi` : `${range}: ${t.refundPercent}% refund`
  })
}
