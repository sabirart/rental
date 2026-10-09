// Internal app topbar: Google button for guests; clickable avatar for signed-in users.
const DashboardAuthBar = {
  _initialized: false,
  init() {
    if (this._initialized) return;
    this._initialized = true;
    // Place the signed-in avatar on the right, after notifications.
    const desktopRight = document.querySelector('#authBar .auth-bar-right');
    const desktopProfile = document.getElementById('authUserProfileTrigger');
    if (desktopRight && desktopProfile) desktopRight.appendChild(desktopProfile);
    const mobileRight = document.querySelector('#mobileTopbar .app-topbar-right');
    const mobileProfile = document.getElementById('mobileAuthProfileBtn');
    if (mobileRight && mobileProfile) mobileRight.appendChild(mobileProfile);
    this._updateAuthBar();
    Auth.addListener(() => this._updateAuthBar());
    ['authUserProfileTrigger','mobileAuthProfileBtn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => SiteController.showOwnerProfile(Auth.user || {})));
  },
  _setAvatar(el, user) {
    if (!el) return;
    const pic = user?.profilePic || user?.picture || '';
    const initial = (user?.name || user?.email || 'G').trim().charAt(0).toUpperCase() || 'G';
    if (pic) { el.innerHTML = ''; const img = document.createElement('img'); img.src = pic; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = () => { el.textContent = initial; }; el.appendChild(img); }
    else el.textContent = initial;
  },
  _updateAuthBar() {
    const user = Auth.user || {};
    const authenticated = !!Auth.isAuthenticated;
    ['appGoogleStartBtn','mobileGoogleStartBtn'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display=authenticated?'none':'inline-flex'; });
    ['authUserProfileTrigger','mobileAuthProfileBtn'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display=authenticated?'inline-flex':'none'; });
    this._setAvatar(document.getElementById('authUserAvatar'), user);
    this._setAvatar(document.getElementById('mobileAuthUserAvatar'), user);
    ['returnHomeBtn','returnHomeBtnMobile','returnHomeBtnAuth','returnHomeBtnMobileAuth'].forEach(id => { const el=document.getElementById(id); if(el) el.remove(); });
    
    const profile = document.getElementById('authProfileBtn'); if (profile) profile.style.display='none';
    const logout = document.getElementById('authLogoutBtn'); if (logout) logout.style.display='none';
    const siteLogout = document.getElementById('siteSignOutBtn'); if (siteLogout) siteLogout.style.display = authenticated ? 'inline-flex' : 'none';
  }
};
document.addEventListener('DOMContentLoaded', () => DashboardAuthBar.init());
window.DashboardAuthBar = DashboardAuthBar;
