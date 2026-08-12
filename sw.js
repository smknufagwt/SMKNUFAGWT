/**
 * ============================================================
 *  SW.JS — SERVICE WORKER NUFA GLOBAL CHAT
 *  SMK Nurul Falah • Modular Push & Sync Notification Layer
 * ============================================================
 *
 *  MODUL YANG ADA DI SINI:
 *  1. CONFIG           — konfigurasi terpusat
 *  2. CACHE_MODULE     — caching aset statis
 *  3. PUSH_MODULE      — handle push notification dari server
 *  4. SYNC_MODULE      — background sync (kirim pesan offline)
 *  5. MESSAGE_MODULE   — komunikasi dua arah SW ↔ halaman
 *  6. INSTALL/ACTIVATE — lifecycle SW
 */
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// ============================================================
// [1] CONFIG — Ubah sesuai kebutuhan
// ============================================================
const CONFIG = {
  CACHE_NAME: 'nufa-cache-v1',
  THUMB_CACHE_NAME: 'nufa-yt-thumb-v1',
  STATIC_ASSETS: [
    '/',
    '/index.html',
    '/notif.png',
  ],
  // Domain embed pihak ketiga (iframe live) yang SENGAJA dilepas dari intercept SW —
  // response cross-origin iframe kayak gini sering "opaque" (gak bisa divalidasi isinya
  // dari JS), jadi network-first/cache-fallback kita berisiko keliru nyimpen/nge-fallback-in
  // dan bikin embed blank. Biarin browser handle native, sama seperti Firestore/Firebase.
  EXCLUDE_EMBED_HOSTS: [
    'youtube.com',
    'youtube-nocookie.com',
    'open.spotify.com',
    'drive.google.com',
    'maps.google.com',
  ],
  // Tag untuk background sync antrian pesan chat
  SYNC_TAG_CHAT: 'nufa-sync-chat',
  // Nama channel BroadcastChannel (harus sama dengan di index.html)
  BC_NAME: 'nufa-realtime',
  // Ikon untuk push notification
  ICON: '/appcover.jpg',
  BADGE: '/notif.png',
  // Nama Firestore endpoint (tidak dipakai langsung SW, hanya referensi)
  TAG: 'nufa-global-chat',
};


// ============================================================
// [2] CACHE_MODULE — Caching aset statis saat install
// ============================================================
const CacheModule = {
  async preCacheStatic() {
    const cache = await caches.open(CONFIG.CACHE_NAME);
    try {
      await cache.addAll(CONFIG.STATIC_ASSETS);
    } catch (e) {
      console.warn('[SW][Cache] Gagal pre-cache:', e);
    }
  },

  async cleanOldCaches() {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== CONFIG.CACHE_NAME && k !== CONFIG.THUMB_CACHE_NAME)
        .map(k => caches.delete(k))
    );
  },

  // Strategi: Network First, fallback ke cache
  async fetchWithFallback(request) {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CONFIG.CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      const cached = await caches.match(request);
      return cached || new Response('Offline', { status: 503 });
    }
  },

  // Thumbnail statis pihak ketiga (i.ytimg.com / drive.google.com/thumbnail): cache-first,
  // toleran response "opaque" (no-cors) — thumbnail jarang berubah & gak butuh baca isi
  // respons buat divalidasi, jadi aman disimpan apa adanya. Dipakai facade thumbnail chat
  // (YouTube & Drive generic) biar media yang sama gak nembak jaringan ulang tiap muncul
  // lagi di riwayat chat.
  async fetchThumbCacheFirst(request) {
    const cache = await caches.open(CONFIG.THUMB_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      cache.put(request, response.clone());
      return response;
    } catch (_) {
      return new Response('', { status: 503 });
    }
  }
};

// ============================================================
// [3] PUSH_MODULE — Terima push dari OneSignal & sync ke tab aktif
//     Tampilan notifikasi sudah otomatis ditangani OneSignal SDK
//     (importScripts di atas) — modul ini HANYA broadcast ke tab
//     yang lagi kebuka, supaya chat sync realtime tanpa refresh.
//     Sengaja TIDAK showNotification() manual di sini agar tidak
//     dobel dengan notifikasi yang sudah ditampilkan OneSignal.
// ============================================================
const PushModule = {
  async handlePush(event) {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { return; }
    MessageModule.broadcastToClients({ type: 'PUSH_RECEIVED', payload: data });
  },

  /** Klik notifikasi → buka / fokus tab yang tepat */
  async handleNotificationClick(event) {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const targetUrl = (event.notification.data && event.notification.data.url) || '/';
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of allClients) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        client.focus();
        client.postMessage({ type: 'OPEN_CHAT' });
        return;
      }
    }
    // Tidak ada tab terbuka → buka tab baru
    clients.openWindow(targetUrl);
  }
};


// ============================================================
// [4] SYNC_MODULE — Background Sync (kirim pesan saat offline)
//     Antrian pesan tersimpan di IndexedDB lewat halaman,
//     lalu SW mengirim ulang saat koneksi kembali.
// ============================================================
const SyncModule = {
  DB_NAME: 'nufa-sync-db',
  STORE:   'pending-messages',

  /** Buka atau buat IndexedDB kecil untuk antrian pesan */
  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore(this.STORE, { autoIncrement: true });
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  /** Simpan pesan ke antrian (dipanggil dari halaman via postMessage) */
  async enqueue(payload) {
    const db    = await this._openDB();
    const tx    = db.transaction(this.STORE, 'readwrite');
    const store = tx.objectStore(this.STORE);
    return new Promise((resolve, reject) => {
      const req  = store.add(payload);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  },

  /** Ambil semua antrian pesan */
  async getAll() {
    const db    = await this._openDB();
    const tx    = db.transaction(this.STORE, 'readonly');
    const store = tx.objectStore(this.STORE);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  },

  /** Hapus semua antrian setelah berhasil dikirim */
  async clearAll() {
    const db    = await this._openDB();
    const tx    = db.transaction(this.STORE, 'readwrite');
    tx.objectStore(this.STORE).clear();
  },

  /**
   * Jalankan saat background sync trigger.
   * Kirim ulang semua pesan pending ke Firestore REST API.
   * Gunakan endpoint Firestore REST (tidak perlu SDK di SW).
   */
  async handleSync(tag) {
    if (tag !== CONFIG.SYNC_TAG_CHAT) return;

    const pending = await this.getAll();
    if (!pending.length) return;

    // Ambil FIREBASE_CONFIG dari halaman via message (sudah disimpan di sini oleh MessageModule)
    const fbConfig = SyncModule._fbConfig;
    if (!fbConfig || !fbConfig.projectId) {
      console.warn('[SW][Sync] Firebase config belum diterima dari halaman.');
      return;
    }

    const baseUrl = `https://firestore.googleapis.com/v1/projects/${fbConfig.projectId}/databases/(default)/documents/global_chat`;

    let allOk = true;
    for (const msg of pending) {
      try {
        const body = {
          fields: {
            ip:   { stringValue: msg.ip   || 'UNKNOWN' },
            uid:  { stringValue: msg.uid  || 'SW-sync' },
            text: { stringValue: msg.text || '' },
            ts:   { integerValue: String(msg.ts || Date.now()) },
          }
        };
        const res = await fetch(baseUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        });
        if (!res.ok) allOk = false;
      } catch (e) {
        console.warn('[SW][Sync] Gagal kirim pesan pending:', e);
        allOk = false;
      }
    }

    if (allOk) await this.clearAll();
  },

  // Disimpan oleh MessageModule saat halaman kirim config
  _fbConfig: null,
};


// ============================================================
// [5] MESSAGE_MODULE — Komunikasi dua arah SW ↔ halaman
// ============================================================
const MessageModule = {
  bc: null, // BroadcastChannel

  init() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel(CONFIG.BC_NAME);
    }
  },

  /** Terima pesan dari halaman → SW */
  async handleMessage(event) {
    const { type, payload } = event.data || {};

    switch (type) {
      // Halaman kirim Firebase config agar SyncModule bisa pakai REST API
      case 'SET_FIREBASE_CONFIG':
        SyncModule._fbConfig = payload;
        break;

      // Halaman minta SW simpan pesan ke antrian offline
      case 'ENQUEUE_MESSAGE':
        await SyncModule.enqueue(payload);
        // Daftarkan sync agar dikirim saat online
        if (self.registration.sync) {
          try { await self.registration.sync.register(CONFIG.SYNC_TAG_CHAT); }
          catch (e) { console.warn('[SW][Sync] sync.register gagal:', e); }
        }
        break;

      // Halaman minta skip waiting agar SW baru langsung aktif
      case 'SKIP_WAITING':
        self.skipWaiting();
        break;

      // Halaman minta SW kirim push ke semua tab (simulasi realtime)
      case 'BROADCAST_CHAT':
        this.broadcastToClients({ type: 'NEW_CHAT_MESSAGE', payload });
        break;

      // Halaman lapor jumlah pesan /chat yang belum dibaca — set app badge kalau browser dukung
      case 'SET_UNREAD_BADGE':
        try {
          const count = (payload && payload.count) || 0;
          if (count > 0 && 'setAppBadge' in navigator) {
            navigator.setAppBadge(count);
          } else if ('clearAppBadge' in navigator) {
            navigator.clearAppBadge();
          }
        } catch (e) { /* Badging API gak didukung browser ini, abaikan */ }
        break;
    }
  },

  /** Broadcast pesan ke semua tab/windows yang terbuka */
  async broadcastToClients(msg) {
    // Via BroadcastChannel (lebih efisien)
    if (this.bc) {
      this.bc.postMessage(msg);
    }
    // Via postMessage ke setiap client (fallback & lebih luas)
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    allClients.forEach(client => client.postMessage(msg));
  }
};


// ============================================================
// [6] LIFECYCLE — install, activate, fetch
// ============================================================

self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    CacheModule.preCacheStatic().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  MessageModule.init();
  event.waitUntil(
    CacheModule.cleanOldCaches().then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Hanya intercept GET, skip request ke Firestore/Firebase agar tidak di-cache
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  if (url.includes('firestore.googleapis.com') || url.includes('firebase')) return;

  // Thumbnail YouTube & Drive: cache-first khusus (lihat CacheModule.fetchThumbCacheFirst).
  // Path /thumbnail Drive sengaja dicek DULUAN sebelum EXCLUDE_EMBED_HOSTS di bawah — host-nya
  // "drive.google.com" sama kayak iframe live /file/.../preview yang justru mau di-exclude,
  // jadi urutan & kekhususan path ini yang bikin keduanya kebedain dgn benar.
  if (url.includes('i.ytimg.com') || url.includes('drive.google.com/thumbnail')) {
    event.respondWith(CacheModule.fetchThumbCacheFirst(event.request));
    return;
  }

  // Embed pihak ketiga (iframe live YouTube/Spotify/Drive/Maps) — jangan diintercept,
  // biarin browser handle native (lihat CONFIG.EXCLUDE_EMBED_HOSTS).
  if (CONFIG.EXCLUDE_EMBED_HOSTS.some(host => url.includes(host))) return;

  event.respondWith(CacheModule.fetchWithFallback(event.request));
});

// Push dari server
self.addEventListener('push', event => {
  event.waitUntil(PushModule.handlePush(event));
});

// Klik notifikasi
self.addEventListener('notificationclick', event => {
  event.waitUntil(PushModule.handleNotificationClick(event));
});

// Background sync (kirim ulang pesan offline)
self.addEventListener('sync', event => {
  event.waitUntil(SyncModule.handleSync(event.tag));
});

// Pesan dari halaman
self.addEventListener('message', event => {
  MessageModule.handleMessage(event);
});
