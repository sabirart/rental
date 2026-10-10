// js/actions.js - delegated click handling for data-rm-action attributes.
// Replaces inline onclick="..." handlers so the Content-Security-Policy can forbid
// inline script execution entirely. Markup only carries data-* attributes; the
// behaviour lives here.
(function () {
    'use strict';

    const num = (v) => Number(v);
    const actions = {
        'app-refresh': () => App.refreshData(),
        'goto-payments': () => App.navigateTo('payments'),
        'close-documents': () => App.closeDocumentModal(),
        'close-tenant-details': () => Tenants.closeDetails(),
        'close-recycle': () => Recycle.closeOverlay(),
        'tenant-receipt': (el) => Tenants.generateReceipt(el.dataset.tenantId, num(el.dataset.year), num(el.dataset.month)),
        'tenant-contact': (el, e) => { e.preventDefault(); Tenants.showContactOptions(el.dataset.tenantId); },
        'edit-payment': (el) => Payments.editPayment(el.dataset.paymentId, el.dataset.tenantId),
        'room-edit': (el) => Properties.editRoom(el.dataset.propertyId, num(el.dataset.room)),
        'room-remove': (el) => Properties.removeRoom(el.dataset.propertyId, num(el.dataset.room)),
        'room-add': (el) => Properties.addRoom(el.dataset.propertyId),
        'room-update': (el) => Properties.updateRoom(el.dataset.propertyId, num(el.dataset.room))
    };

    function dispatch(e) {
        const el = e.target.closest && e.target.closest('[data-rm-action]');
        if (!el) return;
        const handler = actions[el.dataset.rmAction];
        if (!handler) return;
        try { handler(el, e); } catch (error) { console.error('Action failed:', el.dataset.rmAction, error); }
    }

    document.addEventListener('click', dispatch);
    // Elements exposed with role="button" must also work from the keyboard.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest && e.target.closest('[data-rm-action][role="button"]');
        if (!el || el !== e.target) return;
        e.preventDefault();
        dispatch(e);
    });

    window.RMActions = { actions };
})();
