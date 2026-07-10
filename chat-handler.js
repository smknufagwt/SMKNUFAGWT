/**
 * ========================================
 * NUFA GLOBAL CHAT HANDLER
 * Real-time Listener + Push Notifikasi
 * Production Ready - Zero Backend Required
 * ========================================
 */

class NufaChat {
  constructor() {
    this.db = null;
    this.unsubscribe = null;
    this.lastMessageId = null;
    this.sw = null;
    this.isInitialized = false;
    this.msgQueue = [];
    this.notifEnabled = true;
  }

  /**
   * INIT: Setup Firebase + Real-time Listener
   */
  async init(firebaseConfig) {
    try {
      // Cek apakah Firebase sudah initialized
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      
      this.db = firebase.firestore();
      this.sw = navigator.serviceWorker.controller;

      console.log('%c✅ NufaChat initialized', 'color:#0f0; font-weight:bold; font-size:12px;');
      
      // Request notification permission
      await this.requestNotificationPermission();
      
      // Mulai real-time listener
      await this.startRealtimeListener();
      
      this.isInitialized = true;
      this.updateChatUI('System', '// Chat system online', true);
    } catch (e) {
      console.error('%c❌ NufaChat init error: ' + e.message, 'color:#ff003c; font-weight:bold;');
      this.updateChatUI('SYSTEM_ERROR', 'Gagal koneksi ke chat server', false);
    }
  }

  /**
   * REQUEST: User permission untuk notifikasi
   */
  async requestNotificationPermission() {
    try {
      const permission = await Notification.requestPermission();
      this.notifEnabled = permission === 'granted';
      console.log('%c📬 Notification permission: ' + permission, 'color:#00f0ff; font-weight:bold;');
      
      // Update bell icon status
      const bellBtn = document.getElementById('chat-notif-toggle');
      if (bellBtn) {
        if (this.notifEnabled) {
          bellBtn.classList.add('notif-on');
          bellBtn.title = 'Notifikasi ON';
        } else {
          bellBtn.classList.remove('notif-on');
          bellBtn.title = 'Notifikasi OFF';
        }
      }
      
      return this.notifEnabled;
    } catch (e) {
      console.warn('%c⚠️ Notification permission failed: ' + e.message, 'color:#d9c089;');
      return false;
    }
  }

  /**
   * REAL-TIME LISTENER: Firestore listener untuk pesan baru
   * PENTING: Ini GRATIS dan tidak mengurangi quota!
   */
  async startRealtimeListener() {
    try {
      // Listener: ambil 100 pesan terbaru, urutkan by timestamp DESC
      this.unsubscribe = this.db
        .collection('global_chat')
        .orderBy('ts', 'desc')
        .limit(100)
        .onSnapshot(
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              // Hanya process pesan BARU (added)
              if (change.type === 'added') {
                const msg = change.doc.data();
                const docId = change.doc.id;
                
                // Cek apakah ini benar pesan baru (bukan load awal)
                if (this.lastMessageId && docId !== this.lastMessageId) {
                  this.handleNewMessage(msg, docId);
                }
                
                // Update last message
                this.lastMessageId = docId;
              }
            });
          },
          (error) => {
            console.error('%c❌ Listener error: ' + error.message, 'color:#ff003c;');
          }
        );

      console.log('%c✅ Real-time listener started (QUOTA: FREE!)', 'color:#0f0; font-weight:bold;');
    } catch (e) {
      console.error('%c❌ Listener start error: ' + e.message, 'color:#ff003c;');
    }
  }

  /**
   * HANDLE: Pesan baru masuk
   */
  async handleNewMessage(msg, docId) {
    // Extract data
    const senderName = msg.uid || 'Anonymous';
    const messageText = msg.text || '(empty message)';
    const timestamp = msg.ts ? new Date(msg.ts).toLocaleTimeString() : new Date().toLocaleTimeString();

    console.log(`%c💬 Pesan baru: ${senderName}`, 'color:#0f0; font-weight:bold;');

    // NOTIFIKASI 1: Jika tab HIDDEN → system notification
    if (document.hidden && this.notifEnabled) {
      await this.showSystemNotification(senderName, messageText);
    }

    // NOTIFIKASI 2: Tampil di halaman
    this.showInAppNotification(senderName, messageText, timestamp);

    // BROADCAST: Kirim ke semua tab yang aktif (via BroadcastChannel)
    this.broadcastNewMessage({
      sender: senderName,
      text: messageText,
      timestamp,
      docId
    });

    // UPDATE UI: Tambah ke chat messages
    this.updateChatUI(senderName, messageText, true, timestamp);

    // KIRIM KE SW: Untuk update cache
    if (this.sw) {
      this.sw.postMessage({
        type: 'NEW_MESSAGE_CACHED',
        payload: { docId, sender: senderName, text: messageText }
      });
    }
  }

  /**
   * SYSTEM NOTIFICATION: Muncul di luar halaman
   */
  async showSystemNotification(sender, text) {
    try {
      if (!('Notification' in window)) {
        console.warn('%c⚠️ Notification API not supported', 'color:#d9c089;');
        return;
      }

      const truncatedText = text.substring(0, 100) + (text.length > 100 ? '...' : '');
      
      const notification = new Notification('💬 SMK Nufa Global Chat', {
        body: `${sender}: ${truncatedText}`,
        icon: '/appcover.jpg',
        badge: '/notif.png',
        tag: 'nufa-chat-notif',
        renotify: true,
        vibrate: [200, 100, 200],
        requireInteraction: false
      });

      // Klik notif → focus tab
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      console.log('%c📬 System notification showed', 'color:#00f0ff;');
    } catch (e) {
      console.warn('%c⚠️ Notification error: ' + e.message, 'color:#d9c089;');
    }
  }

  /**
   * IN-APP NOTIFICATION: Toast notif di atas halaman
   */
  showInAppNotification(sender, text, timestamp) {
    try {
      // Buat container notif jika belum ada
      let container = document.getElementById('nufa-inapp-notif-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'nufa-inapp-notif-container';
        container.style.cssText = `
          position: fixed;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1300;
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: min(92vw, 360px);
          pointer-events: none;
        `;
        document.body.appendChild(container);
      }

      // Buat notif toast
      const toast = document.createElement('div');
      toast.style.cssText = `
        background: rgba(0, 15, 0, 0.95);
        border: 1px solid #0f0;
        border-radius: 8px;
        padding: 12px 16px;
        box-shadow: 0 0 20px rgba(0,255,65,0.3);
        font-family: 'Share Tech Mono', monospace;
        color: #0f0;
        font-size: 0.85rem;
        pointer-events: auto;
        cursor: pointer;
        animation: slideDown 0.3s ease;
        letter-spacing: 1px;
        word-break: break-word;
      `;

      toast.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 4px; color: #00f0ff;">💬 ${sender}</div>
        <div style="opacity: 0.9;">${text}</div>
        <div style="font-size: 0.7rem; opacity: 0.6; margin-top: 6px;">${timestamp}</div>
      `;

      container.appendChild(toast);

      // Click to dismiss
      toast.onclick = () => {
        toast.style.animation = 'slideUp 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
      };

      // Auto-remove setelah 5 detik
      setTimeout(() => {
        if (toast.parentElement) {
          toast.style.animation = 'slideUp 0.3s ease forwards';
          setTimeout(() => toast.remove(), 300);
        }
      }, 5000);

      console.log('%c🎨 In-app notification showed', 'color:#00f0ff;');
    } catch (e) {
      console.warn('%c⚠️ In-app notification error: ' + e.message, 'color:#d9c089;');
    }
  }

  /**
   * UPDATE CHAT UI: Tambah pesan ke chat panel
   */
  updateChatUI(sender, text, isNew = false, timestamp = '') {
    try {
      const chatMessages = document.getElementById('chat-messages');
      if (!chatMessages) return;

      // Jika sender adalah "System", skip atau clear
      if (sender === 'System' && isNew) {
        const systemMsg = chatMessages.querySelector('.chat-msg .chat-text');
        if (systemMsg && systemMsg.textContent.includes('Memuat')) {
          chatMessages.innerHTML = '';
        }
      }

      if (sender === 'SYSTEM_ERROR') return;

      // Buat message DOM element
      const msgEl = document.createElement('div');
      msgEl.className = 'chat-msg';
      msgEl.style.cssText = 'animation: slideDown 0.3s ease;';
      
      const timeStr = timestamp || new Date().toLocaleTimeString();
      
      msgEl.innerHTML = `
        <span class="chat-ip">${timeStr} | ${sender}</span>
        <span class="chat-text">${text}</span>
      `;

      // Tambah ke atas (newest first)
      if (isNew) {
        chatMessages.insertBefore(msgEl, chatMessages.firstChild);
      } else {
        chatMessages.appendChild(msgEl);
      }

      // Limit pesan di UI (keep only 50 most recent)
      const msgs = chatMessages.querySelectorAll('.chat-msg');
      if (msgs.length > 50) {
        msgs[msgs.length - 1].remove();
      }

      // Update online count
      this.updateOnlineCount();
    } catch (e) {
      console.warn('%c⚠️ Chat UI update error: ' + e.message, 'color:#d9c089;');
    }
  }

  /**
   * UPDATE ONLINE COUNT: Hitung unique users
   */
  async updateOnlineCount() {
    try {
      const chatMessages = document.getElementById('chat-messages');
      if (!chatMessages) return;

      // Hitung unique senders dari last 50 messages
      const uniqueSenders = new Set();
      chatMessages.querySelectorAll('.chat-ip').forEach(el => {
        const sender = el.textContent.split('|')[1]?.trim() || 'Unknown';
        if (sender !== 'System') {
          uniqueSenders.add(sender);
        }
      });

      const onlineCount = Math.max(1, uniqueSenders.size);
      const countEl = document.getElementById('chat-online-count');
      if (countEl) {
        countEl.innerHTML = `<span class="num">${onlineCount}</span> ONLINE`;
        
        // Bump animation
        const numEl = countEl.querySelector('.num');
        if (numEl) {
          numEl.parentElement.classList.remove('bump');
          void numEl.parentElement.offsetWidth; // Trigger reflow
          numEl.parentElement.classList.add('bump');
        }
      }
    } catch (e) {
      console.warn('%c⚠️ Online count error: ' + e.message, 'color:#d9c089;');
    }
  }

  /**
   * BROADCAST: Kirim ke tab lain (sama browser)
   */
  broadcastNewMessage(msgData) {
    try {
      const bc = new BroadcastChannel('nufa-global-chat');
      bc.postMessage({
        type: 'NEW_MESSAGE',
        payload: msgData
      });
      bc.close();
    } catch (e) {
      console.warn('%c⚠️ Broadcast error: ' + e.message, 'color:#d9c089;');
    }
  }

  /**
   * SEND: Kirim pesan ke Firestore
   */
  async sendMessage(text) {
    if (!text.trim() || !this.db) return false;

    try {
      const chatSendBtn = document.getElementById('chat-send');
      if (chatSendBtn) {
        chatSendBtn.disabled = true;
        chatSendBtn.style.opacity = '0.5';
      }

      await this.db.collection('global_chat').add({
        text: text.trim(),
        uid: this.getAnonymousId(),
        ts: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('%c✅ Message sent', 'color:#0f0;');
      
      if (chatSendBtn) {
        chatSendBtn.disabled = false;
        chatSendBtn.style.opacity = '1';
      }
      
      return true;
    } catch (e) {
      console.error('%c❌ Send error: ' + e.message, 'color:#ff003c;');
      alert('❌ Gagal kirim pesan: ' + e.message);
      
      const chatSendBtn = document.getElementById('chat-send');
      if (chatSendBtn) {
        chatSendBtn.disabled = false;
        chatSendBtn.style.opacity = '1';
      }
      
      return false;
    }
  }

  /**
   * ANONYMOUS ID: Generate ID unik untuk user tanpa login
   */
  getAnonymousId() {
    let anonId = localStorage.getItem('nufa-anon-id');
    if (!anonId) {
      anonId = 'User-' + Math.random().toString(36).substring(2, 11).toUpperCase();
      localStorage.setItem('nufa-anon-id', anonId);
    }
    return anonId;
  }

  /**
   * TOGGLE NOTIF: Enable/Disable notifikasi
   */
  async toggleNotification() {
    this.notifEnabled = !this.notifEnabled;
    const bellBtn = document.getElementById('chat-notif-toggle');
    
    if (this.notifEnabled) {
      bellBtn.classList.add('notif-on');
      bellBtn.innerHTML = '<i class="fa-solid fa-bell"></i>';
      bellBtn.title = 'Notifikasi ON';
    } else {
      bellBtn.classList.remove('notif-on');
      bellBtn.innerHTML = '<i class="fa-solid fa-bell-slash"></i>';
      bellBtn.title = 'Notifikasi OFF';
    }
  }

  /**
   * CLEANUP: Stop listener saat page unload
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      console.log('%c🔴 Listener stopped', 'color:#ff003c;');
    }
  }
}

// Export untuk dipakai di index.html
window.NufaChat = NufaChat;
