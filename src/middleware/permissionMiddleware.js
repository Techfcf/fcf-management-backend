const pool = require("../config/db");

function checkModuleAccess(moduleId) {
  return async (req, res, next) => {
    try {
      if (req.user.role === "admin") return next();

      const result = await pool.query(
        `
        SELECT 1
        FROM public.user_permissions up
        JOIN public.permissions p ON up.permission_id = p.permission_id
        WHERE up.user_id = $1
          AND p.module_id = $2
          AND up.is_active = true
          AND p.is_active = true
        LIMIT 1;
        `,
        [req.user.id, moduleId]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({ success: false, message: "Access denied: module not permitted" });
      }
      next();
    } catch (err) {
      console.error("checkModuleAccess error:", err.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  };
}

function checkPermission(permissionName) {
  return async (req, res, next) => {
    try {
      if (req.user.role === "admin") return next();

      const result = await pool.query(
        `
        SELECT 1
        FROM public.user_permissions up
        JOIN public.permissions p ON up.permission_id = p.permission_id
        WHERE up.user_id = $1
          AND p.permission_name = $2
          AND up.is_active = true
          AND p.is_active = true
        LIMIT 1;
        `,
        [req.user.id, permissionName]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({ success: false, message: "Access denied: permission not granted" });
      }
      next();
    } catch (err) {
      console.error("checkPermission error:", err.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  };
}

module.exports = { checkModuleAccess, checkPermission };