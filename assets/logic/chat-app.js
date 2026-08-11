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
    const ALL_ROOM_IDS = ['public', 'announcement'].concat(CLASS_ROOM_IDS);

    // Elemen main-site yang perlu disembunyikan selagi di /chat
    const MAIN_SITE_SELECTORS = [
        '#overlay', '#main-content', '#gallery-lightbox',
        '#music-btn', '#color-btn', '#chat-btn',
        '#chat-marquee-bar', '#chat-toast-stack', '#chat-panel',
    ];

    const ACCOUNT_HINT_MESSAGES = [
        'Login akun google anda',
        'Akses percakapan dengan email anda',
        'Kelas kamu, obrolan kamu 🎓',
        'Aman & privat, cukup 1x klik',
    ];

    let supabase = null;
    let currentUser = null;
    let isAdmin = false;
    let currentChannel = null;
    let currentRoomId = null;
    let hintHandle = null;
    let hintIndex = 0;
    let unreadChannel = null;
    let unreadMap = {}; // { roomId: count }
    let presenceChannel = null;
    let presenceState = {}; // { uid: { name, room, online_at } }

    function cycleAccountHint(el) {
        if (!window.ScrambleFX) return;
        const text = ACCOUNT_HINT_MESSAGES[hintIndex % ACCOUNT_HINT_MESSAGES.length];
        hintIndex++;
        hintHandle = window.ScrambleFX.run(el, text, {
            perCharMs: 35, tickMs: 30, holdMs: 2600, loop: false,
            onDone: () => {
                if (currentUser) return; // login kejadian di tengah cycle, biarin handler login yang ambil alih
                hintHandle = setTimeout(() => cycleAccountHint(el), 2600);
            },
        });
    }

    function updateAccountHint() {
        const el = document.getElementById('chat-account-hint');
        if (!el || !window.ScrambleFX) return;
        stopAccountHint();

        if (currentUser) {
            const label = currentUser.email || currentUser.displayName || 'Akun tersambung';
            el.classList.remove('is-scrambling');
            el.classList.add('is-visible');
            hintHandle = window.ScrambleFX.run(el, label, { perCharMs: 100, tickMs: 45, holdMs: 0, loop: false });
            // rainbow nyala setelah teks penuh ter-lock (delay ≈ durasi scramble)
            setTimeout(() => el.classList.add('is-identity'), label.length * 100 + 150);
        } else {
            el.classList.remove('is-identity');
            el.classList.add('is-visible');
            hintIndex = 0;
            cycleAccountHint(el);
        }
    }

    function stopAccountHint() {
        if (hintHandle) {
            if (typeof hintHandle.stop === 'function') hintHandle.stop();
            else clearTimeout(hintHandle);
            hintHandle = null;
        }
    }

    function showChatToast(msg) {
        let toast = document.getElementById('chatapp-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'chatapp-toast';
            toast.className = 'chatapp-toast';
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
        trackPresence();
    }

    function showRoomList() {
        document.getElementById('chat-room-list').hidden = false;
        document.getElementById('chat-room-placeholder').hidden = true;
        document.getElementById('chat-room-thread').hidden = true;
        teardownThread();
        if (currentUser) computeUnreadCounts();
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
        return false; // room kelas: writable ditentukan eksplisit oleh renderClassRoomGate
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

    async function openThread(roomId, writableOverride) {
        document.getElementById('chat-room-list').hidden = true;
        document.getElementById('chat-room-placeholder').hidden = true;
        document.getElementById('chat-room-thread').hidden = false;

        document.getElementById('chat-thread-title').textContent = ROOM_LABELS[roomId] || roomId;
        renderOnlineBadges();
        const list = document.getElementById('chat-thread-messages');
        const form = document.getElementById('chat-thread-form');
        const note = document.getElementById('chat-thread-readonly-note');
        const existingBtn = note.parentElement.querySelector('.chat-request-btn');
        if (existingBtn) existingBtn.remove();

        const writable = writableOverride !== undefined ? writableOverride : canWriteToRoom(roomId);
        form.hidden = !writable;
        note.hidden = writable;
        if (!writable) {
            note.textContent = roomId === 'announcement'
                ? 'Hanya admin yang bisa mengirim pesan di Announcement.'
                : 'Kamu tidak punya akses tulis di ruang ini — cuma bisa baca.';
        }

        markRoomRead(roomId);

        if (currentRoomId === roomId && currentChannel) return; // sudah kebuka, cuma toggle permission
        teardownThread();
        currentRoomId = roomId;
        trackPresence();

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
                markRoomRead(roomId);
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
        if (isAdmin) {
            await openThread(roomId, true);
            return;
        }

        const [mineRes, othersRes] = await Promise.all([
            supabase.from('room_access_requests').select('status').eq('user_id', currentUser.uid).eq('room_id', roomId).maybeSingle(),
            supabase.from('room_access_requests').select('room_id, status').eq('user_id', currentUser.uid).neq('room_id', roomId).in('status', ['pending', 'approved']),
        ]);

        const myStatus = mineRes.data ? mineRes.data.status : null;
        const hasActiveElsewhere = !othersRes.error && othersRes.data && othersRes.data.length > 0;
        const writable = myStatus === 'approved';

        await openThread(roomId, writable);
        if (writable) return; // full akses, gak perlu banner tambahan

        const note = document.getElementById('chat-thread-readonly-note');
        if (myStatus === 'pending') {
            note.textContent = 'Permintaan akses kamu ke "' + ROOM_LABELS[roomId] + '" masih menunggu approval admin. Sementara cuma bisa baca.';
        } else if (myStatus === 'rejected') {
            note.textContent = 'Permintaan akses ke "' + ROOM_LABELS[roomId] + '" ditolak admin. Sementara cuma bisa baca.';
        } else if (hasActiveElsewhere) {
            note.textContent = 'Kamu udah aktif di kelas lain — room ini cuma bisa dibaca.';
        } else {
            note.textContent = 'Kamu tidak punya akses tulis di ruang ini — cuma bisa baca.';
            const btn = document.createElement('button');
            btn.className = 'chat-back-btn chat-request-btn';
            btn.type = 'button';
            btn.textContent = 'Minta Akses ke Kelas Ini';
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = 'Mengirim...';
                const { error: insertErr } = await supabase
                    .from('room_access_requests')
                    .insert({ user_id: currentUser.uid, room_id: roomId });
                if (insertErr) {
                    showChatToast(insertErr.message.includes('aktif') ? insertErr.message : 'Gagal mengirim permintaan.');
                    btn.textContent = 'Minta Akses ke Kelas Ini';
                    btn.disabled = false;
                } else {
                    showChatToast('Permintaan terkirim, tunggu approval admin.');
                    btn.remove();
                    note.textContent = 'Permintaan akses ke "' + ROOM_LABELS[roomId] + '" masih menunggu approval admin. Sementara cuma bisa baca.';
                    refreshRoomStatuses();
                }
            });
            note.insertAdjacentElement('afterend', btn);
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

        const onlineTotalBtn = document.getElementById('chatapp-online-total');
        if (onlineTotalBtn) {
            onlineTotalBtn.addEventListener('click', () => {
                const listEl = document.getElementById('chatapp-online-list');
                if (listEl) listEl.hidden = !listEl.hidden;
            });
        }

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
        updateAccountHint();
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

    function lastReadStorageKey() {
        return currentUser ? 'chatLastRead:' + currentUser.uid : null;
    }

    function getLastReadMap() {
        const key = lastReadStorageKey();
        if (!key) return {};
        try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; }
    }

    function setLastReadMap(map) {
        const key = lastReadStorageKey();
        if (!key) return;
        try { localStorage.setItem(key, JSON.stringify(map)); } catch (e) { /* storage penuh/diblok, abaikan */ }
    }

    function markRoomRead(roomId) {
        if (!currentUser) return;
        const map = getLastReadMap();
        map[roomId] = new Date().toISOString();
        setLastReadMap(map);
        unreadMap[roomId] = 0;
        renderUnreadBadges();
    }

    function roomIdToPath(roomId) {
        if (roomId === 'public' || roomId === 'announcement') return '/chat/' + roomId;
        const idx = roomId.lastIndexOf('-');
        return '/chat/' + roomId.slice(0, idx) + '/' + roomId.slice(idx + 1);
    }

    function notifyServiceWorkerBadge(count) {
        if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
        try {
            navigator.serviceWorker.controller.postMessage({ type: 'SET_UNREAD_BADGE', payload: { count: count } });
        } catch (e) { /* SW belum siap, abaikan */ }
    }

    function renderUnreadBadges() {
        let total = 0;
        ALL_ROOM_IDS.forEach((roomId) => {
            const badge = document.querySelector('[data-unread="' + roomId + '"]');
            const count = unreadMap[roomId] || 0;
            total += count;
            if (badge) {
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.hidden = count === 0;
            }
        });
        const dot = document.getElementById('nav-chat-unread-dot');
        if (dot) dot.hidden = total === 0;
        notifyServiceWorkerBadge(total);
    }

    async function countUnread(roomId, sinceIso) {
        try {
            const { count } = await supabase
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('room_id', roomId)
                .gt('created_at', sinceIso);
            return count || 0;
        } catch (e) {
            return 0;
        }
    }

    async function computeUnreadCounts() {
        if (!supabase || !currentUser) return;
        const map = getLastReadMap();
        if (!Object.keys(map).length) {
            // baru pertama kali: jangan hitung histori lama sebagai unread
            const now = new Date().toISOString();
            ALL_ROOM_IDS.forEach((id) => { map[id] = now; });
            setLastReadMap(map);
        }
        const counts = await Promise.all(
            ALL_ROOM_IDS.map((id) => countUnread(id, map[id] || '1970-01-01T00:00:00Z'))
        );
        ALL_ROOM_IDS.forEach((id, i) => { unreadMap[id] = counts[i]; });
        renderUnreadBadges();
    }

    function maybeNotify(msg) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        try {
            const n = new Notification((ROOM_LABELS[msg.room_id] || msg.room_id) + ' • ' + (msg.display_name || 'Pesan baru'), {
                body: msg.content,
                icon: '/appcover.jpg',
                tag: 'chat-' + msg.room_id,
            });
            n.onclick = () => {
                window.focus();
                navigate(roomIdToPath(msg.room_id));
                n.close();
            };
        } catch (e) { /* browser nolak/gak dukung, abaikan */ }
    }

    function teardownUnreadChannel() {
        if (unreadChannel && supabase) supabase.removeChannel(unreadChannel);
        unreadChannel = null;
    }

    function setupUnreadChannel() {
        teardownUnreadChannel();
        if (!supabase || !currentUser) return;
        unreadChannel = supabase
            .channel('messages-unread-watch')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const msg = payload.new;
                if (msg.user_id === currentUser.uid) return; // pesan sendiri gak dihitung unread
                if (msg.room_id === currentRoomId) return;   // lagi kebuka, otomatis "read"
                unreadMap[msg.room_id] = (unreadMap[msg.room_id] || 0) + 1;
                renderUnreadBadges();
                maybeNotify(msg);
            })
            .subscribe();
    }

    function maybeRequestNotificationPermission() {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
    }

    // ── presence: 1 channel global (bukan 8 channel per-room — lebih hemat
    //    koneksi, penting buat device/koneksi low-end). Tiap user nge-track
    //    { name, room }; room null = lagi di hub /chat, bukan di room manapun.
    function computeOnlineCounts() {
        const counts = {};
        Object.values(presenceState).forEach((entry) => {
            if (entry && entry.room) counts[entry.room] = (counts[entry.room] || 0) + 1;
        });
        return counts;
    }

    function renderOnlineBadges() {
        const counts = computeOnlineCounts();
        ALL_ROOM_IDS.forEach((roomId) => {
            const count = counts[roomId] || 0;
            const item = document.querySelector('.chat-room-item[data-room="' + roomId + '"]');
            if (item) {
                let badge = item.querySelector('.chat-room-online');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'chat-room-online';
                    item.insertBefore(badge, item.querySelector('.chat-room-sub, .chat-room-status') || null);
                }
                badge.textContent = count + ' online';
                badge.hidden = count === 0;
            }
            if (roomId === currentRoomId) {
                const threadBadge = document.getElementById('chat-thread-online');
                if (threadBadge) {
                    threadBadge.textContent = count + ' online';
                    threadBadge.hidden = count === 0;
                }
            }
        });
        renderGlobalOnlineWidget();
    }

    function renderGlobalOnlineWidget() {
        const totalEl = document.getElementById('chatapp-online-total');
        if (!totalEl) return;
        const entries = Object.values(presenceState);
        const countEl = totalEl.querySelector('.chatapp-online-count');
        if (countEl) countEl.textContent = entries.length;
        totalEl.hidden = entries.length === 0;

        const listEl = document.getElementById('chatapp-online-list');
        if (!listEl) return;
        listEl.innerHTML = '';
        entries
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'chatapp-online-row';
                const dot = document.createElement('span');
                dot.className = 'chatapp-online-dot';
                const name = document.createElement('span');
                name.className = 'chatapp-online-name';
                name.textContent = entry.name || 'Anonim';
                const where = document.createElement('span');
                where.className = 'chatapp-online-where';
                where.textContent = entry.room ? (ROOM_LABELS[entry.room] || entry.room) : 'Beranda';
                row.appendChild(dot);
                row.appendChild(name);
                row.appendChild(where);
                listEl.appendChild(row);
            });
    }

    function trackPresence() {
        if (!presenceChannel || !currentUser) return;
        presenceChannel.track({
            name: currentUser.displayName || currentUser.email || 'Anonim',
            room: currentRoomId || null,
            online_at: new Date().toISOString(),
        });
    }

    function teardownPresenceChannel() {
        if (presenceChannel && supabase) supabase.removeChannel(presenceChannel);
        presenceChannel = null;
        presenceState = {};
        renderOnlineBadges();
    }

    function setupPresenceChannel() {
        if (!supabase || !currentUser) return;
        teardownPresenceChannel();
        const channel = supabase.channel('presence-chat-global', {
            config: { presence: { key: currentUser.uid } },
        });
        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            const flat = {};
            Object.keys(state).forEach((uid) => {
                const entry = state[uid] && state[uid][0];
                if (entry) flat[uid] = entry;
            });
            presenceState = flat;
            renderOnlineBadges();
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED') trackPresence();
        });
        presenceChannel = channel;
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
                maybeRequestNotificationPermission();
                computeUnreadCounts();
                setupUnreadChannel();
                setupPresenceChannel();
            } else {
                teardownThread();
                teardownUnreadChannel();
                teardownPresenceChannel();
                unreadMap = {};
                renderUnreadBadges();
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
