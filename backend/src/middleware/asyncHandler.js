/**
 * Wraps an async route handler so a rejected promise is forwarded to
 * Express's error handler instead of crashing the process.
 *
 * Express 4 does NOT catch errors thrown inside `async` route handlers on
 * its own (that's an Express 5 feature) — an unhandled rejection there
 * takes down the entire Node process by default. Since nodemon doesn't
 * restart after a crash, every request after that (even to unrelated
 * routes) fails at the network level until someone manually restarts it.
 * Wrapping every async handler with this closes that gap for good.
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
