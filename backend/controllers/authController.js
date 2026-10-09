const { google } = require('googleapis');
const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const { clearDriveCookie, ensureUserData, getDriveToken } = require('../services/googleDrive');
const Drive = require('../services/driveStore');
const Auth = require('../middleware/auth');

// Render dashboard values are sometimes pasted as KEY=value instead of value only.
// Normalize those values so Express never treats an absolute URL as a relative route.
function configuredUrl(name, fallback, allowedPath) {
  let value = String(process.env[name] || '').trim();
  if (value) {
    value = value.replace(new RegExp('^' + name + '\\s*=\\s*', 'i'), '').trim();
    value = value.replace(/^['\"]|['\"]$/g, '').trim();
  }
  try {
    const parsed = new URL(value || fallback);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported URL protocol');
    if (allowedPath && parsed.pathname !== allowedPath) throw new Error('Unexpected URL path');
    return parsed.toString().replace(/\/$/, '');
  } catch (_) {
    return fallback.replace(/\/$/, '');
  }
}
function frontendBaseUrl(req) {
  const fallback = `${req.protocol}://${req.get('host')}`;
  return configuredUrl('FRONTEND_URL', fallback);
}
function googleRedirectUrl(req) {
  const fallback = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  return configuredUrl('GOOGLE_REDIRECT_URI', fallback, '/api/auth/google/callback');
}
function friendlyGoogleError(error) {
  const quotaExceeded = Number(error?.code || error?.response?.status) === 403 && (
    (Array.isArray(error?.errors) && error.errors.some(item => item?.reason === 'storageQuotaExceeded')) ||
    (Array.isArray(error?.response?.data?.error?.errors) && error.response.data.error.errors.some(item => item?.reason === 'storageQuotaExceeded')) ||
    /user's Drive storage quota has been exceeded|storageQuotaExceeded/i.test(String(error?.message || ''))
  );
  if (quotaExceeded) return 'Your Google Drive storage is full. Free up space in Google Drive, Gmail, or Google Photos, then sign in again. Rental Manager saves your data in your own Google Drive.';
  return error?.message || 'Google sign-in could not be completed. Please try again.';
}
const authController = {
  async googleStart(req,res,next){
    try {
      const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleRedirectUrl(req));
      const state = crypto.randomBytes(24).toString('hex');
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `google_oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax${secure}`);
      const cookieHeader = req.headers.cookie || '';
      const hasRefreshCookie = /(?:^|;\s*)google_drive_refresh_token=/.test(cookieHeader);
      const hasDriveOwnerCookie = /(?:^|;\s*)google_drive_owner=/.test(cookieHeader);
      const prompt = hasRefreshCookie && hasDriveOwnerCookie && req.query.forceConsent !== '1' ? 'select_account' : 'consent select_account';
      const url = oauth.generateAuthUrl({ access_type:'offline', prompt, include_granted_scopes:true, scope:['openid','email','profile','https://www.googleapis.com/auth/drive.file'], state });
      res.redirect(url);
    } catch(e) { next(e); }
  },
  async googleCallback(req,res,next){
    try {
      const cookies = Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));
      if(!req.query.state || req.query.state !== cookies.google_oauth_state) throw new AppError('Google sign-in session expired. Please try again.',400);
      const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleRedirectUrl(req));
      const { tokens } = await oauth.getToken(req.query.code);
      oauth.setCredentials(tokens);
      const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers:{Authorization:`Bearer ${tokens.access_token}`} });
      if(!info.ok) throw new AppError('Unable to read Google account',401);
      const payload=await info.json();
      if (payload.email_verified === false) throw new AppError('Please use a verified Google account email.', 403);
      const user={id:`google:${payload.sub}`,name:payload.name||payload.email.split('@')[0],email:payload.email,profilePic:payload.picture||null,googleId:payload.sub,isVerified:true};
      const secure=process.env.NODE_ENV==='production'?'; Secure':'';
      const existingDriveOwner = cookies.google_drive_owner || '';
      if (!tokens.refresh_token && existingDriveOwner !== user.id) {
        const expiredCookies = [
          `rental_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
          `google_drive_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
          `google_drive_refresh_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
          `google_drive_owner=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
          `google_oauth_state=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`
        ];
        res.setHeader('Set-Cookie',expiredCookies);
        return res.redirect(`${frontendBaseUrl(req)}/?google_auth=error&message=${encodeURIComponent('Please continue with Google again to approve Drive access for this account.')}`);
      }
      const session=Auth.createSession(user);
      const cookiesOut=[`rental_session=${encodeURIComponent(session)}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax${secure}`,`google_oauth_state=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`];
      const accessMaxAge = tokens.expiry_date ? Math.max(60, Math.floor((tokens.expiry_date-Date.now())/1000)-60) : 3500;
      if(tokens.access_token) cookiesOut.push(`google_drive_token=${encodeURIComponent(tokens.access_token)}; Max-Age=${accessMaxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`);
      if(tokens.refresh_token) { cookiesOut.push(`google_drive_refresh_token=${encodeURIComponent(tokens.refresh_token)}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secure}`); cookiesOut.push(`google_drive_owner=${encodeURIComponent(user.id)}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secure}`); }
      res.setHeader('Set-Cookie',cookiesOut);
      if (!tokens.access_token) throw new AppError('Google did not grant Google Drive access. Please try again and approve the requested permission.', 403);
      await ensureUserData(user.id, tokens.access_token, user);
      if (process.env.LEGACY_DATABASE_URL || process.env.LEGACY_POSTGRES_URL) { try { const { migrateCurrentUserFromLegacy } = require('../services/legacyMigration'); await migrateCurrentUserFromLegacy(user.id,user.email,user.googleId,tokens.access_token); } catch (migrationError) { console.warn('Legacy migration skipped:', migrationError.message); } }
      res.redirect(`${frontendBaseUrl(req)}/?google_auth=success`);
    } catch(e) { const message = friendlyGoogleError(e); console.error('Google OAuth callback error:', e); res.redirect(`${frontendBaseUrl(req)}/?google_auth=error&message=${encodeURIComponent(message)}`); }
  },
  async exportBackup(req,res,next){
    try {
      const data = await Drive.getData();
      const date = new Date().toISOString().slice(0,10);
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Content-Disposition',`attachment; filename="rental-manager-backup-${date}.json"`);
      res.json({ ...data, schemaVersion: 3, backup: { source:'Rental Manager', format:'rental-manager-backup', exportedAt:new Date().toISOString() } });
    } catch(e) { next(e); }
  },
  async importBackup(req,res,next){
    try {
      const incoming = req.body;
      if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.properties) || !Array.isArray(incoming.tenants) || !Array.isArray(incoming.payments)) {
        throw new AppError('This file is not a valid Rental Manager backup.',400);
      }
      const counts = await Drive.mutate(async data => {
        const hasCurrentData = ['properties','rooms','tenants','payments','recycleBin'].some(k => Array.isArray(data[k]) && data[k].length);
        if (hasCurrentData) { await Drive.createBackupSnapshot(); data._autoBackupDate = new Date().toISOString().slice(0,10); }
        const owner = { id:req.userId, name:data.user?.name || req.user?.name || '', email:req.userEmail, profilePic:data.user?.profilePic || req.user?.profilePic || null, profileComplete:true };
        const importedRooms = Array.isArray(incoming.rooms) ? incoming.rooms.map(x=>({...x})) : incoming.properties.flatMap(property => {
          const nested = Array.isArray(property.rooms) ? property.rooms : [];
          const count = Math.max(0, Number(property.total_rooms || property.totalRooms || nested.length || 0));
          const tenants = incoming.tenants.filter(t=>t.property_id===property.id && t.status==='active');
          return Array.from({length:count},(_,index)=>{const number=index+1;const room=nested.find(r=>Number(r.room_number)===number)||{};const tenant=tenants.find(t=>Number(t.room_number)===number);return {id:room.id||`${property.id}-room-${number}`,property_id:property.id,room_number:number,room_name:room.room_name||`Room ${number}`,status:tenant?'occupied':(room.status==='maintenance'?'maintenance':'available'),tenant_id:tenant?.id||null,rent_amount:Number(room.rent_amount ?? property.base_rent ?? property.baseRent ?? 0)};});
        });
        const next = {
          schemaVersion:3, user:owner,
          properties:incoming.properties.map(x=>({...x,user_id:req.userId})),
          rooms:importedRooms,
          tenants:incoming.tenants.map(x=>({...x,user_id:req.userId})),
          payments:incoming.payments.map(x=>({...x,user_id:req.userId})),
          recycleBin:Array.isArray(incoming.recycleBin)?incoming.recycleBin.map(x=>({...x,user_id:req.userId})):[],
          settings:{...(incoming.settings&&typeof incoming.settings==='object'?incoming.settings:{}),user_id:req.userId},
          _autoBackupDate:new Date().toISOString().slice(0,10)
        };
        Object.keys(data).forEach(k=>delete data[k]);
        Object.assign(data,next);
        return {properties:data.properties.length,rooms:data.rooms.length,tenants:data.tenants.length,payments:data.payments.length,recycleBin:data.recycleBin.length};
      });
      res.json({success:true,data:counts,message:'Backup imported. This Google account now owns the imported records.'});
    } catch(e) { next(e); }
  },
  async backup(req,res,next){try{const token=await getDriveToken(req,res);if(!token)throw new AppError('Google Drive is not connected',401);await ensureUserData(req.userId,token);await Drive.saveData();const snapshot=await Drive.createBackupSnapshot();res.json({success:true,data:{...snapshot,updatedAt:new Date().toISOString()},message:'Backup created successfully'});}catch(e){next(e);}},
  async backupStatus(req,res,next){try{const token=await getDriveToken(req,res);if(!token)throw new AppError('Google Drive is not connected',401);res.json({success:true,data:await Drive.backupStatus()});}catch(e){next(e);}},
  async restoreBackup(req,res,next){try{const token=await getDriveToken(req,res);if(!token)throw new AppError('Google Drive is not connected',401);const result=await Drive.restoreBackup(req.body?.backupId||null);res.json({success:true,data:result,message:'Backup restored successfully'});}catch(e){next(e);}},
  async startFreshAccount(req,res,next){try{const token=await getDriveToken(req,res);if(!token)throw new AppError('Google Drive is not connected',401);const result=await Drive.startFreshAccount();res.json({success:true,data:result,message:'New empty account created. Existing backup snapshots were preserved.'});}catch(e){next(e);}},
  async deleteAccount(req,res,next){
    try {
      if (String(req.body?.confirmText || '').trim().toLowerCase() !== 'delete my account') throw new AppError('Type delete my account to confirm permanent deletion.',400);
      const cookies = Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));
      const deleted = await Drive.deleteUserAccountData();
      // Revoke the stored Google refresh token best-effort after deleting the app data.
      if (cookies.google_drive_refresh_token) {
        try { await fetch('https://oauth2.googleapis.com/revoke', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({token:cookies.google_drive_refresh_token}) }); }
        catch (revokeError) { console.warn('Google token revocation after account deletion was skipped:', revokeError.message); }
      }
      Auth.clearCookieHeader(res); clearDriveCookie(res);
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', [...(Array.isArray(res.getHeader('Set-Cookie')) ? res.getHeader('Set-Cookie') : [res.getHeader('Set-Cookie')].filter(Boolean)), `google_oauth_state=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`]);
      res.json({success:true,data:deleted,message:'Rental Manager account data deleted and signed out.'});
    } catch(e) { next(e); }
  },
  async logout(req,res,next){try{Auth.clearCookieHeader(res);clearDriveCookie(res);res.json({success:true,message:'Logged out successfully'});}catch(e){next(e);}},
  async me(req,res,next){try{const d=await Drive.getData();const u=d.user||{};res.json({success:true,data:{user:{id:req.userId,name:u.name||req.user?.name,email:req.userEmail,profilePic:u.profilePic||req.user?.profilePic||null,profileComplete:!!u.profileComplete,googleId:req.user?.googleId||null,isVerified:true}}});}catch(e){next(e);}},
  async updateProfile(req,res,next){try{const {name,profilePic,profileComplete}=req.body||{};const updated=await Drive.mutate(d=>{d.user=d.user||{};d.user.id=req.userId;d.user.name=String(name||d.user.name||req.user.name||'').trim();d.user.email=req.userEmail;d.user.profilePic=profilePic!==undefined?profilePic:(d.user.profilePic||req.user.profilePic||null);if(profileComplete===true)d.user.profileComplete=true;return d.user;});res.json({success:true,data:{user:{id:req.userId,name:updated.name,email:req.userEmail,profilePic:updated.profilePic||null,profileComplete:!!updated.profileComplete,googleId:req.user?.googleId||null,isVerified:true}},message:'Owner profile saved successfully'});}catch(e){next(e);}},
};
module.exports=authController;
