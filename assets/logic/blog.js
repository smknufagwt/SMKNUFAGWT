/* ==========================================================================
   DATA JURNAL
   Tambah entri baru = tambah 1 object di array POSTS. Urut otomatis (terbaru di atas).
   ========================================================================== */
const POSTS = [
    {
        date: "2026-08-14",
        tag: "UPDATE",
        title: "Backsound dinamis, domain baru, dan Beta Chat per Kelas",
        body: "Beberapa pembaruan besar terjadi sejak update terakhir — dari suasana situs sampai cara siswa masuk ke ruang obrolan kelas.\n\n<b>Backsound situs kini dinamis</b>\nMusik latar (BGM) sekarang otomatis berganti mengikuti jam WIB — nuansa pagi, malam, dan akhir pekan masing-masing dapat lagu berbeda, biar suasana situs terasa hidup tanpa perlu diganti manual satu-satu.\n\n<b>Domain inti sekarang: <span class=\"grad-text\">nufabase.web.app</span></b>\nSitus resmi berdiri di <a href=\"https://nufabase.web.app\">nufabase.web.app</a> sebagai domain umum, dihosting lewat Firebase. Domain lama <a href=\"https://smknufa-bdp.vercel.app\">smknufa-bdp.vercel.app</a> tetap aktif jadi mirror — namanya masih bawa \"BDP\" karena dari kelas Pemasaran itu jugalah semua ide ini pertama kali lahir, sebelum akhirnya berkembang dan diluncurkan jadi domain inti yang sekarang.\n\n<b><span class=\"grad-text\">Beta: Chat per Kelas</span></b>\nFitur yang paling dinanti akhirnya masuk tahap Beta: ruang obrolan khusus per kelas dan jurusan (Pemasaran & Otomotif, kelas 1 sampai 3), terpisah dari ruang Public dan Announcement yang sudah ada duluan.\n\n<b>Cara masuknya sengaja dibuat simpel:</b>\n<ul>\n<li>Login pakai akun Google sekolah — sekali klik, tanpa daftar akun baru.</li>\n<li>Pilih ruang kelas yang mau diakses, lalu kirim permintaan.</li>\n<li>Admin meninjau dan menyetujui (approve) permintaan itu secara manual.</li>\n<li>Begitu disetujui, siswa bisa langsung baca dan kirim pesan di ruang kelasnya sendiri — ruang lain tetap cuma bisa dibaca.</li>\n</ul>\n\n<b>Soal <span class=\"grad-text\">keamanan 🫆</span></b>\nSetiap ruang punya aturan akses yang ditanam langsung di level database, bukan cuma disembunyikan di tampilan — jadi siswa yang belum disetujui memang tidak bisa menulis, bukan sekadar tombolnya diumpetin. Login juga diverifikasi lewat akun Google resmi sekolah, dan sekarang setiap pesan yang sudah terkirim bisa dihapus sendiri oleh pengirimnya kapan saja kalau ada salah ketik atau berubah pikiran.\n\nSemua fitur ini masih tahap Beta dan terus dirapikan — kalau ada masukan atau nemu bug, boleh langsung disampaikan ke admin."
    },
    {
        date: "2026-08-02",
        tag: "FITUR",
        title: "Chat makin pintar: auto-embed YouTube, Drive, Spotify & Maps",
        body: "Sistem rich text formatting di live chat dapat perombakan besar. Sekarang tinggal tempel link, chat otomatis ubah jadi media — nggak perlu embed manual.\n\n<b>Cara pakainya:</b> format <code>[teks alt]{url}</code> di kolom chat. Contoh: <code>[demo praktik]{https://youtu.be/xxxxxxx}</code> — otomatis jadi player video.\n\n<b>Apa yang berubah:</b>\n<ul>\n<li>YouTube (short/panjang) tampil clean — cuma logo kecil YT, tanpa video rekomendasi atau tombol share yang ganggu, dan loop-nya mulus tanpa jeda.</li>\n<li>Setiap video sekarang punya tombol mute/unmute kecil di pojok — default mute biar nggak dadakan bunyi pas orang scroll chat.</li>\n<li>Link Spotify (track/album/playlist) & Google Maps kini otomatis ke-render jadi player/peta langsung di chat, pakai format yang sama.</li>\n<li>Link Google Drive sekarang dibatasi: cuma foto (.png/.jpg/.webp), .md, .mp3, .mp4, .txt, dan .doc/.docx yang bisa tampil. Selain itu otomatis diblok pas mau dikirim — muncul notifikasi \"Format tak didukung\" dan pesan nggak terkirim sama sekali, buat jaga-jaga dari file yang disamarkan.</li>\n<li>Ada ikon gear \u2699\ufe0f baru di toolbar chat — buat atur preferensi tampilan media pribadi: autoplay, loop, mode, rain matrix, Perlebar chat dan suara default nyala/mati. Mekanismenya sama kayak tombol lonceng notifikasi, tinggal klik buat on/off.</li>\n<li>BGM situs juga lebih pinter: kalau ada suara dari media chat yang lagi nyala, tombol BGM otomatis kekunci sementara biar nggak dobel suara — dan bakal lanjut muter lagi begitu panel chat ditutup.</li>\n</ul>"
    },
    {
        date: "2026-07-28",
        tag: "UPDATE",
        title: "Blog jurnal resmi diluncurkan",
        banner: { src: "https://raw.githubusercontent.com/smknufagwt/SMKNUFAGWT/main/appcover.jpg", alt: "Cuplikan tampilan situs SMK Nurul Falah" },
        body: "Halaman blog ini dibuat sebagai catatan perjalanan pengembangan situs SMK Nurul Falah — dari satu file HTML cyberpunk sampai jadi platform dengan galeri, chat, dan panel kontrol.\n\nMulai sekarang setiap update dicatat di sini sebagai roadmap."
    },
    {
        date: "2026-01-16",
        tag: "DESAIN",
        title: "PELUNCURAN SITUS",
        banner: { src: "/favicon.ico", alt: "Peluncuran situs flagship" },
        body: "Awal januari bertepatan tanggal 16 Januari 2026 situs pertama diluncurkan dan diumumkan di grup smk kelas 11 pemasaran karena ide, dengan nama domain\n https://smk-nufa-11-pemasaran.netlify.app \n\nMasih tahap awal dan masih fragile (rentan), dengan seiring berkembangnya waktu dan feedback diimprovisasi berkala hingga dipindahkan ke <a href=\"https://smknufa-bdp.vercel.app/\">Link</a> dan munculnya integrasi karya baru yang out of the box seperti public live chat dan sejenisnya."
    }
];

const timeline = document.getElementById('timeline');
const filterBar = document.getElementById('filter-bar');
let activeTag = 'SEMUA';
let observer;

function render() {
    const tags = ['SEMUA', ...new Set(POSTS.map(p => p.tag))];
    filterBar.innerHTML = tags.map(t =>
        `<button class="tag-btn ${t === activeTag ? 'active' : ''}" data-tag="${t}">${t}</button>`
    ).join('');

    const sorted = [...POSTS].sort((a, b) => new Date(b.date) - new Date(a.date));
    const filtered = activeTag === 'SEMUA' ? sorted : sorted.filter(p => p.tag === activeTag);

    if (filtered.length === 0) {
        timeline.innerHTML = `<div class="empty-state">// belum ada entri untuk kategori ini</div>`;
        return;
    }

    timeline.innerHTML = filtered.map((p, i) => `
        <div class="entry" style="--i:${i}">
            <div class="rail"><span class="seg top"></span><span class="dot"></span></div>
            <article class="card">
                ${p.banner ? `<img class="banner" src="${p.banner.src}" alt="${p.banner.alt || ''}" loading="lazy">` : ''}
                <div class="card-body">
                    <div class="entry-meta">
                        <span class="entry-date">${formatDate(p.date)}</span>
                        <span class="entry-tag">${p.tag}</span>
                    </div>
                    <h2 class="entry-title">${p.title}</h2>
                    <div class="entry-content">${p.body}</div>
                </div>
            </article>
        </div>
    `).join('');

    observeEntries();
}

function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function observeEntries() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((items) => {
        items.forEach(item => {
            if (item.isIntersecting) {
                item.target.classList.add('visible');
                observer.unobserve(item.target);
            }
        });
    }, { threshold: 0.25 });
    document.querySelectorAll('.entry').forEach(el => observer.observe(el));
}

filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-btn');
    if (!btn || btn.classList.contains('active')) return;
    activeTag = btn.dataset.tag;
    render();
});

document.getElementById('year').textContent = new Date().getFullYear();
render();

/* Switch tab Jurnal <-> Update, with a smooth crossfade instead of an instant cut */
document.getElementById('view-switch').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (!btn || btn.classList.contains('active')) return;
    const target = btn.dataset.view;

    document.querySelectorAll('.view-btn').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on);
    });

    const current = document.querySelector('.view.active');
    const next = document.getElementById(`view-${target}`);
    if (!current || current === next) return;

    current.classList.remove('entered');
    current.classList.add('leaving');
    current.classList.remove('active');

    window.setTimeout(() => {
        current.classList.remove('leaving');
        next.classList.add('active');
        // force reflow so the transition actually plays
        void next.offsetWidth;
        requestAnimationFrame(() => next.classList.add('entered'));
    }, 320);
});
