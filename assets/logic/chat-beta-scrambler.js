/* chat-beta-scrambler.js — scramble badge "BETA" di nav /chat.
   Delegate ke ScrambleFX (assets/logic/scramble-engine.js) biar gak ada
   logic scramble kedobel di banyak file. */
(function () {
    'use strict';

    function init() {
        const el = document.getElementById('chat-beta-badge');
        if (!el || !window.ScrambleFX) return; // belum masuk /chat atau engine belum kemuat
        window.ScrambleFX.run(el, 'BETA', { perCharMs: 550, tickMs: 45, holdMs: 4000, loop: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
