'use strict';
/**
 * Frontend checks in jsdom. jsdom is NOT a real browser (no layout, no CSS rendering),
 * so these verify behaviour and markup contracts, not visual/responsive appearance.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FRONT = path.join(__dirname, '..', '..', 'frontend');
const read = (p) => fs.readFileSync(path.join(FRONT, p), 'utf8');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'vendor' ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));

describe('CSP readiness: no inline script execution anywhere', () => {
  const files = walk(FRONT).filter((f) => /\.(html|js)$/.test(f));
  test('no inline event-handler attributes or javascript: URLs in HTML or generated markup', () => {
    const offenders = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');
      const m = text.match(/\son(click|change|input|submit|load|error|mouseover|mouseout|focus|blur|keydown|keyup)\s*=\s*\\?["']/gi);
      if (m) offenders.push(`${path.relative(FRONT, f)}: ${m.length}`);
      if (/javascript:/i.test(text.replace(/\/\/.*$/gm, ''))) offenders.push(`${path.relative(FRONT, f)}: javascript: URL`);
    }
    expect(offenders).toEqual([]);
  });
  test('index.html has no inline <script> bodies and loads no third-party scripts/styles', () => {
    const doc = new JSDOM(read('index.html')).window.document;
    [...doc.querySelectorAll('script')].forEach((s) => { expect(s.getAttribute('src')).toBeTruthy(); expect(s.textContent.trim()).toBe(''); expect(s.src).not.toMatch(/^https?:/); });
    [...doc.querySelectorAll('link[rel=stylesheet]')].forEach((l) => expect(l.getAttribute('href')).not.toMatch(/^https?:/));
  });
  test('every referenced local script/style/icon exists', () => {
    const doc = new JSDOM(read('index.html')).window.document;
    const refs = [...doc.querySelectorAll('script[src], link[href]')].map((e) => (e.getAttribute('src') || e.getAttribute('href')).split('?')[0]).filter((u) => !/^(https?:|#|data:)/.test(u));
    refs.forEach((r) => expect(fs.existsSync(path.join(FRONT, r))).toBe(true));
    expect(refs.length).toBeGreaterThan(20);
  });
  test('every data-rm-action used in markup has a registered handler', () => {
    const used = new Set();
    for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/data-rm-action="([a-z-]+)"/g)) used.add(m[1]);
    const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
    dom.window.eval(read('js/actions.js'));
    const registered = Object.keys(dom.window.RMActions.actions);
    used.forEach((u) => expect(registered).toContain(u));
  });
  test('self-hosted Font Awesome files are present and referenced fonts exist', () => {
    const css = read('vendor/fontawesome/all.min.css');
    for (const m of css.matchAll(/url\(\.\.\/webfonts\/([^)]+)\)/g)) expect(fs.existsSync(path.join(FRONT, 'vendor/fontawesome/webfonts', m[1]))).toBe(true);
  });
});

describe('escapeHTML (stored-XSS regression)', () => {
  const win = new JSDOM('<body></body>', { url: 'http://localhost/', runScripts: 'outside-only' }).window;
  win.eval(read('js/utils.js'));
  const esc = (v) => win.eval(`escapeHTML(${JSON.stringify(v)})`);
  test('escapes quotes so attribute values cannot be broken out of', () => {
    expect(esc('x" onerror="alert(1)')).toBe('x&quot; onerror=&quot;alert(1)');
    expect(esc("' onload='x")).toBe('&#39; onload=&#39;x');
  });
  test('rendering escaped text into an attribute never creates an event handler', () => {
    const doc = new JSDOM('<body></body>').window.document;
    doc.body.innerHTML = `<img src="${esc('x" onerror="alert(2)')}">`;
    const img = doc.querySelector('img');
    expect(img.getAttribute('onerror')).toBeNull();
    expect([...img.attributes].map((a) => a.name)).toEqual(['src']);
  });
  test('escapes markup and handles null/numbers', () => {
    expect(esc('<script>alert(1)</script>&')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;&amp;');
    expect(win.eval('escapeHTML(null)')).toBe('');
    expect(win.eval('escapeHTML(0)')).toBe('0');
  });
  test('billing period follows the reset day rule', () => {
    expect(win.eval('JSON.stringify(getBillingPeriod(new Date(2025, 0, 20)))')).toBe('{"month":1,"year":2025}');
    win.localStorage.setItem('monthly_reset_day', '25');
    expect(win.eval('JSON.stringify(getBillingPeriod(new Date(2025, 11, 30)))')).toBe('{"month":1,"year":2026}');
  });
});

describe('delegated actions', () => {
  test('clicking data-rm-action elements calls the matching module (and Enter works on role=button)', () => {
    const dom = new JSDOM('<body><button data-rm-action="room-edit" data-property-id="p1" data-room="3">e</button><div role="button" tabindex="0" data-rm-action="edit-payment" data-payment-id="pay1" data-tenant-id="t1"></div></body>', { runScripts: 'outside-only' });
    const w = dom.window;
    const calls = [];
    w.eval('window.Properties = {}; window.Payments = {};');
    w.Properties.editRoom = (...a) => calls.push(['editRoom', ...a]);
    w.Payments.editPayment = (...a) => calls.push(['editPayment', ...a]);
    w.eval(read('js/actions.js'));
    w.document.querySelector('button').click();
    const div = w.document.querySelector('[role=button]');
    div.focus();
    div.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(calls).toEqual([['editRoom', 'p1', 3], ['editPayment', 'pay1', 't1']]);
  });
});

describe('accessibility contracts', () => {
  const doc = new JSDOM(read('index.html')).window.document;
  test('every form control has an accessible name', () => {
    const bad = [];
    doc.querySelectorAll('input, select, textarea').forEach((c) => {
      if (['hidden', 'submit', 'button'].includes(c.type)) return;
      const labelled = (c.id && doc.querySelector(`label[for="${c.id}"]`)) || c.closest('label') || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby');
      if (!labelled) bad.push(c.outerHTML.slice(0, 80));
    });
    expect(bad).toEqual([]);
  });
  test('skip link targets an existing landmark; html has lang; viewport is set', () => {
    const skip = doc.querySelector('.skip-link');
    expect(skip).not.toBeNull();
    expect(doc.querySelector(skip.getAttribute('href'))).not.toBeNull();
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.querySelector('meta[name=viewport]')).not.toBeNull();
  });
  test('css honours reduced motion and has a global focus-visible style', () => {
    const css = read('css/style.css');
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toMatch(/:focus-visible/);
  });
  test('icon-only buttons are named', () => {
    const bad = [...doc.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.title).map((b) => b.outerHTML.slice(0, 80));
    expect(bad).toEqual([]);
  });
});

describe('app boots in demo mode and renders every view', () => {
  test('served by the real server: all scripts load, demo data renders, every view switches without script errors', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'frontend-test-secret-frontend-test-123456';
    const { app } = require('./helpers/app');
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const errors = [];
    try {
      const { VirtualConsole } = require('jsdom');
      const virtualConsole = new VirtualConsole();
      virtualConsole.on('jsdomError', (e) => errors.push(e.message));
      virtualConsole.on('error', (...a) => errors.push(a.join(' ')));
      const dom = await JSDOM.fromURL(`http://127.0.0.1:${server.address().port}/`, {
        runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole,
        beforeParse(w) {
          w.sessionStorage.setItem('rental_manager_demo', '1');
          w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
          w.fetch = (u, o) => fetch(new URL(u, w.location.href), o);
          w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
        }
      });
      const w = dom.window;
      await new Promise((resolve) => (w.document.readyState === 'complete' ? resolve() : w.addEventListener('load', resolve)));
      await new Promise((r) => setTimeout(r, 400));
      expect(typeof w.App).toBe('object');
      expect(w.App.state.tenants.length).toBeGreaterThan(0); // demo data loaded
      for (const view of ['dashboard', 'tenants', 'properties', 'payments', 'settings']) {
        await w.App.navigateTo(view);
        await new Promise((r) => setTimeout(r, 80));
      }
      expect(w.document.getElementById('tenantsList').children.length).toBeGreaterThan(0);
      expect(w.document.querySelectorAll('[onclick]').length).toBe(0);
      const noise = /Not implemented|navigation|getContext|canvas/i;
      expect(errors.filter((e) => !noise.test(e))).toEqual([]);
      // not closing the window: its rAF/keep-alive timers die with the test process (jest --forceExit)
    } finally { await new Promise((r) => server.close(r)); }
  }, 30000);
});
