// js/overlay-back-guard.js
//
// Makes the device/browser Back (or Previous) button close whatever
// overlay is currently open - Add Tenant/Property/Payment, a delete or
// alert popup, tenant details, the recycle bin, the notifications panel,
// the import/export panel, or an auth modal - instead of navigating the
// user away from the page. Pressing Back again afterwards then behaves
// normally.
//
// This is purely observational: it watches the existing overlay elements
// via a MutationObserver and reacts to a plain browser History API
// push/pop. It does not call into, wrap, or modify any of the app's
// existing open/close functions, so none of that existing behavior
// changes - this only adds what happens when Back is pressed.
(function () {
    'use strict';

    function isAnyOverlayOpen() {
        return !!(
            document.getElementById('modal')?.classList.contains('active') ||
            document.getElementById('documentModal')?.classList.contains('active') ||
            document.getElementById('popupOverlay') ||
            document.getElementById('tenantDetailsOverlay') ||
            document.getElementById('recycleOverlay') ||
            document.getElementById('notifPanel')?.style.display === 'flex' ||
            document.getElementById('dataExportPanel')?.style.display === 'flex' ||
            document.querySelector('.modal-overlay.active')
        );
    }

    function closeTopOverlay() {
        // Close in roughly the order a user would expect the "most on
        // top" overlay to close first. Each call is a no-op if that
        // overlay isn't actually open.
        if (window.Components && typeof Components.closePopup === 'function' && document.getElementById('popupOverlay')) {
            Components.closePopup();
            return;
        }
        if (window.Tenants && typeof Tenants.closeDetails === 'function' && document.getElementById('tenantDetailsOverlay')) {
            Tenants.closeDetails();
            return;
        }
        if (window.Recycle && typeof Recycle.closeOverlay === 'function' && document.getElementById('recycleOverlay')) {
            Recycle.closeOverlay();
            return;
        }
        if (document.getElementById('dataExportPanel')?.style.display === 'flex' && window.DataIO && typeof DataIO.closePanel === 'function') {
            DataIO.closePanel();
            return;
        }
        if (document.getElementById('notifPanel')?.style.display === 'flex' && window.Notifications && typeof Notifications.hidePanel === 'function') {
            Notifications.hidePanel();
            return;
        }
        const authModal = document.querySelector('.modal-overlay.active');
        if (authModal) {
            authModal.classList.remove('active');
            document.body.style.overflow = '';
            return;
        }
        if (document.getElementById('documentModal')?.classList.contains('active')) {
            document.getElementById('documentModal').classList.remove('active');
            return;
        }
        if (window.App && typeof App.closeModal === 'function' && document.getElementById('modal')?.classList.contains('active')) {
            App.closeModal();
        }
    }

    let guardPushed = false;
    let closingFromPopstate = false;

    function sync() {
        const open = isAnyOverlayOpen();
        if (open && !guardPushed) {
            history.pushState({ overlayGuard: true }, '');
            guardPushed = true;
        } else if (!open && guardPushed && !closingFromPopstate) {
            // Overlay was closed some other way (X button, Escape,
            // clicking outside, Cancel, a successful save) - silently
            // consume the placeholder history entry so the next Back
            // press behaves normally instead of doing nothing.
            guardPushed = false;
            history.back();
        }
        closingFromPopstate = false;
    }

    window.addEventListener('popstate', () => {
        if (guardPushed) {
            closingFromPopstate = true;
            guardPushed = false;
            closeTopOverlay();
        }
    });

    let debounce = null;
    const observer = new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(sync, 30);
    });
    observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style']
    });
})();
