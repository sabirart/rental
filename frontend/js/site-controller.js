// Google-only entry and owner profile setup.
const SiteController = {
  _dashboardUnlocked: false,
  init() {
    Auth.init();
    const startGoogle = () => { window.location.href = `${API.baseURL}/auth/google/start`; };
    document.getElementById('googleStartBtn')?.addEventListener('click', startGoogle);
    ['returnHomeBtn', 'returnHomeBtnMobile'].forEach(id => document.getElementById(id)?.addEventListener('click', () => this.returnToHome()));
    document.getElementById('heroTryDemo')?.addEventListener('click', e => { e.preventDefault(); this.startDemo(); });
    document.getElementById('myDashboardTrigger')?.addEventListener('click', e => { e.preventDefault(); this.unlockDashboard(); });
    document.getElementById('heroMyDashboard')?.addEventListener('click', e => { e.preventDefault(); this.unlockDashboard(); });
    ['siteSignOutBtn','authLogoutBtn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => Auth.logout()));
    const profileModal = document.getElementById('ownerProfileModal');
    profileModal?.addEventListener('click', e => { if (e.target === profileModal && Auth.user?.profileComplete) this.closeAuthModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && profileModal?.classList.contains('active') && Auth.user?.profileComplete) this.closeAuthModal(); });
    document.getElementById('ownerProfileForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name = document.getElementById('ownerProfileName').value.trim();
      const error = document.getElementById('ownerProfileError');
      error.textContent = ''; error.style.display = 'none';
      if (!name) { error.textContent = 'Please enter your name.'; error.style.display = 'block'; return; }
      const btn = document.getElementById('ownerProfileNext'); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const result = await Auth.updateProfile({ name, profileComplete: true });
        Auth.setUser(result.user, null);
        document.getElementById('ownerProfileModal').classList.remove('active');
        document.body.style.overflow = '';
        this.unlockDashboard();
      } catch (err) { error.textContent = err.message || 'Could not save your profile. Please try again.'; error.style.display = 'block'; }
      finally { btn.disabled = false; btn.textContent = Auth.user?.profileComplete ? 'Save changes' : 'Next'; }
    });
    this.restoreSession();
  },
  async restoreSession() {
    const params = new URLSearchParams(location.search);
    const showHome = params.has('showHome');
    if (showHome) {
      Auth.stopDemo?.();
      document.body.classList.remove('dashboard-active', 'demo-active');
      document.getElementById('siteOverlay')?.setAttribute('aria-hidden', 'false');
      history.replaceState({}, document.title, location.pathname);
    }
    if (Auth.isDemoMode()) {
      this.updateAuthUI(false);
      this.startDemo();
      return;
    }
    try {
      const response = await fetch(`${API.baseURL}/auth/me`, { credentials: 'include' });
      if (!response.ok) {
        Auth.clear();
        this.updateAuthUI(false);
        return;
      }
      const payload = await response.json();
      const user = payload?.data?.user;
      if (!user) { Auth.clear(); this.updateAuthUI(false); return; }
      Auth.setUser(user, null);
      this.updateAuthUI(true);
      if (showHome) return;
      this.unlockDashboard();
      if (!user.profileComplete) this.showOwnerProfile(user);
      if (params.has('google_auth')) history.replaceState({}, document.title, location.pathname + location.hash);
    } catch (_) { this.updateAuthUI(!!Auth.isAuthenticated); }
  },
  startDemo() {
    Auth.startDemo();
    document.body.classList.add('demo-active');
    const google = document.getElementById('googleStartBtn'); if (google) google.style.display = 'none';
    const demo = document.getElementById('heroTryDemo'); if (demo) demo.style.display = 'none';
    this.unlockDashboard();
  },
  updateAuthUI(isAuth) {
    const google = document.getElementById('googleStartBtn');
    const dashboard = document.getElementById('myDashboardTrigger');
    const heroDashboard = document.getElementById('heroMyDashboard');
    const logout = document.getElementById('authLogoutBtn');
    if (google) google.style.display = isAuth ? 'none' : 'inline-flex';
    if (dashboard) dashboard.style.display = isAuth ? 'inline-flex' : 'none';
    if (heroDashboard) heroDashboard.style.display = isAuth ? 'inline-flex' : 'none';
    if (logout) logout.style.display = isAuth ? 'inline-flex' : 'none';
    document.body.classList.toggle('returning-user', isAuth);
    const demo = document.getElementById('heroTryDemo');
    if (demo) demo.style.display = (!isAuth && !Auth.isDemoMode()) ? 'inline-flex' : 'none';
    document.body.classList.toggle('demo-active', Auth.isDemoMode());
  },
  showOwnerProfile(user) {
    const modal = document.getElementById('ownerProfileModal');
    if (!modal) return;
    document.getElementById('ownerProfileName').value = user.name || '';
    document.getElementById('ownerProfileEmail').value = user.email || '';
    document.getElementById('ownerProfileTitle').textContent = user.profileComplete ? 'Owner profile' : 'Set up your owner profile';
    document.querySelector('#ownerProfileModal .sub').textContent = user.profileComplete ? 'Update the name shown on your rental records.' : 'Just confirm your name. Your Google email is already verified.';
    document.getElementById('ownerProfileNext').textContent = user.profileComplete ? 'Save changes' : 'Next';
    modal.classList.add('active'); document.body.style.overflow = 'hidden';
  },
  openAuthModal() { window.location.href = `${API.baseURL}/auth/google/start`; },
  returnToHome() {
    Auth.stopDemo?.();
    const url = new URL(window.location.href);
    url.search = '?showHome=1';
    url.hash = '';
    window.location.href = url.toString();
  },
  closeAuthModal() { document.getElementById('ownerProfileModal')?.classList.remove('active'); document.body.style.overflow = ''; },
  unlockDashboard() {
    document.body.classList.add('dashboard-active');
    document.getElementById('siteOverlay')?.setAttribute('aria-hidden','true');
    if (!this._dashboardUnlocked) { this._dashboardUnlocked = true; App.init(); }
    else if (window.App?.loadData) App.loadData().then(() => App.renderCurrentView());
  }
};
document.addEventListener('DOMContentLoaded', () => SiteController.init());
window.SiteController = SiteController;
