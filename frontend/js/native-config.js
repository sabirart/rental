// js/native-config.js
//
// Inside the native Android app, the WebView's own origin is always
// https://localhost (Capacitor serves the bundled frontend files from
// there), which would otherwise trick api.js's "am I on localhost -> use
// the local dev backend" check. This must load before api.js and set
// window.API_URL explicitly so the app always talks to the real deployed
// backend instead of localhost:5000.
//
// >>> EDIT THIS to your actual deployed backend URL before building. <<<
// Based on backend/render.yaml (service name "rental-management"), the
// default Render URL would be:
const PRODUCTION_API_URL = 'https://rental-28x2.onrender.com/api';

(function () {
    var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (isNative) {
        window.API_URL = PRODUCTION_API_URL;
    }
})();
