// notification-bell.js
// Komponen notifikasi lonceng universal untuk staff
// Versi: 2.0.0 — Listener efisien, sinkronisasi antar tab, anti-duplikat, memory-safe
// Kompatibel dengan Firebase Firestore v10 compat
// Struktur Firestore: chat_users/{userId}/topics/{topicId} → messages, unreadCount, lastMessage, lastMessageSender, lastMessageTime

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// KONFIGURASI DEFAULT
// Dapat di-override melalui parameter options pada initNotificationBell(options)
// ─────────────────────────────────────────────────────────────────────────────
const NOTIF_CONFIG = {
    containerId:         'notificationBellContainer', // ID elemen target tempat bell dirender
    position:            'right',                     // posisi dropdown: 'left' atau 'right'
    soundEnabled:        true,                        // aktifkan suara notifikasi
    maxNotifications:    20,                          // maksimum notifikasi yang ditampilkan
    maxStoredNotifs:     50,                          // maksimum notifikasi yang disimpan di localStorage
    autoMarkReadOnClick: true,                        // tandai terbaca saat notifikasi diklik
    defaultPageTitle:    'SupportDesk Pro',           // judul halaman default untuk update title
    storageKey:          'notificationBellData_v2',   // key localStorage (v2 untuk menghindari konflik cache lama)
    channelName:         'notif_bell_sync',           // nama BroadcastChannel antar tab
    debug:               false                        // aktifkan log console untuk debugging
};

// ─────────────────────────────────────────────────────────────────────────────
// STATE INTERNAL — tidak boleh diakses langsung dari luar modul
// ─────────────────────────────────────────────────────────────────────────────
let _staffId         = null;  // UID staff yang sedang login
let _staffName       = '';    // nama staff yang sedang login
let _unreadTotal     = 0;     // jumlah notifikasi belum dibaca
let _notifications   = [];    // array objek notifikasi { id, userId, userName, topicId, topicName, message, timestamp, read }
let _topicsListener  = null;  // unsubscribe() dari collectionGroup listener utama
let _authListener    = null;  // unsubscribe() dari onAuthStateChanged
let _bellEl          = null;  // elemen tombol lonceng
let _dropdownEl      = null;  // elemen dropdown
let _badgeEl         = null;  // elemen badge angka
let _isOpen          = false; // status dropdown terbuka/tutup
let _audioEl         = null;  // elemen Audio untuk suara notifikasi
let _isInitialized   = false; // flag sudah diinisialisasi
let _channel         = null;  // BroadcastChannel untuk sinkronisasi antar tab
// Menyimpan timestamp lastMessage per topicId yang sudah diproses untuk mencegah duplikat saat reconnect
let _processedTopics = {};    // { [userId_topicId]: timestampMs }
// Menyimpan topik yang sudah dibaca staff (unreadCount=0 dari Firestore) agar tidak trigger notif ulang
// Key: "userId__topicId__lastMessageTimestampMs", value: true
// Ini adalah solusi untuk race condition: saat staff buka chat, unreadCount=0 dipropagasi ke Firestore,
// tapi listener notif mungkin masih melihat snapshot lama dengan unreadCount>0
let _readTopicStates = {};    // { [userId__topicId__tsMs]: true }
// Menyimpan unsubscribe listeners lama yang belum dibersihkan (safety net)
let _pendingUnsubs   = [];

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log helper — hanya tampil jika debug aktif
 */
function _log(...args) {
    if (NOTIF_CONFIG.debug) console.log('[NotifBell]', ...args);
}

/**
 * Escape HTML untuk mencegah XSS
 */
function _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

/**
 * Format waktu relatif dalam Bahasa Indonesia
 * @param {Date} date
 * @returns {string}
 */
function _relativeTime(date) {
    if (!date || !(date instanceof Date) || isNaN(date)) return '';
    const diff = Date.now() - date.getTime();
    if (diff < 60000)       return 'Baru saja';
    if (diff < 3600000)     return Math.floor(diff / 60000) + ' menit lalu';
    if (diff < 86400000)    return Math.floor(diff / 3600000) + ' jam lalu';
    if (diff < 604800000)   return Math.floor(diff / 86400000) + ' hari lalu';
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Normalisasi timestamp: Firestore Timestamp, Date, string ISO, atau null → Date
 * @param {*} ts
 * @returns {Date|null}
 */
function _toDate(ts) {
    if (!ts) return null;
    if (ts && typeof ts.toDate === 'function') return ts.toDate(); // Firestore Timestamp
    if (ts instanceof Date) return ts;
    const d = new Date(ts);
    return isNaN(d) ? null : d;
}

/**
 * Generate ID unik untuk notifikasi berdasarkan userId + topicId + timestamp ms
 */
function _makeNotifId(userId, topicId, timestampMs) {
    return `${userId}__${topicId}__${timestampMs || 0}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUARA NOTIFIKASI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memainkan suara notifikasi.
 * Menggunakan Web Audio API untuk menghasilkan suara tanpa bergantung pada file eksternal.
 * Lebih handal karena tidak perlu CDN dan tidak memerlukan izin CORS.
 */
function _playSound() {
    if (!NOTIF_CONFIG.soundEnabled) return;
    try {
        // Coba Web Audio API terlebih dahulu (lebih reliabel)
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
        // Tutup context setelah selesai untuk mencegah memory leak
        osc.onended = () => { try { ctx.close(); } catch(e) {} };
    } catch(e) {
        // Fallback ke Audio element jika Web Audio API tidak tersedia
        try {
            if (!_audioEl) {
                _audioEl = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' + 'A=');
                _audioEl.volume = 0.3;
            }
            _audioEl.currentTime = 0;
            _audioEl.play().catch(() => {});
        } catch(e2) { _log('Audio error:', e2); }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE & TITLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memperbarui tampilan badge angka dan judul tab browser
 */
function _updateBadge() {
    _unreadTotal = _notifications.filter(n => !n.read).length;

    if (_badgeEl) {
        if (_unreadTotal > 0) {
            _badgeEl.textContent = _unreadTotal > 99 ? '99+' : String(_unreadTotal);
            _badgeEl.style.display = 'flex';
        } else {
            _badgeEl.style.display = 'none';
        }
    }

    // Update judul tab browser
    const baseTitle = NOTIF_CONFIG.defaultPageTitle || document.title.replace(/^\(\d+\)\s*/, '') || 'SupportDesk Pro';
    document.title = _unreadTotal > 0 ? `(${_unreadTotal}) ${baseTitle}` : baseTitle;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merender ulang isi dropdown notifikasi
 */
function _renderDropdown() {
    if (!_dropdownEl) return;

    if (_notifications.length === 0) {
        _dropdownEl.innerHTML = `
            <div class="nb-empty">
                <i class="fas fa-bell-slash"></i>
                <span>Belum ada notifikasi</span>
            </div>`;
        return;
    }

    const hasUnread = _notifications.some(n => !n.read);
    const items = _notifications.slice(0, NOTIF_CONFIG.maxNotifications).map(n => {
        const isUnread = !n.read;
        const timeStr  = _relativeTime(n.timestamp);
        const preview  = n.message.length > 65 ? n.message.substring(0, 65) + '…' : n.message;
        return `
            <div class="nb-item${isUnread ? ' unread' : ''}"
                 data-uid="${_escHtml(n.userId)}"
                 data-tid="${_escHtml(n.topicId)}"
                 data-nid="${_escHtml(n.id)}"
                 role="button" tabindex="0"
                 aria-label="Pesan dari ${_escHtml(n.userName)}">
                <div class="nb-avatar">${_escHtml((n.userName || '?')[0].toUpperCase())}</div>
                <div class="nb-body">
                    <div class="nb-name">${_escHtml(n.userName)}</div>
                    <div class="nb-topic">${_escHtml(n.topicName || 'Percakapan')}</div>
                    <div class="nb-msg">${_escHtml(preview)}</div>
                    <div class="nb-time">${timeStr}</div>
                </div>
                ${isUnread ? '<div class="nb-dot" aria-hidden="true"></div>' : ''}
            </div>`;
    }).join('');

    _dropdownEl.innerHTML = `
        <div class="nb-header">
            <span class="nb-title">Notifikasi</span>
            ${hasUnread ? '<button class="nb-mark-all" type="button">Tandai semua terbaca</button>' : ''}
        </div>
        <div class="nb-list" role="list">${items}</div>
        <div class="nb-footer">
            <a href="chat-agent.html" class="nb-viewall">Lihat semua percakapan →</a>
        </div>`;

    // Bind klik item
    _dropdownEl.querySelectorAll('.nb-item').forEach(el => {
        const handleClick = (e) => {
            e.stopPropagation();
            const uid = el.dataset.uid;
            const tid = el.dataset.tid;
            const nid = el.dataset.nid;
            if (nid) markNotificationAsRead(nid);
            _openConversation(uid, tid);
        };
        el.addEventListener('click', handleClick);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(e); });
    });

    // Bind tombol mark all
    const markAllBtn = _dropdownEl.querySelector('.nb-mark-all');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            markAllNotificationsAsRead();
        });
    }
}

/**
 * Membuka percakapan di chat-agent.html dengan parameter URL
 */
function _openConversation(userId, topicId) {
    if (!userId) return;
    sessionStorage.setItem('pendingChatUser', userId);
    if (topicId) sessionStorage.setItem('pendingChatTopic', topicId);
    let url = `chat-agent.html?userId=${encodeURIComponent(userId)}`;
    if (topicId) url += `&topicId=${encodeURIComponent(topicId)}`;
    window.location.href = url;
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENSI — localStorage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menyimpan state notifikasi ke localStorage
 * Timestamp disimpan sebagai string ISO agar bisa di-parse kembali
 */
function _saveToStorage() {
    try {
        const serialized = _notifications.map(n => ({
            ...n,
            timestamp: n.timestamp instanceof Date ? n.timestamp.toISOString() : (n.timestamp || new Date().toISOString())
        }));
        localStorage.setItem(NOTIF_CONFIG.storageKey, JSON.stringify(serialized));
    } catch(e) {
        _log('Gagal simpan ke localStorage:', e);
    }
}

/**
 * Memuat notifikasi dari localStorage saat pertama kali inisialisasi
 */
function _loadFromStorage() {
    try {
        const raw = localStorage.getItem(NOTIF_CONFIG.storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        _notifications = parsed.map(n => ({
            id:        n.id        || '',
            userId:    n.userId    || '',
            userName:  n.userName  || 'User',
            topicId:   n.topicId   || '',
            topicName: n.topicName || 'Percakapan',
            message:   n.message   || '',
            timestamp: _toDate(n.timestamp) || new Date(),
            read:      n.read === true
        })).filter(n => n.id && n.userId);
        // Rebuild _processedTopics dari cache agar tidak duplikat saat listener aktif
        _notifications.forEach(n => {
            const key = `${n.userId}__${n.topicId}`;
            const ms  = n.timestamp instanceof Date ? n.timestamp.getTime() : 0;
            if (!_processedTopics[key] || ms > _processedTopics[key]) {
                _processedTopics[key] = ms;
            }
        });
        _log(`Dimuat ${_notifications.length} notifikasi dari localStorage`);
    } catch(e) {
        _log('Gagal load dari localStorage:', e);
        localStorage.removeItem(NOTIF_CONFIG.storageKey);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINKRONISASI ANTAR TAB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inisialisasi BroadcastChannel untuk sinkronisasi badge antar tab browser yang aktif.
 * Ketika satu tab menandai notifikasi sebagai terbaca, tab lain ikut diperbarui.
 */
function _initBroadcastChannel() {
    if (!('BroadcastChannel' in window)) {
        // Fallback: dengarin storage event untuk browser yang tidak mendukung BroadcastChannel
        window.addEventListener('storage', (e) => {
            if (e.key === NOTIF_CONFIG.storageKey) {
                _loadFromStorage();
                _updateBadge();
                if (_isOpen) _renderDropdown();
            }
        });
        _log('BroadcastChannel tidak didukung, menggunakan storage event');
        return;
    }

    try {
        _channel = new BroadcastChannel(NOTIF_CONFIG.channelName);
        _channel.onmessage = (e) => {
            const { type, data } = e.data || {};
            if (!type) return;
            _log('Pesan dari tab lain:', type, data);

            if (type === 'NOTIF_READ' && data?.notifId) {
                // Satu notifikasi ditandai terbaca di tab lain
                const notif = _notifications.find(n => n.id === data.notifId);
                if (notif && !notif.read) {
                    notif.read = true;
                    _updateBadge();
                    if (_isOpen) _renderDropdown();
                }
            } else if (type === 'NOTIF_READ_ALL') {
                // Semua notifikasi ditandai terbaca di tab lain
                _notifications.forEach(n => { n.read = true; });
                _updateBadge();
                if (_isOpen) _renderDropdown();
            } else if (type === 'CONV_READ' && data?.userId && data?.topicId) {
                // Percakapan dibuka di tab/halaman lain (chat-agent.html)
                _notifications.forEach(n => {
                    if (n.userId === data.userId && n.topicId === data.topicId) {
                        n.read = true;
                    }
                });
                _updateBadge();
                if (_isOpen) _renderDropdown();
            } else if (type === 'NEW_NOTIF' && data) {
                // Notifikasi baru dari tab lain (tab yang sedang di chat-agent.html)
                // Tidak perlu add, karena Firestore listener juga akan memicu di tab ini
                // Hanya perbarui badge jika notif belum ada
            }
        };
        _log('BroadcastChannel aktif:', NOTIF_CONFIG.channelName);
    } catch(e) {
        _log('Gagal inisialisasi BroadcastChannel:', e);
    }
}

/**
 * Broadcast event ke semua tab lain
 */
function _broadcast(type, data) {
    if (_channel) {
        try { _channel.postMessage({ type, data }); } catch(e) {}
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAJEMEN NOTIFIKASI INTERNAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menambahkan satu notifikasi baru ke state internal.
 * Melakukan pengecekan duplikat sebelum menambah.
 * Memainkan suara dan memperbarui UI jika notif benar-benar baru.
 *
 * @param {string} userId
 * @param {string} userName
 * @param {string} topicId
 * @param {string} topicName
 * @param {string} message
 * @param {Date}   timestamp
 * @returns {boolean} true jika notifikasi baru berhasil ditambahkan
 */
function _addNotification(userId, userName, topicId, topicName, message, timestamp) {
    if (!userId || !message) return false;

    const ts  = timestamp instanceof Date ? timestamp : (_toDate(timestamp) || new Date());
    const tsMs = ts.getTime();
    const id  = _makeNotifId(userId, topicId, tsMs);
    const key = `${userId}__${topicId}`;

    // Cek duplikat berdasarkan ID identik
    if (_notifications.some(n => n.id === id)) {
        _log('Skip duplikat (ID sama):', id);
        return false;
    }

    // Cek duplikat berdasarkan konten & timestamp mirip (dalam 5 detik)
    const isDuplicate = _notifications.some(n =>
        n.userId === userId &&
        n.topicId === topicId &&
        n.message === message &&
        Math.abs((n.timestamp instanceof Date ? n.timestamp.getTime() : 0) - tsMs) < 5000
    );
    if (isDuplicate) {
        _log('Skip duplikat (konten mirip):', message.substring(0, 30));
        return false;
    }

    // Cek apakah sudah pernah diproses (mencegah duplikat setelah reconnect)
    if (_processedTopics[key] && tsMs <= _processedTopics[key]) {
        _log('Skip — sudah diproses sebelumnya:', key, 'ts:', tsMs, 'processed:', _processedTopics[key]);
        return false;
    }

    const newNotif = {
        id,
        userId,
        userName:  userName  || 'User',
        topicId,
        topicName: topicName || 'Percakapan',
        message,
        timestamp: ts,
        read:      false
    };

    // Sisipkan di depan (terbaru di atas)
    _notifications.unshift(newNotif);

    // Batasi jumlah notifikasi yang disimpan
    if (_notifications.length > NOTIF_CONFIG.maxStoredNotifs) {
        _notifications = _notifications.slice(0, NOTIF_CONFIG.maxStoredNotifs);
    }

    // Update _processedTopics agar tidak duplikat setelah reconnect
    _processedTopics[key] = tsMs;

    _updateBadge();
    if (_isOpen) _renderDropdown();
    _playSound();
    _saveToStorage();

    _log(`Notifikasi baru: [${userName}] ${message.substring(0, 40)}`);
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE LISTENER — collectionGroup (EFISIEN)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memasang satu listener collectionGroup pada 'topics' untuk semua user sekaligus.
 * Jauh lebih efisien dibanding membuka listener per-user.
 *
 * Query filter: hanya dokumen dengan lastMessageSender == 'user' dan unreadCount > 0
 * (Firestore tidak mendukung filter pada map field, sehingga filter dilakukan di client)
 *
 * Strategi anti-duplikat saat reconnect:
 * - Saat onSnapshot dipanggil pertama kali (isInitialLoad), semua change berstatus 'added'
 *   meskipun data lama. Kita tandai sebagai "sudah dilihat" tanpa memicu notifikasi.
 * - Setelah isInitialLoad selesai, hanya change 'added'/'modified' yang baru benar memicu notifikasi.
 */
function _setupGroupListener() {
    if (!_staffId) return;

    // Bersihkan listener sebelumnya
    _cleanupListeners();

    if (typeof firebase === 'undefined' || !firebase.firestore) {
        console.error('[NotifBell] Firebase tidak tersedia saat setup listener');
        return;
    }

    _log('Memasang collectionGroup listener untuk topics...');

    let isInitialLoad = true;
    // Cache nama user untuk menghindari query berulang
    const _userNameCache = {};

    const groupRef = firebase.firestore().collectionGroup('topics');

    const unsub = groupRef.onSnapshot({ includeMetadataChanges: false }, async (snapshot) => {
        const changes = snapshot.docChanges();
        _log(`onSnapshot: ${changes.length} perubahan, initialLoad: ${isInitialLoad}`);

        // Proses setiap perubahan
        for (const change of changes) {
            const docRef  = change.doc.ref;
            const path    = docRef.path; // "chat_users/{userId}/topics/{topicId}"
            const parts   = path.split('/');

            // Hanya proses dokumen di bawah chat_users
            if (parts.length < 4 || parts[0] !== 'chat_users') continue;

            const userId  = parts[1];
            const topicId = parts[3];
            const data    = change.doc.data();
            const key     = `${userId}__${topicId}`;

            const lastMsgSender  = data.lastMessageSender;
            const lastMsg        = data.lastMessage || '';
            const lastMsgTime    = _toDate(data.lastMessageTime);
            const unreadForStaff = data.unreadCount?.[_staffId] || 0;

            // Pada initial load, hanya rekam state tanpa memicu notifikasi
            if (isInitialLoad) {
                if (lastMsgTime) {
                    const ms = lastMsgTime.getTime();
                    if (!_processedTopics[key] || ms > _processedTopics[key]) {
                        _processedTopics[key] = ms;
                    }
                    // Rekam topik yang SUDAH dibaca (unreadCount=0) saat initial load.
                    // Ini adalah fix utama untuk race condition: snapshot Firestore yang
                    // datang terlambat masih bisa membawa unreadCount>0 meski staff sudah
                    // membuka chat dan mereset unread. Dengan menyimpan state "sudah dibaca"
                    // per kombinasi topik+timestamp, kita bisa memblokir notif tersebut.
                    if (unreadForStaff === 0) {
                        _readTopicStates[`${key}__${lastMsgTime.getTime()}`] = true;
                    }
                }
                continue;
            }

            // Hanya proses perubahan 'added' dan 'modified' (bukan 'removed')
            if (change.type === 'removed') continue;

            // Cek apakah kombinasi topik+timestamp ini sudah pernah dilihat dengan unreadCount=0.
            // Ini memblokir snapshot terlambat yang datang setelah mark-read dari chat-agent.html.
            if (lastMsgTime) {
                const stateKey = `${key}__${lastMsgTime.getTime()}`;
                if (_readTopicStates[stateKey]) {
                    _log('Skip — snapshot terlambat, topik sudah dibaca:', stateKey);
                    continue;
                }
            }

            // Kondisi pemicu notifikasi:
            // 1. Pengirim pesan terakhir adalah user (bukan staff)
            // 2. Ada pesan belum dibaca oleh staff ini
            // 3. Ada konten pesan
            if (lastMsgSender !== 'user' || unreadForStaff <= 0 || !lastMsg) continue;

            // Jika unreadCount di-reset ke 0 (staff baru saja buka chat), catat di _readTopicStates
            // agar snapshot berikutnya dengan konten sama tidak trigger notif lagi
            if (unreadForStaff === 0 && lastMsgTime) {
                _readTopicStates[`${key}__${lastMsgTime.getTime()}`] = true;
            }

            // Ambil nama user (gunakan cache untuk efisiensi)
            let userName = _userNameCache[userId];
            if (!userName) {
                try {
                    const userDoc = await firebase.firestore().collection('users').doc(userId).get();
                    if (userDoc.exists) {
                        const d = userDoc.data();
                        userName = d.name || d.displayName || d.email?.split('@')[0] || userId;
                    } else {
                        userName = data.userName || userId;
                    }
                } catch(e) {
                    userName = data.userName || userId;
                }
                _userNameCache[userId] = userName;
            }

            const topicName = data.topicName || data.subject || 'Percakapan';
            const added = _addNotification(userId, userName, topicId, topicName, lastMsg, lastMsgTime);

            if (added) {
                // Broadcast ke tab lain agar mereka tahu ada notif baru
                _broadcast('NEW_NOTIF', { userId, topicId });
            }
        }

        // Setelah iterasi pertama selesai, set isInitialLoad ke false
        if (isInitialLoad) {
            isInitialLoad = false;
            _log('Initial load selesai. Listener siap menerima perubahan baru.');
        }

    }, (error) => {
        console.error('[NotifBell] Firestore listener error:', error);
        // Coba pasang ulang setelah 5 detik jika terjadi error fatal
        setTimeout(() => {
            if (_staffId) _setupGroupListener();
        }, 5000);
    });

    _pendingUnsubs.push(unsub);
    _topicsListener = unsub;
    _log('collectionGroup listener aktif');
}

/**
 * Membersihkan semua listener yang aktif untuk mencegah memory leak
 */
function _cleanupListeners() {
    if (_topicsListener) {
        try { _topicsListener(); } catch(e) {}
        _topicsListener = null;
    }
    // Safety net untuk listener yang mungkin belum dibersihkan
    _pendingUnsubs.forEach(fn => { try { fn(); } catch(e) {} });
    _pendingUnsubs = [];
    _log('Semua Firestore listeners dibersihkan');
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER KOMPONEN BELL DI DOM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Membuat elemen HTML lonceng notifikasi dan menyisipkannya ke container.
 * Jika container tidak ditemukan, akan dibuat otomatis dan disisipkan ke header.
 */
function _renderBell() {
    let container = document.getElementById(NOTIF_CONFIG.containerId);
    if (!container) {
        container = document.createElement('div');
        container.id    = NOTIF_CONFIG.containerId;
        container.style.cssText = 'position:relative;display:inline-block;';

        const header = document.querySelector('header, .navbar, .top-bar, .app-header, .header, nav');
        if (header) {
            header.appendChild(container);
        } else {
            document.body.insertAdjacentElement('afterbegin', container);
        }
        _log('Container bell dibuat dan disisipkan ke DOM');
    }

    // Cegah duplikasi render
    if (container.querySelector('.nb-wrapper')) {
        _bellEl    = container.querySelector('#nb-btn');
        _badgeEl   = container.querySelector('#nb-badge');
        _dropdownEl = container.querySelector('#nb-dropdown');
        _log('Wrapper sudah ada, reuse elemen yang ada');
        return;
    }

    container.innerHTML = `
        <div class="nb-wrapper">
            <button class="nb-btn" id="nb-btn" type="button"
                    aria-label="Notifikasi" aria-haspopup="true" aria-expanded="false">
                <i class="fas fa-bell"></i>
                <span class="nb-badge" id="nb-badge" aria-live="polite" aria-atomic="true"></span>
            </button>
            <div class="nb-dropdown" id="nb-dropdown" role="dialog"
                 aria-label="Daftar notifikasi" style="display:none;"></div>
        </div>`;

    _bellEl     = container.querySelector('#nb-btn');
    _badgeEl    = container.querySelector('#nb-badge');
    _dropdownEl = container.querySelector('#nb-dropdown');

    // Toggle dropdown saat tombol bell diklik
    _bellEl.addEventListener('click', (e) => {
        e.stopPropagation();
        _isOpen = !_isOpen;
        _dropdownEl.style.display = _isOpen ? 'block' : 'none';
        _bellEl.setAttribute('aria-expanded', String(_isOpen));
        if (_isOpen) {
            _renderDropdown();
        }
    });

    // Tutup dropdown jika klik di luar
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target) && _isOpen) {
            _isOpen = false;
            _dropdownEl.style.display = 'none';
            _bellEl.setAttribute('aria-expanded', 'false');
        }
    });

    // Tutup dropdown dengan tombol Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _isOpen) {
            _isOpen = false;
            _dropdownEl.style.display = 'none';
            _bellEl.setAttribute('aria-expanded', 'false');
            _bellEl.focus();
        }
    });

    _updateBadge();
    _injectStyles();
    _log('Komponen bell berhasil dirender');
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menyuntikkan CSS komponen ke <head>.
 * Menggunakan CSS custom properties yang sama dengan design system utama.
 */
function _injectStyles() {
    if (document.getElementById('nb-styles')) return;
    const s = document.createElement('style');
    s.id = 'nb-styles';
    s.textContent = `
/* ── Notification Bell v2 ─────────────────────── */
.nb-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.nb-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--t2, #475569);
    padding: 8px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
    position: relative;
    transition: background .18s, color .18s, transform .18s;
    outline: none;
}
.nb-btn:hover {
    background: var(--p-soft, rgba(99,102,241,.1));
    color: var(--p, #6366f1);
    transform: scale(1.08);
}
.nb-btn:focus-visible {
    box-shadow: 0 0 0 3px var(--p-glow, rgba(99,102,241,.3));
}
.nb-btn.has-unread .fa-bell {
    animation: nb-shake 0.5s ease-in-out;
}
@keyframes nb-shake {
    0%,100%{transform:rotate(0)}
    20%{transform:rotate(-15deg)}
    40%{transform:rotate(15deg)}
    60%{transform:rotate(-10deg)}
    80%{transform:rotate(10deg)}
}
.nb-badge {
    position: absolute;
    top: 1px;
    right: 1px;
    background: #ef4444;
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
    min-width: 17px;
    height: 17px;
    border-radius: 9px;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
    border: 2px solid var(--s0, #fff);
    line-height: 1;
    pointer-events: none;
    transform: translate(20%, -20%);
}
.nb-dropdown {
    position: absolute;
    top: calc(100% + 10px);
    ${NOTIF_CONFIG.position === 'right' ? 'right: 0;' : 'left: 0;'}
    width: 370px;
    max-width: min(370px, 92vw);
    background: var(--s0, #fff);
    border-radius: 16px;
    box-shadow: 0 16px 40px rgba(0,0,0,.13), 0 4px 12px rgba(0,0,0,.06);
    border: 1px solid var(--bd, #e2e8f0);
    z-index: 9999;
    overflow: hidden;
    animation: nb-drop .2s cubic-bezier(.34,1.56,.64,1);
}
@keyframes nb-drop {
    from { opacity:0; transform:translateY(-10px) scale(.97); }
    to   { opacity:1; transform:translateY(0)    scale(1);    }
}
.nb-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 13px 16px 11px;
    border-bottom: 1px solid var(--bd, #e2e8f0);
}
.nb-title {
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--t1, #0f172a);
    letter-spacing: -.01em;
}
.nb-mark-all {
    background: none;
    border: none;
    font-size: 0.7rem;
    color: var(--p, #6366f1);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 8px;
    transition: background .15s;
    font-weight: 500;
}
.nb-mark-all:hover { background: var(--p-soft, rgba(99,102,241,.1)); }
.nb-list {
    max-height: 380px;
    overflow-y: auto;
    overscroll-behavior: contain;
}
.nb-list::-webkit-scrollbar { width: 4px; }
.nb-list::-webkit-scrollbar-thumb { background: var(--bd, #e2e8f0); border-radius: 4px; }
.nb-item {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    padding: 11px 14px;
    cursor: pointer;
    transition: background .14s;
    border-bottom: 1px solid var(--bd2, #f1f5f9);
    position: relative;
    outline: none;
}
.nb-item:last-child { border-bottom: none; }
.nb-item:hover, .nb-item:focus-visible { background: var(--s1, #f8fafc); }
.nb-item.unread { background: var(--p-soft, rgba(99,102,241,.045)); }
.nb-item.unread:hover { background: rgba(99,102,241,.09); }
.nb-avatar {
    width: 36px;
    height: 36px;
    min-width: 36px;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--p, #6366f1), var(--sec, #8b5cf6));
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: -.01em;
}
.nb-body { flex: 1; min-width: 0; }
.nb-name {
    font-weight: 700;
    font-size: 0.78rem;
    color: var(--t1, #0f172a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.nb-topic {
    font-size: 0.68rem;
    color: var(--p, #6366f1);
    font-weight: 500;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.nb-msg {
    font-size: 0.74rem;
    color: var(--t2, #475569);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.4;
}
.nb-time {
    font-size: 0.63rem;
    color: var(--t3, #94a3b8);
    margin-top: 3px;
}
.nb-dot {
    width: 8px;
    height: 8px;
    min-width: 8px;
    background: var(--err, #ef4444);
    border-radius: 50%;
    margin-top: 5px;
    flex-shrink: 0;
}
.nb-empty {
    padding: 36px 16px;
    text-align: center;
    color: var(--t3, #94a3b8);
    font-size: 0.8rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}
.nb-empty i {
    font-size: 1.8rem;
    opacity: .45;
}
.nb-footer {
    padding: 10px 16px;
    border-top: 1px solid var(--bd, #e2e8f0);
    text-align: center;
}
.nb-viewall {
    font-size: 0.73rem;
    color: var(--p, #6366f1);
    text-decoration: none;
    font-weight: 600;
    transition: color .15s;
}
.nb-viewall:hover { color: var(--p-dark, #4f46e5); text-decoration: underline; }

/* Dark mode */
[data-theme="dark"] .nb-dropdown {
    background: var(--s0, #111827);
    border-color: var(--bd, #2d3748);
    box-shadow: 0 16px 40px rgba(0,0,0,.5), 0 4px 12px rgba(0,0,0,.3);
}
[data-theme="dark"] .nb-item { border-bottom-color: var(--bd2, #1e293b); }
[data-theme="dark"] .nb-header { border-bottom-color: var(--bd, #2d3748); }
[data-theme="dark"] .nb-footer { border-top-color: var(--bd, #2d3748); }
[data-theme="dark"] .nb-badge { border-color: var(--s0, #111827); }
/* ──────────────────────────────────────────────── */
    `;
    document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// API PUBLIK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menandai satu notifikasi sebagai sudah dibaca berdasarkan notifId.
 * Memperbarui badge, dropdown, localStorage, dan menyinkronkan ke tab lain.
 *
 * @param {string} notifId — ID unik notifikasi (field `id` pada objek notifikasi)
 */
function markNotificationAsRead(notifId) {
    if (!notifId) return;
    const notif = _notifications.find(n => n.id === notifId);
    if (!notif || notif.read) return;

    notif.read = true;
    _updateBadge();
    if (_isOpen) _renderDropdown();
    _saveToStorage();
    _broadcast('NOTIF_READ', { notifId });
    _log('Notifikasi ditandai terbaca:', notifId);
}

/**
 * Menandai semua notifikasi dari percakapan tertentu (userId + topicId) sebagai terbaca.
 * Dipanggil otomatis oleh chat-agent.html ketika staff membuka suatu percakapan.
 *
 * @param {string} userId
 * @param {string} topicId
 */
function markConversationAsRead(userId, topicId) {
    if (!userId) return;
    let changed = false;
    _notifications.forEach(n => {
        if (n.userId === userId && (!topicId || n.topicId === topicId) && !n.read) {
            n.read  = true;
            changed = true;
            // Daftarkan ke _readTopicStates agar listener Firestore tidak trigger notif
            // ulang dari snapshot yang datang setelah fungsi ini dipanggil (race condition fix)
            if (n.timestamp instanceof Date) {
                _readTopicStates[`${userId}__${n.topicId}__${n.timestamp.getTime()}`] = true;
            }
        }
    });
    // Selalu daftarkan kombinasi userId+topicId terbaru ke _readTopicStates,
    // bahkan jika tidak ada notif di state (staff mungkin buka chat langsung dari URL)
    if (topicId) {
        const key = `${userId}__${topicId}`;
        const tsMs = _processedTopics[key];
        if (tsMs) {
            _readTopicStates[`${key}__${tsMs}`] = true;
        }
    }
    if (changed) {
        _updateBadge();
        if (_isOpen) _renderDropdown();
        _saveToStorage();
    }
    // Selalu broadcast agar tab lain ikut update, meski tidak ada perubahan lokal
    _broadcast('CONV_READ', { userId, topicId });
    _log(`Percakapan ditandai terbaca: user=${userId}, topic=${topicId}`);
}

/**
 * Menandai SEMUA notifikasi sebagai sudah dibaca.
 * Memperbarui badge, dropdown, localStorage, dan menyinkronkan ke tab lain.
 */
function markAllNotificationsAsRead() {
    let changed = false;
    _notifications.forEach(n => {
        if (!n.read) { n.read = true; changed = true; }
    });
    if (changed) {
        _updateBadge();
        if (_isOpen) _renderDropdown();
        _saveToStorage();
        _broadcast('NOTIF_READ_ALL', {});
        _log('Semua notifikasi ditandai terbaca');
    }
}

/**
 * Menghapus notifikasi yang lebih lama dari N hari.
 * Berguna untuk garbage collection agar localStorage tidak membengkak.
 *
 * @param {number} [days=30] — hapus notifikasi lebih tua dari nilai ini
 */
function clearOldNotifications(days) {
    const maxAge = (typeof days === 'number' && days > 0 ? days : 30) * 86400000;
    const now    = Date.now();
    const before = _notifications.length;
    _notifications = _notifications.filter(n => {
        const ts = n.timestamp instanceof Date ? n.timestamp.getTime() : 0;
        return (now - ts) < maxAge;
    });
    const removed = before - _notifications.length;
    if (removed > 0) {
        _updateBadge();
        if (_isOpen) _renderDropdown();
        _saveToStorage();
        _log(`${removed} notifikasi lama dihapus (> ${days} hari)`);
    }
    return removed;
}

// ─────────────────────────────────────────────────────────────────────────────
// INISIALISASI UTAMA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menginisialisasi komponen lonceng notifikasi.
 * Harus dipanggil sekali di setiap halaman staff.
 * Listener Firebase akan aktif selama user login, tanpa bergantung pada chat-agent.html.
 *
 * @param {Object} [options] — override NOTIF_CONFIG
 * @param {string} [options.containerId]
 * @param {string} [options.position]         — 'left' | 'right'
 * @param {boolean}[options.soundEnabled]
 * @param {number} [options.maxNotifications]
 * @param {string} [options.defaultPageTitle]
 * @param {boolean}[options.debug]
 *
 * @example
 *   initNotificationBell({ debug: true, position: 'left' });
 */
async function initNotificationBell(options = {}) {
    // Merge options ke config
    Object.assign(NOTIF_CONFIG, options);

    if (typeof firebase === 'undefined') {
        console.error('[NotifBell] Firebase SDK tidak tersedia. Pastikan Firebase sudah dimuat sebelum script ini.');
        return;
    }

    // Cegah inisialisasi ganda
    if (_isInitialized) {
        _log('Sudah diinisialisasi sebelumnya, skip');
        return;
    }

    _log('Inisialisasi komponen notification bell...');

    // Setup BroadcastChannel terlebih dahulu
    _initBroadcastChannel();

    // Render elemen bell di DOM (langsung, sebelum auth)
    _renderBell();

    // Muat notifikasi dari cache agar badge langsung tampil sebelum Firebase terhubung
    _loadFromStorage();
    _updateBadge();
    if (_isOpen) _renderDropdown();

    // Pantau status auth Firebase
    // Listener ini tetap aktif selama halaman terbuka
    _authListener = firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            _staffId = user.uid;

            // Ambil nama staff dari Firestore
            try {
                const staffDoc = await firebase.firestore().collection('users').doc(_staffId).get();
                if (staffDoc.exists) {
                    const d = staffDoc.data();
                    _staffName = d.name || d.displayName || d.email?.split('@')[0] || user.displayName || 'Staff';
                } else {
                    _staffName = user.displayName || user.email?.split('@')[0] || 'Staff';
                }
            } catch(e) {
                _staffName = user.displayName || 'Staff';
            }

            _log(`Staff teridentifikasi: ${_staffName} (${_staffId})`);

            // Aktifkan Firestore listener
            _setupGroupListener();

            // Bersihkan notifikasi yang sangat lama (> 60 hari) saat login
            clearOldNotifications(60);

            if (_bellEl) _bellEl.style.display = '';
            _isInitialized = true;

        } else {
            // User logout — bersihkan semua listener dan sembunyikan bell
            _staffId   = null;
            _staffName = '';
            _cleanupListeners();
            if (_bellEl) _bellEl.style.display = 'none';
            _isInitialized = false;
            _log('User logout, listener dibersihkan');
        }
    });
}

/**
 * Membersihkan seluruh resource komponen.
 * Panggil ini jika komponen perlu di-unmount atau halaman akan ditutup.
 */
function destroyNotificationBell() {
    _cleanupListeners();
    if (_authListener) {
        try { _authListener(); } catch(e) {}
        _authListener = null;
    }
    if (_channel) {
        try { _channel.close(); } catch(e) {}
        _channel = null;
    }
    if (_audioEl) {
        _audioEl.pause();
        _audioEl = null;
    }
    const container = document.getElementById(NOTIF_CONFIG.containerId);
    if (container) container.innerHTML = '';
    _isInitialized = false;
    _staffId       = null;
    _notifications = [];
    _processedTopics = {};
    _log('Komponen bell dihancurkan');
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-INIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inisialisasi otomatis saat DOM siap, jika container atau header tersedia.
 * Bekerja untuk semua halaman staff tanpa konfigurasi manual.
 */
document.addEventListener('DOMContentLoaded', () => {
    const hasContainer = !!document.getElementById(NOTIF_CONFIG.containerId);
    const hasHeader    = !!document.querySelector('header, .navbar, .top-bar, .app-header, .header, nav');
    if (hasContainer || hasHeader) {
        initNotificationBell();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// EKSPOR
// ─────────────────────────────────────────────────────────────────────────────

// Ekspor ke global window untuk digunakan oleh halaman lain (terutama chat-agent.html)
window.NotificationBell = {
    init:                     initNotificationBell,
    destroy:                  destroyNotificationBell,
    markNotificationAsRead,
    markConversationAsRead,
    markAllNotificationsAsRead,
    clearOldNotifications,
    // Akses read-only ke state (untuk debugging atau integrasi)
    getUnreadCount:  ()   => _unreadTotal,
    getNotifications:()   => [..._notifications],
};

// Kompatibilitas dengan module bundler (Webpack, Node.js, dll.)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.NotificationBell;
}
