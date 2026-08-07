/* headline.js — scrambler animasi teks headline bar */
(function () {
    'use strict';

    // ── Daftar headline yang akan bergantian ──────────────────
    const HEADLINES = [
        '🔥💯 mahaKarya anak bangsa 🇮🇩',
        '⚡ Terhubung hanya dengan satu klik ke semua orang',
        '🔒 Data & identitas Anda terenkripsi penuh',
        '🌐 Akses percakapan lintas perangkat, dimana saja',
        '⚙️ Terminal system canggih berbasis realtime',
        '👁 Pantau siapa saja yang sedang online live',
        '🛡 Koneksi aman — tanpa login, tanpa jejak',
        '🔥💯 mahaKarya anak bangsa 🇮🇩',
        '🚀 Latensi ultra-rendah, pesan terkirim instan',
        '🔑 Identitas anonim — hanya IP terenkripsi yang terlihat',
        '📡  Akses siapapun, kapanpun, sekarang',
        '💬 Ruang obrolan Publik, Bertemakan siber',
        '🖥️ Fullstack Development, murni vanila kode',

    ];

    // ── Karakter pool untuk efek scramble ────────────────────
    const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*<>[]{}|';

    // ── Timing (ms) ───────────────────────────────────────────
    const SCRAMBLE_DURATION = 800;   // durasi fase scramble
    const HOLD_DURATION     = 3800;  // berapa lama teks diam sebelum ganti
    const GLOW_DELAY        = 200;   // delay sebelum pulse glow menyala
    const GLITCH_INTERVAL   = 5000;  // seberapa sering glitch micro-shift

    let currentIndex = 0;
    let scrambleRaf  = null;
    let glitchTimer  = null;

    // ── Tunggu DOM siap ───────────────────────────────────────
    function init() {
        const el = document.getElementById('chat-headline-text');
        if (!el) return; // elemen belum ada, skip

        cycleHeadline(el);
        scheduleGlitch(el);
    }

    // ── Satu siklus: scramble → settle → tahan → ganti ───────
    function cycleHeadline(el) {
        const target = HEADLINES[currentIndex];
        currentIndex = (currentIndex + 1) % HEADLINES.length;

        // Set data-text untuk layer glitch pseudo-element
        el.setAttribute('data-text', target);

        // Fase scramble
        el.classList.add('scrambling');
        el.style.animation = 'none';

        const start = performance.now();

        function scrambleFrame(now) {
            const elapsed  = now - start;
            const progress = Math.min(elapsed / SCRAMBLE_DURATION, 1);

            // Karakter yang sudah "terkunci" dari kiri = semakin banyak seiring progress
            const lockedCount = Math.floor(progress * target.length);
            let display = '';

            for (let i = 0; i < target.length; i++) {
                if (i < lockedCount || target[i] === ' ') {
                    display += target[i]; // karakter asli
                } else {
                    display += POOL[Math.floor(Math.random() * POOL.length)]; // karakter acak
                }
            }

            el.textContent = display;

            if (progress < 1) {
                scrambleRaf = requestAnimationFrame(scrambleFrame);
            } else {
                // Teks final sudah settle
                el.textContent = target;
                el.classList.remove('scrambling');

                // Reveal animation
                el.style.animation = 'none';
                void el.offsetWidth; // reflow paksa
                el.style.animation =
                    `headline-reveal 0.35s ease forwards, ` +
                    `headline-glow-pulse 2.5s ease-in-out ${GLOW_DELAY}ms infinite`;

                // Jadwalkan siklus berikutnya
                setTimeout(() => cycleHeadline(el), HOLD_DURATION);
            }
        }

        scrambleRaf = requestAnimationFrame(scrambleFrame);
    }

    // ── Glitch micro-shift acak ───────────────────────────────
    function scheduleGlitch(el) {
        glitchTimer = setInterval(() => {
            // Hanya glitch kalau tidak sedang scramble
            if (!el.classList.contains('scrambling')) {
                el.classList.remove('glitch-fire');
                void el.offsetWidth;
                el.classList.add('glitch-fire');
                setTimeout(() => el.classList.remove('glitch-fire'), 400);
            }
        }, GLITCH_INTERVAL);
    }

    // ── Kick-off ──────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
