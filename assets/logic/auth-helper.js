/* auth-helper.js — helper Firebase Auth bersama (chat-app.js & dashmin-app.js).
   Popup-first + fallback redirect, guard double-click, blok in-app browser,
   resolveRole() & ensureProfile() jadi satu sumber logic. Butuh firebase-auth-compat + firestore. */
(function () {
    'use strict';

    const MASTER_EMAILS = ['smknufagwt@gmail.com'];
    let signingIn = false;

    // WebView TikTok/IG/FB/Android wv memblokir OAuth Google (disallowed_useragent)
    function isInAppBrowser() {
        return /FBAN|FBAV|Instagram|Line\/|MicroMessenger|TikTok|musical_ly|BytedanceWebview|; wv\)/i
            .test(navigator.userAgent || '');
    }

    function authErrorMessage(err) {
        const code = err && err.code;
        const map = {
            'app/in-app-browser': 'Login Google tidak jalan di browser dalam aplikasi (TikTok/Instagram/dll). Buka lewat Chrome/Safari.',
            'auth/unauthorized-domain': 'Domain ini belum diizinkan di Firebase — tambahkan di Authentication › Settings › Authorized domains.',
            'auth/popup-blocked': 'Popup login diblokir browser. Klik login lagi — akan dialihkan lewat redirect.',
            'auth/operation-not-supported-in-this-environment': 'Login popup tidak didukung di browser ini.',
            'auth/web-storage-unsupported': 'Browser menonaktifkan storage — aktifkan dulu untuk bisa login.',
            'auth/network-request-failed': 'Koneksi bermasalah, coba lagi.',
            'auth/too-many-requests': 'Terlalu banyak percobaan, tunggu sebentar.',
            'auth/user-disabled': 'Akun ini dinonaktifkan.',
            'auth/account-exists-with-different-credential': 'Email ini sudah terdaftar dengan metode login lain.',
        };
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
        if (map[code]) return map[code];
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
        if (signingIn) return { ok: false, busy: true };
        if (isInAppBrowser()) {
            const e = new Error('in-app browser');
            e.code = 'app/in-app-browser';
            throw e;
        }
        signingIn = true;
        try {
            const auth = firebase.auth();
            if (auth.useDeviceLanguage) auth.useDeviceLanguage();
            await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
            try {
                const res = await auth.signInWithPopup(googleProvider());
                return { ok: true, redirect: false, cancelled: false, user: res.user };
            } catch (err) {
                const code = err && err.code;
                if (code === 'auth/popup-blocked' ||
                    code === 'auth/operation-not-supported-in-this-environment' ||
                    code === 'auth/cross-origin-confirmation-required' ||
                    code === 'auth/network-request-failed') {
                    await auth.signInWithRedirect(googleProvider());
                    return { ok: false, redirect: true, cancelled: false };
                }
                if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
                    return { ok: false, redirect: false, cancelled: true };
                }
                throw err;
            }
        } finally {
            signingIn = false;
        }
    }

    function signOut() {
        return firebase.auth().signOut();
    }

    // Selesaikan login redirect yang tertunda setelah page load.
    async function settleRedirectResult(auth) {
        try {
            const res = await auth.getRedirectResult();
            return res && res.user ? res.user : null;
        } catch (e) {
            return null;
        }
    }

    // Master = email whitelist + emailVerified (sinkron dengan isAdmin() di firestore.rules).
    async function resolveRole(user) {
        if (!user) return { isAdmin: false, isMaster: false };
        const isMaster = !!(user.emailVerified && user.email && MASTER_EMAILS.includes(user.email.toLowerCase()));
        let isAdmin = isMaster;
        if (!isAdmin) {
            try {
                const snap = await firebase.firestore().collection('profiles').doc(user.uid).get();
                isAdmin = !!(snap.exists && snap.data().is_admin === true);
            } catch (e) { /* rules menolak/offline → anggap non-admin */ }
        }
        return { isAdmin, isMaster };
    }

    // Upsert profil tanpa menyentuh is_admin (hanya admin yang boleh ubah, lewat dashmin).
    async function ensureProfile(user) {
        if (!user) return;
        await firebase.firestore().collection('profiles').doc(user.uid).set({
            email: user.email || null,
            full_name: user.displayName || null,
            avatar_url: user.photoURL || null,
            last_login: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => {});
    }

    window.AuthHelper = {
        MASTER_EMAILS, signIn, signOut, authErrorMessage,
        settleRedirectResult, resolveRole, ensureProfile, isInAppBrowser,
    };
})();
