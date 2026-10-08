const crypto = require('crypto');
const { AppError } = require('./errorHandler');
const { getDriveToken } = require('../services/googleDrive');
const { runWithRequestContext } = require('../services/driveStore');
const SECRET = process.env.JWT_SECRET || 'change-me';
const COOKIE_NAME = 'rental_session';
function b64(v){return Buffer.from(v).toString('base64url');}
function sign(payload){const body=b64(JSON.stringify(payload));const sig=crypto.createHmac('sha256',SECRET).update(body).digest('base64url');return `${body}.${sig}`;}
function verify(token){if(!token)return null;const [body,sig]=String(token).split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',SECRET).update(body).digest('base64url');if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;let p;try{p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));}catch{return null;}if(!p.exp||p.exp<Date.now())return null;return p;}
function createSession(user){return sign({sub:user.id,email:user.email,name:user.name||'',picture:user.profilePic||null,googleId:user.googleId||null,exp:Date.now()+7*86400000});}
function getToken(req){const cookies=(req.headers.cookie||'').split(';').map(v=>v.trim());const cookie=cookies.find(v=>v.startsWith(`${COOKIE_NAME}=`));return cookie?decodeURIComponent(cookie.slice(COOKIE_NAME.length+1)):req.headers.authorization?.split(' ')[1]||null;}
const authMiddleware={
  async authenticate(req,res,next){try{const session=verify(getToken(req));if(!session)throw new AppError('Invalid or expired session',401);const driveToken=getDriveToken(req);req.userId=session.sub;req.userEmail=session.email;req.user={id:session.sub,name:session.name,email:session.email,profilePic:session.picture,googleId:session.googleId,isVerified:true,hasPassword:false};req.session=session;await runWithRequestContext(req.userId,driveToken,()=>next());}catch(e){next(e);}},
  async optionalAuth(req,res,next){try{const session=verify(getToken(req));if(session){req.userId=session.sub;req.userEmail=session.email;req.user=session;await runWithRequestContext(req.userId,getDriveToken(req),()=>next());}else next();}catch(e){next();}}
};
authMiddleware.createSession=createSession;
authMiddleware.clearCookieHeader=(res)=>{const secure=process.env.NODE_ENV==='production'?'; Secure':'';res.setHeader('Set-Cookie',`${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);};
module.exports=authMiddleware;
