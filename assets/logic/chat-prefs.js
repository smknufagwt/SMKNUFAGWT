/* chat-prefs.js — preferensi tampilan /chat: tema (otomatis/terang/gelap) & skala teks (80-150%) & skala embed (90-250%).
   Dimuat sinkron di <head> supaya tema terpasang sebelum render pertama (tanpa kedip). */
(function () {
    'use strict';
    const K_THEME = 'nufa_chat_theme', K_SCALE = 'nufa_chat_font_scale', K_ESCALE = 'nufa_chat_embed_scale';
    const BG = { dark: '#060502', light: '#fbf7ee' };
    const root = document.documentElement;
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

    const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* storage diblok, abaikan */ } };

    let theme = read(K_THEME, 'auto');
    if (['auto', 'light', 'dark'].indexOf(theme) < 0) theme = 'auto';
    let scale = parseInt(read(K_SCALE, '100'), 10);
    if (!(scale >= 80 && scale <= 150)) scale = 100;
    let embedScale = parseInt(read(K_ESCALE, '100'), 10);
    if (!(embedScale >= 90 && embedScale <= 250)) embedScale = 100;

    const resolve = () => (theme === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : theme);

    function apply() {
        const t = resolve();
        root.setAttribute('data-chat-theme', t);
        root.style.setProperty('--chat-scale', String(scale / 100));
        root.style.setProperty('--chat-embed-scale', String(embedScale / 100));
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', BG[t]);
    }

    if (mq) {
        const onChange = () => { if (theme === 'auto') apply(); };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
    }

    window.ChatPrefs = {
        get theme() { return theme; },
        get scale() { return scale; },
        get embedScale() { return embedScale; },
        setTheme(t) {
            if (['auto', 'light', 'dark'].indexOf(t) < 0) return;
            theme = t; write(K_THEME, t); apply();
        },
        setEmbedScale(p) {
            embedScale = Math.min(250, Math.max(90, Math.round(Number(p) / 10) * 10)) || 100;
            write(K_ESCALE, embedScale); apply();
        },
        setScale(p) {
            scale = Math.min(150, Math.max(80, Math.round(Number(p) / 5) * 5)) || 100;
            write(K_SCALE, scale); apply();
        },
        reset() {
            theme = 'auto'; scale = 100; embedScale = 100;
            write(K_THEME, theme); write(K_SCALE, scale); write(K_ESCALE, embedScale); apply();
        },
    };
    apply();
})();
