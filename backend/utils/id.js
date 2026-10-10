'use strict';
const crypto = require('crypto');

/** Server-generated, collision-resistant record id (never client controlled). */
function newId() {
  return crypto.randomUUID();
}

module.exports = { newId };
