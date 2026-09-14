const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'bonus_admin_session';
const CSRF_COOKIE = 'bonus_csrf';

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function verifyAdminPassword(password) {
  if (process.env.ADMIN_PASSWORD_HASH) {
    return bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  }
  const configured = process.env.ADMIN_PASSWORD || '';
  return safeEqual(password, configured);
}

function createSessionToken(username) {
  const payload = {
    u: username,
    exp: Date.now() + 1000 * 60 * 60 * 8
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || !process.env.SESSION_SECRET) return null;
  const [encoded, signature] = String(token).split('.');
  if (!encoded || !signature) return null;
  const expected = crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function issueCsrf(res) {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 8,
    path: '/'
  });
  return token;
}

function csrfOk(req) {
  const cookie = req.cookies[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  return !!cookie && !!header && safeEqual(cookie, header);
}

function setSession(res, username) {
  res.cookie(COOKIE_NAME, createSessionToken(username), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 8,
    path: '/'
  });
  issueCsrf(res);
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

function adminFromRequest(req) {
  return verifySessionToken(req.signedCookies?.[COOKIE_NAME] || req.cookies?.[COOKIE_NAME]);
}

module.exports = {
  COOKIE_NAME,
  CSRF_COOKIE,
  verifyAdminPassword,
  setSession,
  clearSession,
  csrfOk,
  issueCsrf,
  adminFromRequest
};
    
