(function () {
    'use strict';

    const MOBILE_BREAKPOINT = 768;
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    const Mobile = {
        _tabBarEl: null,
        _backdropEl: null,
        _tableObserver: null,

        init() {
            this.fixViewportHeight();
            this.tagBody();
            this.buildBackdrop();
            this.buildTabBar();
            this.patchNavigation();
            this.setupDrawerSwipe();
            this.setupTouchFeedback();
            this.setupModalSheetBehavior();
            this.setupTableCardLabels();
            this.preventIOSZoomOnFocus();

            window.addEventListener('resize', () => this.fixViewportHeight());
            window.addEventListener('orientationchange', () => {
                setTimeout(() => this.fixViewportHeight(), 200);
            });
        },

        isMobile() {
            return window.innerWidth <= MOBILE_BREAKPOINT;
        },

        // The hamburger + slide-in drawer are only shown as a fallback on
        // short landscape phones, where the bottom tab bar doesn't fit
        drawerNavActive() {
            const toggle = document.getElementById('navToggle');
            if (!toggle) return false;
            return window.getComputedStyle(toggle).display !== 'none';
        },

        // Fix the classic mobile "100vh includes the address bar" bug
        fixViewportHeight() {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        },

        tagBody() {
            if (isTouch) document.body.classList.add('is-touch');
            document.body.classList.toggle('is-mobile', this.isMobile());
        },

        vibrate(ms) {
            // Vibration disabled - no-op
        },

        // Backdrop behind the drawer sidebar on mobile
        buildBackdrop() {
            let backdrop = document.getElementById('sidebarBackdrop');
            if (!backdrop) {
                backdrop = document.createElement('div');
                backdrop.className = 'sidebar-backdrop';
                backdrop.id = 'sidebarBackdrop';
                document.body.appendChild(backdrop);
            }
            this._backdropEl = backdrop;

            backdrop.addEventListener('click', () => this.closeDrawer());
        },

        openDrawer() {
            const sidebar = document.getElementById('sidebar');
            const navToggle = document.getElementById('navToggle');
            if (!sidebar) return;
            sidebar.classList.add('open');
            if (navToggle) navToggle.classList.add('active');
            if (this._backdropEl) this._backdropEl.classList.add('active');
            document.body.style.overflow = 'hidden';
        },

        closeDrawer() {
            const sidebar = document.getElementById('sidebar');
            const navToggle = document.getElementById('navToggle');
            if (!sidebar) return;
            sidebar.classList.remove('open');
            if (navToggle) navToggle.classList.remove('active');
            if (this._backdropEl) this._backdropEl.classList.remove('active');
            document.body.style.overflow = '';
        },

        // Bottom tab bar
        icons: {
            dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
            tenants: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
            properties: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>',
            payments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
            settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
        },

        buildTabBar() {
            const navLinks = document.querySelectorAll('.sidebar .nav-link[data-view]');
            if (!navLinks.length) return;

            let bar = document.getElementById('mobileTabBar');
            if (bar) bar.remove();

            bar = document.createElement('nav');
            bar.className = 'mobile-tab-bar';
            bar.id = 'mobileTabBar';
            bar.setAttribute('aria-label', 'Primary navigation');

            const inner = document.createElement('div');
            inner.className = 'mobile-tab-bar-inner';

            navLinks.forEach(link => {
                const view = link.getAttribute('data-view');
                const label = link.textContent.trim();

                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'mobile-tab-item';
                item.dataset.view = view;
                if (link.classList.contains('active')) item.classList.add('active');
                item.innerHTML = `${this.icons[view] || this.icons.dashboard}<span>${label}</span>`;

                item.addEventListener('click', () => {
                    if (window.App && typeof App.navigateTo === 'function') {
                        App.navigateTo(view);
                    } else {
                        window.location.hash = view;
                    }
                    this.setActiveTab(view);
                });

                inner.appendChild(item);
            });

            bar.appendChild(inner);
            document.body.appendChild(bar);
            this._tabBarEl = bar;
        },

        setActiveTab(view) {
            if (!this._tabBarEl) return;
            this._tabBarEl.querySelectorAll('.mobile-tab-item').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === view);
            });
        },

        // Keep the bottom tab bar, sidebar links, and hash in sync
        patchNavigation() {
            const applyActiveState = () => {
                const view = (window.App && App.state && App.state.currentView) ||
                    window.location.hash.replace('#', '') || 'dashboard';
                this.setActiveTab(view);
            };

            if (window.App && typeof App.navigateTo === 'function' && !App.__mobilePatched) {
                const originalNavigateTo = App.navigateTo.bind(App);
                App.navigateTo = (view) => {
                    originalNavigateTo(view);
                    this.setActiveTab(view);
                    this.closeDrawer();
                };
                App.__mobilePatched = true;
            }

            window.addEventListener('hashchange', applyActiveState);
            applyActiveState();

            document.querySelectorAll('.sidebar .nav-link[data-view]').forEach(link => {
                link.addEventListener('click', () => {
                    setTimeout(() => this.closeDrawer(), 0);
                });
            });

            // NOTE: app.js's setupNavigation() used to also bind a click
            // handler to #navToggle that toggled the 'open'/'active' classes
            // directly (see app.js - that handler has been removed in favor
            // of this single one). Having two independent handlers on the
            // same button - one flipping classes directly, one with inverted
            // open/close logic - was the root cause of the drawer overlay
            // getting out of sync with its backdrop: sometimes the backdrop
            // was left showing (blocking taps) after the drawer visually
            // closed, sometimes it never appeared at all. Mobile.js is now
            // the single owner of drawer open/close state, which keeps it
            // consistent with the swipe gesture and the backdrop-click
            // handler below.
            const navToggle = document.getElementById('navToggle');
            if (navToggle) {
                navToggle.addEventListener('click', () => {
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar && sidebar.classList.contains('open')) {
                        this.closeDrawer();
                    } else {
                        this.openDrawer();
                    }
                });
            }
        },

        // Edge-swipe to open/close the drawer
        setupDrawerSwipe() {
            if (!isTouch) return;
            const EDGE_ZONE = 24;
            let startX = 0, startY = 0, tracking = false, fromEdge = false;
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return;

            document.addEventListener('touchstart', (e) => {
                if (!this.isMobile() || !this.drawerNavActive()) return;
                const t = e.touches[0];
                startX = t.clientX;
                startY = t.clientY;
                fromEdge = startX <= EDGE_ZONE && !sidebar.classList.contains('open');
                tracking = fromEdge || sidebar.classList.contains('open');
            }, { passive: true });

            document.addEventListener('touchmove', (e) => {
                if (!tracking || !this.isMobile() || !this.drawerNavActive()) return;
                const t = e.touches[0];
                const dx = t.clientX - startX;
                const dy = t.clientY - startY;
                if (Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }

                if (fromEdge && dx > 60) {
                    this.openDrawer();
                    tracking = false;
                } else if (sidebar.classList.contains('open') && dx < -60) {
                    this.closeDrawer();
                    tracking = false;
                }
            }, { passive: true });

            document.addEventListener('touchend', () => { tracking = false; });
        },

        // Light tap feedback + haptics
        setupTouchFeedback() {
            if (!isTouch) return;
            const SELECTOR = '.btn, .nav-link, .mobile-tab-item, .property-card, .status-btn, .action-btn, .dropdown-item, .recycle-tab, .stat-card';

            document.addEventListener('touchstart', (e) => {
                const el = e.target.closest(SELECTOR);
                if (el) el.classList.add('touch-active');
            }, { passive: true });

            const clear = (e) => {
                const el = e.target.closest(SELECTOR);
                if (el) el.classList.remove('touch-active');
            };
            document.addEventListener('touchend', clear, { passive: true });
            document.addEventListener('touchcancel', clear, { passive: true });

        },

        // Swipe-down-to-dismiss on bottom-sheet modals
        setupModalSheetBehavior() {
            if (!isTouch) return;

            ['modal', 'documentModal'].forEach(id => {
                const modal = document.getElementById(id);
                if (!modal) return;
                const content = modal.querySelector('.modal-content');
                if (!content) return;

                if (!content.querySelector('.modal-drag-handle')) {
                    const handle = document.createElement('div');
                    handle.className = 'modal-drag-handle';
                    content.insertBefore(handle, content.firstChild);
                }

                let startY = 0, dy = 0, dragging = false;

                content.addEventListener('touchstart', (e) => {
                    if (!this.isMobile()) return;
                    const header = e.target.closest('.modal-header') || e.target.closest('.modal-drag-handle');
                    if (!header) return;
                    startY = e.touches[0].clientY;
                    dragging = true;
                    content.style.transition = 'none';
                }, { passive: true });

                content.addEventListener('touchmove', (e) => {
                    if (!dragging) return;
                    dy = Math.max(0, e.touches[0].clientY - startY);
                    content.style.transform = `translateY(${dy}px)`;
                }, { passive: true });

                content.addEventListener('touchend', () => {
                    if (!dragging) return;
                    dragging = false;
                    // Re-enable the smooth CSS transition BEFORE clearing the
                    // inline transform, so the sheet eases back into place
                    // instead of snapping instantly (this was the main cause
                    // of the visible "jitter" when a swipe didn't dismiss).
                    content.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
                    if (dy > 100) {
                        // Finish the dismiss motion smoothly off-screen, then
                        // actually close once the animation has played.
                        content.style.transform = 'translateY(100%)';
                        setTimeout(() => {
                            modal.classList.remove('active');
                            if (window.App && typeof App.closeModal === 'function' && id === 'modal') {
                                App.closeModal();
                            }
                            content.style.transition = '';
                            content.style.transform = '';
                        }, 300);
                    } else {
                        content.style.transform = '';
                        setTimeout(() => { content.style.transition = ''; }, 300);
                    }
                    dy = 0;
                });
            });
        },

        // Turn data tables into stacked cards on mobile
        setupTableCardLabels() {
            const applyLabels = (table) => {
                const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
                if (!headers.length) return;
                table.querySelectorAll('tbody tr').forEach(row => {
                    Array.from(row.children).forEach((cell, i) => {
                        if (headers[i]) cell.setAttribute('data-label', headers[i]);
                        if (headers[i] && /profile/i.test(headers[i])) {
                            cell.classList.add('card-cell-block');
                        }
                    });
                });
            };

            const tables = document.querySelectorAll('.data-table');
            tables.forEach(applyLabels);

            if (this._tableObserver) this._tableObserver.disconnect();
            this._tableObserver = new MutationObserver((mutations) => {
                const touchedTables = new Set();
                mutations.forEach(m => {
                    const table = m.target.closest ? m.target.closest('.data-table') : null;
                    if (table) touchedTables.add(table);
                });
                touchedTables.forEach(applyLabels);
            });

            tables.forEach(table => {
                const tbody = table.querySelector('tbody');
                if (tbody) this._tableObserver.observe(tbody, { childList: true, subtree: true });
            });
        },

        // Prevent iOS Safari from zooming in on form inputs
        preventIOSZoomOnFocus() {
            const meta = document.querySelector('meta[name="viewport"]');
            if (!meta) return;
            const original = meta.getAttribute('content');
            const zoomed = original + ', maximum-scale=1';

            // Only text-entry fields trigger iOS's auto-zoom-on-focus.
            // <select> (dropdowns) and non-text <input> types (checkbox,
            // radio, file, etc.) don't need this and rewriting the
            // viewport meta for them was causing a visible flash/blink.
            const isTextEntry = (target) => {
                const tag = target.tagName;
                if (tag === 'TEXTAREA') return true;
                if (tag !== 'INPUT') return false;
                const type = (target.getAttribute('type') || 'text').toLowerCase();
                return ['text', 'search', 'email', 'url', 'tel', 'number', 'password', 'date', 'datetime-local', 'month', 'time', 'week'].includes(type);
            };

            document.addEventListener('focusin', (e) => {
                if (isTextEntry(e.target) && meta.getAttribute('content') !== zoomed) {
                    meta.setAttribute('content', zoomed);
                }
            });
            document.addEventListener('focusout', (e) => {
                if (isTextEntry(e.target) && meta.getAttribute('content') !== original) {
                    meta.setAttribute('content', original);
                }
            });
        }
    };

    // Lightweight touch-active style
    const style = document.createElement('style');
    style.textContent = `
        .touch-active { opacity: 0.7; transition: opacity 0.1s ease; }
        .btn.touch-active, .mobile-tab-item.touch-active { transform: scale(0.96); }
    `;
    document.head.appendChild(style);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Mobile.init());
    } else {
        Mobile.init();
    }

    // Mobile guest login/signup buttons
    document.addEventListener('click', function(e) {
        if (e.target.id === 'mobileGuestSignupBtn' || e.target.closest('#mobileGuestSignupBtn')) {
            SiteController.openAuthModal('register');
        }
        if (e.target.closest('#mobileUserInfo')) {
            document.querySelector('[data-view="settings"]')?.click();
        }
    });
    
    function updateMobileGuestInfo() {
        const container = document.getElementById('mobileGuestInfo');
        if (!container) return;
    
        const isAuthenticated = window.Auth && Auth.isAuthenticated;
        const user = window.Auth && Auth.user;
    
        if (isAuthenticated && user) {
            const safeName = (typeof escapeHTML === 'function') ? escapeHTML(user.name || 'User') : (user.name || 'User');
            const initial = (user.name || 'U').charAt(0).toUpperCase();
            const avatarHTML = user.profilePic
                ? `<img src="${escapeHTML ? escapeHTML(user.profilePic) : user.profilePic}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
                : initial;
            container.innerHTML = `
                <div id="mobileUserInfo" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <span style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;color:var(--text);">${safeName}</span>
                    <span class="guest-avatar">${avatarHTML}</span>
                </div>
            `;
        } else {
            // Only Sign Up button - matches website style
            container.innerHTML = `
                <button class="guest-login-btn" id="mobileGuestSignupBtn">Sign Up</button>
            `;
        }
    }

    // Call this when auth state changes
    Auth.addListener(() => {
        updateMobileGuestInfo();
    });

    // Call on page load
    document.addEventListener('DOMContentLoaded', () => {
        updateMobileGuestInfo();
    });

    window.Mobile = Mobile;
})();
