const pool = require("../../config/db");

exports.getAllModules = async (req, res) => {
  try {
    const { id: userId, role } = req.user;

    const result = role === "admin"
      ? await pool.query(`SELECT * FROM public.app_module ORDER BY module_name ASC;`)
      : await pool.query(
          `
          SELECT DISTINCT m.*
          FROM public.user_permissions up
          JOIN public.permissions p ON up.permission_id = p.permission_id
          JOIN public.app_module m ON p.module_id = m.module_id
          WHERE up.user_id = $1
            AND up.is_active = true AND p.is_active = true AND m.is_active = true
          ORDER BY m.module_name ASC;
          `,
          [userId]
        );

    return res.status(200).json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    console.error("Error fetching modules:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch modules.", error: error.message });
  }
};

exports.getModuleById = async (req, res) => {
  try {
    const { module_id } = req.params;
    const { id: userId, role } = req.user;

    if (role !== "admin") {
      const accessCheck = await pool.query(
        `
        SELECT 1
        FROM public.user_permissions up
        JOIN public.permissions p ON up.permission_id = p.permission_id
        WHERE up.user_id = $1 AND p.module_id = $2
          AND up.is_active = true AND p.is_active = true
        LIMIT 1;
        `,
        [userId, module_id]
      );

      if (accessCheck.rows.length === 0) {
        return res.status(403).json({ success: false, message: "Access denied: this module is not permitted for you." });
      }
    }

    const result = await pool.query(`SELECT * FROM public.app_module WHERE module_id = $1`, [module_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Module not found." });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error fetching module:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch module.", error: error.message });
  }
};

exports.updateModule = async (req, res) => {
  try {
    const { module_id } = req.params;
    const { module_name, is_active } = req.body;

    const query = `
      UPDATE public.app_module
      SET
        module_name = COALESCE($1, module_name),
        is_active = COALESCE($2, is_active),
        updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE module_id = $3
      RETURNING *;
    `;

    const result = await pool.query(query, [module_name, is_active, module_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Module not found." });
    }

    return res.status(200).json({ success: true, message: "Module updated successfully.", data: result.rows[0] });
  } catch (error) {
    console.error("Error updating module:", error);
    return res.status(500).json({ success: false, message: "Failed to update module.", error: error.message });
  }
};