// js/components.js - Popup management with cleanup

const Components = {
    _popupActive: false,
    _escapeHandler: null,
    _popupElement: null,
    
    showConfirm(title, message, confirmText = 'Confirm', cancelText = 'Cancel', confirmType = 'primary', onConfirm, onCancel) {
        this.closePopup();
        
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.id = 'popupOverlay';
        
        const popup = document.createElement('div');
        popup.className = 'popup-box';
        
        const titleEl = document.createElement('h3');
        titleEl.className = 'popup-title';
        titleEl.textContent = title;
        
        const msgEl = document.createElement('p');
        msgEl.className = 'popup-message';
        msgEl.textContent = message;

        const closeX = document.createElement('button');
        closeX.className = 'popup-close-x';
        closeX.setAttribute('aria-label', 'Close');
        closeX.innerHTML = '&times;';
        closeX.addEventListener('click', () => { this.closePopup(); if (onCancel) onCancel(); });
        
        const btnContainer = document.createElement('div');
        btnContainer.className = 'popup-buttons';
        
        // The top-right X is the dismissal/cancel action for confirmations.
        // Do not add a redundant bottom Cancel button.
        const confirmBtn = document.createElement('button');
        confirmBtn.className = `popup-btn popup-btn-${confirmType}`;
        confirmBtn.textContent = confirmText;
        confirmBtn.addEventListener('click', () => { this.closePopup(); if (onConfirm) onConfirm(); });
        
        btnContainer.appendChild(confirmBtn);
        
        popup.appendChild(closeX);
        popup.appendChild(titleEl);
        popup.appendChild(msgEl);
        popup.appendChild(btnContainer);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) { this.closePopup(); if (onCancel) onCancel(); }
        });
        
        this._popupActive = true;
        this._popupElement = overlay;
        
        this._escapeHandler = (e) => {
            if (e.key === 'Escape') { this.closePopup(); if (onCancel) onCancel(); }
        };
        document.addEventListener('keydown', this._escapeHandler);
        setTimeout(() => confirmBtn.focus(), 50);
        return overlay;
    },
    
    showAlert(title, message, buttonText = 'OK', buttonType = 'primary', onClose, options = {}) {
        this.closePopup();
        
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        overlay.id = 'popupOverlay';
        
        const popup = document.createElement('div');
        popup.className = 'popup-box';
        
        // Dedicated close (X) control — dismisses the popup WITHOUT
        // triggering the action callback (e.g. redirecting to login).
        const closeX = document.createElement('button');
        closeX.className = 'popup-close-x';
        closeX.setAttribute('aria-label', 'Close');
        closeX.innerHTML = '&times;';
        closeX.addEventListener('click', () => this.closePopup());
        
        const titleEl = document.createElement('h3');
        titleEl.className = 'popup-title';
        titleEl.textContent = title;
        
        const msgEl = document.createElement('p');
        msgEl.className = 'popup-message';
        msgEl.textContent = message;
        
        const btnContainer = document.createElement('div');
        btnContainer.className = 'popup-buttons popup-buttons-single';
        
        const okBtn = document.createElement('button');
        okBtn.className = `popup-btn popup-btn-${buttonType}`;
        okBtn.textContent = buttonText;
        okBtn.addEventListener('click', () => { this.closePopup(); if (onClose) onClose(); });
        btnContainer.appendChild(okBtn);
        
        
        popup.appendChild(closeX);
        popup.appendChild(titleEl);
        popup.appendChild(msgEl);
        popup.appendChild(btnContainer);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        
        // Clicking the dark backdrop just dismisses the popup, same as the X.
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closePopup();
        });
        
        this._popupActive = true;
        this._popupElement = overlay;
        
        // Escape dismisses only — it should never trigger onClose (e.g. a
        // redirect to login), matching the X button and backdrop click.
        this._escapeHandler = (e) => {
            if (e.key === 'Escape') this.closePopup();
        };
        document.addEventListener('keydown', this._escapeHandler);
        setTimeout(() => okBtn.focus(), 50);
        return overlay;
    },
    
    showInfo(message, buttonText = 'OK') { return this.showAlert('Info', message, buttonText, 'primary'); },
    showSuccess(message, buttonText = 'OK') { this.showToast(message, 'success'); },
    showError(message, buttonText = 'OK') { return this.showAlert('Error', message, buttonText, 'danger'); },
    showWarning(message, buttonText = 'OK') { return this.showAlert('Warning', message, buttonText, 'warning'); },
    
    closePopup() {
        if (this._popupElement) { this._popupElement.remove(); this._popupElement = null; }
        if (this._escapeHandler) { document.removeEventListener('keydown', this._escapeHandler); this._escapeHandler = null; }
        this._popupActive = false;
    },
    
    isPopupActive() { return this._popupActive; },
    
    showLoading(message = 'Loading...') {
        this.hideLoading();
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.id = 'loadingOverlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(overlay);
    },
    
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.remove();
    },
    
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const colors = { success: '#28a745', error: '#dc3545', warning: '#ffc107', info: '#17a2b8' };
        const shortToast = {
            'Tenant updated successfully': 'Tenant updated',
            'Tenant added successfully': 'Tenant added',
            'Payment updated successfully': 'Payment updated',
            'Payment added successfully': 'Payment added',
            'Document removed successfully': 'Document removed',
            'Month export downloaded': 'Export downloaded',
            'Data exported successfully': 'Data exported',
            'Imported successfully': 'Import complete'
        };
        const cleanMessage = shortToast[message] || String(message).trim().split(/\s+/).slice(0, 2).join(' ');
        toast.style.cssText = `
            position: fixed; top: calc(var(--safe-top, 0px) + 16px); left: 50%;
            transform: translateX(-50%); padding: 10px 16px; border-radius: 8px;
            background: ${colors[type] || '#1a1a1a'}; color: ${type === 'warning' ? '#1a1a1a' : '#fff'};
            z-index: 99999; max-width: min(320px, calc(100vw - 32px));
            text-align: center; font-size: 0.8rem; line-height: 1.2; white-space: nowrap;
            animation: toastDrop 0.22s ease-out; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
            pointer-events: none;
        `;
        toast.textContent = cleanMessage;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.2s ease';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 200);
        }, duration);
    }
};

window.Components = Components;