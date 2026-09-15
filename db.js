/**
 * Supabase-backed data layer.
 *
 * All giveaway data is stored in Supabase.
 * No local db.json is used.
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL is missing.');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is missing.'
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

function id() {
  return crypto.randomUUID();
}

// ---------- Settings ----------

async function getSettings() {
  const { data, error } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const settings = {
      siteName: 'Bonus Coin Giveaway',
      welcomeTitle: 'Welcome!',
      welcomeMessage:
        'Thanks for stopping by. Check the current reward below and submit your entry.',
    };

    const { error: insertError } = await supabase
      .from('settings')
      .insert({
        id: 1,
        data: settings,
      });

    if (insertError) throw insertError;

    return settings;
  }

  return data.data;
}

async function updateSettings(patch) {
  const current = await getSettings();

  const settings = {
    ...current,
    ...patch,
  };

  const { error } = await supabase
    .from('settings')
    .upsert({
      id: 1,
      data: settings,
    });

  if (error) throw error;

  return settings;
}

// ---------- Giveaways ----------

function normalizeGiveaway(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    active: !!row.active,
    createdAt: Number(row.created_at),
    winnerCount: Number(row.winner_count) || 1,
    messages: row.messages || {},
    fields: Array.isArray(row.fields)
      ? row.fields
      : [],
  };
}

async function getGiveaways() {
  const { data, error } = await supabase
    .from('giveaways')
    .select('*')
    .order('created_at', {
      ascending: false,
    });

  if (error) throw error;

  return (data || []).map(normalizeGiveaway);
}

async function getGiveaway(giveawayId) {
  const { data, error } = await supabase
    .from('giveaways')
    .select('*')
    .eq('id', giveawayId)
    .maybeSingle();

  if (error) throw error;

  return normalizeGiveaway(data);
}

async function getActiveGiveaway() {
  const { data, error } = await supabase
    .from('giveaways')
    .select('*')
    .eq('active', true)
    .maybeSingle();

  if (error) throw error;

  return normalizeGiveaway(data);
}

async function createGiveaway({
  title,
  description,
  winnerCount,
  successMessage,
  winnerMessage,
  declinedMessage,
  messages,
}) {
  const parsedWinnerCount = Number(winnerCount);

  const finalWinnerCount =
    Number.isFinite(parsedWinnerCount) &&
    parsedWinnerCount >= 1
      ? Math.floor(parsedWinnerCount)
      : 1;

  const messageData =
    messages && typeof messages === 'object'
      ? messages
      : {};

  const finalSuccessMessage =
    successMessage ||
    winnerMessage ||
    messageData.winner ||
    'Congratulations! Your submission was successful.';

  const finalDeclinedMessage =
    declinedMessage ||
    messageData.declined ||
    'Your submission was not selected. Thank you for participating.';

  const giveaway = {
    id: id(),
    title: title || 'New Giveaway',
    description: description || '',
    active: false,
    created_at: Date.now(),
    winner_count: finalWinnerCount,
    messages: {
      winner: finalSuccessMessage,
      declined: finalDeclinedMessage,
    },
    fields: [],
  };

  const { data, error } = await supabase
    .from('giveaways')
    .insert(giveaway)
    .select()
    .single();

  if (error) throw error;

  return normalizeGiveaway(data);
}

async function updateGiveaway(
  giveawayId,
  patch
) {
  const giveaway = await getGiveaway(giveawayId);

  if (!giveaway) return null;

  const update = {};

  if (typeof patch.title === 'string') {
    update.title = patch.title;
  }

  if (typeof patch.description === 'string') {
    update.description = patch.description;
  }

  if (
    patch.winnerCount !== undefined &&
    Number.isFinite(Number(patch.winnerCount))
  ) {
    update.winner_count = Math.max(
      1,
      Math.floor(Number(patch.winnerCount))
    );
  }

  const messages = {
    ...(giveaway.messages || {}),
  };

  if (typeof patch.successMessage === 'string') {
    messages.winner = patch.successMessage;
  }

  if (typeof patch.winnerMessage === 'string') {
    messages.winner = patch.winnerMessage;
  }

  if (typeof patch.declinedMessage === 'string') {
    messages.declined = patch.declinedMessage;
  }

  if (
    patch.messages &&
    typeof patch.messages === 'object'
  ) {
    if (typeof patch.messages.winner === 'string') {
      messages.winner = patch.messages.winner;
    }

    if (
      typeof patch.messages.declined === 'string'
    ) {
      messages.declined =
        patch.messages.declined;
    }
  }

  update.messages = messages;

  const { data, error } = await supabase
    .from('giveaways')
    .update(update)
    .eq('id', giveawayId)
    .select()
    .single();

  if (error) throw error;

  return normalizeGiveaway(data);
}

async function setActiveGiveaway(giveawayId) {
  const { error: deactivateError } =
    await supabase
      .from('giveaways')
      .update({
        active: false,
      })
      .neq('id', giveawayId);

  if (deactivateError) {
    throw deactivateError;
  }

  const { data, error } = await supabase
    .from('giveaways')
    .update({
      active: true,
    })
    .eq('id', giveawayId)
    .select()
    .single();

  if (error) throw error;

  return normalizeGiveaway(data);
}

async function deactivateAllGiveaways() {
  const { error } = await supabase
    .from('giveaways')
    .update({
      active: false,
    })
    .eq('active', true);

  if (error) throw error;
}

async function deleteGiveaway(giveawayId) {
  const { error } = await supabase
    .from('giveaways')
    .delete()
    .eq('id', giveawayId);

  if (error) throw error;
}

// ---------- Fields ----------

async function addField(
  giveawayId,
  {
    label,
    placeholder,
    required,
    copyable,
  }
) {
  const giveaway = await getGiveaway(giveawayId);

  if (!giveaway) return null;

  const fields = Array.isArray(giveaway.fields)
    ? giveaway.fields.slice()
    : [];

  const maxOrder = fields.reduce(
    (m, f) =>
      Math.max(
        m,
        Number.isFinite(Number(f.order))
          ? Number(f.order)
          : -1
      ),
    -1
  );

  const field = {
    id: id(),
    label: label || 'Untitled field',
    placeholder: placeholder || '',
    required: !!required,
    enabled: true,
    copyable: !!copyable,
    order: maxOrder + 1,
  };

  fields.push(field);

  const { data, error } = await supabase
    .from('giveaways')
    .update({
      fields,
    })
    .eq('id', giveawayId)
    .select()
    .single();

  if (error) throw error;

  const updated = normalizeGiveaway(data);

  return updated.fields.find(
    (f) => f.id === field.id
  );
}

async function updateField(
  giveawayId,
  fieldId,
  patch
) {
  const giveaway = await getGiveaway(giveawayId);

  if (!giveaway) return null;

  const fields = Array.isArray(giveaway.fields)
    ? giveaway.fields.slice()
    : [];

  const field = fields.find(
    (f) => f.id === fieldId
  );

  if (!field) return null;

  if (typeof patch.label === 'string') {
    field.label = patch.label;
  }

  if (typeof patch.placeholder === 'string') {
    field.placeholder = patch.placeholder;
  }

  if (typeof patch.required === 'boolean') {
    field.required = patch.required;
  }

  if (typeof patch.enabled === 'boolean') {
    field.enabled = patch.enabled;
  }

  if (typeof patch.copyable === 'boolean') {
    field.copyable = patch.copyable;
  }

  const { error } = await supabase
    .from('giveaways')
    .update({
      fields,
    })
    .eq('id', giveawayId);

  if (error) throw error;

  return field;
}

async function deleteField(
  giveawayId,
  fieldId
) {
  const giveaway = await getGiveaway(giveawayId);

  if (!giveaway) return null;

  const fields = (giveaway.fields || []).filter(
    (f) => f.id !== fieldId
  );

  const { error } = await supabase
    .from('giveaways')
    .update({
      fields,
    })
    .eq('id', giveawayId);

  if (error) throw error;

  return fields;
}

async function reorderFields(
  giveawayId,
  orderedFieldIds
) {
  const giveaway = await getGiveaway(giveawayId);

  if (!giveaway) return null;

  const fields = giveaway.fields || [];

  orderedFieldIds.forEach(
    (fieldId, index) => {
      const field = fields.find(
        (f) => f.id === fieldId
      );

      if (field) {
        field.order = index;
      }
    }
  );

  fields.sort(
    (a, b) =>
      Number(a.order) - Number(b.order)
  );

  const { error } = await supabase
    .from('giveaways')
    .update({
      fields,
    })
    .eq('id', giveawayId);

  if (error) throw error;

  return fields;
}

// ---------- Submissions ----------

async function addSubmission(
  giveawayId,
  values
) {
  const giveaway = await getGiveaway(giveawayId);

  if (!giveaway) return null;

  const configuredWinnerCount =
    Number(giveaway.winnerCount);

  const winnerLimit =
    Number.isFinite(configuredWinnerCount) &&
    configuredWinnerCount >= 1
      ? Math.floor(configuredWinnerCount)
      : 1;

  const currentWinnerCount =
    await getCurrentWinnerCount(giveawayId);

  const status =
    currentWinnerCount < winnerLimit
      ? 'winner'
      : 'declined';

  const submission = {
    id: id(),
    giveaway_id: giveawayId,
    values: values || {},
    created_at: Date.now(),
    status,
  };

  const { data, error } = await supabase
    .from('submissions')
    .insert(submission)
    .select()
    .single();

  if (error) throw error;

  return normalizeSubmission(data);
}

function normalizeSubmission(row) {
  if (!row) return null;

  return {
    id: row.id,
    giveawayId: row.giveaway_id,
    values: row.values || {},
    createdAt: Number(row.created_at),
    status: row.status,
  };
}

async function getSubmissionsForGiveaway(
  giveawayId
) {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('giveaway_id', giveawayId)
    .order('created_at', {
      ascending: false,
    });

  if (error) throw error;

  return (data || []).map(normalizeSubmission);
}

async function getSubmission(submissionId) {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .maybeSingle();

  if (error) throw error;

  return normalizeSubmission(data);
}

// ---------- Winner helpers ----------

async function getWinnerCount(giveawayId) {
  const giveaway = await getGiveaway(giveawayId);

  if (!giveaway) return 0;

  return Number(giveaway.winnerCount) || 0;
}

async function getCurrentWinnerCount(
  giveawayId
) {
  const { count, error } = await supabase
    .from('submissions')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('giveaway_id', giveawayId)
    .eq('status', 'winner');

  if (error) throw error;

  return count || 0;
}

async function getRemainingWinnerSlots(
  giveawayId
) {
  const total =
    await getWinnerCount(giveawayId);

  const current =
    await getCurrentWinnerCount(giveawayId);

  return Math.max(
    0,
    total - current
  );
}

// ---------- Result message ----------

async function getSubmissionMessage(
  giveawayOrId,
  status
) {
  let giveaway = null;

  if (
    typeof giveawayOrId === 'object' &&
    giveawayOrId !== null
  ) {
    giveaway = giveawayOrId;
  } else {
    giveaway =
      await getGiveaway(giveawayOrId);
  }

  if (!giveaway) return '';

  const messages =
    giveaway.messages || {};

  if (status === 'winner') {
    return (
      messages.winner ||
      'Congratulations! Your submission was successful.'
    );
  }

  return (
    messages.declined ||
    'Your submission was not selected. Thank you for participating.'
  );
}

// ---------- Exports ----------

module.exports = {
  getSettings,
  updateSettings,

  getGiveaways,
  getGiveaway,
  getActiveGiveaway,

  createGiveaway,
  updateGiveaway,
  setActiveGiveaway,
  deactivateAllGiveaways,
  deleteGiveaway,

  addField,
  updateField,
  deleteField,
  reorderFields,

  addSubmission,
  getSubmissionsForGiveaway,
  getSubmission,

  getWinnerCount,
  getCurrentWinnerCount,
  getRemainingWinnerSlots,

  getSubmissionMessage,
};
