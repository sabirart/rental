'use strict';
/** In-memory Google Drive v3 stand-in (files.list/get/create/update/delete, about.get) with versions, parents, trash and appProperties. */
const { Readable } = require('stream');

function apiError(code, message) { const e = new Error(message); e.code = code; e.response = { status: code }; return e; }
const readAll = async (stream) => { const c = []; for await (const x of stream) c.push(Buffer.from(x)); return Buffer.concat(c).toString('utf8'); };

class FakeDriveAccount {
  constructor() { this.files = new Map(); this.seq = 0; this.calls = []; this.beforeUpdate = null; this.failCreateWith = null; }
  _id() { this.seq += 1; return `f${this.seq}`; }
  _pick(f, fields) {
    if (!fields) return { id: f.id };
    const out = { id: f.id };
    for (const k of ['name', 'mimeType', 'version', 'modifiedTime', 'createdTime', 'size', 'appProperties', 'parents', 'trashed']) if (fields.includes(k)) out[k] = f[k];
    return out;
  }
  seed(file) { const id = file.id || this._id(); const f = { id, version: '1', createdTime: new Date(2020, 0, ++this.seq).toISOString(), modifiedTime: new Date().toISOString(), trashed: false, parents: [], appProperties: {}, ...file }; this.files.set(id, f); return f; }
  find(pred) { return [...this.files.values()].filter(pred); }

  client() {
    const self = this;
    const log = (op) => self.calls.push(op);
    return {
      files: {
        async list({ q = '', fields, pageSize = 100, pageToken, orderBy }) {
          log('list');
          let items = [...self.files.values()];
          for (const clause of q.split(' and ').map((s) => s.trim())) {
            let m;
            if ((m = clause.match(/^name = '(.*)'$/))) items = items.filter((f) => f.name === m[1].replace(/\\'/g, "'"));
            else if ((m = clause.match(/^mimeType = '(.*)'$/))) items = items.filter((f) => f.mimeType === m[1]);
            else if (clause === 'trashed = false') items = items.filter((f) => !f.trashed);
            else if ((m = clause.match(/^'(.*)' in parents$/))) items = items.filter((f) => f.parents.includes(m[1]));
          }
          if (orderBy && orderBy.startsWith('createdTime')) items.sort((a, b) => a.createdTime.localeCompare(b.createdTime));
          if (orderBy && orderBy.startsWith('modifiedTime desc')) items.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime) || b.id.localeCompare(a.id, undefined, { numeric: true }));
          const start = pageToken ? Number(pageToken) : 0;
          const page = items.slice(start, start + pageSize);
          return { data: { files: page.map((f) => self._pick(f, fields)), nextPageToken: start + pageSize < items.length ? String(start + pageSize) : undefined } };
        },
        async get({ fileId, alt, fields }) {
          log(alt === 'media' ? 'get-media' : 'get-meta');
          const f = self.files.get(fileId);
          if (!f) throw apiError(404, 'File not found');
          if (alt === 'media') return { data: Readable.from([f.content || '']) };
          // The write pre-condition check asks for exactly 'id,version': simulate a competing writer landing just before it.
          if (fields === 'id,version' && self.beforeVersionCheck) { const hook = self.beforeVersionCheck; self.beforeVersionCheck = null; await hook(f); }
          return { data: self._pick(f, fields) };
        },
        async create({ requestBody = {}, media, fields }) {
          log('create');
          if (self.failCreateWith) throw self.failCreateWith;
          const content = media ? await readAll(media.body) : undefined;
          const f = self.seed({ ...requestBody, parents: requestBody.parents || [], content, size: content ? String(Buffer.byteLength(content)) : undefined });
          return { data: self._pick(f, fields) };
        },
        async update({ fileId, requestBody = {}, media, fields }) {
          log('update');
          const f = self.files.get(fileId);
          if (!f) throw apiError(404, 'File not found');
          if (self.beforeUpdate) { const hook = self.beforeUpdate; self.beforeUpdate = null; await hook(f); }
          if (media) { f.content = await readAll(media.body); f.size = String(Buffer.byteLength(f.content)); }
          const { appProperties, ...rest } = requestBody;
          Object.assign(f, rest);
          if (appProperties) f.appProperties = { ...f.appProperties, ...appProperties };
          f.version = String(Number(f.version) + 1);
          f.modifiedTime = new Date().toISOString();
          return { data: self._pick(f, fields) };
        },
        async delete({ fileId }) { log('delete'); if (!self.files.delete(fileId)) throw apiError(404, 'File not found'); return { data: {} }; }
      },
      about: { async get() { return { data: { user: { emailAddress: 'x@example.com' }, storageQuota: {} } }; } }
    };
  }
}

class FakeDrive {
  constructor() { this.accounts = new Map(); }
  account(token) { if (!this.accounts.has(token)) this.accounts.set(token, new FakeDriveAccount()); return this.accounts.get(token); }
  factory() { return (token) => this.account(token).client(); }
}
module.exports = { FakeDrive, apiError };
