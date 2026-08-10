/**
 * src/middleware/rateLimit.js
 * Global request throttling (FR-08) + a strict limiter for the login
 * endpoint (brute-force defence, NFR-SEC-01). The auth routes import
 * `authLimiter`; the app mounts `globalLimiter` on everything.
 */
const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 300, // 300 requests/min from one IP (generous for LAN use)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 login attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please wait 15 minutes and try again.',
});

module.exports = { globalLimiter, authLimiter };
