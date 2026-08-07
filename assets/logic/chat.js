/* chat.js — Firebase config, IpMask, WordFilter, PrivacyBoard, MediaPrefs, ChatFormat, GlobalChat */
        const FIREBASE_CONFIG = {
            apiKey: "%%FIREBASE_API_KEY%%",
            authDomain: "server-nufa.firebaseapp.com",
            projectId: "server-nufa",
            storageBucket: "server-nufa.firebasestorage.app",
            messagingSenderId: "168660687360",
            appId: "1:168660687360:web:bdb56f6ea15e3cd44756e5",
            databaseURL: "%%FIREBASE_DATABASE_URL%%"
        };
        //  KONFIGURASI SENSOR IP   
        const IP_MASK_LEVEL = 1;
        //  KONFIGURASI FILTER KATA KASAR
        const BAD_WORDS = ['asu', 'smks2026', 'puki', 'goblok', 'dancok', 'anjing', 'bangsat', 'kontol', 'memek', 'tai', 'jancok'];

        // ============================================================
        //  KONFIGURASI COOLDOWN TOMBOL KIRIM (anti-spam)
        
        const SEND_COOLDOWN_MS = 3000;

        // ── MODUL: Sensor IP (IPv4 & IPv6 tersinkron lewat IP_MASK_LEVEL) ──
        const IpMask = {
            apply(ip) {
                if (!ip || ip === 'UNKNOWN' || ip === 'SYSTEM') return 'ANONIM';

                const isV6 = ip.includes(':');
                const sep = isV6 ? ':' : '.';
                const maskToken = isV6 ? 'xxxx' : 'xxx';
                const parts = ip.split(sep).filter(Boolean);
                if (parts.length < 2) return 'ANONIM';

                // Level 0 = tampil penuh. Clamp agar tidak melebihi jumlah segmen yang ada.
                const level = Math.max(0, Math.min(IP_MASK_LEVEL, parts.length));
                if (level === 0) return ip;

                const visibleCount = parts.length - level;
                const masked = parts.map((seg, i) => (i < visibleCount ? seg : maskToken));
                return masked.join(sep);
            }
        };

        // ── MODUL: Filter kata kasar (sensor otomatis jadi "***") ──
        const WordFilter = {
            _regex: null,
            _build() {
                if (this._regex) return this._regex;
                const escaped = BAD_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                this._regex = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'gi');
                return this._regex;
            },
            clean(text) {
                if (!text) return text;
                return text.replace(this._build(), (m) => '*'.repeat(m.length));
            }
        };

        // ── MODUL: Privacy Policy popover (klik untuk buka, tidak pindah tab/link) ──
        const PrivacyBoard = {
            isOpen: false,
            toggle(e) {
                if (e) e.stopPropagation();
                this.isOpen = !this.isOpen;
                document.getElementById('privacy-board').classList.toggle('open', this.isOpen);
                if (typeof AudioFX !== 'undefined') AudioFX.click();
            },
            close() {
                this.isOpen = false;
                const el = document.getElementById('privacy-board');
                if (el) el.classList.remove('open');
            },
            init() {
                // klik di luar board otomatis menutup
                document.addEventListener('click', (e) => {
                    if (!this.isOpen) return;
                    const board = document.getElementById('privacy-board');
                    const trigger = document.getElementById('privacy-trigger');
                    if (board && !board.contains(e.target) && trigger && !trigger.contains(e.target)) {
                        this.close();
                    }
                });
            }
        };
        document.addEventListener('DOMContentLoaded', () => PrivacyBoard.init());

        // Parser format teks chat ala WhatsApp/Telegram: *bold* _underline_ ~coret~ "kutip"
        // > kutipan-baris, [label](url), dan [alt]{url-gambar/gif/video}.
        // PENTING: escape HTML dilakukan LEBIH DULU, baru token diubah jadi tag —
        // jadi user tidak bisa menyuntik HTML/JS lewat pesan (aman untuk global chat).
        // Preferensi tampilan media per-viewer (autoplay/loop/suara default) — persist localStorage,
        // mekanisme on/off sama seperti toggle bell notifikasi.
        const MediaPrefs = {
            autoplay: localStorage.getItem('nufa_media_autoplay') !== 'off',
            loop: localStorage.getItem('nufa_media_loop') !== 'off',
            soundDefault: localStorage.getItem('nufa_media_sound') === 'on',
            toggle(key) {
                this[key] = !this[key];
                const storeKey = key === 'soundDefault' ? 'nufa_media_sound' : 'nufa_media_' + key;
                localStorage.setItem(storeKey, this[key] ? 'on' : 'off');
            }
        };
        window.MediaPrefs = MediaPrefs;

        // YouTube IFrame: autoplay=1 digabung loop=1+playlist=selfId di URL src memicu race condition
        // bawaan YouTube (player belum selesai init loop-nya pas autoplay nembak) → keliatan sebagai
        // video kedap-kedip/stop-play sendiri begitu muncul. Fix: iframe SELALU dimuat dengan autoplay=0,
        // lalu playVideo baru ditembak via postMessage command setelah player kirim event "onReady" —
        // exact sama pola command yang dipakai tombol mute & lite-mode observer, cuma nunggu ready dulu.
        window.addEventListener('message', (e) => {
            let data;
            try { data = JSON.parse(e.data); } catch { return; }
            if (data.event !== 'onReady' || !e.source) return;
            document.querySelectorAll('#chat-messages iframe.chat-yt, #chat-messages iframe.chat-yt-short').forEach(f => {
                if (f.contentWindow !== e.source) return;
                if (f.dataset.autoplay === '1') {
                    f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                }
            });
        });

        const ChatFormat = {
            _mediaSeq: 0,
            esc(s) {
                return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
            },
            isSafeUrl(url) { return /^https?:\/\//i.test(url); },
            parseYouTubeId(url) {
                const m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
                return m ? m[1] : null;
            },
            parseDriveId(url) {
                const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([A-Za-z0-9_-]{10,})/i);
                return m ? m[1] : null;
            },
            parseSpotifyId(url) {
                const m = url.match(/open\.spotify\.com\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/i);
                return m ? { type: m[1], id: m[2] } : null;
            },
            parseMapsQuery(url) {
                let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                if (m) return `${m[1]},${m[2]}`;
                m = url.match(/[?&]q=([^&]+)/);
                if (m) return decodeURIComponent(m[1]);
                m = url.match(/maps\/place\/([^/@]+)/);
                if (m) return decodeURIComponent(m[1].replace(/\+/g, ' '));
                return null;
            },

            // Ekstensi Drive yang boleh ditampilkan; selain ini pesan diblok saat kirim (lihat validateEmbeds).
            ALLOWED_DRIVE_EXT: ['png', 'jpg', 'jpeg', 'webp', 'md', 'mp3', 'mp4', 'txt', 'doc', 'docx'],
            getUrlExt(url) {
                const m = url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
                return m ? m[1].toLowerCase() : null;
            },
            // Dipanggil sebelum kirim (GlobalChat.send). Return null = aman, atau ekstensi yang diblok.
            validateEmbeds(raw) {
                const re = /\[([^\[\]]*)\]\{([^{}]+)\}/g;
                let m;
                while ((m = re.exec(raw)) !== null) {
                    const url = m[2];
                    if (!this.isSafeUrl(url)) continue;
                    if (!this.parseDriveId(url)) continue; // bukan link Drive, lewati
                    const ext = this.getUrlExt(url);
                    if (ext && !this.ALLOWED_DRIVE_EXT.includes(ext)) return ext;
                }
                return null;
            },
            driveFallback(imgEl, driveId, alt) {
                const ifr = document.createElement('iframe');
                ifr.className = 'chat-media chat-drive-generic';
                ifr.src = `https://drive.google.com/file/d/${driveId}/preview`;
                ifr.title = alt || 'Drive';
                ifr.setAttribute('allow', 'autoplay');
                ifr.loading = 'lazy';
                ifr.onerror = () => ifr.remove();
                imgEl.replaceWith(ifr);
            },
            toggleMediaMute(btn, type) {
                const willUnmute = btn.classList.contains('muted');
                const wrap = btn.closest('.chat-media-wrap');
                const media = wrap ? wrap.querySelector(type === 'yt' ? 'iframe' : 'video') : null;
                if (media) {
                    if (type === 'video') {
                        media.muted = !willUnmute;
                        if (willUnmute) media.play().catch(() => {});
                    } else if (type === 'yt' && media.contentWindow) {
                        media.contentWindow.postMessage(JSON.stringify({ event: 'command', func: willUnmute ? 'unMute' : 'mute', args: [] }), '*');
                    }
                }
                btn.classList.toggle('muted', !willUnmute);
                btn.innerHTML = `<i class="fa-solid fa-volume-${willUnmute ? 'high' : 'xmark'}"></i>`;
                if (typeof GlobalChat !== 'undefined' && GlobalChat.handleMediaSoundToggle) {
                    GlobalChat.handleMediaSoundToggle(willUnmute);
                }
            },

            // Versi lengkap (untuk bubble chat) — boleh render gambar/video/link.
            toHtml(raw) {
                let text = this.esc(raw);

                // [alt]{url} → media. Support: link gambar langsung, video/gif, YouTube, Google Drive.
                // Video/gif diputar tanpa suara. Kalau gagal load / url tidak valid, elemen langsung hilang.
                text = text.replace(/\[([^\[\]]*)\]\{([^{}]+)\}/g, (m, alt, url) => {
                    const safe = this.isSafeUrl(url) ? url : '';
                    if (!safe) return alt || '';
                    const mp = window.MediaPrefs || { autoplay: true, loop: true, soundDefault: false };
                    const mid = 'med' + (this._mediaSeq++);
                    const volIcon = mp.soundDefault ? 'high' : 'xmark';
                    const mutedCls = mp.soundDefault ? '' : 'muted';
                    // Lite mode: jangan autoplay semua media sekaligus di HTML — IntersectionObserver
                    // (GlobalChat._observeLiteMedia) yang milih & nyalain satu-satu berdasarkan scroll.
                    const liteMode = (typeof GlobalChat !== 'undefined' && GlobalChat.liteMode);
                    const wantAutoplay = mp.autoplay && !liteMode;

                    const ytId = this.parseYouTubeId(safe);
                    if (ytId) {
                        const ytParams = new URLSearchParams({
                            autoplay: '0',         // sengaja SELALU 0 di URL — play sungguhan ditembak lewat postMessage saat onReady (lihat listener di atas), biar gak bentrok sama loop
                            mute: mp.soundDefault ? '0' : '1',
                            loop: mp.loop ? '1' : '0',
                            playlist: ytId,       // wajib diisi ulang ID sendiri agar loop:1 berfungsi pada single video
                            rel: '0',             // no related videos dari channel lain
                            modestbranding: '1',  // sisakan logo YT kecil di pojok
                            controls: '1',
                            fs: '0',
                            iv_load_policy: '3',  // sembunyikan anotasi
                            disablekb: '1',
                            playsinline: '1',
                            enablejsapi: '1'      // dibutuhkan untuk toggle mute & event onReady dari tombol/listener custom
                        });
                        // origin cuma valid kalau halaman disajikan lewat http/https — kalau dibuka via
                        // file:// (double-klik langsung) origin jadi "null"/"file://" dan YouTube API
                        // menolak enablejsapi-nya, muncul error player generik. Jadi origin di-skip saat itu.
                        if (/^https?:$/.test(location.protocol)) {
                            ytParams.set('origin', location.origin);
                        }
                        const isShort = /\/shorts\//i.test(safe);
                        const ytCls = isShort ? 'chat-yt-short' : 'chat-yt';
                        return `<div class="chat-media-wrap" id="${mid}"><iframe class="chat-media ${ytCls}" data-autoplay="${wantAutoplay ? '1' : '0'}" src="https://www.youtube-nocookie.com/embed/${ytId}?${ytParams.toString()}" title="${alt}" allow="autoplay; encrypted-media" allowfullscreen loading="lazy" onerror="this.closest('.chat-media-wrap')?.remove()"></iframe><button type="button" class="media-mute-btn ${mutedCls}" onclick="ChatFormat.toggleMediaMute(this,'yt')" title="Suara"><i class="fa-solid fa-volume-${volIcon}"></i></button></div>`;
                    }
                    if (/(?:youtube(?:-nocookie)?\.com|youtu\.be)/i.test(safe)) {
                        // Domain YouTube tapi bukan format video tunggal yang bisa di-embed (link channel/playlist/dll)
                        return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow" class="chat-file-link"><i class="fa-brands fa-youtube"></i> ${alt || 'Buka di YouTube'}</a>`;
                    }

                    const driveId = this.parseDriveId(safe);
                    if (driveId) {
                        const ext = this.getUrlExt(safe);
                        if (ext && !this.ALLOWED_DRIVE_EXT.includes(ext)) return ''; // jaga-jaga utk pesan lama; validasi utama di send()
                        if (ext === 'txt' || ext === 'doc' || ext === 'docx' || ext === 'md') {
                            return `<a href="https://drive.google.com/file/d/${driveId}/view" target="_blank" rel="noopener noreferrer nofollow" class="chat-file-link"><i class="fa-solid fa-file-lines"></i> ${alt || 'Buka file'}</a>`;
                        }
                        const isKnownImage = ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
                        if (isKnownImage) {
                            // Ekstensi gambar eksplisit ada di URL → coba thumbnail ringan dulu (bukan uc?export=view
                            // yang sering diblok Google utk hotlink & bikin gambar ke-kill). Gagal → fallback ke preview universal.
                            return `<img src="https://drive.google.com/thumbnail?id=${driveId}&sz=w1000" alt="${alt}" class="chat-media" loading="lazy" onerror="ChatFormat.driveFallback(this,'${driveId}','${alt}')">`;
                        }
                        // Ekstensi tidak diketahui (link share Drive standar TIDAK membawa ekstensi sama sekali —
                        // ini kasus paling umum), atau mp4/webm/mp3: pakai preview universal Drive, yang otomatis
                        // mendeteksi tipe file asli (video/gambar/audio/pdf) dan render dgn benar tanpa risiko hotlink-block.
                        return `<iframe class="chat-media chat-drive-generic" src="https://drive.google.com/file/d/${driveId}/preview" title="${alt || 'Drive'}" allow="autoplay" loading="lazy" onerror="this.remove()"></iframe>`;
                    }

                    // ── Spotify ──
                    const spotify = this.parseSpotifyId(safe);
                    if (spotify) {
                        const spotifyCls = spotify.type === 'track' ? 'chat-spotify-track' : 'chat-spotify-list';
                        return `<iframe class="chat-media ${spotifyCls}" src="https://open.spotify.com/embed/${spotify.type}/${spotify.id}?utm_source=generator" title="${alt || 'Spotify'}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" onerror="this.remove()"></iframe>`;
                    }

                    // ── Google Maps ──
                    if (/google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(safe)) {
                        const q = this.parseMapsQuery(safe);
                        if (q) {
                            return `<iframe class="chat-media chat-maps" src="https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed" title="${alt || 'Lokasi Peta'}" loading="lazy" onerror="this.remove()"></iframe>`;
                        }
                        return alt || '';
                    }

                    if (/\.(mp4|webm|ogv)(\?.*)?$/i.test(safe)) {
                        return `<div class="chat-media-wrap" id="${mid}"><video src="${safe}" class="chat-media" ${mutedCls ? 'muted' : ''} ${wantAutoplay ? 'autoplay' : ''} ${mp.loop ? 'loop' : ''} playsinline onerror="this.closest('.chat-media-wrap')?.remove()"></video><button type="button" class="media-mute-btn ${mutedCls}" onclick="ChatFormat.toggleMediaMute(this,'video')" title="Suara"><i class="fa-solid fa-volume-${volIcon}"></i></button></div>`;
                    }
                    return `<img src="${safe}" alt="${alt}" class="chat-media" loading="lazy" onerror="this.remove()">`;
                });

                // [label](url) → tautan biasa
                text = text.replace(/\[([^\[\]]+)\]\(([^()]+)\)/g, (m, label, url) => {
                    const safe = this.isSafeUrl(url) ? url : '#';
                    return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
                });

                // > kutipan baris
                text = text.split('\n').map(line => {
                    const m = line.match(/^&gt;\s?(.*)$/);
                    return m ? `<span class="chat-quote">${m[1]}</span>` : line;
                }).join('\n');

                text = text.replace(/\*([^\*\n]+)\*/g, '<b>$1</b>');           // *bold*
                text = text.replace(/_([^_\n]+)_/g, '<u>$1</u>');             // _underline_
                text = text.replace(/~([^~\n]+)~/g, '<s>$1</s>');             // ~coret~
                text = text.replace(/&quot;([^&\n]+)&quot;/g, '<q class="chat-inline-quote">$1</q>'); // "kutip"

                return text.replace(/\n/g, '<br>');
            },

            // Versi ringkas teks-saja (untuk marquee/toast) — tanpa tag/media biar tidak merusak layout scroll.
            toPlain(raw) {
                let text = String(raw);
                text = text.replace(/\[([^\[\]]*)\]\{([^{}]+)\}/g, (m, alt) => alt ? `📷 ${alt}` : '📷');
                text = text.replace(/\[([^\[\]]+)\]\(([^()]+)\)/g, (m, label) => label);
                text = text.replace(/^>\s?/gm, '');
                text = text.replace(/\*([^\*\n]+)\*/g, '$1');
                text = text.replace(/_([^_\n]+)_/g, '$1');
                text = text.replace(/~([^~\n]+)~/g, '$1');
                text = text.replace(/\n/g, ' ');
                return this.esc(text);
            }
        };

        const GlobalChat = {
            db: null,
            unsub: null,
            myIp: null,
            isOpen: false,
            lastCount: 0,
            started: false,
            lastSendTime: 0,
            localMessages: [], 

            presenceId: null,
            presenceUnsub: null,
            presenceInterval: null,
            myDevice: null,
            onlineMap: {},
            onlineListOpen: false,

            // ── Notifikasi ──
            notifEnabled: false,
            initTime: 0,
            seenIds: new Set(),

            // Dipanggil HANYA saat tombol "BUKA AKSES DATA" ditekan
            start() {
                if (this.started) return;
                this.started = true;
                this.notifEnabled = localStorage.getItem('nufa_chat_notif') === 'on';
                this._updateNotifBtn();

                this.wideMode = localStorage.getItem('nufa_chat_wide') === 'on';
                if (this.wideMode) document.getElementById('chat-panel').classList.add('wide');

                this.matrixOn = localStorage.getItem('nufa_matrix_on') !== 'off';
                if (typeof MatrixFX !== 'undefined') MatrixFX.setEnabled(this.matrixOn);

                // Lite Mode: default OFF kecuali user pernah nyalain manual sebelumnya.
                this.liteMode = localStorage.getItem('nufa_lite_mode') === 'on';
                this._applyLiteMode(this.liteMode);
                this.initBackgroundHandling();

                this.init();
            },

            async init() {
                this.initTime = Date.now();
                this.myDevice = this._detectDevice();
                this.presenceId = sessionStorage.getItem('nufa_presence_id') || ('U-' + Math.random().toString(36).slice(2, 9));
                sessionStorage.setItem('nufa_presence_id', this.presenceId);

                const devIconEl = document.getElementById('chat-device-icon');
                const devLabelEl = document.getElementById('chat-device-label');
                if (devIconEl) { devIconEl.className = 'fa-brands ' + this.myDevice.icon + (
                    // fa-android, fa-apple, fa-windows, fa-linux semuanya brands
                    // fa-question-circle adalah solid
                    this.myDevice.icon === 'fa-question-circle' ? ' fa-solid' : ' fa-brands'
                ).replace('fa-brands fa-brands', 'fa-brands'); }
                if (devLabelEl) devLabelEl.textContent = this.myDevice.label;

                // Ambil IP publik pengirim (dipakai untuk ditampilkan ke semua orang, tanpa login)
                const ipDisplayEl = document.getElementById('chat-myip-display');
                if (ipDisplayEl) ipDisplayEl.textContent = 'Mengambil...';
                try {
                    const r = await fetch('https://api.ipify.org?format=json');
                    const d = await r.json();
                    this.myIp = d.ip;
                    if (ipDisplayEl) ipDisplayEl.textContent = this.myIp;
                } catch (e) {
                    this.myIp = 'UNKNOWN';
                    if (ipDisplayEl) ipDisplayEl.textContent = 'UNKNOWN';
                }
                // Perbaiki ikon device setelah kita punya semua info
                if (devIconEl) {
                    const isBrand = ['fa-android','fa-apple','fa-windows','fa-linux'].includes(this.myDevice.icon);
                    devIconEl.className = (isBrand ? 'fa-brands ' : 'fa-solid ') + this.myDevice.icon;
                }

                const configured = FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('GANTI');
                if (configured && typeof firebase !== 'undefined') {
                    try {
                        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
                        this.db = firebase.firestore();
                        try {
                            await this.db.enablePersistence({ synchronizeTabs: true });
                        } catch (e) {
                            if (e.code === 'failed-precondition') {
                                console.warn('[Chat] Persistence gagal (multi-tab tanpa sync):', e.message);
                            } else if (e.code === 'unimplemented') {
                                console.warn('[Chat] Persistence tidak didukung browser ini.');
                            }
                        }
                        this.listen();
                        this.startPresence();
                        return;
                    } catch (e) {
                        console.warn('Firebase gagal init, fallback ke mode lokal:', e);
                    }
                }
                
                this.renderMessages([
                    { ip: 'SYSTEM', text: '⚠️ — chat ini cuma lokal di browser kamu sendiri. aktifkan internet untuk mengaktifkan global live chat sungguhan.', ts: Date.now() }
                ]);
                this.renderOnlineList({ [this.presenceId]: { device: this.myDevice, ts: Date.now() } });
            },

            listen() {
                this.db.collection('global_chat')
                    .orderBy('ts', 'desc')
                    .limit(50)
                    .onSnapshot((snap) => {
                        const msgs = [];
                        snap.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
                        msgs.reverse();
                        this.lastMsgs = msgs;
                        // Marquee ringan (teks doang) tetap update walau panel tertutup.
                        this.renderMarquee(msgs);
                        // Render list pesan (berat: bisa berisi iframe YouTube/Spotify/Drive/Maps)
                        // HANYA saat panel benar-benar terbuka, biar gak nge-rebuild+reload iframe
                        // media di background tiap ada pesan baru masuk (boros RAM di device low-end).
                        // Tambahan lite mode: kalau tab lagi hidden, render tetap di-skip (bukan cuma pas
                        // panel tertutup) — datanya tetap aman di this.lastMsgs, di-flush pas tab visible lagi.
                        if (this.isOpen && !(this.liteMode && document.hidden)) {
                            this.renderMessages(msgs);
                        } else if (this.isOpen) {
                            this._pendingRenderFlush = true;
                        }

                        // Notifikasi HP: hanya untuk pesan baru yang muncul setelah chat dibuka,
                        // bukan punya sendiri, dan toggle notifikasi sedang ON.
                        snap.docChanges().forEach(change => {
                            if (change.type !== 'added') return;
                            const m = change.doc.data();
                            const id = change.doc.id;
                            if (this.seenIds.has(id)) return;
                            this.seenIds.add(id);
                            if (m.ts && m.ts < this.initTime) return; // pesan lama saat load awal
                            if (m.uid ? m.uid === this.presenceId : m.ip === this.myIp) return; // jangan notif pesan sendiri
                            this.notify(m);
                            if (window.NufaNotify) window.NufaNotify.trigger(m);
                        });

                        if (!this.isOpen && msgs.length > this.lastCount) {
                            document.getElementById('chat-dot').style.display = 'block';
                        }
                        this.lastCount = msgs.length;
                    }, (err) => console.warn('Chat listen error:', err));
            },

            // ── PRESENCE: tandai device ini online (push-based, real-time lintas perangkat) ──

            startPresence() {
                if (!FIREBASE_CONFIG.databaseURL || !firebase.database) {
                    console.warn('Realtime Database belum dikonfigurasi — presence fallback ke mode polling Firestore.');
                    return this.startPresenceFallback();
                }

                const rtdb = firebase.database();
                const myIpKey = this._ipKey(this.myIp);
                const presenceRef = rtdb.ref('presence_global/' + this.presenceId);
                const connectedRef = rtdb.ref('.info/connected');
                this.onlineMap = this._groupByIp({
                    [this.presenceId]: { ip: this.myIp, device: this.myDevice, ts: Date.now() }
                });
                this.renderOnlineList(this.onlineMap);

                // Setiap kali koneksi ke Firebase tersambung (termasuk reconnect otomatis
                
                connectedRef.on('value', (snap) => {
                    if (snap.val() === false) return;
                    presenceRef.set({
                        ipKey: myIpKey,
                        ip: this.myIp,
                        device: this.myDevice,
                        ts: firebase.database.ServerValue.TIMESTAMP
                    }).catch(err => {
                        console.error('[Presence] Gagal set data online — cek Realtime Database Rules (write) & databaseURL:', err);
                    });
                    presenceRef.onDisconnect().remove().catch(err => {
                        console.error('[Presence] Gagal set onDisconnect handler:', err);
                    });
                });

                const goOffline = () => { try { presenceRef.remove(); } catch (e) {} };
                window.addEventListener('pagehide', goOffline);
                window.addEventListener('beforeunload', goOffline);

                // onValue di sini PUSH dari server tiap ada perubahan — bukan polling —
                
                rtdb.ref('presence_global').on('value', (snap) => {
                    const data = snap.val() || {};
                    // FIX: kalau snapshot server belum sempat menyertakan device
                    // sendiri (misal baru konek), tetap selipkan biar DOT sendiri
                    // gak sempat hilang/flicker.
                    if (!data[this.presenceId]) {
                        data[this.presenceId] = { ip: this.myIp, device: this.myDevice, ts: Date.now() };
                    }
                    const grouped = this._groupByIp(data);
                    this.onlineMap = grouped;
                    this.renderOnlineList(grouped);
                }, (err) => console.error('[Presence] Gagal baca daftar online — cek Realtime Database Rules (read):', err));
            },

            // Kelompokkan entri presence berdasarkan IP, supaya 1 IP dengan banyak
            
            _groupByIp(data) {
                const byIp = {};
                Object.keys(data).forEach(id => {
                    const d = data[id];
                    if (!d) return;
                    const key = d.ipKey || this._ipKey(d.ip);
                    if (!byIp[key]) {
                        byIp[key] = { ip: d.ip, device: d.device, ts: d.ts, count: 1, ids: [id], isYou: id === this.presenceId };
                    } else {
                        byIp[key].count += 1;
                        byIp[key].ids.push(id);
                        byIp[key].ts = Math.max(byIp[key].ts || 0, d.ts || 0);
                        if (id === this.presenceId) byIp[key].isYou = true;
                    }
                });
                return byIp;
            },

            _ipKey(ip) {
                return String(ip || 'UNKNOWN').replace(/[.#$\[\]/]/g, '_');
            },

            
            startPresenceFallback() {
                const ref = this.db.collection('presence_global').doc(this.presenceId);
                const beat = () => ref.set({ ip: this.myIp, device: this.myDevice, ts: Date.now() }).catch(() => {});
                this._presenceBeat = beat;
                beat();
                this._presenceIntervalMs = 8000;
                this.presenceInterval = setInterval(beat, this._presenceIntervalMs);

                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') beat();
                });

                const goOffline = () => { try { ref.delete(); } catch (e) {} };
                window.addEventListener('pagehide', goOffline);
                window.addEventListener('beforeunload', goOffline);

                this.db.collection('presence_global').onSnapshot((snap) => {
                    const now = Date.now();
                    const data = {};
                    // TTL ngikutin interval heartbeat aktif (2.5x) — biar lite mode (heartbeat 20s)
                    // gak keliatan flicker offline-online tiap siklus karena threshold ketinggalan.
                    const ttl = Math.round((this._presenceIntervalMs || 8000) * 2.5);
                    snap.forEach(doc => {
                        const d = doc.data();
                        if (d.ts && now - d.ts < ttl) data[doc.id] = d;
                    });
                    const grouped = this._groupByIp(data);
                    this.onlineMap = grouped;
                    this.renderOnlineList(grouped);
                }, (err) => console.warn('Presence listen error:', err));
            },

            renderOnlineList(map) {
                const ids = Object.keys(map);
                
                // MENGUBAH CARA MENGHITUNG COUNT:
                // Menjumlahkan semua d.count dari setiap item di map. 
                // Jika d.count tidak ada/undifined, default ke 1.
                const count = ids.reduce((total, key) => total + (map[key].count || 1), 0);

                const countEl = document.getElementById('chat-online-count');
                if (countEl) {
                    const prev = this._prevOnlineCount;
                    countEl.innerHTML = `<span class="num">${count}</span> ONLINE`;
                    if (typeof prev === 'number' && prev !== count) {
                        countEl.classList.remove('bump');
                        void countEl.offsetWidth;
                        countEl.classList.add('bump');
                    }
                    this._prevOnlineCount = count;
                }
                const updEl = document.getElementById('chat-online-updated');
                if (updEl) updEl.textContent = '• ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                const listEl = document.getElementById('chat-online-list');
                if (!listEl) return;
const brandIcons = ['fa-android','fa-apple','fa-windows','fa-linux'];
listEl.innerHTML = ids.map(key => {
    const d = map[key];
    const rawIcon = (d.device && d.device.icon) ? d.device.icon : 'fa-mobile-screen';
    const iconClass = brandIcons.includes(rawIcon) ? `fa-brands ${rawIcon}` : `fa-solid ${rawIcon}`;
    const isYou = d.isYou;
    const ipDisplay = isYou ? this.myIp : this._maskIp(d.ip);
    const tag = isYou
        ? '<span class="you-tag">ANDA</span>'
        : '<span class="you-tag" style="background:var(--glitch-red);box-shadow:0 0 8px rgba(255,0,60,0.5);">ANON</span>';
    return `
        <div class="chat-online-item">
            <span class="chat-online-avatar"><i class="${iconClass}"></i></span>
            <span class="label">
                <span>${this._esc(ipDisplay || 'Perangkat')}${d.count > 1 ? ` <small>(${d.count} LIVE)</small>` : ''}</span>
                <small>${this._esc(d.device ? d.device.label : 'Perangkat')} • live</small>
            </span>
            ${tag}
        </div>`;
}).join('') || '<div class="chat-online-item">// Tidak ada yang online</div>';
            },

            toggleOnlineList() {
                this.onlineListOpen = !this.onlineListOpen;
                document.getElementById('chat-online-list').classList.toggle('expanded', this.onlineListOpen);
                document.getElementById('chat-dashboard').classList.toggle('expanded', this.onlineListOpen);
                if (typeof AudioFX !== 'undefined') AudioFX.click();
            },

// ── NOTIFIKASI HP ──
            async toggleNotif() {
                if (typeof AudioFX !== 'undefined') AudioFX.click();
                if (!this.notifEnabled) {
                    if ('Notification' in window && Notification.permission === 'default') {
                        const permission = await Notification.requestPermission();
                        if (permission !== 'granted') {
                            this._showToast({ ip: 'SYSTEM', text: '⚠ Izin notifikasi ditolak browser.' });
                            return;
                        }
                    }
                    if (Notification.permission !== 'granted') {
                        this._showToast({ ip: 'SYSTEM', text: '⚠ Izin notifikasi diblokir — aktifkan manual di pengaturan browser.' });
                        return;
                    }
                    this.notifEnabled = true;
                    localStorage.setItem('nufa_chat_notif', 'on');
                    this._showToast({ ip: 'SYSTEM', text: '🔔 Notifikasi aktif — kamu akan dapat alert untuk setiap chat baru.' });
                    if (window.NufaNotify) window.NufaNotify.requestPermission();
                } else {
                    this.notifEnabled = false;
                    localStorage.setItem('nufa_chat_notif', 'off');
                    this._showToast({ ip: 'SYSTEM', text: '🔕 Notifikasi dimatikan.' });
                }
                this._updateNotifBtn();
            },

            _updateNotifBtn() {
                const btn = document.getElementById('chat-notif-toggle');
                if (!btn) return;
                btn.classList.toggle('notif-on', this.notifEnabled);
                btn.innerHTML = this.notifEnabled ? '<i class="fa-solid fa-bell"></i>' : '<i class="fa-solid fa-bell-slash"></i>';
            },

            async notify(m) {
                if (!this.notifEnabled) return;

                // Lapis 1: Toast in-app — jalan di semua device
                this._showToast(m);

                // Lapis 2: Vibrasi HP
                if (navigator.vibrate) { try { navigator.vibrate([180, 80, 180]); } catch (e) {} }

                // Lapis 3: Pulse tombol chat
                const chatBtn = document.getElementById('chat-btn');
                if (chatBtn) {
                    chatBtn.classList.remove('pulse-alert');
                    void chatBtn.offsetWidth;
                    chatBtn.classList.add('pulse-alert');
                }

                // Lapis 4: OS Notification via Service Worker (bekerja di Android)
                if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
                    try {
                        const reg = await navigator.serviceWorker.ready;
                        reg.showNotification('💬 ' + this._maskIp(m.ip || 'Anonim') + ' • Global Live Chat', {
                            body: WordFilter.clean(m.text),
                            tag: 'nufa-global-chat',
                            renotify: true,
                            icon: '/appcover.jpg',
                            badge: '/notif.png',
                            vibrate: [200, 100, 200],
                        });
                    } catch (e) { console.warn('Gagal kirim OS notification:', e); }
                }
            },

            _showToast(m) {
                const stack = document.getElementById('chat-toast-stack');
                if (!stack) return;
                const el = document.createElement('div');
                el.className = 'chat-toast';
                el.innerHTML = `<span class="t-ip"><i class="fa-solid fa-comment-dots"></i> ${this._esc(m.ip === 'SYSTEM' ? 'SYSTEM' : (this._maskIp(m.ip) || 'Anonim'))}</span>${ChatFormat.toPlain(WordFilter.clean(m.text))}`;
                el.onclick = () => { this.toggle(true); el.remove(); };
                stack.appendChild(el);
                setTimeout(() => el.remove(), 4100);
                // batasi maksimal 3 toast bertumpuk biar gak penuh layar
                while (stack.children.length > 3) stack.removeChild(stack.firstChild);
            },

            _detectDevice() {
                const ua = navigator.userAgent || '';
                let os = 'Unknown OS';
                let icon = 'fa-question-circle';
                // Urutan penting: Android sebelum Linux, iOS sebelum Macintosh
                if (/android/i.test(ua)) { os = 'Android'; icon = 'fa-android'; }
                else if (/iphone/i.test(ua)) { os = 'iPhone (iOS)'; icon = 'fa-apple'; }
                else if (/ipad/i.test(ua)) { os = 'iPad (iOS)'; icon = 'fa-apple'; }
                else if (/ipod/i.test(ua)) { os = 'iPod (iOS)'; icon = 'fa-apple'; }
                else if (/windows/i.test(ua)) { os = 'Windows'; icon = 'fa-windows'; }
                else if (/macintosh|mac os x/i.test(ua)) { os = 'MacOS'; icon = 'fa-apple'; }
                else if (/linux/i.test(ua)) { os = 'Linux'; icon = 'fa-linux'; }

                let browser = 'Browser';
                if (/edg\//i.test(ua)) browser = 'Edge';
                else if (/opr\//i.test(ua)) browser = 'Opera';
                else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
                else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
                else if (/safari/i.test(ua)) browser = 'Safari';

                return { label: `${os} • ${browser}`, icon };
            },

            renderMessages(msgs) {
                const box = document.getElementById('chat-messages');
                // User masih dianggap "di bawah" kalau jarak ke dasar <120px — cuma dalam kondisi ini
                // render auto-scroll ke pesan terbaru; kalau lagi baca histori di atas, posisi dijaga diam.
                const nearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 120;

                // Tombol muat riwayat selalu jadi elemen paling atas #chat-messages (dibuat sekali, live-mode saja).
                let historyBtn = document.getElementById('chat-load-history-btn');
                if (!historyBtn && this.db) {
                    historyBtn = document.createElement('button');
                    historyBtn.id = 'chat-load-history-btn';
                    historyBtn.type = 'button';
                    historyBtn.textContent = '↑ Muat 50 pesan lebih lama';
                    historyBtn.onclick = () => this.loadOlderMessages();
                    box.insertBefore(historyBtn, box.firstChild);
                }

                const key = m => m.id || (m.ts + '_' + m.ip);
                const wantedKeys = new Set(msgs.map(key));

                // Hapus node yang sudah gak ada di window pesan terbaru (kedorong keluar limit(50)) —
                // kecuali tombol riwayat & pesan histori (data-hist) yang sengaja hidup di luar window itu.
                Array.from(box.children).forEach(el => {
                    if (el === historyBtn || el.dataset.hist === '1') return;
                    if (!wantedKeys.has(el.dataset.key)) el.remove();
                });

                // Node existing TIDAK di-rebuild — supaya iframe media (YouTube/Spotify/Drive/Maps)
                // yang sudah kepasang di pesan lama gak ikut ke-destroy & reload tiap ada pesan baru masuk.
                const existingKeys = new Set(Array.from(box.children).map(el => el.dataset.key));
                let lastEl = null;
                msgs.forEach(m => {
                    const k = key(m);
                    if (existingKeys.has(k)) { lastEl = box.querySelector(`[data-key="${CSS.escape(k)}"]`); return; }
                    const el = document.createElement('div');
                    el.className = 'chat-msg';
                    el.dataset.key = k;
                    el.dataset.ts = m.ts;
                    el.innerHTML = `
                        <span class="chat-ip">${this._esc(m.ip === 'SYSTEM' ? 'SYSTEM' : (this._maskIp(m.ip) || 'ANONIM'))} • ${this._time(m.ts)}</span>
                        <span class="chat-text">${ChatFormat.toHtml(WordFilter.clean(m.text))}</span>
                    `;
                    if (lastEl && lastEl.nextSibling) box.insertBefore(el, lastEl.nextSibling);
                    else box.appendChild(el);
                    lastEl = el;
                });

                // Cursor buat "muat lebih lama" berikutnya = ts pesan paling atas yang benar-benar ada di DOM.
                const oldestEl = box.querySelector('.chat-msg[data-ts]');
                if (oldestEl) this.historyOldestTs = Number(oldestEl.dataset.ts);

                if (nearBottom) box.scrollTop = box.scrollHeight;
                if (this.liteMode) this._observeLiteMedia();
            },

            // ── Muat 50 pesan lebih lama dari Firestore, disisipkan di atas tombolnya sendiri.
            // Dipanggil dari tombol "↑ Muat 50 pesan lebih lama" di puncak #chat-messages. ──
            historyOldestTs: null,
            historyLoading: false,
            historyExhausted: false,
            async loadOlderMessages() {
                if (!this.db || this.historyLoading || this.historyExhausted || !this.historyOldestTs) return;
                const box = document.getElementById('chat-messages');
                const btn = document.getElementById('chat-load-history-btn');
                this.historyLoading = true;
                if (btn) { btn.disabled = true; btn.textContent = 'Memuat...'; }
                try {
                    const snap = await this.db.collection('global_chat')
                        .orderBy('ts', 'desc')
                        .startAfter(this.historyOldestTs)
                        .limit(50)
                        .get();
                    const older = [];
                    snap.forEach(doc => older.push({ id: doc.id, ...doc.data() }));
                    older.reverse(); // desc (batch terbaru dulu) → ascending biar urutan render lama→baru benar

                    if (!older.length) {
                        this.historyExhausted = true;
                        if (btn) btn.textContent = 'Semua pesan sudah dimuat';
                        return;
                    }

                    const prevScrollHeight = box.scrollHeight;
                    const prevScrollTop = box.scrollTop;
                    const existingKeys = new Set(Array.from(box.children).map(el => el.dataset.key));
                    const key = m => m.id || (m.ts + '_' + m.ip);
                    let anchor = btn;
                    older.forEach(m => {
                        const k = key(m);
                        if (existingKeys.has(k)) return; // overlap dgn window live 50 — jangan dobel
                        const el = document.createElement('div');
                        el.className = 'chat-msg';
                        el.dataset.key = k;
                        el.dataset.hist = '1';
                        el.dataset.ts = m.ts;
                        el.innerHTML = `
                            <span class="chat-ip">${this._esc(m.ip === 'SYSTEM' ? 'SYSTEM' : (this._maskIp(m.ip) || 'ANONIM'))} • ${this._time(m.ts)}</span>
                            <span class="chat-text">${ChatFormat.toHtml(WordFilter.clean(m.text))}</span>
                        `;
                        anchor.after(el);
                        anchor = el;
                    });

                    const oldestEl = box.querySelector('.chat-msg[data-ts]');
                    if (oldestEl) this.historyOldestTs = Number(oldestEl.dataset.ts);

                    // Kunci posisi scroll biar viewport gak "loncat" pas 50 pesan lama nyempil di atas.
                    box.scrollTop = prevScrollTop + (box.scrollHeight - prevScrollHeight);

                    if (older.length < 50) {
                        this.historyExhausted = true;
                        if (btn) btn.textContent = 'Semua pesan sudah dimuat';
                    } else if (btn) {
                        btn.textContent = '↑ Muat 50 pesan lebih lama';
                    }
                } catch (e) {
                    console.warn('Gagal muat pesan lama:', e);
                    if (btn) btn.textContent = '↑ Muat 50 pesan lebih lama (gagal, coba lagi)';
                } finally {
                    this.historyLoading = false;
                    if (btn && !this.historyExhausted) btn.disabled = false;
                }
            },

            // ── E. Lite mode: satu video/YT aktif dalam satu waktu (bukan multi-autoplay).
            // Dipilih berdasarkan kedekatan ke tengah viewport & masih visible — bukan soal background,
            // ini murni hemat baterai/CPU saat chat dibuka (foreground), untuk komunikasi di kondisi
            // sinyal/listrik terbatas tapi tetap harus bisa lihat media satu-satu. ──
            _videoObserver: null,
            _activeLiteMedia: null,
            _setupLiteMediaObserver() {
                if (this._videoObserver) return this._videoObserver;
                this._videoObserver = new IntersectionObserver((entries) => {
                    if (!this.liteMode) return;
                    let best = null, bestDist = Infinity;
                    const viewCenter = window.innerHeight / 2;
                    entries.forEach(en => {
                        const media = en.target.querySelector('video, iframe.chat-yt, iframe.chat-yt-short');
                        if (!media) return;
                        if (!en.isIntersecting) {
                            if (media === this._activeLiteMedia) { this._pauseLiteMedia(media); this._activeLiteMedia = null; }
                            return;
                        }
                        const rect = en.boundingClientRect;
                        const dist = Math.abs((rect.top + rect.height / 2) - viewCenter);
                        if (dist < bestDist) { bestDist = dist; best = media; }
                    });
                    if (best && best !== this._activeLiteMedia) {
                        if (this._activeLiteMedia) this._pauseLiteMedia(this._activeLiteMedia);
                        // Tombol autoplay (MediaPrefs.autoplay) tetap jadi otoritas tunggal di lite mode juga —
                        // kalau user matiin, scroll-into-view TIDAK memicu play otomatis (baru main manual via tombol suara).
                        if (window.MediaPrefs && window.MediaPrefs.autoplay) {
                            this._playLiteMedia(best);
                            this._activeLiteMedia = best;
                        } else {
                            this._activeLiteMedia = null;
                        }
                    }
                }, { root: document.getElementById('chat-messages'), threshold: [0, 0.6] });
                return this._videoObserver;
            },
            _playLiteMedia(media) {
                if (media.tagName === 'VIDEO') { media.play().catch(() => {}); }
                else if (media.contentWindow) { media.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'); }
            },
            _pauseLiteMedia(media) {
                if (media.tagName === 'VIDEO') { media.pause(); }
                else if (media.contentWindow) { media.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*'); }
            },
            _observeLiteMedia() {
                const observer = this._setupLiteMediaObserver();
                document.querySelectorAll('#chat-messages .chat-media-wrap').forEach(wrap => {
                    if (wrap.querySelector('video, iframe.chat-yt, iframe.chat-yt-short')) observer.observe(wrap);
                });
            },

            renderMarquee(msgs) {
                const track = document.getElementById('chat-marquee-track');
                const bar = document.getElementById('chat-marquee-bar');
                if (!msgs.length) { bar.classList.remove('live'); return; }
                const recent = msgs.slice(-15);
                const html = recent.map(m =>
                    `<span class="mq-item"><span class="mq-ip">[${this._esc(m.ip === 'SYSTEM' ? 'SYSTEM' : (this._maskIp(m.ip) || 'ANONIM'))}]</span>${ChatFormat.toPlain(WordFilter.clean(m.text))}</span>`
                ).join('');
                // duplikat agar scroll infinite mulus
                track.innerHTML = html + html;
                bar.classList.add('live');
            },

            _esc(s) {
                return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
            },

            _maskIp(ip) {
                return IpMask.apply(ip);
            },

            _time(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
},

            // Textarea melebar otomatis mengikuti isi (ala WhatsApp/Telegram), dibatasi max-height (CSS)
            autoGrow(el) {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
            },

            // Sisip pasangan simbol format di sekitar teks yang diseleksi (atau placeholder kalau belum pilih apa-apa)
            _wrapSelection(before, after, placeholder) {
                const el = document.getElementById('chat-input');
                if (!el) return;
                el.focus();
                const start = el.selectionStart, end = el.selectionEnd;
                const val = el.value;
                const sel = val.slice(start, end) || placeholder;
                el.value = val.slice(0, start) + before + sel + after + val.slice(end);
                const from = start + before.length;
                el.setSelectionRange(from, from + sel.length);
                this.autoGrow(el);
            },

            // Sisip prefix di awal baris tempat kursor berada (untuk kutipan baris ">")
            _prefixLine(prefix) {
                const el = document.getElementById('chat-input');
                if (!el) return;
                el.focus();
                const start = el.selectionStart;
                const val = el.value;
                const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                el.value = val.slice(0, lineStart) + prefix + val.slice(lineStart);
                const pos = start + prefix.length;
                el.setSelectionRange(pos, pos);
                this.autoGrow(el);
            },

            // Dipanggil dari tombol helper format di atas kolom kirim
            insertFormat(type) {
                if (typeof AudioFX !== 'undefined') AudioFX.click();
                switch (type) {
                    case 'bold':         this._wrapSelection('*', '*', 'tebal'); break;
                    case 'underline':    this._wrapSelection('_', '_', 'garis bawah'); break;
                    case 'strike':       this._wrapSelection('~', '~', 'coret'); break;
                    case 'quote-inline': this._wrapSelection('"', '"', 'kutip'); break;
                    case 'link':         this._wrapSelection('[', '](https://)', 'teks link'); break;
                    case 'media':        this._wrapSelection('[', ']{https://}', 'alt gambar-video-Display'); break;
                }
            },

            toggle(forceOpen) {
                this.isOpen = typeof forceOpen === 'boolean' ? forceOpen : !this.isOpen;
                document.getElementById('chat-panel').classList.toggle('open', this.isOpen);
                if (this.isOpen) {
                    document.getElementById('chat-dot').style.display = 'none';
                    // Sinkronkan list pesan (termasuk render iframe media) baru saat panel dibuka —
                    // selama tertutup renderMessages() sengaja di-skip biar hemat RAM.
                    if (this.lastMsgs) this.renderMessages(this.lastMsgs);
                }
                if (typeof AudioFX !== 'undefined') AudioFX.click();

                // Chat-first: BGM utama baru dilanjutkan setelah modal chat ditutup, bukan bersamaan,
                // dan hanya kalau tidak ada suara media chat yang lagi aktif.
                if (!this.isOpen && typeof System !== 'undefined' && System.bgm
                    && localStorage.getItem('nufa_music') === 'on'
                    && System.bgm.paused && (this.activeMediaSoundCount || 0) === 0) {
                    System.bgm.play().catch(() => {});
                }
            },

            // ── Pengaturan tampilan media (gear, kembar dari toolbar rich-text) ──
            activeMediaSoundCount: 0,
            toggleMediaSettings() {
                if (typeof AudioFX !== 'undefined') AudioFX.click();
                const panel = document.getElementById('media-settings-panel');
                const btn = document.getElementById('media-settings-btn');
                const nowOpen = !panel.classList.contains('open');
                panel.classList.toggle('open', nowOpen);
                btn.classList.toggle('on', nowOpen);
                if (nowOpen) {
                    document.getElementById('ms-autoplay').checked = MediaPrefs.autoplay;
                    document.getElementById('ms-loop').checked = MediaPrefs.loop;
                    document.getElementById('ms-sound').checked = MediaPrefs.soundDefault;
                    document.getElementById('ms-widescreen').checked = this.wideMode;
                    document.getElementById('ms-matrix').checked = this.matrixOn;
                    document.getElementById('ms-lite').checked = this.liteMode;
                }
            },
            updateMediaPref(key, checked) {
                if (MediaPrefs[key] !== checked) MediaPrefs.toggle(key);
                this._showToast({ ip: 'SYSTEM', text: `⚙ ${key === 'soundDefault' ? 'Suara default' : key === 'autoplay' ? 'Autoplay' : 'Loop'} media ${checked ? 'diaktifkan' : 'dimatikan'} — berlaku utk pesan berikutnya.` });
            },

            // ── A. Perlebar panel chat + animasi ke atas (default OFF) ──
            wideMode: false,
            toggleWideMode(checked) {
                if (typeof AudioFX !== 'undefined') AudioFX.click();
                this.wideMode = checked;
                const panel = document.getElementById('chat-panel');
                panel.classList.toggle('wide', checked);
                panel.classList.add('expanding');
                setTimeout(() => panel.classList.remove('expanding'), 500);
                try { localStorage.setItem('nufa_chat_wide', checked ? 'on' : 'off'); } catch(e) {}
                this._showToast({ ip: 'SYSTEM', text: `⚙ Panel chat ${checked ? 'diperlebar' : 'dikembalikan normal'}.` });
            },

            // ── B. Toggle rain matrix number (default ON) ──
            matrixOn: true,
            toggleMatrixRain(checked) {
                if (typeof AudioFX !== 'undefined') AudioFX.click();
                this.matrixOn = checked;
                // Lite Mode override: kalau lite aktif, rain tetap mati walau checkbox ini dinyalain.
                if (typeof MatrixFX !== 'undefined') MatrixFX.setEnabled(this.liteMode ? false : checked);
                try { localStorage.setItem('nufa_matrix_on', checked ? 'on' : 'off'); } catch(e) {}
                this._showToast({ ip: 'SYSTEM', text: `⚙ Animasi rain matrix ${checked ? 'diaktifkan' : 'dimatikan'}.` });
            },

            // ── C. Lite Mode: sinergi dengan fix render incremental — matiin efek visual berat
            // (matrix rain, blur backdrop, animasi loop) yang always-on terlepas dari panel dibuka/tutup.
            // Default OFF; gak ganggu render pesan/iframe media yang udah dioptimasi sebelumnya. ──
            liteMode: false,
            _applyLiteMode(on) {
                document.documentElement.classList.toggle('lite-mode', on);
                // Lite mode override: matrix rain paksa mati walau toggle matrixOn terpisah nyala.
                if (typeof MatrixFX !== 'undefined') MatrixFX.setEnabled(on ? false : this.matrixOn);
            },
            toggleLiteMode(checked) {
                if (typeof AudioFX !== 'undefined') AudioFX.click();
                this.liteMode = checked;
                this._applyLiteMode(checked);
                try { localStorage.setItem('nufa_lite_mode', checked ? 'on' : 'off'); } catch(e) {}
                this._showToast({ ip: 'SYSTEM', text: `⚙ Lite Mode ${checked ? 'diaktifkan — efek visual berat & audio background dimatikan' : 'dimatikan — audio background & multi-media autoplay aktif lagi'}.` });
                // Kalau lite dinyalain SAAT tab lagi hidden (jarang tapi mungkin, misal toggle dari
                // notifikasi/PiP), langsung terapkan efek pause-nya juga tanpa nunggu visibilitychange berikutnya.
                if (checked && document.hidden) this._onHiddenAudio();
            },

            // ── D. Background/Foreground handling: audio, presence heartbeat, render cache ──
            // Dipisah dari efek visual (poin C) karena ini soal hemat baterai & RAM saat tab
            // di-background, bukan soal device low-end. Satu listener visibilitychange dipakai
            // buat semua tiga hal ini biar gak numpuk banyak listener terpisah (hemat RAM).
            _bgHandlerInit: false,
            _bgAudioWasPlaying: false,
            _pendingRenderFlush: false,
            initBackgroundHandling() {
                if (this._bgHandlerInit) return;
                this._bgHandlerInit = true;

                if ('mediaSession' in navigator) {
                    try {
                        navigator.mediaSession.metadata = new MediaMetadata({
                            title: 'SMK Nurul Falah — Ambient BGM',
                            artist: 'Global Chat',
                        });
                        // Handler ini yang bikin "geser dari notif/lock screen → suara ilang" jalan mulus:
                        // pause di sini pause beneran elemen audio-nya, bukan cuma UI kontrolnya.
                        navigator.mediaSession.setActionHandler('play', () => {
                            if (System.bgm && localStorage.getItem('nufa_music') === 'on') System.bgm.play().catch(() => {});
                        });
                        navigator.mediaSession.setActionHandler('pause', () => {
                            if (System.bgm) System.bgm.pause();
                        });
                    } catch (e) { console.warn('[BG] mediaSession setup gagal:', e); }
                }

                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) this._onHiddenAudio();
                    else this._onVisibleAudio();
                });
            },

            _onHiddenAudio() {
                if (this.liteMode) {
                    // Lite: pause total (BGM + media chat aktif) buat hemat baterai.
                    this._bgAudioWasPlaying = !!(System.bgm && !System.bgm.paused);
                    if (System.bgm) System.bgm.pause();
                    document.querySelectorAll('#chat-messages video').forEach(v => v.pause());
                    document.querySelectorAll('#chat-messages iframe.chat-yt, #chat-messages iframe.chat-yt-short').forEach(f => {
                        if (f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
                    });
                    this._activeLiteMedia = null;
                    // Feedback murah: icon tombol musik existing dipakai lagi (gak spawn elemen baru).
                    if (System.musicIcon) System.musicIcon.innerText = '💤';
                    this._setPresenceInterval(20000); // hemat baterai: heartbeat dilonggarin
                } else {
                    // Non-lite: BGM udah dipegang mediaSession, tapi browser (terutama mobile) tetap
                    // cenderung auto-pause <video>/iframe YT begitu tab di-background walau kita gak
                    // pernah manggil .pause() sendiri. Watchdog ini nge-nudge play lagi tiap beberapa
                    // detik biar video/YT/loop-nya keliatan "gak berhenti" — sama kayak Firestore
                    // listener yang emang gak pernah putus. Spotify & Drive iframe TIDAK punya API kontrol
                    // publik, jadi keduanya di luar jangkauan fix ini (limitasi platform, bukan bug kita).
                    this._startBgMediaWatchdog();
                }
            },

            _onVisibleAudio() {
                if (this.liteMode) {
                    if (this._bgAudioWasPlaying && System.bgm && localStorage.getItem('nufa_music') === 'on') {
                        System.bgm.play().catch(() => {});
                    }
                    if (System.musicIcon) System.musicIcon.innerText = (System.bgm && System.bgm.paused) ? '🔇' : '🔊';
                    this._setPresenceInterval(8000);
                    // Data dari onSnapshot yang ketahan pas hidden tetap kepegang di this.lastMsgs
                    // (listener gak pernah berhenti) — tinggal di-flush ke DOM sekali di sini.
                    if (this._pendingRenderFlush && this.isOpen && this.lastMsgs) {
                        this.renderMessages(this.lastMsgs);
                    }
                    this._pendingRenderFlush = false;
                } else {
                    this._stopBgMediaWatchdog();
                }
            },

            // Watchdog nudge-play buat non-lite mode: interval pendek, cuma nyala pas hidden & non-lite,
            // langsung mati pas balik visible atau lite mode dinyalain — gak numpuk di RAM lama-lama.
            _bgMediaWatchdog: null,
            _startBgMediaWatchdog() {
                if (this._bgMediaWatchdog) return;
                this._bgMediaWatchdog = setInterval(() => {
                    if (this.liteMode || !document.hidden) { this._stopBgMediaWatchdog(); return; }
                    document.querySelectorAll('#chat-messages video[loop]').forEach(v => { if (v.paused) v.play().catch(() => {}); });
                    document.querySelectorAll('#chat-messages iframe.chat-yt, #chat-messages iframe.chat-yt-short').forEach(f => {
                        if (f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                    });
                }, 5000);
            },
            _stopBgMediaWatchdog() {
                if (this._bgMediaWatchdog) { clearInterval(this._bgMediaWatchdog); this._bgMediaWatchdog = null; }
            },
            // No-op kalau presence pakai jalur RTDB (startPresence), karena itu push-based, bukan polling.
            _setPresenceInterval(ms) {
                if (!this.presenceInterval || !this._presenceBeat || this._presenceIntervalMs === ms) return;
                clearInterval(this.presenceInterval);
                this._presenceIntervalMs = ms;
                this.presenceInterval = setInterval(this._presenceBeat, ms);
            },

            // Redundansi suara: kalau ada media chat yang unmute, kunci tombol BGM utama biar tidak dobel suara.
            handleMediaSoundToggle(isPlaying) {
                this.activeMediaSoundCount = Math.max(0, (this.activeMediaSoundCount || 0) + (isPlaying ? 1 : -1));
                const musicBtn = document.getElementById('music-btn');
                if (musicBtn) musicBtn.classList.toggle('sound-locked', this.activeMediaSoundCount > 0);
                if (typeof System !== 'undefined' && System.bgm && this.activeMediaSoundCount > 0 && !System.bgm.paused) {
                    System.bgm.pause();
                }
            },

            // ── Kirim pesan, dengan cooldown anti-spam + filter kata kasar ──
            async send() {
                const sendBtn = document.getElementById('chat-send');
                const now = Date.now();
                const elapsed = now - this.lastSendTime;

                // Masih dalam cooldown → blok kirim, tampilkan sisa waktu di tombol.
                if (elapsed < SEND_COOLDOWN_MS) {
                    this._flashCooldown(sendBtn, SEND_COOLDOWN_MS - elapsed);
                    return;
                }

                const input = document.getElementById('chat-input');
                const rawText = input.value.trim();
                if (!rawText) return;

                // Ban format Drive yang tak didukung — pesan tidak ditampilkan & tidak dikirim.
                const badExt = ChatFormat.validateEmbeds(rawText);
                if (badExt) {
                    this._showToast({ ip: 'SYSTEM', text: `⛔ Format .${badExt} tak didukung — pesan tidak dikirim.` });
                    return;
                }

                input.value = '';
                this.autoGrow(input);

                this.lastSendTime = now;
                this._lockSendButton(sendBtn, SEND_COOLDOWN_MS);

                // Kata kasar otomatis disensor jadi tanda bintang sebelum disimpan.
                const text = WordFilter.clean(rawText.slice(0, 1024));

                const payload = {
                    ip: this._maskIp(this.myIp),
                    uid: this.presenceId,
                    text,
                    ts: now
                };

                if (this.db) {
                    try {
                        await this.db.collection('global_chat').add(payload);
                    } catch (e) {
                        console.warn('Gagal kirim ke server, simpan lokal:', e);
                        this.localMessages.push(payload);
                        this.renderMessages(this.localMessages);
                    }
                } else {
                    this.localMessages.push(payload);
                    this.renderMessages(this.localMessages);
                }
                if (typeof AudioFX !== 'undefined') AudioFX.click();
            },

            _lockSendButton(btn, durationMs) {
                if (!btn) return;
                btn.disabled = true;
                btn.classList.add('cooldown');
                const startedAt = Date.now();
                const tick = () => {
                    const remain = durationMs - (Date.now() - startedAt);
                    if (remain <= 0) {
                        btn.disabled = false;
                        btn.classList.remove('cooldown');
                        btn.removeAttribute('data-cd');
                        return;
                    }
                    btn.setAttribute('data-cd', Math.ceil(remain / 1000) + 's');
                    requestAnimationFrame(tick);
                };
                tick();
            },
            _flashCooldown(btn) {
                if (!btn) return;
                btn.classList.add('cooldown');
                if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
            }
        };
