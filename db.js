/**
 * Simple file-backed data layer.
 *
 * Everything the admin manages is stored in data/db.json.
 * Writes are serialized through a tiny in-process queue.
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
        'Thanks for stopping by. Check the current reward below and submit your entry.',
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
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify(defaultData(), null, 2)
    );
  }
}

function readRaw() {
  ensureDbFile();

  const raw = fs.readFileSync(DB_PATH, 'utf8');

  try {
    return JSON.parse(raw);
  } catch (err) {
    fs.writeFileSync(
      DB_PATH + `.broken.${Date.now()}`,
      raw
    );

    const fresh = defaultData();

    fs.writeFileSync(
      DB_PATH,
      JSON.stringify(fresh, null, 2)
    );

    return fresh;
  }
}

function writeRaw(data) {
  fs.writeFileSync(
    DB_PATH,
    JSON.stringify(data, null, 2)
  );
}

// ---------- Write queue ----------

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
    data.settings = {
      ...data.settings,
      ...patch,
    };

    return data.settings;
  });
}

// ---------- Giveaways ----------

function getGiveaways() {
  return readRaw()
    .giveaways
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
}

function getGiveaway(giveawayId) {
  return (
    readRaw()
      .giveaways
      .find((g) => g.id === giveawayId) || null
  );
}

function getActiveGiveaway() {
  return (
    readRaw()
      .giveaways
      .find((g) => g.active) || null
  );
}

function createGiveaway({
  title,
  description,
  winnerCount,
  pendingMessage,
  successMessage,
  winnerMessage,
  declinedMessage,
  messages,
}) {
  return transaction((data) => {
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

    const finalPendingMessage =
      pendingMessage ||
      messageData.pending ||
      'Your submission has been received and is being reviewed.';

    const finalDeclinedMessage =
      declinedMessage ||
      messageData.declined ||
      'Your submission was not selected. Thank you for participating.';

    const giveaway = {
      id: id(),

      title: title || 'New Giveaway',

      description: description || '',

      active: false,

      createdAt: Date.now(),

      // Number of successful submissions allowed.
      winnerCount: finalWinnerCount,

      messages: {
        pending: finalPendingMessage,
        winner: finalSuccessMessage,
        declined: finalDeclinedMessage,
      },

      fields: [],
    };

    data.giveaways.push(giveaway);

    return giveaway;
  });
}

function updateGiveaway(giveawayId, patch) {
  return transaction((data) => {
    const giveaway = data.giveaways.find(
      (g) => g.id === giveawayId
    );

    if (!giveaway) return null;

    if (typeof patch.title === 'string') {
      giveaway.title = patch.title;
    }

    if (typeof patch.description === 'string') {
      giveaway.description = patch.description;
    }

    // Winner count
    if (
      patch.winnerCount !== undefined &&
      Number.isFinite(Number(patch.winnerCount))
    ) {
      giveaway.winnerCount = Math.max(
        1,
        Math.floor(Number(patch.winnerCount))
      );
    }

    // Make sure messages exist.
    if (!giveaway.messages) {
      giveaway.messages = {
        pending:
          'Your submission has been received and is being reviewed.',

        winner:
          'Congratulations! Your submission was successful.',

        declined:
          'Your submission was not selected. Thank you for participating.',
      };
    }

    // Individual message properties
    if (typeof patch.pendingMessage === 'string') {
      giveaway.messages.pending = patch.pendingMessage;
    }

    if (typeof patch.successMessage === 'string') {
      giveaway.messages.winner = patch.successMessage;
    }

    if (typeof patch.winnerMessage === 'string') {
      giveaway.messages.winner = patch.winnerMessage;
    }

    if (typeof patch.declinedMessage === 'string') {
      giveaway.messages.declined = patch.declinedMessage;
    }

    // Messages object
    if (
      patch.messages &&
      typeof patch.messages === 'object'
    ) {
      if (typeof patch.messages.pending === 'string') {
        giveaway.messages.pending =
          patch.messages.pending;
      }

      if (typeof patch.messages.winner === 'string') {
        giveaway.messages.winner =
          patch.messages.winner;
      }

      if (typeof patch.messages.declined === 'string') {
        giveaway.messages.declined =
          patch.messages.declined;
      }
    }

    return giveaway;
  });
}

function setActiveGiveaway(giveawayId) {
  return transaction((data) => {
    data.giveaways.forEach((g) => {
      g.active = g.id === giveawayId;
    });

    return (
      data.giveaways.find(
        (g) => g.id === giveawayId
      ) || null
    );
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
    data.giveaways = data.giveaways.filter(
      (g) => g.id !== giveawayId
    );

    data.submissions = data.submissions.filter(
      (s) => s.giveawayId !== giveawayId
    );
  });
}

// ---------- Fields ----------

function addField(
  giveawayId,
  {
    label,
    placeholder,
    required,
    copyable,
  }
) {
  return transaction((data) => {
    const giveaway = data.giveaways.find(
      (g) => g.id === giveawayId
    );

    if (!giveaway) return null;

    const maxOrder = giveaway.fields.reduce(
      (m, f) => Math.max(m, f.order),
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

    giveaway.fields.push(field);

    return field;
  });
}

function updateField(
  giveawayId,
  fieldId,
  patch
) {
  return transaction((data) => {
    const giveaway = data.giveaways.find(
      (g) => g.id === giveawayId
    );

    if (!giveaway) return null;

    const field = giveaway.fields.find(
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

    return field;
  });
}

function deleteField(giveawayId, fieldId) {
  return transaction((data) => {
    const giveaway = data.giveaways.find(
      (g) => g.id === giveawayId
    );

    if (!giveaway) return null;

    giveaway.fields = giveaway.fields.filter(
      (f) => f.id !== fieldId
    );

    return giveaway.fields;
  });
}

function reorderFields(
  giveawayId,
  orderedFieldIds
) {
  return transaction((data) => {
    const giveaway = data.giveaways.find(
      (g) => g.id === giveawayId
    );

    if (!giveaway) return null;

    orderedFieldIds.forEach(
      (fieldId, index) => {
        const field = giveaway.fields.find(
          (f) => f.id === fieldId
        );

        if (field) {
          field.order = index;
        }
      }
    );

    giveaway.fields.sort(
      (a, b) => a.order - b.order
    );

    return giveaway.fields;
  });
}

// ---------- Submissions ----------

function addSubmission(
  giveawayId,
  values
) {
  return transaction((data) => {
    const giveaway = data.giveaways.find(
      (g) => g.id === giveawayId
    );

    if (!giveaway) return null;

    const configuredWinnerCount =
      Number(giveaway.winnerCount);

    const winnerLimit =
      Number.isFinite(configuredWinnerCount) &&
      configuredWinnerCount >= 1
        ? Math.floor(configuredWinnerCount)
        : 1;

    // Count successful submissions already accepted.
    const successfulCount =
      data.submissions.filter(
        (s) =>
          s.giveawayId === giveawayId &&
          s.status === 'winner'
      ).length;

    // Automatically decide the result.
    const status =
      successfulCount < winnerLimit
        ? 'winner'
        : 'declined';

    const submission = {
      id: id(),

      giveawayId,

      values,

      createdAt: Date.now(),

      status,
    };

    data.submissions.push(submission);

    return submission;
  });
}

function getSubmissionsForGiveaway(
  giveawayId
) {
  return readRaw()
    .submissions
    .filter(
      (s) => s.giveawayId === giveawayId
    )
    .sort(
      (a, b) => b.createdAt - a.createdAt
    );
}

function getSubmission(submissionId) {
  return (
    readRaw()
      .submissions
      .find(
        (s) => s.id === submissionId
      ) || null
  );
}

// Kept for compatibility with older code.
// New submissions are automatically assigned a status.
function setSubmissionStatus(
  submissionId,
  status
) {
  return transaction((data) => {
    const submission =
      data.submissions.find(
        (s) => s.id === submissionId
      );

    if (!submission) return null;

    const allowedStatuses = [
      'pending',
      'winner',
      'declined',
    ];

    if (!allowedStatuses.includes(status)) {
      return submission;
    }

    if (status === 'winner') {
      const giveaway =
        data.giveaways.find(
          (g) => g.id === submission.giveawayId
        );

      if (giveaway) {
        const winnerLimit =
          Number(giveaway.winnerCount) || 1;

        const currentWinners =
          data.submissions.filter(
            (s) =>
              s.giveawayId === submission.giveawayId &&
              s.status === 'winner' &&
              s.id !== submissionId
          ).length;

        if (currentWinners >= winnerLimit) {
          return null;
        }
      }
    }

    submission.status = status;

    return submission;
  });
}

// ---------- Winner helpers ----------

function getWinnerCount(giveawayId) {
  const giveaway = getGiveaway(giveawayId);

  if (!giveaway) return 0;

  return Number(giveaway.winnerCount) || 0;
}

function getCurrentWinnerCount(giveawayId) {
  return readRaw()
    .submissions
    .filter(
      (s) =>
        s.giveawayId === giveawayId &&
        s.status === 'winner'
    )
    .length;
}

function getRemainingWinnerSlots(
  giveawayId
) {
  const total = getWinnerCount(giveawayId);

  const current =
    getCurrentWinnerCount(giveawayId);

  return Math.max(
    0,
    total - current
  );
}

// ---------- Result message ----------

function getSubmissionMessage(
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
    giveaway = getGiveaway(giveawayOrId);
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

  if (status === 'declined') {
    return (
      messages.declined ||
      'Your submission was not selected. Thank you for participating.'
    );
  }

  return (
    messages.pending ||
    'Your submission has been received and is being reviewed.'
  );
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

  getWinnerCount,
  getCurrentWinnerCount,
  getRemainingWinnerSlots,

  getSubmissionMessage,
};
