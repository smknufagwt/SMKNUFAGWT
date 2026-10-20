/* footer-fx.js — counter visitor realtime (Firestore user_in/total) + efek footer */
(function () {
    'use strict';
    const LS_KEY = 'nufa_user_in_counted';
    let counted = false;

    function mountBadge() {
        const log = document.getElementById('system-log');
        if (!log || document.getElementById('footer-visitors')) return document.getElementById('footer-visitors');
        const box = document.createElement('div');
        box.style.textAlign = 'center';
        box.innerHTML = '<span id="footer-visitors"><span class="vdot"></span><span class="vnum">--</span> VISITOR</span>';
        log.insertAdjacentElement('afterend', box);
        return document.getElementById('footer-visitors');
    }

    function paint(n) {
        const badge = mountBadge();
        if (typeof System !== 'undefined') System.currentVisits = n;
        if (!badge) return;
        const num = badge.querySelector('.vnum');
        const old = num.textContent;
        num.textContent = n.toLocaleString('id-ID');
        if (old !== '--' && old !== num.textContent) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
    }

    async function initCounter() {
        if (typeof firebase === 'undefined' || !firebase.firestore || typeof FIREBASE_CONFIG === 'undefined') return;
        if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('%%')) return;
        if (!firebase.apps.some(a => a.name === '[DEFAULT]')) firebase.initializeApp(FIREBASE_CONFIG);
        const ref = firebase.firestore().collection('user_in').doc('total');

        if (!localStorage.getItem(LS_KEY) && !counted) {
            counted = true;
            const inc = () => ref.update({ count: firebase.firestore.FieldValue.increment(1) });
            try {
                try { await inc(); }
                catch (e) {
                    if (e.code !== 'not-found') throw e;
                    try { await ref.set({ count: 1 }); } catch (e2) { await inc(); }
                }
                localStorage.setItem(LS_KEY, String(Date.now()));
            } catch (e) { console.warn('[user_in] gagal hitung:', e.code || e.message); counted = false; }
        }

        ref.onSnapshot(snap => {
            const n = snap.exists ? Number(snap.data().count) || 0 : 0;
            paint(n);
        }, err => console.warn('[user_in] listen:', err.code || err.message));
    }

    function initReveal() {
        const f = document.querySelector('footer');
        if (!f) return;
        const items = Array.from(f.children);
        items.forEach((el, i) => { el.classList.add('footer-fx-in'); el.style.transitionDelay = (i * 90) + 'ms'; });
        const io = new IntersectionObserver(es => {
            es.forEach(en => { if (en.isIntersecting) { items.forEach(el => el.classList.add('is-in')); io.disconnect(); } });
        }, { threshold: 0 });
        io.observe(f);
    }

    function init() { mountBadge(); initReveal(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    window.addEventListener('load', () => { initCounter().catch(() => {}); });
})();
