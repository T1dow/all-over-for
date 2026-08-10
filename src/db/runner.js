/**
 * src/db/runner.js
 * ------------------------------------------------------------------
 * A tiny, transparent migration runner.
 *
 * Why migrations instead of `sequelize.sync()`?
 *   - Schema changes are versioned files applied in order, exactly once,
 *     and recorded in a `schema_migrations` table.
 *   - The same migration runs on PostgreSQL and SQLite.
 *   - "How did the database get this way?" is always answerable —
 *     great for the project report and for your supervisor.
 *
 * Usage: node scripts/db-migrate.js   (or automatic on server start
 * when DB_AUTO_MIGRATE=true — development convenience).
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const SequelizeClass = require('sequelize'); // the class exposes .DataTypes
const { sequelize } = require('../config/database');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function appliedMigrations() {
  const [rows] = await sequelize.query('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

async function runMigrations() {
  await sequelize.authenticate();
  await ensureMigrationsTable();
  const done = await appliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort(); // lexical order = chronological order (001-, 002-, ...)

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;

    const migration = require(path.join(MIGRATIONS_DIR, file));
    console.log(`[migrate] Applying ${file} ...`);

    // Each migration runs in its own transaction: all-or-nothing.
    await sequelize.transaction(async (tx) => {
      await migration.up(sequelize.getQueryInterface(), SequelizeClass, tx);
      await sequelize.query('INSERT INTO schema_migrations (name) VALUES (?)', {
        replacements: [file],
        transaction: tx,
      });
    });
    applied += 1;
  }

  console.log(`[migrate] Done. ${applied} migration(s) applied, ${files.length - applied} already up to date.`);
  return applied;
}

module.exports = { runMigrations };
