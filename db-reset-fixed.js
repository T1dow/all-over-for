/**
 * db-reset.js — FIXED version (drop-in replacement)
 * Place in: C:\Users\NoMal\Desktop\payroll-project\scripts\db-reset.js
 * (back up the old file first)
 *
 * Fixes for SQLite:
 *  1. `showAllTables` was removed in newer Sequelize — use
 *     `showAllTables()` replaced by `sequelize.getQueryInterface().showAllTables()`
 *  2. `DROP TABLE ... CASCADE` is PostgreSQL-only syntax; SQLite rejects it.
 */
const { sequelize, connectDB, closeDB } = require('../src/config/database');
const { runMigrations } = require('../src/db/runner');

(async () => {
  try {
    await connectDB();
    const dialect = sequelize.getDialect();
    // FIX 1: modern way to list tables
    const tables = await sequelize.getQueryInterface().showAllTables();
    for (const table of tables) {
      // FIX 2: no CASCADE on SQLite
      const drop = dialect === 'postgres'
        ? `DROP TABLE IF EXISTS "${table}" CASCADE`
        : `DROP TABLE IF EXISTS "${table}"`;
      await sequelize.query(drop);
      console.log(`[db:reset] Dropped ${table}`);
    }
    await runMigrations();
    await closeDB();
    console.log('[db:reset] Done. Run `npm run db:seed` to load demo data.');
  } catch (err) {
    console.error('[db:reset] FAILED:', err);
    process.exit(1);
  }
})();
