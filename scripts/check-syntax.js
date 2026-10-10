#!/usr/bin/env node
'use strict';
// Parses every backend and frontend .js file with Node's parser (no execution).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', '.git', 'vendor']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
  }
})(root);
let bad = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad += 1; console.error(`SYNTAX ERROR in ${path.relative(root, f)}\n${e.stderr}`); }
}
console.log(`${files.length} files checked, ${bad} with errors`);
process.exit(bad ? 1 : 0);
