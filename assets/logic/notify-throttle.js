/* notify-throttle.js — anti-spam trigger ke /api/notify (throttle 10s) */
    (function () {
      'use strict';

      // ── Konfigurasi ───────────────────────────────────────
      const NOTIFY_ENDPOINT  = '/api/notify';
      const NOTIFY_SECRET    = '%%NOTIFY_SECRET%%';
      const THROTTLE_MS      = 10000; // 10 detik antar trigger (anti-spam ramai)
      const FETCH_TIMEOUT_MS = 6000;  // timeout fetch ke /api/notify
      const MAX_RETRY        = 2;     // retry kalau fetch gagal

      // ── State internal ────────────────────────────────────
      let lastTriggeredTs  = 0; // ts pesan terakhir yang sudah dinotif
      let lastTriggerTime  = 0; // waktu terakhir trigger (throttle)
      let _oneSignalReady  = false;

      // ── OneSignal init ────────────────────────────────────
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      OneSignalDeferred.push(async function (OneSignal) {
        try {
          await OneSignal.init({
            appId:         '24018ed8-5d9e-4e5e-b651-f8e94bf58a53',
            safari_web_id: 'web.onesignal.auto.5a4f7f6e-eec9-48b6-8a5c-3683e8870b3c',
            notifyButton:  { enable: false },
            serviceWorkerParam: { scope: '/' },
serviceWorkerPath:  '/sw.js',
          });
          _oneSignalReady = true;
        } catch (e) {
          console.warn('[NufaNotify] OneSignal init gagal:', e.message);
        }
      });

      // ── Fetch dengan timeout + retry ──────────────────────
      async function fetchWithRetry(url, options, retries) {
        for (let i = 0; i <= retries; i++) {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
          try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(tid);
            return res;
          } catch (e) {
            clearTimeout(tid);
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, 1000 * (i + 1))); // backoff 1s, 2s
          }
        }
      }

      // ── BroadcastChannel helper ───────────────────────────
      function broadcastLocal(payload) {
        if (typeof BroadcastChannel === 'undefined') return;
        try {
          const bc = new BroadcastChannel('nufa-realtime');
          bc.postMessage({ type: 'NEW_CHAT_MESSAGE', payload });
          bc.close();
        } catch (_) {}
      }

      // ── NufaNotify public API ─────────────────────────────
      window.NufaNotify = {

        async trigger(m) {
          // Guard: validasi payload
          if (!m || !m.text || !m.ts) return;

          // Guard: jangan notif pesan yang sama dua kali
          if (m.ts <= lastTriggeredTs) return;

          // Guard: throttle — kalau tab lain sudah trigger dalam 10 detik, skip
          const now = Date.now();
          if (now - lastTriggerTime < THROTTLE_MS) {
            // Tetap broadcast lokal meskipun throttled
            broadcastLocal(m);
            return;
          }

          // Update state sebelum async agar tab lain yang masuk bersamaan ikut throttled
          lastTriggeredTs = m.ts;
          lastTriggerTime = now;

          // Path A: OneSignal via /api/notify (push lintas device + background)
          if (navigator.onLine) {
            try {
              const res = await fetchWithRetry(
                NOTIFY_ENDPOINT,
                {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json', 'x-notify-secret': NOTIFY_SECRET },
                  body:    JSON.stringify({ ip: m.ip, text: m.text, ts: m.ts }),
                },
                MAX_RETRY
              );
              if (!res.ok) {
                console.warn('[NufaNotify] api/notify HTTP:', res.status);
              } else if (typeof firebase !== 'undefined' && firebase.apps.length) {
                // Update state dedup bersama dengan cron (notify-cron.yml), supaya pesan yang
                // sudah dipush dari client ini tidak dipush ulang oleh cron dalam 5 menit berikutnya.
                firebase.firestore().collection('_notify_state').doc('last')
                  .set({ ts: m.ts }, { merge: true })
                  .catch(e => console.warn('[NufaNotify] update _notify_state gagal:', e.message));
              }
            } catch (e) {
              // Offline atau timeout → BC saja sudah cukup untuk tab aktif
              console.warn('[NufaNotify] api/notify gagal (offline/timeout):', e.message);
            }
          }

          // Path B: BroadcastChannel — selalu jalan (notif antar tab aktif)
          broadcastLocal(m);
        },

        // Dipanggil saat user aktifkan tombol notif
        async requestPermission() {
          if (!_oneSignalReady) {
            console.warn('[NufaNotify] OneSignal belum siap.');
            return false;
          }
          try {
            await OneSignal.Notifications.requestPermission();
            return OneSignal.Notifications.permission;
          } catch (e) {
            console.warn('[NufaNotify] requestPermission gagal:', e.message);
            return false;
          }
        },

        // Cek status subscribe (untuk sinkronisasi tombol bell)
        async isSubscribed() {
          if (!_oneSignalReady) return false;
          try { return !!(await OneSignal.User.PushSubscription.optedIn); }
          catch { return false; }
        },
      };

    })();
