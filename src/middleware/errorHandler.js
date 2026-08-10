/**
 * src/middleware/errorHandler.js
 * Central error handling: 404 for unknown routes, 500 for everything
 * else. In development the stack trace is shown; in production it is
 * logged and hidden from the user.
 */
function notFound(req, res) {
  res.status(404).render('pages/error', {
    statusCode: 404,
    message: 'The page you are looking for does not exist.',
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[error]', err);

  // Duplicate-key database errors -> friendly message
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).render('pages/error', {
      statusCode: 409,
      message: 'A record with the same unique value already exists. Please check your input.',
    });
  }

  res.status(err.status || 500).render('pages/error', {
    statusCode: err.status || 500,
    message: err.message || 'An unexpected error occurred.',
  });
}

module.exports = { notFound, errorHandler };
