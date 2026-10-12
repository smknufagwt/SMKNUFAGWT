/* chat-feature.js — formulir "Usul fitur / laporkan masalah" di footer /chat.
   Kirim lewat GitHub Issue (publik), Email (privat, bisa lampiran), atau salin .md. Tanpa database. */
(function () {
    'use strict';
    const REPO = 'smknufagwt/SMKNUFAGWT';
    const MAIL = 'smknufagwt@gmail.com';
    const MAX_URL = 7000; // batas aman panjang URL GitHub
    const MAX_FILES = 5, MAX_TOTAL = 100 * 1024 * 1024; // lampiran: maks 100 MB total
    const $ = (id) => document.getElementById(id);
    let files = [];

    const mb = (n) => (n / 1048576 >= 0.1 ? (n / 1048576).toFixed(1) : '<0.1') + ' MB';
    const total = () => files.reduce((a, f) => a + f.size, 0);

    function read() {
        return {
            type: $('chat-feature-type').value, area: $('chat-feature-area').value,
            title: $('chat-feature-name').value.trim(), detail: $('chat-feature-detail').value.trim(),
            steps: $('chat-feature-steps').value.trim(), benefit: $('chat-feature-benefit').value.trim(),
            priority: $('chat-feature-priority').value, link: $('chat-feature-link').value.trim(),
            nick: $('chat-feature-nick').value.trim(), note: $('chat-feature-note').value.trim(),
        };
    }

    function validate(d) {
        if (d.title.length < 5) return ['Judul minimal 5 karakter.', 'chat-feature-name'];
        if (d.detail.length < 15) return ['Ceritakan idemu minimal 15 karakter.', 'chat-feature-detail'];
        if (d.link && !/^https?:\/\/\S+$/i.test(d.link)) return ['Tautan harus diawali https:// atau http://', 'chat-feature-link'];
        return null;
    }

    // mode: 'gh' (publik, tanpa catatan pribadi) | 'mail' | 'copy'; md=true → Markdown
    function build(d, md, mode) {
        const h = (t) => (md ? '## ' + t : t.toUpperCase());
        const b = (t) => (md ? '**' + t + '**' : t);
        let out = b('Jenis') + ': ' + d.type + '\n' + b('Bagian') + ': ' + d.area + '\n' + b('Tingkat penting') + ': ' + d.priority + '\n';
        if (d.nick) out += b('Pengaju') + ': ' + d.nick + '\n';
        if (d.link) out += b('Referensi') + ': ' + d.link + '\n';
        out += '\n' + h('Cerita') + '\n' + d.detail + '\n\n';
        if (d.steps) out += h('Langkah sampai muncul') + '\n' + d.steps + '\n\n';
        if (d.benefit) out += h('Manfaat') + '\n' + d.benefit + '\n\n';
        if (d.note && mode !== 'gh') out += h('Catatan pribadi') + '\n' + d.note + '\n\n';
        if (files.length) {
            const where = mode === 'gh' ? ' (diunggah di komentar ini)' : mode === 'mail' ? ' (terlampir)' : '';
            out += h('Lampiran' + where) + '\n' + files.map((f) => '- ' + f.name + ' (' + mb(f.size) + ')').join('\n') + '\n\n';
        }
        return out + '---\n' + (md ? '_Diajukan lewat Chat NUFABASE (/chat)_' : 'Diajukan lewat Chat NUFABASE (/chat)');
    }

    function init() {
        const modal = $('chat-feature-modal'), openBtn = $('chat-feature-open');
        if (!modal || !openBtn) return;
        const msg = $('chat-feature-msg'), detail = $('chat-feature-detail'), count = $('chat-feature-count');
        const list = $('chat-feature-filelist'), totalEl = $('chat-feature-files-total'), picker = $('chat-feature-files');
        const say = (text, bad) => {
            msg.hidden = !text; msg.textContent = text || ''; msg.classList.toggle('is-error', !!bad);
            if (text) msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        };
        const open = () => { modal.hidden = false; say(''); $('chat-feature-name').focus(); };
        const close = () => { modal.hidden = true; };
        const run = (fn) => {
            const d = read(), err = validate(d);
            if (err) { say(err[0], true); $(err[1]).focus(); return; }
            fn(d);
        };

        function renderFiles() {
            list.hidden = !files.length;
            list.innerHTML = '';
            files.forEach((f, i) => {
                const li = document.createElement('li');
                const n = document.createElement('span'); n.className = 'fname'; n.textContent = f.name;
                const s = document.createElement('span'); s.className = 'fsize'; s.textContent = mb(f.size);
                const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Hapus ' + f.name);
                x.addEventListener('click', () => { files.splice(i, 1); renderFiles(); });
                li.append(n, s, x); list.appendChild(li);
            });
            totalEl.textContent = mb(total()) + ' / 100 MB';
        }

        picker.addEventListener('change', () => {
            let skipped = '';
            Array.from(picker.files).forEach((f) => {
                if (files.length >= MAX_FILES) skipped = 'Maksimal ' + MAX_FILES + ' file.';
                else if (total() + f.size > MAX_TOTAL) skipped = '"' + f.name + '" tidak ditambahkan: total lampiran melebihi 100 MB.';
                else files.push(f);
            });
            picker.value = '';
            renderFiles();
            if (skipped) say(skipped, true);
        });

        openBtn.addEventListener('click', open);
        $('chat-feature-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
        detail.addEventListener('input', () => { count.textContent = detail.value.length + ' / ' + detail.maxLength; });

        $('chat-feature-github').addEventListener('click', () => run((d) => {
            const url = 'https://github.com/' + REPO + '/issues/new?title=' + encodeURIComponent('[' + d.type + '] ' + d.title) +
                '&body=' + encodeURIComponent(build(d, true, 'gh')) + '&labels=' + encodeURIComponent(/rusak|error/i.test(d.type) ? 'bug' : 'enhancement');
            if (url.length > MAX_URL) { say('Tulisanmu terlalu panjang untuk GitHub. Persingkat sedikit, atau pakai Email / Salin teks.', true); return; }
            window.open(url, '_blank', 'noopener');
            say(files.length
                ? 'Membuka GitHub… seret file lampiranmu ke kotak komentar di sana, lalu tekan "Submit new issue".'
                : 'Membuka GitHub… tekan "Submit new issue" di sana. Kalau tab tidak terbuka, izinkan popup.');
        }));

        $('chat-feature-email').addEventListener('click', () => run(async (d) => {
            const subject = '[Chat NUFABASE] ' + d.type + ': ' + d.title, body = build(d, false, 'mail');
            // HP: menu Bagikan bisa melampirkan file langsung ke aplikasi email
            if (files.length && navigator.canShare && navigator.canShare({ files })) {
                try {
                    await navigator.share({ files, title: subject, text: 'Kirim ke: ' + MAIL + '\n\n' + body });
                    say('Pilih Gmail / aplikasi email, isi penerima ' + MAIL + ', lalu tekan Kirim.');
                    return;
                } catch (e) { if (e && e.name === 'AbortError') return; }
            }
            window.location.href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
            say(files.length
                ? 'Membuka aplikasi email… email tidak bisa melampirkan file otomatis di perangkat ini, jadi lampirkan ' + files.length + ' file secara manual, lalu Kirim.'
                : 'Membuka aplikasi email… tekan Kirim di sana.');
        }));

        $('chat-feature-copy').addEventListener('click', () => run(async (d) => {
            const text = '# ' + d.title + '\n\n' + build(d, true, 'copy');
            try { await navigator.clipboard.writeText(text); say('Tersalin sebagai teks Markdown. Tempel di mana saja.'); }
            catch (e) { say('Gagal menyalin. Izinkan akses papan klip di browser.', true); }
        }));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
