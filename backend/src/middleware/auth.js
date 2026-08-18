const jwt = require("jsonwebtoken");

/**
 * Reads "Authorization: Bearer <token>", verifies it, and attaches
 * { id, role } to req.user. Rejects the request with 401 if missing/invalid.
 */
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing or malformed Authorization header." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }
}

/** Use after authRequired. Rejects with 403 unless the user is an admin. */
function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "This action requires a dealer/admin account." });
  }
  next();
}

module.exports = { authRequired, adminRequired };
