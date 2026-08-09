/* chat-app.js — router SPA untuk /chat (landing page + navigasi room + thread realtime).
   Auth: Firebase Google Sign-In (reuse FIREBASE_CONFIG dari index.html),
   di-bridge ke Supabase lewat Third-Party Auth (accessToken = Firebase ID token).
   Google Cloud OAuth client terpisah belum di-setup — makanya pakai Firebase,
   bukan supabase.auth.signInWithOAuth('google') langsung. */
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
    let isAdmin = false;
    let currentChannel = null;
    let currentRoomId = null;

    function showChatToast(msg) {
        let toast = document.getElementById('chat-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'chat-toast';
            toast.className = 'chat-toast';
            document.getElementById('chat-view').appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('is-visible');
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.classList.remove('is-visible'), 5000);
    }

    function firebaseAuthErrorMessage(err) {
        const code = err && err.code;
        if (code === 'auth/unauthorized-domain') return 'Domain ini belum diizinkan di Firebase — hubungi admin.';
        if (code === 'auth/popup-blocked') return 'Popup login diblokir browser, izinkan popup lalu coba lagi.';
        if (code === 'auth/popup-closed-by-user') return null; // user sengaja nutup, gak perlu toast
        if (code === 'auth/cancelled-popup-request') return null;
        return 'Login Google gagal: ' + (err && err.message ? err.message : 'error tidak diketahui');
    }

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

    function teardownThread() {
        if (currentChannel && supabase) {
            supabase.removeChannel(currentChannel);
        }
        currentChannel = null;
        currentRoomId = null;
    }

    function showRoomList() {
        document.getElementById('chat-room-list').hidden = false;
        document.getElementById('chat-room-placeholder').hidden = true;
        document.getElementById('chat-room-thread').hidden = true;
        teardownThread();
    }

    function showPlaceholderText(msg) {
        document.getElementById('chat-room-list').hidden = true;
        document.getElementById('chat-room-thread').hidden = true;
        teardownThread();
        const box = document.getElementById('chat-room-placeholder');
        const text = document.getElementById('chat-room-placeholder-text');
        box.hidden = false;
        text.textContent = msg;
        const existingBtn = box.querySelector('.chat-request-btn');
        if (existingBtn) existingBtn.remove();
    }

    function canWriteToRoom(roomId) {
        if (roomId === 'public') return true;
        if (roomId === 'announcement') return isAdmin;
        return true; // room kelas hanya sampai sini setelah lolos gate approved/admin
    }

    function scrollThreadToBottom(el) {
        el.scrollTop = el.scrollHeight;
    }

    function appendMessageEl(container, msg) {
        const el = document.createElement('div');
        el.className = 'chat-thread-msg' + (currentUser && msg.user_id === currentUser.uid ? ' is-own' : '');

        const name = document.createElement('span');
        name.className = 'chat-thread-msg-name';
        name.textContent = msg.display_name || 'Anonim';

        const content = document.createElement('span');
        content.className = 'chat-thread-msg-content';
        content.textContent = msg.content;

        const time = document.createElement('span');
        time.className = 'chat-thread-msg-time';
        time.textContent = new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        el.appendChild(name);
        el.appendChild(content);
        el.appendChild(time);
        container.appendChild(el);
    }

    async function openThread(roomId) {
        document.getElementById('chat-room-list').hidden = true;
        document.getElementById('chat-room-placeholder').hidden = true;
        document.getElementById('chat-room-thread').hidden = false;

        document.getElementById('chat-thread-title').textContent = ROOM_LABELS[roomId] || roomId;
        const list = document.getElementById('chat-thread-messages');
        const form = document.getElementById('chat-thread-form');
        const note = document.getElementById('chat-thread-readonly-note');

        const writable = canWriteToRoom(roomId);
        form.hidden = !writable;
        note.hidden = writable;
        if (!writable) {
            note.textContent = roomId === 'announcement'
                ? 'Hanya admin yang bisa mengirim pesan di Announcement.'
                : 'Kamu tidak punya akses tulis di ruang ini.';
        }

        if (currentRoomId === roomId && currentChannel) return; // sudah kebuka, cuma toggle permission
        teardownThread();
        currentRoomId = roomId;

        list.innerHTML = '<p class="chat-thread-loading">Memuat pesan...</p>';

        const { data, error } = await supabase
            .from('messages')
            .select('id, user_id, display_name, content, created_at')
            .eq('room_id', roomId)
            .order('created_at', { ascending: true })
            .limit(200);

        if (currentRoomId !== roomId) return; // pindah room selagi masih loading

        list.innerHTML = '';
        if (error) {
            list.innerHTML = '<p class="chat-thread-empty">Gagal memuat pesan.</p>';
        } else if (!data.length) {
            list.innerHTML = '<p class="chat-thread-empty">Belum ada pesan.</p>';
        } else {
            data.forEach((m) => appendMessageEl(list, m));
            scrollThreadToBottom(list);
        }

        currentChannel = supabase
            .channel('messages-' + roomId)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'messages', filter: 'room_id=eq.' + roomId,
            }, (payload) => {
                if (currentRoomId !== roomId) return;
                const empty = list.querySelector('.chat-thread-empty');
                if (empty) empty.remove();
                appendMessageEl(list, payload.new);
                scrollThreadToBottom(list);
            })
            .subscribe();
    }

    async function sendMessage(roomId, content) {
        if (!supabase || !currentUser || !content.trim()) return;
        const { error } = await supabase.from('messages').insert({
            room_id: roomId,
            user_id: currentUser.uid,
            display_name: currentUser.displayName || 'Anonim',
            content: content.trim(),
        });
        if (error) console.warn('[chat-app] gagal kirim pesan:', error.message);
    }

    async function renderClassRoomGate(roomId) {
        document.getElementById('chat-room-thread').hidden = true;
        teardownThread();

        if (isAdmin) {
            await openThread(roomId);
            return;
        }

        document.getElementById('chat-room-list').hidden = true;
        const box = document.getElementById('chat-room-placeholder');
        const text = document.getElementById('chat-room-placeholder-text');
        box.hidden = false;
        text.textContent = 'Memuat status akses...';
        const existingBtn = box.querySelector('.chat-request-btn');
        if (existingBtn) existingBtn.remove();

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
                    renderClassRoomGate(roomId);
                    refreshRoomStatuses();
                }
            });
            box.appendChild(btn);
            return;
        }

        if (data.status === 'pending') {
            text.textContent = 'Permintaan akses ke "' + ROOM_LABELS[roomId] + '" sedang menunggu approval admin.';
        } else if (data.status === 'approved') {
            await openThread(roomId);
        } else {
            text.textContent = 'Permintaan akses ke "' + ROOM_LABELS[roomId] + '" ditolak admin.';
        }
    }

    async function enterRoom(roomId) {
        if (roomId === 'unknown') {
            showPlaceholderText('Room tidak ditemukan.');
            return;
        }
        if (!currentUser) {
            showPlaceholderText('Login dengan Google dulu buat mengakses "' + (ROOM_LABELS[roomId] || roomId) + '".');
            return;
        }
        if (!supabase) {
            showPlaceholderText('Layanan chat belum siap, coba lagi sebentar.');
            return;
        }
        if (roomId === 'public' || roomId === 'announcement') {
            document.getElementById('chat-room-placeholder').hidden = true;
            await openThread(roomId);
            return;
        }
        await renderClassRoomGate(roomId);
    }

    function render() {
        const pathname = window.location.pathname;
        const chatView = document.getElementById('chat-view');
        if (!chatView) return;

        if (!isChatPath(pathname)) {
            chatView.hidden = true;
            setMainSiteVisible(true);
            teardownThread();
            return;
        }

        chatView.hidden = false;
        setMainSiteVisible(false);

        const roomId = pathToRoomId(pathname);
        if (!roomId) {
            showRoomList();
        } else {
            enterRoom(roomId);
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
        document.getElementById('chat-thread-back-btn').addEventListener('click', () => navigate('/chat'));

        document.getElementById('chat-thread-form').addEventListener('submit', (e) => {
            e.preventDefault();
            if (!currentRoomId) return;
            const input = document.getElementById('chat-thread-input');
            const value = input.value;
            if (!value.trim()) return;
            input.value = '';
            sendMessage(currentRoomId, value);
        });

        window.addEventListener('popstate', render);

        document.getElementById('chat-account-btn').addEventListener('click', async () => {
            if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
            if (currentUser) {
                await firebase.auth().signOut();
            } else {
                try {
                    await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
                } catch (err) {
                    const msg = firebaseAuthErrorMessage(err);
                    if (msg) showChatToast(msg);
                }
            }
        });
    }

    function updateAccountIcon() {
        const iconEl = document.getElementById('chat-account-icon');
        const greetEl = document.getElementById('chat-room-greeting');
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
        if (greetEl) {
            if (currentUser) {
                const firstName = (currentUser.displayName || '').split(' ')[0] || 'Sobat NUFA';
                greetEl.textContent = 'Halo, ' + firstName + ' 👋';
                greetEl.hidden = false;
            } else {
                greetEl.hidden = true;
            }
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
            isAdmin = false;
            updateAccountIcon();
            if (user) {
                await upsertProfile(user);
                const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.uid).maybeSingle();
                isAdmin = !!(data && data.is_admin);
            } else {
                teardownThread();
            }
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
