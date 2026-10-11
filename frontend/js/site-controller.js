// Google-only entry and owner profile setup.
const SiteController = {
  _dashboardUnlocked: false,
  init() {
    Auth.init();
    const startGoogle = () => {
      this.showAuthLoading('Connecting to Google…');
      const button = document.getElementById('googleStartBtn');
      if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
      window.location.href = `${API.baseURL}/auth/google/start`;
    };
    document.getElementById('googleStartBtn')?.addEventListener('click', startGoogle);
    ['appGoogleStartBtn','mobileGoogleStartBtn'].forEach(id => document.getElementById(id)?.addEventListener('click', startGoogle));
    document.getElementById('ownerProfilePhotoButton')?.addEventListener('click', () => document.getElementById('ownerProfilePhotoInput')?.click());
    document.getElementById('ownerProfilePhotoInput')?.addEventListener('change', e => this.handleProfilePhoto(e));
    ['siteBrandHome','mobileWebsiteBrand','appBrandHome'].forEach(id => document.getElementById(id)?.addEventListener('click', e => { e.preventDefault(); this.returnToHome(); }));
    document.getElementById('heroTryDemo')?.addEventListener('click', e => { e.preventDefault(); this.startDemo(); });
    document.getElementById('myDashboardTrigger')?.addEventListener('click', e => { e.preventDefault(); this.unlockDashboard(); });
    document.getElementById('heroMyDashboard')?.addEventListener('click', e => { e.preventDefault(); this.unlockDashboard(); });
    document.getElementById('siteSignOutBtn')?.addEventListener('click', () => Auth.logout());
    const profileModal = document.getElementById('ownerProfileModal');
    profileModal?.addEventListener('click', e => { if (e.target === profileModal && Auth.user?.profileComplete) this.closeAuthModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && profileModal?.classList.contains('active') && Auth.user?.profileComplete) this.closeAuthModal(); });
    document.getElementById('ownerProfileForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name = document.getElementById('ownerProfileName').value.trim();
      const photo = document.getElementById('ownerProfilePhotoPreview');
      const profilePic = photo?.dataset?.profilePic || Auth.user?.profilePic || null;
      const error = document.getElementById('ownerProfileError');
      error.textContent = ''; error.style.display = 'none';
      if (!name) { error.textContent = 'Please enter your name.'; error.style.display = 'block'; return; }
      const btn = document.getElementById('ownerProfileNext'); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const result = await Auth.updateProfile({ name, profilePic, profileComplete: true });
        Auth.setUser(result.user, null);
        document.getElementById('ownerProfileModal').classList.remove('active');
        document.body.style.overflow = '';
        this.updateAuthUI(true);
        this.unlockDashboard();
      } catch (err) { error.textContent = err.message || 'Could not save your profile. Please try again.'; error.style.display = 'block'; }
      finally { btn.disabled = false; btn.textContent = Auth.user?.profileComplete ? 'Save changes' : 'Next'; }
    });
    this.restoreSession();
  },
  async restoreSession() {
    const params = new URLSearchParams(location.search);
    const showHome = params.has('showHome');
    const authCallback = params.has('google_auth');
    if (authCallback) this.showAuthLoading(params.get('google_auth') === 'success' ? 'Finishing Google sign-in…' : 'Checking your Google account…');
    if (showHome) {
      Auth.stopDemo?.();
      document.body.classList.remove('dashboard-active', 'demo-active');
      document.getElementById('siteOverlay')?.setAttribute('aria-hidden', 'false');
      history.replaceState({}, document.title, location.pathname);
    }
    // A real Google OAuth return must always verify the server session first.
    // Previously a demo-mode flag left in sessionStorage could short-circuit this
    // flow, so the browser ignored the freshly-created Google session cookie.
    if (authCallback) Auth.stopDemo?.();
    if (!showHome && !authCallback && Auth.isDemoMode()) {
      this.hideAuthLoading();
      this.updateAuthUI(false);
      this.startDemo();
      return;
    }
    try {
      let response;
      let payload = {};
      // OAuth has just redirected back after setting the session cookie. Retry a
      // few times for a cold-starting backend rather than immediately showing the
      // Google button again after a successful consent screen.
      for (let attempt = 0; attempt < (authCallback && params.get('google_auth') === 'success' ? 3 : 1); attempt++) {
        try {
          response = await fetch(`${API.baseURL}/auth/me`, { credentials: 'include', cache: 'no-store' });
          payload = await response.json().catch(() => ({}));
          if (response.ok && payload.success) break;
        } catch (_) { /* retry only during the OAuth return flow */ }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)));
      }
      if (!response || !response.ok || !payload.success) {
        this.hideAuthLoading();
        const status = response?.status || 0;
        const callbackMessage = params.get('message');
        const callbackCode = params.get('code') || payload.code || '';
        const quotaMessage = callbackCode === 'GOOGLE_DRIVE_STORAGE_FULL' || /Drive storage quota|Google Drive storage is full/i.test(payload.error || callbackMessage || '');
        const lockUnavailable = callbackCode === 'WRITE_LOCK_UNAVAILABLE' || /shared data protection is temporarily unavailable/i.test(callbackMessage || payload.error || '');
        const transientServerFailure = status === 503 || status >= 500 || !response;
        // A transient API outage is not proof that the user is signed out. Keep
        // any cached identity and explain the failure instead of silently resetting the UI.
        if (!transientServerFailure) Auth.clear();
        this.updateAuthUI(transientServerFailure ? !!Auth.isAuthenticated : false);
        if (authCallback && params.get('google_auth') === 'error') {
          const title = lockUnavailable ? 'Rental Manager database unavailable' : quotaMessage ? 'Google Drive storage is full' : 'Google Sign-In';
          const message = lockUnavailable
            ? 'Google verified your account, but Rental Manager could not reach its shared database protection service. Your sign-in was not completed and no changes were saved. This is a server configuration/availability issue; please try again later or contact the site administrator.'
            : callbackMessage || payload.error || 'Google sign-in could not be completed. Please try again.';
          this.showAuthError(title, message);
        } else if (quotaMessage) {
          this.showAuthError('Google Drive storage is full', payload.error || 'Free up space in Google Drive, Gmail, or Google Photos, then sign in again.');
        } else if (transientServerFailure) {
          const message = status === 503
            ? (payload.error || 'The Rental Manager server is temporarily unavailable (HTTP 503). Your account has not been signed out; please retry in a few minutes.')
            : status >= 500
              ? (payload.error || `The Rental Manager server returned an error (HTTP ${status}). Please retry shortly.`)
              : 'The Rental Manager server could not be reached. Check your internet connection and try again.';
          this.showAuthError('Unable to connect to Rental Manager', message);
        } else if (authCallback) {
          this.showAuthError('Google Sign-In failed', payload.error || 'Your session could not be verified. Please sign in again.');
        }
        if (authCallback) history.replaceState({}, document.title, location.pathname + location.hash);
        return;
      }
      const user = payload?.data?.user;
      if (!user) { Auth.clear(); this.updateAuthUI(false); this.hideAuthLoading(); if (authCallback) this.showAuthError('Sign-in could not be completed', 'Google returned to Rental Manager, but the server did not provide a valid signed-in session. No account changes were made. Please retry.'); return; }
      Auth.setUser(user, null);
      this.updateAuthUI(true);
      this.hideAuthLoading();
      if (showHome) return;
      // After a successful Google sign-in, take the user into their account.
      // First-time users complete the owner profile before the dashboard opens.
      if (!user.profileComplete) this.showOwnerProfile(user);
      else if (authCallback) this.unlockDashboard();
      if (authCallback) history.replaceState({}, document.title, location.pathname + location.hash);
    } catch (error) {
      this.hideAuthLoading();
      this.updateAuthUI(!!Auth.isAuthenticated);
      this.showAuthError('Connection problem', 'Rental Manager could not verify your sign-in because the server could not be reached. Check the connection and retry. If this continues, the site administrator must check the server and database logs. No changes were saved.');
      if (authCallback) history.replaceState({}, document.title, location.pathname + location.hash);
    }
  },
  showAuthError(title, message) {
    // showError() accepts a single message, not (title, message). Use showAlert
    // so authentication failures have a real title, readable details and a retry action.
    const retry = () => { window.location.href = `${API.baseURL}/auth/google/start`; };
    if (window.Components?.showAlert) {
      window.Components.showAlert(title, message, 'Try again', 'danger', retry);
      return;
    }
    // Last-resort visible feedback if the shared popup component did not load.
    window.alert(`${title}\n\n${message}`);
  },
  showAuthLoading(message = 'Connecting to Google…') {
    let overlay = document.getElementById('authLoadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'authLoadingOverlay';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.innerHTML = `<div class="auth-loading-card"><span class="auth-loading-spinner" aria-hidden="true"></span><strong class="auth-loading-title"></strong><span class="auth-loading-subtitle">Please wait while we securely connect your account.</span></div>`;
      overlay.style.cssText = 'position:fixed;inset:0;z-index:1000000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(248,249,251,.94);backdrop-filter:blur(4px);font-family:inherit;color:#202124;';
      const style = document.createElement('style');
      style.id = 'authLoadingOverlayStyles';
      style.textContent = '#authLoadingOverlay .auth-loading-card{width:min(100%,340px);display:flex;flex-direction:column;align-items:center;gap:14px;padding:28px 24px;background:#fff;border:1px solid #e7e9ed;border-radius:16px;box-shadow:0 12px 36px rgba(20,25,35,.08);text-align:center}#authLoadingOverlay .auth-loading-spinner{width:30px;height:30px;border:3px solid #e7e9ed;border-top-color:#4285f4;border-radius:50%;animation:authSpin .8s linear infinite}#authLoadingOverlay .auth-loading-title{font-size:15px;font-weight:600}#authLoadingOverlay .auth-loading-subtitle{font-size:13px;line-height:1.5;color:#6b7280}@keyframes authSpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(style);
      document.body.appendChild(overlay);
    }
    const title = overlay.querySelector('.auth-loading-title');
    if (title) title.textContent = message;
    overlay.style.display = 'flex';
  },
  hideAuthLoading() {
    const overlay = document.getElementById('authLoadingOverlay');
    if (overlay) overlay.remove();
    const button = document.getElementById('googleStartBtn');
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
  },
  startDemo() {
    Auth.startDemo();
    document.body.classList.add('demo-active');
    const google = document.getElementById('googleStartBtn'); if (google) google.style.display = 'none';
    const demo = document.getElementById('heroTryDemo'); if (demo) demo.style.display = 'none';
    this.unlockDashboard();
  },
  updateAuthUI(isAuth) {
    const siteLogout = document.getElementById('siteSignOutBtn');
    if (siteLogout) siteLogout.style.display = isAuth ? 'inline-flex' : 'none';
    const heroDemo = document.getElementById('heroTryDemo');
    const heroDash = document.getElementById('heroMyDashboard');
    if (heroDemo) heroDemo.style.display = isAuth ? 'none' : 'inline-flex';
    if (heroDash) heroDash.style.display = isAuth ? 'inline-flex' : 'none';
    const google = document.getElementById('googleStartBtn');
    const dashboard = document.getElementById('myDashboardTrigger');
    const heroDashboard = document.getElementById('heroMyDashboard');
    const logout = document.getElementById('authLogoutBtn');
    if (google) google.style.display = isAuth ? 'none' : 'inline-flex';
    // The public site's topbar is for sign-in/sign-out only; Dashboard lives
    // in the hero CTA. Never show two competing dashboard buttons up top.
    if (dashboard) dashboard.style.display = 'none';
    if (heroDashboard) { heroDashboard.style.display = isAuth ? 'inline-flex' : 'none'; heroDashboard.textContent = 'Open Dashboard'; }
    if (logout) logout.style.display = 'none';
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
    const photo = document.getElementById('ownerProfilePhotoPreview');
    const fallback = document.getElementById('ownerProfilePhotoFallback');
    const rawCurrentPhoto = user.profilePic || user.picture || '';
    const currentPhoto = (typeof safeImageSource === 'function') ? safeImageSource(rawCurrentPhoto) : '';
    if (photo) { photo.dataset.profilePic = currentPhoto; if (currentPhoto) photo.src = currentPhoto; else photo.removeAttribute('src'); photo.style.display = currentPhoto ? 'block' : 'none'; }
    if (fallback) fallback.style.display = currentPhoto ? 'none' : 'grid';
    const picker = document.getElementById('ownerProfilePhotoInput'); if (picker) picker.value = '';
    modal.classList.add('active'); document.body.style.overflow = 'hidden';
  },
  async handleProfilePhoto(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const error = document.getElementById('ownerProfileError');
    if (!file.type.startsWith('image/')) { if(error){error.textContent='Choose an image file.';error.style.display='block';} event.target.value=''; return; }
    try {
      const image = await new Promise((resolve, reject) => { const img=new Image(); img.onload=()=>resolve(img); img.onerror=reject; img.src=URL.createObjectURL(file); });
      const canvas=document.createElement('canvas'); const scale=Math.min(1,512/Math.max(image.width,image.height)); canvas.width=Math.max(1,Math.round(image.width*scale)); canvas.height=Math.max(1,Math.round(image.height*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height); const data=canvas.toDataURL('image/jpeg',0.82); URL.revokeObjectURL(image.src);
      const preview=document.getElementById('ownerProfilePhotoPreview'); const fallback=document.getElementById('ownerProfilePhotoFallback');
      preview.src=data; preview.dataset.profilePic=data; preview.style.display='block'; if(fallback)fallback.style.display='none'; if(error){error.textContent='';error.style.display='none';}
    } catch (_) { if(error){error.textContent='Could not read that image. Try another photo.';error.style.display='block';} }
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
