const pool = require("../../config/db");
const { generateToken, generateRefreshToken, verifyRefreshToken } = require("../../utils/jwt");

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const result = await pool.query("SELECT * FROM public.users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: "Account is inactive. Contact admin." });
    }

    // direct plain text match
    if (password !== user.password) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const moduleQuery = `
      SELECT DISTINCT m.module_id, m.module_name
      FROM public.user_permissions up
      JOIN public.permissions p ON up.permission_id = p.permission_id
      JOIN public.app_module m ON p.module_id = m.module_id
      WHERE up.user_id = $1
        AND up.is_active = true AND p.is_active = true AND m.is_active = true
      ORDER BY m.module_name;
    `;

    // admin ko sab modules milenge, baaki users ko sirf permitted modules
    const moduleResult = user.role === "admin"
      ? await pool.query(`SELECT module_id, module_name FROM public.app_module WHERE is_active = true ORDER BY module_name;`)
      : await pool.query(moduleQuery, [user.user_id]);

    const payload = { id: user.user_id, email: user.email, role: user.role };
    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      refreshToken,
      user: { id: user.user_id, name: user.user_name, email: user.email, role: user.role },
      modules: moduleResult.rows,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function refreshToken(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: "Refresh token required" });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (err) {
      return res.status(401).json({ success: false, code: "INVALID_REFRESH_TOKEN", message: "Invalid or expired refresh token, please login again" });
    }

    const result = await pool.query("SELECT * FROM public.users WHERE user_id = $1", [decoded.id]);
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(403).json({ success: false, message: "Account inactive or not found" });
    }
    const user = result.rows[0];

    const newAccessToken = generateToken({ id: user.user_id, email: user.email, role: user.role });

    return res.status(200).json({ success: true, token: newAccessToken });
  } catch (err) {
    console.error("refreshToken error:", err.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { login, refreshToken };