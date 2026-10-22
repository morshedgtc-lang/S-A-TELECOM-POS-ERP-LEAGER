import { Router } from 'express';
import { requirePerm } from '../lib/auth.js';
import { audit, httpError } from '../lib/http.js';

const bi = (en, bn) => ({ en, bn });

/** Website content shown on the public home page. Editable by users with manageSettings. */
export const DEFAULT_SITE = {
  heroTitle: bi('Mobile repair, spare parts & accessories', 'মোবাইল সার্ভিসিং, পার্টস ও এক্সেসরিজ'),
  heroSubtitle: bi(
    'Fast, honest repair for every brand. Genuine parts, new and used phones, and accessories in one shop.',
    'সব ব্র্যান্ডের দ্রুত ও বিশ্বস্ত সার্ভিসিং। আসল পার্টস, নতুন ও পুরাতন ফোন এবং এক্সেসরিজ এক জায়গায়।',
  ),
  heroImage: '',
  about: bi(
    'We repair smartphones and feature phones, sell genuine spare parts and accessories, and keep every job tracked from receipt to delivery.',
    'আমরা স্মার্টফোন ও বাটন ফোন সার্ভিসিং করি, আসল স্পেয়ার পার্টস ও এক্সেসরিজ বিক্রি করি এবং প্রতিটি কাজ রিসিভ থেকে ডেলিভারি পর্যন্ত ট্র্যাক করি।',
  ),
  services: [
    { icon: 'fa-mobile-screen', title: bi('Display replacement', 'ডিসপ্লে পরিবর্তন'), desc: bi('Broken glass, touch and LCD/OLED panels.', 'ভাঙা গ্লাস, টাচ ও LCD/OLED প্যানেল।') },
    { icon: 'fa-battery-three-quarters', title: bi('Battery & charging', 'ব্যাটারি ও চার্জিং'), desc: bi('Battery swap, charging port and IC repair.', 'ব্যাটারি, চার্জিং পোর্ট ও IC সমস্যা।') },
    { icon: 'fa-microchip', title: bi('Board repair', 'বোর্ড সার্ভিসিং'), desc: bi('Dead phone, water damage and network issues.', 'ডেড ফোন, পানিতে পড়া ও নেটওয়ার্ক সমস্যা।') },
    { icon: 'fa-code', title: bi('Software & flashing', 'সফটওয়্যার ও ফ্ল্যাশিং'), desc: bi('Updates, hang/restart fixes and data backup.', 'আপডেট, হ্যাং/রিস্টার্ট সমাধান ও ডাটা ব্যাকআপ।') },
    { icon: 'fa-gears', title: bi('Spare parts', 'স্পেয়ার পার্টস'), desc: bi('Genuine and high-quality parts for shops and customers.', 'দোকান ও কাস্টমারের জন্য আসল ও মানসম্মত পার্টস।') },
    { icon: 'fa-headphones', title: bi('Accessories', 'এক্সেসরিজ'), desc: bi('Chargers, cables, earphones, covers and more.', 'চার্জার, ক্যাবল, ইয়ারফোন, কভার ও আরও অনেক কিছু।') },
  ],
  highlights: [
    { icon: 'fa-bolt', title: bi('Same-day service', 'একই দিনে সার্ভিস') },
    { icon: 'fa-shield-halved', title: bi('Service warranty', 'সার্ভিস ওয়ারেন্টি') },
    { icon: 'fa-certificate', title: bi('Genuine parts', 'আসল পার্টস') },
    { icon: 'fa-magnifying-glass-location', title: bi('Track your repair online', 'অনলাইনে রিপেয়ার ট্র্যাক') },
  ],
  whatsapp: '',
  email: '',
  hours: bi('Sat–Thu, 10am – 9pm', 'শনি–বৃহস্পতি, সকাল ১০টা – রাত ৯টা'),
  mapUrl: '',
  facebook: '',
  showTracking: true,
};

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const biText = (v, fallback, max = 300) => ({ en: text(v?.en ?? fallback.en, max), bn: text(v?.bn ?? fallback.bn, max) });
const icon = (v, fallback) => (/^fa-[a-z0-9-]{1,40}$/.test(String(v)) ? String(v) : fallback);
const httpsUrl = (v) => {
  const s = text(v, 500);
  return s === '' || /^https:\/\/[^\s"'<>]+$/.test(s) ? s : null;
};

/** Validates a site payload against the defaults. Throws 400 on unsafe URLs or oversize images. */
export function sanitizeSite(input, current = DEFAULT_SITE) {
  const b = input ?? {};
  const heroImage = b.heroImage === undefined ? current.heroImage : String(b.heroImage ?? '');
  if (heroImage && !heroImage.startsWith('data:image/') && httpsUrl(heroImage) === null) {
    throw httpError(400, 'Banner image must be an uploaded image or an https link');
  }
  if (heroImage.length > 2_800_000) throw httpError(400, 'Banner image is too large (max about 2 MB)');
  for (const key of ['mapUrl', 'facebook']) {
    if (b[key] !== undefined && httpsUrl(b[key]) === null) throw httpError(400, `${key} must be an https link`);
  }
  const list = (arr, max, fallback, map) => (Array.isArray(arr) ? arr.slice(0, max).map(map) : fallback);

  return {
    heroTitle: biText(b.heroTitle, current.heroTitle, 120),
    heroSubtitle: biText(b.heroSubtitle, current.heroSubtitle, 300),
    heroImage,
    about: biText(b.about, current.about, 1500),
    services: list(b.services, 12, current.services, (s) => ({
      icon: icon(s?.icon, 'fa-screwdriver-wrench'),
      title: biText(s?.title, { en: '', bn: '' }, 80),
      desc: biText(s?.desc, { en: '', bn: '' }, 200),
    })),
    highlights: list(b.highlights, 6, current.highlights, (h) => ({
      icon: icon(h?.icon, 'fa-star'),
      title: biText(h?.title, { en: '', bn: '' }, 60),
    })),
    whatsapp: b.whatsapp === undefined ? current.whatsapp : text(b.whatsapp, 20).replace(/[^\d+]/g, ''),
    email: b.email === undefined ? current.email : text(b.email, 120),
    hours: biText(b.hours, current.hours, 120),
    mapUrl: b.mapUrl === undefined ? current.mapUrl : httpsUrl(b.mapUrl),
    facebook: b.facebook === undefined ? current.facebook : httpsUrl(b.facebook),
    showTracking: b.showTracking === undefined ? current.showTracking : Boolean(b.showTracking),
  };
}

export function readSite(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'site'").get();
  if (!row) return DEFAULT_SITE;
  try {
    return sanitizeSite(JSON.parse(row.value));
  } catch {
    return DEFAULT_SITE;
  }
}

function readShop(db) {
  const out = { shopName: 'SA Telecom', shopPhone: '', shopAddress: '' };
  for (const r of db.prepare("SELECT key, value FROM settings WHERE key IN ('shopName', 'shopPhone', 'shopAddress')").all()) {
    out[r.key] = r.value;
  }
  return out;
}

/** Small fixed-window limiter so the tracking form can't be used to guess job numbers. */
function rateLimit({ limit, windowMs }) {
  const hits = new Map();
  return (req, _res, next) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return next();
    }
    entry.count += 1;
    if (entry.count > limit) return next(httpError(429, 'Too many tries. Please wait a few minutes.'));
    next();
  };
}

const lastDigits = (v) => String(v ?? '').replace(/\D/g, '').slice(-10);

/** No login needed: home page content and repair tracking. */
export function publicRouter(db) {
  const router = Router();

  router.get('/site', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ shop: readShop(db), site: readSite(db) });
  });

  router.get('/track', rateLimit({ limit: 20, windowMs: 10 * 60 * 1000 }), (req, res) => {
    const jobNo = String(req.query.jobNo ?? '').trim().toUpperCase();
    const mobile = lastDigits(req.query.mobile);
    if (!jobNo || mobile.length < 10) throw httpError(400, 'Enter the job number and the mobile number on the slip');
    const job = db.prepare(`SELECT j.*, c.mobile AS customer_mobile FROM repair_jobs j
                            JOIN customers c ON c.id = j.customer_id WHERE j.job_no = ?`).get(jobNo);
    if (!job || lastDigits(job.customer_mobile) !== mobile) throw httpError(404, 'No job found for this number and mobile');
    const events = db.prepare('SELECT to_status, created_at FROM repair_job_events WHERE job_id = ? ORDER BY id').all(job.id);
    const delivered = job.status === 'delivered';
    res.json({
      jobNo: job.job_no,
      device: job.device,
      status: job.status,
      outcome: job.outcome,
      createdAt: job.created_at,
      promisedAt: job.promised_at,
      deliveredAt: job.delivered_at,
      estimatedCost: job.estimated_cost,
      advance: job.advance,
      total: delivered ? job.total : null,
      due: delivered ? job.due : null,
      events: events.map((e) => ({ status: e.to_status, at: e.created_at })),
    });
  });

  return router;
}

/** Admin side of the website editor, mounted at /api/settings/site. */
export function siteRouter(db) {
  const router = Router();

  router.get('/', (_req, res) => res.json(readSite(db)));

  router.put('/', requirePerm('manageSettings'), (req, res) => {
    const site = sanitizeSite(req.body, DEFAULT_SITE);
    db.prepare("INSERT INTO settings (key, value) VALUES ('site', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(site));
    audit(db, req.user, 'site_update', 'website');
    res.json(site);
  });

  return router;
}
