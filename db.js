/**
 * Simple file-backed data layer.
 *
 * Everything the admin manages (welcome message, giveaways, custom fields,
 * submissions) is stored in data/db.json. Writes are serialized through a
 * tiny in-process queue so two requests can never corrupt the file by
 * writing at the same time.
 *
 * Note: on most hosting platforms (including Render's free tier) the
 * filesystem is ephemeral, meaning data can be reset on redeploy or restart
 * unless you attach a persistent disk. See README.md for details.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function defaultData() {
  return {
    settings: {
      siteName: 'Bonus Coin Giveaway',
      welcomeTitle: 'Welcome!',
      welcomeMessage:
        "Thanks for stopping by. Check the current reward below and claim yours in a few taps.",
    },
    giveaways: [],
    submissions: [],
  };
}

function ensureDbFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData(), null, 2));
  }
}

function readRaw() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Corrupt file safety net: back it up and start fresh rather than crash.
    fs.writeFileSync(DB_PATH + `.broken.${Date.now()}`, raw);
    const fresh = defaultData();
    fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function writeRaw(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// --- tiny write queue so concurrent requests don't clobber each other ---
let queue = Promise.resolve();
function transaction(mutator) {
  queue = queue.then(() => {
    const data = readRaw();
    const result = mutator(data);
    writeRaw(data);
    return result;
  });
  return queue;
}

function id() {
  return crypto.randomUUID();
}

// ---------- Settings ----------
function getSettings() {
  return readRaw().settings;
}

function updateSettings(patch) {
  return transaction((data) => {
    data.settings = { ...data.settings, ...patch };
    return data.settings;
  });
}

// ---------- Giveaways ----------
function getGiveaways() {
  return readRaw().giveaways.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function getGiveaway(giveawayId) {
  return readRaw().giveaways.find((g) => g.id === giveawayId) || null;
}

function getActiveGiveaway() {
  return readRaw().giveaways.find((g) => g.active) || null;
}

function createGiveaway({ title, description }) {
  return transaction((data) => {
    const giveaway = {
      id: id(),
      title: title || 'New Giveaway',
      description: description || '',
      active: false,
      createdAt: Date.now(),
      fields: [],
    };
    data.giveaways.push(giveaway);
    return giveaway;
  });
}

function updateGiveaway(giveawayId, patch) {
  return transaction((data) => {
    const giveaway = data.giveaways.find((g) => g.id === giveawayId);
    if (!giveaway) return null;
    if (typeof patch.title === 'string') giveaway.title = patch.title;
    if (typeof patch.description === 'string') giveaway.description = patch.description;
    return giveaway;
  });
}

function setActiveGiveaway(giveawayId) {
  return transaction((data) => {
    data.giveaways.forEach((g) => {
      g.active = g.id === giveawayId;
    });
    return data.giveaways.find((g) => g.id === giveawayId) || null;
  });
}

function deactivateAllGiveaways() {
  return transaction((data) => {
    data.giveaways.forEach((g) => {
      g.active = false;
    });
  });
}

function deleteGiveaway(giveawayId) {
  return transaction((data) => {
    data.giveaways = data.giveaways.filter((g) => g.id !== giveawayId);
    data.submissions = data.submissions.filter((s) => s.giveawayId !== giveawayId);
  });
}

// ---------- Fields (belong to a giveaway) ----------
function addField(giveawayId, { label, placeholder, required, copyable }) {
  return transaction((data) => {
    const giveaway = data.giveaways.find((g) => g.id === giveawayId);
    if (!giveaway) return null;
    const maxOrder = giveaway.fields.reduce((m, f) => Math.max(m, f.order), -1);
    const field = {
      id: id(),
      label: label || 'Untitled field',
      placeholder: placeholder || '',
      required: !!required,
      enabled: true,
      copyable: !!copyable,
      order: maxOrder + 1,
    };
    giveaway.fields.push(field);
    return field;
  });
}

function updateField(giveawayId, fieldId, patch) {
  return transaction((data) => {
    const giveaway = data.giveaways.find((g) => g.id === giveawayId);
    if (!giveaway) return null;
    const field = giveaway.fields.find((f) => f.id === fieldId);
    if (!field) return null;
    if (typeof patch.label === 'string') field.label = patch.label;
    if (typeof patch.placeholder === 'string') field.placeholder = patch.placeholder;
    if (typeof patch.required === 'boolean') field.required = patch.required;
    if (typeof patch.enabled === 'boolean') field.enabled = patch.enabled;
    if (typeof patch.copyable === 'boolean') field.copyable = patch.copyable;
    return field;
  });
}

function deleteField(giveawayId, fieldId) {
  return transaction((data) => {
    const giveaway = data.giveaways.find((g) => g.id === giveawayId);
    if (!giveaway) return null;
    giveaway.fields = giveaway.fields.filter((f) => f.id !== fieldId);
  });
}

function reorderFields(giveawayId, orderedFieldIds) {
  return transaction((data) => {
    const giveaway = data.giveaways.find((g) => g.id === giveawayId);
    if (!giveaway) return null;
    orderedFieldIds.forEach((fieldId, index) => {
      const field = giveaway.fields.find((f) => f.id === fieldId);
      if (field) field.order = index;
    });
    giveaway.fields.sort((a, b) => a.order - b.order);
    return giveaway.fields;
  });
}

// ---------- Submissions ----------
function addSubmission(giveawayId, values) {
  return transaction((data) => {
    const submission = {
      id: id(),
      giveawayId,
      values,
      createdAt: Date.now(),
      status: 'pending',
    };
    data.submissions.push(submission);
    return submission;
  });
}

function getSubmissionsForGiveaway(giveawayId) {
  return readRaw()
    .submissions.filter((s) => s.giveawayId === giveawayId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function getSubmission(submissionId) {
  return readRaw().submissions.find((s) => s.id === submissionId) || null;
}

function setSubmissionStatus(submissionId, status) {
  return transaction((data) => {
    const submission = data.submissions.find((s) => s.id === submissionId);
    if (!submission) return null;
    submission.status = status;
    return submission;
  });
}

function clearWinner(giveawayId) {
  return transaction((data) => {
    data.submissions
      .filter((s) => s.giveawayId === giveawayId && s.status === 'winner')
      .forEach((s) => {
        s.status = 'pending';
      });
  });
}

function pickRandomWinner(giveawayId) {
  return transaction((data) => {
    const eligible = data.submissions.filter(
      (s) => s.giveawayId === giveawayId && s.status !== 'winner'
    );
    if (eligible.length === 0) return null;
    const winner = eligible[Math.floor(Math.random() * eligible.length)];
    data.submissions
      .filter((s) => s.giveawayId === giveawayId && s.status === 'winner')
      .forEach((s) => {
        s.status = 'pending';
      });
    winner.status = 'winner';
    return winner;
  });
}

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
  setSubmissionStatus,
  clearWinner,
  pickRandomWinner,
};
