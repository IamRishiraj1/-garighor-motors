/**
 * A minimal per-IP rate limiter with no extra dependency. Good enough for a
 * single small showroom site. If traffic grows meaningfully, swap this for
 * a proper package like express-rate-limit backed by Redis.
 */
function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  const hits = new Map(); // ip -> [timestamps]

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(ip, recent);

    if (recent.length > max) {
      return res.status(429).json({ error: "Too many requests — please slow down and try again shortly." });
    }
    next();
  };
}

module.exports = { rateLimit };
