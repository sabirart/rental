// js/mobile-native.js
//
// Native-only glue for things that only matter inside the Android app shell:
// the hardware/gesture back button, status bar color, and hiding the splash
// screen once the app UI is actually ready. All of this is skipped entirely
// on the website (NativeAuth.isNative() is false there).
(function () {
    'use strict';

    function isNative() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }

    function closeAnyOpenModalOrDrawer() {
        // Reuses the app's own modal/drawer plumbing where possible instead of
        // reimplementing "what counts as open" here.
        const openModal = document.querySelector('.modal-overlay.active');
        if (openModal) {
            openModal.classList.remove('active');
            return true;
        }
        const drawer = document.getElementById('sidebar') || document.querySelector('.sidebar');
        if (drawer && drawer.classList.contains('open')) {
            drawer.classList.remove('open');
            return true;
        }
        return false;
    }

    async function setupBackButton() {
        const { App: CapApp } = window.CapacitorApp || {};
        if (!CapApp) return;

        let lastBackPress = 0;

        CapApp.addListener('backButton', () => {
            // 1) Close an open modal/drawer instead of exiting.
            if (closeAnyOpenModalOrDrawer()) return;

            // 2) Inside the dashboard, on any view other than the main
            //    dashboard view, go back to it first (matches site-controller.js's
            //    validViews list) instead of exiting straight away.
            const inDashboard = document.body.classList.contains('dashboard-active');
            const currentView = window.location.hash.replace('#', '');
            if (inDashboard && currentView && currentView !== 'dashboard' && window.App && typeof window.App.navigateTo === 'function') {
                window.App.navigateTo('dashboard');
                return;
            }

            // 3) Double-press-to-exit on the home/dashboard screen, standard Android UX.
            const now = Date.now();
            if (now - lastBackPress < 2000) {
                CapApp.exitApp();
            } else {
                lastBackPress = now;
                console.log('Press back again to exit');
            }
        });
    }

    // Deliberately no status/nav bar color override here - the
    // EdgeToEdgeSupport plugin (installed for its inset-handling fix) still
    // lets Android use its own default, transparent status bar appearance;
    // we only needed it to stop content being hidden underneath, not to
    // paint a custom color over it.

    async function hideSplash() {
        const { SplashScreen } = window.CapacitorSplashScreen || {};
        if (!SplashScreen) return;
        try {
            await SplashScreen.hide();
        } catch (e) { /* already hidden or auto-hide handled it */ }
    }

    if (isNative()) {
        document.addEventListener('DOMContentLoaded', () => {
            setupBackButton();
            hideSplash();
        });
    }
})();
