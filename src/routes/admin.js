const express = require('express');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { requireAdmin } = require('../middleware/auth');
const {
  verifyAdminPassword,
  setSession,
  clearSession,
  csrfOk,
  issueCsrf,
  adminFromRequest
} = require('../utils/security');
const { cleanText, FIELD_TYPES } = require('../utils/validation');
const { publicStatus } = require('../services/giveaway');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const username = cleanText(req.body?.username, 200);
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const expectedUsername = process.env.ADMIN_USERNAME || '';
    const usernameMatches = username === expectedUsername;
    const passwordMatches = await verifyAdminPassword(password);

    if (!usernameMatches || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    setSession(res, username);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/session', (req, res) => {
  const admin = adminFromRequest(req);
  if (!admin) return res.status(401).json({ authenticated: false });
  const csrf = req.cookies?.bonus_csrf || issueCsrf(res);
  res.json({ authenticated: true, username: admin.u, csrf });
});

router.post('/logout', requireAdmin, (req, res) => {
  if (!csrfOk(req)) return res.status(403).json({ error: 'Invalid CSRF token.' });
  clearSession(res);
  res.json({ success: true });
});

router.get('/dashboard', requireAdmin, async (req, res, next) => {
  try {
    const [{ count: total }, { count: eligible }, { count: fields }, { data: giveaway }] = await Promise.all([
      supabase.from('submissions').select('*', { count: 'exact', head: true }),
      supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('eligibility_status', 'eligible'),
      supabase.from('custom_fields').select('*', { count: 'exact', head: true }).eq('enabled', true),
      supabase.from('giveaways').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle()
    ]);

    if (!giveaway && total === null) throw new Error('Unable to load dashboard.');

    let winner = null;
    if (giveaway) {
      const { data } = await supabase
        .from('winners')
        .select('id,selection_method,selected_at,submission_id')
        .eq('giveaway_id', giveaway.id)
        .maybeSingle();
      winner = data;
    }

    res.json({
      total_submissions: total || 0,
      eligible_submissions: eligible || 0,
      configured_fields: fields || 0,
      giveaway: giveaway ? {
        ...giveaway,
        status: publicStatus(giveaway)
      } : null,
      winner
    });
  } catch (err) {
    next(err);
  }
});

router.get('/settings', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    res.json(data || {});
  } catch (err) { next(err); }
});

router.put('/settings', requireAdmin, async (req, res, next) => {
  try {
    if (!csrfOk(req)) return res.status(403).json({ error: 'Invalid CSRF token.' });

    const payload = {
      welcome_heading: cleanText(req.body?.welcome_heading, 200),
      welcome_message: cleanText(req.body?.welcome_message, 2000),
      security_message: cleanText(req.body?.security_message, 1000),
      primary_button_text: cleanText(req.body?.primary_button_text, 60) || 'Claim Reward',
      secondary_button_text: cleanText(req.body?.secondary_button_text, 60) || 'View Rewards'
    };

    const { data, error } = await supabase
      .from('settings')
      .upsert({ id: 1, ...payload }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/giveaways', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('giveaways').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ giveaways: (data || []).map(g => ({ ...g, status: publicStatus(g) })) });
  } catch (err) { next(err); }
});

router.post('/giveaways', requireAdmin, async (req, res, next) => {
  try {
    if (!csrfOk(req)) return res.status(403).json({ error: 'Invalid CSRF token.' });

    const payload = {
      title: cleanText(req.body?.title, 200),
      description: cleanText(req.body?.description, 3000),
      reward_information: cleanText(req.body?.reward_information, 2000),
      image_url: cleanText(req.body?.image_url, 2000) || null,
      start_date: req.body?.start_date || null,
      end_date: req.body?.end_date || null,
      is_active: Boolean(req.body?.is_active)
    };

    if (!payload.title) return res.status(400).json({ error: 'Giveaway title is required.' });
    if (payload.start_date && payload.end_date && new Date(payload.end_date) <= new Date(payload.start_date)) {
      return res.status(400).json({ error: 'End date must be after start date.' });
    }

    if (payload.is_active) {
      await supabase.from('giveaways').update({ is_active: false }).eq('is_active', true);
    }

    const { data, error } = await supabase.from('giveaways').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json({ giveaway: { ...data, status: publicStatus(data) } });
  } catch (err) { next(err); }
});

router.put('/giveaways/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!csrfOk(req)) return res.status(403).json({ error: 'Invalid CSRF token.' });

    const id = req.params.id;
    const { data: existing, error: findError } = await supabase.from('giveaways').select('*').eq('id', id).single();
    if (findError) return res.status(404).json({ error: 'Giveaway not found.' });

    const payload = {
      title: cleanText(req.body?.title, 200),
      description: cleanText(req.body?.description, 3000),
      reward_information: cleanText(req.body?.reward_information, 2000),
      image_url: cleanText(req.body?.image_url, 2000) || null,
      start_date: req.body?.start_date || null,
      end_date: req.body?.end_date || null,
      is_active: Boolean(req.body?.is_active)
    };

    if (!payload.title) return res.status(400).json({ error: 'Giveaway title is required.' });
    if (payload.start_date && payload.end_date && new Date(payload.end_date) <= new Date(payload.start_date)) {
      return res.status(400).json({ error: 'End date must be after start date.' });
    }

    if (payload.is_active) {
      await supabase.from('giveaways').update({ is_active: false }).eq('is_active', true).neq('id', id);
    }

    const { data, error } = await supabase.from('giveaways').update(payload).eq('id', id).select().single();
    if (error) throw error;
    res.json({ giveaway: { ...data, status: publicStatus(data) } });
  } catch (err) { next(err); }
});

router.get('/fields', requireAdmin, async (req, res, next) => {
  try {
    const giveawayId = req.query.giveaway_id;
    if (!giveawayId) return res.status(400).json({ error: 'giveaway_id is required.' });
    const { data, error } = await supabase
      .from('custom_fields')
      .select('*')
      .eq('giveaway_id', giveawayId)
      .order('display_order', { ascending: true });
    if (error) throw error;
    res.json({ fields: data || [] });
  } catch (err) { next(err); }
});

router.post('/fields', requireAdmin, async (req, res, next) => {
  try {
    if (!csrfOk(req)) return res.status(403).json({ error: 'Invalid CSRF token.' });

    const fieldType = String(req.body?.field_type || 'text');
    if (!FIELD_TYPES.includes(fieldType)) return res.status(400).json({ error: 'Unsupported field type.' });

    const giveawayId = req.body?.giveaway_id;
    const label = cleanText(req.body?.label, 200);
    if (!giveawayId || !label) return res.status(400).json({ error: 'Giveaway and field label are required.' });

    const { data: maxRow } = await supabase
      .from('custom_fields')
      .select('display_order')
      .eq('giveaway_id', giveawayId)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase.from('custom_fields').insert({
      giveaway_id: giveawayId,
      label,
      placeholder: cleanText(req.body?.placeholder, 300),
      field_type: fieldType,
      required: Boolean(req.body?.required),
      enabled: req.body?.enabled !== false,
      copy_enabled: Boolean(req.body?.copy_enabled),
      display_order: Number(maxRow?.display_order || 0) + 1
    }).select().single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/fields/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!csrfOk(req)) return res.status(403).json({ error: 'Invalid CSRF token.' });

    const fieldType = String(req.body?.field_type || 'text');
    if (!FIELD_TYPES.includes(fieldType)) return res.status(400).json({ error: 'Unsupported field type.' });

    const payload = {
      label: cleanText(req.body?.label, 200),
      placeholder: cleanText(req.body?.placeholder, 300),
      field_type: fieldType,
      required: Boolean(req.body?.required),
      enabled: Boolean(req.body?.enabled),
      copy_enabled: Boolean(req.body?.copy_enabled)
    };
    if (!payload.label) return res.status(400).json({ error: 'Field label is required.' });

    const { data, error } = await supabase.from('custom_fields').update(payload).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/fields/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!csrfOk(req)) return res.status(403).json({ error: 'Invalid CSRF token.' });
    const { error } = await supabase.from('custom_fields').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.put('/fields/reorder', requireAdmin, async (req, res, next) => {
  try {
    if (!csrfOk(req)) return res.status(403).json({ error: 'Invalid CSRF token.' });
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length > 200) {
      return res.status(400).json({ error: 'Invalid reorder payload.' });
    }

    for (let i = 0; i < items.length; i++) {
      const id = String(items[i]?.id || '');
      if (!id) continue;
      const { error } = await supabase
        .from('custom_fields')
        .update({ display_order: i + 1 })
        .eq('id', id);
      if (error) throw error;
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/submissions', requireAdmin, async (req, res, next) => {
  try {
    const giveawayId = req.query.giveaway_id;
    let query = supabase
      .from('submissions')
      .select('id,giveaway_id,eligibility_status,created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (giveawayId) query = query.eq('giveaway_id', giveawayId);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ submissions: data || [] });
  } catch (err) { next(err); }
});

router.get('/submissions/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data: submission, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Submission not found.' });

    const { data: fields, error: fieldError } = await supabase
      .from('custom_fields')
      .select('id,label,field_type')
      .eq('giveaway_id', submission.giveaway_id)
      .order('display_order', { ascending: true });
    if (fieldError) throw fieldError;

    res.json({ submission, fields: fields || [] });
  } catch (err) { next(err); }
});

router.post('/winner/random', requireAdmin, async (req, res, next) => {
  try {
    if (!csrfOk(req)) return res.status(403).json({ error: 'Invalid CSRF token.' });

    const giveawayId = req.body?.giveaway_id;
    if (!giveawayId) return res.status(400).json({ error: 'giveaway_id is required.' });

    const { data: existing } = await supabase.from('winners').select('*').eq('giveaway_id', giveawayId).maybeSingle();
    if (existing) return res.status(409).json({ error: 'A winner has already been selected for this giveaway.', winner: existing });

    const { data: eligible, error } = await supabase
      .from('submissions')
      .select('id')
      .eq('giveaway_id', giveawayId)
      .eq('eligibility_status', 'eligible');

    if (error) throw error;
    if (!eligible?.length) return res.status(409).json({ error: 'There are no eligible submissions.' });

    const winner = eligible[crypto.randomInt(eligible.length)];

    const { data: created, error: winnerError } = await supabase
      .from('winners')
      .insert({
        giveaway_id: giveawayId,
        submission_id: winner.id,
        selection_method: 'random'
      })
      .select()
      .single();

    if (winnerError) {
      if (winnerError.code === '23505') return res.status(409).json({ error: 'A winner was already selected.' });
      throw winnerError;
    }

    res.json({ winner: created });
  } catch (err) { next(err); }
});

router.post('/winner/manual', requireAdmin, async (req, res, next) => {
  try {
    if (!csrfOk(req)) return res.status(403).json({ error: 'Invalid CSRF token.' });

    const giveawayId = req.body?.giveaway_id;
    const submissionId = req.body?.submission_id;
    if (!giveawayId || !submissionId) return res.status(400).json({ error: 'Giveaway and submission are required.' });

    const { data: existing } = await supabase.from('winners').select('*').eq('giveaway_id', giveawayId).maybeSingle();
    if (existing) return res.status(409).json({ error: 'A winner has already been selected for this giveaway.', winner: existing });

    const { data: submission, error } = await supabase
      .from('submissions')
      .select('id,giveaway_id,eligibility_status')
      .eq('id', submissionId)
      .single();

    if (error || !submission || submission.giveaway_id !== giveawayId) {
      return res.status(400).json({ error: 'Submission does not belong to this giveaway.' });
    }
    if (submission.eligibility_status !== 'eligible') {
      return res.status(400).json({ error: 'That submission is not eligible.' });
    }

    const { data: created, error: winnerError } = await supabase
      .from('winners')
      .insert({
        giveaway_id: giveawayId,
        submission_id: submissionId,
        selection_method: 'manual'
      })
      .select()
      .single();

    if (winnerError) {
      if (winnerError.code === '23505') return res.status(409).json({ error: 'A winner was already selected.' });
      throw winnerError;
    }

    res.json({ winner: created });
  } catch (err) { next(err); }
});

module.exports = router;
            
