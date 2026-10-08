// js/manage-account.js - Manage Account overlay: details, password, delete

(function() {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function showMsg(el, message) {
        if (!el) return;
        el.textContent = message;
        el.style.display = 'block';
    }
    function hideMsg(el) {
        if (!el) return;
        el.style.display = 'none';
        el.textContent = '';
    }

    function switchTab(tabName) {
        document.querySelectorAll('.manage-account-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        document.querySelectorAll('.manage-account-panel').forEach(panel => {
            panel.style.display = panel.dataset.panel === tabName ? 'block' : 'none';
        });
    }

    function open() {
        const user = Auth.user || {};

        $('manageAccountEmail').textContent = user.email || '';
        $('manageAccountName').value = user.name || '';
        $('manageAccountEmailField').value = user.email || '';

        ['manageAccountDetailsError', 'manageAccountDetailsSuccess', 'manageAccountPasswordError',
         'manageAccountPasswordSuccess', 'manageAccountDeleteError'].forEach(id => hideMsg($(id)));

        switchTab('details');
        applyPasswordState(user);
        SiteController.openAuthModal('manageAccount');

        // hasPassword can be stale on the cached user object (e.g. right
        // after a Google login before /auth/me has ever been called), so
        // refresh it in the background and re-apply once we know for sure.
        if (typeof Auth.fetchMe === 'function') {
            Auth.fetchMe().then((freshUser) => applyPasswordState(freshUser)).catch(() => {});
        }
    }

    // Adjusts the Password tab and Delete-account panel based on whether
    // the account currently has a password set. Every account - Google or
    // not - gets the Password tab; accounts without a password see a
    // "Create Password" flow (no current-password field) instead of
    // "Change Password", and Delete Account is blocked with a pointer to
    // that tab until a password exists to confirm the deletion with.
    function applyPasswordState(user) {
        const hasPassword = !!(user && user.hasPassword);

        const passwordTab = $('manageAccountPasswordTab');
        if (passwordTab) passwordTab.textContent = hasPassword ? 'Change Password' : 'Create Password';

        const hint = $('manageAccountPasswordHint');
        if (hint) hint.style.display = hasPassword ? 'none' : 'block';

        const currentPasswordGroup = $('manageAccountCurrentPasswordGroup');
        const currentPasswordInput = $('manageAccountCurrentPassword');
        if (currentPasswordGroup) currentPasswordGroup.style.display = hasPassword ? '' : 'none';
        if (currentPasswordInput) currentPasswordInput.required = hasPassword;

        const submitBtn = $('manageAccountPasswordSubmitBtn');
        if (submitBtn) submitBtn.textContent = hasPassword ? 'Change Password' : 'Create Password';

        const deletePasswordGroup = $('manageAccountDeletePasswordGroup');
        const deleteNoPasswordHint = $('manageAccountDeleteNoPasswordHint');
        const deleteSubmitBtn = $('manageAccountDeleteSubmitBtn');
        const deletePasswordInput = $('manageAccountDeletePassword');
        if (deletePasswordGroup) deletePasswordGroup.style.display = hasPassword ? '' : 'none';
        if (deleteNoPasswordHint) deleteNoPasswordHint.style.display = hasPassword ? 'none' : 'block';
        if (deletePasswordInput) deletePasswordInput.required = hasPassword;
        if (deleteSubmitBtn) deleteSubmitBtn.disabled = !hasPassword;
    }

    function close() {
        SiteController.closeAuthModal('manageAccount');
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('manageAccountClose')?.addEventListener('click', close);

        document.querySelectorAll('.manage-account-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        $('manageAccountDetailsForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = $('manageAccountDetailsError');
            const successEl = $('manageAccountDetailsSuccess');
            hideMsg(errorEl);
            hideMsg(successEl);

            const name = $('manageAccountName').value.trim();
            if (!name) {
                showMsg(errorEl, 'Name is required.');
                return;
            }

            try {
                await Auth.updateProfile({ name });
                showMsg(successEl, 'Account details updated.');
                if (typeof DashboardAuthBar !== 'undefined') DashboardAuthBar._updateAuthBar();
            } catch (err) {
                showMsg(errorEl, err.message || 'Failed to update account details.');
            }
        });

        $('manageAccountPasswordForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = $('manageAccountPasswordError');
            const successEl = $('manageAccountPasswordSuccess');
            hideMsg(errorEl);
            hideMsg(successEl);

            const hasPassword = !!(Auth.user && Auth.user.hasPassword);
            const currentPassword = $('manageAccountCurrentPassword').value;
            const newPassword = $('manageAccountNewPassword').value;
            const confirmPassword = $('manageAccountConfirmPassword').value;

            // For accounts WITHOUT a password, currentPassword is NOT required
            // For accounts WITH a password, it IS required
            if (hasPassword && !currentPassword) {
                showMsg(errorEl, 'Current password is required.');
                return;
            }
            if (newPassword.length < 6) {
                showMsg(errorEl, 'New password must be at least 6 characters.');
                return;
            }
            if (newPassword !== confirmPassword) {
                showMsg(errorEl, 'New passwords do not match.');
                return;
            }

            try {
                // Send currentPassword ONLY if the account has one
                const payload = {};
                if (hasPassword) {
                    payload.currentPassword = currentPassword;
                }
                payload.newPassword = newPassword;
                
                await Auth.changePassword(payload);
                showMsg(successEl, hasPassword ? 'Password changed successfully.' : 'Password created successfully.');
                $('manageAccountPasswordForm').reset();
                // The account now definitely has a password - update the
                // cached user and re-render this panel + the Delete tab so
                // deletion is no longer blocked.
                Auth.setUser({ ...Auth.user, hasPassword: true }, Auth._token);
                applyPasswordState(Auth.user);
            } catch (err) {
                showMsg(errorEl, err.message || 'Failed to change password.');
            }
        });

        $('manageAccountGoCreatePassword')?.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('password');
        });

        $('manageAccountDeleteForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = $('manageAccountDeleteError');
            hideMsg(errorEl);

            if (!(Auth.user && Auth.user.hasPassword)) {
                showMsg(errorEl, 'Please create a password first before deleting your account.');
                switchTab('password');
                return;
            }

            const password = $('manageAccountDeletePassword').value;

            const doDelete = async () => {
                try {
                    await Auth.deleteAccount(password);
                    close();
                    window.location.reload();
                } catch (err) {
                    showMsg(errorEl, err.message || 'Failed to delete account.');
                }
            };

            if (typeof Components !== 'undefined' && Components.showConfirm) {
                Components.showConfirm(
                    'Delete Account?',
                    'This permanently deletes your account and all of your properties, tenants, and payment records. This cannot be undone.',
                    'Delete Permanently',
                    'Cancel',
                    'danger',
                    doDelete
                );
            } else if (window.confirm('Permanently delete your account? This cannot be undone.')) {
                await doDelete();
            }
        });
    });

    window.ManageAccount = { open, close };
})();
