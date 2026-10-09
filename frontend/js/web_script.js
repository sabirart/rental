// js/web_script.js - Clean Version

(function() {
    'use strict';

    // DOM Elements
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    const verifyModal = document.getElementById('verifyModal');
    const forgotModal = document.getElementById('forgotModal');
    const resetModal = document.getElementById('resetModal');

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const verifyForm = document.getElementById('verifyForm');
    const forgotForm = document.getElementById('forgotForm');
    const resetForm = document.getElementById('resetForm');

    // FIX: these were used everywhere below but never declared,
    // causing a ReferenceError as soon as any form was submitted.
    const loginError = document.getElementById('loginError');
    const registerError = document.getElementById('registerError');
    const verifyError = document.getElementById('verifyError');
    const verifySuccess = document.getElementById('verifySuccess');
    const forgotError = document.getElementById('forgotError');
    const resetError = document.getElementById('resetError');

    // ===== MODAL FUNCTIONS =====
    function openModal(modal) {
        if (modal) {
            // Close any other overlay that's already open (another auth
            // modal, the notifications panel, the recycle bin, the data
            // import/export panel) so two overlays can never be stacked.
            if (window.closeAllOverlays) window.closeAllOverlays(modal.id);
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal(modal) {
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function showError(element, message) {
        if (element) {
            element.textContent = message;
            element.style.display = 'block';
        }
    }

    function hideError(element) {
        if (element) {
            element.style.display = 'none';
        }
    }

    // ===== EXPOSE TO GLOBAL =====
    window.SiteAuthUI = {
        showLogin: function() {
            openModal(loginModal);
        },
        showRegister: function() {
            openModal(registerModal);
        },
        closeModal: function(id) {
            const modalMap = {
                'loginModal': loginModal,
                'registerModal': registerModal,
                'verifyModal': verifyModal,
                'forgotModal': forgotModal,
                'resetModal': resetModal
            };
            const modal = modalMap[id] || document.getElementById(id);
            if (modal) {
                closeModal(modal);
            }
        },
        showVerify: function(email) {
            if (email) {
                document.getElementById('verifyEmail').value = email;
            }
            openModal(verifyModal);
        },
        showForgot: function() {
            openModal(forgotModal);
        },
        showReset: function(email) {
            if (email) {
                document.getElementById('resetEmail').value = email;
            }
            openModal(resetModal);
        }
    };

    // ===== AUTH HANDLERS =====
    async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        hideError(loginError);

        if (!email || !password) {
            showError(loginError, 'Please fill in all fields');
            return;
        }

        try {
            const result = await Auth.login(email, password);
            closeModal(loginModal);
            // Redirect to dashboard
            SiteController.unlockDashboard();
        } catch (error) {
            if (error.message === 'VERIFY_REQUIRED') {
                closeModal(loginModal);
                document.getElementById('verifyEmail').value = email;
                openModal(verifyModal);
            } else {
                showError(loginError, error.message || 'Login failed');
            }
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;

        hideError(registerError);

        if (!name || !email || !password) {
            showError(registerError, 'Please fill in all fields');
            return;
        }

        if (password.length < 6) {
            showError(registerError, 'Password must be at least 6 characters');
            return;
        }

        try {
            await Auth.register(name, email, password);
            closeModal(registerModal);
            document.getElementById('verifyEmail').value = email;
            hideError(verifyError);
            hideError(verifySuccess);
            openModal(verifyModal);
        } catch (error) {
            showError(registerError, error.message || 'Registration failed');
        }
    }

    async function handleVerify(e) {
        e.preventDefault();
        const email = document.getElementById('verifyEmail').value.trim();
        const otp = document.getElementById('verifyOtp').value.trim();

        hideError(verifyError);

        if (!otp) {
            showError(verifyError, 'Please enter the OTP');
            return;
        }

        if (otp.length !== 6 || !/^\d+$/.test(otp)) {
            showError(verifyError, 'OTP must be 6 digits');
            return;
        }

        try {
            await Auth.verifyEmail(email, otp);
            closeModal(verifyModal);
            SiteController.unlockDashboard();
        } catch (error) {
            showError(verifyError, error.message || 'Verification failed');
        }
    }

    async function handleResendVerify(e) {
        e.preventDefault();
        const email = document.getElementById('verifyEmail').value.trim();
        hideError(verifyError);
        hideError(verifySuccess);

        if (!email) {
            showError(verifyError, 'Email not found');
            return;
        }

        try {
            await Auth.resendVerification(email);
            showError(verifySuccess, 'A new OTP has been sent to your email.');
        } catch (error) {
            showError(verifyError, error.message || 'Failed to resend OTP');
        }
    }

    async function handleForgot(e) {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value.trim();

        hideError(forgotError);

        if (!email) {
            showError(forgotError, 'Please enter your email');
            return;
        }

        try {
            await Auth.forgotPassword(email);
            closeModal(forgotModal);
            document.getElementById('resetEmail').value = email;
            openModal(resetModal);
        } catch (error) {
            showError(forgotError, error.message || 'Failed to send OTP');
        }
    }

    async function handleReset(e) {
        e.preventDefault();
        const email = document.getElementById('resetEmail').value.trim();
        const otp = document.getElementById('resetOtp').value.trim();
        const newPassword = document.getElementById('resetNewPassword').value;

        hideError(resetError);

        if (!email || !otp || !newPassword) {
            showError(resetError, 'Please fill in all fields');
            return;
        }

        if (otp.length !== 6 || !/^\d+$/.test(otp)) {
            showError(resetError, 'OTP must be 6 digits');
            return;
        }

        if (newPassword.length < 6) {
            showError(resetError, 'Password must be at least 6 characters');
            return;
        }

        try {
            await Auth.resetPassword(email, otp, newPassword);
            closeModal(resetModal);
            openModal(loginModal);
        } catch (error) {
            showError(resetError, error.message || 'Password reset failed');
        }
    }

// ===== GOOGLE LOGIN =====
// Runs one of two flows depending on platform:
//  - Native Android app (Capacitor): NativeAuth.googleSignIn() from native-auth.js,
//    which uses Credential Manager and returns an ID token.
//  - Browser (web): Google Identity Services popup (unchanged), returns an access token.
// Both paths end up calling Auth.googleLogin(), which sends whichever token type
// it received to the same backend endpoint.
async function refreshGoogleDriveAccess() {
    // Drive authorization is completed by the server-side Google OAuth flow.
    // The browser never requests a Drive token directly, which avoids the
    // origin_mismatch failure from the GIS token popup.
    return true;
}
window.refreshGoogleDriveAccess = refreshGoogleDriveAccess;

async function handleGoogleLogin() {
    if (window.NativeAuth && window.NativeAuth.isNative()) {
        try {
            await window.NativeAuth.googleSignIn();
            closeModal(loginModal);
            closeModal(registerModal);
            SiteController.unlockDashboard();
        } catch (error) {
            Components.showError('Google Sign-In Failed', error.message || 'Google sign-in failed. Please try again.');
        }
        return;
    }
    // Server-side OAuth: Google validates the registered redirect URI rather
    // than the browser JavaScript origin. After callback, the server creates
    // the Rental Manager session and Drive connection cookies.
    window.location.href = `${API.baseURL}/auth/google/start`;
}

    // ===== CLOSE MODALS =====
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                closeModal(modal);
            });
        }
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal(this);
            }
        });
    });

    // ===== CLOSE BUTTONS =====
    document.getElementById('loginClose')?.addEventListener('click', function() { closeModal(loginModal); });
    document.getElementById('registerClose')?.addEventListener('click', function() { closeModal(registerModal); });
    document.getElementById('verifyClose')?.addEventListener('click', function() { closeModal(verifyModal); });
    document.getElementById('forgotClose')?.addEventListener('click', function() { closeModal(forgotModal); });
    document.getElementById('resetClose')?.addEventListener('click', function() { closeModal(resetModal); });

    // ===== SWITCH BETWEEN MODALS =====
    document.getElementById('loginSwitchRegister')?.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal(loginModal);
        openModal(registerModal);
    });

    document.getElementById('registerSwitchLogin')?.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal(registerModal);
        openModal(loginModal);
    });

    document.getElementById('loginForgotLink')?.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal(loginModal);
        openModal(forgotModal);
    });

    document.getElementById('forgotBackLogin')?.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal(forgotModal);
        openModal(loginModal);
    });

    document.getElementById('resetBackLogin')?.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal(resetModal);
        openModal(loginModal);
    });

    document.getElementById('verifyBackLogin')?.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal(verifyModal);
        openModal(loginModal);
    });

    document.getElementById('resendVerifyLink')?.addEventListener('click', handleResendVerify);

    // ===== FORM SUBMISSIONS =====
    loginForm?.addEventListener('submit', handleLogin);
    registerForm?.addEventListener('submit', handleRegister);
    verifyForm?.addEventListener('submit', handleVerify);
    forgotForm?.addEventListener('submit', handleForgot);
    resetForm?.addEventListener('submit', handleReset);

    // ===== GOOGLE BUTTONS =====
    document.getElementById('googleLoginBtn')?.addEventListener('click', handleGoogleLogin);
    document.getElementById('googleRegisterBtn')?.addEventListener('click', handleGoogleLogin);

    // ===== URL PARAMS =====
    const urlParams = new URLSearchParams(window.location.search);
    const show = urlParams.get('show');
    
    if (show === 'login') {
        setTimeout(function() { openModal(loginModal); }, 500);
    } else if (show === 'register') {
        setTimeout(function() { openModal(registerModal); }, 500);
    }

    // ===== NAVIGATION BUTTONS =====
    // Login buttons
    document.querySelectorAll('#loginTrigger, #heroLogin').forEach(el => {
        el?.addEventListener('click', function(e) {
            e.preventDefault();
            if (Auth.isAuthenticated) {
                SiteController.unlockDashboard();
            } else {
                openModal(loginModal);
            }
        });
    });

    // Register buttons
    document.querySelectorAll('#registerTrigger, #aboutRegister, #ctaRegister').forEach(el => {
        el?.addEventListener('click', function(e) {
            e.preventDefault();
            if (Auth.isAuthenticated) {
                SiteController.unlockDashboard();
            } else {
                openModal(registerModal);
            }
        });
    });

    // Get Demo button
    const demoModal = document.getElementById('demoModal');

    document.getElementById('heroRegister')?.addEventListener('click', function(e) {
        e.preventDefault();
        if (Auth.isAuthenticated) {
            SiteController.unlockDashboard();
            return;
        }
        openModal(demoModal);
    });

    document.getElementById('demoConfirmBtn')?.addEventListener('click', function() {
        closeModal(demoModal);
        Auth.enableDemoMode();
        SiteController.unlockDashboard();
    });

    document.getElementById('demoClose')?.addEventListener('click', function() {
        closeModal(demoModal);
    });

})();

// Restore a server-side Google session after OAuth callback/reload and offer
// an explicit choice when this Google account already has saved Rental Manager data.
(async function restoreGoogleSession(){
  const params = new URLSearchParams(window.location.search);
  const authResult = params.get('google_auth');
  try {
    if (authResult === 'error') {
      const msg = params.get('message') || 'Google sign-in failed';
      window.Components?.showError?.('Google Sign-In Failed', msg);
      history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    let restoredUser = Auth.isAuthenticated;
    if (!Auth.isAuthenticated) {
      const response = await fetch(`${API.baseURL}/auth/me`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.user) {
          Auth.setUser(data.data.user, null);
          SiteController.unlockDashboard?.();
          restoredUser = true;
        }
      }
    }
    if (authResult === 'success' && restoredUser) {
      try {
        const statusResponse = await fetch(`${API.baseURL}/auth/backup/status`, { credentials: 'include' });
        const statusPayload = await statusResponse.json();
        if (statusResponse.ok && statusPayload.success) {
          const status = statusPayload.data || {};
          if (status.hasExistingData || status.backups?.length) {
            if (status.backups?.length) {
              const restoreLatest = window.confirm('A backup was found for this Google account. Select OK to restore the latest backup, or Cancel to continue with the current saved data.');
              if (restoreLatest) {
                const result = await fetch(`${API.baseURL}/auth/backup/restore`, {
                  method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ backupId: status.backups[0].id })
                });
                const payload = await result.json();
                if (!result.ok || !payload.success) throw new Error(payload.error || payload.message || 'Backup restore failed');
                window.Components?.showSuccess?.('Latest backup restored successfully');
              } else if (window.confirm('Start a new empty Rental Manager account? Your current data will first be preserved as a backup.')) {
                const result = await fetch(`${API.baseURL}/auth/backup/new-account`, { method: 'POST', credentials: 'include' });
                const payload = await result.json();
                if (!result.ok || !payload.success) throw new Error(payload.error || payload.message || 'Could not start a new account');
              }
            } else if (!window.confirm('Saved Rental Manager data was found for this Google account. Select OK to continue with it, or Cancel to start a new empty account.')) {
              if (window.confirm('Start a new empty account? Your current data will first be preserved as a backup.')) {
                const result = await fetch(`${API.baseURL}/auth/backup/new-account`, { method: 'POST', credentials: 'include' });
                const payload = await result.json();
                if (!result.ok || !payload.success) throw new Error(payload.error || payload.message || 'Could not start a new account');
              }
            }
          } else {
            window.Components?.showSuccess?.('No previous backup was found for this Google account. A new account is ready.');
          }
          if (window.App?.loadData) await App.loadData({ silent: true });
          if (window.App?.renderCurrentView) App.renderCurrentView();
        }
      } catch (backupError) {
        console.error('Backup choice failed:', backupError);
        window.Components?.showError?.('Backup Setup', backupError.message || 'Could not check or restore your backup. Your saved data has not been intentionally cleared.');
      }
    }
  } catch (_) {}
  if (params.has('google_auth')) history.replaceState({}, document.title, window.location.pathname);
})();
