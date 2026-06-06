// activity-log.js - Sistem Activity Log Lengkap dengan Hak Akses Super Admin

class ActivityLogSystem {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.currentUser = null;
        this.currentUserRole = 'staff';
        this.allLogs = [];
        this.filteredLogs = [];
        this.currentPage = 1;
        this.logsPerPage = 20;
        this.hasLoggedLogin = false;
        this.isDeleting = false;
        
        this.init();
    }

    async init() {
        this.auth.onAuthStateChanged(async (user) => {
            this.currentUser = user;
            await this.getUserRole();
            
            console.log('[ActivityLog] Current user role:', this.currentUserRole);
            console.log('[ActivityLog] Is Super Admin?', this.isSuperAdmin());
            
            if (user) {
                const loginRecorded = sessionStorage.getItem('login_recorded');
                
                if (!loginRecorded && !this.hasLoggedLogin) {
                    this.hasLoggedLogin = true;
                    sessionStorage.setItem('login_recorded', 'true');
                    
                    await this.logActivity('LOGIN', {
                        email: user.email,
                        method: user.email ? 'email' : 'anonymous',
                        role: this.currentUserRole
                    });
                    console.log('[ActivityLog] LOGIN recorded once');
                }
            } else {
                this.hasLoggedLogin = false;
                sessionStorage.removeItem('login_recorded');
            }
            
            this.addMenuToSidebar();
        });
        
        console.log('[ActivityLog] System ready');
    }

    // ========== GET USER ROLE ==========
    async getUserRole() {
        try {
            const savedUser = localStorage.getItem('currentUser');
            if (savedUser) {
                const userData = JSON.parse(savedUser);
                this.currentUserRole = userData.role || 'staff';
                console.log('[ActivityLog] Role from localStorage:', this.currentUserRole);
                return;
            }
            
            const sessionUser = sessionStorage.getItem('user');
            if (sessionUser) {
                const userData = JSON.parse(sessionUser);
                this.currentUserRole = userData.role || 'staff';
                console.log('[ActivityLog] Role from sessionStorage:', this.currentUserRole);
                return;
            }
            
            if (this.currentUser) {
                const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
                if (userDoc.exists) {
                    this.currentUserRole = userDoc.data().role || 'staff';
                    console.log('[ActivityLog] Role from Firestore:', this.currentUserRole);
                }
            }
        } catch (error) {
            console.error('[ActivityLog] Error getting user role:', error);
            this.currentUserRole = 'staff';
        }
    }

    // ========== CEK APAKAH SUPER ADMIN ==========
    isSuperAdmin() {
        const isSuper = this.currentUserRole === 'super_admin';
        console.log('[ActivityLog] isSuperAdmin check:', isSuper, 'role:', this.currentUserRole);
        return isSuper;
    }

    // ========== MENU SIDEBAR ==========
    addMenuToSidebar() {
        const checkSidebar = setInterval(() => {
            const sidebarMenu = document.querySelector('.sidebar-menu');
            if (sidebarMenu) {
                clearInterval(checkSidebar);
                
                console.log('[ActivityLog] Adding menu, isSuperAdmin:', this.isSuperAdmin());
                
                if (!this.isSuperAdmin()) {
                    console.log('[ActivityLog] Menu tidak ditampilkan - user bukan Super Admin');
                    return;
                }
                
                if (document.querySelector('#activityLogMenuItem')) {
                    console.log('[ActivityLog] Menu already exists');
                    return;
                }
                
                const logoutBtn = document.getElementById('logoutButton');
                
                const menuItem = document.createElement('div');
                menuItem.id = 'activityLogMenuItem';
                menuItem.className = 'menu-item';
                menuItem.setAttribute('data-action', 'activity-log');
                menuItem.innerHTML = `
                    <div class="menu-icon">
                        <i class="fas fa-history"></i>
                    </div>
                    <span class="menu-text">Activity Log</span>
                    <span class="log-badge" id="logBadge" style="display:none;">0</span>
                `;
                
                if (logoutBtn && logoutBtn.parentNode) {
                    sidebarMenu.insertBefore(menuItem, logoutBtn);
                } else {
                    sidebarMenu.appendChild(menuItem);
                }
                
                menuItem.addEventListener('click', () => {
                    console.log('[ActivityLog] Menu clicked');
                    this.openActivityLogModal();
                });
                
                this.updateMenuTranslation();
                this.updateLogBadge();
                
                console.log('[ActivityLog] Menu added to sidebar (Super Admin only)');
            }
        }, 100);
    }

    updateMenuTranslation() {
        const menuItem = document.getElementById('activityLogMenuItem');
        if (!menuItem) return;
        
        const currentLang = localStorage.getItem('language') || 'id';
        const translations = {
            id: 'Activity Log',
            en: 'Activity Log',
            ja: '活動ログ',
            zh: '活动日志'
        };
        
        const menuText = menuItem.querySelector('.menu-text');
        if (menuText && translations[currentLang]) {
            menuText.textContent = translations[currentLang];
        }
    }

    async updateLogBadge() {
        if (!this.isSuperAdmin()) return;
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const todayLogs = await this.db.collection('activity_logs')
                .where('timestamp', '>=', today)
                .get();
            
            const badge = document.getElementById('logBadge');
            if (badge && todayLogs.size > 0) {
                badge.textContent = todayLogs.size;
                badge.style.display = 'inline-block';
            } else if (badge) {
                badge.style.display = 'none';
            }
        } catch (error) {
            console.error('Error updating badge:', error);
        }
    }

    // ========== FUNGSI LOG UTAMA ==========
    async logActivity(activity, details = {}) {
        try {
            const user = this.auth.currentUser;
            
            let userName = 'Unknown';
            let userRole = 'staff';
            let userEmail = user?.email || 'unknown';
            
            const savedUser = localStorage.getItem('currentUser');
            if (savedUser) {
                try {
                    const userData = JSON.parse(savedUser);
                    userName = userData.displayName || userData.name || userName;
                    userRole = userData.role || userRole;
                    userEmail = userData.email || userEmail;
                } catch(e) {}
            }
            
            const adminName = localStorage.getItem('adminName');
            if (adminName && userName === 'Unknown') {
                userName = adminName;
            }
            
            const logData = {
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                userId: user?.uid || 'unknown',
                userEmail: userEmail,
                userName: userName,
                userRole: userRole,
                userIP: await this.getUserIP(),
                activity: activity,
                details: details,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                date: new Date().toISOString()
            };
            
            await this.db.collection('activity_logs').add(logData);
            this.updateLogBadge();
            console.log('[ActivityLog]', activity, details);
            
        } catch (error) {
            console.error('[ActivityLog] Error:', error);
            this.saveToLocalBackup({
                activity,
                details,
                timestamp: new Date().toISOString()
            });
        }
    }

    logCreate(itemType, itemData) {
        this.logActivity('CREATE', {
            itemType: itemType,
            itemName: itemData.name || itemData.title || 'Unknown',
            itemId: itemData.id,
            category: itemData.category,
            brand: itemData.brand
        });
    }

    logUpdate(itemType, itemId, changes) {
        this.logActivity('UPDATE', {
            itemType: itemType,
            itemId: itemId,
            changes: changes
        });
    }

    logDelete(itemType, itemId, itemName) {
        this.logActivity('DELETE', {
            itemType: itemType,
            itemId: itemId,
            itemName: itemName
        });
    }

    async getUserIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'unknown';
        }
    }

    saveToLocalBackup(logData) {
        try {
            let backups = JSON.parse(localStorage.getItem('activity_logs_backup') || '[]');
            backups.unshift(logData);
            if (backups.length > 100) backups = backups.slice(0, 100);
            localStorage.setItem('activity_logs_backup', JSON.stringify(backups));
        } catch (error) {
            console.error('Failed to save backup:', error);
        }
    }

    async getLogs(limit = 500) {
        try {
            const querySnapshot = await this.db.collection('activity_logs')
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            
            const logs = [];
            querySnapshot.forEach(doc => {
                logs.push({ id: doc.id, ...doc.data() });
            });
            
            return logs;
            
        } catch (error) {
            console.error('Error getting logs:', error);
            return JSON.parse(localStorage.getItem('activity_logs_backup') || '[]');
        }
    }

    // ========== HAPUS SEMUA DATA ==========
    async deleteAllLogs() {
        console.log('[ActivityLog] deleteAllLogs called');
        console.log('[ActivityLog] isSuperAdmin:', this.isSuperAdmin());
        
        if (!this.isSuperAdmin()) {
            this.showNotification('Anda tidak memiliki akses untuk menghapus data!', 'error');
            return false;
        }
        
        if (this.isDeleting) {
            this.showNotification('Proses penghapusan sedang berjalan, harap tunggu...', 'warning');
            return false;
        }
        
        try {
            this.isDeleting = true;
            
            const confirmed = confirm('⚠️ PERINGATAN! Ini akan menghapus SEMUA data Activity Log. Tindakan ini tidak dapat dibatalkan. Lanjutkan?');
            if (!confirmed) {
                this.isDeleting = false;
                return false;
            }
            
            const doubleConfirm = prompt('Ketik "HAPUS SEMUA" untuk konfirmasi penghapusan semua data log:');
            if (doubleConfirm !== 'HAPUS SEMUA') {
                this.showNotification('Penghapusan dibatalkan - kode konfirmasi salah', 'error');
                this.isDeleting = false;
                return false;
            }
            
            this.showNotification('Sedang menghapus data... mohon tunggu', 'info');
            
            let allLogs = [];
            let lastDoc = null;
            let hasMore = true;
            
            while (hasMore) {
                let query = this.db.collection('activity_logs')
                    .orderBy('timestamp', 'desc')
                    .limit(500);
                
                if (lastDoc) {
                    query = query.startAfter(lastDoc);
                }
                
                const snapshot = await query.get();
                
                if (snapshot.empty) {
                    hasMore = false;
                    break;
                }
                
                snapshot.forEach(doc => {
                    allLogs.push({ id: doc.id });
                });
                
                lastDoc = snapshot.docs[snapshot.docs.length - 1];
                
                if (snapshot.size < 500) {
                    hasMore = false;
                }
            }
            
            console.log('[ActivityLog] Total logs to delete:', allLogs.length);
            
            if (allLogs.length === 0) {
                this.showNotification('Tidak ada data log untuk dihapus', 'error');
                this.isDeleting = false;
                return false;
            }
            
            const batchSize = 500;
            let deletedCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < allLogs.length; i += batchSize) {
                try {
                    const batch = this.db.batch();
                    const batchLogs = allLogs.slice(i, i + batchSize);
                    
                    batchLogs.forEach(log => {
                        const docRef = this.db.collection('activity_logs').doc(log.id);
                        batch.delete(docRef);
                    });
                    
                    await batch.commit();
                    deletedCount += batchLogs.length;
                    
                    const percent = Math.round((deletedCount / allLogs.length) * 100);
                    this.showNotification(`Menghapus... ${deletedCount} dari ${allLogs.length} log (${percent}%)`, 'info');
                    
                } catch (batchError) {
                    console.error('[ActivityLog] Batch delete error:', batchError);
                    errorCount++;
                    
                    const batchLogs = allLogs.slice(i, i + batchSize);
                    for (const log of batchLogs) {
                        try {
                            await this.db.collection('activity_logs').doc(log.id).delete();
                            deletedCount++;
                        } catch (singleError) {
                            console.error('[ActivityLog] Single delete error:', singleError);
                            errorCount++;
                        }
                    }
                }
            }
            
            localStorage.removeItem('activity_logs_backup');
            
            const modal = document.getElementById('activityLogModal');
            if (modal && modal.style.display === 'flex') {
                await this.loadLogsToModal();
            }
            
            await this.updateLogBadge();
            
            this.isDeleting = false;
            
            if (errorCount > 0) {
                this.showNotification(`Berhasil menghapus ${deletedCount} data log, ${errorCount} gagal`, 'warning');
            } else {
                this.showNotification(`Berhasil menghapus ${deletedCount} data log`, 'success');
            }
            
            return true;
            
        } catch (error) {
            console.error('[ActivityLog] Error deleting all logs:', error);
            this.showNotification('Gagal menghapus data log: ' + error.message, 'error');
            this.isDeleting = false;
            return false;
        }
    }

    // ========== MODAL DISPLAY ==========
    openActivityLogModal() {
        console.log('[ActivityLog] openActivityLogModal called');
        console.log('[ActivityLog] isSuperAdmin:', this.isSuperAdmin());
        
        if (!this.isSuperAdmin()) {
            this.showNotification('Anda tidak memiliki akses ke halaman ini!', 'error');
            return;
        }
        
        if (document.getElementById('activityLogModal')) {
            document.getElementById('activityLogModal').style.display = 'flex';
            this.loadLogsToModal();
            return;
        }
        
        this.createModal();
        this.loadLogsToModal();
    }

    createModal() {
        console.log('[ActivityLog] Creating modal');
        
        const modal = document.createElement('div');
        modal.id = 'activityLogModal';
        modal.className = 'activity-log-modal';
        
        modal.innerHTML = `
            <div class="activity-log-modal-content">
                <div class="modal-header">
                    <div class="modal-header-left">
                        <div class="modal-header-icon">
                            <i class="fas fa-history"></i>
                        </div>
                        <div class="modal-header-title">
                            <h3>Activity Log</h3>
                            <span class="admin-badge"><i class="fas fa-shield-alt"></i> Super Admin</span>
                        </div>
                    </div>
                    <div class="modal-header-actions">
                        <button id="refreshLogBtn" class="modal-action-btn" title="Refresh Data">
                            <i class="fas fa-sync-alt"></i>
                            <span>Refresh</span>
                        </button>
                        <button id="exportLogBtn" class="modal-action-btn export-btn" title="Export CSV">
                            <i class="fas fa-file-csv"></i>
                            <span>Export</span>
                        </button>
                        <button id="deleteAllLogsBtn" class="modal-action-btn delete-btn" title="Hapus Semua Data">
                            <i class="fas fa-trash-alt"></i>
                            <span>Hapus</span>
                        </button>
                        <button class="modal-close" id="closeLogModal" title="Tutup">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <div class="modal-body">
                    <div class="log-stats-summary">
                        <div class="stat-card stat-total">
                            <div class="stat-card-icon">
                                <i class="fas fa-list-alt"></i>
                            </div>
                            <div class="stat-info">
                                <span class="stat-value" id="totalLogsCount">0</span>
                                <span class="stat-label">Total Logs</span>
                            </div>
                            <div class="stat-card-bg"></div>
                        </div>
                        <div class="stat-card stat-users">
                            <div class="stat-card-icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="stat-info">
                                <span class="stat-value" id="activeUsersCount">0</span>
                                <span class="stat-label">Staff Aktif</span>
                            </div>
                            <div class="stat-card-bg"></div>
                        </div>
                        <div class="stat-card stat-active">
                            <div class="stat-card-icon">
                                <i class="fas fa-fire"></i>
                            </div>
                            <div class="stat-info">
                                <span class="stat-value" id="mostActiveActivity">-</span>
                                <span class="stat-label">Most Active</span>
                            </div>
                            <div class="stat-card-bg"></div>
                        </div>
                        <div class="stat-card stat-today">
                            <div class="stat-card-icon">
                                <i class="fas fa-calendar-check"></i>
                            </div>
                            <div class="stat-info">
                                <span class="stat-value" id="todayLogsCount">0</span>
                                <span class="stat-label">Hari Ini</span>
                            </div>
                            <div class="stat-card-bg"></div>
                        </div>
                    </div>

                    <div class="log-filter-bar">
                        <div class="filter-group search-group">
                            <i class="fas fa-search filter-icon"></i>
                            <input type="text" id="logSearchInput" placeholder="Cari aktivitas atau staff..." class="filter-input">
                        </div>
                        <div class="filter-group">
                            <i class="fas fa-bolt filter-icon"></i>
                            <select id="logActivityFilter" class="filter-select">
                                <option value="">Semua Aktivitas</option>
                                <option value="LOGIN">🔐 Login</option>
                                <option value="CREATE">➕ Create Report</option>
                                <option value="UPDATE">✏️ Update Report</option>
                                <option value="DELETE">🗑️ Delete Report</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <i class="fas fa-user filter-icon"></i>
                            <select id="logUserFilter" class="filter-select">
                                <option value="">Semua Staff</option>
                            </select>
                        </div>
                        <div class="filter-group date-group">
                            <i class="fas fa-calendar filter-icon"></i>
                            <input type="date" id="logStartDate" class="filter-input" placeholder="Dari tanggal">
                        </div>
                        <div class="filter-group date-group">
                            <i class="fas fa-calendar-alt filter-icon"></i>
                            <input type="date" id="logEndDate" class="filter-input" placeholder="Sampai tanggal">
                        </div>
                        <div class="filter-actions">
                            <button id="applyFilterBtn" class="filter-btn apply-btn">
                                <i class="fas fa-filter"></i> Filter
                            </button>
                            <button id="resetFilterBtn" class="filter-btn reset-btn">
                                <i class="fas fa-undo"></i> Reset
                            </button>
                        </div>
                    </div>
                    
                    <div id="logLoadingState" class="log-loading-state">
                        <div class="loading-spinner">
                            <div class="spinner-ring"></div>
                            <div class="spinner-ring"></div>
                            <div class="spinner-ring"></div>
                        </div>
                        <p>Memuat data log...</p>
                    </div>
                    
                    <div id="logTableContainer" style="display:none;">
                        <div class="table-wrapper">
                            <table class="log-table">
                                <thead>
                                    <tr>
                                        <th><i class="fas fa-clock"></i> Waktu</th>
                                        <th><i class="fas fa-tag"></i> Aktivitas</th>
                                        <th><i class="fas fa-user-circle"></i> Staff</th>
                                        <th><i class="fas fa-info-circle"></i> Detail Aktivitas</th>
                                        <th><i class="fas fa-globe"></i> IP Address</th>
                                    </tr>
                                </thead>
                                <tbody id="logTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div id="logPagination" class="log-pagination" style="display:none;">
                        <button id="prevPageBtn" class="page-btn" disabled>
                            <i class="fas fa-chevron-left"></i> Sebelumnya
                        </button>
                        <div class="page-info-wrap">
                            <span id="pageInfo">Halaman 1 dari 1</span>
                        </div>
                        <button id="nextPageBtn" class="page-btn">
                            Berikutnya <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.attachModalEvents();
    }

    attachModalEvents() {
        console.log('[ActivityLog] Attaching modal events');
        
        const closeBtn = document.getElementById('closeLogModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const modal = document.getElementById('activityLogModal');
                modal.classList.add('modal-closing');
                setTimeout(() => {
                    modal.style.display = 'none';
                    modal.classList.remove('modal-closing');
                }, 250);
            });
        }
        
        const modalBg = document.getElementById('activityLogModal');
        if (modalBg) {
            modalBg.addEventListener('click', (e) => {
                if (e.target === modalBg) {
                    modalBg.classList.add('modal-closing');
                    setTimeout(() => {
                        modalBg.style.display = 'none';
                        modalBg.classList.remove('modal-closing');
                    }, 250);
                }
            });
        }
        
        const refreshBtn = document.getElementById('refreshLogBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshBtn.classList.add('spinning');
                this.loadLogsToModal().then(() => {
                    setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
                });
            });
        }
        
        const exportBtn = document.getElementById('exportLogBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportLogsToCSV();
            });
        }
        
        const deleteAllBtn = document.getElementById('deleteAllLogsBtn');
        if (deleteAllBtn) {
            console.log('[ActivityLog] Delete button found, attaching event');
            deleteAllBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[ActivityLog] Delete button clicked');
                await this.deleteAllLogs();
            });
        } else {
            console.log('[ActivityLog] Delete button NOT found');
        }
        
        const applyBtn = document.getElementById('applyFilterBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyFilters();
            });
        }
        
        const resetBtn = document.getElementById('resetFilterBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetFilters();
            });
        }
        
        const prevBtn = document.getElementById('prevPageBtn');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.displayLogsInTable();
                }
            });
        }
        
        const nextBtn = document.getElementById('nextPageBtn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.filteredLogs.length / this.logsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.displayLogsInTable();
                }
            });
        }
        
        const searchInput = document.getElementById('logSearchInput');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.applyFilters();
                }
            });
        }
    }

    async loadLogsToModal() {
        const loadingState = document.getElementById('logLoadingState');
        const tableContainer = document.getElementById('logTableContainer');
        const pagination = document.getElementById('logPagination');
        
        if (loadingState) loadingState.style.display = 'flex';
        if (tableContainer) tableContainer.style.display = 'none';
        if (pagination) pagination.style.display = 'none';
        
        try {
            this.allLogs = await this.getLogs(1000);
            this.filteredLogs = [...this.allLogs];
            this.currentPage = 1;
            
            this.updateStats();
            this.populateUserFilter();
            this.displayLogsInTable();
            
            if (loadingState) loadingState.style.display = 'none';
            if (tableContainer) tableContainer.style.display = 'block';
            if (pagination) pagination.style.display = 'flex';
            
        } catch (error) {
            console.error('Error loading logs:', error);
            if (loadingState) {
                loadingState.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>Gagal memuat data log</p></div>';
            }
        }
    }

    updateStats() {
        if (!this.allLogs) return;
        
        const uniqueUsers = new Set();
        const activityCount = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let todayLogs = 0;
        
        this.allLogs.forEach(log => {
            uniqueUsers.add(log.userEmail);
            activityCount[log.activity] = (activityCount[log.activity] || 0) + 1;
            
            const logDate = log.timestamp?.toDate?.() || new Date(log.date);
            if (logDate >= today) {
                todayLogs++;
            }
        });
        
        let mostActive = '';
        let maxCount = 0;
        for (const [act, count] of Object.entries(activityCount)) {
            if (count > maxCount) {
                maxCount = count;
                mostActive = this.getActivityIcon(act);
            }
        }
        
        const animateValue = (el, target) => {
            if (!el) return;
            const start = 0;
            const duration = 800;
            const startTime = performance.now();
            const isNumber = !isNaN(target);
            
            if (!isNumber) {
                el.textContent = target;
                return;
            }
            
            const update = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.round(start + (target - start) * eased);
                if (progress < 1) requestAnimationFrame(update);
            };
            requestAnimationFrame(update);
        };
        
        animateValue(document.getElementById('totalLogsCount'), this.allLogs.length);
        animateValue(document.getElementById('activeUsersCount'), uniqueUsers.size);
        animateValue(document.getElementById('todayLogsCount'), todayLogs);
        
        const mostEl = document.getElementById('mostActiveActivity');
        if (mostEl) mostEl.textContent = mostActive || '-';
    }

    populateUserFilter() {
        const userFilter = document.getElementById('logUserFilter');
        if (!userFilter) return;
        
        const users = new Set();
        
        this.allLogs.forEach(log => {
            if (log.userEmail && log.userName) {
                users.add(JSON.stringify({
                    email: log.userEmail,
                    name: log.userName
                }));
            }
        });
        
        userFilter.innerHTML = '<option value="">Semua Staff</option>';
        users.forEach(userStr => {
            const user = JSON.parse(userStr);
            userFilter.innerHTML += `<option value="${user.email}">${user.name} (${user.email})</option>`;
        });
    }

    applyFilters() {
        const searchQuery = document.getElementById('logSearchInput')?.value.toLowerCase() || '';
        const activityFilter = document.getElementById('logActivityFilter')?.value || '';
        const userFilter = document.getElementById('logUserFilter')?.value || '';
        const startDate = document.getElementById('logStartDate')?.value || '';
        const endDate = document.getElementById('logEndDate')?.value || '';
        
        this.filteredLogs = this.allLogs.filter(log => {
            let match = true;
            
            if (searchQuery) {
                match = match && (
                    log.activity?.toLowerCase().includes(searchQuery) ||
                    log.userName?.toLowerCase().includes(searchQuery) ||
                    log.userEmail?.toLowerCase().includes(searchQuery) ||
                    JSON.stringify(log.details).toLowerCase().includes(searchQuery)
                );
            }
            
            if (activityFilter) {
                match = match && (log.activity === activityFilter);
            }
            
            if (userFilter) {
                match = match && (log.userEmail === userFilter);
            }
            
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                const logDate = log.timestamp?.toDate?.() || new Date(log.date);
                match = match && (logDate >= start);
            }
            
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                const logDate = log.timestamp?.toDate?.() || new Date(log.date);
                match = match && (logDate <= end);
            }
            
            return match;
        });
        
        this.currentPage = 1;
        this.displayLogsInTable();
        this.showNotification(`Ditemukan ${this.filteredLogs.length} log`);
    }

    resetFilters() {
        const searchInput = document.getElementById('logSearchInput');
        const activityFilter = document.getElementById('logActivityFilter');
        const userFilter = document.getElementById('logUserFilter');
        const startDate = document.getElementById('logStartDate');
        const endDate = document.getElementById('logEndDate');
        
        if (searchInput) searchInput.value = '';
        if (activityFilter) activityFilter.value = '';
        if (userFilter) userFilter.value = '';
        if (startDate) startDate.value = '';
        if (endDate) endDate.value = '';
        
        this.filteredLogs = [...this.allLogs];
        this.currentPage = 1;
        this.displayLogsInTable();
        this.showNotification('Filter direset');
    }

    displayLogsInTable() {
        const tbody = document.getElementById('logTableBody');
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        
        if (!tbody) return;
        
        const start = (this.currentPage - 1) * this.logsPerPage;
        const end = start + this.logsPerPage;
        const pageLogs = this.filteredLogs.slice(start, end);
        
        if (pageLogs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <div class="empty-state-content">
                            <i class="fas fa-inbox"></i>
                            <p>Belum ada aktivitas yang tercatat</p>
                        </div>
                    </td>
                </tr>`;
            if (pageInfo) pageInfo.textContent = 'Halaman 0 dari 0';
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            return;
        }
        
        tbody.innerHTML = pageLogs.map((log, idx) => {
            const time = log.timestamp?.toDate?.() || new Date(log.date);
            const formattedDate = time.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
            const formattedTime = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const activityDisplay = this.getActivityDisplay(log.activity);
            const detailDisplay = this.formatDetails(log.details, log.activity);
            const initials = (log.userName || 'U').charAt(0).toUpperCase();
            const avatarColor = this.getAvatarColor(log.userEmail || '');
            
            return `
                <tr style="animation-delay: ${idx * 30}ms">
                    <td class="time-cell">
                        <span class="date-part">${formattedDate}</span>
                        <span class="time-part">${formattedTime}</span>
                    </td>
                    <td>${activityDisplay}</td>
                    <td class="user-cell">
                        <div class="user-avatar" style="background: ${avatarColor}">${initials}</div>
                        <div class="user-info">
                            <strong>${log.userName || log.userEmail}</strong>
                            <small>${log.userRole || 'staff'}</small>
                        </div>
                    </td>
                    <td class="log-detail-cell" title="${detailDisplay.replace(/"/g, '&quot;')}">
                        <span class="detail-text">${detailDisplay.substring(0, 100)}${detailDisplay.length > 100 ? '...' : ''}</span>
                    </td>
                    <td class="ip-cell">
                        <span class="ip-badge"><i class="fas fa-network-wired"></i> ${log.userIP || '-'}</span>
                    </td>
                </tr>
            `;
        }).join('');
        
        const totalPages = Math.ceil(this.filteredLogs.length / this.logsPerPage);
        if (pageInfo) pageInfo.textContent = `Halaman ${this.currentPage} dari ${totalPages || 1}`;
        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        if (nextBtn) nextBtn.disabled = this.currentPage === totalPages || totalPages === 0;
    }

    getAvatarColor(email) {
        const colors = [
            'linear-gradient(135deg, #667eea, #764ba2)',
            'linear-gradient(135deg, #f093fb, #f5576c)',
            'linear-gradient(135deg, #4facfe, #00f2fe)',
            'linear-gradient(135deg, #43e97b, #38f9d7)',
            'linear-gradient(135deg, #fa709a, #fee140)',
            'linear-gradient(135deg, #a18cd1, #fbc2eb)',
            'linear-gradient(135deg, #ffecd2, #fcb69f)',
            'linear-gradient(135deg, #ff9a9e, #fad0c4)',
        ];
        let hash = 0;
        for (let i = 0; i < email.length; i++) {
            hash = email.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    getActivityIcon(activity) {
        const icons = {
            'LOGIN': '🔐 Login',
            'CREATE': '➕ Create',
            'UPDATE': '✏️ Update',
            'DELETE': '🗑️ Delete'
        };
        return icons[activity] || activity;
    }

    getActivityDisplay(activity) {
        const displays = {
            'LOGIN':  '<span class="badge badge-login"><i class="fas fa-sign-in-alt"></i> Login</span>',
            'CREATE': '<span class="badge badge-create"><i class="fas fa-plus-circle"></i> Create</span>',
            'UPDATE': '<span class="badge badge-update"><i class="fas fa-pencil-alt"></i> Update</span>',
            'DELETE': '<span class="badge badge-delete"><i class="fas fa-trash"></i> Delete</span>'
        };
        return displays[activity] || `<span class="badge badge-default">${activity}</span>`;
    }

    formatDetails(details, activity) {
        if (!details) return '-';
        if (typeof details === 'string') return details;
        
        switch(activity) {
            case 'CREATE':
                return `Membuat ${details.itemType}: "${details.itemName}" (${details.category || '-'} - ${details.brand || '-'})`;
            case 'UPDATE':
                const changes = details.changes || {};
                const changeList = Object.keys(changes).join(', ');
                return `Mengupdate ${details.itemType} ID: ${details.itemId} — Perubahan: ${changeList || 'tidak diketahui'}`;
            case 'DELETE':
                return `Menghapus ${details.itemType}: "${details.itemName}" (ID: ${details.itemId})`;
            case 'LOGIN':
                return `Login via ${details.method || 'email'} (Role: ${details.role || 'staff'})`;
            default:
                return JSON.stringify(details);
        }
    }

    exportLogsToCSV() {
        if (this.filteredLogs.length === 0) {
            this.showNotification('Tidak ada data untuk diekspor', 'error');
            return;
        }
        
        const headers = ['Waktu', 'Aktivitas', 'Staff', 'Email', 'Role', 'IP Address', 'Detail'];
        const rows = this.filteredLogs.map(log => [
            log.timestamp?.toDate?.() || log.date,
            log.activity,
            log.userName,
            log.userEmail,
            log.userRole,
            log.userIP,
            typeof log.details === 'object' ? JSON.stringify(log.details) : log.details
        ]);
        
        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
            .join('\n');
        
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', `activity_log_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        this.showNotification('Log berhasil diekspor ke CSV');
    }

    showNotification(message, type = 'success') {
        const existing = document.getElementById('activityLogNotification');
        if (existing) {
            existing.classList.remove('show');
            setTimeout(() => existing.remove(), 200);
        }
        
        const iconMap = {
            error:   'fa-exclamation-circle',
            success: 'fa-check-circle',
            info:    'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };
        
        const notification = document.createElement('div');
        notification.id = 'activityLogNotification';
        notification.className = `activity-log-notification notif-${type}`;
        notification.innerHTML = `
            <i class="fas ${iconMap[type] || 'fa-check-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 10);
        
        const duration = (type === 'info' || type === 'warning') ? 5000 : 3000;
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 350);
        }, duration);
    }
}

// ========== GLOBAL FUNCTIONS ==========
function logActivity(activity, details) {
    if (window.activityLog) {
        window.activityLog.logActivity(activity, details);
    } else {
        console.warn('[ActivityLog] System not ready yet');
    }
}

function logCreate(itemType, itemData) {
    if (window.activityLog) {
        window.activityLog.logCreate(itemType, itemData);
    }
}

function logUpdate(itemType, itemId, changes) {
    if (window.activityLog) {
        window.activityLog.logUpdate(itemType, itemId, changes);
    }
}

function logDelete(itemType, itemId, itemName) {
    if (window.activityLog) {
        window.activityLog.logDelete(itemType, itemId, itemName);
    }
}

// ========== CSS STYLES ==========
function addActivityLogStyles() {
    if (document.getElementById('activityLogStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'activityLogStyles';
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        /* ===== BADGE SIDEBAR ===== */
        .log-badge {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 20px;
            margin-left: 8px;
            min-width: 20px;
            text-align: center;
            box-shadow: 0 2px 6px rgba(239,68,68,0.4);
            animation: pulse-badge 2s infinite;
        }

        @keyframes pulse-badge {
            0%, 100% { transform: scale(1); box-shadow: 0 2px 6px rgba(239,68,68,0.4); }
            50% { transform: scale(1.1); box-shadow: 0 4px 12px rgba(239,68,68,0.6); }
        }

        /* ===== MODAL OVERLAY ===== */
        .activity-log-modal {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(10, 15, 30, 0.75);
            z-index: 10000;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            padding: 16px;
        }

        .activity-log-modal-content {
            font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
            background: #ffffff;
            border-radius: 20px;
            width: 100%;
            max-width: 1340px;
            height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow:
                0 0 0 1px rgba(255,255,255,0.1),
                0 32px 80px rgba(0,0,0,0.35),
                0 8px 24px rgba(0,0,0,0.2);
            animation: modalSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            overflow: hidden;
        }

        .activity-log-modal.modal-closing .activity-log-modal-content {
            animation: modalSlideOut 0.25s ease forwards;
        }

        @keyframes modalSlideIn {
            from { opacity: 0; transform: translateY(-28px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes modalSlideOut {
            from { opacity: 1; transform: translateY(0) scale(1); }
            to   { opacity: 0; transform: translateY(-20px) scale(0.97); }
        }

        /* ===== MODAL HEADER ===== */
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 18px 24px;
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 60%, #60a5fa 100%);
            color: white;
            position: relative;
            overflow: hidden;
            flex-shrink: 0;
        }

        .modal-header::before {
            content: '';
            position: absolute;
            inset: 0;
            background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
            pointer-events: none;
        }

        .modal-header-left {
            display: flex;
            align-items: center;
            gap: 14px;
            position: relative;
        }

        .modal-header-icon {
            width: 42px;
            height: 42px;
            background: rgba(255,255,255,0.2);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            border: 1px solid rgba(255,255,255,0.3);
            backdrop-filter: blur(4px);
        }

        .modal-header-title {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .modal-header-title h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            letter-spacing: -0.3px;
        }

        .admin-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            font-weight: 600;
            background: rgba(255,255,255,0.2);
            padding: 3px 10px;
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.3);
            letter-spacing: 0.3px;
            width: fit-content;
        }

        .modal-header-actions {
            display: flex;
            gap: 8px;
            align-items: center;
            position: relative;
        }

        .modal-action-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(255,255,255,0.15);
            border: 1px solid rgba(255,255,255,0.25);
            color: white;
            padding: 7px 14px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            font-family: inherit;
            transition: all 0.2s ease;
            backdrop-filter: blur(4px);
        }

        .modal-action-btn:hover {
            background: rgba(255,255,255,0.28);
            border-color: rgba(255,255,255,0.45);
            transform: translateY(-1px);
        }

        .modal-action-btn.export-btn:hover { background: rgba(16,185,129,0.5); }
        .modal-action-btn.delete-btn:hover  { background: rgba(239,68,68,0.6); border-color: #f87171; }

        .modal-action-btn.spinning i { animation: spin 0.6s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .modal-close {
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            transition: all 0.2s ease;
        }

        .modal-close:hover {
            background: rgba(239,68,68,0.5);
            border-color: #f87171;
            transform: rotate(90deg);
        }

        /* ===== MODAL BODY ===== */
        .modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
            background: #f8fafc;
        }

        .modal-body::-webkit-scrollbar { width: 6px; }
        .modal-body::-webkit-scrollbar-track { background: transparent; }
        .modal-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .modal-body::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

        /* ===== STAT CARDS ===== */
        .log-stats-summary {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 20px;
        }

        .stat-card {
            position: relative;
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 18px 20px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06);
            overflow: hidden;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            border: 1px solid rgba(255,255,255,0.8);
        }

        .stat-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        }

        .stat-card-icon {
            width: 48px;
            height: 48px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            flex-shrink: 0;
            position: relative;
            z-index: 1;
        }

        .stat-total .stat-card-icon  { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; }
        .stat-users .stat-card-icon  { background: linear-gradient(135deg, #10b981, #059669); color: white; }
        .stat-active .stat-card-icon { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; }
        .stat-today .stat-card-icon  { background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: white; }

        .stat-info {
            display: flex;
            flex-direction: column;
            position: relative;
            z-index: 1;
        }

        .stat-value {
            font-size: 26px;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.1;
            letter-spacing: -0.5px;
        }

        .stat-label {
            font-size: 12px;
            color: #64748b;
            font-weight: 500;
            margin-top: 3px;
        }

        .stat-card-bg {
            position: absolute;
            right: -16px;
            top: -16px;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            opacity: 0.06;
        }

        .stat-total .stat-card-bg  { background: #3b82f6; }
        .stat-users .stat-card-bg  { background: #10b981; }
        .stat-active .stat-card-bg { background: #f59e0b; }
        .stat-today .stat-card-bg  { background: #8b5cf6; }

        /* ===== FILTER BAR ===== */
        .log-filter-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 20px;
            padding: 16px 20px;
            background: white;
            border-radius: 14px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            border: 1px solid #e2e8f0;
            align-items: center;
        }

        .filter-group {
            position: relative;
            flex: 1;
            min-width: 140px;
        }

        .search-group { flex: 2; min-width: 200px; }
        .date-group   { min-width: 140px; }

        .filter-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: #94a3b8;
            font-size: 13px;
            pointer-events: none;
            z-index: 1;
        }

        .filter-input,
        .filter-select {
            width: 100%;
            padding: 9px 12px 9px 36px;
            border: 1.5px solid #e2e8f0;
            border-radius: 10px;
            background: #f8fafc;
            font-size: 13px;
            font-family: inherit;
            color: #334155;
            transition: all 0.2s ease;
            box-sizing: border-box;
            appearance: none;
        }

        .filter-input:focus,
        .filter-select:focus {
            outline: none;
            border-color: #3b82f6;
            background: white;
            box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
        }

        .filter-input::placeholder { color: #94a3b8; }

        .filter-actions {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
        }

        .filter-btn {
            padding: 9px 18px;
            border: none;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        }

        .apply-btn {
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: white;
            box-shadow: 0 2px 8px rgba(59,130,246,0.35);
        }

        .apply-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 16px rgba(59,130,246,0.45);
        }

        .reset-btn {
            background: #f1f5f9;
            color: #475569;
            border: 1.5px solid #e2e8f0;
        }

        .reset-btn:hover {
            background: #e2e8f0;
            color: #1e293b;
        }

        /* ===== LOADING STATE ===== */
        .log-loading-state {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 80px 60px;
            gap: 20px;
            color: #64748b;
            font-size: 14px;
            font-weight: 500;
        }

        .loading-spinner {
            position: relative;
            width: 50px;
            height: 50px;
        }

        .spinner-ring {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 3px solid transparent;
            animation: spinner-rotate 1.2s linear infinite;
        }

        .spinner-ring:nth-child(1) { border-top-color: #3b82f6; animation-duration: 1.2s; }
        .spinner-ring:nth-child(2) { border-right-color: #8b5cf6; animation-duration: 1.8s; inset: 8px; }
        .spinner-ring:nth-child(3) { border-bottom-color: #10b981; animation-duration: 2.4s; inset: 16px; }

        @keyframes spinner-rotate { to { transform: rotate(360deg); } }

        .error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            color: #ef4444;
            font-size: 14px;
        }

        .error-state i { font-size: 36px; opacity: 0.8; }

        /* ===== TABLE ===== */
        .table-wrapper {
            background: white;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06);
            border: 1px solid #e2e8f0;
        }

        .log-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .log-table thead tr {
            background: linear-gradient(to right, #f8fafc, #f1f5f9);
        }

        .log-table th {
            padding: 13px 16px;
            text-align: left;
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            border-bottom: 1.5px solid #e2e8f0;
            white-space: nowrap;
        }

        .log-table th i { margin-right: 6px; color: #94a3b8; }

        .log-table tbody tr {
            transition: background 0.15s ease;
            animation: rowFadeIn 0.3s ease both;
            border-bottom: 1px solid #f1f5f9;
        }

        @keyframes rowFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        .log-table tbody tr:last-child { border-bottom: none; }
        .log-table tbody tr:hover { background: #f8faff; }

        .log-table td {
            padding: 12px 16px;
            vertical-align: middle;
        }

        /* Time cell */
        .time-cell {
            white-space: nowrap;
        }

        .date-part {
            display: block;
            font-weight: 600;
            color: #334155;
            font-size: 13px;
        }

        .time-part {
            display: block;
            font-size: 11px;
            color: #94a3b8;
            margin-top: 2px;
            font-variant-numeric: tabular-nums;
        }

        /* User cell */
        .user-cell {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .user-avatar {
            width: 34px;
            height: 34px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 700;
            color: white;
            flex-shrink: 0;
        }

        .user-info strong {
            display: block;
            font-weight: 600;
            color: #1e293b;
            font-size: 13px;
        }

        .user-info small {
            font-size: 11px;
            color: #94a3b8;
            font-weight: 500;
            text-transform: capitalize;
        }

        /* Badge */
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 5px 11px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.2px;
            white-space: nowrap;
        }

        .badge-login   { background: #dcfce7; color: #15803d; }
        .badge-create  { background: #dbeafe; color: #1d4ed8; }
        .badge-update  { background: #fef3c7; color: #b45309; }
        .badge-delete  { background: #fee2e2; color: #b91c1c; }
        .badge-default { background: #f1f5f9; color: #475569; }

        /* Detail cell */
        .log-detail-cell {
            max-width: 320px;
            cursor: default;
        }

        .detail-text {
            display: block;
            color: #475569;
            line-height: 1.5;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .log-detail-cell:hover .detail-text {
            white-space: normal;
            overflow: visible;
        }

        /* IP badge */
        .ip-cell { white-space: nowrap; }

        .ip-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            color: #64748b;
            background: #f1f5f9;
            padding: 4px 10px;
            border-radius: 6px;
            font-variant-numeric: tabular-nums;
        }

        .ip-badge i { font-size: 10px; color: #94a3b8; }

        /* Empty state */
        .empty-state { padding: 60px 20px !important; }

        .empty-state-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            color: #94a3b8;
        }

        .empty-state-content i { font-size: 42px; opacity: 0.5; }
        .empty-state-content p  { font-size: 14px; margin: 0; font-weight: 500; }

        /* ===== PAGINATION ===== */
        .log-pagination {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 16px;
            margin-top: 20px;
            padding: 14px 20px;
            background: white;
            border-radius: 14px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            border: 1px solid #e2e8f0;
        }

        .page-btn {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 8px 18px;
            border: 1.5px solid #e2e8f0;
            background: white;
            border-radius: 10px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            font-family: inherit;
            color: #475569;
            transition: all 0.2s ease;
        }

        .page-btn:hover:not(:disabled) {
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: white;
            border-color: #3b82f6;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(59,130,246,0.3);
        }

        .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .page-info-wrap {
            background: #f8fafc;
            border: 1.5px solid #e2e8f0;
            border-radius: 10px;
            padding: 7px 18px;
        }

        #pageInfo {
            font-size: 13px;
            font-weight: 600;
            color: #475569;
        }

        /* ===== NOTIFICATION TOAST ===== */
        .activity-log-notification {
            position: fixed;
            bottom: 24px;
            right: 24px;
            color: white;
            padding: 12px 20px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 10001;
            opacity: 0;
            transform: translateX(calc(100% + 24px));
            transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 600;
            max-width: 360px;
            min-width: 200px;
        }

        .activity-log-notification.show {
            opacity: 1;
            transform: translateX(0);
        }

        .notif-success { background: linear-gradient(135deg, #10b981, #059669); }
        .notif-error   { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .notif-info    { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
        .notif-warning { background: linear-gradient(135deg, #f59e0b, #d97706); }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 768px) {
            .log-stats-summary { grid-template-columns: repeat(2, 1fr); gap: 12px; }
            .log-filter-bar { flex-direction: column; }
            .filter-group { min-width: 100%; }
            .filter-actions { width: 100%; }
            .filter-btn { flex: 1; justify-content: center; }
            .modal-action-btn span { display: none; }
            .modal-header-title h3 { font-size: 15px; }
            .log-table th, .log-table td { padding: 10px 12px; font-size: 12px; }
            .user-avatar { width: 28px; height: 28px; font-size: 11px; }
            .stat-value { font-size: 22px; }
            .activity-log-modal-content { border-radius: 16px; height: 95vh; }
        }

        @media (max-width: 480px) {
            .log-stats-summary { grid-template-columns: 1fr 1fr; gap: 10px; }
            .modal-header { padding: 14px 16px; }
            .modal-body { padding: 14px; }
            .admin-badge { display: none; }
        }

        /* ===== DARK MODE ===== */
        /* Deteksi dark mode dari class pada html/body (paling umum dipakai) */
        html.dark .activity-log-modal-content,
        body.dark .activity-log-modal-content,
        html[data-theme="dark"] .activity-log-modal-content,
        body[data-theme="dark"] .activity-log-modal-content,
        .dark-mode .activity-log-modal-content,
        .dark .activity-log-modal-content {
            background: #0f172a;
            box-shadow:
                0 0 0 1px rgba(255,255,255,0.06),
                0 32px 80px rgba(0,0,0,0.6),
                0 8px 24px rgba(0,0,0,0.4);
        }

        /* Body modal */
        html.dark .modal-body,
        body.dark .modal-body,
        html[data-theme="dark"] .modal-body,
        body[data-theme="dark"] .modal-body,
        .dark-mode .modal-body,
        .dark .modal-body {
            background: #0f172a;
        }

        /* Stat cards */
        html.dark .stat-card,
        body.dark .stat-card,
        html[data-theme="dark"] .stat-card,
        body[data-theme="dark"] .stat-card,
        .dark-mode .stat-card,
        .dark .stat-card {
            background: #1e293b;
            border-color: rgba(255,255,255,0.06);
            box-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2);
        }

        html.dark .stat-value,
        body.dark .stat-value,
        html[data-theme="dark"] .stat-value,
        body[data-theme="dark"] .stat-value,
        .dark-mode .stat-value,
        .dark .stat-value { color: #f1f5f9; }

        html.dark .stat-label,
        body.dark .stat-label,
        html[data-theme="dark"] .stat-label,
        body[data-theme="dark"] .stat-label,
        .dark-mode .stat-label,
        .dark .stat-label { color: #64748b; }

        /* Filter bar */
        html.dark .log-filter-bar,
        body.dark .log-filter-bar,
        html[data-theme="dark"] .log-filter-bar,
        body[data-theme="dark"] .log-filter-bar,
        .dark-mode .log-filter-bar,
        .dark .log-filter-bar {
            background: #1e293b;
            border-color: rgba(255,255,255,0.06);
        }

        html.dark .filter-input,
        html.dark .filter-select,
        body.dark .filter-input,
        body.dark .filter-select,
        html[data-theme="dark"] .filter-input,
        html[data-theme="dark"] .filter-select,
        body[data-theme="dark"] .filter-input,
        body[data-theme="dark"] .filter-select,
        .dark-mode .filter-input,
        .dark-mode .filter-select,
        .dark .filter-input,
        .dark .filter-select {
            background: #0f172a;
            border-color: rgba(255,255,255,0.1);
            color: #e2e8f0;
        }

        html.dark .filter-input:focus,
        html.dark .filter-select:focus,
        body.dark .filter-input:focus,
        body.dark .filter-select:focus,
        html[data-theme="dark"] .filter-input:focus,
        html[data-theme="dark"] .filter-select:focus,
        body[data-theme="dark"] .filter-input:focus,
        body[data-theme="dark"] .filter-select:focus,
        .dark-mode .filter-input:focus,
        .dark-mode .filter-select:focus,
        .dark .filter-input:focus,
        .dark .filter-select:focus {
            background: #1e293b;
            border-color: #3b82f6;
        }

        html.dark .filter-input::placeholder,
        body.dark .filter-input::placeholder,
        html[data-theme="dark"] .filter-input::placeholder,
        body[data-theme="dark"] .filter-input::placeholder,
        .dark-mode .filter-input::placeholder,
        .dark .filter-input::placeholder { color: #475569; }

        html.dark .filter-icon,
        body.dark .filter-icon,
        html[data-theme="dark"] .filter-icon,
        body[data-theme="dark"] .filter-icon,
        .dark-mode .filter-icon,
        .dark .filter-icon { color: #475569; }

        html.dark .reset-btn,
        body.dark .reset-btn,
        html[data-theme="dark"] .reset-btn,
        body[data-theme="dark"] .reset-btn,
        .dark-mode .reset-btn,
        .dark .reset-btn {
            background: #0f172a;
            color: #94a3b8;
            border-color: rgba(255,255,255,0.1);
        }

        html.dark .reset-btn:hover,
        body.dark .reset-btn:hover,
        html[data-theme="dark"] .reset-btn:hover,
        body[data-theme="dark"] .reset-btn:hover,
        .dark-mode .reset-btn:hover,
        .dark .reset-btn:hover {
            background: #1e293b;
            color: #e2e8f0;
        }

        /* Table */
        html.dark .table-wrapper,
        body.dark .table-wrapper,
        html[data-theme="dark"] .table-wrapper,
        body[data-theme="dark"] .table-wrapper,
        .dark-mode .table-wrapper,
        .dark .table-wrapper {
            background: #1e293b;
            border-color: rgba(255,255,255,0.06);
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }

        html.dark .log-table thead tr,
        body.dark .log-table thead tr,
        html[data-theme="dark"] .log-table thead tr,
        body[data-theme="dark"] .log-table thead tr,
        .dark-mode .log-table thead tr,
        .dark .log-table thead tr {
            background: linear-gradient(to right, #0f172a, #1a2540);
        }

        html.dark .log-table th,
        body.dark .log-table th,
        html[data-theme="dark"] .log-table th,
        body[data-theme="dark"] .log-table th,
        .dark-mode .log-table th,
        .dark .log-table th {
            color: #475569;
            border-bottom-color: rgba(255,255,255,0.06);
        }

        html.dark .log-table th i,
        body.dark .log-table th i,
        html[data-theme="dark"] .log-table th i,
        body[data-theme="dark"] .log-table th i,
        .dark-mode .log-table th i,
        .dark .log-table th i { color: #334155; }

        html.dark .log-table tbody tr,
        body.dark .log-table tbody tr,
        html[data-theme="dark"] .log-table tbody tr,
        body[data-theme="dark"] .log-table tbody tr,
        .dark-mode .log-table tbody tr,
        .dark .log-table tbody tr { border-bottom-color: rgba(255,255,255,0.04); }

        html.dark .log-table tbody tr:hover,
        body.dark .log-table tbody tr:hover,
        html[data-theme="dark"] .log-table tbody tr:hover,
        body[data-theme="dark"] .log-table tbody tr:hover,
        .dark-mode .log-table tbody tr:hover,
        .dark .log-table tbody tr:hover { background: rgba(59,130,246,0.06); }

        html.dark .date-part,
        body.dark .date-part,
        html[data-theme="dark"] .date-part,
        body[data-theme="dark"] .date-part,
        .dark-mode .date-part,
        .dark .date-part { color: #cbd5e1; }

        html.dark .time-part,
        body.dark .time-part,
        html[data-theme="dark"] .time-part,
        body[data-theme="dark"] .time-part,
        .dark-mode .time-part,
        .dark .time-part { color: #475569; }

        html.dark .user-info strong,
        body.dark .user-info strong,
        html[data-theme="dark"] .user-info strong,
        body[data-theme="dark"] .user-info strong,
        .dark-mode .user-info strong,
        .dark .user-info strong { color: #e2e8f0; }

        html.dark .user-info small,
        body.dark .user-info small,
        html[data-theme="dark"] .user-info small,
        body[data-theme="dark"] .user-info small,
        .dark-mode .user-info small,
        .dark .user-info small { color: #475569; }

        html.dark .detail-text,
        body.dark .detail-text,
        html[data-theme="dark"] .detail-text,
        body[data-theme="dark"] .detail-text,
        .dark-mode .detail-text,
        .dark .detail-text { color: #64748b; }

        html.dark .ip-badge,
        body.dark .ip-badge,
        html[data-theme="dark"] .ip-badge,
        body[data-theme="dark"] .ip-badge,
        .dark-mode .ip-badge,
        .dark .ip-badge {
            background: #0f172a;
            color: #64748b;
        }

        /* Badge aktivitas - warna lebih gelap agar kontras */
        html.dark .badge-login,
        body.dark .badge-login,
        html[data-theme="dark"] .badge-login,
        body[data-theme="dark"] .badge-login,
        .dark-mode .badge-login,
        .dark .badge-login  { background: rgba(16,185,129,0.15); color: #34d399; }

        html.dark .badge-create,
        body.dark .badge-create,
        html[data-theme="dark"] .badge-create,
        body[data-theme="dark"] .badge-create,
        .dark-mode .badge-create,
        .dark .badge-create { background: rgba(59,130,246,0.15); color: #60a5fa; }

        html.dark .badge-update,
        body.dark .badge-update,
        html[data-theme="dark"] .badge-update,
        body[data-theme="dark"] .badge-update,
        .dark-mode .badge-update,
        .dark .badge-update { background: rgba(245,158,11,0.15); color: #fbbf24; }

        html.dark .badge-delete,
        body.dark .badge-delete,
        html[data-theme="dark"] .badge-delete,
        body[data-theme="dark"] .badge-delete,
        .dark-mode .badge-delete,
        .dark .badge-delete { background: rgba(239,68,68,0.15); color: #f87171; }

        html.dark .badge-default,
        body.dark .badge-default,
        html[data-theme="dark"] .badge-default,
        body[data-theme="dark"] .badge-default,
        .dark-mode .badge-default,
        .dark .badge-default { background: rgba(255,255,255,0.08); color: #94a3b8; }

        /* Pagination */
        html.dark .log-pagination,
        body.dark .log-pagination,
        html[data-theme="dark"] .log-pagination,
        body[data-theme="dark"] .log-pagination,
        .dark-mode .log-pagination,
        .dark .log-pagination {
            background: #1e293b;
            border-color: rgba(255,255,255,0.06);
        }

        html.dark .page-btn,
        body.dark .page-btn,
        html[data-theme="dark"] .page-btn,
        body[data-theme="dark"] .page-btn,
        .dark-mode .page-btn,
        .dark .page-btn {
            background: #0f172a;
            border-color: rgba(255,255,255,0.08);
            color: #64748b;
        }

        html.dark .page-btn:hover:not(:disabled),
        body.dark .page-btn:hover:not(:disabled),
        html[data-theme="dark"] .page-btn:hover:not(:disabled),
        body[data-theme="dark"] .page-btn:hover:not(:disabled),
        .dark-mode .page-btn:hover:not(:disabled),
        .dark .page-btn:hover:not(:disabled) {
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: white;
            border-color: #3b82f6;
        }

        html.dark .page-info-wrap,
        body.dark .page-info-wrap,
        html[data-theme="dark"] .page-info-wrap,
        body[data-theme="dark"] .page-info-wrap,
        .dark-mode .page-info-wrap,
        .dark .page-info-wrap {
            background: #0f172a;
            border-color: rgba(255,255,255,0.08);
        }

        html.dark #pageInfo,
        body.dark #pageInfo,
        html[data-theme="dark"] #pageInfo,
        body[data-theme="dark"] #pageInfo,
        .dark-mode #pageInfo,
        .dark #pageInfo { color: #64748b; }

        /* Loading & empty state */
        html.dark .log-loading-state,
        body.dark .log-loading-state,
        html[data-theme="dark"] .log-loading-state,
        body[data-theme="dark"] .log-loading-state,
        .dark-mode .log-loading-state,
        .dark .log-loading-state { color: #475569; }

        html.dark .empty-state-content,
        body.dark .empty-state-content,
        html[data-theme="dark"] .empty-state-content,
        body[data-theme="dark"] .empty-state-content,
        .dark-mode .empty-state-content,
        .dark .empty-state-content { color: #334155; }

        /* ===== DARK MODE via JS-injected class (universal fallback) ===== */
        .al-dark .activity-log-modal-content,
        .al-dark-content {
            background: #0f172a !important;
            box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 32px 80px rgba(0,0,0,0.6) !important;
        }

        .al-dark .modal-body { background: #0f172a !important; }

        .al-dark .stat-card {
            background: #1e293b !important;
            border-color: rgba(255,255,255,0.06) !important;
        }
        .al-dark .stat-value { color: #f1f5f9 !important; }
        .al-dark .stat-label { color: #64748b !important; }

        .al-dark .log-filter-bar {
            background: #1e293b !important;
            border-color: rgba(255,255,255,0.06) !important;
        }
        .al-dark .filter-input,
        .al-dark .filter-select {
            background: #0f172a !important;
            border-color: rgba(255,255,255,0.1) !important;
            color: #e2e8f0 !important;
        }
        .al-dark .filter-input:focus,
        .al-dark .filter-select:focus { background: #1e293b !important; }
        .al-dark .filter-input::placeholder { color: #475569 !important; }
        .al-dark .filter-icon { color: #475569 !important; }
        .al-dark .reset-btn {
            background: #0f172a !important;
            color: #94a3b8 !important;
            border-color: rgba(255,255,255,0.1) !important;
        }
        .al-dark .reset-btn:hover { background: #1e293b !important; color: #e2e8f0 !important; }

        .al-dark .table-wrapper {
            background: #1e293b !important;
            border-color: rgba(255,255,255,0.06) !important;
        }
        .al-dark .log-table thead tr { background: linear-gradient(to right, #0f172a, #1a2540) !important; }
        .al-dark .log-table th { color: #475569 !important; border-bottom-color: rgba(255,255,255,0.06) !important; }
        .al-dark .log-table th i { color: #334155 !important; }
        .al-dark .log-table tbody tr { border-bottom-color: rgba(255,255,255,0.04) !important; }
        .al-dark .log-table tbody tr:hover { background: rgba(59,130,246,0.06) !important; }

        .al-dark .date-part { color: #cbd5e1 !important; }
        .al-dark .time-part { color: #475569 !important; }
        .al-dark .user-info strong { color: #e2e8f0 !important; }
        .al-dark .user-info small { color: #475569 !important; }
        .al-dark .detail-text { color: #64748b !important; }
        .al-dark .ip-badge { background: #0f172a !important; color: #64748b !important; }

        .al-dark .badge-login  { background: rgba(16,185,129,0.15) !important; color: #34d399 !important; }
        .al-dark .badge-create { background: rgba(59,130,246,0.15) !important; color: #60a5fa !important; }
        .al-dark .badge-update { background: rgba(245,158,11,0.15) !important; color: #fbbf24 !important; }
        .al-dark .badge-delete { background: rgba(239,68,68,0.15) !important; color: #f87171 !important; }
        .al-dark .badge-default { background: rgba(255,255,255,0.08) !important; color: #94a3b8 !important; }

        .al-dark .log-pagination {
            background: #1e293b !important;
            border-color: rgba(255,255,255,0.06) !important;
        }
        .al-dark .page-btn {
            background: #0f172a !important;
            border-color: rgba(255,255,255,0.08) !important;
            color: #64748b !important;
        }
        .al-dark .page-btn:hover:not(:disabled) {
            background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
            color: white !important;
        }
        .al-dark .page-info-wrap {
            background: #0f172a !important;
            border-color: rgba(255,255,255,0.08) !important;
        }
        .al-dark #pageInfo { color: #64748b !important; }
        .al-dark .log-loading-state { color: #475569 !important; }
        .al-dark .empty-state-content { color: #334155 !important; }

        /* ===== DETEKSI SISTEM (prefers-color-scheme) ===== */
        @media (prefers-color-scheme: dark) {
            .activity-log-modal-content { background: #0f172a; }
            .modal-body { background: #0f172a; }
            .stat-card { background: #1e293b; border-color: rgba(255,255,255,0.06); }
            .stat-value { color: #f1f5f9; }
            .stat-label { color: #64748b; }
            .log-filter-bar { background: #1e293b; border-color: rgba(255,255,255,0.06); }
            .filter-input, .filter-select { background: #0f172a; border-color: rgba(255,255,255,0.1); color: #e2e8f0; }
            .filter-input:focus, .filter-select:focus { background: #1e293b; }
            .filter-input::placeholder { color: #475569; }
            .filter-icon { color: #475569; }
            .reset-btn { background: #0f172a; color: #94a3b8; border-color: rgba(255,255,255,0.1); }
            .table-wrapper { background: #1e293b; border-color: rgba(255,255,255,0.06); }
            .log-table thead tr { background: linear-gradient(to right, #0f172a, #1a2540); }
            .log-table th { color: #475569; border-bottom-color: rgba(255,255,255,0.06); }
            .log-table tbody tr { border-bottom-color: rgba(255,255,255,0.04); }
            .log-table tbody tr:hover { background: rgba(59,130,246,0.06); }
            .date-part { color: #cbd5e1; }
            .time-part { color: #475569; }
            .user-info strong { color: #e2e8f0; }
            .user-info small { color: #475569; }
            .detail-text { color: #64748b; }
            .ip-badge { background: #0f172a; color: #64748b; }
            .badge-login  { background: rgba(16,185,129,0.15); color: #34d399; }
            .badge-create { background: rgba(59,130,246,0.15); color: #60a5fa; }
            .badge-update { background: rgba(245,158,11,0.15); color: #fbbf24; }
            .badge-delete { background: rgba(239,68,68,0.15); color: #f87171; }
            .log-pagination { background: #1e293b; border-color: rgba(255,255,255,0.06); }
            .page-btn { background: #0f172a; border-color: rgba(255,255,255,0.08); color: #64748b; }
            .page-info-wrap { background: #0f172a; border-color: rgba(255,255,255,0.08); }
            #pageInfo { color: #64748b; }
            .log-loading-state { color: #475569; }
            .empty-state-content { color: #334155; }
        }
    `;
    
    document.head.appendChild(style);
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    addActivityLogStyles();
    
    const checkFirebase = setInterval(() => {
        if (typeof firebase !== 'undefined' && firebase.firestore && firebase.auth) {
            clearInterval(checkFirebase);
            window.activityLog = new ActivityLogSystem();
            console.log('[ActivityLog] System ready - Super Admin only');
        }
    }, 500);
});

// ========== DARK MODE AUTO-SYNC ==========
// Mendeteksi dark mode dari berbagai sumber dan menyinkronkan ke modal
function syncActivityLogDarkMode() {
    const modal = document.getElementById('activityLogModal');
    if (!modal) return;

    const html = document.documentElement;
    const body = document.body;

    const isDark = 
        html.classList.contains('dark') ||
        body.classList.contains('dark') ||
        html.classList.contains('dark-mode') ||
        body.classList.contains('dark-mode') ||
        html.getAttribute('data-theme') === 'dark' ||
        body.getAttribute('data-theme') === 'dark' ||
        html.getAttribute('data-bs-theme') === 'dark' ||
        body.getAttribute('data-bs-theme') === 'dark' ||
        (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
        modal.classList.add('al-dark');
        modal.querySelector('.activity-log-modal-content')?.classList.add('al-dark-content');
    } else {
        modal.classList.remove('al-dark');
        modal.querySelector('.activity-log-modal-content')?.classList.remove('al-dark-content');
    }
}

// Observer untuk mendeteksi perubahan dark mode secara real-time
const _alDarkObserver = new MutationObserver(() => {
    syncActivityLogDarkMode();
});

_alDarkObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-bs-theme']
});

_alDarkObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-bs-theme']
});

// Sinkronisasi saat modal dibuka
const _alOrigOpenModal = ActivityLogSystem.prototype.openActivityLogModal;
ActivityLogSystem.prototype.openActivityLogModal = function() {
    _alOrigOpenModal.call(this);
    setTimeout(syncActivityLogDarkMode, 50);
};

window.ActivityLogSystem = ActivityLogSystem;
window.logActivity = logActivity;
window.logCreate = logCreate;
window.logUpdate = logUpdate;
window.logDelete = logDelete;
