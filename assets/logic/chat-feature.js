/* chat-feature.js — formulir "Usul fitur / laporkan masalah" di footer /chat.
   Kirim lewat GitHub Issue (publik) atau Email (privat), atau salin sebagai .md. Tidak menyimpan apa pun ke database. */
(function () {
    'use strict';
    const REPO = 'smknufagwt/SMKNUFAGWT';
    const MAIL = 'smknufagwt@gmail.com';
    const MAX_URL = 7000; // batas aman panjang URL GitHub
    const $ = (id) => document.getElementById(id);

    function read() {
        return {
            type: $('chat-feature-type').value,
            area: $('chat-feature-area').value,
            title: $('chat-feature-name').value.trim(),
            detail: $('chat-feature-detail').value.trim(),
            steps: $('chat-feature-steps').value.trim(),
            benefit: $('chat-feature-benefit').value.trim(),
            priority: $('chat-feature-priority').value,
        };
    }

    function validate(d) {
        if (d.title.length < 5) return 'Judul minimal 5 karakter.';
        if (d.detail.length < 15) return 'Ceritakan idemu minimal 15 karakter.';
        return '';
    }

    // md=true → format Markdown (GitHub/salin); md=false → teks polos (Email)
    function build(d, md) {
        const h = (t) => (md ? '## ' + t : t.toUpperCase());
        const b = (t) => (md ? '**' + t + '**' : t);
        let out = b('Jenis') + ': ' + d.type + '\n' + b('Bagian') + ': ' + d.area + '\n' + b('Tingkat penting') + ': ' + d.priority + '\n\n' +
            h('Cerita') + '\n' + d.detail + '\n\n';
        if (d.steps) out += h('Langkah sampai muncul') + '\n' + d.steps + '\n\n';
        if (d.benefit) out += h('Manfaat') + '\n' + d.benefit + '\n\n';
        return out + '---\n' + (md ? '_Diajukan lewat Chat NUFABASE (/chat)_' : 'Diajukan lewat Chat NUFABASE (/chat)');
    }

    function init() {
        const modal = $('chat-feature-modal'), openBtn = $('chat-feature-open');
        if (!modal || !openBtn) return;
        const msg = $('chat-feature-msg'), detail = $('chat-feature-detail'), count = $('chat-feature-count');
        const say = (text, bad) => {
            msg.hidden = !text;
            msg.textContent = text || '';
            msg.classList.toggle('is-error', !!bad);
        };
        const open = () => { modal.hidden = false; say(''); $('chat-feature-name').focus(); };
        const close = () => { modal.hidden = true; };
        const run = (fn) => { const d = read(), err = validate(d); if (err) { say(err, true); return; } fn(d); };

        openBtn.addEventListener('click', open);
        $('chat-feature-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
        detail.addEventListener('input', () => { count.textContent = detail.value.length + ' / ' + detail.maxLength; });

        $('chat-feature-github').addEventListener('click', () => run((d) => {
            const url = 'https://github.com/' + REPO + '/issues/new?title=' + encodeURIComponent('[' + d.type + '] ' + d.title) +
                '&body=' + encodeURIComponent(build(d, true)) + '&labels=' + encodeURIComponent(/rusak|error/i.test(d.type) ? 'bug' : 'enhancement');
            if (url.length > MAX_URL) { say('Tulisanmu terlalu panjang untuk GitHub. Persingkat sedikit, atau pakai Email / Salin teks.', true); return; }
            window.open(url, '_blank', 'noopener');
            say('Membuka GitHub… tekan "Submit new issue" di sana. Kalau tab tidak terbuka, izinkan popup.');
        }));

        $('chat-feature-email').addEventListener('click', () => run((d) => {
            window.location.href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent('[Chat NUFABASE] ' + d.type + ': ' + d.title) +
                '&body=' + encodeURIComponent(build(d, false));
            say('Membuka aplikasi email… tekan Kirim di sana.');
        }));

        $('chat-feature-copy').addEventListener('click', () => run(async (d) => {
            const text = '# ' + d.title + '\n\n' + build(d, true);
            try { await navigator.clipboard.writeText(text); say('Tersalin sebagai teks Markdown. Tempel di mana saja.'); }
            catch (e) { say('Gagal menyalin. Izinkan akses papan klip di browser.', true); }
        }));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
