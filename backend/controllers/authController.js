const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const { setDriveCookies, clearDriveCookie, ensureUserData, getStatus, getDriveToken } = require('../services/googleDrive');
const Drive = require('../services/driveStore');
const Auth = require('../middleware/auth');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const unsupported = () => { throw new AppError('Google Sign-In is required because Rental Manager data is stored in your Google Drive.', 400); };
const authController = {
  async register(req,res,next){try{unsupported();}catch(e){next(e);}},
  async verifyEmail(req,res,next){try{unsupported();}catch(e){next(e);}},
  async resendVerification(req,res,next){try{unsupported();}catch(e){next(e);}},
  async login(req,res,next){try{unsupported();}catch(e){next(e);}},
  async forgotPassword(req,res,next){try{unsupported();}catch(e){next(e);}},
  async resetPassword(req,res,next){try{unsupported();}catch(e){next(e);}},
  async googleStart(req,res,next){
    try {
      const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/google/callback`);
      const state = crypto.randomBytes(24).toString('hex');
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `google_oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax${secure}`);
      const url = oauth.generateAuthUrl({ access_type:'offline', prompt:'consent', include_granted_scopes:true, scope:['openid','email','profile','https://www.googleapis.com/auth/drive.file'], state });
      res.redirect(url);
    } catch(e) { next(e); }
  },
  async googleCallback(req,res,next){
    try {
      const cookies = Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));
      if(!req.query.state || req.query.state !== cookies.google_oauth_state) throw new AppError('Google sign-in session expired. Please try again.',400);
      const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/google/callback`);
      const { tokens } = await oauth.getToken(req.query.code);
      oauth.setCredentials(tokens);
      const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers:{Authorization:`Bearer ${tokens.access_token}`} });
      if(!info.ok) throw new AppError('Unable to read Google account',401);
      const payload=await info.json();
      const user={id:`google:${payload.sub}`,name:payload.name||payload.email.split('@')[0],email:payload.email,profilePic:payload.picture||null,googleId:payload.sub,isVerified:true,hasPassword:false};
      const session=Auth.createSession(user);
      const secure=process.env.NODE_ENV==='production'?'; Secure':'';
      const cookiesOut=[`rental_session=${encodeURIComponent(session)}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax${secure}`,`google_oauth_state=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`];
      if(tokens.access_token) cookiesOut.push(`google_drive_token=${encodeURIComponent(tokens.access_token)}; Max-Age=${Math.max(60,Math.floor((tokens.expiry_date-Date.now())/1000)-60)}; Path=/; HttpOnly; SameSite=Lax${secure}`);
      if(tokens.refresh_token) cookiesOut.push(`google_drive_refresh_token=${encodeURIComponent(tokens.refresh_token)}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax${secure}`);
      res.setHeader('Set-Cookie',cookiesOut);
      if (process.env.LEGACY_DATABASE_URL || process.env.LEGACY_POSTGRES_URL) { try { const { migrateCurrentUserFromLegacy } = require('../services/legacyMigration'); await migrateCurrentUserFromLegacy(user.id,user.email,user.googleId,tokens.access_token); } catch (migrationError) { console.warn('Legacy migration skipped:', migrationError.message); } }
      res.redirect(`${process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`}?google_auth=success`);
    } catch(e) { console.error('Google OAuth callback error:',e); res.redirect(`${process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`}?google_auth=error&message=${encodeURIComponent(e.message)}`); }
  },
  async googleLogin(req,res,next){
    try {
      const { token: googleToken, idToken } = req.body || {};
      if(!googleToken&&!idToken) throw new AppError('Google token is required',400);
      let email,name,picture,googleId;
      if(idToken){
        const ticket=await googleClient.verifyIdToken({idToken,audience:process.env.GOOGLE_CLIENT_ID});
        const payload=ticket.getPayload(); if(!payload) throw new AppError('Invalid Google ID token',401);
        ({email,name,picture,sub:googleId}=payload);
      } else {
        const r=await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(googleToken)}`);
        if(!r.ok) throw new AppError('Invalid or expired Google token',401);
        const payload=await r.json(); ({email,name,picture,sub:googleId}=payload);
      }
      if(!email||!googleId) throw new AppError('Could not retrieve Google account details',400);
      const user={id:`google:${googleId}`,name:name||email.split('@')[0],email,profilePic:picture||null,googleId,isVerified:true,hasPassword:false};
      const session=Auth.createSession(user);
      const secure=process.env.NODE_ENV==='production'?'; Secure':'';
      res.setHeader('Set-Cookie',`rental_session=${encodeURIComponent(session)}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax${secure}`);
      // IMPORTANT: Google sign-in and Google Drive authorization are separate.
      // The web login token only has identity scopes. Do not try to use it as a
      // Drive token here; Drive authorization happens through /google-drive-token.
      // This prevents Google from blocking ordinary sign-in because the app also
      // requests Drive access.
      res.json({success:true,data:{user},message:'Google login successful'});
    } catch(error){console.error('Google login error:',error);next(new AppError('Google authentication failed: '+error.message,401));}
  },
  async setGoogleDriveToken(req,res,next){try{const {token}=req.body||{};if(!token)throw new AppError('Google Drive token is required',400);const previous=req.headers.cookie||'';req.headers.cookie=`google_drive_token=${encodeURIComponent(token)}`;const status=await getStatus(req);req.headers.cookie=previous;if(!status.connected)throw new AppError('Google Drive authorization failed',401);setDriveCookie(res,token);await ensureUserData(req.userId,token);try { const migrated=await migrateCurrentUserFromLegacy(req.userId,req.userEmail,req.user?.googleId,token); if(migrated.migrated) console.log('Legacy data migrated to Google Drive:', migrated.counts); } catch(e) { console.warn('Legacy migration skipped:', e.message); }res.json({success:true,data:{connected:true},message:'Google Drive connected'});}catch(e){next(e);}},
  async migrateLegacy(req,res,next){try{const token=getDriveToken(req);if(!token)throw new AppError('Google Drive access is required',401);const result=await migrateCurrentUserFromLegacy(req.userId,req.userEmail,req.user?.googleId,token);res.json({success:true,data:result,message:result.migrated?'Legacy data migrated to Google Drive':'No migration performed'});}catch(e){next(e);}},
  async backup(req,res,next){try{const token=await getDriveToken(req,res);if(!token)throw new AppError('Google Drive is not connected',401);await ensureUserData(req.userId,token);await Drive.saveData();const snapshot=await Drive.createBackupSnapshot();res.json({success:true,data:{...snapshot,updatedAt:new Date().toISOString()},message:'Backup created successfully'});}catch(e){next(e);}},
  async backupStatus(req,res,next){try{const token=await getDriveToken(req,res);if(!token)throw new AppError('Google Drive is not connected',401);res.json({success:true,data:await Drive.backupStatus()});}catch(e){next(e);}},
  async restoreBackup(req,res,next){try{const token=await getDriveToken(req,res);if(!token)throw new AppError('Google Drive is not connected',401);const result=await Drive.restoreBackup(req.body?.backupId||null);res.json({success:true,data:result,message:'Backup restored successfully'});}catch(e){next(e);}},
  async startFreshAccount(req,res,next){try{const token=await getDriveToken(req,res);if(!token)throw new AppError('Google Drive is not connected',401);const result=await Drive.startFreshAccount();res.json({success:true,data:result,message:'New empty account created. Existing backup snapshots were preserved.'});}catch(e){next(e);}},
  async logout(req,res,next){try{Auth.clearCookieHeader(res);clearDriveCookie(res);res.json({success:true,message:'Logged out successfully'});}catch(e){next(e);}},
  async me(req,res,next){try{const d=await Drive.getData();const u=d.user||{};res.json({success:true,data:{user:{id:req.userId,name:u.name||req.user?.name,email:req.userEmail,profilePic:u.profilePic||req.user?.profilePic||null,googleId:req.user?.googleId||null,isVerified:true,hasPassword:false}}});}catch(e){next(e);}},
  async updateProfile(req,res,next){try{const {name,profilePic}=req.body||{};const updated=await Drive.mutate(d=>{d.user=d.user||{};d.user.id=req.userId;d.user.name=name||d.user.name||req.user.name;d.user.email=req.userEmail;d.user.profilePic=profilePic!==undefined?profilePic:(d.user.profilePic||req.user.profilePic||null);return d.user;});res.json({success:true,data:{user:{id:req.userId,name:updated.name,email:req.userEmail,profilePic:updated.profilePic||null,googleId:req.user?.googleId||null,isVerified:true,hasPassword:false}},message:'Profile updated successfully'});}catch(e){next(e);}},
  async changePassword(req,res,next){try{throw new AppError('Password login is disabled. Your account is secured by Google Sign-In.',400);}catch(e){next(e);}},
  async deleteAccount(req,res,next){try{throw new AppError('Account deletion is managed through Google Sign-In and Google Drive.',400);}catch(e){next(e);}}
};
module.exports=authController;
