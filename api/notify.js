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

export default async function handler(req, res) {
  // Hanya terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validasi secret agar tidak bisa dipanggil sembarangan
  const secret = req.headers['x-notify-secret'];
  if (!secret || secret !== process.env.NOTIFY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { ip, text, ts } = req.body || {};
  if (!text) {
    return res.status(400).json({ error: 'Missing text' });
  }

  const maskedIp = ip || 'Anonim';
  const body     = text.length > 100 ? text.slice(0, 97) + '...' : text;

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Key ${process.env.ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id:              process.env.ONESIGNAL_APP_ID,
        included_segments:   ['All'],
        headings:            { en: `💬 ${maskedIp} • Global Chat Nufa` },
        contents:            { en: body },
        url:                 'https://smknufagwt.vercel.app/',
        chrome_web_icon:     'https://smknufagwt.vercel.app/favicon.ico',
        chrome_web_badge:    'https://smknufagwt.vercel.app/favicon.ico',
        // Collapse key — notif lama diganti notif baru (tidak numpuk)
        collapse_id:         'nufa-global-chat',
        // Data ekstra untuk SW handle klik
       data: { ts, ip },
        web_buttons: [
          { id: 'open', text: '📂 Buka Chat', url: 'https://smknufagwt.vercel.app/' },
        ],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[notify] OneSignal error:', result);
      return res.status(502).json({ error: 'OneSignal error', detail: result });
    }

    return res.status(200).json({ ok: true, id: result.id });

  } catch (err) {
    console.error('[notify] Fetch error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
