const { adminFromRequest } = require('../utils/security');

function requireAdmin(req, res, next) {
  const admin = adminFromRequest(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  req.admin = admin;
  next();
}

module.exports = { requireAdmin };
