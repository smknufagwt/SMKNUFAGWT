/* scramble-engine.js — engine scramble teks reusable (dipakai badge BETA,
   hint ticker akun /chat, dan nama user setelah login). Satu sumber logic
   biar gak ada duplikasi antar file (chat-beta-scrambler.js delegate ke sini). */
(function () {
    'use strict';

    const DEFAULT_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';

    function randChar(pool) {
        return pool[Math.floor(Math.random() * pool.length)];
    }

    /**
     * Scramble teks ke sebuah elemen, huruf-per-huruf, lalu opsional hold+loop.
     * @param {HTMLElement} el
     * @param {string} text
     * @param {object} opts
     *   perCharMs    - lama tiap huruf sebelum lock (default 550)
     *   tickMs       - kecepatan ganti karakter acak (default 45)
     *   holdMs       - tahan teks penuh sebelum callback/loop (default 4000)
     *   pool         - karakter random buat scramble (default A-Z0-9 simbol)
     *   loop         - true = ulang otomatis setelah hold (default false)
     *   scrambleClass- class yang ditambah selama proses scramble (default 'is-scrambling')
     *   onDone       - callback() dipanggil sekali setelah teks penuh ter-lock (sebelum hold)
     * @returns {{ stop: Function }} handle buat hentikan loop/timer
     */
    function run(el, text, opts) {
        if (!el) return { stop() {} };
        opts = opts || {};
        const perCharMs = opts.perCharMs || 550;
        const tickMs = opts.tickMs || 45;
        const holdMs = opts.holdMs != null ? opts.holdMs : 4000;
        const pool = opts.pool || DEFAULT_POOL;
        const loop = !!opts.loop;
        const scrambleClass = opts.scrambleClass || 'is-scrambling';

        let tickTimer = null;
        let stepTimer = null;
        let cycleTimer = null;
        let stopped = false;

        function lockNextChar(lockedCount) {
            if (stopped) return;
            lockedCount++;

            function tick() {
                let display = '';
                for (let i = 0; i < text.length; i++) {
                    display += i < lockedCount ? text[i] : randChar(pool);
                }
                el.textContent = display;
            }

            clearInterval(tickTimer);
            tickTimer = setInterval(tick, tickMs);
            tick();

            stepTimer = setTimeout(() => {
                if (stopped) return;
                if (lockedCount < text.length) {
                    lockNextChar(lockedCount);
                } else {
                    clearInterval(tickTimer);
                    el.textContent = text;
                    el.classList.remove(scrambleClass);
                    if (opts.onDone) opts.onDone();
                    if (loop) cycleTimer = setTimeout(() => { if (!stopped) run2(); }, holdMs);
                }
            }, perCharMs);
        }

        function run2() {
            el.classList.add(scrambleClass);
            lockNextChar(0);
        }

        run2();

        return {
            stop() {
                stopped = true;
                clearInterval(tickTimer);
                clearTimeout(stepTimer);
                clearTimeout(cycleTimer);
                el.classList.remove(scrambleClass);
            },
        };
    }

    window.ScrambleFX = { run };
})();
