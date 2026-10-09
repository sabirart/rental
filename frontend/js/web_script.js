// Google OAuth is handled server-side so identity and Drive permissions are granted together.
(async function () {
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('ownerProfileModal');
    modal?.addEventListener('click', e => { if (e.target === modal) e.stopPropagation(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal?.classList.contains('active')) e.preventDefault(); });
  });
  const params = new URLSearchParams(location.search);
  if (params.get('google_auth') === 'error') {
    const msg = params.get('message') || 'Google sign-in could not be completed.';
    window.Components?.showError?.('Google Sign-In', msg);
    history.replaceState({}, document.title, location.pathname + location.hash);
  }
})();
