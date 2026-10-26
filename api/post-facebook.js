// api/post-facebook.js
// Roz ek poster + caption Facebook Page AUR Instagram par post karta hai (data/postSchedule.json se).
// cron-job.org is URL ko roz ek baar hit karega:
//   https://shrisitaramsevatrust.com/api/post-facebook
//   Header:  Authorization: Bearer <CRON_SECRET>      (?key= ab band hai)
//
// Vercel Environment Variables:
//   CRON_SECRET           (required) koi bhi lamba random string
//   FB_PAGE_ID            (required) Facebook Page ka numeric ID
//   FB_PAGE_ACCESS_TOKEN  (required) Page access token (pages_manage_posts + instagram_content_publish)
//   IG_USER_ID            (optional) Instagram account ID. Na ho to Page se juda Instagram khud dhoondh leta hai
//   IG_ENABLED            (optional) "false" likhne par Instagram band
//   FB_START_DATE         (optional) YYYY-MM-DD (IST), Day 1 ki date. Default 2026-10-18
//   FB_GRAPH_VERSION      (optional) default v24.0
//
// Test: ?dry=1 (sirf preview, post nahi) | ?force=1 (duplicate check skip)

import fs from 'node:fs';
import { safeEq } from './_pay-lib.js';
import path from 'node:path';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const istDayNumber = (date = new Date()) => Math.floor((date.getTime() + IST_OFFSET_MS) / 86400000);
const dayNumberFromYmd = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

async function graph(url, body) {
  const r = await fetch(url, body ? { method: 'POST', body: new URLSearchParams(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !j.error, j };
}

const isRecent = (iso) => Date.now() - new Date(iso).getTime() < 20 * 3600 * 1000;

// Agar Vercel me galti se user token ho, to usse Page ka token nikaal leta hai (Page token ho to wahi rehta hai)
async function resolvePageToken({ ver, pageId, token }) {
  try {
    const r = await graph(`https://graph.facebook.com/${ver}/${pageId}?fields=access_token&access_token=${token}`);
    if (r.ok && r.j.access_token) return r.j.access_token;
  } catch (e) {
    console.warn('Page token resolve fail, original token use hoga:', e.message);
  }
  return token;
}

// ---------------- Facebook ----------------
async function postToFacebook({ ver, pageId, token, post, imageUrl, caption, force }) {
  if (!force) {
    try {
      const r = await graph(`https://graph.facebook.com/${ver}/${pageId}/posts?fields=message,created_time&limit=10&access_token=${token}`);
      const dup = (r.j.data || []).find((p) => (p.message || '').startsWith(post.title) && isRecent(p.created_time));
      if (dup) return { ok: true, skipped: true, reason: 'Aaj ka Facebook post already ho chuka hai' };
    } catch (e) {
      console.warn('FB duplicate check fail:', e.message);
    }
  }
  const r = await graph(`https://graph.facebook.com/${ver}/${pageId}/photos`, { url: imageUrl, caption, access_token: token });
  if (!r.ok) {
    const code = r.j.error?.code;
    const hint =
      code === 200
        ? 'Token me pages_manage_posts nahi hai ya ye Page token nahi hai. debug_token se type aur scopes check karo.'
        : code === 190
          ? 'Token invalid/expire. Naya Page token banake Vercel me daalo.'
          : undefined;
    return { ok: false, error: r.j.error || r.j, hint };
  }
  return { ok: true, id: r.j.post_id || r.j.id };
}

// ---------------- Instagram ----------------
async function postToInstagram({ ver, pageId, token, post, imageUrl, caption, force }) {
  if (process.env.IG_ENABLED === 'false') return { ok: true, skipped: true, reason: 'IG_ENABLED=false' };

  let igId = process.env.IG_USER_ID;
  if (!igId) {
    const r = await graph(`https://graph.facebook.com/${ver}/${pageId}?fields=instagram_business_account&access_token=${token}`);
    igId = r.j.instagram_business_account?.id;
    if (!igId) {
      return {
        ok: true,
        skipped: true,
        reason: 'Is Facebook Page se koi Instagram Business/Creator account juda nahi hai (ya token me permission nahi)',
        detail: r.j.error || undefined,
      };
    }
  }

  let username;
  try {
    const u = await graph(`https://graph.facebook.com/${ver}/${igId}?fields=username&access_token=${token}`);
    username = u.j.username;
  } catch (e) {
    /* sirf info ke liye */
  }

  if (!force) {
    try {
      const r = await graph(`https://graph.facebook.com/${ver}/${igId}/media?fields=caption,timestamp,permalink&limit=10&access_token=${token}`);
      const dup = (r.j.data || []).find((m) => (m.caption || '').startsWith(post.title) && isRecent(m.timestamp));
      if (dup) {
        return { ok: true, skipped: true, reason: 'Aaj ka Instagram post already ho chuka hai', username, permalink: dup.permalink, postedAt: dup.timestamp };
      }
    } catch (e) {
      console.warn('IG duplicate check fail:', e.message);
    }
  }

  // 1) media container
  const c = await graph(`https://graph.facebook.com/${ver}/${igId}/media`, {
    image_url: imageUrl,
    caption: caption.slice(0, 2200),
    access_token: token,
  });
  if (!c.ok) return { ok: false, step: 'create_container', error: c.j.error || c.j };

  // 2) container ready hone ka intezaar (error aaye to turant bahar, wajah dikhao)
  let containerStatus = 'UNKNOWN';
  for (let i = 0; i < 8; i++) {
    const s = await graph(`https://graph.facebook.com/${ver}/${c.j.id}?fields=status_code,status&access_token=${token}`);
    if (!s.ok) return { ok: false, step: 'container_status', error: s.j.error || s.j };
    containerStatus = s.j.status_code || containerStatus;
    if (containerStatus === 'FINISHED') break;
    if (containerStatus === 'ERROR' || containerStatus === 'EXPIRED') {
      return { ok: false, step: 'container_status', containerStatus, error: s.j.status || s.j };
    }
    await sleep(1500);
  }
  if (containerStatus !== 'FINISHED') {
    return { ok: false, step: 'container_not_ready', containerStatus, error: 'Instagram ne image 12 second me process nahi ki' };
  }

  // 3) publish
  const p = await graph(`https://graph.facebook.com/${ver}/${igId}/media_publish`, { creation_id: c.j.id, access_token: token });
  if (!p.ok) return { ok: false, step: 'publish', error: p.j.error || p.j };
  let permalink;
  try {
    const m = await graph(`https://graph.facebook.com/${ver}/${p.j.id}?fields=permalink&access_token=${token}`);
    permalink = m.j.permalink;
  } catch (e) {
    /* sirf info ke liye */
  }
  return { ok: true, id: p.j.id, username, permalink };
}

// ---------------- Handler ----------------
export default async function handler(req, res) {
  try {
    // Bearer only (no ?key= : query strings leak into logs). Fail closed if the secret is not set.
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ success: false, error: 'CRON_SECRET set nahi hai' });
    const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!given || !safeEq(given, secret)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const pageId = process.env.FB_PAGE_ID;
    const token = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!pageId || !token) {
      return res.status(500).json({ success: false, error: 'FB_PAGE_ID ya FB_PAGE_ACCESS_TOKEN set nahi hai' });
    }
    const ver = process.env.FB_GRAPH_VERSION || 'v24.0';

    const file = path.join(process.cwd(), 'data', 'postSchedule.json');
    const schedule = JSON.parse(fs.readFileSync(file, 'utf8'));
    const posts = schedule.posts || [];
    if (!posts.length) return res.status(500).json({ success: false, error: 'postSchedule.json me posts nahi hain' });

    const startDay = dayNumberFromYmd(process.env.FB_START_DATE || '2026-10-18');
    const index = (((istDayNumber() - startDay) % posts.length) + posts.length) % posts.length;
    const post = posts[index];

    const site = (schedule.website || 'https://shrisitaramsevatrust.com').replace(/\/$/, '');
    const imageUrl = post.image.startsWith('http') ? post.image : `${site}${post.image}`;
    const caption = [post.title, '', post.hook, post.points, '', schedule.footer, '', `🌐 ${schedule.website || site}`, '', schedule.hashtags]
      .filter((l) => l !== undefined && l !== null)
      .join('\n');

    if (req.query?.dry) {
      return res.status(200).json({ success: true, dryRun: true, day: post.day, imageUrl, caption });
    }

    const force = !!req.query?.force;
    const pageToken = await resolvePageToken({ ver, pageId, token });
    const args = { ver, pageId, token: pageToken, post, imageUrl, caption, force };

    // Dono alag alag chalte hain: ek fail ho to dusra phir bhi post hota hai
    const facebook = await postToFacebook(args).catch((e) => ({ ok: false, error: e.message }));
    const instagram = await postToInstagram(args).catch((e) => ({ ok: false, error: e.message }));

    const success = facebook.ok && instagram.ok;
    if (!success) console.error('Post fail:', JSON.stringify({ facebook, instagram }));
    return res.status(success ? 200 : 502).json({ success, day: post.day, imageUrl, facebook, instagram });
  } catch (error) {
    console.error('post-facebook crashed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
