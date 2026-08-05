const jwt = require("jsonwebtoken");
const { verifyToken } = require("../utils/jwt");

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, code: "NO_TOKEN", message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ success: false, code: "NO_TOKEN", message: "No token provided" });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ success: false, code: "TOKEN_EXPIRED", message: "Access token expired" });
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ success: false, code: "INVALID_TOKEN", message: "Invalid token" });
    }
    console.error("authMiddleware error:", err.message);
    return res.status(401).json({ success: false, code: "AUTH_ERROR", message: "Authentication failed" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Access denied: insufficient permissions" });
    }
    next();
  };
}

async function ensureActiveUser(req, res, next) {
  const pool = require("../config/db");
  try {
    const result = await pool.query("SELECT is_active FROM public.users WHERE user_id = $1", [req.user.id]);
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(403).json({ success: false, message: "Account inactive or not found" });
    }
    next();
  } catch (err) {
    console.error("ensureActiveUser error:", err.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { authMiddleware, requireRole, ensureActiveUser };