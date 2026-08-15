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
        
        const btnContainer = document.createElement('div');
        btnContainer.className = 'popup-buttons';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'popup-btn popup-btn-cancel';
        cancelBtn.textContent = cancelText;
        cancelBtn.addEventListener('click', () => { this.closePopup(); if (onCancel) onCancel(); });
        
        const confirmBtn = document.createElement('button');
        confirmBtn.className = `popup-btn popup-btn-${confirmType}`;
        confirmBtn.textContent = confirmText;
        confirmBtn.addEventListener('click', () => { this.closePopup(); if (onConfirm) onConfirm(); });
        
        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(confirmBtn);
        
        popup.appendChild(titleEl);
        popup.appendChild(msgEl);
        popup.appendChild(btnContainer);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        
        this._popupActive = true;
        this._popupElement = overlay;
        
        this._escapeHandler = (e) => {
            if (e.key === 'Escape') { this.closePopup(); if (onCancel) onCancel(); }
        };
        document.addEventListener('keydown', this._escapeHandler);
        setTimeout(() => confirmBtn.focus(), 50);
        return overlay;
    },
    
    showAlert(title, message, buttonText = 'OK', buttonType = 'primary', onClose) {
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
        
        const btnContainer = document.createElement('div');
        btnContainer.className = 'popup-buttons popup-buttons-single';
        
        const okBtn = document.createElement('button');
        okBtn.className = `popup-btn popup-btn-${buttonType}`;
        okBtn.textContent = buttonText;
        okBtn.addEventListener('click', () => { this.closePopup(); if (onClose) onClose(); });
        
        btnContainer.appendChild(okBtn);
        popup.appendChild(titleEl);
        popup.appendChild(msgEl);
        popup.appendChild(btnContainer);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        
        this._popupActive = true;
        this._popupElement = overlay;
        
        this._escapeHandler = (e) => {
            if (e.key === 'Escape') { this.closePopup(); if (onClose) onClose(); }
        };
        document.addEventListener('keydown', this._escapeHandler);
        setTimeout(() => okBtn.focus(), 50);
        return overlay;
    },
    
    showInfo(message, buttonText = 'OK') { return this.showAlert('Info', message, buttonText, 'primary'); },
    showSuccess(message, buttonText = 'OK') { return this.showAlert('Success', message, buttonText, 'success'); },
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
        toast.style.cssText = `
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            padding: 12px 24px; border-radius: 8px; background: ${colors[type] || '#1a1a1a'};
            color: ${type === 'warning' ? '#1a1a1a' : '#fff'}; z-index: 99999;
            max-width: 400px; text-align: center; font-size: 0.875rem;
            animation: slideUp 0.3s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        }, duration);
    }
};

window.Components = Components;