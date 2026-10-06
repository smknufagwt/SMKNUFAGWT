/* chat-format.js — parser format teks & embed media untuk /chat.
   Disalin dari ChatFormat di Global Live Chat (index.html) supaya output & tampilan sama persis
   (*tebal* _garis bawah_ ~coret~ "kutip" > baris [teks](url) [alt]{media}); tanpa dependensi ke GlobalChat. */
(function () {
    'use strict';

    // Preferensi media dibaca dari key localStorage yang sama dengan Global Live Chat
    const MediaPrefs = {
        autoplay: localStorage.getItem('nufa_media_autoplay') !== 'off',
        loop: localStorage.getItem('nufa_media_loop') !== 'off',
        soundDefault: localStorage.getItem('nufa_media_sound') === 'on',
    };
    window.MediaPrefs = MediaPrefs;

    // iframe YouTube selalu autoplay=0 di URL; playVideo ditembak via postMessage setelah onReady
    window.addEventListener('message', (e) => {
        let data;
        try { data = JSON.parse(e.data); } catch (err) { return; }
        if (data.event !== 'onReady' || !e.source) return;
        document.querySelectorAll('#chat-thread-messages iframe.chat-yt, #chat-thread-messages iframe.chat-yt-short').forEach((f) => {
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
            // Dipanggil sebelum kirim (sendMessage). Return null = aman, atau ekstensi yang diblok.
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
                
            },

            // Bangun iframe player YouTube asli, gantiin facade thumbnail. Dipicu dari
            // ChatFormat.observe (scroll masuk viewport) atau tap manual user.
            mountYouTube(facadeEl) {
                if (!facadeEl || facadeEl.dataset.mounted === '1') return;
                facadeEl.dataset.mounted = '1';
                if (ChatFormat._facadeObserver) ChatFormat._facadeObserver.unobserve(facadeEl);

                const ytId = facadeEl.dataset.ytId;
                const ytCls = facadeEl.dataset.ytCls;
                const wantAutoplay = facadeEl.dataset.autoplay === '1';
                const loop = facadeEl.dataset.loop === '1';
                const sound = facadeEl.dataset.sound === '1';
                const alt = facadeEl.dataset.alt || '';

                const ytParams = new URLSearchParams({
                    autoplay: '0',         // sengaja SELALU 0 di URL — play sungguhan ditembak lewat postMessage saat onReady (lihat listener di atas), biar gak bentrok sama loop
                    mute: sound ? '0' : '1',
                    loop: loop ? '1' : '0',
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

                const ifr = document.createElement('iframe');
                ifr.className = 'chat-media ' + ytCls;
                ifr.dataset.autoplay = wantAutoplay ? '1' : '0';
                ifr.src = `https://www.youtube-nocookie.com/embed/${ytId}?${ytParams.toString()}`;
                ifr.title = alt;
                ifr.setAttribute('allow', 'autoplay; encrypted-media');
                ifr.allowFullscreen = true;
                ifr.loading = 'lazy';
                ifr.onerror = () => ifr.closest('.chat-media-wrap')?.remove();

                facadeEl.replaceWith(ifr);

            },

            // Bangun iframe preview Drive asli (video/audio/dokumen tak dikenal), gantiin
            // facade thumbnail. Sama pola & dipicu dari titik yang sama kayak mountYouTube.
            mountDrive(facadeEl) {
                if (!facadeEl || facadeEl.dataset.mounted === '1') return;
                facadeEl.dataset.mounted = '1';
                if (ChatFormat._facadeObserver) ChatFormat._facadeObserver.unobserve(facadeEl);
                const driveId = facadeEl.dataset.driveId;
                const alt = facadeEl.dataset.alt || '';
                const ifr = document.createElement('iframe');
                ifr.className = 'chat-media chat-drive-generic';
                ifr.src = `https://drive.google.com/file/d/${driveId}/preview`;
                ifr.title = alt || 'Drive';
                ifr.setAttribute('allow', 'autoplay');
                ifr.loading = 'lazy';
                ifr.onerror = () => ifr.remove();
                facadeEl.replaceWith(ifr);
            },

            // Bangun iframe peta Google Maps asli, gantiin facade placeholder ikon.
            mountMaps(facadeEl) {
                if (!facadeEl || facadeEl.dataset.mounted === '1') return;
                facadeEl.dataset.mounted = '1';
                if (ChatFormat._facadeObserver) ChatFormat._facadeObserver.unobserve(facadeEl);
                const q = facadeEl.dataset.mapsQ || '';
                const alt = facadeEl.dataset.alt || '';
                const ifr = document.createElement('iframe');
                ifr.className = 'chat-media chat-maps';
                ifr.src = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`;
                ifr.title = alt || 'Lokasi Peta';
                ifr.loading = 'lazy';
                ifr.onerror = () => ifr.remove();
                facadeEl.replaceWith(ifr);
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
                    // ((lite mode tidak dipakai di /chat)) yang milih & nyalain satu-satu berdasarkan scroll.
                    const liteMode = false; // lite mode hanya ada di Global Live Chat
                    const wantAutoplay = mp.autoplay && !liteMode;

                    const ytId = this.parseYouTubeId(safe);
                    if (ytId) {
                        const isShort = /\/shorts\//i.test(safe);
                        const ytCls = isShort ? 'chat-yt-short' : 'chat-yt';
                        const thumbUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
                        // Facade: cuma thumbnail statis (image biasa, aman di-cache SW) dulu yang dirender.
                        // Iframe player sungguhan baru dimount oleh ChatFormat.mountYouTube — dipicu scroll
                        // masuk viewport (lihat ChatFormat.observe) atau tap manual — biar chat
                        // yang berisi banyak video gak nembak request player YouTube sekaligus di awal.
                        return `<div class="chat-media-wrap" id="${mid}"><div class="chat-yt-facade ${ytCls}" style="background-image:url('${thumbUrl}')" data-yt-id="${ytId}" data-yt-cls="${ytCls}" data-autoplay="${wantAutoplay ? '1' : '0'}" data-loop="${mp.loop ? '1' : '0'}" data-sound="${mp.soundDefault ? '1' : '0'}" data-alt="${alt}" onclick="ChatFormat.mountYouTube(this)"><button type="button" class="yt-facade-play" tabindex="-1" aria-hidden="true"><i class="fa-solid fa-play"></i></button></div><button type="button" class="media-mute-btn ${mutedCls}" onclick="ChatFormat.toggleMediaMute(this,'yt')" title="Suara"><i class="fa-solid fa-volume-${volIcon}"></i></button></div>`;
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
                        // Facade dulu (thumbnail Drive, endpoint sama kayak gambar di atas) — iframe preview asli
                        // baru dimount ChatFormat.mountDrive pas kelihatan/di-tap (lihat ChatFormat.observe).
                        return `<div class="chat-media-wrap" id="${mid}"><div class="drive-facade" data-drive-id="${driveId}" data-alt="${alt}" onclick="ChatFormat.mountDrive(this)"><img class="drive-facade-thumb" src="https://drive.google.com/thumbnail?id=${driveId}&sz=w1000" alt="" loading="lazy" onerror="this.remove()"><button type="button" class="yt-facade-play" tabindex="-1" aria-hidden="true"><i class="fa-solid fa-file-arrow-down"></i></button></div></div>`;
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
                            // Facade: gak ada thumbnail statis peta tanpa Static Maps API (berbayar),
                            // jadi placeholder ikon aja — iframe peta beneran baru dimount pas kelihatan/di-tap.
                            return `<div class="chat-media-wrap" id="${mid}"><div class="maps-facade" data-maps-q="${this.esc(q)}" data-alt="${alt}" onclick="ChatFormat.mountMaps(this)"><i class="fa-solid fa-location-dot maps-facade-icon"></i><span class="maps-facade-label">${alt || 'Tap buat lihat peta'}</span></div></div>`;
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

    ChatFormat._facadeObserver = null;
    ChatFormat._observerRoot = null;

    // Mount player asli (YouTube/Drive/Maps) hanya saat facade mendekati viewport
    ChatFormat.observe = function (root) {
        if (!root || typeof IntersectionObserver === 'undefined') return;
        if (!this._facadeObserver || this._observerRoot !== root) {
            if (this._facadeObserver) this._facadeObserver.disconnect();
            this._observerRoot = root;
            this._facadeObserver = new IntersectionObserver((entries) => {
                entries.forEach((en) => {
                    if (!en.isIntersecting) return;
                    const el = en.target;
                    this._facadeObserver.unobserve(el);
                    if (el.dataset.ytId) this.mountYouTube(el);
                    else if (el.dataset.driveId) this.mountDrive(el);
                    else if (el.dataset.mapsQ !== undefined) this.mountMaps(el);
                });
            }, { root: root, rootMargin: '400px 0px', threshold: 0 });
        }
        root.querySelectorAll('.chat-yt-facade:not([data-mounted="1"]), .drive-facade:not([data-mounted="1"]), .maps-facade:not([data-mounted="1"])')
            .forEach((el) => this._facadeObserver.observe(el));
    };

    // Teks polos (tanpa markup & tanpa escape) untuk notifikasi browser
    ChatFormat.toPlainText = function (raw) {
        let t = String(raw);
        t = t.replace(/\[([^\[\]]*)\]\{([^{}]+)\}/g, (m, alt) => (alt ? '📷 ' + alt : '📷'));
        t = t.replace(/\[([^\[\]]+)\]\(([^()]+)\)/g, (m, label) => label);
        t = t.replace(/^>\s?/gm, '');
        t = t.replace(/\*([^\*\n]+)\*/g, '$1').replace(/_([^_\n]+)_/g, '$1').replace(/~([^~\n]+)~/g, '$1');
        return t.replace(/\n/g, ' ');
    };

    window.ChatFormat = ChatFormat;
})();
