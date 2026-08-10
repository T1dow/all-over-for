/**
 * src/server.js
 * Entry point: connect to the database, apply pending migrations
 * (development convenience), then start listening. Ctrl+C shuts down
 * cleanly.
 */
const env = require('./config/env');
const { connectDB, closeDB } = require('./config/database');
const { runMigrations } = require('./db/runner');
const createApp = require('./app');
const schedulerService = require('./services/schedulerService');

async function main() {
  await connectDB();

  if (env.db.autoMigrate) {
    await runMigrations();
  } else {
    console.log('[db] Skipping auto-migration (DB_AUTO_MIGRATE=false).');
  }

  const app = createApp();
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`[server] ${env.appName} running at http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Stage 12: start the scheduled jobs (monthly payroll + email dispatcher).
  // Skipped on Vercel — serverless has no long-running process; the
  // Vercel Cron Jobs (vercel.json) call /api/cron/* endpoints instead.
  if (!env.isVercel) {
    try {
      await schedulerService.startScheduler();
    } catch (err) {
      console.error('[scheduler] failed to start:', err.message);
    }
  }

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down...`);
    schedulerService.stopScheduler();
    server.close(async () => {
      await closeDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] FATAL startup error:', err);
  process.exit(1);
});
