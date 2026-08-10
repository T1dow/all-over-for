/**
 * src/utils/asyncHandler.js
 * ------------------------------------------------------------------
 * Wraps an async route handler so that a rejected promise is passed to
 * Express' error middleware automatically. Without this, an error thrown
 * inside an async handler would hang the request (Express 4 does not
 * catch async errors by itself).
 * ------------------------------------------------------------------
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
