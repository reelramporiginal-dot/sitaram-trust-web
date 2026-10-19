// api/post-facebook.js
// Roz ek poster + caption Facebook Page par post karta hai (data/postSchedule.json se).
// cron-job.org is URL ko roz hit karega:
//   https://shrisitaramsevatrust.com/api/post-facebook
//   Header:  Authorization: Bearer <CRON_SECRET>      (ya ?key=<CRON_SECRET>)
//
// Vercel Environment Variables (sab required, sirf last 3 optional):
//   FB_PAGE_ID            -> Facebook Page ka numeric ID
//   FB_PAGE_ACCESS_TOKEN  -> LONG-LIVED Page access token (pages_manage_posts + pages_read_engagement)
//   CRON_SECRET           -> koi bhi lamba random string
//   FB_START_DATE         -> optional, YYYY-MM-DD (IST). Is din Day 1 ka post jayega. Default: 2026-10-18
//   FB_GRAPH_VERSION      -> optional, default v24.0
//   (test ke liye: ?dry=1 se post nahi hota, sirf preview; ?force=1 se duplicate check skip)

import fs from 'node:fs';
import path from 'node:path';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDayNumber(date = new Date()) {
  return Math.floor((date.getTime() + IST_OFFSET_MS) / 86400000);
}

function dayNumberFromYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export default async function handler(req, res) {
  try {
    // ---------- Auth ----------
    const secret = process.env.CRON_SECRET;
    const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query?.key;
    if (!secret || given !== secret) {
      return res.status(401).json({ success: false, error: 'Unauthorized (CRON_SECRET galat ya missing)' });
    }

    const pageId = process.env.FB_PAGE_ID;
    const token = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!pageId || !token) {
      return res.status(500).json({ success: false, error: 'FB_PAGE_ID ya FB_PAGE_ACCESS_TOKEN set nahi hai' });
    }
    const ver = process.env.FB_GRAPH_VERSION || 'v24.0';

    // ---------- Aaj ka post chuno ----------
    const file = path.join(process.cwd(), 'data', 'postSchedule.json');
    const schedule = JSON.parse(fs.readFileSync(file, 'utf8'));
    const posts = schedule.posts || [];
    if (!posts.length) return res.status(500).json({ success: false, error: 'postSchedule.json me posts nahi hain' });

    const startDay = dayNumberFromYmd(process.env.FB_START_DATE || '2026-10-18');
    const diff = istDayNumber() - startDay;
    const index = ((diff % posts.length) + posts.length) % posts.length;
    const post = posts[index];

    const site = (schedule.website || 'https://shrisitaramsevatrust.com').replace(/\/$/, '');
    const imageUrl = post.image.startsWith('http') ? post.image : `${site}${post.image}`;
    const caption = [
      post.title,
      '',
      post.hook,
      post.points,
      '',
      schedule.footer,
      '',
      `🌐 ${schedule.website || site}`,
      '',
      schedule.hashtags,
    ]
      .filter((l) => l !== undefined && l !== null)
      .join('\n');

    if (req.query?.dry) {
      return res.status(200).json({ success: true, dryRun: true, day: post.day, imageUrl, caption });
    }

    // ---------- Duplicate check (aaj already post hua?) ----------
    if (!req.query?.force) {
      try {
        const r = await fetch(
          `https://graph.facebook.com/${ver}/${pageId}/posts?fields=message,created_time&limit=10&access_token=${token}`
        );
        const j = await r.json();
        const recent = (j.data || []).find(
          (p) => (p.message || '').startsWith(post.title) && Date.now() - new Date(p.created_time).getTime() < 20 * 3600 * 1000
        );
        if (recent) {
          return res.status(200).json({ success: true, skipped: true, reason: 'Aaj ka post already ho chuka hai', day: post.day });
        }
      } catch (e) {
        console.warn('Duplicate check fail hua, aage badh rahe hain:', e.message);
      }
    }

    // ---------- Facebook par photo post ----------
    const form = new URLSearchParams({ url: imageUrl, caption, access_token: token });
    const fb = await fetch(`https://graph.facebook.com/${ver}/${pageId}/photos`, { method: 'POST', body: form });
    const data = await fb.json();

    if (!fb.ok || data.error) {
      console.error('Facebook error:', data);
      return res.status(502).json({ success: false, day: post.day, imageUrl, facebookError: data.error || data });
    }

    return res.status(200).json({ success: true, day: post.day, imageUrl, facebook: data });
  } catch (error) {
    console.error('post-facebook crashed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
