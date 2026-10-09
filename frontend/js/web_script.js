// Google OAuth is handled server-side so identity and Drive permissions are granted together.
(async function () {
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('ownerProfileModal');
    modal?.addEventListener('click', e => { if (e.target === modal) e.stopPropagation(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal?.classList.contains('active')) e.preventDefault(); });
  });
  // SiteController handles the OAuth callback state so the loading screen stays visible
  // until the session check finishes and only one clear error popup is shown.
})();
