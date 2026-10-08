// js/native-auth.js
//
// Bridges native Android Google Sign-In (Capacitor Credential Manager, via
// @capgo/capacitor-social-login) into the same login/register flow the web
// version already uses. Only loaded/active inside the Capacitor app - on a
// normal browser, window.Capacitor is undefined and everything here is a
// harmless no-op, so this file is safe to include on the website build too.
//
// IMPORTANT: the Google "Web application" OAuth client ID below MUST match
// GOOGLE_CLIENT_ID in the backend's environment - that's what the backend
// uses as the expected audience when verifying the ID token this plugin
// returns. It is intentionally the SAME id already used in web_script.js.
const GOOGLE_WEB_CLIENT_ID = '662426431112-p5fh467egk9h20cqpqtl5eve2kre7fkk.apps.googleusercontent.com';

const NativeAuth = {
    _initialized: false,

    isNative() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    },

    async _ensureInit() {
        if (this._initialized) return;
        const { SocialLogin } = window.CapacitorSocialLogin || {};
        if (!SocialLogin) {
            throw new Error('Social login plugin not available - is this running inside the native app?');
        }
        await SocialLogin.initialize({
            google: {
                webClientId: GOOGLE_WEB_CLIENT_ID
            }
        });
        this._initialized = true;
    },

    // Triggers native Google Sign-In (Credential Manager account picker),
    // then hands the resulting ID token to the existing Auth.googleLogin(),
    // which posts it to the same /auth/google-login backend endpoint used
    // by the web popup flow.
    async googleSignIn() {
        await this._ensureInit();
        const { SocialLogin } = window.CapacitorSocialLogin;

        const loginResult = await SocialLogin.login({
            provider: 'google',
            // No extra `options.scopes` here on purpose: requesting additional
            // scopes switches this plugin into a legacy authorization flow that
            // requires modifying MainActivity.java (see its Android docs). We
            // only need the basic email/profile identity, which Credential
            // Manager already includes in the ID token with no extra scopes
            // needed - so omitting this avoids that requirement entirely.
            options: {}
        });

        const idToken = loginResult && loginResult.result && loginResult.result.idToken;
        if (!idToken) {
            throw new Error('No ID token returned from Google Sign-In');
        }

        return Auth.googleLogin({ idToken });
    },

    async signOut() {
        if (!this.isNative() || !this._initialized) return;
        try {
            const { SocialLogin } = window.CapacitorSocialLogin;
            await SocialLogin.logout({ provider: 'google' });
        } catch (e) {
            // Non-fatal - local session is already cleared by Auth.clear()
            console.warn('Native Google sign-out warning:', e);
        }
    }
};

window.NativeAuth = NativeAuth;
