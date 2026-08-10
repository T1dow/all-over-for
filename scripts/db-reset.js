/**
 * scripts/db-reset.js
 * DROP every table (including schema_migrations) and re-migrate:
 *   npm run db:reset
 * DANGER: destroys all data. Development/demo use only.
 */
const { sequelize, connectDB, closeDB } = require('../src/config/database');
const { runMigrations } = require('../src/db/runner');

(async () => {
  try {
    await connectDB();
    const dialect = sequelize.getDialect();
    const tables = await sequelize.showAllTables();
    for (const table of tables) {
      // CASCADE is PostgreSQL syntax; SQLite rejects it.
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
