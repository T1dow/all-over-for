/**
 * src/middleware/csrf.js
 * CSRF protection (NFR-SEC-05): every state-changing request (POST,
 * PUT, PATCH, DELETE) must carry a valid token. The token is generated
 * per session and exposed to every view as `csrfToken` so forms can
 * include it as a hidden field. Implementation uses the `csrf` package
 * (the same engine behind the classic csurf middleware).
 */
const Tokens = require('csrf');

const tokens = new Tokens();
const SECRET_KEY = 'csrf_secret';

function csrfProtection(req, res, next) {
  if (!req.session[SECRET_KEY]) {
    req.session[SECRET_KEY] = tokens.secretSync();
  }

  const secret = req.session[SECRET_KEY];
  res.locals.csrfToken = tokens.create(secret);

  const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'];
  // /api/cron endpoints are authenticated by User-Agent / x-cron-secret
  // (no session), so CSRF (which protects session-based forms) doesn't apply.
  const isCronApi = req.path.startsWith('/api/cron');
  if (unsafe.includes(req.method) && !isCronApi) {
    const sent = req.body && req.body._csrf ? req.body._csrf : req.get('x-csrf-token');
    if (!tokens.verify(secret, sent || '')) {
      return res.status(403).render('pages/error', {
        statusCode: 403,
        message: 'Security token invalid or expired. Please go back, refresh the page, and try again.',
      });
    }
  }
  next();
}

module.exports = csrfProtection;
