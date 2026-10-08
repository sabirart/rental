const { Pool } = require('pg');
const { writeDriveData, emptyData } = require('./driveStore');
const { getContext } = require('./driveStore');
async function migrateCurrentUserFromLegacy(userId,email,googleId,driveToken){
  const url=process.env.LEGACY_DATABASE_URL || process.env.LEGACY_POSTGRES_URL;
  if(!url) return {migrated:false,reason:'LEGACY_DATABASE_URL is not configured'};
  const pool=new Pool({connectionString:url,ssl:process.env.LEGACY_DATABASE_SSL==='false'?false:{rejectUnauthorized:false},connectionTimeoutMillis:10000,max:1});
  try{
    const u=(await pool.query('SELECT * FROM users WHERE email=$1 OR google_id=$2 LIMIT 1',[email,googleId])).rows[0];
    if(!u) return {migrated:false,reason:'No legacy user found'};
    const q=async(sql,params)=>{try{return (await pool.query(sql,params)).rows;}catch(e){if(/relation .* does not exist/i.test(e.message))return [];throw e;}};
    const [properties,rooms,tenants,payments,recycleBin,settings]=await Promise.all([
      q('SELECT * FROM properties WHERE user_id=$1 ORDER BY created_at ASC',[u.id]),
      q('SELECT r.* FROM rooms r JOIN properties p ON p.id=r.property_id WHERE p.user_id=$1 ORDER BY r.property_id,r.room_number',[u.id]),
      q('SELECT * FROM tenants WHERE user_id=$1 ORDER BY created_at ASC',[u.id]),
      q('SELECT * FROM payments WHERE user_id=$1 ORDER BY year DESC,month DESC,created_at DESC',[u.id]),
      q('SELECT * FROM recycle_bin WHERE user_id=$1 ORDER BY deleted_at DESC',[u.id]),
      q('SELECT * FROM user_settings WHERE user_id=$1 LIMIT 1',[u.id])
    ]);
    const data=emptyData(userId);data.user={id:userId,name:u.name||email.split('@')[0],email,profilePic:u.profile_pic||null,googleId};
    data.properties=properties;data.rooms=rooms;data.tenants=tenants.map(t=>({...t,documents:Array.isArray(t.documents)?t.documents:(t.documents?JSON.parse(t.documents):[])}));
    data.payments=payments.map(p=>({...p,custom_charges:Array.isArray(p.custom_charges)?p.custom_charges:(p.custom_charges?JSON.parse(p.custom_charges):[])}));data.recycleBin=recycleBin.map(x=>({...x,data:typeof x.data==='string'?JSON.parse(x.data):x.data}));data.settings=settings[0]||data.settings;
    const drive=require('./driveStore').driveClient(driveToken);const folderId=await require('./driveStore').findOrCreateFolder(drive);const existing=await require('./driveStore').findDataFile(drive,folderId);if(existing){const resp=await drive.files.get({fileId:existing.id,alt:'media'});let current=resp.data;if(typeof current==='string')current=JSON.parse(current);if(current&&Array.isArray(current.properties)&&current.properties.length) return {migrated:false,reason:'Drive already contains Rental Manager data'};}
    await writeDriveData(data,{drive,folderId,file:existing});return {migrated:true,counts:{properties:properties.length,rooms:rooms.length,tenants:tenants.length,payments:payments.length,recycleBin:recycleBin.length}};
  } finally {await pool.end();}
}
module.exports={migrateCurrentUserFromLegacy};
