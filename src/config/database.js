/**
 * src/config/database.js
 * ------------------------------------------------------------------
 * Creates the Sequelize ORM instance. The same application code runs on:
 *
 *   - PostgreSQL  (production / real deployment — DB_DIALECT=postgres)
 *   - SQLite      (zero-setup demo mode — DB_DIALECT=sqlite)
 *
 * Why Sequelize (an ORM)?
 *   - Parameterised queries everywhere => SQL injection is prevented by
 *     construction (requirement NFR-SEC-04).
 *   - Models + associations = readable data layer.
 *   - Transactions for atomic payroll runs (requirement NFR-REL-01).
 *   - One codebase, two databases (helps your viva demo).
 * ------------------------------------------------------------------
 */
const { Sequelize } = require('sequelize');
const env = require('./env');
const path = require('path');
const fs = require('fs');

function buildSequelize() {
  const common = {
    logging: env.isProduction ? false : (msg) => console.log(`[db] ${msg}`),
    define: {
      underscored: true, // snake_case columns in the database (e.g. employee_no)
      freezeTableName: true, // table name = model name
    },
  };

  if (env.db.dialect === 'postgres') {
    const sslConfig = env.db.ssl
      ? { ssl: { rejectUnauthorized: false } }
      : {};
    return new Sequelize(env.db.name, env.db.user, env.db.password, {
      host: env.db.host,
      port: env.db.port,
      dialect: 'postgres',
      dialectOptions: {
        ...sslConfig,
        // Fail fast when the DB is unreachable instead of letting the
        // request hang until the serverless function times out (504).
        connectionTimeoutMillis: 8000,
      },
      pool: { max: 5, min: 0, idle: 10000, acquire: 20000 },
      ...common,
    });
  }

  // SQLite fallback: ensure the data directory exists
  const file = path.resolve(env.db.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return new Sequelize({
    dialect: 'sqlite',
    storage: file,
    ...common,
  });
}

const sequelize = buildSequelize();

async function connectDB() {
  await sequelize.authenticate();
  console.log(`[db] Connected to ${env.db.dialect} database.`);
}

async function closeDB() {
  await sequelize.close();
}

module.exports = { sequelize, connectDB, closeDB };
