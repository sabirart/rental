// Compatibility layer: Rental Manager application data is stored in each
// user's private Google Drive. PostgreSQL is intentionally NOT used for
// properties, rooms, tenants, payments, recycle-bin data, or settings.
const Drive=require('../services/driveStore');
const ready=Promise.resolve();
async function transaction(callback){return Drive.transaction(callback);}
async function query(){throw new Error('PostgreSQL is disabled for Rental Manager application data. Use Google Drive storage.');}
async function get(){throw new Error('PostgreSQL is disabled for Rental Manager application data. Use Google Drive storage.');}
async function run(){throw new Error('PostgreSQL is disabled for Rental Manager application data. Use Google Drive storage.');}
module.exports={ready,transaction,query,get,run};
