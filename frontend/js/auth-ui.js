// Minimal Google-only account controls.
const DashboardAuthBar = {
  init() { this._updateAuthBar(); Auth.addListener(() => this._updateAuthBar()); },
  _updateAuthBar() {
    const user = Auth.user || {};
    const name = document.getElementById('authUserName'); if (name) name.textContent = user.name || 'Google account';
    const email = document.getElementById('authUserEmail'); if (email) email.textContent = user.email || '';
    const avatar = document.getElementById('authUserAvatar'); if (avatar) avatar.textContent = (user.name || user.email || 'G').trim().charAt(0).toUpperCase();
    const badge = document.getElementById('authStatusBadge'); if (badge) { badge.textContent = Auth.isAuthenticated ? 'Google account' : 'Not connected'; badge.className = Auth.isAuthenticated ? 'badge badge-success' : 'badge badge-warning'; }
    const profile = document.getElementById('authProfileBtn'); if (profile) { profile.style.display = Auth.isAuthenticated ? 'inline-flex' : 'none'; profile.textContent = 'Owner profile'; }
    const logout = document.getElementById('authLogoutBtn'); if (logout) logout.style.display = Auth.isAuthenticated ? 'inline-flex' : 'none';
  }
};
document.addEventListener('DOMContentLoaded', () => { DashboardAuthBar.init(); document.getElementById('authProfileBtn')?.addEventListener('click', () => SiteController.showOwnerProfile(Auth.user || {})); });
window.DashboardAuthBar = DashboardAuthBar;
