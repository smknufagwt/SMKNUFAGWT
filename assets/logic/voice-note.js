/* voice-note.js — pesan suara: rekam Opus 64 kbps mono 48 kHz → base64 di Firestore (voice_notes), putar lazy saat di-tap. */
(function () {
    'use strict';
    const COL = 'voice_notes';
    const MAX_SEC = 30;
    const BITRATE = 64000;
    const MAX_BLOB = 340000;
    const RE = /\[([^\[\]]*)\]\{voice:([A-Za-z0-9]{20})\}/g;
    const CF = window.ChatFormat || (typeof ChatFormat !== 'undefined' ? ChatFormat : null);
    if (!CF) return;

    const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    const $ = (id) => document.getElementById(id);
    const secs = (t) => { const m = String(t).match(/(\d+):(\d{2})/); return m ? m[1] * 60 + +m[2] : 0; };
    // Opus/WebM hasil MediaRecorder sering melapor duration = Infinity -> pakai durasi label/rekaman sebagai cadangan.
    const dur = (a, fb) => (isFinite(a.duration) && a.duration > 0 ? a.duration : fb);
    // Loop rAF biar slider mulus (timeupdate cuma ~4x/detik).
    function ticker(audio, fb, paint) {
        let id = 0;
        const frame = () => { paint(audio.currentTime, dur(audio, fb)); id = requestAnimationFrame(frame); };
        return { start() { cancelAnimationFrame(id); frame(); }, stop() { cancelAnimationFrame(id); id = 0; } };
    }

    function getDb() {
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return null;
        return (firebase.apps.find((a) => a.name === 'chat') || firebase.apps[0]).firestore();
    }

    // ── render token [🎤 0:12]{voice:ID} di bubble ──
    function voiceHtml(label, id) {
        const t = (String(label).match(/\d+:\d{2}/) || ['0:00'])[0];
        return '<span class="voice-note" data-vid="' + id + '" data-state="idle" role="group" aria-label="Pesan suara"><button type="button" class="voice-play" aria-label="Putar pesan suara"><i class="fa-solid fa-play"></i></button><span class="voice-track" role="presentation"><i class="voice-fill"></i></span><span class="voice-time">' + t + '</span></span>';
    }
    function wrap(name, fn) {
        const orig = CF[name];
        if (typeof orig !== 'function') return;
        CF[name] = function (raw) { return fn.call(this, orig, raw); };
    }
    wrap('toHtml', function (orig, raw) {
        const list = [];
        const pre = String(raw).replace(RE, (m, label, id) => { list.push(voiceHtml(label, id)); return '\u2063VN' + (list.length - 1) + '\u2063'; });
        return orig.call(this, pre).replace(/\u2063VN(\d+)\u2063/g, (m, i) => list[i] || '');
    });
    ['toPlain', 'toPlainText'].forEach((n) => wrap(n, function (orig, raw) {
        return orig.call(this, String(raw).replace(RE, '🎤 Pesan suara'));
    }));

    // ── pemutaran (lazy fetch + satu pemutar aktif) ──
    const urlCache = new Map();
    let cur = null;

    const URL_CACHE_MAX = 30;
    // Buang object URL tertua (kecuali yang sedang diputar) agar memori tidak menumpuk
    function evictUrls() {
        for (const k of urlCache.keys()) {
            if (urlCache.size <= URL_CACHE_MAX) break;
            if (cur && cur.box.dataset.vid === k) continue;
            const pr = urlCache.get(k);
            urlCache.delete(k);
            pr.then((u) => URL.revokeObjectURL(u), () => {});
        }
    }
    // Cache menyimpan Promise: tap ganda saat memuat tidak membaca Firestore dua kali
    function loadUrl(id) {
        if (urlCache.has(id)) return urlCache.get(id);
        const pr = (async () => {
            const db = getDb();
            if (!db) throw new Error('db');
            const snap = await db.collection(COL).doc(id).get();
            if (!snap.exists) throw new Error('missing');
            const { d, m } = snap.data();
            const bin = atob(d);
            const u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            return URL.createObjectURL(new Blob([u8], { type: m || 'audio/webm' }));
        })();
        urlCache.set(id, pr);
        pr.then(evictUrls, () => urlCache.delete(id)); // gagal: jangan simpan, boleh dicoba lagi
        return pr;
    }

    const ICONS = { idle: 'play', paused: 'play', playing: 'pause', loading: 'spinner fa-spin', error: 'triangle-exclamation' };
    function setState(box, state) {
        box.dataset.state = state;
        const i = box.querySelector('.voice-play i');
        if (i) i.className = 'fa-solid fa-' + ICONS[state];
    }
    function soundLock(on) {
        if (!cur || cur.locked === on) return;
        cur.locked = on;
        if (typeof GlobalChat !== 'undefined' && GlobalChat.handleMediaSoundToggle) GlobalChat.handleMediaSoundToggle(on);
    }
    function stopCur() {
        if (!cur) return;
        const c = cur;
        soundLock(false);
        if (c.tick) c.tick.stop();
        c.audio.pause();
        const fill = c.box.querySelector('.voice-fill');
        if (fill) fill.style.width = '0%';
        if (c.total) c.box.querySelector('.voice-time').textContent = c.total;
        setState(c.box, 'idle');
        cur = null;
    }
    async function toggle(box) {
        if (cur && cur.box === box) { cur.audio.paused ? cur.audio.play().catch(() => {}) : cur.audio.pause(); return; }
        stopCur();
        pausePreview();
        setState(box, 'loading');
        try {
            const audio = new Audio(await loadUrl(box.dataset.vid));
            const fill = box.querySelector('.voice-fill');
            const tEl = box.querySelector('.voice-time');
            const total = tEl.textContent;
            const me = { box, audio, locked: false, total, fb: secs(total), tick: null, paint: null };
            let lastW = '', lastT = ''; // tulis DOM hanya saat nilainya berubah (hindari layout tiap frame)
            me.paint = (t, d) => {
                const w = (d ? Math.min(1, t / d) * 100 : 0).toFixed(1) + '%';
                if (w !== lastW) { fill.style.width = w; lastW = w; }
                const tx = fmt(t);
                if (tx !== lastT) { tEl.textContent = tx; lastT = tx; }
            };
            me.tick = ticker(audio, me.fb, me.paint);
            cur = me;
            audio.addEventListener('play', () => { if (cur === me) { setState(box, 'playing'); soundLock(true); me.tick.start(); } });
            audio.addEventListener('pause', () => { if (cur === me && !audio.ended) { setState(box, 'paused'); soundLock(false); me.tick.stop(); } });
            audio.addEventListener('ended', () => { if (cur === me) stopCur(); });
            await audio.play();
        } catch (e) {
            cur = null;
            setState(box, 'error');
        }
    }
    document.addEventListener('click', (e) => {
        const b = e.target.closest('.voice-play');
        if (b) { toggle(b.closest('.voice-note')); return; }
        const tr = e.target.closest('.voice-track');
        if (tr && cur && cur.box.contains(tr)) {
            const d = dur(cur.audio, cur.fb);
            if (!d) return;
            const r = tr.getBoundingClientRect();
            const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * d;
            cur.audio.currentTime = t;
            cur.paint(t, d);
        }
    });

    // ── perekam ──
    const rec = { ac: null, an: null, buf: null, mr: null, stream: null, chunks: [], timer: null, t0: 0, blob: null, mime: '', dur: 0, preview: null, previewUrl: null, previewTick: null, seeking: false, bgm: false };
    let bar = null, mic = null, noteTimer = null, composer = null;

    function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); }
    function pickMime() {
        const list = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
        return list.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    }
    function setUi(state) {
        bar.hidden = state === 'idle';
        bar.dataset.state = state;
        mic.classList.toggle('rec', state === 'recording');
        bar.querySelectorAll('.vn-prev, .vn-cancel, .vn-seek').forEach((b) => { b.disabled = state === 'sending'; });
        if (!composer) return;
        // Mode composer (beranda): mic = rekam/stop/rekam ulang, tombol kirim #chat-send tetap satu-satunya.
        composer.field.classList.toggle('vn-active', state !== 'idle');
        composer.send.classList.toggle('vn-hold', state === 'recording' || state === 'sending');
        mic.firstElementChild.className = 'fa-solid fa-' + (state === 'recording' ? 'stop' : state === 'ready' ? 'rotate-right' : 'microphone');
        const lbl = state === 'recording' ? 'Berhenti merekam' : state === 'ready' ? 'Rekam ulang' : 'Rekam pesan suara';
        mic.title = lbl;
        mic.setAttribute('aria-label', lbl);
        mic.disabled = state === 'sending';
    }
    function note(msg) {
        bar.querySelector('.vn-note').textContent = msg;
        setUi('note');
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => { if (bar.dataset.state === 'note') setUi('idle'); }, 3200);
    }
    function closeMeter() {
        if (rec.ac) { rec.ac.close().catch(() => {}); }
        rec.ac = rec.an = rec.buf = null;
        if (bar) bar.style.setProperty('--vn-level', '0');
    }
    function openMeter() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            rec.ac = new AC();
            rec.an = rec.ac.createAnalyser();
            rec.an.fftSize = 512;
            rec.ac.createMediaStreamSource(rec.stream).connect(rec.an);
            rec.buf = new Uint8Array(rec.an.fftSize);
        } catch (e) { closeMeter(); }
    }
    function readLevel() {
        if (!rec.an) return;
        rec.an.getByteTimeDomainData(rec.buf);
        let sum = 0;
        for (let i = 0; i < rec.buf.length; i++) { const v = (rec.buf[i] - 128) / 128; sum += v * v; }
        bar.style.setProperty('--vn-level', Math.min(1, Math.sqrt(sum / rec.buf.length) * 4).toFixed(2));
    }
    function releaseStream() {
        closeMeter();
        if (rec.stream) rec.stream.getTracks().forEach((t) => t.stop());
        rec.stream = null;
    }
    let lastSeek = -1, lastSeekTxt = '';
    function paintSeek(t, d) {
        if (rec.seeking) return;
        const p = d ? Math.min(1, t / d) : 0;
        const v = Math.round(p * 1000);
        if (v !== lastSeek) {
            lastSeek = v;
            bar.querySelector('.vn-seek').value = v;
            bar.style.setProperty('--vn-p', (p * 100).toFixed(1) + '%');
        }
        const tx = fmt(t) + ' / ' + fmt(rec.dur);
        if (tx !== lastSeekTxt) { lastSeekTxt = tx; bar.querySelector('.vn-time').textContent = tx; }
    }
    function previewIdle() {
        lastSeek = -1; lastSeekTxt = '';
        bar.dataset.play = '0';
        bar.querySelector('.vn-prev i').className = 'fa-solid fa-play';
        bar.querySelector('.vn-seek').value = 0;
        bar.style.setProperty('--vn-p', '0%');
        if (rec.blob) bar.querySelector('.vn-time').textContent = fmt(rec.dur);
    }
    function resetRec() {
        clearInterval(rec.timer);
        if (rec.mr && rec.mr.state !== 'inactive') { rec.mr.onstop = null; try { rec.mr.stop(); } catch (e) {} }
        releaseStream();
        if (rec.previewTick) { rec.previewTick.stop(); rec.previewTick = null; }
        if (rec.preview) { rec.preview.pause(); rec.preview = null; }
        if (rec.previewUrl) { URL.revokeObjectURL(rec.previewUrl); rec.previewUrl = null; }
        rec.mr = null; rec.chunks = []; rec.blob = null; rec.dur = 0;
        previewIdle();
        if (rec.bgm && typeof System !== 'undefined' && System.bgm) System.bgm.play().catch(() => {});
        rec.bgm = false;
        setUi('idle');
    }
    async function start() {
        stopCur();
        try {
            rec.stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, sampleRate: 48000, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
        } catch (e) { note(e && e.name === 'NotAllowedError' ? 'Izin mikrofon ditolak.' : 'Mikrofon tidak tersedia.'); return; }
        const mime = pickMime();
        try {
            rec.mr = new MediaRecorder(rec.stream, mime ? { mimeType: mime, audioBitsPerSecond: BITRATE } : { audioBitsPerSecond: BITRATE });
        } catch (e) { releaseStream(); note('Perekam tidak didukung browser ini.'); return; }
        rec.mime = rec.mr.mimeType || mime || 'audio/webm';
        rec.chunks = [];
        rec.mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
        rec.mr.onstop = onStopped;
        if (typeof System !== 'undefined' && System.bgm && !System.bgm.paused) { rec.bgm = true; System.bgm.pause(); }
        rec.mr.start(250);
        openMeter();
        rec.t0 = Date.now();
        bar.querySelector('.vn-time').textContent = '0:00';
        setUi('recording');
        rec.timer = setInterval(() => {
            readLevel();
            const s = (Date.now() - rec.t0) / 1000;
            bar.querySelector('.vn-time').textContent = fmt(s) + ' / ' + fmt(MAX_SEC);
            if (s >= MAX_SEC) stop();
        }, 100);
    }
    function stop() {
        clearInterval(rec.timer);
        if (rec.mr && rec.mr.state !== 'inactive') rec.mr.stop();
        releaseStream();
    }
    function onStopped() {
        rec.blob = new Blob(rec.chunks, { type: rec.mime });
        rec.dur = Math.min(MAX_SEC, Math.max(1, Math.round((Date.now() - rec.t0) / 1000)));
        if (rec.blob.size < 800) { resetRec(); note('Rekaman terlalu pendek.'); return; }
        if (rec.blob.size > MAX_BLOB) { resetRec(); note('Rekaman terlalu besar, coba lebih singkat.'); return; }
        previewIdle();
        setUi('ready');
    }
    function ensurePreview() {
        if (rec.preview) return rec.preview;
        rec.previewUrl = URL.createObjectURL(rec.blob);
        const a = new Audio(rec.previewUrl);
        const tk = ticker(a, rec.dur, paintSeek);
        rec.preview = a;
        rec.previewTick = tk;
        a.addEventListener('play', () => { bar.dataset.play = '1'; bar.querySelector('.vn-prev i').className = 'fa-solid fa-pause'; tk.start(); });
        a.addEventListener('pause', () => { if (a.ended) return; tk.stop(); bar.dataset.play = '0'; bar.querySelector('.vn-prev i').className = 'fa-solid fa-play'; });
        a.addEventListener('ended', () => { tk.stop(); a.currentTime = 0; previewIdle(); });
        return a;
    }
    function pausePreview() { if (rec.preview && !rec.preview.paused) rec.preview.pause(); }
    function togglePreview() {
        if (!rec.blob) return;
        const a = ensurePreview();
        if (a.paused) { stopCur(); a.play().catch(() => {}); } else a.pause();
    }

    function blobToB64(blob) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result).split(',')[1]);
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
    }

    function deliver(token) {
        const gInput = $('chat-input');
        if (gInput && typeof GlobalChat !== 'undefined') {
            const draft = gInput.value;
            gInput.value = token;
            GlobalChat.send();
            gInput.value = draft;
            if (GlobalChat.autoGrow) GlobalChat.autoGrow(gInput);
            return;
        }
        const form = $('chat-thread-form'), input = $('chat-thread-input');
        if (!form || !input) return;
        const draft = input.value;
        input.value = token;
        if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
        input.value = draft;
        input.dispatchEvent(new Event('input'));
    }

    async function send() {
        if (!rec.blob || bar.dataset.state !== 'ready') return;
        if (!navigator.onLine) { note('Butuh koneksi internet untuk kirim suara.'); return; }
        if (typeof GlobalChat !== 'undefined' && $('chat-input')) {
            const cd = typeof SEND_COOLDOWN_MS !== 'undefined' ? SEND_COOLDOWN_MS : 3000;
            if (Date.now() - (GlobalChat.lastSendTime || 0) < cd) { note('Tunggu sebentar sebelum kirim lagi.'); return; }
        }
        const db = getDb();
        if (!db) { note('Layanan belum siap, coba lagi.'); return; }
        setUi('sending');
        if (rec.preview) { rec.preview.pause(); }
        try {
            const d = await blobToB64(rec.blob);
            const ref = db.collection(COL).doc();
            await Promise.race([
                ref.set({ d, m: rec.mime.slice(0, 60), s: rec.dur, ts: firebase.firestore.FieldValue.serverTimestamp() }),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000)),
            ]);
            const dur = rec.dur;
            resetRec();
            deliver('[🎤 ' + fmt(dur) + ']{voice:' + ref.id + '}');
        } catch (e) {
            setUi('ready');
            note(e && e.code === 'permission-denied' ? 'Ditolak server (rules belum aktif?).' : 'Gagal mengirim suara.');
            setTimeout(() => { if (rec.blob && bar.dataset.state === 'note') setUi('ready'); }, 3300);
        }
    }

    // Dua host composer: beranda (#chat-compose) & /chat (form#chat-thread-form) — struktur mic/bar/kirim identik.
    function findComposer() {
        const comp = $('chat-compose'), field = $('chat-field'), sendBtn = $('chat-send');
        if (comp && field && sendBtn) return { comp, field, send: sendBtn, before: field, isForm: false };
        const form = $('chat-thread-form');
        const wrapEl = form && form.querySelector('.chat-input-wrap');
        const sendEl = form && form.querySelector(':scope > button[type="submit"]');
        if (form && wrapEl && sendEl) return { comp: form, field: wrapEl, send: sendEl, before: wrapEl, isForm: true };
        return null;
    }

    function mount() {
        const c = findComposer();
        if (!c || !supported() || document.querySelector('.vn-mic-btn')) return;
        const { comp, field, send: sendBtn } = c;
        mic = document.createElement('button');
        mic.type = 'button';
        mic.title = 'Pesan suara';
        mic.setAttribute('aria-label', 'Rekam pesan suara');
        mic.className = 'vn-mic-btn vn-mic-compose';
        mic.innerHTML = '<i class="fa-solid fa-microphone"></i>';

        bar = document.createElement('div');
        bar.className = 'vn-bar';
        bar.setAttribute('role', 'status');
        bar.hidden = true;
        bar.dataset.state = 'idle';
        bar.dataset.play = '0';
        bar.innerHTML =
            '<button type="button" class="vn-btn vn-cancel" data-s="recording ready" aria-label="Batal"><i class="fa-solid fa-xmark"></i></button>' +
            '<span class="vn-dot" data-s="recording"></span>' +
            '<button type="button" class="vn-btn vn-prev" data-s="ready sending" aria-label="Dengarkan"><i class="fa-solid fa-play"></i></button>' +
            '<span class="vn-meter" data-s="recording"><i></i></span>' +
            '<input type="range" class="vn-seek" data-s="ready sending" min="0" max="1000" value="0" step="1" aria-label="Posisi pemutaran pesan suara">' +
            '<span class="vn-time" data-s="recording ready sending">0:00</span>' +
            '<span class="vn-note" data-s="note"></span>';
        composer = { field, send: sendBtn };
        comp.insertBefore(mic, c.before);
        field.appendChild(bar);
        // Tombol kirim tunggal: saat rekaman siap, kirim suara; saat merekam/mengirim, abaikan klik.
        comp.addEventListener('click', (e) => {
            if (!sendBtn.contains(e.target)) return;
            const s = bar.dataset.state;
            if (s === 'ready') { e.preventDefault(); e.stopPropagation(); send(); }
            else if (s === 'recording' || s === 'sending') { e.preventDefault(); e.stopPropagation(); }
        }, true);
        if (c.isForm) {
            comp.addEventListener('submit', (e) => {
                const s = bar.dataset.state;
                if (s === 'idle' || s === 'note') return;
                e.preventDefault(); e.stopImmediatePropagation();
                if (s === 'ready') send();
            }, true);
        }

        mic.addEventListener('click', () => {
            const s = bar.dataset.state;
            if (s === 'recording') stop();
            else if (s === 'ready') { resetRec(); start(); }
            else if (s === 'idle' || s === 'note') start();
        });
        bar.querySelector('.vn-prev').addEventListener('click', togglePreview);
        bar.querySelector('.vn-cancel').addEventListener('click', resetRec);
        const sk = bar.querySelector('.vn-seek');
        sk.addEventListener('input', () => {
            if (!rec.blob) return;
            rec.seeking = true;
            const a = ensurePreview();
            const t = (sk.value / 1000) * dur(a, rec.dur);
            a.currentTime = t;
            bar.style.setProperty('--vn-p', (sk.value / 10) + '%');
            bar.querySelector('.vn-time').textContent = fmt(t) + ' / ' + fmt(rec.dur);
        });
        ['change', 'pointerup', 'pointercancel', 'blur'].forEach((ev) => sk.addEventListener(ev, () => { rec.seeking = false; }));
        window.addEventListener('pagehide', () => { releaseStream(); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
