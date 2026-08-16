// Transisi mulus main site <-> /blog: skip boot overlay & tombol "kembali" tanpa reload berat.
document.addEventListener("DOMContentLoaded", function () {
    // Sisi main site: kalau baru balik dari blog, langsung masuk (skip overlay) —
    // TAPI cuma kalau autoResumeAccess (site-fx.js) belum lebih dulu masukin (cek opacity,
    // di-set synchronous di awal System.enter, jadi aman dijadikan penanda "sudah jalan").
    if (localStorage.getItem('aksesTerbuka') === 'true') {
        localStorage.removeItem('aksesTerbuka');
        const overlay = document.getElementById('overlay');
        const alreadyEntering = overlay && overlay.style.opacity === '0';
        if (!alreadyEntering) {
            if (typeof System !== 'undefined' && typeof System.enter === 'function') {
                System.enter(true);
            } else if (overlay) {
                overlay.style.display = 'none';
            }
        }
    }

    // Sisi blog: tandai akses terbuka sebelum balik ke beranda
    const btnKembali = document.getElementById('btn-kembali');
    if (btnKembali) {
        btnKembali.addEventListener('click', function (e) {
            e.preventDefault();
            localStorage.setItem('aksesTerbuka', 'true');
            window.location.href = '/';
        });
    }
});
