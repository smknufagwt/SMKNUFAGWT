/* site-fx.js — DB konten statis, AudioEngine, ScramblerEngine, ParallaxMatrix, System (nav/tema/galeri) */
        const GALLERY_API_URL = "https://script.google.com/macros/s/AKfycbyv2ipXqphbZBrrVghfNhZOI80PqVMcMCsHxr-4MV2YD6l9SNu0wSCincivQxsv9IxItw/exec";
        let DATABASE_FOTO = [];

        // Fetch + parse JSON dengan timeout & 1x retry. Apps Script kadang balas HTML
        // (error page / redirect login) bukan JSON -> res.json() lempar "Unexpected token".
        // Di sini teks mentah dibaca dulu baru di-parse manual supaya error-nya jelas.
        async function gasFetchJSON(url, options = {}, timeoutMs = 15000, retries = 1) {
            for (let attempt = 0; attempt <= retries; attempt++) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const res = await fetch(url, { ...options, signal: controller.signal });
                    clearTimeout(timer);
                    const raw = await res.text();
                    let data;
                    try {
                        data = JSON.parse(raw);
                    } catch {
                        throw new Error(res.ok
                            ? 'Server tidak mengembalikan JSON (kemungkinan script error di Apps Script)'
                            : `Server error ${res.status}`);
                    }
                    return data;
                } catch (err) {
                    clearTimeout(timer);
                    const isAbort = err.name === 'AbortError';
                    if (attempt < retries) continue; // coba sekali lagi
                    throw new Error(isAbort ? 'Waktu tunggu server habis (timeout)' : err.message);
                }
            }
        }

        const DATABASE_CONTENT = {
            home: `
                <h2>PROFIL SEKOLAH</h2>
                <p>Selamat datang di Sistem Informasi Digital <strong>SMK NURUL FALAH</strong>. Website ini didedikasikan sebagai media dokumentasi, informasi, dan portofolio digital siswa-siswi <strong>SMK Nurul Falah</strong>.</p>
                <br>
                <div class="school-info-card">
                    <p>SMK Nurul Falah Berlokasi di jalan raya kauman, Desa Gedung wani timur, Margatiga, Lampung Timur, Provinsi LAMPUNG.</p>
                    <p>NOMOR NPSN: <strong>10814959</strong></p>
                    <p>TERAKREDITASI: <strong>BAN-SM Nomor 1857/BAN-SM/SK/2022</strong></p>
                </div>
<p>Di bawah naungan Yayasan Pendidikan Islam Nurul Falah, berkomitmen mencetak generasi muda yang kompeten,terampil dan bertanggung jawab serta memiliki akhlak mulia sesuai nilai pancasila.</p>
                <div class="marquee-container">
                    <div class="marquee-clip">
                        <div class="marquee-content">SMK NUFA JAYA &nbsp;///&nbsp; BISA - HEBAT - DISIPLIN - KOMPETEN - SIAP KERJA &nbsp;///&nbsp; SYSTEM ONLINE &nbsp;///&nbsp; SMK NUFA JAYA</div>
                    </div>
                    <div class="petir-fx" id="petir-fx">
                        <div class="petir-bolt"></div>
                        <div class="petir-bolt"></div>
                        <div class="petir-bolt"></div>
                    </div>
                </div>
            `,
            visi: `
                <h2>VISI DAN MISI</h2>
                <p> <strong>MENJADI LEMBAGA PENDIDIKAN YANG BERKUALITAS DAN DINAMIS DALAM BIDANG KEJURUAN DAN BISNIS</strong> </p>
                <ol>
                    <li>MELAKSANAKAN PEMBELAJARAN YANG PRODUKTIF, KREATIF, DAN INOVATIF.</li>
                    <li>MENYELENGGARAKAN PENDIDIKAN DAN PELATIHAN SESUAI DENGAN KEBUTUHAN MASYARAKAT DUNIA KERJA SEKTOR SWASTA/PEMERINTAH, BAIK NASIONAL MAUPUN INTERNASIONAL.</li>
                    <li>MEMBERDAYAKAN SEKOLAH UNTUK MEWUJUDKAN PELAYANAN BAGI MASYARAKAT.</li>
                    <li>MENINGKATKAN PERAN SERTA MASYARAKAT MENDUKUNG PROSES PENDIDIKAN DAN PELATIHAN.</li>
                    <li>MEMBERDAYAKAN UNIT PRODUKSI SEBAGAI MEDIA PENDIDIKAN.</li>
                    <li>MENINGKATKAN KERJA SAMA DENGAN DUNIA USAHA/DUNIA INDUSTRI.</li>
                    <li>MENINGKATKAN KERJA SAMA DENGAN DINAS PENDIDIKAN KABUPATEN SERTA DINAS PENDIDIKAN PROVINSI SERTA PEMERINTAH PUSAT.</li>
                </ol>
                <br><br>
          
            `
        };

        const DATABASE_MATERI = {
            'dm': 'Strategi pemasaran komprehensif menggunakan platform digital (Facebook Ads, Instagram, TikTok, Marketplace) untuk menjangkau audiens tertarget, meningkatkan brand awareness, dan mengoptimalkan retensi penjualan secara online.',
            'rb': 'Pengelolaan manajemen toko ritel modern yang mencakup teknik display produk (Visual Merchandising), manajemen persediaan (Stock Opname), administrasi transaksi (Kasir), serta standar pelayanan prima (Service Excellence).',
            'ps': 'Pengembangan soft-skill komunikasi bisnis untuk keperluan presentasi produk, negosiasi dengan klien, serta kemampuan Public Speaking yang persuasif dan percaya diri di hadapan audiens secara profesional.',
            'kwu': 'Implementasi mata pelajaran Produk Kreatif dan Kewirausahaan (PKK) dimana siswa dibimbing untuk merancang, memproduksi, dan memasarkan produk inovatif serta menyusun rencana bisnis (Business Plan) yang layak jual.'
        };

      class AudioEngine {
    constructor() { this._ctx = null; }
    _init() {
        if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this._ctx.state === 'suspended') this._ctx.resume();
    }
    hover() {
        this._init();
        const o = this._ctx.createOscillator(); const g = this._ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(800, this._ctx.currentTime);
        g.gain.setValueAtTime(0.02, this._ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.05);
        o.connect(g); g.connect(this._ctx.destination); o.start(); o.stop(this._ctx.currentTime + 0.05);
    }
    click() {
        this._init();
        const o = this._ctx.createOscillator(); const g = this._ctx.createGain();
        o.type = 'square'; o.frequency.setValueAtTime(200, this._ctx.currentTime);
        g.gain.setValueAtTime(0.3, this._ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.1);
        o.connect(g); g.connect(this._ctx.destination); o.start(); o.stop(this._ctx.currentTime + 0.1);
    }
}
        class ScramblerEngine {
            constructor() { this.chars = '!<>-_\\/[]{}—+*^?#________'; }
            
            animateClick(el) {
                const originalText = el.getAttribute('data-original') || el.innerText;
                if(!el.getAttribute('data-original')) el.setAttribute('data-original', originalText);
                let frame = 0; const length = originalText.length;
                const interval = setInterval(() => {
                    let output = '';
                    for(let i = 0; i < length; i++) {
                        if(frame >= (i * 2) + 5) { output += originalText[i]; } 
                        else { output += this.chars[Math.floor(Math.random() * this.chars.length)]; }
                    }
                    el.innerText = output;
                    if(output === originalText) { clearInterval(interval); el.style.color = ''; }
                    frame++;
                }, 40);
            }

            write(el, htmlContent) {
                el.innerHTML = htmlContent;
                
                const processNode = (node) => {
                    if (node.nodeType === 3) { 
                        const originalText = node.textContent;
                        if (originalText.trim().length === 0) return;
                        
                        const length = originalText.length;
                        let frame = 0;
                        const interval = setInterval(() => {
                            let output = '';
                            for (let i = 0; i < length; i++) {
                                if (frame >= i) output += originalText[i];
                                else output += this.chars[Math.floor(Math.random() * this.chars.length)];
                            }
                            node.textContent = output;
                            if (frame >= length) {
                                clearInterval(interval);
                                node.textContent = originalText;
                            }
                            frame += 2;
                        }, 15);
                    } else if (node.nodeType === 1) { 
                        
                        if (node.classList.contains('marquee-container')) return;
                        for (let child of node.childNodes) {
                            processNode(child);
                        }
                    }
                };

                processNode(el);
            }

            animate(el, newText) {
                const length = newText.length; let frame = 0;
                const interval = setInterval(() => {
                    let output = '';
                    for(let i=0; i<length; i++) {
                        if(frame >= i) output += newText[i];
                        else output += this.chars[Math.floor(Math.random() * this.chars.length)];
                    }
                    el.innerHTML = output.substring(0, frame + 1) + (frame < length ? '_' : '');
                    if(frame >= length) clearInterval(interval);
                    frame+=3;
                }, 20);
            }
        }

        class ParallaxMatrix {
            constructor() {
                this.canvas = document.getElementById("matrix-bg");
                this.ctx = this.canvas.getContext("2d");
                this.color = "#0f0";
                this.drops = []; this.ripples = [];
                this.enabled = true; this._running = true;
                this._lastFrame = 0; this._frameInterval = 1000 / 30;
                this.resize();
                let resizeTO;
                window.addEventListener('resize', () => { clearTimeout(resizeTO); resizeTO = setTimeout(() => this.resize(), 150); });
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) { this._running = false; }
                    else if (this.enabled && !this._running) { this._running = true; this._lastFrame = 0; this.loop(); }
                });
                ['mousemove', 'touchstart'].forEach(evt => window.addEventListener(evt, (e) => this.createRipple(e), {passive: true}));
                this.loop();
            }
            resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; this.initDrops(); }
            initDrops() {
                const targetColumns = 90;
                const spacing = Math.max(20, this.canvas.width / targetColumns);
                const columns = Math.ceil(this.canvas.width / spacing);
                this.drops = [];
                for (let i = 0; i < columns; i++) {
                    this.drops.push({ x: i * spacing, y: Math.random() * this.canvas.height, speed: Math.random() * 0.5 + 0.5, depth: Math.random() > 0.8 ? 2 : 1 });
                }
            }
            createRipple(e) {
                const x = e.touches ? e.touches[0].clientX : e.clientX;
                const y = e.touches ? e.touches[0].clientY : e.clientY;
                this.ripples.push({x, y, size: 0, life: 1});
            }
            setColor(c) { this.color = c; }
            setEnabled(on) {
                this.enabled = on;
                this.canvas.style.display = on ? 'block' : 'none';
                if (on && !this._running) { this._running = true; this.loop(); }
                if (!on) this._running = false;
            }
            draw() {
                this.ctx.fillStyle = "rgba(0, 0, 0, 0.15)"; 
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.strokeStyle = this.color;
                for (let i = this.ripples.length - 1; i >= 0; i--) {
                    const r = this.ripples[i];
                    this.ctx.beginPath(); this.ctx.arc(r.x, r.y, r.size, 0, Math.PI * 2);
                    this.ctx.globalAlpha = r.life * 0.5; this.ctx.stroke(); this.ctx.globalAlpha = 1;
                    r.size += 2; r.life -= 0.05; if(r.life <= 0) this.ripples.splice(i, 1);
                }
                this.ctx.font = "14px monospace";
                this.drops.forEach(drop => {
                    const text = Math.floor(Math.random() * 10).toString();
                    this.ctx.fillStyle = drop.depth === 2 ? "#fff" : this.color;
                    this.ctx.fillText(text, drop.x, drop.y);
                    if (drop.y > this.canvas.height && Math.random() > 0.975) drop.y = 0;
                    drop.y += drop.speed * 22;
                });
            }
            loop(now = 0) {
                if (!this._running) return;
                requestAnimationFrame((t) => this.loop(t));
                if (now - this._lastFrame < this._frameInterval) return;
                this._lastFrame = now;
                this.draw();
            }
        }

        const AudioFX = new AudioEngine();
        const MatrixFX = new ParallaxMatrix(); 
        const Scrambler = new ScramblerEngine();

        // Label "JARINGAN AKTIF" diganti rotasi frasa cyberpunk pakai ScramblerEngine yang udah ada
        // (bukan animasi baru) — swap teks tiap beberapa detik, tiap swap cuma burst setInterval pendek
        // yang otomatis clear sendiri, jadi ringan di device low-end. Ikon juga dipetakan ke navigator.onLine
        // biar bukan cuma kosmetik — kalau beneran offline, labelnya jujur bilang gitu.
        const NetLabel = {
            phrases: ['JARINGAN AKTIF', 'KONEKSI STABIL', 'NODE TERKONEKSI', 'SINYAL TERKUNCI', 'GRID TERSAMBUNG'],
            idx: 0,
            _timer: null,
            start() {
                if (this._timer) return;
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) { clearInterval(this._timer); this._timer = null; }
                    else this._resume();
                });
                window.addEventListener('online', () => this._setOffline(false));
                window.addEventListener('offline', () => this._setOffline(true));
                this._setOffline(!navigator.onLine);
                this._resume();
            },
            _resume() {
                if (this._timer || document.hidden) return;
                this._timer = setInterval(() => this._cycle(), 9000);
            },
            _cycle() {
                if (this._offline) return; // pas offline, biarin teks "SINYAL TERPUTUS" diem, gak usah dirotasi
                const el = document.querySelector('#chat-net-label .net-label-text');
                if (!el || typeof Scrambler === 'undefined') return;
                this.idx = (this.idx + 1) % this.phrases.length;
                el.setAttribute('data-original', this.phrases[this.idx]);
                Scrambler.animateClick(el);
            },
            _setOffline(offline) {
                this._offline = offline;
                const wrap = document.getElementById('chat-net-label');
                const el = wrap && wrap.querySelector('.net-label-text');
                if (wrap) wrap.classList.toggle('net-offline', offline);
                if (el && offline) { el.setAttribute('data-original', 'SINYAL TERPUTUS'); if (typeof Scrambler !== 'undefined') Scrambler.animateClick(el); }
            },
        };

        // Jadwal BGM otomatis berdasar waktu WIB (UTC+7), lepas dari timezone device:
        // - Sabtu 06:00 s.d. Senin 06:00 (WIB) -> weekend override
        // - Selain itu: 06:00-18:00 -> bgm.mp3 (pagi/siang), 18:00-06:00 -> aurora-dawn (malam)
        function getScheduledBgm() {
            const dayUrl = "assets/audio/bgm.mp3";
            const nightUrl = "assets/audio/aurora-dawn.m4a";
            const weekendUrl = "assets/audio/spocks-cryo-bed.m4a";

            const now = new Date();
            const wib = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 7 * 3600000);
            const day = wib.getDay(); // 0=Minggu ... 6=Sabtu
            const hour = wib.getHours();

            const isWeekend = (day === 6 && hour >= 6) || day === 0 || (day === 1 && hour < 6);
            if (isWeekend) return { key: 'weekend', url: weekendUrl };
            return (hour >= 6 && hour < 18) ? { key: 'day', url: dayUrl } : { key: 'night', url: nightUrl };
        }

        const System = {
            _galleryFetchedOnce: false,
            _bgmScheduleKey: null,
            _bgmSchedulerStarted: false,
            _galleryLastFetch: 0,
            _galleryTTL: 90000, // 90 detik — di atas ini, buka tab galeri bakal refetch otomatis
            accessGapMs: 300000, // 5 menit — dalam rentang ini, alih tab TIDAK perlu klik ulang overlay (kecuali refresh manual)
            bgm: document.getElementById('bgm'),
            musicBtn: document.getElementById('music-btn'),
            musicIcon: document.getElementById('music-icon'),
            log: document.getElementById('system-log'),
            colorBtn: document.getElementById('color-btn'),
            colorIndex: 0,
            colors: [
           { neon: '#ffffff', dim: '#8ce6ef', hex: '#ffffff' },
                { neon: '#0f0', dim: '#008F11', hex: '#0f0' },       
                { neon: '#00f0ff', dim: '#008F8F', hex: '#00f0ff' }, 
                { neon: '#FF3333', dim: '#CC1F1F', hex: '#FF3333' }, 
                { neon: '#FFFF66', dim: '#999900', hex: '#FFFF66' },
                { neon: '#D966FF', dim: '#8000B3', hex: '#D966FF' }, 
                { neon: '#FF8040', dim: '#B34700', hex: '#FF8040' },
                { neon: '#FF10F0', dim: '#B0008C', hex: '#FF10F0' }
                 

            ],
            baseOffset: 6340,
            currentVisits: 0, 

            typeWriter: function(elementId, text, speed = 100) {
                const element = document.getElementById(elementId);
                if (!element) return;
                
                element.innerHTML = ""; 
                element.classList.add('typing-cursor');
                
                let i = 0;
                function type() {
                    if (i < text.length) {
                        element.innerHTML += text.charAt(i);
                        i++;
                        const randomSpeed = speed + (Math.random() * 50 - 25);
                        setTimeout(type, randomSpeed);
                    }
                }
                type();
            },

            // syncVisitorCount & useLocalFallback dipindah ke inline <script> di bawah index.html
            // (lihat sebelum </body>) — di-attach ke object System ini via assignment.
          loadSavedTheme: function() {
    try {
        const savedIndex = localStorage.getItem('nufa_theme');
        if (savedIndex !== null) { this.colorIndex = parseInt(savedIndex); this.applyTheme(); }
    } catch(e) { }
},
            applyTheme: function() {
                const theme = this.colors[this.colorIndex];
                document.documentElement.style.setProperty('--neon', theme.neon);
                document.documentElement.style.setProperty('--neon-dim', theme.dim);
                MatrixFX.setColor(theme.hex);

                // Sinkronkan warna address bar mobile dgn tema aktif
                let metaTheme = document.querySelector('meta[name="theme-color"]');
                if (!metaTheme) {
                    metaTheme = document.createElement('meta');
                    metaTheme.name = 'theme-color';
                    document.head.appendChild(metaTheme);
                }
                metaTheme.setAttribute('content', theme.hex);
            },

            initLog: function() {
                // Fungsi generator dipanggil ulang tiap tick agar baris "Global Access" selalu baca
                // this.currentVisits versi terbaru (bukan snapshot lama sebelum syncVisitorCount() selesai).
                const logLines = [
                    () => "Scanning connection...",
                    () => "Encrypting connection...",
                    () => `Public Access: ${this.currentVisits} Users`,
                    () => "System stable.",
                    () => "Monitoring network..."
                ];
                let i = 0;
                setInterval(() => {
                    this.log.innerText = ">> " + logLines[i]();
                    i = (i + 1) % logLines.length;
                }, 2400);
            },

            _startBgmScheduler: function() {
                if (this._bgmSchedulerStarted) return;
                this._bgmSchedulerStarted = true;
                const apply = () => {
                    if (document.body.classList.contains('interlinked-active')) return; // easter egg lagi aktif, jangan diganggu
                    const sched = getScheduledBgm();
                    if (sched.key === this._bgmScheduleKey) return;
                    this._bgmScheduleKey = sched.key;
                    const wasPlaying = !this.bgm.paused;
                    this.bgm.src = sched.url;
                    this.bgm.load();
                    if (wasPlaying) this.bgm.play().catch(() => {});
                };
                apply();
                setInterval(apply, 60000); // cek tiap 1 menit buat nangkep pergantian jadwal saat tab tetap terbuka
            },

            enter: function(auto) {
                try { sessionStorage.setItem('nufa_last_access', Date.now()); } catch(e) {}
                if (!auto) AudioFX.click();
                this._startBgmScheduler();
                const playPromise = this.bgm.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => { console.log("Audio autoplay prevented."); });
                }
                this.bgm.volume = 0.7;

                const savedMusic = localStorage.getItem('nufa_music');
                if (savedMusic === 'off') {
                    this.bgm.pause();
                    this.musicIcon.innerText = "🔇";
                    this.musicBtn.style.opacity = "0.8";
                }

                this.loadSavedTheme();
                NetLabel.start();

                this.musicBtn.style.display = 'flex'; 
                this.colorBtn.style.display = 'flex';
                const chatBtn = document.getElementById('chat-btn');
                if (chatBtn) chatBtn.style.display = 'flex';
                if (typeof GlobalChat !== 'undefined') GlobalChat.start();

                this.fetchGallery(); 
                this.startLatency(); 
                this.initLog(); 

                Scrambler.write(document.getElementById('home-content'), DATABASE_CONTENT.home);
                this.randomizePetir();

                // Jumlah pengunjung disinkron di LATAR BELAKANG (tidak menunda tampilan)
                this.syncVisitorCount().catch(()=>{});

                document.getElementById('overlay').style.opacity = '0';
                const scanlinesEl = document.querySelector('.scanlines');
                const scanBeamEl = document.querySelector('.scan-beam');
                if (scanlinesEl) scanlinesEl.style.opacity = '0';
                if (scanBeamEl) scanBeamEl.style.opacity = '0';
                setTimeout(() => {
                    document.getElementById('overlay').style.display = 'none';
                    if (scanlinesEl) scanlinesEl.style.display = 'none';
                    if (scanBeamEl) scanBeamEl.style.display = 'none';
                    document.getElementById('main-content').style.display = 'block';
                    startChaosMode(); 
                }, 500);
                
            },

            toggleColor: function() {
                AudioFX.click();
                this.colorIndex = (this.colorIndex + 1) % this.colors.length;
                try { localStorage.setItem('nufa_theme', this.colorIndex); } catch(e) {}
                this.applyTheme();
            },

            // Acak variabel CSS tiap bolt petir biar polanya gak keliatan monoton/looping sama
            randomizePetir: function() {
                document.querySelectorAll('#petir-fx .petir-bolt').forEach(el => {
                    el.style.setProperty('--petir-dur', (2.5 + Math.random() * 3).toFixed(2) + 's');
                    el.style.setProperty('--petir-delay', (Math.random() * 4).toFixed(2) + 's');
                });
            },

   renderGallery: function(photos) {
    const container = document.getElementById('gallery-container');
    container.innerHTML = '';

    if (!photos || photos.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:var(--neon);opacity:0.5;grid-column:1/-1;text-align:center;padding:40px 0;font-size:0.85rem;letter-spacing:2px;';
        empty.textContent = '// GALERI KOSONG — BELUM ADA FOTO DI FOLDER DRIVE';
        container.appendChild(empty);
        return;
    }

    photos.forEach(item => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.onclick = () => { AudioFX.click(); GalleryViewer.open(item.file, item.caption); };

        const img = document.createElement('img');
        img.src = item.file;
        img.alt = item.caption;
        img.loading = 'lazy';
        img.onerror = function() {
            this.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200'%3E%3Crect width='300' height='200' fill='%23000'/%3E%3Ctext x='50%25' y='50%25' fill='%2300ff00' font-family='monospace' font-size='14' text-anchor='middle' dy='.3em'%3EFOTO TIDAK ADA%3C/text%3E%3C/svg%3E";
            this.onerror = null;
        };

        const caption = document.createElement('div');
        caption.className = 'caption';
        caption.textContent = item.caption; 

        div.appendChild(img);
        div.appendChild(caption);
        container.appendChild(div);
    });
},
            fetchGallery: async function() {
                const container = document.getElementById('gallery-container');

                // Cek apakah URL sudah diisi
                if (!GALLERY_API_URL || GALLERY_API_URL === "PASTE_WEB_APP_URL_KAMU_DI_SINI") {
                    container.innerHTML = `<div style="color:#ff003c;grid-column:1/-1;text-align:center;padding:40px 0;font-size:0.8rem;letter-spacing:1px;">⚠ GALLERY_API_URL BELUM DIISI DI KODE HTML</div>`;
                    return;
                }

                container.innerHTML = `
                    <div style="color:var(--neon);grid-column:1/-1;text-align:center;padding:60px 0;font-size:0.85rem;letter-spacing:2px;">
                        <div style="margin-bottom:12px;font-size:1.4rem;">📡</div>
                        <div class="typing-cursor">MEMUAT DATABASE FOTO</div>
                    </div>`;

                try {
                    const data = await gasFetchJSON(GALLERY_API_URL);

                    if (data.status === "ok") {
                        DATABASE_FOTO = data.photos;
                        this._galleryFetchedOnce = true;
                        this._galleryLastFetch = Date.now();

                        // Gabungkan dengan cache lokal browser (foto yang baru diupload, sebelum sinkron Drive selesai)
                        const localCache = (typeof UploadSystem !== 'undefined') ? UploadSystem.getLocalCache() : [];
                        if (localCache.length > 0) {
                            const existingFiles = new Set(DATABASE_FOTO.map(p => p.file));
                            localCache.forEach(item => {
                                if (!existingFiles.has(item.file)) DATABASE_FOTO.unshift(item);
                            });
                        }

                                        this.renderGallery(DATABASE_FOTO);

                        // Update HUD galeri setelah render — gunakan nilai latency terakhir yang tersimpan
                        const hud = document.querySelector('#gallery .slide-hud');
                        if (hud) {
                            const lat = this._lastLatency || '--';
                            hud.innerHTML = `<i class="fa-solid fa-wifi lat-toggle${this._latencyEnabled === false ? ' lat-off' : ''}" onclick="System.toggleLatency(this)" title="Matikan/nyalakan pengukuran latency"></i> Jaringan : <span class="lat-val">${lat}</span>ms | ${DATABASE_FOTO.length} FOTO DIMUAT`;
                        }
                    } else {
                        throw new Error(data.message || "Unknown error");
                    }
                } catch (err) {
                    container.innerHTML = `
                        <div style="color:#ff003c;grid-column:1/-1;text-align:center;padding:40px 0;font-size:0.8rem;letter-spacing:1px;">
                            ⚠ GAGAL MEMUAT GALERI<br>
                            <span style="color:#666;font-size:0.7rem;margin-top:8px;display:block;">${err.message}</span>
                            <button onclick="System.fetchGallery()" style="margin-top:16px;padding:8px 20px;border:1px solid #ff003c;background:transparent;color:#ff003c;font-family:var(--font-main);cursor:pointer;letter-spacing:1px;">↺ COBA LAGI</button>
                        </div>`;
                }
            }, // Batas akhir fetchGallery

            
_latencyTimer: null,
_latencyEnabled: true,
startLatency: function() {
    if (this._latencyTimer) clearInterval(this._latencyTimer);
    const updateAll = (val) => {
        this._lastLatency = val;
        document.querySelectorAll('.lat-val').forEach(el => el.innerText = val);
    };
    const measure = () => {
        const start = performance.now();
        fetch(window.location.href + '?ping=' + Date.now(), { method: 'HEAD', cache: 'no-store' })
            .then(() => updateAll(Math.round(performance.now() - start)))
            .catch(() => updateAll('ERR'));
    };
    measure();
    this._latencyTimer = setInterval(() => { if (!document.hidden && this._latencyEnabled) measure(); }, 4000);
},
toggleLatency: function() {
    this._latencyEnabled = !this._latencyEnabled;
    document.querySelectorAll('.lat-toggle').forEach(i => i.classList.toggle('lat-off', !this._latencyEnabled));
    if (!this._latencyEnabled) {
        document.querySelectorAll('.lat-val').forEach(el => el.innerText = 'OFF');
    }
},

            toggleMusic: function() {
                if (this.musicBtn && this.musicBtn.classList.contains('sound-locked')) return;
                AudioFX.click();
                if (this.bgm.paused) { 
                    this.bgm.play(); 
                    this.musicIcon.innerText = "🔊"; 
                    this.musicBtn.style.opacity = "1";
                    localStorage.setItem('nufa_music', 'on'); // ✅ simpan state
                }
                else { 
                    this.bgm.pause(); 
                    this.musicIcon.innerText = "🔇"; 
                    this.musicBtn.style.opacity = "0.8";
                    localStorage.setItem('nufa_music', 'off'); // ✅ simpan state
                }
            },

            nav: function(id, btn) {
                AudioFX.click();
                Scrambler.animateClick(btn);

                document.querySelectorAll('.slide').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

                document.getElementById(id).classList.add('active'); 
                btn.classList.add('active');

                if(id === 'home') {
                    Scrambler.write(document.getElementById('home-content'), DATABASE_CONTENT.home);
                    this.randomizePetir();
                } else if (id === 'visi') {
                    Scrambler.write(document.getElementById('visi-content'), DATABASE_CONTENT.visi);
                } else if (id === 'gallery') {
                    // Fetch pertama kali, atau kalau cache udah lewat TTL (biar foto dari user lain
                    // ke-refresh juga tanpa perlu refetch tiap kali tab galeri dipencet)
                    const stale = (Date.now() - this._galleryLastFetch) > this._galleryTTL;
                    if (!this._galleryFetchedOnce || stale) this.fetchGallery();
                }
            },

            detail: function(btn, key) {
                AudioFX.click();
                Scrambler.animateClick(btn);
                document.querySelectorAll('.comp-btn').forEach(b => b.classList.remove('active-comp'));
                btn.classList.add('active-comp');
                Scrambler.animate(document.getElementById('desc-output'), DATABASE_MATERI[key]);
            }
        };

        // Skip overlay kalau baru buka akses (< accessGapMs) & bukan refresh manual
        (function autoResumeAccess() {
            try {
                const nav = performance.getEntriesByType('navigation')[0];
                const isManualReload = nav ? nav.type === 'reload' : false;
                const lastAccess = parseInt(sessionStorage.getItem('nufa_last_access') || '0', 10);
                const withinGap = lastAccess && (Date.now() - lastAccess) < System.accessGapMs;
                if (!isManualReload && withinGap) System.enter(true);
            } catch (e) {}
        })();

        const chaosTexts = ["SYSTEM_FAILURE", "0x00_FATAL_ERR", "S#K N@R*L F!L^H", "404_NOT_FOUND", "CONNECTING...", "ENCRYPT_//_99%", "µ-sys$-Hacked"];
        function startChaosMode() {
            const title = document.querySelector('.glitch');
            if (!title) return;
            const originalText = "SMK NURUL FALAH";
            function randomGlitchLoop() {
                const randomTime = Math.random() * 15000 + 5000; 
                setTimeout(() => {
                    const randomString = chaosTexts[Math.floor(Math.random() * chaosTexts.length)];
                    title.innerText = randomString;          
                    title.setAttribute('data-text', randomString); 
                    title.classList.add('critical-error');   
                    
                    setTimeout(() => {
                        title.innerText = originalText;
                        title.setAttribute('data-text', originalText);
                        title.classList.remove('critical-error');
                        randomGlitchLoop(); 
                    }, 100 + Math.random() * 200);
                }, randomTime);
            }
            randomGlitchLoop();
        }

        document.addEventListener("DOMContentLoaded", () => {
            // --- INJEKSI ANIMATION KEYFRAME UNTUK SKEW INFINITE ---
            const styleInterlinked = document.createElement('style');
            styleInterlinked.innerHTML = `
                @keyframes skew-glitch {
                    0%, 100% { transform: skew(0deg); filter: hue-rotate(0deg); }
                    20% { transform: skew(-6deg) scaleY(1.02); filter: hue-rotate(45deg); }
                    40% { transform: skew(7deg); }
                    60% { transform: skew(-4deg) scaleY(0.98); filter: hue-rotate(180deg); }
                    80% { transform: skew(5deg); }
                }

                /* INTERLINKED PULSE — warna mengikuti --neon aktif */
                @keyframes interlinked-border-pulse {
                    0%, 100% { 
                        border-color: #ff003c; 
                        box-shadow: 0 0 8px rgba(255,0,60,0.3), inset 0 0 6px rgba(255,0,60,0.05);
                    }
                    50% { 
                        border-color: var(--neon); 
                        box-shadow: 0 0 28px var(--neon), inset 0 0 14px rgba(0,255,65,0.08);
                    }
                }
                @keyframes interlinked-text-pulse {
                    0%, 100% { text-shadow: 0 0 6px #ff003c, 0 0 12px #ff003c; color: #ff003c; }
                    50%       { text-shadow: 0 0 14px var(--neon), 0 0 28px var(--neon); color: var(--neon); }
                }
                @keyframes interlinked-bg-pulse {
                    0%, 100% { background: rgba(255,0,60,0.04); }
                    50%       { background: rgba(0,255,65,0.06); }
                }

                /* Kelas yang diterapkan ke elemen saat interlinked aktif */
                .interlinked-active header,
                .interlinked-active .slide.active,
                .interlinked-active nav,
                .interlinked-active .marquee-container {
                    animation: interlinked-border-pulse 1.4s ease-in-out infinite !important;
                }
                .interlinked-active .glitch {
                    /* skew-glitch tetap jalan, tambah pulse glow via filter */
                    filter: drop-shadow(0 0 6px #ff003c) drop-shadow(0 0 14px var(--neon));
                    animation: skew-glitch 1s infinite linear, interlinked-filter-pulse 1.4s ease-in-out infinite !important;
                }
                @keyframes interlinked-filter-pulse {
                    0%, 100% { filter: drop-shadow(0 0 8px #ff003c) drop-shadow(0 0 4px var(--neon)); }
                    50%       { filter: drop-shadow(0 0 4px #ff003c) drop-shadow(0 0 20px var(--neon)); }
                }
                .interlinked-active .nav-btn.active {
                    animation: interlinked-text-pulse 1.4s ease-in-out infinite !important;
                }
                .interlinked-active .control-btn {
                    animation: interlinked-border-pulse 1.4s ease-in-out infinite !important;
                }
                .interlinked-active #gallery-container .gallery-item {
                    animation: interlinked-border-pulse 1.4s ease-in-out infinite !important;
                }
                .interlinked-active .slide.active {
                    animation: interlinked-border-pulse 1.4s ease-in-out infinite, 
                               interlinked-bg-pulse 1.4s ease-in-out infinite !important;
                }
            `;
            document.head.appendChild(styleInterlinked);

            // --- BTN PEMBUAT HOLD LOGIC ---
            const btnPembuat = document.getElementById("btn-pembuat");
            if (btnPembuat) {

            const style = document.createElement('style');
            style.innerHTML = `
                @keyframes global-panic-glitch {
                    0%, 100% { background-color: #050505; }
                    50% { background-color: #0f0005; }
                }
                @keyframes neon-ambient-pulse {
                    0%, 100% { filter: drop-shadow(0 0 20px var(--neon)) contrast(1.2); }
                    50% { filter: drop-shadow(0 0 60px var(--neon)) contrast(2) brightness(1.6); }
                }
                .override-chaos {
                    background: rgba(255, 0, 60, 0.25) !important;
                    border: 2px dashed #ff003c !important;
                    color: #ffffff !important;
                    text-shadow: 0 0 10px #ff003c, 0 0 20px #ff003c !important;
                    box-shadow: 0 0 35px #ff003c, inset 0 0 15px #ff003c !important;
                }
                .system-panic {
                    animation: global-panic-glitch 0.4s infinite !important;
                    transition: none !important;
                }
                .system-panic header, .system-panic .slide.active, .system-panic nav {
                    animation: neon-ambient-pulse 0.5s infinite alternate ease-in-out !important;
                    border-color: var(--neon) !important;
                    box-shadow: 0 0 35px var(--neon) !important;
                }
                .system-panic #matrix-bg { opacity: 0.25 !important; }
            `;
            document.head.appendChild(style);

            function playTransitionSound() {
                if (typeof AudioFX === 'undefined' || !AudioFX.ctx) return;
                AudioFX.resume();
                const ctx = AudioFX.ctx;
                const now = ctx.currentTime;

                const oscBeep = ctx.createOscillator();
                const gainBeep = ctx.createGain();
                oscBeep.type = 'sine';
                oscBeep.frequency.setValueAtTime(1200, now);
                gainBeep.gain.setValueAtTime(0.3, now);
                gainBeep.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                oscBeep.connect(gainBeep);
                gainBeep.connect(ctx.destination);
                oscBeep.start(now);
                oscBeep.stop(now + 0.15);

                const oscDrop = ctx.createOscillator();
                const gainDrop = ctx.createGain();
                oscDrop.type = 'sawtooth';
                oscDrop.frequency.setValueAtTime(450, now + 0.05); 
                oscDrop.frequency.exponentialRampToValueAtTime(40, now + 1.2); 
                gainDrop.gain.setValueAtTime(0.4, now + 0.05);
                gainDrop.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
                oscDrop.connect(gainDrop);
                gainDrop.connect(ctx.destination);
                oscDrop.start(now + 0.05);
                oscDrop.stop(now + 1.2);
            }

            function playTick(isPanic = false) {
                if (typeof AudioFX === 'undefined' || !AudioFX.ctx) return;
                AudioFX.resume();
                const ctx = AudioFX.ctx;
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                
                o.type = 'square';
                const startFreq = isPanic ? 1400 : 800;
                const endFreq = isPanic ? 400 : 100;
                
                o.frequency.setValueAtTime(startFreq, ctx.currentTime); 
                o.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.1); 
                g.gain.setValueAtTime(isPanic ? 0.25 : 0.15, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                o.connect(g); g.connect(ctx.destination);
                o.start(); o.stop(ctx.currentTime + 0.1);
            }

            let holdTimer;         
            let pressTimer;        
            let countdownInterval; 
            let isHolding = false; 
            let timeLeft = 9;

            const originalContent = btnPembuat.innerHTML;
            const originalStyle = btnPembuat.getAttribute("style") || ""; 
            const sneakPeekUrl = "https://world-monitor.com/"; 
            const waUrl = btnPembuat.getAttribute("href"); 

            function startPress(e) {
                if (e && e.cancelable) e.preventDefault();
                isHolding = false;
                clearAllTimers();

                holdTimer = setTimeout(() => {
                    isHolding = true; 
                    startCountdownUI();
                }, 700);
            }

            function startCountdownUI() {
                timeLeft = 9;
                playTransitionSound();

                btnPembuat.classList.add('override-chaos');
                btnPembuat.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> OVERRIDE: ${timeLeft}s`;
                
                countdownInterval = setInterval(() => {
                    timeLeft--;
                    if (timeLeft > 0) {
                        btnPembuat.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> OVERRIDE: ${timeLeft}s`;
                        if (timeLeft <= 5) {
                            document.body.classList.add('system-panic');
                            playTick(true);
                        } else {
                            playTick(false); 
                        }
                    } else {
                        clearInterval(countdownInterval);
                    }
                }, 1000);

                pressTimer = setTimeout(() => {
                    document.body.classList.remove('system-panic');
                    btnPembuat.classList.remove('override-chaos');
                    
                    btnPembuat.style.cssText = "background: #ff003c !important; color: #000 !important; box-shadow: 0 0 50px #ff003c !important; border: none !important;";
                    btnPembuat.innerHTML = `<i class="fa-solid fa-skull"></i> ACCESS GRANTED`;
                    
                    if(typeof AudioFX !== 'undefined') AudioFX.click();

                    setTimeout(() => {
                        window.location.href = sneakPeekUrl;
                    }, 1000);
                }, 9000);
            }

            function clearAllTimers() {
                clearTimeout(holdTimer);
                clearTimeout(pressTimer);
                clearInterval(countdownInterval);
            }

            function releasePress(e) {
                if (e && e.cancelable) e.preventDefault();
                clearAllTimers();

                if (!isHolding) {
                    if(typeof AudioFX !== 'undefined') AudioFX.click();
                    window.open(waUrl, "_blank"); 
                } else {
                    resetButtonUI();
                }
            }

            function abortPress() {
                clearAllTimers();
                if (isHolding) resetButtonUI();
            }

            function resetButtonUI() {
                document.body.classList.remove('system-panic');
                btnPembuat.classList.remove('override-chaos');
                btnPembuat.setAttribute("style", originalStyle);
                btnPembuat.innerHTML = originalContent;
                isHolding = false;
            }

            btnPembuat.addEventListener("click", (e) => {
                e.preventDefault();
            });

            btnPembuat.addEventListener("mousedown", startPress);
            btnPembuat.addEventListener("mouseup", releasePress);
            btnPembuat.addEventListener("mouseleave", abortPress); 

            btnPembuat.addEventListener("touchstart", startPress, { passive: false });
            btnPembuat.addEventListener("touchend", releasePress, { passive: false });
            btnPembuat.addEventListener("touchcancel", abortPress);

            } 

            const subtitle = document.getElementById("subtitle-text");
            const mainTitle = document.querySelector(".glitch"); 
            const bgmAudio = document.getElementById("bgm"); 
    
            if (!subtitle) return;

            let clickCount = 0;
            let clickTimeout;
            let isInterlinkedMode = false;

            const originalBgmUrl = "assets/audio/bgm.mp3"; 
            const interlinkedBgmUrl = "assets/audio/interlinked.mp3"; 

            subtitle.addEventListener("click", () => {
                clickCount++;
                clearTimeout(clickTimeout);
                clickTimeout = setTimeout(() => { clickCount = 0; }, 2000); 
                if (clickCount === 3) {
                    clickCount = 0;
                    toggleInterlinkedMode();
                }
            });

            function toggleInterlinkedMode() {
                if (!isInterlinkedMode) {
                    isInterlinkedMode = true;
                    subtitle.textContent = "INTERLINKED";
                    subtitle.style.color = "#ff003c";
                    subtitle.style.textShadow = "0 0 15px #ff003c, 0 0 30px #ff003c";
                    subtitle.style.letterSpacing = "6px";
                    if (mainTitle) { mainTitle.style.animation = ""; mainTitle.style.textShadow = ""; }
                    document.body.classList.add('interlinked-active');
                    if (bgmAudio) {
                        bgmAudio.src = interlinkedBgmUrl;
                        bgmAudio.load();
                        bgmAudio.play().catch(e => console.log("Audio play diblokir:", e));
                    }
                    if (typeof AudioFX !== 'undefined') AudioFX.click();
                } else {
                    isInterlinkedMode = false;
                    subtitle.textContent = "NURUL FALAH";
                    subtitle.style.color = "";
                    subtitle.style.textShadow = "";
                    subtitle.style.letterSpacing = "";
                    if (mainTitle) { mainTitle.style.animation = ""; mainTitle.style.textShadow = ""; mainTitle.style.filter = ""; }
                    document.body.classList.remove('interlinked-active');
                    if (bgmAudio) {
                        const sched = (typeof getScheduledBgm === 'function') ? getScheduledBgm() : { key: null, url: originalBgmUrl };
                        if (typeof System !== 'undefined') System._bgmScheduleKey = sched.key;
                        bgmAudio.src = sched.url;
                        bgmAudio.load();
                        bgmAudio.play().catch(e => console.log("Audio play diblokir:", e));
                    }
                    if (typeof AudioFX !== 'undefined') AudioFX.click();
                }
            }
        }); // akhir DOMContentLoaded utama

