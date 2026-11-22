/* sw-register.js — registrasi Service Worker, update prompt, OneSignal init, patch GlobalChat.send utk offline sync */
(function () {
  'use strict';
  const BC_NAME = 'nufa-realtime';
  let swReg = null;
  let bc    = null;
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[SW-Client] Service Worker tidak didukung browser ini.');
      return;
    }
    try {
      // SW baru langsung aktif sendiri (skipWaiting + clients.claim di sw.js)
      swReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      sendFirebaseConfig();

    } catch (e) {
      console.warn('[SW-Client] Gagal daftar SW:', e);
    }
  }

  function sendFirebaseConfig() {
    if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.projectId) return;
    const target = navigator.serviceWorker.controller || (swReg && swReg.active);
    if (!target) return;
    // Hanya projectId yang dibutuhkan SW (REST sync) — apiKey & config lain tidak dikirim
    target.postMessage({
      type:    'SET_FIREBASE_CONFIG',
      payload: { projectId: FIREBASE_CONFIG.projectId },
    });
  }
  function initBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    bc = new BroadcastChannel(BC_NAME);
    bc.onmessage = (event) => {
      const { type, payload } = event.data || {};

      if (type === 'NEW_CHAT_MESSAGE' || type === 'PUSH_RECEIVED') {
        if (typeof GlobalChat !== 'undefined' && GlobalChat.started) {
          GlobalChat.notify(payload);
        }
      }

      if (type === 'OPEN_CHAT') {
        if (typeof GlobalChat !== 'undefined') {
          GlobalChat.toggle(true);
        }
      }
    };
  }

  function initSWMessageListener() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, payload } = event.data || {};
      if ((type === 'NEW_CHAT_MESSAGE' || type === 'PUSH_RECEIVED')
          && typeof GlobalChat !== 'undefined' && GlobalChat.started) {
        GlobalChat.notify(payload);
      }
      if (type === 'OPEN_CHAT' && typeof GlobalChat !== 'undefined') {
        GlobalChat.toggle(true);
      }
    });
  }

  function patchGlobalChatSend() {
    if (typeof GlobalChat === 'undefined') return;

    const _origSend = GlobalChat.send.bind(GlobalChat);
    GlobalChat.send = async function () {
      if (!navigator.onLine) {
        const input   = document.getElementById('chat-input');
        const rawText = input ? input.value.trim() : '';
        if (!rawText) return;
        if (input) { input.value = ''; if (typeof GlobalChat.autoGrow === 'function') GlobalChat.autoGrow(input); }

        const payload = {
          ip:   GlobalChat._maskIp(GlobalChat.myIp || 'OFFLINE'),
          uid:  GlobalChat.presenceId || 'SW-queue',
          text: rawText.slice(0, 1024),
          ts:   Date.now(),
        };

        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type:    'ENQUEUE_MESSAGE',
            payload,
          });
        }
        GlobalChat._showToast({ ip: 'SYSTEM', text: '📴 Pesan disimpan — akan terkirim saat online kembali.' });
        return;
      }

      await _origSend();
      const lastMsg = {
        ip:   GlobalChat._maskIp(GlobalChat.myIp),
        text: '(lihat pesan terbaru)',
        ts:   Date.now(),
      };
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type:    'BROADCAST_CHAT',
          payload: lastMsg,
        });
      }
    };
  }
window.addEventListener('load', async () => {
    await registerSW();
    initBroadcastChannel();
    initSWMessageListener();
    patchGlobalChatSend();
    navigator.serviceWorker && navigator.serviceWorker.addEventListener('controllerchange', () => {
      sendFirebaseConfig();
    });
  });

})();
