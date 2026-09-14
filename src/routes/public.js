const express = require('express');
const supabase = require('../config/supabase');
const { getActiveGiveaway, publicStatus } = require('../services/giveaway');
const {
  FIELD_TYPES,
  normalizeSubmissionValue,
  validateFieldType
} = require('../utils/validation');

const router = express.Router();

router.get('/settings', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('welcome_heading,welcome_message,security_message,primary_button_text,secondary_button_text')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    res.json(data || {
      welcome_heading: 'Welcome to Bonus Coin Giveaway',
      welcome_message: 'Complete the steps to enter the current giveaway.',
      security_message: 'Your submitted information is secured and will not be publicly displayed.',
      primary_button_text: 'Claim Reward',
      secondary_button_text: 'View Rewards'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/giveaway', async (req, res, next) => {
  try {
    const giveaway = await getActiveGiveaway();
    if (!giveaway) return res.json({ giveaway: null });
    res.json({
      giveaway: {
        id: giveaway.id,
        title: giveaway.title,
        description: giveaway.description,
        reward_information: giveaway.reward_information,
        image_url: giveaway.image_url,
        start_date: giveaway.start_date,
        end_date: giveaway.end_date,
        status: publicStatus(giveaway)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/fields', async (req, res, next) => {
  try {
    const giveaway = await getActiveGiveaway();
    if (!giveaway) return res.json({ fields: [] });

    const { data, error } = await supabase
      .from('custom_fields')
      .select('id,label,placeholder,field_type,required,copy_enabled,display_order')
      .eq('giveaway_id', giveaway.id)
      .eq('enabled', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    res.json({ fields: data || [] });
  } catch (err) {
    next(err);
  }
});

router.post('/submissions', async (req, res, next) => {
  try {
    const giveaway = await getActiveGiveaway();
    if (!giveaway || publicStatus(giveaway) !== 'active') {
      return res.status(409).json({ error: 'This giveaway is not accepting submissions.' });
    }

    const { data: fields, error: fieldsError } = await supabase
      .from('custom_fields')
      .select('id,label,field_type,required,enabled')
      .eq('giveaway_id', giveaway.id)
      .eq('enabled', true)
      .order('display_order', { ascending: true });

    if (fieldsError) throw fieldsError;

    const incoming = req.body?.values;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return res.status(400).json({ error: 'Invalid submission data.' });
    }

    const allowed = new Map((fields || []).map(f => [String(f.id), f]));
    const keys = Object.keys(incoming);
    for (const key of keys) {
      if (!allowed.has(key)) {
        return res.status(400).json({ error: 'The form has changed. Please refresh and try again.' });
      }
    }

    const submittedData = {};
    for (const field of fields || []) {
      const raw = incoming[String(field.id)];
      const value = normalizeSubmissionValue(field.field_type, raw);

      if (field.required && !value) {
        return res.status(400).json({ error: `${field.label} is required.` });
      }

      if (value && !validateFieldType(field.field_type, value)) {
        return res.status(400).json({ error: `Please enter a valid ${field.field_type} for ${field.label}.` });
      }

      if (value) submittedData[String(field.id)] = value;
    }

    const { data, error } = await supabase
      .from('submissions')
      .insert({
        giveaway_id: giveaway.id,
        submitted_data: submittedData,
        eligibility_status: 'eligible'
      })
      .select('id')
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, submission_id: data.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
                                                
