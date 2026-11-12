/* footer-fx.js — counter visitor realtime (Firestore user_in/total) + efek footer */
(function () {
    'use strict';
    const LS_KEY = 'nufa_user_in_counted';
    const ID_KEY = 'nufa_vid';
    let counted = false;

    function mountBadge() {
        const log = document.getElementById('system-log');
        if (!log || document.getElementById('footer-visitors')) return document.getElementById('footer-visitors');
        const box = document.createElement('div');
        box.style.textAlign = 'center';
        box.innerHTML = '<span id="footer-visitors"><span class="vdot"></span><span class="vnum">--</span> PENGUNJUNG</span>';
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

    function ckGet(k) { const m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
    function ckSet(k, v) { document.cookie = k + '=' + encodeURIComponent(v) + '; max-age=63072000; path=/; SameSite=Lax'; }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    function getVid() {
        let id = lsGet(ID_KEY) || ckGet(ID_KEY);
        if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
            id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^A-Za-z0-9_-]/g, '');
            if (id.length < 16) id += Math.random().toString(36).slice(2, 12);
        }
        lsSet(ID_KEY, id); ckSet(ID_KEY, id);
        return id;
    }

    function markCounted() { lsSet(LS_KEY, String(Date.now())); ckSet(LS_KEY, '1'); counted = true; }
    function isCounted() { return counted || !!lsGet(LS_KEY) || ckGet(LS_KEY) === '1'; }

    async function countOnce(ref) {
        if (isCounted() || navigator.onLine === false) { if (isCounted()) markCounted(); return; }
        counted = true;
        const db = firebase.firestore();
        const visitor = db.collection('user_in_visitors').doc(getVid());
        const inc = () => ref.update({ count: firebase.firestore.FieldValue.increment(1) });
        try {
            const batch = db.batch();
            batch.set(visitor, { ts: firebase.firestore.FieldValue.serverTimestamp() });
            batch.update(ref, { count: firebase.firestore.FieldValue.increment(1) });
            await batch.commit();
            markCounted();
            return;
        } catch (e) {
            if (e.code === 'permission-denied') {
                try { if ((await visitor.get()).exists) { markCounted(); return; } } catch (_) {}
            } else if (e.code !== 'not-found') {
                console.warn('[user_in] gagal hitung:', e.code || e.message);
                counted = false;
                return;
            }
        }
        try {
            try { await inc(); }
            catch (e) {
                if (e.code !== 'not-found' && e.code !== 'permission-denied') throw e;
                try { await ref.set({ count: 1 }); } catch (e2) { await inc(); }
            }
            markCounted();
        } catch (e) {
            console.warn('[user_in] gagal hitung:', e.code || e.message);
            counted = false;
        }
    }

    async function initCounter() {
        if (typeof firebase === 'undefined' || !firebase.firestore || typeof FIREBASE_CONFIG === 'undefined') return;
        if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('%%')) return;
        if (!firebase.apps.some(a => a.name === '[DEFAULT]')) firebase.initializeApp(FIREBASE_CONFIG);
        const ref = firebase.firestore().collection('user_in').doc('total');

        countOnce(ref);
        window.addEventListener('online', () => countOnce(ref));

        ref.onSnapshot(snap => {
            if (!snap.exists && snap.metadata.fromCache) return;
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

    function initBeams() {
        const f = document.querySelector('footer');
        if (!f || f.querySelector('.footer-beams')) return;
        if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const wrap = document.createElement('div');
        wrap.className = 'footer-beams';
        wrap.setAttribute('aria-hidden', 'true');
        f.insertBefore(wrap, f.firstChild);
        const rnd = (a, b) => a + Math.random() * (b - a);
        const colors = ['var(--neon)', '#ffffff', 'var(--glitch-blue)'];
        function shuffle(b, force) {
            const on = force || Math.random() < 0.6;
            b.style.setProperty('--bw', rnd(18, 48).toFixed(0) + '%');
            b.style.setProperty('--bdur', rnd(2.2, 6).toFixed(2) + 's');
            b.style.setProperty('--bcol', colors[Math.floor(Math.random() * colors.length)]);
            b.style.setProperty('--bh', rnd(1.5, 3).toFixed(1) + 'px');
            b.style.animationDirection = Math.random() < 0.3 ? 'reverse' : 'normal';
            b.style.visibility = on ? 'visible' : 'hidden';
        }
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < 3; i++) {
            const b = document.createElement('span');
            b.className = 'footer-beam';
            shuffle(b, i === 0);
            b.style.animationDelay = (-rnd(0, 4)).toFixed(2) + 's';
            if (i >= count) b.style.visibility = 'hidden';
            b.addEventListener('animationiteration', () => {
                shuffle(b, i === 0);
                const alive = Array.from(wrap.children).filter(x => x.style.visibility !== 'hidden').length;
                if (alive === 0) b.style.visibility = 'visible';
            });
            wrap.appendChild(b);
        }
    }

    function init() { mountBadge(); initReveal(); initBeams(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    window.addEventListener('load', () => { initCounter().catch(() => {}); });
})();
