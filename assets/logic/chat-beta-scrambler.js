/* chat-beta-scrambler.js — scramble label "BETA" (badge nav /chat + label
   kecil di atas tombol CHAT nav utama). Delegate ke ScrambleFX
   (assets/logic/scramble-engine.js) biar gak ada logic scramble kedobel. */
(function () {
    'use strict';

    const TARGET_IDS = ['chat-beta-badge', 'nav-chat-beta-label'];

    function init() {
        if (!window.ScrambleFX) return; // engine belum kemuat
        TARGET_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return; // elemen ini gak ada di halaman sekarang, skip
            window.ScrambleFX.run(el, 'BETA', { perCharMs: 550, tickMs: 45, holdMs: 4000, loop: true });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
