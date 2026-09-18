/* auth-helper.js — shared Google sign-in helper untuk Firebase Auth.
   Popup-first dengan fallback redirect (iOS Safari & embedded browser sering
   block popup jadi dipaksa redirect). Dipakai barengan sama chat-app.js dan
   dashmin-app.js. Requirement: firebase-auth-compat sudah dimuat. */
(function () {
    'use strict';

    function authErrorMessage(err) {
        const code = err && err.code;
        if (code === 'auth/unauthorized-domain') return 'Domain ini belum diizinkan di Firebase — tambahkan di Firebase console › Authentication › Settings › Authorized domains.';
        if (code === 'auth/popup-blocked') return 'Popup login diblokir browser. Coba klik tombol login lagi — akan dialihkan lewat redirect.';
        if (code === 'auth/popup-closed-by-user') return null;
        if (code === 'auth/cancelled-popup-request') return null;
        if (code === 'auth/operation-not-supported-in-this-environment') return 'Login popup tidak didukung di browser ini.';
        if (code === 'auth/web-storage-unsupported') return 'Browser kamu menonaktifkan storage — aktifkan dulu untuk bisa login.';
        return 'Login Google gagal: ' + (err && err.message ? err.message : 'error tidak diketahui');
    }

    function googleProvider() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        provider.setCustomParameters({ prompt: 'select_account' });
        return provider;
    }

    async function signIn() {
        const auth = firebase.auth();
        if (auth.useDeviceLanguage) auth.useDeviceLanguage();
        try {
            const res = await auth.signInWithPopup(googleProvider());
            return { ok: true, redirect: false, cancelled: false, user: res.user };
        } catch (err) {
            const code = err && err.code;
            // Error popup yang bisa dipulihkan → pindah ke redirect flow.
            if (code === 'auth/popup-blocked' ||
                code === 'auth/operation-not-supported-in-this-environment' ||
                code === 'auth/unauthorized-domain' ||
                code === 'auth/cross-origin-confirmation-required' ||
                code === 'auth/network-request-failed') {
                try {
                    await auth.signInWithRedirect(googleProvider());
                    return { ok: false, redirect: true, cancelled: false };
                } catch (err2) {
                    throw err2;
                }
            }
            if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
                return { ok: false, redirect: false, cancelled: true };
            }
            throw err;
        }
    }

    // Panggil setelah page load: selesaikan login redirect yang tertunda.
    async function settleRedirectResult(auth) {
        try {
            const res = await auth.getRedirectResult();
            return res && res.user ? res.user : null;
        } catch (e) {
            return null;
        }
    }

    window.AuthHelper = { signIn, authErrorMessage, settleRedirectResult };
})();