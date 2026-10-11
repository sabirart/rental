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
    if (!showHome && Auth.isDemoMode()) {
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
      let networkError = null;
      // A hosted backend can briefly return 503 while waking up or restarting.
      // Retry transient failures for every visit, not just the OAuth callback.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch(`${API.baseURL}/auth/me`, { credentials: 'include', cache: 'no-store' });
          networkError = null;
          payload = await response.json().catch(() => ({}));
          if (response.ok && payload.success) break;
          if (response.status < 500 || attempt === 2) break;
        } catch (error) {
          networkError = error;
          if (attempt === 2) break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
      if (!response || !response.ok || !payload.success) {
        this.hideAuthLoading();
        const quotaMessage = payload.code === 'GOOGLE_DRIVE_STORAGE_FULL' || /Drive storage quota|Google Drive storage is full/i.test(payload.error || '');
        const callbackMessage = params.get('message');
        const status = response?.status || 0;
        // A server/network failure does NOT prove that the user's session expired.
        // Preserve any existing user/session state and explain the actual failure.
        if (status >= 500 || status === 0 || networkError) {
          this.showAuthError(status, payload, networkError);
          if (authCallback) history.replaceState({}, document.title, location.pathname + location.hash);
          return;
        }
        Auth.clear();
        this.updateAuthUI(false);
        if (authCallback && params.get('google_auth') === 'error') {
          this.showAuthError(status, { ...payload, error: callbackMessage || payload.error || 'Google sign-in was not completed.' });
        } else if (quotaMessage) {
          this.showAuthError(status, { ...payload, error: payload.error || 'Free up space in Google Drive, Gmail, or Google Photos, then try again.' });
        } else if (authCallback && status !== 401) {
          this.showAuthError(status, payload);
        }
        if (authCallback) history.replaceState({}, document.title, location.pathname + location.hash);
        return;
      }
      const user = payload?.data?.user;
      if (!user) { Auth.clear(); this.updateAuthUI(false); this.hideAuthLoading(); return; }
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
      if (authCallback) {
        window.Components?.showError?.('Google Sign-In', 'Could not finish connecting to Google. Please check your connection and try again.');
        history.replaceState({}, document.title, location.pathname + location.hash);
      }
    }
  },
  showAuthError(status = 0, payload = {}, networkError = null) {
    document.getElementById('authDiagnosticPanel')?.remove();
    const raw = String(payload?.error || payload?.message || '').trim();
    let heading = 'Could not check your account';
    let explanation = 'The website could not confirm whether you are signed in.';
    let nextStep = 'Try again. If the problem continues, contact the website administrator.';
    if (status === 503) {
      heading = 'Server temporarily unavailable (503)';
      explanation = 'The Rental Manager server is not ready to respond. On Render, this can happen while the service is waking up, restarting, or experiencing an outage. This is a server-side problem, not a wrong Google password.';
      nextStep = 'Wait 30–60 seconds and select Try again. If it keeps happening, check the Render service logs and deployment status.';
    } else if (status === 502 || status === 504) {
      heading = `Server connection problem (${status})`;
      explanation = 'The hosting service did not receive a valid response from the Rental Manager backend. The backend may be starting, overloaded, or unavailable.';
      nextStep = 'Wait briefly and try again. If repeated, check the hosting service and backend logs.';
    } else if (status >= 500) {
      heading = `Server error (${status})`;
      explanation = 'The backend returned a server error while checking your login. The website cannot safely determine your account status until the server is healthy.';
      nextStep = 'Try again later. If it repeats, the backend logs are needed to identify the server-side cause.';
    } else if (!status || networkError) {
      heading = 'Could not reach the server';
      explanation = 'The request failed before the website received a response. Your internet connection, server availability, or browser network settings may be responsible.';
      nextStep = 'Check your internet connection and try again. If other pages work but this persists, check the backend URL and hosting status.';
    } else if (status === 401) {
      heading = 'Google session not found';
      explanation = 'The server did not find an active login session. This can happen if the login cookie was not saved or has expired.';
      nextStep = 'Select Continue with Google again. If it loops, check OAuth callback and cookie settings on the server.';
    } else if (status === 403) {
      heading = 'Access was denied (403)';
      explanation = 'The server received the request but refused access. This is usually caused by account permissions or server configuration.';
      nextStep = 'Check the account permissions and server configuration, then try again.';
    } else if (status === 404) {
      heading = 'Login endpoint not found (404)';
      explanation = 'The configured backend does not have the expected account-check endpoint. The frontend and backend deployment may be out of sync.';
      nextStep = 'Deploy the matching backend version and verify the API base URL.';
    }
    const panel = document.createElement('section');
    panel.id = 'authDiagnosticPanel';
    panel.setAttribute('role', 'alert');
    panel.setAttribute('aria-live', 'assertive');
    panel.innerHTML = `<div class="auth-diagnostic-card"><div class="auth-diagnostic-mark" aria-hidden="true">!</div><h2 class="auth-diagnostic-title"></h2><p class="auth-diagnostic-explanation"></p><p class="auth-diagnostic-next"></p><details class="auth-diagnostic-details"><summary>Technical details</summary><code class="auth-diagnostic-code"></code></details><div class="auth-diagnostic-actions"><button type="button" class="auth-diagnostic-retry">Try again</button><button type="button" class="auth-diagnostic-close">Close</button></div></div>`;
    const style = document.createElement('style');
    style.textContent = '#authDiagnosticPanel{position:fixed;inset:0;z-index:1000001;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(18,24,34,.48);backdrop-filter:blur(3px);font-family:inherit;color:#202124}#authDiagnosticPanel .auth-diagnostic-card{width:min(100%,520px);max-height:90vh;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:26px;box-shadow:0 20px 70px rgba(0,0,0,.2)}#authDiagnosticPanel .auth-diagnostic-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#fff0e5;color:#a63d00;font-weight:800;font-size:21px}#authDiagnosticPanel h2{font-size:19px;margin:14px 0 10px}#authDiagnosticPanel p{font-size:14px;line-height:1.55;color:#4b5563;margin:8px 0}#authDiagnosticPanel .auth-diagnostic-next{padding:11px 12px;background:#f6f7f9;border-radius:8px}#authDiagnosticPanel details{margin-top:14px;font-size:12px;color:#6b7280}#authDiagnosticPanel summary{cursor:pointer}#authDiagnosticPanel code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px}#authDiagnosticPanel .auth-diagnostic-actions{display:flex;gap:10px;margin-top:20px}#authDiagnosticPanel button{border:1px solid #d1d5db;border-radius:8px;padding:10px 16px;cursor:pointer;font:inherit;font-size:14px}#authDiagnosticPanel .auth-diagnostic-retry{background:#1a73e8;color:#fff;border-color:#1a73e8}#authDiagnosticPanel .auth-diagnostic-close{background:#fff;color:#374151}';
    document.getElementById('authDiagnosticStyles')?.remove();
    style.id = 'authDiagnosticStyles'; document.head.appendChild(style);
    panel.querySelector('.auth-diagnostic-title').textContent = heading;
    panel.querySelector('.auth-diagnostic-explanation').textContent = explanation;
    panel.querySelector('.auth-diagnostic-next').textContent = nextStep;
    panel.querySelector('.auth-diagnostic-code').textContent = `Request: GET ${API.baseURL}/auth/me\nHTTP status: ${status || 'No response'}\nServer message: ${raw || 'No server error message returned'}${networkError ? `\nNetwork error: ${networkError.message || 'Request failed'}` : ''}`;
    panel.querySelector('.auth-diagnostic-retry').addEventListener('click', () => { panel.remove(); this.restoreSession(); });
    panel.querySelector('.auth-diagnostic-close').addEventListener('click', () => panel.remove());
    document.body.appendChild(panel);
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
