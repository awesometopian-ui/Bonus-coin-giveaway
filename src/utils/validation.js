const sanitizeHtml = require('sanitize-html');
const { z } = require('zod');

const FIELD_TYPES = ['text', 'email', 'number', 'url', 'textarea'];

function cleanText(value, max = 5000) {
  return sanitizeHtml(String(value ?? ''), {
    allowedTags: [],
    allowedAttributes: {}
  }).trim().slice(0, max);
}

function validateFieldType(type, value) {
  const text = String(value ?? '');
  if (type === 'email') {
    return z.email().safeParse(text).success;
  }
  if (type === 'number') {
    return z.coerce.number().finite().safeParse(text).success;
  }
  if (type === 'url') {
    return z.url().safeParse(text).success;
  }
  return text.length > 0;
}

function normalizeSubmissionValue(type, value) {
  if (type === 'number') return String(value ?? '').trim();
  return cleanText(value, type === 'textarea' ? 5000 : 1000);
}

module.exports = {
  FIELD_TYPES,
  cleanText,
  validateFieldType,
  normalizeSubmissionValue
};
