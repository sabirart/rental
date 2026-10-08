// Global interaction safety layer for RentalManager 2.0.
(function () {
  'use strict';
  function closeDocument(){ if(window.App?.closeDocumentModal) App.closeDocumentModal(); else document.getElementById('documentModal')?.classList.remove('active'); }
  function closeAuth(){ document.querySelectorAll('.modal-overlay.active').forEach(m=>m.classList.remove('active')); if(window.App?._syncOverlayScrollLock) App._syncOverlayScrollLock(); else document.body.style.overflow=''; }
  function closeEverything(){
    if(window.Components?.isPopupActive?.()){ Components.closePopup(); return true; }
    if(document.getElementById('tenantDetailsOverlay') && window.Tenants?.closeDetails){ Tenants.closeDetails(); return true; }
    if(document.getElementById('recycleOverlay') && window.Recycle?.closeOverlay){ Recycle.closeOverlay(); return true; }
    if(document.getElementById('documentModal')?.classList.contains('active')){ closeDocument(); return true; }
    if(document.getElementById('modal')?.classList.contains('active') && window.App?.closeModal){ App.closeModal(); return true; }
    if(document.querySelector('.modal-overlay.active')){ closeAuth(); return true; }
    if(document.getElementById('notifPanel')?.style.display==='flex' && window.Notifications?.hidePanel){ Notifications.hidePanel(); return true; }
    if(document.getElementById('dataExportPanel')?.style.display==='flex' && window.DataIO?.closePanel){ DataIO.closePanel(); return true; }
    return false;
  }
  document.addEventListener('click', function(e){
    const close = e.target.closest?.('.modal-close,.tenant-details-close,.recycle-close,.popup-close-x,[data-close-overlay]');
    if(close){
      const doc=close.closest('#documentModal'); if(doc){e.preventDefault(); closeDocument(); return;}
      const tenant=close.closest('#tenantDetailsOverlay'); if(tenant && window.Tenants?.closeDetails){e.preventDefault();Tenants.closeDetails();return;}
      const recycle=close.closest('#recycleOverlay'); if(recycle && window.Recycle?.closeOverlay){e.preventDefault();Recycle.closeOverlay();return;}
    }
    const modal=e.target.closest?.('.modal');
    if(modal && e.target===modal){ if(modal.id==='documentModal') closeDocument(); else if(modal.id==='modal'&&window.App?.closeModal) App.closeModal(); }
  }, true);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeEverything(); });
  window.closeEverything=closeEverything;
})();
