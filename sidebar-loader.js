// sidebar-loader.js - WITH IMPROVED MOBILE RESPONSIVENESS & SEPARATED CHAT AGENT MENU

class SidebarLoader {
    constructor() {
    this.sidebarContainer = document.getElementById('sidebar-container');
    
    // Sistem terjemahan yang lebih lengkap untuk semua menu
    this.translations = this.createFullTranslationSystem();
    
    this.currentLanguage = localStorage.getItem('language') || 'id';
    this.currentUserRole = 'user';
    this.currentUserId = null;
    this.userData = null;
    this.isInitialized = false;
    
    this.debug = localStorage.getItem('debugMode') === 'true';
    this.eventListeners = [];
    
    // Untuk menyimpan unsubscribe listener chat unread
    this.chatUnreadUnsubscribe = null;
    
    this.log('SidebarLoader initialized');
}

    // ========== COMPLETE TRANSLATION SYSTEM ==========
    createFullTranslationSystem() {
        return {
            id: {
                dashboardTitle: "CSS Dashboard",
                categories: {
                    reports: "Laporan",
                    maintenance: "Pemeliharaan",
                    performance: "Kinerja",
                    admin: "Administrator",
                    chatServices: "Layanan Chat"  // Kategori baru untuk Chat Agent
                },
                menuItems: {
                    dashboardOverview: "Dashboard Overview",
                    reportsMenu: "Laporan",
                    pendingReports: "Laporan Tertunda",
                    solvedReports: "Laporan Selesai",
                    ideasAgent: "Ide Saran Agent",
                    maintenanceMenu: "Pemeliharaan",
                    pendingMaintenance: "Pemeliharaan Tertunda",
                    completedMaintenance: "Pemeliharaan Selesai",
                    releases: "Rilis",
                    newFeatures: "Fitur Baru",
                    newGames: "Game Baru",
                    kpiPoints: "KPI Points",
                    kpiCss: "KPI CSS",
                    kpiHistory: "History KPI",
                    ideasSuggestions: "Ide & Saran",
                    research: "Riset",
                    chatResponse: "Respon Chat",
                    chatAgent: "Chat Agent",   // Menu utama Chat Agent
                    staffAccount: "Akun Staff",
                    topUpCredit: "Top Up Kredit",
                    eventProvider: "Penyedia Event",
                    settings: "Pengaturan",
                    logout: "Keluar",
                    darkMode: "Mode Gelap",
                    lightMode: "Mode Terang"
                }
            },
            en: {
                dashboardTitle: "CSS Dashboard",
                categories: {
                    reports: "Reports",
                    maintenance: "Maintenance",
                    performance: "Performance",
                    admin: "Administrator",
                    chatServices: "Chat Services"
                },
                menuItems: {
                    dashboardOverview: "Dashboard Overview",
                    reportsMenu: "Reports",
                    pendingReports: "Pending Reports",
                    solvedReports: "Solved Reports",
                    ideasAgent: "Ideas & Suggestions Agent",
                    maintenanceMenu: "Maintenance",
                    pendingMaintenance: "Pending Maintenance",
                    completedMaintenance: "Completed Maintenance",
                    releases: "Releases",
                    newFeatures: "New Features",
                    newGames: "New Games",
                    kpiPoints: "KPI Points",
                    kpiCss: "KPI CSS",
                    kpiHistory: "KPI History",
                    ideasSuggestions: "Ideas & Suggestions",
                    research: "Research",
                    chatResponse: "Chat Response",
                    chatAgent: "Chat Agent",
                    staffAccount: "Staff Account",
                    topUpCredit: "Top Up Credit",
                    eventProvider: "Event Provider",
                    settings: "Settings",
                    logout: "Logout",
                    darkMode: "Dark Mode",
                    lightMode: "Light Mode"
                }
            },
            ja: {
                dashboardTitle: "CSS ダッシュボード",
                categories: {
                    reports: "レポート",
                    maintenance: "メンテナンス",
                    performance: "パフォーマンス",
                    admin: "管理者",
                    chatServices: "チャットサービス"
                },
                menuItems: {
                    dashboardOverview: "ダッシュボード概要",
                    reportsMenu: "レポート",
                    pendingReports: "保留中のレポート",
                    solvedReports: "解決済みレポート",
                    ideasAgent: "アイデアと提案エージェント",
                    maintenanceMenu: "メンテナンス",
                    pendingMaintenance: "保留中のメンテナンス",
                    completedMaintenance: "完了済みメンテナンス",
                    releases: "リリース",
                    newFeatures: "新機能",
                    newGames: "新ゲーム",
                    kpiPoints: "KPIポイント",
                    kpiCss: "KPI CSS",
                    kpiHistory: "KPI履歴",
                    ideasSuggestions: "アイデアと提案",
                    research: "リサーチ",
                    chatResponse: "チャット応答",
                    chatAgent: "チャットエージェント",
                    staffAccount: "スタッフアカウント",
                    topUpCredit: "クレジットチャージ",
                    eventProvider: "イベントプロバイダー",
                    settings: "設定",
                    logout: "ログアウト",
                    darkMode: "ダークモード",
                    lightMode: "ライトモード"
                }
            },
            zh: {
                dashboardTitle: "CSS 仪表板",
                categories: {
                    reports: "报告",
                    maintenance: "维护",
                    performance: "性能",
                    admin: "管理员",
                    chatServices: "聊天服务"
                },
                menuItems: {
                    dashboardOverview: "仪表板概览",
                    reportsMenu: "报告",
                    pendingReports: "待处理报告",
                    solvedReports: "已解决报告",
                    ideasAgent: "想法与建议代理",
                    maintenanceMenu: "维护",
                    pendingMaintenance: "待处理维护",
                    completedMaintenance: "已完成维护",
                    releases: "发布",
                    newFeatures: "新功能",
                    newGames: "新游戏",
                    kpiPoints: "KPI 积分",
                    kpiCss: "KPI CSS",
                    kpiHistory: "KPI历史",
                    ideasSuggestions: "想法与建议",
                    research: "研究",
                    chatResponse: "聊天回复",
                    chatAgent: "聊天客服",
                    staffAccount: "员工账户",
                    topUpCredit: "充值积分",
                    eventProvider: "活动提供商",
                    settings: "设置",
                    logout: "退出登录",
                    darkMode: "深色模式",
                    lightMode: "浅色模式"
                }
            }
        };
    }

    getTranslation(path) {
        const parts = path.split('.');
        let translation = this.translations[this.currentLanguage];
        
        for (const part of parts) {
            if (translation && translation[part] !== undefined) {
                translation = translation[part];
            } else {
                let fallbackTranslation = this.translations.id;
                for (const p of parts) {
                    if (fallbackTranslation && fallbackTranslation[p] !== undefined) {
                        fallbackTranslation = fallbackTranslation[p];
                    } else {
                        return path;
                    }
                }
                return fallbackTranslation;
            }
        }
        
        return translation || path;
    }

    getCategory(categoryKey) {
        return this.getTranslation(`categories.${categoryKey}`);
    }

    getMenuItem(itemKey) {
        return this.getTranslation(`menuItems.${itemKey}`);
    }

    log(message, data = null) {
        if (this.debug) {
            console.log(`[SidebarLoader] ${message}`, data || '');
        }
    }

    error(message, error = null) {
        console.error(`[SidebarLoader] ${message}`, error || '');
    }

    async initializeUserData() {
        try {
            const sessionUser = sessionStorage.getItem("user");
            const localStorageUser = localStorage.getItem("currentUser");
            const isLoggedIn = sessionStorage.getItem("isLoggedIn");
            
            if (isLoggedIn === "true" && (sessionUser || localStorageUser)) {
                const userData = JSON.parse(sessionUser || localStorageUser);
                this.currentUserRole = userData.role || 'user';
                this.currentUserId = userData.uid;
                this.userData = userData;
                
                this.log('User data loaded from storage', {
                    role: this.currentUserRole,
                    userId: this.currentUserId
                });
                
                return userData;
            }
            
            this.log('No user data found, redirecting to login');
            window.location.href = 'index.html';
            return null;
            
        } catch (error) {
            this.error('Error initializing user data:', error);
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
            return null;
        }
    }

    applyTranslations() {
        try {
            const logoText = document.querySelector('.logo-text');
            if (logoText) {
                logoText.textContent = this.getTranslation('dashboardTitle');
            }

            const categories = document.querySelectorAll('.menu-category');
            if (categories.length >= 1) categories[0].textContent = this.getCategory('reports');
            if (categories.length >= 2) categories[1].textContent = this.getCategory('maintenance');
            if (categories.length >= 3) categories[2].textContent = this.getCategory('performance');
            if (categories.length >= 4) categories[3].textContent = this.getCategory('chatServices'); // Kategori Chat Services
            if (categories.length >= 5) categories[4] && (categories[4].textContent = this.getCategory('admin'));

            // Update semua menu item (sama seperti sebelumnya, tapi tambahkan untuk chatAgent)
            const dashboardItem = document.querySelector('.menu-item[data-page="summary-dashboard.html"] .menu-text');
            if (dashboardItem) dashboardItem.textContent = this.getMenuItem('dashboardOverview');
            
            const reportsSubmenu = document.querySelector('.has-submenu:has(+ .submenu .menu-item[data-page="pending-reports.html"]) .menu-text');
            if (reportsSubmenu) reportsSubmenu.textContent = this.getMenuItem('reportsMenu');
            
            const pendingReports = document.querySelector('.menu-item[data-page="pending-reports.html"] .menu-text');
            if (pendingReports) pendingReports.textContent = this.getMenuItem('pendingReports');
            
            const solvedReports = document.querySelector('.menu-item[data-page="solved-report.html"] .menu-text');
            if (solvedReports) solvedReports.textContent = this.getMenuItem('solvedReports');

            const ideasAgent = document.querySelector('.menu-item[data-page="idesaran-agent.html"] .menu-text');
            if (ideasAgent) ideasAgent.textContent = this.getMenuItem('ideasAgent');
            
            const maintenanceSubmenu = document.querySelector('.has-submenu:has(+ .submenu .menu-item[data-page="maintenance.html"]) .menu-text');
            if (maintenanceSubmenu) maintenanceSubmenu.textContent = this.getMenuItem('maintenanceMenu');
            
            const pendingMaintenance = document.querySelector('.menu-item[data-page="maintenance.html"] .menu-text');
            if (pendingMaintenance) pendingMaintenance.textContent = this.getMenuItem('pendingMaintenance');
            
            const completedMaintenance = document.querySelector('.menu-item[data-page="completed-report.html"] .menu-text');
            if (completedMaintenance) completedMaintenance.textContent = this.getMenuItem('completedMaintenance');
            
            const releasesSubmenu = document.querySelector('.has-submenu:has(+ .submenu .menu-item[data-page="releases-newfeature.html"]) .menu-text');
            if (releasesSubmenu) releasesSubmenu.textContent = this.getMenuItem('releases');
            
            const newFeatures = document.querySelector('.menu-item[data-page="releases-newfeature.html"] .menu-text');
            if (newFeatures) newFeatures.textContent = this.getMenuItem('newFeatures');
            
            const newGames = document.querySelector('.menu-item[data-page="releases-newgame.html"] .menu-text');
            if (newGames) newGames.textContent = this.getMenuItem('newGames');
            
            const kpiSubmenu = document.querySelector('.has-submenu:has(+ .submenu .menu-item[data-page="kpi-css.html"]) .menu-text');
            if (kpiSubmenu) kpiSubmenu.textContent = this.getMenuItem('kpiPoints');
            
            const kpiCss = document.querySelector('.menu-item[data-page="kpi-css.html"] .menu-text');
            if (kpiCss) kpiCss.textContent = this.getMenuItem('kpiCss');
            
            const kpiHistory = document.querySelector('.menu-item[data-page="kpi-history.html"] .menu-text');
            if (kpiHistory) kpiHistory.textContent = this.getMenuItem('kpiHistory');
            
            const ideas = document.querySelector('.menu-item[data-page="ide-saran.html"] .menu-text');
            if (ideas) ideas.textContent = this.getMenuItem('ideasSuggestions');
            
            const research = document.querySelector('.menu-item[data-page="research.html"] .menu-text');
            if (research) research.textContent = this.getMenuItem('research');
            
            const chatResponse = document.querySelector('.menu-item[data-page="chat-response.html"] .menu-text');
            if (chatResponse) chatResponse.textContent = this.getMenuItem('chatResponse');

            const chatAgent = document.querySelector('.menu-item[data-page="chat-agent.html"] .menu-text');
            if (chatAgent) chatAgent.textContent = this.getMenuItem('chatAgent');
            
            const staffAccount = document.querySelector('.menu-item[data-page="staff-account.html"] .menu-text');
            if (staffAccount) staffAccount.textContent = this.getMenuItem('staffAccount');
            
            const topUpCredit = document.querySelector('.menu-item[data-page="topup-credit.html"] .menu-text');
            if (topUpCredit) topUpCredit.textContent = this.getMenuItem('topUpCredit');
            
            const eventProvider = document.querySelector('.menu-item[data-page="eventprovider.html"] .menu-text');
            if (eventProvider) eventProvider.textContent = this.getMenuItem('eventProvider');
            
            const settings = document.querySelector('.menu-item[data-page="pengaturan.html"] .menu-text');
            if (settings) settings.textContent = this.getMenuItem('settings');
            
            const logout = document.querySelector('.logout-btn .menu-text');
            if (logout) logout.textContent = this.getMenuItem('logout');

            this.updateThemeText();

        } catch (error) {
            this.error('Error applying translations:', error);
        }
    }

    updateThemeText() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const themeText = themeToggle.querySelector('.menu-text');
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            
            if (themeText) {
                themeText.textContent = currentTheme === 'dark' ? 
                    this.getMenuItem('lightMode') : 
                    this.getMenuItem('darkMode');
            }
        }
    }

    injectStyles() {
        if (document.getElementById('sidebar-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'sidebar-styles';
        style.textContent = `
            :root {
                --primary-color: #4361ee;
                --secondary-color: #3f37c9;
                --accent-color: #4895ef;
                --text-color: #333;
                --text-light: #6c757d;
                --bg-color: #f8f9fa;
                --sidebar-bg: #ffffff;
                --sidebar-width: 280px;
                --border-radius: 8px;
                --transition-speed: 0.3s;
                --shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                --menu-item-height: 50px;
                --category-spacing: 20px;
            }

            [data-theme="dark"] {
                --primary-color: #4895ef;
                --secondary-color: #4361ee;
                --accent-color: #3f37c9;
                --text-color: #f8f9fa;
                --text-light: #adb5bd;
                --bg-color: #121212;
                --sidebar-bg: #1e1e1e;
                --shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
            }

            /* Mobile Menu Toggle Button - Improved */
            .menu-toggle {
                display: none;
                position: fixed;
                top: 16px;
                left: 16px;
                z-index: 1100;
                background: var(--primary-color);
                color: white;
                border: none;
                border-radius: 12px;
                width: 48px;
                height: 48px;
                cursor: pointer;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                padding: 0;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                transition: all 0.3s ease;
            }

            .menu-toggle:hover {
                transform: scale(1.05);
                background: var(--secondary-color);
            }

            .menu-toggle span {
                display: block;
                width: 24px;
                height: 2.5px;
                background-color: white;
                margin: 3px 0;
                transition: all 0.3s ease;
                border-radius: 2px;
            }

            .menu-toggle.active span:nth-child(1) {
                transform: rotate(45deg) translate(6px, 6px);
            }

            .menu-toggle.active span:nth-child(2) {
                opacity: 0;
                transform: scale(0.8);
            }

            .menu-toggle.active span:nth-child(3) {
                transform: rotate(-45deg) translate(6px, -6px);
            }

            /* Sidebar Container */
            .sidebar {
                position: fixed;
                top: 0;
                left: 0;
                height: 100vh;
                width: var(--sidebar-width);
                background: var(--sidebar-bg);
                box-shadow: var(--shadow);
                z-index: 1000;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                transition: transform var(--transition-speed) ease;
                scrollbar-width: thin;
            }

            .sidebar::-webkit-scrollbar {
                width: 6px;
            }

            .sidebar::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.05);
                border-radius: 3px;
            }

            .sidebar::-webkit-scrollbar-thumb {
                background: var(--primary-color);
                border-radius: 3px;
            }

            .sidebar-header {
                padding: 20px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                position: sticky;
                top: 0;
                background: var(--sidebar-bg);
                z-index: 10;
            }

            .logo-container {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .logo-image {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                object-fit: cover;
            }

            .logo-text {
                font-size: 18px;
                font-weight: 700;
                color: var(--text-color);
                margin: 0;
            }

            .sidebar-menu {
                flex: 1;
                padding: 15px;
                display: flex;
                flex-direction: column;
                gap: 5px;
            }

            .menu-category {
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: var(--text-light);
                margin-top: var(--category-spacing);
                margin-bottom: 8px;
                padding: 0 15px;
                font-weight: 600;
            }

            /* Pemisah visual antar grup menu */
            .menu-divider {
                height: 1px;
                background: rgba(0, 0, 0, 0.1);
                margin: 10px 15px;
            }
            [data-theme="dark"] .menu-divider {
                background: rgba(255, 255, 255, 0.1);
            }

            .menu-item {
                display: flex;
                align-items: center;
                min-height: var(--menu-item-height);
                padding: 0 15px;
                border-radius: var(--border-radius);
                color: var(--text-color);
                cursor: pointer;
                transition: all var(--transition-speed);
                text-decoration: none;
                gap: 12px;
            }

            .menu-item:hover {
                background-color: rgba(0, 0, 0, 0.05);
                transform: translateX(4px);
            }

            [data-theme="dark"] .menu-item:hover {
                background-color: rgba(255, 255, 255, 0.05);
            }

            .menu-item.active {
                background-color: var(--primary-color);
                color: white;
            }

            .menu-item.active .menu-icon {
                color: white;
            }

            .menu-icon {
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-light);
                transition: color var(--transition-speed);
                flex-shrink: 0;
            }

            .menu-item:hover .menu-icon {
                color: var(--primary-color);
            }

            .menu-item.active .menu-icon {
                color: white;
            }

            .menu-text {
                flex: 1;
                font-size: 14px;
                font-weight: 500;
                line-height: 1.4;
            }

            .submenu-indicator {
                transition: transform var(--transition-speed);
                margin-left: auto;
                flex-shrink: 0;
            }

            .has-submenu.active .submenu-indicator {
                transform: rotate(90deg);
            }

            .submenu {
                max-height: 0;
                overflow: hidden;
                transition: max-height var(--transition-speed) ease;
                padding-left: 20px;
            }

            .submenu.active {
                max-height: 500px;
            }

            .submenu .menu-item {
                min-height: 45px;
                padding-left: 40px;
            }

            .logout-btn {
                margin-top: 0;
                border-top: none;
                padding-top: 0;
            }

            .logout-btn .menu-icon {
                color: #e74c3c;
            }

            .logout-btn:hover {
                background-color: rgba(231, 76, 60, 0.1);
            }

            .theme-toggle-container {
                margin-top: auto;
                padding: 15px 0;
                border-top: 1px solid rgba(0, 0, 0, 0.1);
            }

            .theme-toggle {
                display: flex;
                align-items: center;
                width: 100%;
                padding: 12px 15px;
                background: transparent;
                border: none;
                border-radius: var(--border-radius);
                color: var(--text-color);
                cursor: pointer;
                transition: all var(--transition-speed);
                gap: 12px;
            }

            .theme-toggle:hover {
                background: rgba(0, 0, 0, 0.05);
                transform: translateX(4px);
            }

            .sidebar-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 999;
                display: none;
                backdrop-filter: blur(2px);
            }

            .sidebar-overlay.active {
                display: block;
            }

            /* Mobile Styles */
            @media (max-width: 768px) {
                .menu-toggle { display: flex; }
                body { padding-top: 0; }
                .main-content, .content-wrapper, .dashboard-container {
                    transition: margin-left var(--transition-speed) ease;
                    margin-left: 0;
                }
                .sidebar {
                    width: 85%;
                    max-width: 320px;
                    transform: translateX(-100%);
                    box-shadow: none;
                }
                .sidebar.active {
                    transform: translateX(0);
                    box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
                }
                .sidebar-overlay.active { display: block; animation: fadeIn 0.3s ease; }
                .menu-item { min-height: 52px; padding: 8px 15px; }
                .menu-item:active { transform: scale(0.98); background-color: rgba(0, 0, 0, 0.1); }
                .submenu .menu-item { min-height: 48px; padding-left: 48px; }
                .menu-icon { width: 24px; height: 24px; font-size: 18px; }
                .menu-text { font-size: 15px; }
                .menu-category { font-size: 13px; margin-top: 24px; margin-bottom: 12px; padding: 0 15px; }
                @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .sidebar.active { animation: slideIn 0.3s ease; }
                body.sidebar-open { overflow: hidden; }
            }
            @media (max-width: 480px) {
                .menu-toggle { top: 12px; left: 12px; width: 44px; height: 44px; }
                .menu-toggle span { width: 20px; margin: 2.5px 0; }
                .sidebar { width: 100%; max-width: none; }
                .sidebar-header { padding: 16px; }
                .logo-text { font-size: 16px; }
                .logo-image { width: 36px; height: 36px; }
                .sidebar-menu { padding: 12px; }
                .menu-item { min-height: 48px; padding: 6px 12px; }
                .menu-text { font-size: 14px; }
                .menu-category { font-size: 12px; margin-top: 20px; margin-bottom: 8px; padding: 0 12px; }
                .submenu .menu-item { padding-left: 40px; }
            }
            @media (max-width: 768px) and (orientation: landscape) {
                .sidebar { overflow-y: auto; padding-bottom: 20px; }
                .sidebar-menu { padding-bottom: 20px; }
                .menu-item { min-height: 44px; }
            }
            @media (min-width: 769px) and (max-width: 1024px) {
                .sidebar { width: 260px; }
                .menu-item { min-height: 48px; }
            }

            .super-admin-only {
                border-top: 2px solid var(--primary-color);
                margin-top: 10px;
                padding-top: 10px;
            }

            .super-admin-only .menu-section h3 {
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: var(--primary-color);
                margin: 15px 15px 8px;
                font-weight: 600;
            }

            @media (prefers-reduced-motion: reduce) {
                * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
            }

            .menu-item:focus-visible, .theme-toggle:focus-visible {
                outline: 2px solid var(--primary-color);
                outline-offset: 2px;
            }
                 .menu-badge {
            background: #ef4444;
            color: white;
            border-radius: 9999px;
            padding: 2px 8px;
            font-size: 11px;
            font-weight: 700;
            margin-left: auto;
            min-width: 20px;
            text-align: center;
            transition: all 0.2s;
        }
        [data-theme="dark"] .menu-badge {
            background: #dc2626;
        }
        
        .menu-item:focus-visible, .theme-toggle:focus-visible {
            outline: 2px solid var(--primary-color);
            outline-offset: 2px;
        }
        `;
        
        document.head.appendChild(style);
    }

    generateSidebarHTML() {
        const isSuperAdmin = this.currentUserRole === 'super_admin';
        
        this.log('Generating sidebar with role:', this.currentUserRole);
        
        return `
            <div class="sidebar-overlay"></div>
            
            <div class="sidebar">
                <div class="sidebar-header">
                    <div class="logo-container">
                        <img src="https://iili.io/f4e5HhP.png" alt="Logo" class="logo-image" />
                        <h2 class="logo-text">${this.getTranslation('dashboardTitle')}</h2>
                    </div>
                </div>
                
                <div class="sidebar-menu">
                    <!-- Dashboard Overview -->
                    <div class="menu-item" data-page="summary-dashboard.html">
                        <div class="menu-icon">
                            <i class="fas fa-tachometer-alt"></i>
                        </div>
                        <span class="menu-text">${this.getMenuItem('dashboardOverview')}</span>
                    </div>
                    
                    <!-- Reports Section -->
                    <div class="menu-category">${this.getCategory('reports')}</div>
                    <div class="menu-item has-submenu">
                        <div class="menu-icon">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <span class="menu-text">${this.getMenuItem('reportsMenu')}</span>
                        <div class="submenu-indicator">
                            <i class="fas fa-chevron-right"></i>
                        </div>
                    </div>
                    <div class="submenu">
                        <div class="menu-item" data-page="pending-reports.html">
                            <div class="menu-icon">
                                <i class="fas fa-file-alt"></i>
                            </div>
                            <span class="menu-text">${this.getMenuItem('pendingReports')}</span>
                        </div>
                        <div class="menu-item" data-page="solved-report.html">
                            <div class="menu-icon">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            <span class="menu-text">${this.getMenuItem('solvedReports')}</span>
                        </div>
                        <div class="menu-item" data-page="idesaran-agent.html">
                            <div class="menu-icon">
                                <i class="fas fa-comment-dots"></i>
                            </div>
                            <span class="menu-text">${this.getMenuItem('ideasAgent')}</span>
                        </div>
                    </div>
                    
                    <!-- Maintenance Section -->
                    <div class="menu-category">${this.getCategory('maintenance')}</div>
                    <div class="menu-item has-submenu">
                        <div class="menu-icon">
                            <i class="fas fa-tools"></i>
                        </div>
                        <span class="menu-text">${this.getMenuItem('maintenanceMenu')}</span>
                        <div class="submenu-indicator">
                            <i class="fas fa-chevron-right"></i>
                        </div>
                    </div>
                    <div class="submenu">
                        <div class="menu-item" data-page="maintenance.html">
                            <div class="menu-icon">
                                <i class="fas fa-clock"></i>
                            </div>
                            <span class="menu-text">${this.getMenuItem('pendingMaintenance')}</span>
                        </div>
                        <div class="menu-item" data-page="completed-report.html">
                            <div class="menu-icon">
                                <i class="fas fa-check-double"></i>
                            </div>
                            <span class="menu-text">${this.getMenuItem('completedMaintenance')}</span>
                        </div>
                    </div>
                    
                    <!-- Performance Section -->
                    <div class="menu-category">${this.getCategory('performance')}</div>
                    <div class="menu-item has-submenu">
                        <div class="menu-icon">
                            <i class="fas fa-trophy"></i>
                        </div>
                        <span class="menu-text">${this.getMenuItem('kpiPoints')}</span>
                        <div class="submenu-indicator">
                            <i class="fas fa-chevron-right"></i>
                        </div>
                    </div>
                    <div class="submenu">
                        <div class="menu-item" data-page="kpi-css.html">
                            <div class="menu-icon">
                                <i class="fas fa-cogs"></i>
                            </div>
                            <span class="menu-text">${this.getMenuItem('kpiCss')}</span>
                        </div>
                        <div class="menu-item" data-page="ide-saran.html">
                            <div class="menu-icon">
                                <i class="fas fa-lightbulb"></i>
                            </div>
                            <span class="menu-text">${this.getMenuItem('ideasSuggestions')}</span>
                        </div>
                        <div class="menu-item" data-page="research.html">
                            <div class="menu-icon">
                                <i class="fas fa-chart-line"></i>
                            </div>
                            <span class="menu-text">${this.getMenuItem('research')}</span>
                        </div>
                        <div class="menu-item" data-page="chat-response.html">
                            <div class="menu-icon">
                                <i class="fas fa-comments"></i>
                            </div>
                            <span class="menu-text">${this.getMenuItem('chatResponse')}</span>
                        </div>
                    </div>

                    <!-- ========== CHAT SERVICES SECTION (TERPISAH) ========== -->
                    <div class="menu-category">${this.getCategory('chatServices')}</div>
                    
                    <!-- Chat Agent Menu Utama - Berdiri Sendiri, Tidak Tergabung dengan Promosi -->
                    <div class="menu-item" data-page="chat-agent.html">
                        <div class="menu-icon">
                            <i class="fas fa-headset"></i>
                        </div>
                        <span class="menu-text">${this.getMenuItem('chatAgent')}</span>
                    </div>
                    
                    <!-- Pemisah visual sebelum menu promosi -->
                    <div class="menu-divider"></div>

                    ${isSuperAdmin ? `
                    <!-- Admin Section (Super Admin Only) -->
                    <div class="menu-category">${this.getCategory('admin')}</div>
                    <div class="menu-item" data-page="staff-account.html">
                        <div class="menu-icon">
                            <i class="fas fa-user-friends"></i>
                        </div>
                        <span class="menu-text">${this.getMenuItem('staffAccount')}</span>
                    </div>
                    ` : ''}

                    <!-- Additional / Promotional Menus -->
                    <div class="menu-item" data-page="topup-credit.html">
                        <div class="menu-icon">
                            <i class="fas fa-coins"></i>
                        </div>
                        <span class="menu-text">${this.getMenuItem('topUpCredit')}</span>
                    </div>  

                    <div class="menu-item" data-page="eventprovider.html">
                        <div class="menu-icon">
                            <i class="fas fa-trophy"></i>
                        </div>
                        <span class="menu-text">${this.getMenuItem('eventProvider')}</span>
                    </div>

                    <div class="menu-item" data-page="pengaturan.html">
                        <div class="menu-icon">
                            <i class="fas fa-cog"></i>
                        </div>
                        <span class="menu-text">${this.getMenuItem('settings')}</span>
                    </div>

                    <!-- Logout -->
                    <div class="menu-item logout-btn" id="logoutButton">
                        <div class="menu-icon">
                            <i class="fas fa-sign-out-alt"></i>
                        </div>
                        <span class="menu-text">${this.getMenuItem('logout')}</span>
                    </div>
                </div>
            </div>
        `;
    }

    async load() {
        if (!this.sidebarContainer) {
            this.error('Sidebar container not found');
            return;
        }

        try {
            this.loadTheme();
            this.injectStyles();
            await this.initializeUserData();
            
            if (!this.currentUserId) {
                return;
            }
            
            this.sidebarContainer.innerHTML = this.generateSidebarHTML();
            
            this.createMenuToggle();
            this.initializeSidebarFunctionality();
            this.restoreSidebarState();
            this.setActiveMenuItem();
            this.applyTranslations();
            
            // Prevent body scroll when sidebar is open on mobile
            this.setupBodyScrollLock();
            
            this.isInitialized = true;
            this.log('Sidebar loaded successfully');
            
        } catch (error) {
            this.error('Error loading sidebar:', error);
            this.sidebarContainer.innerHTML = this.generateSidebarHTML();
            this.createMenuToggle();
            this.initializeSidebarFunctionality();
            this.restoreSidebarState();
            this.setActiveMenuItem();
            this.applyTranslations();
            this.setupBodyScrollLock();
        }
    }

    // New method to prevent body scroll when sidebar is open on mobile
    setupBodyScrollLock() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const sidebar = document.querySelector('.sidebar');
                    if (sidebar && sidebar.classList.contains('active')) {
                        document.body.classList.add('sidebar-open');
                    } else {
                        document.body.classList.remove('sidebar-open');
                    }
                }
            });
        });
        
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            observer.observe(sidebar, { attributes: true });
        }
    }

    createMenuToggle() {
        if (!document.querySelector('.menu-toggle')) {
            const menuToggle = document.createElement('button');
            menuToggle.className = 'menu-toggle';
            menuToggle.setAttribute('aria-label', 'Toggle menu');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.innerHTML = `
                <span></span>
                <span></span>
                <span></span>
            `;
            document.body.appendChild(menuToggle);
        }
    }

    initializeSidebarFunctionality() {
        this.setupMenuToggle();
        this.setupSubmenuToggle();
        this.setupMenuNavigation();
        this.setupThemeToggle();
        this.setupLanguageListener();
        this.setupResizeHandler();
    }

    setupMenuToggle() {
        const menuToggle = document.querySelector('.menu-toggle');
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        
        if (menuToggle && sidebar && overlay) {
            const toggleHandler = () => {
                sidebar.classList.toggle('active');
                overlay.classList.toggle('active');
                menuToggle.classList.toggle('active');
                
                const isExpanded = sidebar.classList.contains('active');
                menuToggle.setAttribute('aria-expanded', isExpanded);
                
                if (window.innerWidth <= 768) {
                    if (isExpanded) {
                        document.body.style.overflow = 'hidden';
                    } else {
                        document.body.style.overflow = '';
                    }
                }
            };
            
            menuToggle.addEventListener('click', toggleHandler);
            overlay.addEventListener('click', toggleHandler);
            
            this.eventListeners.push({ element: menuToggle, type: 'click', handler: toggleHandler });
            this.eventListeners.push({ element: overlay, type: 'click', handler: toggleHandler });
        }
    }

    setupSubmenuToggle() {
        const hasSubmenuItems = document.querySelectorAll('.has-submenu');
        
        hasSubmenuItems.forEach((item) => {
            const handler = (e) => {
                if (e.target.classList.contains('submenu-toggle')) return;
                
                const submenu = item.nextElementSibling;
                if (submenu && submenu.classList.contains('submenu')) {
                    if (submenu.classList.contains('active')) {
                        submenu.classList.remove('active');
                        submenu.style.maxHeight = '0';
                    } else {
                        submenu.classList.add('active');
                        submenu.style.maxHeight = '500px';
                    }
                    
                    item.classList.toggle('active');
                    this.saveSidebarState();
                }
            };
            
            item.addEventListener('click', handler);
            this.eventListeners.push({ element: item, type: 'click', handler });
        });
    }

    setupMenuNavigation() {
        const menuItems = document.querySelectorAll('.menu-item[data-page]');
        const logoutButton = document.getElementById('logoutButton');
        
        menuItems.forEach(item => {
            if (item === logoutButton) return;
            
            const handler = () => {
                const pageUrl = item.getAttribute('data-page');
                this.handleMenuNavigation(pageUrl);
            };
            
            item.addEventListener('click', handler);
            this.eventListeners.push({ element: item, type: 'click', handler });
        });
        
        if (logoutButton) {
            const logoutHandler = async () => {
                await this.handleLogout();
            };
            
            logoutButton.addEventListener('click', logoutHandler);
            this.eventListeners.push({ element: logoutButton, type: 'click', handler: logoutHandler });
        }
    }

    handleMenuNavigation(pageUrl) {
        const allowedPages = [
            'summary-dashboard.html', 'pending-reports.html', 'solved-report.html',
            'maintenance.html', 'completed-report.html', 'kpi-css.html', 'kpi-history.html', 
            'ide-saran.html', 'research.html', 'chat-response.html',
            'staff-account.html', 'topup-credit.html', 'eventprovider.html', 
            'pengaturan.html', 'index.html', 'idesaran-agent.html',
            'chat-agent.html'
        ];
        
        if (!allowedPages.includes(pageUrl)) {
            this.error('Invalid page navigation attempt:', pageUrl);
            return;
        }
        
        this.saveSidebarState();
        
        if (window.innerWidth <= 768) {
            this.closeMobileSidebar();
        }
        
        window.location.href = pageUrl;
    }

    async handleLogout() {
        try {
            const sensitiveKeys = [
                'userRole', 'userId', 'sidebarState', 'theme', 'language',
                'rememberEmail', 'currentUser', 'adminName', 'adminRole', 'adminProfileImage'
            ];
            sensitiveKeys.forEach(key => localStorage.removeItem(key));
            
            sessionStorage.clear();
            
            try {
                if (typeof firebase !== 'undefined' && firebase.auth) {
                    await firebase.auth().signOut();
                }
            } catch (firebaseError) {
                console.log('Firebase logout optional:', firebaseError.message);
            }
            
            window.location.href = 'index.html';
        } catch (error) {
            this.error('Logout error:', error);
            window.location.href = 'index.html';
        }
    }

    setupThemeToggle() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const handler = () => this.toggleTheme();
            themeToggle.addEventListener('click', handler);
            this.eventListeners.push({ element: themeToggle, type: 'click', handler });
        }
    }

    setupLanguageListener() {
        const handler = (event) => {
            this.currentLanguage = event.detail.language;
            this.reloadSidebar();
        };
        
        window.addEventListener('languageChanged', handler);
        this.eventListeners.push({ element: window, type: 'languageChanged', handler });
    }

    setupResizeHandler() {
        let resizeTimeout;
        
        const handler = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (window.innerWidth > 768) {
                    this.closeMobileSidebar();
                    document.body.style.overflow = '';
                }
            }, 250);
        };
        
        window.addEventListener('resize', handler);
        this.eventListeners.push({ element: window, type: 'resize', handler });
    }

    closeMobileSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        const menuToggle = document.querySelector('.menu-toggle');
        
        if (sidebar) {
            sidebar.classList.remove('active');
            if (menuToggle) menuToggle.classList.remove('active');
            if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
        }
        if (overlay) overlay.classList.remove('active');
        
        document.body.style.overflow = '';
    }

    async reloadSidebar() {
        await this.initializeUserData();
        this.load();
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        this.updateThemeIcon(newTheme);
        this.updateThemeText();
    }

    updateThemeIcon(theme) {
        const themeIcon = document.querySelector('#themeToggle .menu-icon i');
        if (themeIcon) {
            themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }

    setActiveMenuItem() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const menuItems = document.querySelectorAll('.menu-item[data-page]');
        
        menuItems.forEach(item => {
            const pageUrl = item.getAttribute('data-page');
            if (pageUrl === currentPage) {
                item.classList.add('active');
                
                const parentSubmenu = item.closest('.submenu');
                if (parentSubmenu) {
                    parentSubmenu.classList.add('active');
                    parentSubmenu.style.maxHeight = '500px';
                    
                    const parentMenuItem = parentSubmenu.previousElementSibling;
                    if (parentMenuItem && parentMenuItem.classList.contains('has-submenu')) {
                        parentMenuItem.classList.add('active');
                    }
                }
            }
        });
    }

    saveSidebarState() {
        const sidebarState = [];
        document.querySelectorAll('.has-submenu').forEach((item, index) => {
            const submenu = item.nextElementSibling;
            if (submenu && submenu.classList.contains('active')) {
                sidebarState.push(index);
            }
        });
        localStorage.setItem('sidebarState', JSON.stringify(sidebarState));
    }

    restoreSidebarState() {
        try {
            const sidebarState = JSON.parse(localStorage.getItem('sidebarState') || '[]');
            document.querySelectorAll('.has-submenu').forEach((item, index) => {
                const submenu = item.nextElementSibling;
                if (sidebarState.includes(index) && submenu) {
                    submenu.classList.add('active');
                    submenu.style.maxHeight = '500px';
                    item.classList.add('active');
                }
            });
        } catch (error) {
            this.error('Error restoring sidebar state:', error);
        }
    }

    destroy() {
        this.eventListeners.forEach(({ element, type, handler }) => {
            element.removeEventListener(type, handler);
        });
        this.eventListeners = [];
        
        document.body.style.overflow = '';
        
        window.sidebarLoader = null;
        
        this.log('SidebarLoader destroyed');
    }

    isSuperAdmin() {
        return this.currentUserRole === 'super_admin';
    }

    getUserData() {
        return this.userData;
    }
}

function isSuperAdmin() {
    const sidebarLoader = window.sidebarLoader;
    return sidebarLoader ? sidebarLoader.isSuperAdmin() : false;
}

function getUserData() {
    const sidebarLoader = window.sidebarLoader;
    return sidebarLoader ? sidebarLoader.getUserData() : null;
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        const sidebarLoader = new SidebarLoader();
        window.sidebarLoader = sidebarLoader;
        await sidebarLoader.load();
    } catch (error) {
        console.error('Failed to initialize SidebarLoader:', error);
        
        try {
            const container = document.getElementById('sidebar-container');
            if (container) {
                container.innerHTML = `
                    <div class="sidebar">
                        <div class="sidebar-header">
                            <div class="logo-container">
                                <img src="https://iili.io/KfDh0EN.png" alt="Logo" class="logo-image" />
                                <h2 class="logo-text">CSS Dashboard</h2>
                            </div>
                        </div>
                        <div class="sidebar-menu">
                            <div class="menu-item" data-page="index.html">
                                <div class="menu-icon"><i class="fas fa-sign-in-alt"></i></div>
                                <span class="menu-text">Login</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
        }
    }
});

window.addEventListener('beforeunload', () => {
    if (window.sidebarLoader) {
        window.sidebarLoader.destroy();
    }
});
