/* chat-feature.js — alur "Ajukan fitur baru" di footer /chat.
   Alur: form -> GitHub Issue (publik, terisi otomatis) ATAU Email (privat) -> admin tinjau & label
   -> dikerjakan -> dicatat di Jurnal (/blog). Tidak menyimpan apa pun ke database. */
(function () {
    'use strict';
    const REPO = 'smknufagwt/SMKNUFAGWT';
    const MAIL = 'smknufagwt@gmail.com';
    const $ = (id) => document.getElementById(id);

    function read() {
        return {
            type: $('chat-feature-type').value,
            title: $('chat-feature-name').value.trim(),
            detail: $('chat-feature-detail').value.trim(),
            benefit: $('chat-feature-benefit').value.trim(),
        };
    }

    function validate(d) {
        if (d.title.length < 5) return 'Judul minimal 5 karakter.';
        if (d.detail.length < 15) return 'Ceritakan idemu minimal 15 karakter.';
        return '';
    }

    function bodyText(d) {
        return '**Jenis:** ' + d.type + '\n\n**Deskripsi**\n' + d.detail + '\n\n' +
            (d.benefit ? '**Manfaat**\n' + d.benefit + '\n\n' : '') +
            '---\n_Diajukan lewat Chat NUFABASE (/chat)_';
    }

    function init() {
        const modal = $('chat-feature-modal'), openBtn = $('chat-feature-open');
        if (!modal || !openBtn) return;
        const msg = $('chat-feature-msg');
        const say = (text, bad) => {
            msg.hidden = !text;
            msg.textContent = text || '';
            msg.classList.toggle('is-error', !!bad);
        };
        const open = () => { modal.hidden = false; say(''); $('chat-feature-name').focus(); };
        const close = () => { modal.hidden = true; };

        openBtn.addEventListener('click', open);
        $('chat-feature-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

        $('chat-feature-github').addEventListener('click', () => {
            const d = read(), err = validate(d);
            if (err) { say(err, true); return; }
            const url = 'https://github.com/' + REPO + '/issues/new?title=' + encodeURIComponent('[' + d.type + '] ' + d.title) +
                '&body=' + encodeURIComponent(bodyText(d)) + '&labels=' + encodeURIComponent('enhancement');
            window.open(url, '_blank', 'noopener');
            say('Membuka GitHub… tekan "Submit new issue" di sana. Kalau tab tidak terbuka, izinkan popup.');
        });

        $('chat-feature-email').addEventListener('click', () => {
            const d = read(), err = validate(d);
            if (err) { say(err, true); return; }
            window.location.href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent('[Chat NUFABASE] ' + d.type + ': ' + d.title) +
                '&body=' + encodeURIComponent(bodyText(d).replace(/\*\*/g, '').replace(/_/g, ''));
            say('Membuka aplikasi email… tekan Kirim di sana.');
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
