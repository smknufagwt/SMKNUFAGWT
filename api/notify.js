/**
 * /api/notify.js — Vercel Serverless Function
 * Terima trigger dari browser atau GitHub Actions,
 * lalu kirim push notification via OneSignal REST API.
 *
 * ENV yang dibutuhkan di Vercel:
 *   ONESIGNAL_APP_ID       = 24018ed8-5d9e-4e5e-b651-f8e94bf58a53
 *   ONESIGNAL_REST_API_KEY = (dari OneSignal Dashboard → Keys & IDs)
 *   NOTIFY_SECRET          = (string bebas, sama dengan di GitHub Secret)
 */

// Banding string tanpa short-circuit (cegah timing attack); false bila salah satu bukan string/kosong
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i % (a.length || 1)) ^ b.charCodeAt(i));
  return diff === 0;
}

export default async function handler(req, res) {
  // Hanya terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validasi secret (perbandingan waktu-konstan) agar tidak bisa dipanggil sembarangan
  const secret = req.headers['x-notify-secret'];
  if (!safeEqual(secret, process.env.NOTIFY_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { ip, text, ts } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing text' });
  }

  // Buang karakter kontrol, batasi panjang — ip/ts dari klien tidak dipercaya mentah
  const clean    = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
  const maskedIp = clean(ip, 40) || 'Anonim';
  const flat     = clean(text, 1024);
  const body     = flat.length > 100 ? flat.slice(0, 97) + '...' : flat;
  const tsNum    = Number.isFinite(Number(ts)) ? Number(ts) : Date.now();

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      signal: AbortSignal.timeout(8000), // jangan menggantung sampai batas fungsi serverless
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Key ${process.env.ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id:              process.env.ONESIGNAL_APP_ID,
        included_segments:   ['All'],
        headings:            { en: `💬 ${maskedIp} • Global Chat Nufa` },
        contents:            { en: body },
        url:                 'https://nufabase.web.app/',
        chrome_web_icon:     'https://nufabase.web.app/favicon.ico',
        chrome_web_badge:    'https://nufabase.web.app/favicon.ico',
        // Collapse key — notif lama diganti notif baru (tidak numpuk)
        collapse_id:         'nufa-global-chat',
        // Data ekstra untuk SW handle klik
        data: { ts: tsNum, ip: maskedIp },
        web_buttons: [
          { id: 'open', text: '📂 Buka Chat', url: 'https://nufabase.web.app/' },
        ],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[notify] OneSignal error:', result);
      return res.status(502).json({ error: 'OneSignal error' }); // detail hanya di log server
    }

    return res.status(200).json({ ok: true, id: result.id });

  } catch (err) {
    console.error('[notify] Fetch error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
