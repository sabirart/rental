// js/a11y.js - keyboard accessibility for dialogs: focus moves into a dialog when it opens,
// Tab/Shift+Tab stay inside it, and focus returns to the control that opened it.
(function () {
    'use strict';
    const DIALOG = '[role="dialog"], [aria-modal="true"], .modal-overlay.active, #modal.active, #documentModal.active';
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const opener = new WeakMap();

    const visible = (el) => {
        if (!el || !el.isConnected) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (el.matches('.modal, .modal-overlay') && !el.classList.contains('active') && cs.display === 'none') return false;
        return el.getClientRects().length > 0 || cs.position === 'fixed';
    };
    const openDialogs = () => [...document.querySelectorAll(DIALOG)].filter(visible);
    const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed');

    let known = new Set();
    function sync() {
        const now = new Set(openDialogs());
        now.forEach((d) => {
            if (known.has(d)) return;
            opener.set(d, document.activeElement);
            const first = focusables(d)[0];
            if (first && !d.contains(document.activeElement)) first.focus({ preventScroll: true });
            else if (!first) { d.setAttribute('tabindex', '-1'); d.focus({ preventScroll: true }); }
        });
        known.forEach((d) => {
            if (now.has(d)) return;
            const back = opener.get(d);
            if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
            opener.delete(d);
        });
        known = now;
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const dialogs = openDialogs();
        const top = dialogs[dialogs.length - 1];
        if (!top) return;
        const items = focusables(top);
        if (!items.length) { e.preventDefault(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !top.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !top.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });

    let scheduled = false;
    const observer = new MutationObserver(() => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; sync(); }); });
    function start() { observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] }); sync(); }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    window.A11y = { sync };
})();
