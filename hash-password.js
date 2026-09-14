#!/usr/bin/env node
/**
 * Generates a bcrypt hash for an admin password.
 *
 * Usage:
 *   npm run hash-password -- "my-strong-password"
 *
 * Copy the printed hash into the ADMIN_PASSWORD_HASH environment variable.
 * Never store the plain-text password anywhere.
 */
const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run hash-password -- "your-password-here"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\nAdd this to your environment variables as ADMIN_PASSWORD_HASH:\n');
console.log(hash);
console.log('');
