/* chat-app.js — router SPA untuk /chat (landing + navigasi room + thread realtime).
   Auth: Firebase Google Sign-In (AuthHelper) pada Firebase app bernama 'chat' — terpisah dari
   app default yg dipakai GlobalChat halaman utama. Data: Cloud Firestore project server-nufa
   (profiles, rooms/{id}/messages, room_access_requests, room_members, chat_presence). */
(function () {
    'use strict';

    // Handler OAuth Google hanya terdaftar di domain bawaan proyek (bukan nufabase.web.app)
    const AUTH_DOMAIN = 'server-nufa.firebaseapp.com';

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

    const ACCOUNT_HINT_MESSAGES = [
        'Login akun google anda',
        'Akses percakapan dengan email anda',
        'Kelas kamu, obrolan kamu 🎓',
        'Aman & privat, cukup 1x klik',
    ];

    let db = null;
    let currentUser = null;
    let isAdmin = false;
    let threadUnsub = null;
    let currentRoomId = null;
    let hintHandle = null;
    let hintIndex = 0;
    let unreadUnsubs = [];
    let accessibleRooms = [];
    let unreadMap = {}; // { roomId: count }
    let presenceUnsub = null;
    let presenceInterval = null;
    let presenceBeat = null;
    let currentPresenceUid = null;
    let presenceState = {}; // { uid: { name, room, ts } }

    function roomMsgs(roomId) { return db.collection('rooms').doc(roomId).collection('messages'); }

    function msgTime(ts) {
        let d = new Date(Date.now());
        if (ts && typeof ts.toDate === 'function') d = ts.toDate();
        else if (ts instanceof Date) d = ts;
        else if (ts && ts.seconds) d = new Date(ts.seconds * 1000);
        else if (ts) d = new Date(ts);
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }

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

    function pathToRoomId(pathname) {
        const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean); // ['chat', 'pemasaran', '1']
        if (parts.length <= 1) return null; // '/chat' saja = landing
        if (parts[1] === 'info') return 'info';
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

    function teardownThread() {
        if (threadUnsub) threadUnsub();
        threadUnsub = null;
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
        const isOwn = !!(currentUser && msg.user_id === currentUser.uid);
        const el = document.createElement('div');
        el.className = 'chat-thread-msg' + (isOwn ? ' is-own' : '');
        el.dataset.msgId = msg.id;

        const name = document.createElement('span');
        name.className = 'chat-thread-msg-name';
        name.textContent = msg.display_name || 'Anonim';

        const content = document.createElement('span');
        content.className = 'chat-thread-msg-content';
        content.textContent = msg.content;

        const time = document.createElement('span');
        time.className = 'chat-thread-msg-time';
        time.textContent = msgTime(msg.created_at);

        el.appendChild(name);
        el.appendChild(content);
        el.appendChild(time);

        if (isOwn) {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'chat-thread-msg-del';
            del.title = 'Hapus pesan';
            del.innerHTML = '<i class="fa-solid fa-trash"></i>';
            del.onclick = () => deleteMessage(msg.id, el);
            el.appendChild(del);
        }

        container.appendChild(el);
        while (container.children.length > 200) container.removeChild(container.firstChild);
    }

    function removeMessageEl(container, id) {
        const el = container.querySelector('[data-msg-id="' + id + '"]');
        if (el) el.remove();
        if (!container.children.length) {
            container.innerHTML = '<p class="chat-thread-empty">Belum ada pesan.</p>';
        }
    }

    async function deleteMessage(id, el) {
        if (!db || !currentUser) return;
        if (!window.confirm('Hapus pesan ini?')) return;
        el.classList.add('is-deleting');
        try {
            await roomMsgs(currentRoomId).doc(id).delete();
            // penghapusan visual final ditangani listener onSnapshot (lihat openThread)
        } catch (e) {
            el.classList.remove('is-deleting');
            showChatToast('Gagal hapus pesan: ' + (e.message || e.code));
        }
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

        if (currentRoomId === roomId && threadUnsub) return; // sudah kebuka, cuma toggle permission
        teardownThread();
        currentRoomId = roomId;
        trackPresence();

        list.innerHTML = '<p class="chat-thread-loading">Memuat pesan...</p>';

        let first = true;
        threadUnsub = roomMsgs(roomId).orderBy('created_at', 'desc').limit(100).onSnapshot((snap) => {
            if (currentRoomId !== roomId || !threadUnsub) return;
            if (list.querySelector('.chat-thread-loading') || list.querySelector('.chat-thread-empty')) list.innerHTML = '';
            snap.docChanges().forEach((c) => { if (c.type === 'removed') removeMessageEl(list, c.doc.id); });
            const added = snap.docChanges().filter((c) => c.type === 'added')
                .map((c) => ({ id: c.doc.id, ...c.doc.data() }));
            if (first) added.reverse(); // snapshot awal desc -> balik ke urutan lama->baru
            first = false;
            added.forEach((m) => appendMessageEl(list, m));
            if (added.length) { scrollThreadToBottom(list); markRoomRead(roomId); }
            if (!snap.docs.length && !list.children.length) list.innerHTML = '<p class="chat-thread-empty">Belum ada pesan.</p>';
        }, (err) => {
            if (currentRoomId !== roomId) return;
            list.innerHTML = '<p class="chat-thread-empty">Gagal memuat pesan' +
                (err && err.code === 'permission-denied' ? ', atau kamu tidak punya akses.' : '') + '.</p>';
        });
    }

    async function sendMessage(roomId, content) {
        const text = content.trim().slice(0, 1000);
        if (!db || !currentUser || !text) return;
        try {
            await roomMsgs(roomId).add({
                room_id: roomId, user_id: currentUser.uid,
                display_name: (currentUser.displayName || 'Anonim').slice(0, 60),
                content: text, created_at: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch (e) {
            showChatToast(e.code === 'permission-denied' ? 'Tidak punya akses tulis di ruang ini.' : 'Gagal kirim pesan.');
        }
    }

    function accessRequestDocId(uid, roomId) { return uid + '_' + roomId; }

    async function loadAccess() {
        accessibleRooms = ['public', 'announcement'];
        if (isAdmin) { accessibleRooms = ALL_ROOM_IDS.slice(); return; }
        try {
            const s = await db.collection('room_members').where('user_id', '==', currentUser.uid).get();
            s.forEach((d) => { const r = d.data().room_id; if (CLASS_ROOM_IDS.includes(r)) accessibleRooms.push(r); });
        } catch (e) { /* biarin: cuma public & announcement */ }
    }

    async function renderClassRoomGate(roomId) {
        if (isAdmin) { await openThread(roomId, true); return; }
        const uid = currentUser.uid, docId = accessRequestDocId(uid, roomId);
        const [memSnap, reqSnap, others] = await Promise.all([
            db.collection('room_members').doc(docId).get().catch(() => null),
            db.collection('room_access_requests').doc(docId).get().catch(() => null),
            db.collection('room_access_requests').where('user_id', '==', uid)
                .where('status', 'in', ['pending', 'approved']).get().catch(() => ({ docs: [] })),
        ]);
        if (memSnap && memSnap.exists) {
            if (!accessibleRooms.includes(roomId)) { accessibleRooms.push(roomId); setupUnreadChannel(); }
            await openThread(roomId, true);
            return;
        }
        const status = reqSnap && reqSnap.exists ? reqSnap.data().status : null;
        const elsewhere = others.docs.some((d) => d.data().room_id !== roomId);
        showAccessGate(roomId, status, elsewhere);
    }

    function showAccessGate(roomId, status, elsewhere) {
        const label = ROOM_LABELS[roomId];
        const text = status === 'pending' ? 'Permintaan akses ke "' + label + '" menunggu persetujuan admin.'
            : elsewhere ? 'Kamu sudah aktif/mengajukan di kelas lain, jadi room ini terkunci.'
            : status === 'rejected' ? 'Permintaan akses ke "' + label + '" ditolak admin. Kamu bisa minta ulang.'
            : 'Ruang ini khusus anggota kelas. Ajukan akses ke admin.';
        showPlaceholderText(text);
        if (status === 'pending' || elsewhere) return;
        const box = document.getElementById('chat-room-placeholder');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-back-btn chat-request-btn';
        btn.style.marginTop = '12px';
        btn.textContent = 'Minta Akses ke Kelas Ini';
        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = 'Mengirim...';
            try {
                await db.collection('room_access_requests').doc(accessRequestDocId(currentUser.uid, roomId)).set({
                    user_id: currentUser.uid, room_id: roomId, status: 'pending',
                    user_name: currentUser.displayName || '', user_email: currentUser.email || '',
                    requested_at: firebase.firestore.FieldValue.serverTimestamp(),
                });
                showChatToast('Permintaan terkirim, tunggu persetujuan admin.');
                refreshRoomStatuses();
                showAccessGate(roomId, 'pending', false);
            } catch (e) {
                showChatToast('Gagal mengirim permintaan.');
                btn.textContent = 'Minta Akses ke Kelas Ini';
                btn.disabled = false;
            }
        };
        box.appendChild(btn);
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
        if (!db) {
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

    function showInfo() {
        document.getElementById('chat-room-list').hidden = true;
        document.getElementById('chat-room-placeholder').hidden = true;
        document.getElementById('chat-room-thread').hidden = true;
        teardownThread();
        window.scrollTo(0, 0);
    }

    function render() {
        const chatView = document.getElementById('chat-view');
        if (!chatView) return;
        const roomId = pathToRoomId(window.location.pathname);
        const info = document.getElementById('chat-info-view');
        if (info) info.hidden = roomId !== 'info';
        if (roomId === 'info') { showInfo(); return; }
        if (!roomId) showRoomList();
        else enterRoom(roomId);
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
        const infoBack = document.getElementById('chat-info-back-btn');
        if (infoBack) infoBack.addEventListener('click', () => navigate('/chat'));

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
            if (!db || !window.AuthHelper) return;
            if (currentUser) {
                await window.AuthHelper.signOut();
            } else {
                try {
                    await window.AuthHelper.signIn();
                } catch (err) {
                    const msg = window.AuthHelper.authErrorMessage(err);
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
                greetEl.textContent = 'Selamat datang di obrolan NufaBase, ' + firstName + ' 🖐️\nMasih dalam tahap pengembangan (Beta).\nTips: ganti nama di akun Google kamu, nama di sini otomatis ikut berubah.';
                greetEl.hidden = false;
            } else {
                greetEl.hidden = true;
            }
        }
        updateAccountHint();
    }

    function refreshRoomStatuses() {
        if (!db || !currentUser) {
            document.querySelectorAll('.chat-room-status').forEach((el) => {
                el.textContent = 'Login untuk minta akses';
                el.removeAttribute('data-state');
            });
            return;
        }
        db.collection('room_access_requests')
            .where('user_id', '==', currentUser.uid)
            .get()
            .then((snap) => {
                const byRoom = {};
                snap.docs.forEach((doc) => { const r = doc.data(); byRoom[r.room_id] = r.status; });
                document.querySelectorAll('.chat-room-status').forEach((el) => {
                    const status = byRoom[el.getAttribute('data-status')];
                    if (!status) {
                        el.textContent = 'Belum diminta';
                        el.removeAttribute('data-state');
                    } else if (status === 'pending') {
                        el.textContent = 'Menunggu persetujuan';
                        el.setAttribute('data-state', 'pending');
                    } else if (status === 'approved') {
                        el.textContent = 'Disetujui';
                        el.setAttribute('data-state', 'approved');
                    } else {
                        el.textContent = 'Ditolak';
                        el.setAttribute('data-state', 'rejected');
                    }
                });
            })
            .catch(() => {});
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

    async function countUnread(roomId, sinceDate) {
        try {
            const snap = await roomMsgs(roomId).where('created_at', '>', sinceDate).get();
            return snap.size || 0;
        } catch (e) { return 0; }
    }

    async function computeUnreadCounts() {
        if (!db || !currentUser) return;
        const rooms = accessibleRooms.slice();
        const map = getLastReadMap();
        if (!Object.keys(map).length) {
            // baru pertama kali: jangan hitung histori lama sebagai unread
            const now = new Date().toISOString();
            rooms.forEach((id) => { map[id] = now; });
            setLastReadMap(map);
        }
        const counts = await Promise.all(
            rooms.map((id) => countUnread(id, new Date(map[id] || '1970-01-01T00:00:00Z')))
        );
        rooms.forEach((id, i) => { unreadMap[id] = counts[i]; });
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
        unreadUnsubs.forEach((u) => u());
        unreadUnsubs = [];
    }

    // Satu listener per room yang boleh diakses, hanya pesan setelah login
    function setupUnreadChannel() {
        teardownUnreadChannel();
        if (!db || !currentUser) return;
        const uid = currentUser.uid, startTs = new Date();
        unreadUnsubs = accessibleRooms.map((roomId) =>
            roomMsgs(roomId).where('created_at', '>', startTs).onSnapshot((snap) => {
                snap.docChanges().forEach((change) => {
                    if (change.type !== 'added') return;
                    const msg = change.doc.data();
                    if (msg.user_id === uid || roomId === currentRoomId) return;
                    unreadMap[roomId] = (unreadMap[roomId] || 0) + 1;
                    renderUnreadBadges();
                    maybeNotify({ room_id: roomId, display_name: msg.display_name, content: msg.content });
                });
            }, () => {})
        );
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

    function onPresenceVisibility() {
        if (document.visibilityState === 'visible' && presenceBeat) presenceBeat();
        else if (document.visibilityState === 'hidden' && currentPresenceUid && db) {
            db.collection('chat_presence').doc(currentPresenceUid).delete().catch(() => {});
        }
    }

    function onPresencePageHide() {
        if (currentPresenceUid && db) db.collection('chat_presence').doc(currentPresenceUid).delete().catch(() => {});
    }

    function trackPresence() {
        if (presenceBeat) presenceBeat();
    }

    function teardownPresenceChannel() {
        if (presenceInterval) { clearInterval(presenceInterval); presenceInterval = null; }
        if (presenceUnsub) { presenceUnsub(); presenceUnsub = null; }
        if (currentPresenceUid && db) db.collection('chat_presence').doc(currentPresenceUid).delete().catch(() => {});
        currentPresenceUid = null;
        presenceBeat = null;
        document.removeEventListener('visibilitychange', onPresenceVisibility);
        window.removeEventListener('pagehide', onPresencePageHide);
        presenceState = {};
        renderOnlineBadges();
    }

    // Heartbeat 30s ke chat_presence/{uid}; entri dianggap online kalau ts < 90s
    function setupPresenceChannel() {
        teardownPresenceChannel();
        if (!db || !currentUser) return;
        const uid = currentUser.uid;
        currentPresenceUid = uid;
        presenceBeat = () => {
            db.collection('chat_presence').doc(uid).set({
                name: currentUser.displayName || currentUser.email || 'Anonim',
                room: currentRoomId || null,
                ts: Date.now(),
                online_at: firebase.firestore.FieldValue.serverTimestamp(),
            }).catch(() => {});
        };
        presenceBeat();
        presenceInterval = setInterval(presenceBeat, 30000);
        document.addEventListener('visibilitychange', onPresenceVisibility);
        window.addEventListener('pagehide', onPresencePageHide);
        presenceUnsub = db.collection('chat_presence').onSnapshot((snap) => {
            const now = Date.now(), data = {};
            snap.forEach((doc) => { const d = doc.data(); if (d && d.ts && now - d.ts < 90000) data[doc.id] = d; });
            presenceState = data;
            renderOnlineBadges();
        }, () => {});
    }

    function initServices() {
        if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.auth || !window.AuthHelper) return;
        if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('%%')) return;
        const app = firebase.apps.find((a) => a.name === 'chat') || firebase.initializeApp({ ...FIREBASE_CONFIG, authDomain: AUTH_DOMAIN }, 'chat');
        window.AuthHelper.use(app);
        db = app.firestore();

        const auth = app.auth();
        if (auth.useDeviceLanguage) auth.useDeviceLanguage();
        window.AuthHelper.settleRedirectResult(auth).catch(() => {});

        auth.onAuthStateChanged(async (user) => {
            currentUser = user;
            isAdmin = false;
            accessibleRooms = [];
            updateAccountIcon();
            if (user) {
                await window.AuthHelper.ensureProfile(user);
                isAdmin = (await window.AuthHelper.resolveRole(user)).isAdmin;
                await loadAccess();
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
