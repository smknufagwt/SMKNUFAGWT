// Transisi mulus main site <-> /blog: skip boot overlay & tombol "kembali" tanpa reload berat.
document.addEventListener("DOMContentLoaded", function () {
    // Sisi main site: kalau baru balik dari blog, langsung masuk (skip overlay)
    if (localStorage.getItem('aksesTerbuka') === 'true') {
        localStorage.removeItem('aksesTerbuka');
        if (typeof System !== 'undefined' && typeof System.enter === 'function') {
            System.enter(true);
        } else {
            const overlay = document.getElementById('overlay');
            if (overlay) overlay.style.display = 'none';
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
