const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many submissions from this device. Please try again later.',
});

function enabledFields(giveaway) {
  if (!giveaway) return [];
  return giveaway.fields.filter((f) => f.enabled).sort((a, b) => a.order - b.order);
}

router.get('/', (req, res) => {
  const settings = db.getSettings();
  const activeGiveaway = db.getActiveGiveaway();
  res.render('home', { settings, activeGiveaway });
});

router.get('/rewards', (req, res) => {
  const settings = db.getSettings();
  const activeGiveaway = db.getActiveGiveaway();
  const fields = enabledFields(activeGiveaway);
  res.render('rewards', { settings, activeGiveaway, fields, formValues: {}, errors: null });
});

router.post('/rewards/claim', claimLimiter, (req, res) => {
  const settings = db.getSettings();
  const activeGiveaway = db.getActiveGiveaway();

  if (!activeGiveaway) {
    return res.redirect('/rewards');
  }

  const fields = enabledFields(activeGiveaway);
  const values = {};
  const errors = {};

  fields.forEach((field) => {
    const raw = (req.body[field.id] || '').toString().trim();
    values[field.id] = raw;
    if (field.required && !raw) {
      errors[field.id] = `${field.label} is required.`;
    }
  });

  if (Object.keys(errors).length > 0) {
    return res.status(400).render('rewards', {
      settings,
      activeGiveaway,
      fields,
      formValues: values,
      errors,
    });
  }

  const submission = db.addSubmission(activeGiveaway.id, values);

  Promise.resolve(submission).then((saved) => {
    const submittedFields = fields.map((f) => ({
      label: f.label,
      value: values[f.id],
      copyable: f.copyable,
    }));
    res.render('confirmation', {
      settings,
      giveawayTitle: activeGiveaway.title,
      submittedFields,
    });
  });
});

module.exports = router;
