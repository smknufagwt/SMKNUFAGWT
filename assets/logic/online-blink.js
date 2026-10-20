/* online-blink.js — kedip dot ONLINE dinamis: 1 orang = pola pelan ala morse, makin ramai makin cepat/rapat. */
(function () {
    'use strict';
    // '-' = nyala, '.' = mati, tiap karakter = 1 unit waktu
    const TIERS = [
        { max: 1,        pattern: '..--...--...---..--...---', unit: 230 },
        { max: 4,        pattern: '.-.--..-.---.--', unit: 140 },
        { max: 9,        pattern: '.-.-.--.-.--', unit: 85 },
        { max: 24,       pattern: '-.-.-.--.-', unit: 50 },
        { max: Infinity, pattern: '-.-.--.-.', unit: 32 },
    ];
    let tier = TIERS[0], idx = 0, timer = null, count = 0;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    function dot() { return document.querySelector('.dot-online'); }
    function paint(on) {
        const d = dot();
        if (!d) return;
        d.classList.add('is-dyn');
        const glow = Math.min(14, 6 + Math.log2(count + 1) * 2);
        d.style.opacity = on ? '1' : '0.15';
        d.style.boxShadow = on ? '0 0 ' + glow + 'px var(--neon)' : 'none';
    }
    function tick() {
        timer = null;
        if (document.hidden) return;
        const on = tier.pattern[idx] === '-';
        paint(on);
        idx = (idx + 1) % tier.pattern.length;
        timer = setTimeout(tick, tier.unit);
    }
    function start() { if (!timer && !reduce) tick(); }
    function set(n) {
        count = Math.max(0, Number(n) || 0);
        const next = TIERS.find(t => count <= t.max) || TIERS[TIERS.length - 1];
        if (next !== tier) { tier = next; idx = 0; }
        if (reduce) { paint(true); return; }
        start();
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    window.OnlineBlink = { set };
})();
