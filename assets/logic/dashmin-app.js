/* dashmin-app.js — admin dashboard: approve/reject akses room kelas & kelola member.
   Auth: Firebase Google Sign-In yang sama dengan /chat, digate oleh profiles.is_admin di Supabase. */
(function () {
    'use strict';

    const SUPABASE_URL = 'https://yzmtmhpjfrlqsewpdonr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bXRtaHBqZnJscXNld3Bkb25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMTQyNzAsImV4cCI6MjEwMTU5MDI3MH0.IXOlT_QUEGaDZ9bppmM_GQrvzcSEw5PgZzhyklMKBfQ';

    const ROOM_LABELS = {
        'pemasaran-1': 'Pemasaran 1', 'otomotif-1': 'Otomotif 1',
        'pemasaran-2': 'Pemasaran 2', 'otomotif-2': 'Otomotif 2',
        'pemasaran-3': 'Pemasaran 3', 'otomotif-3': 'Otomotif 3',
    };

    let supabase = null;
    let adminUid = null;
    let pendingChannel = null;

    const el = {};

    function cacheEls() {
        ['gate', 'gate-text', 'gate-btn', 'dashboard', 'nav-user', 'logout-btn',
         'pending-list', 'members-list'].forEach((id) => {
            el[id] = document.getElementById('dashmin-' + id);
        });
    }

    function personLabel(profile, userId) {
        if (!profile) return userId;
        return (profile.full_name || profile.email || userId);
    }

    async function loadPending() {
        el['pending-list'].innerHTML = '<p class="dashmin-empty">Memuat...</p>';
        const { data, error } = await supabase
            .from('room_access_requests')
            .select('id, user_id, room_id, requested_at, profiles!room_access_requests_user_id_fkey(full_name, email)')
            .eq('status', 'pending')
            .order('requested_at', { ascending: true });

        if (error) {
            el['pending-list'].innerHTML = '<p class="dashmin-empty">Gagal memuat permintaan.</p>';
            return;
        }
        if (!data.length) {
            el['pending-list'].innerHTML = '<p class="dashmin-empty">Tidak ada permintaan pending.</p>';
            return;
        }

        el['pending-list'].innerHTML = '';
        data.forEach((req) => {
            const row = document.createElement('div');
            row.className = 'dashmin-row';

            const info = document.createElement('div');
            info.className = 'dashmin-row-info';
            const name = document.createElement('div');
            name.className = 'dashmin-row-name';
            name.textContent = personLabel(req.profiles, req.user_id);
            const sub = document.createElement('div');
            sub.className = 'dashmin-row-sub';
            sub.textContent = (ROOM_LABELS[req.room_id] || req.room_id) + ' — ' + new Date(req.requested_at).toLocaleString('id-ID');
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
    }

    async function decideRequest(req, status, approveBtn, rejectBtn) {
        approveBtn.disabled = true;
        rejectBtn.disabled = true;

        const { error } = await supabase
            .from('room_access_requests')
            .update({ status: status, decided_at: new Date().toISOString(), decided_by: adminUid })
            .eq('id', req.id);

        if (error) {
            approveBtn.disabled = false;
            rejectBtn.disabled = false;
            return;
        }

        if (status === 'approved') {
            await supabase
                .from('room_members')
                .upsert({ user_id: req.user_id, room_id: req.room_id }, { onConflict: 'user_id,room_id' });
        }

        loadPending();
        loadMembers();
    }

    async function loadMembers() {
        el['members-list'].innerHTML = '<p class="dashmin-empty">Memuat...</p>';
        const { data, error } = await supabase
            .from('room_members')
            .select('user_id, room_id, approved_at, profiles(full_name, email)')
            .order('room_id', { ascending: true });

        if (error) {
            el['members-list'].innerHTML = '<p class="dashmin-empty">Gagal memuat member.</p>';
            return;
        }
        if (!data.length) {
            el['members-list'].innerHTML = '<p class="dashmin-empty">Belum ada member kelas.</p>';
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

            const info = document.createElement('div');
            info.className = 'dashmin-row-info';
            const name = document.createElement('div');
            name.className = 'dashmin-row-name';
            name.textContent = personLabel(m.profiles, m.user_id);
            const sub = document.createElement('div');
            sub.className = 'dashmin-row-sub';
            sub.textContent = 'Sejak ' + new Date(m.approved_at).toLocaleDateString('id-ID');
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
                const { error: delErr } = await supabase
                    .from('room_members')
                    .delete()
                    .eq('user_id', m.user_id)
                    .eq('room_id', m.room_id);
                if (delErr) { revokeBtn.disabled = false; return; }
                loadMembers();
            });
            actions.appendChild(revokeBtn);

            row.appendChild(info);
            row.appendChild(actions);
            el['members-list'].appendChild(row);
        });
    }

    function subscribePending() {
        if (pendingChannel) supabase.removeChannel(pendingChannel);
        pendingChannel = supabase
            .channel('dashmin-pending')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_access_requests' }, () => {
                loadPending();
            })
            .subscribe();
    }

    function showGate(text, showBtn) {
        el.gate.hidden = false;
        el.dashboard.hidden = true;
        el['gate-text'].textContent = text;
        el['gate-btn'].hidden = !showBtn;
    }

    function showDashboard(user) {
        el.gate.hidden = true;
        el.dashboard.hidden = false;
        el['nav-user'].textContent = user.displayName || user.email || '';
        loadPending();
        loadMembers();
        subscribePending();
    }

    async function handleAuthChange(user) {
        if (pendingChannel) { supabase.removeChannel(pendingChannel); pendingChannel = null; }

        if (!user) {
            adminUid = null;
            showGate('Login dengan akun Google admin untuk masuk /dashmin.', true);
            return;
        }

        const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', user.uid).maybeSingle();
        if (error || !data || !data.is_admin) {
            adminUid = null;
            showGate('Akun ini tidak punya akses admin.', false);
            return;
        }

        adminUid = user.uid;
        showDashboard(user);
    }

    function bindGate() {
        el['gate-btn'].addEventListener('click', async () => {
            try {
                await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
            } catch (err) {
                console.warn('[dashmin] sign-in gagal:', err.message);
            }
        });
        el['logout-btn'].addEventListener('click', () => firebase.auth().signOut());
    }

    function init() {
        cacheEls();
        bindGate();

        if (typeof firebase === 'undefined' || typeof window.supabase === 'undefined') {
            showGate('Layanan belum siap, muat ulang halaman.', false);
            return;
        }
        if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('%%')) {
            showGate('Konfigurasi belum lengkap.', false);
            return;
        }
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);

        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            accessToken: async () => {
                const user = firebase.auth().currentUser;
                return user ? await user.getIdToken() : null;
            },
        });

        firebase.auth().onAuthStateChanged(handleAuthChange);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
