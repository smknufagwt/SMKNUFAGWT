/* chat-prefs.js — preferensi tampilan /chat: tema (otomatis/terang/gelap) & skala teks (80-150%) & skala embed (90-250%).
   Dimuat sinkron di <head> supaya tema terpasang sebelum render pertama (tanpa kedip). */
(function () {
    'use strict';
    const K_THEME = 'nufa_chat_theme', K_SCALE = 'nufa_chat_font_scale', K_ESCALE = 'nufa_chat_embed_scale';
    const BG = { dark: '#060502', light: '#fbf7ee' };
    const root = document.documentElement;

    // Palet tema beranda (disalin dari System.colors di site-fx.js); indeks aktif ada di localStorage 'nufa_theme'
    const BERANDA = [
        { neon: '#ffffff', dim: '#8ce6ef' },
        { neon: '#0f0', dim: '#008F11' },
        { neon: '#00f0ff', dim: '#008F8F' },
        { neon: '#FF3333', dim: '#CC1F1F' },
        { neon: '#FFFF66', dim: '#999900' },
        { neon: '#D966FF', dim: '#8000B3' },
        { neon: '#FF8040', dim: '#B34700' },
        { neon: '#FF10F0', dim: '#B0008C' }
    ];
    const DEFAULT_ACCENT = { neon: '#0f0', dim: '#008F11' }; // CSS bawaan beranda sebelum tema diganti
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

    const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* storage diblok, abaikan */ } };

    let theme = read(K_THEME, 'auto');
    if (['auto', 'light', 'dark'].indexOf(theme) < 0) theme = 'auto';
    let scale = parseInt(read(K_SCALE, '100'), 10);
    if (!(scale >= 80 && scale <= 150)) scale = 100;
    let embedScale = parseInt(read(K_ESCALE, '100'), 10);
    if (!(embedScale >= 90 && embedScale <= 250)) embedScale = 100;

    const toRgb = (hex) => {
        let h = hex.replace('#', '');
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        const n = parseInt(h, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const lumOf = (c) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a, b) => {
        const x = lumOf(a), y = lumOf(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const toHsl = (c) => {
        const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
        let h = 0, s = 0;
        if (d) {
            s = d / (1 - Math.abs(2 * l - 1));
            if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
            h *= 60; if (h < 0) h += 360;
        }
        return [h, s, l];
    };
    const fromHsl = (h, s, l) => {
        const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
        const q = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
        return q.map((v) => Math.round((v + m) * 255));
    };
    // Geser lightness (dir -1 gelapkan / +1 terangkan) sampai kontras terhadap ref >= min
    const fit = (rgb, ref, min, dir) => {
        if (ratio(rgb, ref) >= min) return rgb;
        const hsl = toHsl(rgb);
        let l = hsl[2];
        for (let i = 0; i < 100; i++) {
            l = Math.min(1, Math.max(0, l + dir * 0.01));
            const c = fromHsl(hsl[0], hsl[1], l);
            if (ratio(c, ref) >= min) return c;
        }
        return fromHsl(hsl[0], hsl[1], dir < 0 ? 0 : 1);
    };
    // Permukaan terburuk tempat kutip tampil: bubble sendiri + tint aksen terkuat (gelap di mode terang, terang di mode gelap)
    const REF = { light: [210, 204, 186], dark: [56, 52, 42] };
    const berandaColors = () => {
        const i = parseInt(read('nufa_theme', ''), 10);
        return BERANDA[i] || DEFAULT_ACCENT;
    };

    const resolve = () => (theme === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : theme);

    function apply() {
        const t = resolve();
        root.setAttribute('data-chat-theme', t);
        root.style.setProperty('--chat-scale', String(scale / 100));
        root.style.setProperty('--chat-embed-scale', String(embedScale / 100));
        // Aksen kutip/facade = warna tema beranda; di mode terang digelapkan supaya kontras
        const c = berandaColors(), light = t === 'light';
        const ref = light ? REF.light : REF.dark, dir = light ? -1 : 1;
        const neon = fit(toRgb(c.neon), ref, 4.5, dir); // teks kutip: kontras >= 4.5
        const dim = fit(toRgb(c.dim), ref, 3, dir);     // garis/border facade: kontras >= 3
        root.style.setProperty('--neon', 'rgb(' + neon.join(', ') + ')');
        root.style.setProperty('--neon-dim', 'rgb(' + dim.join(', ') + ')');
        root.style.setProperty('--chat-accent', 'rgb(' + neon.join(', ') + ')');
        root.style.setProperty('--chat-accent-dim', 'rgb(' + dim.join(', ') + ')');
        root.style.setProperty('--chat-accent-rgb', neon.join(', '));
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', BG[t]);
    }

    // Tema beranda diganti di tab lain -> ikut berubah
    window.addEventListener('storage', (e) => { if (e.key === 'nufa_theme') apply(); });

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
