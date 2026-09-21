/* dashmin-app.js — admin dashboard: approve/reject akses room kelas & kelola member.
   Auth: Firebase Google Sign-In yang sama dengan /chat, digate oleh profiles/{uid}.is_admin di Firestore. */
(function () {
    'use strict';

    const ROOM_LABELS = {
        'pemasaran-1': 'Pemasaran 1', 'otomotif-1': 'Otomotif 1',
        'pemasaran-2': 'Pemasaran 2', 'otomotif-2': 'Otomotif 2',
        'pemasaran-3': 'Pemasaran 3', 'otomotif-3': 'Otomotif 3',
    };
    const ADMIN_EMAILS = ['smknufagwt@gmail.com'];

    let db = null;
    let adminUid = null;
    let pendingUnsub = null;
    let allMembers = [];
    let memberSearchQuery = '';

    const el = {};

    function cacheEls() {
        ['gate', 'gate-text', 'gate-btn', 'dashboard', 'nav-user', 'logout-btn',
         'pending-list', 'members-list', 'pending-title', 'members-title',
         'stat-pending', 'stat-members', 'stat-admins', 'admins-list', 'admins-title',
         'add-admin-form', 'add-admin-email', 'add-admin-btn',
         'member-search', 'member-search-clear'].forEach((id) => {
            el[id] = document.getElementById('dashmin-' + id);
        });
    }

    function initials(label) {
        const parts = String(label).trim().split(/\s+/).slice(0, 2);
        return parts.map((p) => p[0] || '').join('').toUpperCase() || '?';
    }

    function avatarEl(label) {
        const av = document.createElement('div');
        av.className = 'dashmin-avatar';
        av.textContent = initials(label);
        return av;
    }

    function showToast(msg) {
        let toast = document.getElementById('dashmin-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'dashmin-toast';
            toast.className = 'dashmin-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('is-visible');
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.classList.remove('is-visible'), 5000);
    }

    function personLabel(req) {
        return (req && (req.user_name || req.user_email)) || (req && req.user_id) || 'Anonim';
    }

    async function loadPending() {
        el['pending-list'].innerHTML = '<p class="dashmin-empty">Memuat...</p>';
        try {
            const snap = await db.collection('room_access_requests')
                .where('status', '==', 'pending')
                .orderBy('requested_at', 'asc')
                .get();
            const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

            if (el['stat-pending']) el['stat-pending'].textContent = String(data.length);
            if (el['pending-title']) el['pending-title'].textContent = 'Permintaan Akses Kelas (' + data.length + ')';
            if (!data.length) {
                el['pending-list'].innerHTML = '<p class="dashmin-empty">🎉 Tidak ada permintaan pending.</p>';
                return;
            }

            el['pending-list'].innerHTML = '';
            data.forEach((req) => {
                const row = document.createElement('div');
                row.className = 'dashmin-row';

                const label = personLabel(req);
                row.appendChild(avatarEl(label));

                const info = document.createElement('div');
                info.className = 'dashmin-row-info';
                const name = document.createElement('div');
                name.className = 'dashmin-row-name';
                name.textContent = label;
                const sub = document.createElement('div');
                sub.className = 'dashmin-row-sub';
                const when = req.requested_at && typeof req.requested_at.toDate === 'function'
                    ? req.requested_at.toDate()
                    : (req.requested_at ? new Date(req.requested_at) : new Date());
                sub.textContent = (ROOM_LABELS[req.room_id] || req.room_id) + ' — ' + when.toLocaleString('id-ID');
                info.appendChild(name);
                info.appendChild(sub);

                const actions = document.createElement('div');
                actions.className = 'dashmin-row-actions';

                const approveBtn = document.createElement('button');
                approveBtn.className = 'dashmin-action-btn is-approve';
                approveBtn.type = 'button';
                approveBtn.textContent = 'Setujui';
                approveBtn.addEventListener('click', () => decideRequest(req, 'approved', approveBtn, rejectBtn));

                const rejectBtn = document.createElement('button');
                rejectBtn.className = 'dashmin-action-btn is-reject';
                rejectBtn.type = 'button';
                rejectBtn.textContent = 'Tolak';
                rejectBtn.addEventListener('click', () => decideRequest(req, 'rejected', approveBtn, rejectBtn));

                actions.appendChild(approveBtn);
                actions.appendChild(rejectBtn);

                row.appendChild(info);
                row.appendChild(actions);
                el['pending-list'].appendChild(row);
            });
        } catch (e) {
            el['pending-list'].innerHTML = '<p class="dashmin-empty">Gagal memuat permintaan.</p>';
        }
    }

    async function decideRequest(req, status, approveBtn, rejectBtn) {
        approveBtn.disabled = true;
        rejectBtn.disabled = true;

        try {
            await db.collection('room_access_requests').doc(req.id).update({
                status: status,
                decided_at: firebase.firestore.FieldValue.serverTimestamp(),
                decided_by: adminUid,
            });
            if (status === 'approved') {
                await db.collection('room_members').doc(req.user_id + '_' + req.room_id).set({
                    user_id: req.user_id,
                    room_id: req.room_id,
                    user_name: req.user_name || '',
                    user_email: req.user_email || '',
                    approved_at: firebase.firestore.FieldValue.serverTimestamp(),
                });
            }
        } catch (e) {
            approveBtn.disabled = false;
            rejectBtn.disabled = false;
            return;
        }

        loadPending();
        loadMembers();
    }

    async function loadMembers() {
        el['members-list'].innerHTML = '<p class="dashmin-empty">Memuat...</p>';
        try {
            const snap = await db.collection('room_members').get();
            allMembers = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            allMembers.sort((a, b) => (a.room_id === b.room_id
                ? (a.user_name || '').localeCompare(b.user_name || '')
                : (a.room_id || '').localeCompare(b.room_id || '')));
            if (el['stat-members']) el['stat-members'].textContent = String(allMembers.length);
            applyMemberFilter();
        } catch (e) {
            el['members-list'].innerHTML = '<p class="dashmin-empty">Gagal memuat member.</p>';
        }
    }

    function applyMemberFilter() {
        const q = memberSearchQuery.trim().toLowerCase();
        const filtered = !q ? allMembers : allMembers.filter((m) => {
            const label = personLabel(m).toLowerCase();
            const email = (m.user_email || '').toLowerCase();
            return label.includes(q) || email.includes(q);
        });
        renderMembers(filtered, q);
    }

    function renderMembers(data, activeQuery) {
        if (el['members-title']) {
            el['members-title'].textContent = 'Member per Kelas (' + (activeQuery ? filteredCountLabel(data.length, allMembers.length) : data.length) + ')';
        }
        if (!allMembers.length) {
            el['members-list'].innerHTML = '<p class="dashmin-empty">Belum ada member kelas.</p>';
            return;
        }
        if (!data.length) {
            el['members-list'].innerHTML = '<p class="dashmin-empty">🔍 Tidak ada member yang cocok dengan pencarian.</p>';
            return;
        }

        el['members-list'].innerHTML = '';
        let lastRoom = null;
        data.forEach((m) => {
            if (m.room_id !== lastRoom) {
                const label = document.createElement('div');
                label.className = 'dashmin-group-label';
                label.textContent = ROOM_LABELS[m.room_id] || m.room_id;
                el['members-list'].appendChild(label);
                lastRoom = m.room_id;
            }

            const row = document.createElement('div');
            row.className = 'dashmin-row';

            const personName = personLabel(m);
            row.appendChild(avatarEl(personName));

            const info = document.createElement('div');
            info.className = 'dashmin-row-info';
            const name = document.createElement('div');
            name.className = 'dashmin-row-name';
            name.textContent = personName;
            const sub = document.createElement('div');
            sub.className = 'dashmin-row-sub';
            const since = m.approved_at && typeof m.approved_at.toDate === 'function'
                ? m.approved_at.toDate()
                : (m.approved_at ? new Date(m.approved_at) : new Date());
            sub.textContent = 'Sejak ' + since.toLocaleDateString('id-ID');
            info.appendChild(name);
            info.appendChild(sub);

            const actions = document.createElement('div');
            actions.className = 'dashmin-row-actions';
            const revokeBtn = document.createElement('button');
            revokeBtn.className = 'dashmin-action-btn is-revoke';
            revokeBtn.type = 'button';
            revokeBtn.textContent = 'Cabut';
            revokeBtn.addEventListener('click', async () => {
                revokeBtn.disabled = true;
                try {
                    await db.collection('room_members').doc(m.id).delete();
                    // Hapus juga request-nya biar status balik "belum diminta" — user wajib minta akses lagi, bukan nyangkut "approved"
                    await db.collection('room_access_requests').doc(m.user_id + '_' + m.room_id).delete().catch(() => {});
                } catch (e) { revokeBtn.disabled = false; return; }
                loadMembers();
            });
            actions.appendChild(revokeBtn);

            row.appendChild(info);
            row.appendChild(actions);
            el['members-list'].appendChild(row);
        });
    }

    function filteredCountLabel(shown, total) {
        return shown + '/' + total;
    }

    function bindMemberSearch() {
        el['member-search'].addEventListener('input', (e) => {
            memberSearchQuery = e.target.value;
            el['member-search-clear'].hidden = !memberSearchQuery;
            applyMemberFilter();
        });
        el['member-search-clear'].addEventListener('click', () => {
            memberSearchQuery = '';
            el['member-search'].value = '';
            el['member-search-clear'].hidden = true;
            applyMemberFilter();
            el['member-search'].focus();
        });
    }

    function subscribePending() {
        if (pendingUnsub) { pendingUnsub(); pendingUnsub = null; }
        pendingUnsub = db.collection('room_access_requests')
            .where('status', '==', 'pending')
            .onSnapshot(() => loadPending(), () => {});
    }

    function showGate(text, showBtn) {
        el.gate.hidden = false;
        el.dashboard.hidden = true;
        el['gate-text'].textContent = text;
        el['gate-btn'].hidden = !showBtn;
    }

    async function loadAdmins() {
        if (!el['admins-list']) return;
        el['admins-list'].innerHTML = '<p class="dashmin-empty">Memuat admin...</p>';
        try {
            const snap = await db.collection('profiles').where('is_admin', '==', true).get();
            let adminList = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

            // Pastikan master admin selalu ada di list
            ADMIN_EMAILS.forEach((email) => {
                if (!adminList.some((a) => (a.email || '').toLowerCase() === email.toLowerCase())) {
                    adminList.push({ id: 'master_' + email, email: email, full_name: 'Master Admin', is_master: true });
                }
            });

            if (el['stat-admins']) el['stat-admins'].textContent = String(adminList.length);
            if (el['admins-title']) el['admins-title'].textContent = 'Kelola Admin (' + adminList.length + ')';

            if (!adminList.length) {
                el['admins-list'].innerHTML = '<p class="dashmin-empty">Belum ada admin terdaftar.</p>';
                return;
            }

            el['admins-list'].innerHTML = '';
            adminList.forEach((adm) => {
                const row = document.createElement('div');
                row.className = 'dashmin-row';

                const label = adm.full_name || adm.email || 'Admin';
                row.appendChild(avatarEl(label));

                const info = document.createElement('div');
                info.className = 'dashmin-row-info';
                const name = document.createElement('div');
                name.className = 'dashmin-row-name';
                name.textContent = label;
                const sub = document.createElement('div');
                sub.className = 'dashmin-row-sub';
                sub.textContent = adm.email || adm.id;
                info.appendChild(name);
                info.appendChild(sub);

                const actions = document.createElement('div');
                actions.className = 'dashmin-row-actions';

                const isMaster = ADMIN_EMAILS.includes((adm.email || '').toLowerCase()) || adm.is_master;
                if (isMaster) {
                    const badge = document.createElement('span');
                    badge.style.fontSize = '0.72rem';
                    badge.style.color = 'var(--chat-gold)';
                    badge.style.fontWeight = '700';
                    badge.style.padding = '4px 8px';
                    badge.textContent = '👑 Master';
                    actions.appendChild(badge);
                } else {
                    const revokeBtn = document.createElement('button');
                    revokeBtn.className = 'dashmin-action-btn is-revoke';
                    revokeBtn.type = 'button';
                    revokeBtn.textContent = 'Cabut Admin';
                    revokeBtn.addEventListener('click', async () => {
                        if (!window.confirm('Cabut status admin dari ' + (adm.email || label) + '?')) return;
                        revokeBtn.disabled = true;
                        try {
                            await db.collection('profiles').doc(adm.id).update({ is_admin: false });
                            showToast('Status admin dicabut dari ' + (adm.email || label));
                            loadAdmins();
                        } catch (e) {
                            showToast('Gagal mencabut admin: ' + (e.message || e.code));
                            revokeBtn.disabled = false;
                        }
                    });
                    actions.appendChild(revokeBtn);
                }

                row.appendChild(info);
                row.appendChild(actions);
                el['admins-list'].appendChild(row);
            });
        } catch (e) {
            el['admins-list'].innerHTML = '<p class="dashmin-empty">Gagal memuat admin: ' + (e.message || e.code) + '</p>';
        }
    }

    function bindAdminForm() {
        if (!el['add-admin-form']) return;
        el['add-admin-form'].addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = el['add-admin-email'];
            const targetEmail = (emailInput.value || '').trim().toLowerCase();
            if (!targetEmail) return;

            const submitBtn = el['add-admin-btn'];
            submitBtn.disabled = true;
            submitBtn.textContent = 'Memproses...';

            try {
                const snap = await db.collection('profiles')
                    .where('email', '==', targetEmail)
                    .limit(1)
                    .get();

                if (snap.empty) {
                    showToast('User ' + targetEmail + ' belum terdaftar. Minta calon admin login ke /chat sekali dulu.');
                } else {
                    const targetDoc = snap.docs[0];
                    await db.collection('profiles').doc(targetDoc.id).update({ is_admin: true });
                    showToast('🎉 ' + targetEmail + ' berhasil diangkat sebagai admin!');
                    emailInput.value = '';
                    loadAdmins();
                }
            } catch (err) {
                showToast('Gagal mengangkat admin: ' + (err.message || err.code));
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '+ Angkat Admin';
            }
        });
    }

    function showDashboard(user) {
        el.gate.hidden = true;
        el.dashboard.hidden = false;
        el['nav-user'].textContent = user.displayName || user.email || '';
        loadPending();
        loadMembers();
        loadAdmins();
        subscribePending();
    }

    async function handleAuthChange(user) {
        if (pendingUnsub) { pendingUnsub(); pendingUnsub = null; }

        if (!user) {
            adminUid = null;
            showGate('Login dengan akun Google admin untuk masuk /dashmin.', true);
            return;
        }

        const isEmailAdmin = !!(user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
        const profileSnap = await db.collection('profiles').doc(user.uid).get().catch(() => null);
        const isProfileAdmin = !!(profileSnap && profileSnap.exists && profileSnap.data().is_admin);

        if (!isEmailAdmin && !isProfileAdmin) {
            adminUid = null;
            showGate('Akun ini (' + (user.email || user.displayName) + ') tidak punya akses admin.', false);
            return;
        }

        if (isEmailAdmin && (!profileSnap || !profileSnap.exists || !profileSnap.data().is_admin)) {
            await db.collection('profiles').doc(user.uid).set({
                email: user.email,
                full_name: user.displayName || 'Master Admin',
                is_admin: true
            }, { merge: true }).catch(() => {});
        }

        adminUid = user.uid;
        showDashboard(user);
    }

    function bindGate() {
        el['gate-btn'].addEventListener('click', async () => {
            try {
                const out = await window.AuthHelper.signIn();
                if (!out) return;
                if (out.ok) return; // onAuthStateChanged yang lanjutin
            } catch (err) {
                const msg = window.AuthHelper.authErrorMessage(err);
                if (msg) showToast(msg);
            }
        });
        el['logout-btn'].addEventListener('click', () => firebase.auth().signOut());
    }

    function init() {
        cacheEls();
        bindGate();
        bindMemberSearch();
        bindAdminForm();

        if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.auth) {
            showGate('Layanan belum siap, muat ulang halaman.', false);
            return;
        }
        if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('%%')) {
            showGate('Konfigurasi belum lengkap.', false);
            return;
        }
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.firestore();

        const auth = firebase.auth();
        if (auth.useDeviceLanguage) auth.useDeviceLanguage();
        if (window.AuthHelper) window.AuthHelper.settleRedirectResult(auth).catch(() => {});

        auth.onAuthStateChanged(handleAuthChange);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();