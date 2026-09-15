const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: true,
  message: 'Too many submissions from this device. Please try again later.',
});

function enabledFields(giveaway) {
  if (!giveaway) return [];

  return giveaway.fields
    .filter((f) => f.enabled)
    .sort((a, b) => a.order - b.order);
}

// ---------- Home ----------
router.get('/', async (req, res, next) => {
  try {
    const settings = await db.getSettings();
    const activeGiveaway = await db.getActiveGiveaway();

    res.render('home', {
      settings,
      activeGiveaway,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Rewards ----------
router.get('/rewards', async (req, res, next) => {
  try {
    const settings = await db.getSettings();
    const activeGiveaway = await db.getActiveGiveaway();
    const fields = enabledFields(activeGiveaway);

    res.render('rewards', {
      settings,
      activeGiveaway,
      fields,
      formValues: {},
      errors: null,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Submit Entry ----------
router.post('/rewards/claim', claimLimiter, async (req, res, next) => {
  try {
    const settings = await db.getSettings();
    const activeGiveaway = await db.getActiveGiveaway();

    if (!activeGiveaway) {
      return res.redirect('/rewards');
    }

    const fields = enabledFields(activeGiveaway);
    const values = {};
    const errors = {};

    fields.forEach((field) => {
      const raw = (req.body[field.id] || '')
        .toString()
        .trim();

      values[field.id] = raw;

      if (field.required && !raw) {
        errors[field.id] =
          `${field.label} is required.`;
      }
    });

    // Validation errors
    if (Object.keys(errors).length > 0) {
      return res.status(400).render('rewards', {
        settings,
        activeGiveaway,
        fields,
        formValues: values,
        errors,
      });
    }

    // Save submission
    const submission = await db.addSubmission(
      activeGiveaway.id,
      values
    );

    if (!submission) {
      return res.redirect('/rewards');
    }

    const status = submission.status;

    // Get the message configured by admin
    const message = db.getSubmissionMessage(
      activeGiveaway,
      status
    );

    const submittedFields = fields.map((field) => ({
      label: field.label,
      value: values[field.id],
    }));

    res.render('confirmation', {
      settings,
      giveawayTitle: activeGiveaway.title,
      submittedFields,
      status,
      message,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
