/* chat-prefs.js — preferensi tampilan /chat: tema (otomatis/terang/gelap) & skala teks+embed.
   Dimuat sinkron di <head> supaya tema terpasang sebelum render pertama (tanpa kedip). */
(function () {
    'use strict';
    const K_THEME = 'nufa_chat_theme', K_SCALE = 'nufa_chat_font_scale';
    const BG = { dark: '#060502', light: '#fbf7ee' };
    const root = document.documentElement;
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

    const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* storage diblok, abaikan */ } };

    let theme = read(K_THEME, 'auto');
    if (['auto', 'light', 'dark'].indexOf(theme) < 0) theme = 'auto';
    let scale = parseInt(read(K_SCALE, '100'), 10);
    if (!(scale >= 80 && scale <= 150)) scale = 100;

    const resolve = () => (theme === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : theme);

    function apply() {
        const t = resolve();
        root.setAttribute('data-chat-theme', t);
        root.style.setProperty('--chat-scale', String(scale / 100));
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
        setTheme(t) {
            if (['auto', 'light', 'dark'].indexOf(t) < 0) return;
            theme = t; write(K_THEME, t); apply();
        },
        setScale(p) {
            scale = Math.min(150, Math.max(80, Math.round(Number(p) / 5) * 5)) || 100;
            write(K_SCALE, scale); apply();
        },
        reset() { theme = 'auto'; scale = 100; write(K_THEME, theme); write(K_SCALE, scale); apply(); },
    };
    apply();
})();
