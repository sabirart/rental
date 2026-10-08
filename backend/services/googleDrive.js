const { google } = require('googleapis');
const { Readable } = require('stream');
const DRIVE_COOKIE = 'google_drive_token';
const { findOrCreateFolder, findDataFile, driveClient, emptyData, writeDriveData, getContext } = require('./driveStore');
function getDriveToken(req) { const cookies=(req.headers.cookie||'').split(';').map(v=>v.trim()); const item=cookies.find(v=>v.startsWith(`${DRIVE_COOKIE}=`)); return item ? decodeURIComponent(item.slice(DRIVE_COOKIE.length+1)) : null; }
function appendCookie(res,value){const existing=res.getHeader('Set-Cookie');const list=existing?(Array.isArray(existing)?existing:[existing]):[];res.setHeader('Set-Cookie',[...list,value]);}
function setDriveCookie(res,token){if(!token)return;const secure=process.env.NODE_ENV==='production'?'; Secure':'';appendCookie(res,`${DRIVE_COOKIE}=${encodeURIComponent(token)}; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax${secure}`);}
function clearDriveCookie(res){const secure=process.env.NODE_ENV==='production'?'; Secure':'';appendCookie(res,`${DRIVE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);}
async function ensureUserData(userId, token){ if(!token) throw new Error('Google Drive access is required'); const drive=driveClient(token); const folderId=await findOrCreateFolder(drive); const file=await findDataFile(drive,folderId); if(!file) await writeDriveData(emptyData(userId),{drive,folderId,file:null}); return {connected:true}; }
async function syncUserData(userId,token){return ensureUserData(userId,token);}
async function getStatus(req){const token=getDriveToken(req);if(!token)return {connected:false};try{const drive=driveClient(token);const about=await drive.about.get({fields:'user(emailAddress,displayName,photoLink),storageQuota(limit,usage)'});return {connected:true,user:about.data.user||null,storageQuota:about.data.storageQuota||null};}catch(e){return {connected:false,error:e.message};}}
module.exports={DRIVE_COOKIE,getDriveToken,setDriveCookie,clearDriveCookie,syncUserData,ensureUserData,getStatus};
