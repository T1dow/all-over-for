/**
 * src/app.js
 * Builds and configures the Express application (kept separate from
 * server.js so tests can import the app without opening a port).
 *
 * Middleware order matters:
 *   1. helmet            -> security headers (CSP, HSTS, X-Frame-Options...)
 *   2. morgan            -> request logging
 *   3. express.json/urlencoded -> body parsing
 *   4. session           -> authenticated identity
 *   5. flash             -> one-round messages
 *   6. globalLimiter     -> rate limiting
 *   7. csrfProtection    -> CSRF tokens (after session; needs req.session)
 *   8. static + views    -> assets & templates
 *   9. routes
 *  10. 404 + error handler
 */
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const env = require('./config/env');
const csrfProtection = require('./middleware/csrf');
const flash = require('./middleware/flash');
const { globalLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { loadAll } = require('./utils/settings');
const { can, ROLE_LABELS, NAV_ITEMS } = require('./config/permissions');
const routes = require('./routes');

function createApp() {
  const app = express();

  // 1. Security headers. CSP allows same-origin scripts and inline styles
  //    (EJS templates rely on inline styles for layout classes).
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
      },
    },
  }));

  // 2. Logging
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  // 3. Body parsing (limit payloads — payslips data is small)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 4. Sessions. On Vercel (serverless) the in-memory store cannot work
  //    — every request may hit a different instance — so sessions are
  //    stored in PostgreSQL via connect-pg-simple. Locally (non-Vercel)
  //    the default MemoryStore is used for development.
  app.set('trust proxy', 1);
  const sessionOptions = {
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,          // JS cannot read the cookie (XSS defence)
      secure: env.isProduction, // HTTPS-only in production
      sameSite: 'lax',          // CSRF defence layer
      maxAge: env.sessionMaxAgeMs,
    },
  };
  if (env.isVercel && env.db.dialect === 'postgres') {
    const pg = require('pg');
    const connectPgSimple = require('connect-pg-simple')(session);
    const pool = new pg.Pool({
      host: env.db.host,
      port: env.db.port,
      database: env.db.name,
      user: env.db.user,
      password: env.db.password,
      ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
      max: 5,
      connectionTimeoutMillis: 10000,
    });
    sessionOptions.store = new connectPgSimple({
      pool,
      tableName: 'session',
      createTableIfMissing: true, // creates the session table automatically
    });
  }
  app.use(session(sessionOptions));

  // 5. Flash + 6. rate limiting
  app.use(flash);
  app.use(globalLimiter);

  // Base view locals — must run before any middleware that renders a page
  // (e.g. CSRF's 403 page), so every template has appName/currentUser.
  app.use(async (req, res, next) => {
    try {
      await loadAll();
    } catch (e) {
      /* settings load failure is non-fatal during early boot */
    }
    res.locals.appName = env.appName;
    res.locals.currentUser = req.session.user || null;
    res.locals.currentPath = req.path;
    // RBAC helpers available to every view:
    res.locals.can = (permission) => can(req.session.user ? req.session.user.role : null, permission);
    res.locals.roleLabel = req.session.user ? (ROLE_LABELS[req.session.user.role] || req.session.user.role) : null;
    res.locals.navItems = NAV_ITEMS;
    next();
  });

  // 7. CSRF (must run after session)
  app.use(csrfProtection);

  // 8. Static assets & template engine
  app.use(express.static(path.join(__dirname, 'public')));
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // 9. Routes
  app.use('/', routes);

  // 10. 404 + error handler (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
