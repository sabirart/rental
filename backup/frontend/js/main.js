// Navigation Functions
function showHome() {
    document.querySelectorAll('.auth-page, .home-page, .dashboard-page').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.getElementById('homePage').style.display = 'block';
    document.getElementById('homePage').classList.add('active');
}

function showLogin() {
    document.querySelectorAll('.auth-page, .home-page, .dashboard-page').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('loginPage').classList.add('active');
}

function showRegister() {
    document.querySelectorAll('.auth-page, .home-page, .dashboard-page').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.getElementById('registerPage').style.display = 'flex';
    document.getElementById('registerPage').classList.add('active');
}

function showForgotPassword() {
    document.querySelectorAll('.auth-page, .home-page, .dashboard-page').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.getElementById('forgotPage').style.display = 'flex';
    document.getElementById('forgotPage').classList.add('active');
}

function showOTP() {
    document.querySelectorAll('.auth-page, .home-page, .dashboard-page').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.getElementById('otpPage').style.display = 'flex';
    document.getElementById('otpPage').classList.add('active');
}

function showDashboard() {
    document.querySelectorAll('.auth-page, .home-page, .dashboard-page').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.getElementById('dashboardPage').style.display = 'block';
    document.getElementById('dashboardPage').classList.add('active');
}

// Expose functions globally
window.showHome = showHome;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.showForgotPassword = showForgotPassword;
window.showOTP = showOTP;
window.showDashboard = showDashboard;

// Initialize event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Home page navigation buttons
    document.getElementById('loginBtn').addEventListener('click', showLogin);
    document.getElementById('registerBtn').addEventListener('click', showRegister);
    document.getElementById('heroLoginBtn').addEventListener('click', showLogin);
    document.getElementById('heroRegisterBtn').addEventListener('click', showRegister);

    // Footer links
    document.getElementById('footerHome').addEventListener('click', showHome);
    document.getElementById('footerLogin').addEventListener('click', showLogin);
    document.getElementById('footerFeatures').addEventListener('click', function() {
        document.getElementById('features').scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('footerAbout').addEventListener('click', function() {
        document.getElementById('about').scrollIntoView({ behavior: 'smooth' });
    });

    // Auth back buttons
    document.getElementById('loginBackBtn').addEventListener('click', showHome);
    document.getElementById('registerBackBtn').addEventListener('click', showHome);
    document.getElementById('forgotBackBtn').addEventListener('click', showLogin);
    document.getElementById('otpBackBtn').addEventListener('click', showLogin);

    // Dashboard back button
    document.getElementById('dashboardBackBtn').addEventListener('click', showHome);

    // Auth switch links
    document.getElementById('loginSwitchRegister').addEventListener('click', function(e) {
        e.preventDefault();
        showRegister();
    });
    document.getElementById('registerSwitchLogin').addEventListener('click', function(e) {
        e.preventDefault();
        showLogin();
    });
    document.getElementById('forgotSwitchLogin').addEventListener('click', function(e) {
        e.preventDefault();
        showLogin();
    });

    // Forgot password link
    document.getElementById('forgotLink').addEventListener('click', function(e) {
        e.preventDefault();
        showForgotPassword();
    });

    // OTP resend
    document.getElementById('otpResendBtn').addEventListener('click', function(e) {
        e.preventDefault();
        alert('OTP resent to your email!');
    });

    // Google login buttons
    document.getElementById('googleLoginBtn').addEventListener('click', function() {
        alert('Google login functionality will be implemented.');
    });
    document.getElementById('googleRegisterBtn').addEventListener('click', function() {
        alert('Google signup functionality will be implemented.');
    });

    // Login form submission
    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        showDashboard();
    });

    // Register form submission
    document.getElementById('registerForm').addEventListener('submit', function(e) {
        e.preventDefault();
        showOTP();
    });

    // Forgot password form submission
    document.getElementById('forgotForm').addEventListener('submit', function(e) {
        e.preventDefault();
        alert('Password reset link sent to your email!');
        showLogin();
    });

    // OTP form submission
    document.getElementById('otpForm').addEventListener('submit', function(e) {
        e.preventDefault();
        showDashboard();
    });

    // Nav links smooth scroll
    document.querySelectorAll('.home-nav-links a[href^="#"]').forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            var target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});