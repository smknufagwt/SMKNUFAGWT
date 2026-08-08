/* chat-app.js — router SPA untuk /chat (landing page + navigasi room).
   Auth: Firebase Google Sign-In (reuse FIREBASE_CONFIG dari index.html),
   di-bridge ke Supabase lewat Third-Party Auth (accessToken = Firebase ID token).
   Google Cloud OAuth client terpisah belum di-setup — makanya pakai Firebase,
   bukan supabase.auth.signInWithOAuth('google') langsung.
   Chat UI per-room (pesan realtime) menyusul di fase berikutnya —
   saat ini path room kelas/public/announcement menampilkan placeholder. */
(function () {
    'use strict';

    const SUPABASE_URL = 'https://yzmtmhpjfrlqsewpdonr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bXRtaHBqZnJscXNld3Bkb25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMTQyNzAsImV4cCI6MjEwMTU5MDI3MH0.IXOlT_QUEGaDZ9bppmM_GQrvzcSEw5PgZzhyklMKBfQ';

    const CLASS_ROOM_IDS = [
        'pemasaran-1', 'otomotif-1',
        'pemasaran-2', 'otomotif-2',
        'pemasaran-3', 'otomotif-3',
    ];
    const ROOM_LABELS = {
        'public': 'Public',
        'announcement': 'Announcement',
        'pemasaran-1': 'Pemasaran 1', 'otomotif-1': 'Otomotif 1',
        'pemasaran-2': 'Pemasaran 2', 'otomotif-2': 'Otomotif 2',
        'pemasaran-3': 'Pemasaran 3', 'otomotif-3': 'Otomotif 3',
    };

    // Elemen main-site yang perlu disembunyikan selagi di /chat
    const MAIN_SITE_SELECTORS = [
        '#overlay', '#main-content', '#gallery-lightbox',
        '#music-btn', '#color-btn', '#chat-btn',
        '#chat-marquee-bar', '#chat-toast-stack', '#chat-panel',
    ];

    let supabase = null;
    let currentUser = null;

    function pathToRoomId(pathname) {
        const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean); // ['chat', 'pemasaran', '1']
        if (parts.length <= 1) return null; // '/chat' saja = landing
        if (parts[1] === 'public') return 'public';
        if (parts[1] === 'announcement') return 'announcement';
        if (parts.length === 3) {
            const id = parts[1] + '-' + parts[2];
            if (CLASS_ROOM_IDS.includes(id)) return id;
        }
        return 'unknown';
    }

    function isChatPath(pathname) {
        return pathname === '/chat' || pathname.startsWith('/chat/');
    }

    function setMainSiteVisible(visible) {
        MAIN_SITE_SELECTORS.forEach((sel) => {
            const el = document.querySelector(sel);
            if (el) el.style.display = visible ? '' : 'none';
        });
        document.body.style.overflow = visible ? '' : 'hidden auto';
    }

    function showRoomList() {
        document.getElementById('chat-room-list').hidden = false;
        document.getElementById('chat-room-placeholder').hidden = true;
    }

    function showRoomPlaceholder(roomId) {
        document.getElementById('chat-room-list').hidden = true;
        const box = document.getElementById('chat-room-placeholder');
        const text = document.getElementById('chat-room-placeholder-text');
        box.hidden = false;

        if (roomId === 'unknown' || !roomId) {
            text.textContent = 'Room tidak ditemukan.';
            return;
        }
        if (roomId === 'public' || roomId === 'announcement') {
            text.textContent = 'Ruang "' + ROOM_LABELS[roomId] + '" — UI pesan realtime menyusul di fase berikutnya.';
            return;
        }
        renderClassRoomPlaceholder(roomId, text, box);
    }

    async function renderClassRoomPlaceholder(roomId, text, box) {
        text.textContent = 'Memuat status akses...';
        const existingBtn = box.querySelector('.chat-request-btn');
        if (existingBtn) existingBtn.remove();

        if (!currentUser) {
            text.textContent = 'Login dengan Google dulu buat minta akses ke "' + ROOM_LABELS[roomId] + '".';
            return;
        }
        if (!supabase) {
            text.textContent = 'Layanan chat belum siap, coba lagi sebentar.';
            return;
        }

        const { data, error } = await supabase
            .from('room_access_requests')
            .select('status')
            .eq('user_id', currentUser.uid)
            .eq('room_id', roomId)
            .maybeSingle();

        if (error) {
            text.textContent = 'Gagal memuat status akses.';
            return;
        }

        if (!data) {
            text.textContent = 'Kamu belum minta akses ke "' + ROOM_LABELS[roomId] + '".';
            const btn = document.createElement('button');
            btn.className = 'chat-back-btn chat-request-btn';
            btn.type = 'button';
            btn.textContent = 'Minta Akses';
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = 'Mengirim...';
                const { error: insertErr } = await supabase
                    .from('room_access_requests')
                    .insert({ user_id: currentUser.uid, room_id: roomId });
                if (insertErr) {
                    btn.textContent = 'Gagal, coba lagi';
                    btn.disabled = false;
                } else {
                    renderClassRoomPlaceholder(roomId, text, box);
                    refreshRoomStatuses();
                }
            });
            box.appendChild(btn);
            return;
        }

        if (data.status === 'pending') {
            text.textContent = 'Permintaan akses ke "' + ROOM_LABELS[roomId] + '" sedang menunggu approval admin.';
        } else if (data.status === 'approved') {
            text.textContent = 'Akses disetujui untuk "' + ROOM_LABELS[roomId] + '". UI pesan realtime menyusul di fase berikutnya.';
        } else {
            text.textContent = 'Permintaan akses ke "' + ROOM_LABELS[roomId] + '" ditolak admin.';
        }
    }

    function render() {
        const pathname = window.location.pathname;
        const chatView = document.getElementById('chat-view');
        if (!chatView) return;

        if (!isChatPath(pathname)) {
            chatView.hidden = true;
            setMainSiteVisible(true);
            return;
        }

        chatView.hidden = false;
        setMainSiteVisible(false);

        const roomId = pathToRoomId(pathname);
        if (!roomId) {
            showRoomList();
        } else {
            showRoomPlaceholder(roomId);
        }
    }

    function navigate(path) {
        if (window.location.pathname === path) { render(); return; }
        window.history.pushState({}, '', path);
        render();
    }

    function bindNav() {
        document.getElementById('chat-room-list').addEventListener('click', (e) => {
            const item = e.target.closest('.chat-room-item');
            if (!item) return;
            e.preventDefault();
            navigate(item.getAttribute('href'));
        });

        document.getElementById('chat-back-btn').addEventListener('click', () => navigate('/chat'));

        window.addEventListener('popstate', render);

        document.getElementById('chat-account-btn').addEventListener('click', async () => {
            if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
            if (currentUser) {
                await firebase.auth().signOut();
            } else {
                try {
                    await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
                } catch (err) {
                    console.warn('[chat-app] Google sign-in gagal:', err.message);
                }
            }
        });
    }

    function updateAccountIcon() {
        const iconEl = document.getElementById('chat-account-icon');
        if (!iconEl) return;
        if (currentUser && currentUser.photoURL) {
            iconEl.classList.remove('is-locked');
            iconEl.innerHTML = '<img src="' + currentUser.photoURL + '" alt="Akun">';
        } else if (currentUser) {
            iconEl.classList.remove('is-locked');
            iconEl.textContent = '👤';
        } else {
            iconEl.classList.add('is-locked');
            iconEl.textContent = '🔒';
        }
    }

    function refreshRoomStatuses() {
        if (!supabase || !currentUser) {
            document.querySelectorAll('.chat-room-status').forEach((el) => {
                el.textContent = 'Login untuk minta akses';
                el.removeAttribute('data-state');
            });
            return;
        }
        supabase
            .from('room_access_requests')
            .select('room_id, status')
            .eq('user_id', currentUser.uid)
            .then(({ data, error }) => {
                if (error || !data) return;
                const byRoom = {};
                data.forEach((r) => { byRoom[r.room_id] = r.status; });
                document.querySelectorAll('.chat-room-status').forEach((el) => {
                    const roomId = el.getAttribute('data-status');
                    const status = byRoom[roomId];
                    if (!status) {
                        el.textContent = 'Belum diminta';
                        el.removeAttribute('data-state');
                    } else if (status === 'pending') {
                        el.textContent = 'Menunggu approval';
                        el.setAttribute('data-state', 'pending');
                    } else if (status === 'approved') {
                        el.textContent = 'Disetujui';
                        el.setAttribute('data-state', 'approved');
                    } else {
                        el.textContent = 'Ditolak';
                        el.setAttribute('data-state', 'rejected');
                    }
                });
            });
    }

    async function upsertProfile(user) {
        if (!supabase || !user) return;
        await supabase.from('profiles').upsert({
            id: user.uid,
            email: user.email || null,
            full_name: user.displayName || null,
            avatar_url: user.photoURL || null,
        }, { onConflict: 'id' });
    }

    function initServices() {
        if (typeof firebase === 'undefined' || typeof window.supabase === 'undefined' || !window.supabase.createClient) {
            return; // SDK belum kemuat (mis. diblok jaringan), landing page tetap jalan tanpa auth
        }
        if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('%%')) {
            return; // secret belum ke-inject (build lokal tanpa GitHub Actions)
        }
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);

        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            accessToken: async () => {
                const user = firebase.auth().currentUser;
                if (!user) return null;
                return await user.getIdToken();
            },
        });

        firebase.auth().onAuthStateChanged(async (user) => {
            currentUser = user;
            updateAccountIcon();
            if (user) await upsertProfile(user);
            refreshRoomStatuses();
            if (isChatPath(window.location.pathname)) render();
        });
    }

    function init() {
        if (!document.getElementById('chat-view')) return;
        bindNav();
        render();
        initServices();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
