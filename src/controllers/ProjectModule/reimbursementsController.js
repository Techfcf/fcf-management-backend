// reimbursementsController.js
// Assumes a PostgreSQL pool is exported from your db config file.
// Adjust the require path below to match your project structure.
const pool = require("../../config/db");

/**
 * CREATE - Add a new reimbursement record
 * POST /api/reimbursements
 */
const createReimbursement = async (req, res) => {
  try {
    const {
      project_code,
      travel_reimburse_id,
      claimer_name,
      travel_id,
      reimbursement_type,
      expense_type,
      reimbursement_date,
      expanse_amount,
      remark_or_notes,
      status_of_payments,
      advanced_requested,
      advanced_adjustment_amount,
      payable_amount,
      manager_email,
      created_by,
      is_active,
    } = req.body;

    // Basic validation - project_code and travel_reimburse_id are NOT NULL in DB
    if (!project_code || !travel_reimburse_id) {
      return res.status(400).json({
        success: false,
        message: "project_code aur travel_reimburse_id required hain",
      });
    }

    // created_at / updated_at DB column is BIGINT epoch SECONDS
    // (matches the table's default: EXTRACT(EPOCH FROM NOW())::BIGINT)
    const now = Math.floor(Date.now() / 1000);

    const query = `
      INSERT INTO reimbursements (
        project_code,
        travel_reimburse_id,
        claimer_name,
        travel_id,
        reimbursement_type,
        expense_type,
        reimbursement_date,
        expanse_amount,
        remark_or_notes,
        status_of_payments,
        advanced_requested,
        advanced_adjustment_amount,
        payable_amount,
        manager_email,
        created_at,
        updated_at,
        created_by,
        updated_by,
        is_active
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )
      RETURNING *;
    `;

    const values = [
      project_code,
      travel_reimburse_id,
      claimer_name,
      travel_id,
      reimbursement_type,
      expense_type,
      reimbursement_date,
      expanse_amount || 0,
      remark_or_notes,
      status_of_payments,
      advanced_requested || 0,
      advanced_adjustment_amount || 0,
      payable_amount || 0,
      manager_email,
      now,
      now,
      created_by,
      created_by, // updated_by = created_by initially
      is_active !== undefined ? is_active : true,
    ];

    const result = await pool.query(query, values);

    return res.status(201).json({
      success: true,
      message: "Reimbursement created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error in createReimbursement:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while creating reimbursement",
      error: error.message,
    });
  }
};

/**
 * GET - Fetch all reimbursements (with optional filters + pagination)
 * or a single reimbursement by id
 * GET /api/reimbursements
 * GET /api/reimbursements/:id
 */
const getReimbursements = async (req, res) => {
  try {
    const { id } = req.params;

    // Get single record by id
    if (id) {
      const result = await pool.query(
        `SELECT * FROM reimbursements WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Reimbursement not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: result.rows[0],
      });
    }

    // Get all records with optional filters
    const {
      project_code,
      claimer_name,
      status_of_payments,
      reimbursement_type,
      expense_type,
      manager_email,
      date_from, // filters on reimbursement_date range
      date_to,
      is_active,
      page = 1,
      limit = 20,
    } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (project_code) {
      conditions.push(`project_code = $${idx++}`);
      values.push(project_code);
    }
    if (claimer_name) {
      conditions.push(`claimer_name ILIKE $${idx++}`);
      values.push(`%${claimer_name}%`);
    }
    if (status_of_payments) {
      conditions.push(`status_of_payments = $${idx++}`);
      values.push(status_of_payments);
    }
    if (reimbursement_type) {
      conditions.push(`reimbursement_type = $${idx++}`);
      values.push(reimbursement_type);
    }
    if (expense_type) {
      conditions.push(`expense_type = $${idx++}`);
      values.push(expense_type);
    }
    if (manager_email) {
      conditions.push(`manager_email = $${idx++}`);
      values.push(manager_email);
    }
    if (date_from) {
      conditions.push(`reimbursement_date >= $${idx++}`);
      values.push(date_from);
    }
    if (date_to) {
      conditions.push(`reimbursement_date <= $${idx++}`);
      values.push(date_to);
    }
    if (is_active !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      values.push(is_active === "true");
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const offset = (page - 1) * limit;

    const dataQuery = `
      SELECT * FROM reimbursements
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    values.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) FROM reimbursements ${whereClause};
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, values),
      pool.query(countQuery, values.slice(0, values.length - 2)),
    ]);

    return res.status(200).json({
      success: true,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      data: dataResult.rows,
    });
  } catch (error) {
    console.error("Error in getReimbursements:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching reimbursements",
      error: error.message,
    });
  }
};

/**
 * UPDATE - Update an existing reimbursement by id
 * PUT /api/reimbursements/:id
 */
const updateReimbursement = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Reimbursement id is required",
      });
    }

    // Check if record exists
    const existing = await pool.query(
      `SELECT * FROM reimbursements WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Reimbursement not found",
      });
    }

    const allowedFields = [
      "project_code",
      "travel_reimburse_id",
      "claimer_name",
      "travel_id",
      "reimbursement_type",
      "expense_type",
      "reimbursement_date",
      "expanse_amount",
      "remark_or_notes",
      "status_of_payments",
      "advanced_requested",
      "advanced_adjustment_amount",
      "payable_amount",
      "manager_email",
      "updated_by",
      "is_active",
    ];

    const updates = [];
    const values = [];
    let idx = 1;

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        values.push(req.body[field]);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided to update",
      });
    }

    // Always update updated_at (epoch SECONDS, matches DB default)
    updates.push(`updated_at = $${idx++}`);
    values.push(Math.floor(Date.now() / 1000));

    values.push(id); // for WHERE clause

    const query = `
      UPDATE reimbursements
      SET ${updates.join(", ")}
      WHERE id = $${idx}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      message: "Reimbursement updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error in updateReimbursement:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while updating reimbursement",
      error: error.message,
    });
  }
};

module.exports = {
  createReimbursement,
  getReimbursements,
  updateReimbursement,
};