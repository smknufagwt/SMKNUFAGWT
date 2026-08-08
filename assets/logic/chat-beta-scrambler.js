/* chat-beta-scrambler.js — scramble huruf satu-per-satu untuk badge "BETA"
   di nav /chat. Engine sendiri (bukan reuse instance headline.js) biar
   nggak rebutan elemen/timer, tapi pakai pola scramble yang sama. */
(function () {
    'use strict';

    const TEXT           = 'BETA';
    const POOL           = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
    const PER_CHAR_MS     = 550;  // sengaja agak lama per huruf, biar user sadar ini beta
    const SCRAMBLE_TICK_MS = 45;  // kecepatan ganti karakter acak sebelum lock
    const HOLD_MS         = 4000; // tahan "BETA" penuh 4 detik sebelum ulang

    let tickTimer = null;
    let cycleTimer = null;

    function randChar() {
        return POOL[Math.floor(Math.random() * POOL.length)];
    }

    function run(el) {
        if (!el) return;

        let lockedCount = 0;
        el.classList.add('is-scrambling');

        function lockNextChar() {
            lockedCount++;

            function tick() {
                let display = '';
                for (let i = 0; i < TEXT.length; i++) {
                    display += i < lockedCount ? TEXT[i] : randChar();
                }
                el.textContent = display;
            }

            clearInterval(tickTimer);
            tickTimer = setInterval(tick, SCRAMBLE_TICK_MS);
            tick();

            setTimeout(() => {
                if (lockedCount < TEXT.length) {
                    lockNextChar();
                } else {
                    clearInterval(tickTimer);
                    el.textContent = TEXT;
                    el.classList.remove('is-scrambling');
                    cycleTimer = setTimeout(() => run(el), HOLD_MS);
                }
            }, PER_CHAR_MS);
        }

        lockNextChar();
    }

    function init() {
        const el = document.getElementById('chat-beta-badge');
        if (!el) return; // belum masuk halaman /chat, skip
        run(el);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
