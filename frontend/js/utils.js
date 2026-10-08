// js/utils.js - Essential utilities only

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeURL(str) {
    if (!str) return '';
    return encodeURIComponent(str);
}

function formatCurrency(amount) {
    const currencySymbol = localStorage.getItem('currencySymbol') || '$';
    // Format number with commas
    const num = Number(amount);
    const formatted = num.toFixed(2);
    const cleaned = formatted.endsWith('.00') ? Math.floor(num).toString() : formatted;
    // Add commas for thousands
    const parts = cleaned.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const withCommas = parts.join('.');
    return currencySymbol + ' ' + withCommas;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function getCurrentMonth() {
    return new Date().getMonth() + 1;
}

function getCurrentYear() {
    return new Date().getFullYear();
}

function getMonthName(month) {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[month - 1] || month;
}

function validateCNIC(cnic) {
    return /^[0-9]{5}-[0-9]{7}-[0-9]{1}$/.test(cnic);
}

// Loose international-friendly phone validation: optional leading +,
// 7-15 digits, allows spaces/dashes/parentheses as visual separators.
function validatePhoneNumber(number) {
    const cleaned = number.replace(/[\s\-().]/g, '');
    return /^\+?[0-9]{7,15}$/.test(cleaned);
}

function validateFileSize(file, maxSizeMB = 5) {
    return file.size <= maxSizeMB * 1024 * 1024;
}

// Extensions for image formats whose MIME type browsers often fail to report
// correctly (RAW camera formats in particular), used as a fallback check.
const IMAGE_FILE_EXTENSIONS = [
    'jpg', 'jpeg', 'png', 'gif', 'webp',
    'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'rw2', 'raf', 'srw', 'pef', 'x3f'
];

// Strict allow-list used specifically for tenant profile photo uploads:
// only JPG, JPEG, PNG, and GIF are accepted (no WEBP/RAW/other formats).
const STRICT_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif'];
const STRICT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif'];

function validateStrictImageType(file) {
    const ext = file.name && file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    if (file.type && STRICT_IMAGE_MIME_TYPES.includes(file.type)) return true;
    return STRICT_IMAGE_EXTENSIONS.includes(ext);
}

function validateFileType(file, isImageOnly = false) {
    if (isImageOnly) {
        if (file.type && file.type.startsWith('image/')) {
            return true;
        }
        // Many RAW formats (CR2, NEF, ARW, DNG, etc.) aren't recognized by
        // the browser and report an empty or generic MIME type, so fall
        // back to checking the file extension.
        const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
        return IMAGE_FILE_EXTENSIONS.includes(ext);
    }
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.type)) return true;
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    return IMAGE_FILE_EXTENSIONS.includes(ext);
}

function getFileSize(size) {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(2) + ' KB';
    return (size / (1024 * 1024)).toFixed(2) + ' MB';
}

let notificationTimeout = null;

function showNotification(message, type = 'info') {
    if (notificationTimeout) clearTimeout(notificationTimeout);
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Check if mobile
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        notification.style.top = 'calc(60px + var(--safe-top, 0px))';
        notification.style.bottom = 'auto';
    }
    
    document.body.appendChild(notification);
    
    notificationTimeout = setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(() => { if (notification.parentNode) notification.remove(); notificationTimeout = null; }, 300);
    }, 3000);
}

// Inject notification styles once
if (!document.getElementById('notificationStyles')) {
    const style = document.createElement('style');
    style.id = 'notificationStyles';
    style.textContent = `
        .notification { position:fixed; bottom:30px; left:50%; transform:translateX(-50%); padding:12px 24px; border-radius:6px; font-size:.875rem; z-index:99999; max-width:400px; text-align:center; background:#1a1a1a; color:#fff; animation:toastUp .3s ease; box-shadow:0 4px 12px rgba(0,0,0,.15); }
        .notification-success { background:#28a745; }
        .notification-error { background:#dc3545; }
        .notification-warning { background:#ffc107; color:#1a1a1a; }
        .notification-info { background:#17a2b8; }
        @keyframes toastUp { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
    `;
    document.head.appendChild(style);
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function safeParseJSON(data) {
    try { return JSON.parse(data); } catch (e) { return null; }
}

function safeStringifyJSON(data) {
    try { return JSON.stringify(data); } catch (e) { return null; }
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

function sanitizeInput(str) {
    if (!str) return '';
    return str.replace(/[<>]/g, '');
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
    return /^[0-9+\-\s()]{10,15}$/.test(phone);
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function truncateText(str, maxLength = 50) {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

// Disable mouse wheel scroll value change on number inputs, but allow container scroll
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('input[type="number"]').forEach(function(input) {
        input.addEventListener('wheel', function(e) {
            e.preventDefault();
            e.stopPropagation();
            // Find the scrollable container
            let container = this.closest('.modal-body, .recycle-box-body, .tenant-details-box, .table-container');
            if (container) {
                // Scroll the container
                container.scrollTop += e.deltaY;
                // Also scroll the main content if container is inside it
                if (container.closest('.main-content')) {
                    const mainContent = document.getElementById('mainContent');
                    if (mainContent) {
                        mainContent.scrollTop += e.deltaY;
                    }
                }
            } else {
                // If no container found, scroll the main content
                const mainContent = document.getElementById('mainContent');
                if (mainContent) {
                    mainContent.scrollTop += e.deltaY;
                }
            }
            return false;
        }, { passive: false });
    });
});
