function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/admin/login');
}

function redirectIfAuthed(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin');
  }
  return next();
}

module.exports = { requireAdmin, redirectIfAuthed };
