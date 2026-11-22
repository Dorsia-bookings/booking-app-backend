const jwt = require("jsonwebtoken");

// Only lets a request through if it carries a valid login for THIS restaurant.
function requireAuth(req, res, next) {
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not set in the environment");
    return res.status(500).json({ error: "Login isn't configured on the server yet." });
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!req.tenant || payload.tenantId !== req.tenant.id) {
      return res.status(403).json({ error: "This login is for a different restaurant." });
    }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Your login has expired. Please log in again." });
  }
}

module.exports = { requireAuth };
