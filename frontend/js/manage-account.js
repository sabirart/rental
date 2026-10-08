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
        const isGoogleAccount = !!user.googleId;

        $('manageAccountEmail').textContent = user.email || '';
        $('manageAccountName').value = user.name || '';
        $('manageAccountEmailField').value = user.email || '';

        // Google-only accounts have no password to change.
        const passwordTab = $('manageAccountPasswordTab');
        if (passwordTab) passwordTab.style.display = isGoogleAccount ? 'none' : '';

        const deletePasswordGroup = $('manageAccountDeletePasswordGroup');
        if (deletePasswordGroup) deletePasswordGroup.style.display = isGoogleAccount ? 'none' : '';

        ['manageAccountDetailsError', 'manageAccountDetailsSuccess', 'manageAccountPasswordError',
         'manageAccountPasswordSuccess', 'manageAccountDeleteError'].forEach(id => hideMsg($(id)));

        switchTab('details');
        SiteController.openAuthModal('manageAccount');
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

            const currentPassword = $('manageAccountCurrentPassword').value;
            const newPassword = $('manageAccountNewPassword').value;
            const confirmPassword = $('manageAccountConfirmPassword').value;

            if (newPassword.length < 6) {
                showMsg(errorEl, 'New password must be at least 6 characters.');
                return;
            }
            if (newPassword !== confirmPassword) {
                showMsg(errorEl, 'New passwords do not match.');
                return;
            }

            try {
                await Auth.changePassword(currentPassword, newPassword);
                showMsg(successEl, 'Password changed successfully.');
                $('manageAccountPasswordForm').reset();
            } catch (err) {
                showMsg(errorEl, err.message || 'Failed to change password.');
            }
        });

        $('manageAccountDeleteForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = $('manageAccountDeleteError');
            hideMsg(errorEl);

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
