const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAdmin, redirectIfAuthed } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});

// ---------- Auth ----------
router.get('/login', redirectIfAuthed, (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/login', loginLimiter, redirectIfAuthed, (req, res) => {
  const { pin } = req.body;
  const adminPin = process.env.ADMIN_PIN;

  if (!adminPin) {
    return res.render('admin/login', {
      error: 'Admin PIN is not configured on the server. Set ADMIN_PIN in Render.',
    });
  }

  const pinMatches = String(pin || '') === String(adminPin);

  if (!pinMatches) {
    return res.status(401).render('admin/login', {
      error: 'Incorrect PIN.',
    });
  }

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('admin/login', {
        error: 'Something went wrong. Try again.',
      });
    }

    req.session.isAdmin = true;
    req.session.adminUsername = 'Admin';

    res.redirect('/admin');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// Everything below requires authentication.
router.use(requireAdmin);

// ---------- Dashboard ----------
router.get('/', (req, res) => {
  const giveaways = db.getGiveaways();
  const activeGiveaway = db.getActiveGiveaway();
  const submissionCount = activeGiveaway
    ? db.getSubmissionsForGiveaway(activeGiveaway.id).length
    : 0;
  res.render('admin/dashboard', { giveaways, activeGiveaway, submissionCount });
});

// ---------- Settings (welcome message) ----------
router.get('/settings', (req, res) => {
  const settings = db.getSettings();
  res.render('admin/settings', { settings });
});

router.post('/settings', async (req, res) => {
  const { siteName, welcomeTitle, welcomeMessage } = req.body;
  await db.updateSettings({ siteName, welcomeTitle, welcomeMessage });
  req.flash('success', 'Welcome content updated.');
  res.redirect('/admin/settings');
});

// ---------- Giveaways ----------
router.get('/giveaways', (req, res) => {
  const giveaways = db.getGiveaways();
  res.render('admin/giveaways', { giveaways });
});

router.post('/giveaways', async (req, res) => {
  const { title, description } = req.body;
  const giveaway = await db.createGiveaway({ title, description });
  req.flash('success', 'Giveaway created. Add fields before activating it.');
  res.redirect(`/admin/giveaways/${giveaway.id}/fields`);
});

router.post('/giveaways/:id/update', async (req, res) => {
  const { title, description } = req.body;
  await db.updateGiveaway(req.params.id, { title, description });
  req.flash('success', 'Giveaway details updated.');
  res.redirect('/admin/giveaways');
});

router.post('/giveaways/:id/activate', async (req, res) => {
  await db.setActiveGiveaway(req.params.id);
  req.flash('success', 'Giveaway is now live on the public site.');
  res.redirect('/admin/giveaways');
});

router.post('/giveaways/:id/deactivate', async (req, res) => {
  await db.deactivateAllGiveaways();
  req.flash('success', 'Giveaway taken offline. The Rewards page will show no active reward.');
  res.redirect('/admin/giveaways');
});

router.post('/giveaways/:id/delete', async (req, res) => {
  await db.deleteGiveaway(req.params.id);
  req.flash('success', 'Giveaway and its submissions were deleted.');
  res.redirect('/admin/giveaways');
});

// ---------- Fields ----------
router.get('/giveaways/:id/fields', (req, res) => {
  const giveaway = db.getGiveaway(req.params.id);
  if (!giveaway) {
    req.flash('error', 'Giveaway not found.');
    return res.redirect('/admin/giveaways');
  }
  const fields = giveaway.fields.slice().sort((a, b) => a.order - b.order);
  res.render('admin/fields', { giveaway, fields });
});

router.post('/giveaways/:id/fields', async (req, res) => {
  const { label, placeholder, required, copyable } = req.body;
  await db.addField(req.params.id, {
    label,
    placeholder,
    required: required === 'on',
    copyable: copyable === 'on',
  });
  req.flash('success', 'Field added.');
  res.redirect(`/admin/giveaways/${req.params.id}/fields`);
});

router.post('/giveaways/:id/fields/:fieldId/update', async (req, res) => {
  const { label, placeholder, required, copyable, enabled } = req.body;
  await db.updateField(req.params.id, req.params.fieldId, {
    label,
    placeholder,
    required: required === 'on',
    copyable: copyable === 'on',
    enabled: enabled === 'on',
  });
  req.flash('success', 'Field updated.');
  res.redirect(`/admin/giveaways/${req.params.id}/fields`);
});

router.post('/giveaways/:id/fields/:fieldId/delete', async (req, res) => {
  await db.deleteField(req.params.id, req.params.fieldId);
  req.flash('success', 'Field deleted.');
  res.redirect(`/admin/giveaways/${req.params.id}/fields`);
});

router.post('/giveaways/:id/fields/:fieldId/move', async (req, res) => {
  const { direction } = req.body; // 'up' | 'down'
  const giveaway = db.getGiveaway(req.params.id);
  if (giveaway) {
    const sorted = giveaway.fields.slice().sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((f) => f.id === req.params.fieldId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (index !== -1 && swapWith >= 0 && swapWith < sorted.length) {
      const ids = sorted.map((f) => f.id);
      [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
      await db.reorderFields(req.params.id, ids);
    }
  }
  res.redirect(`/admin/giveaways/${req.params.id}/fields`);
});

// ---------- Submissions & winner selection ----------
router.get('/giveaways/:id/submissions', (req, res) => {
  const giveaway = db.getGiveaway(req.params.id);
  if (!giveaway) {
    req.flash('error', 'Giveaway not found.');
    return res.redirect('/admin/giveaways');
  }
  const fields = giveaway.fields.slice().sort((a, b) => a.order - b.order);
  const submissions = db.getSubmissionsForGiveaway(req.params.id);
  res.render('admin/submissions', { giveaway, fields, submissions });
});

router.post('/giveaways/:id/submissions/:subId/select', async (req, res) => {
  await db.clearWinner(req.params.id);
  await db.setSubmissionStatus(req.params.subId, 'winner');
  req.flash('success', 'Winner selected manually.');
  res.redirect(`/admin/giveaways/${req.params.id}/submissions`);
});

router.post('/giveaways/:id/pick-winner', async (req, res) => {
  const winner = await db.pickRandomWinner(req.params.id);
  if (winner) {
    req.flash('success', 'A random winner was selected.');
  } else {
    req.flash('error', 'There are no submissions to pick from yet.');
  }
  res.redirect(`/admin/giveaways/${req.params.id}/submissions`);
});

router.post('/giveaways/:id/reset-winner', async (req, res) => {
  await db.clearWinner(req.params.id);
  req.flash('success', 'Winner selection cleared.');
  res.redirect(`/admin/giveaways/${req.params.id}/submissions`);
});

module.exports = router;
