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
  CACHE_NAME: 'nufa-cache-v5',
  THUMB_CACHE_NAME: 'nufa-yt-thumb-v1',
  RUNTIME_CACHE_MAX: 80,
  TRIM_EVERY: 10,          // trim cache tiap N penulisan, bukan tiap request
  NETWORK_TIMEOUT_MS: 4000, // jaringan lambat & ada cache → pakai cache dulu
  THUMB_CACHE_MAX: 150,
  STATIC_ASSETS: [
    '/',
    '/index.html',
    '/favicon.ico',
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
  // Ikon untuk push notification
  ICON: '/appcover.jpg',
  BADGE: '/favicon.ico',
  // Nama Firestore endpoint (tidak dipakai langsung SW, hanya referensi)
  TAG: 'nufa-global-chat',
};


// ============================================================
// [2] CACHE_MODULE — Caching aset statis saat install
// ============================================================
const CacheModule = {
  _puts: 0,

  async trimCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
  },

  // Satu aset gagal tidak membatalkan yang lain (addAll bersifat atomik)
  async preCacheStatic() {
    const cache = await caches.open(CONFIG.CACHE_NAME);
    await Promise.allSettled(CONFIG.STATIC_ASSETS.map(u => cache.add(u)));
  },

  async cleanOldCaches() {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== CONFIG.CACHE_NAME && k !== CONFIG.THUMB_CACHE_NAME)
        .map(k => caches.delete(k))
    );
  },

  _offline() {
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },

  // Strategi: Network First. Kalau ada cache tapi jaringan lambat (> NETWORK_TIMEOUT_MS)
  // atau gagal, langsung pakai cache; respons jaringan yang telat tetap memperbarui cache.
  // Tanpa cache → tunggu jaringan apa adanya (tidak di-abort, aman untuk koneksi lambat).
  async fetchWithFallback(event) {
    const request = event.request;
    const cache = await caches.open(CONFIG.CACHE_NAME);
    const cached = await cache.match(request);

    const network = fetch(request).then(res => {
      // Hanya 200 penuh: 206 (range) & opaque tidak boleh/tak berguna di-cache
      if (res.status === 200 && res.type !== 'opaque') {
        const job = cache.put(request, res.clone())
          .then(() => (++this._puts % CONFIG.TRIM_EVERY === 0) && this.trimCache(CONFIG.CACHE_NAME, CONFIG.RUNTIME_CACHE_MAX))
          .catch(() => {});
        try { event.waitUntil(job); } catch (_) { /* event sudah selesai, job tetap jalan */ }
      }
      return res;
    });

    if (!cached) return network.catch(() => this._offline());
    const slow = new Promise(resolve => setTimeout(() => resolve(cached), CONFIG.NETWORK_TIMEOUT_MS));
    return Promise.race([network, slow]).catch(() => cached);
  },

  // Thumbnail statis pihak ketiga (i.ytimg.com / drive.google.com/thumbnail): cache-first,
  // toleran response "opaque" (no-cors) — thumbnail jarang berubah & gak butuh baca isi
  // respons buat divalidasi. Dipakai facade thumbnail chat (YouTube & Drive).
  async fetchThumbCacheFirst(event) {
    const request = event.request;
    const cache = await caches.open(CONFIG.THUMB_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      const job = cache.put(request, response.clone())
        .then(() => this.trimCache(CONFIG.THUMB_CACHE_NAME, CONFIG.THUMB_CACHE_MAX))
        .catch(() => {});
      try { event.waitUntil(job); } catch (_) { /* abaikan */ }
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
//     Antrian pesan + projectId Firebase disimpan di IndexedDB
//     (tahan SW di-restart oleh browser), dikirim ulang saat online.
// ============================================================
const SyncModule = {
  DB_NAME: 'nufa-sync-db',
  STORE:   'pending-messages',
  META:    'meta',
  _dbp:    null,

  /** Buka IndexedDB sekali, koneksi dipakai ulang */
  _openDB() {
    if (this._dbp) return this._dbp;
    this._dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 2);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE)) db.createObjectStore(this.STORE, { autoIncrement: true });
        if (!db.objectStoreNames.contains(this.META)) db.createObjectStore(this.META);
      };
      req.onsuccess = e => {
        const db = e.target.result;
        db.onversionchange = () => { db.close(); this._dbp = null; };
        resolve(db);
      };
      req.onerror = e => { this._dbp = null; reject(e.target.error); };
    });
    return this._dbp;
  },

  /** Jalankan fn(store) dalam 1 transaksi; resolve setelah transaksi commit */
  async _tx(storeName, mode, fn) {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const r = fn(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  },

  enqueue(payload)  { return this._tx(this.STORE, 'readwrite', s => s.add(payload)); },
  setProjectId(id)  { return this._tx(this.META, 'readwrite', s => s.put(id, 'projectId')); },
  getProjectId()    { return this._tx(this.META, 'readonly', s => s.get('projectId')); },

  /** Ambil antrian beserta key-nya, supaya yang sukses saja yang dihapus */
  async getAllWithKeys() {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readonly');
      const s = tx.objectStore(this.STORE);
      const kReq = s.getAllKeys(), vReq = s.getAll();
      tx.oncomplete = () => resolve(kReq.result.map((key, i) => ({ key, value: vReq.result[i] })));
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  },

  async deleteKeys(keys) {
    if (!keys.length) return;
    await this._tx(this.STORE, 'readwrite', s => { keys.forEach(k => s.delete(k)); });
  },

  /**
   * Jalankan saat background sync trigger. Kirim ulang pesan pending ke Firestore REST API.
   * Pesan yang sukses dihapus satu per satu; kalau ada yang gagal, lempar error supaya
   * browser menjadwalkan sync ulang (tanpa kirim dobel pesan yang sudah terkirim).
   */
  async handleSync(tag) {
    if (tag !== CONFIG.SYNC_TAG_CHAT) return;

    const pending = await this.getAllWithKeys();
    if (!pending.length) return;

    const projectId = await this.getProjectId();
    if (!projectId) {
      console.warn('[SW][Sync] projectId belum diterima dari halaman.');
      return;
    }

    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/global_chat`;
    const done = [];

    for (const { key, value: msg } of pending) {
      try {
        const body = {
          fields: {
            ip:   { stringValue: String(msg.ip   || 'UNKNOWN').slice(0, 64) },
            uid:  { stringValue: String(msg.uid  || 'SW-sync').slice(0, 128) },
            text: { stringValue: String(msg.text || '').slice(0, 1024) },
            ts:   { integerValue: String(msg.ts || Date.now()) },
          }
        };
        const res = await fetch(baseUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        });
        // 400 = payload cacat permanen → buang, jangan diulang selamanya
        if (res.ok || res.status === 400) done.push(key);
      } catch (e) {
        console.warn('[SW][Sync] Gagal kirim pesan pending:', e);
      }
    }

    await this.deleteKeys(done);
    if (done.length < pending.length) throw new Error('sync-incomplete');
  },
};


// ============================================================
// [5] MESSAGE_MODULE — Komunikasi dua arah SW ↔ halaman
// ============================================================
const MessageModule = {
  /** Terima pesan dari halaman → SW (hanya dari window same-origin) */
  async handleMessage(event) {
    const src = event.source;
    if (!src || typeof src.url !== 'string' || !src.url.startsWith(self.location.origin)) return;
    const { type, payload } = event.data || {};

    switch (type) {
      // Halaman kirim projectId Firebase agar SyncModule bisa pakai REST API
      case 'SET_FIREBASE_CONFIG': {
        const pid = payload && payload.projectId;
        if (typeof pid === 'string' && /^[a-z0-9-]{4,64}$/.test(pid)) await SyncModule.setProjectId(pid);
        break;
      }

      // Halaman minta SW simpan pesan ke antrian offline
      case 'ENQUEUE_MESSAGE':
        if (!payload || typeof payload.text !== 'string' || !payload.text.trim()) break;
        await SyncModule.enqueue({
          ip:   String(payload.ip  || '').slice(0, 64),
          uid:  String(payload.uid || '').slice(0, 128),
          text: payload.text.slice(0, 1024),
          ts:   Number(payload.ts) || Date.now(),
        });
        if (self.registration.sync) {
          try { await self.registration.sync.register(CONFIG.SYNC_TAG_CHAT); }
          catch (e) { console.warn('[SW][Sync] sync.register gagal:', e); }
        }
        break;

      // Halaman minta SW kirim push ke semua tab (simulasi realtime)
      case 'BROADCAST_CHAT':
        this.broadcastToClients({ type: 'NEW_CHAT_MESSAGE', payload });
        break;

      // Halaman lapor jumlah pesan /chat yang belum dibaca — set app badge kalau browser dukung
      case 'SET_UNREAD_BADGE':
        try {
          const count = Number(payload && payload.count) || 0;
          if (count > 0 && 'setAppBadge' in navigator) {
            navigator.setAppBadge(count);
          } else if ('clearAppBadge' in navigator) {
            navigator.clearAppBadge();
          }
        } catch (e) { /* Badging API gak didukung browser ini, abaikan */ }
        break;
    }
  },

  /** Kirim ke semua tab terbuka — SATU jalur (postMessage); halaman mendengar BC & SW,
   *  jadi lewat dua jalur bikin notifikasi dobel. */
  async broadcastToClients(msg) {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    allClients.forEach(client => client.postMessage(msg));
  }
};


// ============================================================
// [6] LIFECYCLE — install, activate, fetch
// ============================================================

self.addEventListener('install', event => {
  event.waitUntil(
    CacheModule.preCacheStatic().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
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
    event.respondWith(CacheModule.fetchThumbCacheFirst(event));
    return;
  }

  // Embed pihak ketiga (iframe live YouTube/Spotify/Drive/Maps) — jangan diintercept,
  // biarin browser handle native (lihat CONFIG.EXCLUDE_EMBED_HOSTS).
  if (CONFIG.EXCLUDE_EMBED_HOSTS.some(host => url.includes(host))) return;

  event.respondWith(CacheModule.fetchWithFallback(event));
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
  event.waitUntil(MessageModule.handleMessage(event).catch(e => console.warn('[SW][Message]', e)));
});
