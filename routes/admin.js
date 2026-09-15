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
router.get('/', async (req, res, next) => {
  try {
    const giveaways = await db.getGiveaways();
    const activeGiveaway = await db.getActiveGiveaway();

    const submissions = activeGiveaway
      ? await db.getSubmissionsForGiveaway(activeGiveaway.id)
      : [];

    const submissionCount = submissions.length;

    res.render('admin/dashboard', {
      giveaways,
      activeGiveaway,
      submissionCount,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Settings ----------
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await db.getSettings();

    res.render('admin/settings', {
      settings,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/settings', async (req, res, next) => {
  try {
    const {
      siteName,
      welcomeTitle,
      welcomeMessage,
    } = req.body;

    await db.updateSettings({
      siteName,
      welcomeTitle,
      welcomeMessage,
    });

    req.flash('success', 'Welcome content updated.');
    res.redirect('/admin/settings');
  } catch (err) {
    next(err);
  }
});

// ---------- Giveaways ----------
router.get('/giveaways', async (req, res, next) => {
  try {
    const giveaways = await db.getGiveaways();

    res.render('admin/giveaways', {
      giveaways,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/giveaways', async (req, res, next) => {
  try {
    const {
      title,
      description,
      winnerCount,
      pendingMessage,
      winnerMessage,
      declinedMessage,
    } = req.body;

    const giveaway = await db.createGiveaway({
      title,
      description,
      winnerCount: Number(winnerCount) || 1,
      pendingMessage,
      successMessage: winnerMessage,
      declinedMessage,
    });

    req.flash(
      'success',
      'Giveaway created. Add fields before activating it.'
    );

    res.redirect(`/admin/giveaways/${giveaway.id}/fields`);
  } catch (err) {
    next(err);
  }
});

router.post('/giveaways/:id/update', async (req, res, next) => {
  try {
    const {
      title,
      description,
      winnerCount,
      pendingMessage,
      winnerMessage,
      declinedMessage,
    } = req.body;

    await db.updateGiveaway(req.params.id, {
      title,
      description,
      winnerCount: Number(winnerCount) || 1,
      pendingMessage,
      successMessage: winnerMessage,
      declinedMessage,
    });

    req.flash(
      'success',
      'Giveaway settings updated.'
    );

    res.redirect('/admin/giveaways');
  } catch (err) {
    next(err);
  }
});

// ---------- Activate ----------
router.post('/giveaways/:id/activate', async (req, res, next) => {
  try {
    const giveaway = await db.getGiveaway(req.params.id);

    if (!giveaway) {
      req.flash('error', 'Giveaway not found.');
      return res.redirect('/admin/giveaways');
    }

    await db.setActiveGiveaway(req.params.id);

    req.flash(
      'success',
      'Giveaway is now live on the public site.'
    );

    res.redirect('/admin/giveaways');
  } catch (err) {
    next(err);
  }
});

// ---------- Deactivate ----------
router.post('/giveaways/:id/deactivate', async (req, res, next) => {
  try {
    await db.deactivateAllGiveaways();

    req.flash(
      'success',
      'Giveaway taken offline.'
    );

    res.redirect('/admin/giveaways');
  } catch (err) {
    next(err);
  }
});

// ---------- Delete ----------
router.post('/giveaways/:id/delete', async (req, res, next) => {
  try {
    await db.deleteGiveaway(req.params.id);

    req.flash(
      'success',
      'Giveaway and its submissions were deleted.'
    );

    res.redirect('/admin/giveaways');
  } catch (err) {
    next(err);
  }
});

// ---------- Fields ----------
router.get('/giveaways/:id/fields', async (req, res, next) => {
  try {
    const giveaway = await db.getGiveaway(req.params.id);

    if (!giveaway) {
      req.flash('error', 'Giveaway not found.');
      return res.redirect('/admin/giveaways');
    }

    const fields = giveaway.fields
      .slice()
      .sort((a, b) => a.order - b.order);

    res.render('admin/fields', {
      giveaway,
      fields,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/giveaways/:id/fields', async (req, res, next) => {
  try {
    const {
      label,
      placeholder,
      required,
      copyable,
    } = req.body;

    await db.addField(req.params.id, {
      label,
      placeholder,
      required: required === 'on',
      copyable: copyable === 'on',
    });

    req.flash('success', 'Field added.');

    res.redirect(
      `/admin/giveaways/${req.params.id}/fields`
    );
  } catch (err) {
    next(err);
  }
});

router.post(
  '/giveaways/:id/fields/:fieldId/update',
  async (req, res, next) => {
    try {
      const {
        label,
        placeholder,
        required,
        copyable,
        enabled,
      } = req.body;

      await db.updateField(
        req.params.id,
        req.params.fieldId,
        {
          label,
          placeholder,
          required: required === 'on',
          copyable: copyable === 'on',
          enabled: enabled === 'on',
        }
      );

      req.flash('success', 'Field updated.');

      res.redirect(
        `/admin/giveaways/${req.params.id}/fields`
      );
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/giveaways/:id/fields/:fieldId/delete',
  async (req, res, next) => {
    try {
      await db.deleteField(
        req.params.id,
        req.params.fieldId
      );

      req.flash('success', 'Field deleted.');

      res.redirect(
        `/admin/giveaways/${req.params.id}/fields`
      );
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/giveaways/:id/fields/:fieldId/move',
  async (req, res, next) => {
    try {
      const { direction } = req.body;

      const giveaway = await db.getGiveaway(req.params.id);

      if (giveaway) {
        const sorted = giveaway.fields
          .slice()
          .sort((a, b) => a.order - b.order);

        const index = sorted.findIndex(
          (field) => field.id === req.params.fieldId
        );

        const swapWith =
          direction === 'up'
            ? index - 1
            : index + 1;

        if (
          index !== -1 &&
          swapWith >= 0 &&
          swapWith < sorted.length
        ) {
          const ids = sorted.map(
            (field) => field.id
          );

          [ids[index], ids[swapWith]] = [
            ids[swapWith],
            ids[index],
          ];

          await db.reorderFields(
            req.params.id,
            ids
          );
        }
      }

      res.redirect(
        `/admin/giveaways/${req.params.id}/fields`
      );
    } catch (err) {
      next(err);
    }
  }
);

// ---------- Submissions ----------
router.get(
  '/giveaways/:id/submissions',
  async (req, res, next) => {
    try {
      const giveaway = await db.getGiveaway(req.params.id);

      if (!giveaway) {
        req.flash(
          'error',
          'Giveaway not found.'
        );

        return res.redirect('/admin/giveaways');
      }

      const fields = giveaway.fields
        .slice()
        .sort((a, b) => a.order - b.order);

      const submissions =
        await db.getSubmissionsForGiveaway(
          req.params.id
        );

      const winnerCount =
        await db.getWinnerCount(req.params.id);

      const currentWinnerCount =
        await db.getCurrentWinnerCount(
          req.params.id
        );

      res.render('admin/submissions', {
        giveaway,
        fields,
        submissions,
        winnerCount,
        currentWinnerCount,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
