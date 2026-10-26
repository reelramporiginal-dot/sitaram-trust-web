// ROOT PATH: src/pages/Policy.tsx
// Privacy / Terms / Refund / Contact pages (payment gateways ask for these during KYC).
// Business wording is a sensible default: owner (and CA / lawyer) must review before going live.
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { HOTEL_ADDRESS, HOTEL_EMAIL, HOTEL_HELPLINE, HOTEL_NAME_EN, HOTEL_NAME_HI, HOTEL_PHONES, ID_REQUIREMENT, REFUND_PROCESSING_DAYS, refundLines } from '../lib/hotel'

type Kind = 'privacy' | 'terms' | 'refund' | 'contact'

const updated = '26 October 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="font-serif text-xl font-bold text-[#4b0718]">{title}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-7 text-[#3b2a30]">{children}</div>
    </section>
  )
}
const List = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1 pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>

function Body({ kind }: { kind: Kind }) {
  if (kind === 'privacy')
    return (
      <>
        <Section title="Hum kaun hain">
          <p>{HOTEL_NAME_EN} ({HOTEL_NAME_HI}), {HOTEL_ADDRESS}. Ye policy batati hai ki online booking ke samay hum aapki kaun si jaankari lete hain aur kyun.</p>
        </Section>
        <Section title="Hum kya jaankari lete hain">
          <List items={['Naam, mobile number aur email (booking, confirmation aur invoice ke liye)', 'Booking ki details: room, tareekh, guests ki sankhya', 'Payment ka status aur transaction ID. Card / UPI / bank ki details hum kabhi save nahi karte; wo seedhe payment gateway (Cashfree) par process hoti hain', 'Aapki marzi hone par (tick karne par) offers aur festival wishes bhejne ki permission']} />
        </Section>
        <Section title="Hum iska upyog kaise karte hain">
          <List items={['Booking confirm karna, invoice aur zaroori jaankari bhejna', 'Check-in se pehle yaad dilana aur ruknay ke baad dhanyavaad / review request bhejna', 'Sirf aapki permission ho tabhi offers aur festival wishes bhejna. Aap kisi bhi mail ke neeche diye link se kabhi bhi unsubscribe kar sakte hain', 'Dhokhadhadi aur galat upyog se bachav']} />
          <p>Hum aapki jaankari bechte nahi hain. Ye sirf in sevaon ke liye saajha hoti hai: payment gateway (Cashfree), email service (Resend) aur hosting / database (Vercel, Supabase), jo humare liye kaam karti hain.</p>
        </Section>
        <Section title="Aapke adhikar">
          <p>Aap apni jaankari dekhne, sudharne ya hatane ki maang kar sakte hain, aur marketing mail ki permission kabhi bhi wapas le sakte hain. Likhiye: {HOTEL_EMAIL}. Zaroori lekhe (jaise invoice) kanoon ke anusar kuch samay tak rakhne padte hain.</p>
        </Section>
        <Section title="Surakshit rakhna">
          <p>Humare sabhi page HTTPS par hain aur payment ki jaankari tak humari pahunch nahi hoti. Phir bhi koi bhi internet system 100% surakshit nahi hota.</p>
        </Section>
      </>
    )
  if (kind === 'terms')
    return (
      <>
        <Section title="Booking">
          <List items={['Booking tabhi confirm maani jaati hai jab payment safal ho jaye aur aapko confirmation email / page par Booking ID mil jaye.', 'Online booking ke samay dikhayi gayi keemat (tax sahit) hi lagu hogi. Keemat server par tay hoti hai.', 'Payment karte hi room kuch der (20 minute) ke liye aapke naam par roka jata hai. Payment poora na hone par room chhod diya jata hai.', 'Advance chunne par baaki raashi check-in ke samay hotel par deni hogi.']} />
        </Section>
        <Section title="Check-in / Check-out">
          <p>Check-in aur check-out ka samay website par likha hai. {ID_REQUIREMENT} Samay se pehle check-in availability par nirbhar hai.</p>
        </Section>
        <Section title="Guests ke niyam">
          <List items={['Room me guests ki sankhya booking ke anusar hi honi chahiye.', 'Hotel ke andar dharmik aur saamajik maryada ka paalan karein.', 'Room ya samaan ko nuksaan hone par uski bharpai guest ko karni hogi.']} />
        </Section>
        <Section title="Cancellation aur refund">
          <p>Dekhein humari <Link to="/refund-policy" className="font-semibold underline">Refund Policy</Link>.</p>
        </Section>
        <Section title="Hamari zimmedari">
          <p>Prakritik aapda, sarkari aadesh ya anya niyantran se bahar ki sthiti me agar room dena sambhav na ho to hum aapko poora paisa wapas karenge ya doosri tareekh dene ki koshish karenge.</p>
        </Section>
        <Section title="Vivaad">
          <p>Koi bhi vivaad Ayodhya (Uttar Pradesh), Bharat ke nyayalayon ke adhikar kshetra me aayega.</p>
        </Section>
      </>
    )
  if (kind === 'refund')
    return (
      <>
        <Section title="Cancellation aur refund">
          <p>Refund aapke dwara online diye gaye paise par (advance ya poora) check-in se kitne din pehle cancel karte hain, uske hisaab se milta hai:</p>
          <List items={refundLines()} />
          <p>No-show (bina batae na aana) par refund nahi hoga.</p>
        </Section>
        <Section title="Cancel kaise karein">
          <p>Booking ID ke saath call karein: {HOTEL_PHONES.join(' / ')} ya email: {HOTEL_EMAIL}.</p>
        </Section>
        <Section title="Refund kab aur kaise milega">
          <p>Manjoor hone par refund {REFUND_PROCESSING_DAYS} working days me usi payment method me (UPI / card / net banking) wapas aata hai jisse payment kiya tha. Bank ke hisaab se thoda samay zyada lag sakta hai.</p>
        </Section>
        <Section title="Hamari taraf se cancel hone par">
          <p>Agar hum aapki booking confirm nahi kar paate (jaise payment ke baad room uplabdh na ho), to aapko poora paisa wapas kiya jata hai aur email se suchit kiya jata hai.</p>
        </Section>
        <Section title="Double payment / kata hua paisa">
          <p>Agar paise kat gaye par booking confirm nahi hui, to chinta na karein. Hamara system apne aap check karta hai; confirm na hone par paisa wapas kiya jata hai. Phir bhi madad ke liye call karein: {HOTEL_PHONES[0]}.</p>
        </Section>
      </>
    )
  return (
    <>
      <Section title="Sampark">
        <p><b>{HOTEL_NAME_EN}</b> ({HOTEL_NAME_HI})</p>
        <p>Pata: {HOTEL_ADDRESS}</p>
        <p>Mobile: {HOTEL_PHONES.map((p) => <a key={p} href={`tel:${p}`} className="mr-3 font-semibold underline">{p}</a>)}</p>
        <p>Helpline: <a href={`tel:${HOTEL_HELPLINE}`} className="font-semibold underline">{HOTEL_HELPLINE}</a></p>
        <p>Email: <a href={`mailto:${HOTEL_EMAIL}`} className="font-semibold underline">{HOTEL_EMAIL}</a></p>
      </Section>
      <Section title="Samay">
        <p>Phone aur WhatsApp par madad subah se raat tak uplabdh hai.</p>
      </Section>
    </>
  )
}

const TITLES: Record<Kind, string> = { privacy: 'Privacy Policy', terms: 'Terms & Conditions', refund: 'Cancellation & Refund Policy', contact: 'Contact Us' }

export function Policy({ kind }: { kind: Kind }) {
  useEffect(() => {
    document.title = `${TITLES[kind]} | ${HOTEL_NAME_EN}`
    window.scrollTo(0, 0)
  }, [kind])
  return (
    <main className="min-h-screen bg-[#fffaf1] px-4 py-10">
      <article className="mx-auto max-w-2xl rounded-[1.75rem] border border-[#d7a84f]/25 bg-white p-6 shadow-xl sm:p-10">
        <Link to="/" className="text-sm font-bold text-[#b7812d]">← {HOTEL_NAME_EN}</Link>
        <h1 className="mt-3 font-serif text-3xl font-bold text-[#4b0718]">{TITLES[kind]}</h1>
        {kind !== 'contact' && <p className="mt-1 text-xs text-[#7a6a70]">Last updated: {updated}</p>}
        <Body kind={kind} />
        <nav className="mt-10 flex flex-wrap gap-4 border-t border-[#d7a84f]/25 pt-5 text-sm font-semibold text-[#4b0718]">
          <Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/refund-policy">Refund Policy</Link><Link to="/contact">Contact</Link>
        </nav>
      </article>
    </main>
  )
}
