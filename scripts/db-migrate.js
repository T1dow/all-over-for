/**
 * scripts/db-migrate.js
 * Apply pending migrations manually:  npm run db:migrate
 */
const { connectDB, closeDB } = require('../src/config/database');
const { runMigrations } = require('../src/db/runner');

(async () => {
  try {
    await connectDB();
    await runMigrations();
    await closeDB();
  } catch (err) {
    console.error('[db:migrate] FAILED:', err);
    process.exit(1);
  }
})();
