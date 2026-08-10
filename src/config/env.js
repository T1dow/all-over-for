/**
 * src/config/env.js
 * ------------------------------------------------------------------
 * Loads and validates environment variables (secrets live in `.env`,
 * which is NEVER committed to the repository).
 *
 * Why this file exists:
 *  - One place that reads process.env, so the rest of the app never
 *    touches raw environment variables.
 *  - Fail-fast: if a critical variable is missing, the app refuses to
 *    start with a clear message instead of crashing later mid-request.
 * ------------------------------------------------------------------
 */
require('dotenv').config();

const REQUIRED = ['SESSION_SECRET'];

function fail(message) {
  console.error(`[env] FATAL: ${message}`);
  process.exit(1);
}

for (const key of REQUIRED) {
  if (!process.env[key]) {
    fail(`Missing required environment variable: ${key}. Copy .env.example to .env and fill it in.`);
  }
}

const DB_DIALECT = (process.env.DB_DIALECT || 'postgres').toLowerCase();

if (!['postgres', 'sqlite'].includes(DB_DIALECT)) {
  fail(`DB_DIALECT must be "postgres" or "sqlite", got "${DB_DIALECT}".`);
}

if (DB_DIALECT === 'postgres' && !process.env.DB_PASSWORD) {
  fail('DB_DIALECT=postgres requires DB_PASSWORD to be set.');
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  // Vercel serverless: no long-running process, ephemeral filesystem,
  // sessions must be stored in the database.
  isVercel: process.env.VERCEL === '1',
  port: parseInt(process.env.PORT || '3000', 10),
  appName: process.env.APP_NAME || 'KBK Payroll System',
  sessionSecret: process.env.SESSION_SECRET,
  sessionMaxAgeMs: 30 * 60 * 1000, // 30 minutes of inactivity
  db: {
    dialect: DB_DIALECT,
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'payroll_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    file: process.env.DB_FILE || './data/payroll.sqlite',
    autoMigrate: process.env.DB_AUTO_MIGRATE !== 'false',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.EMAIL_FROM_NAME || 'KBK Payroll',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || '',
  },
};
