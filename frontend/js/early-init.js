// Runs synchronously while the landing page is parsed: reflects a remembered sign-in before first paint.
(function () {
    try {
        var hasUser = !!localStorage.getItem('auth_user');
        document.body.classList.toggle('returning-user', hasUser);
        var google = document.getElementById('googleStartBtn');
        var dash = document.getElementById('myDashboardTrigger');
        var heroDash = document.getElementById('heroMyDashboard');
        if (hasUser) {
            if (google) google.style.display = 'none';
            if (dash) dash.style.display = 'none';
            var demo = document.getElementById('heroTryDemo');
            if (demo) demo.style.display = 'none';
            if (heroDash) heroDash.style.display = 'inline-flex';
        }
    } catch (_) {}
})();
