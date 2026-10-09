// Google-only session client. Authentication is stored in HttpOnly server cookies;
// localStorage contains display metadata only, never access or refresh tokens.
const Auth = {
  _user: null, _token: null, _listeners: [], _demoMode: false,
  init() { try { this._user = JSON.parse(localStorage.getItem('auth_user') || 'null'); this._demoMode = sessionStorage.getItem('rental_manager_demo') === '1' && !this._user; } catch (_) { this._user = null; this._demoMode = false; } return !!this._user; },
  get user() { return this._user; }, get token() { return null; }, get isAuthenticated() { return !!this._user; },
  setUser(user) { this._user = user || null; if (this._user) { localStorage.setItem('auth_user', JSON.stringify(this._user)); try { const owner = JSON.parse(localStorage.getItem('ownerInfo') || '{}'); localStorage.setItem('ownerInfo', JSON.stringify({ ...owner, name: this._user.name || owner.name || '', email: this._user.email || owner.email || '' })); } catch (_) {} } else localStorage.removeItem('auth_user'); this._notifyListeners(); },
  clear() { this._user = null; this._token = null; localStorage.removeItem('auth_user'); this._notifyListeners(); },
  addListener(fn) { this._listeners.push(fn); return () => { this._listeners = this._listeners.filter(x => x !== fn); }; },
  _notifyListeners() { this._listeners.forEach(fn => { try { fn(this.isAuthenticated, this._user); } catch (_) {} }); },
  async fetchMe() { const r = await fetch(`${API.baseURL}/auth/me`, { credentials:'include' }); const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.error || 'Google session is not active'); this.setUser(d.data.user); return d.data.user; },
  async updateProfile(payload) { const r = await fetch(`${API.baseURL}/auth/profile`, { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }); const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.error || d.message || 'Could not save owner profile'); this.setUser(d.data.user); return d.data; },
  async logout() { try { await fetch(`${API.baseURL}/auth/logout`, { method:'POST', credentials:'include' }); } finally { this.clear(); location.reload(); } },
  startDemo() { this._demoMode = true; try { sessionStorage.setItem('rental_manager_demo', '1'); } catch (_) {} this._notifyListeners(); },
  stopDemo() { this._demoMode = false; try { sessionStorage.removeItem('rental_manager_demo'); } catch (_) {} },
  isDemoMode() { return !!this._demoMode && !this._user; }
};
window.Auth = Auth;
