// Internal app topbar: Google button for guests; clickable avatar for signed-in users.
const DashboardAuthBar = {
  init() {
    this._updateAuthBar();
    Auth.addListener(() => this._updateAuthBar());
    ['authUserProfileTrigger','mobileAuthProfileBtn'].forEach(id => document.getElementById(id)?.addEventListener('click', () => SiteController.showOwnerProfile(Auth.user || {})));
  },
  _setAvatar(el, user) {
    if (!el) return;
    const pic = user?.profilePic || '';
    if (pic) { el.innerHTML = ''; const img = document.createElement('img'); img.src = pic; img.alt = ''; img.referrerPolicy = 'no-referrer'; el.appendChild(img); }
    else el.textContent = (user?.name || user?.email || 'G').trim().charAt(0).toUpperCase();
  },
  _updateAuthBar() {
    const user = Auth.user || {};
    const authenticated = !!Auth.isAuthenticated;
    ['appGoogleStartBtn','mobileGoogleStartBtn'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display=authenticated?'none':'inline-flex'; });
    ['authUserProfileTrigger','mobileAuthProfileBtn'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display=authenticated?'inline-flex':'none'; });
    this._setAvatar(document.getElementById('authUserAvatar'), user);
    this._setAvatar(document.getElementById('mobileAuthUserAvatar'), user);
    ['returnHomeBtn','returnHomeBtnMobile'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display=authenticated?'none':'inline-flex'; });
    const profile = document.getElementById('authProfileBtn'); if (profile) profile.style.display='none';
    const logout = document.getElementById('authLogoutBtn'); if (logout) logout.style.display='none';
  }
};
document.addEventListener('DOMContentLoaded', () => DashboardAuthBar.init());
window.DashboardAuthBar = DashboardAuthBar;
