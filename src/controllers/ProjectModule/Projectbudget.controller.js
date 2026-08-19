// controllers/projectBudget.controller.js
const pool = require("../../config/db");

/* ---------------- SHARED VALIDATION ---------------- */

const isValidNumber = (val) => {
  if (val === undefined || val === null || val === "") return true; // optional field
  return !isNaN(Number(val));
};

// budget_number is auto-generated server-side, so it is never required from
// the caller. financial_year, budget_name, project_code are NOT NULL in the
// DB, so they are required here.
const validateBudgetRow = (row) => {
  let { project_code, financial_year, budget_name, status } = row;

  project_code = project_code?.trim();
  financial_year = financial_year?.trim();
  budget_name = budget_name?.trim();

  if (!project_code) return "project_code is required";
  if (typeof project_code !== "string") return "project_code must be a string";

  if (!financial_year) return "financial_year is required";

  if (!budget_name) return "budget_name is required";
  if (budget_name.length < 3) return "budget_name must be at least 3 characters";

  const allowedStatus = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"];
  if (status !== undefined && status !== null && status !== "" && !allowedStatus.includes(status)) {
    return `status must be one of: ${allowedStatus.join(", ")}`;
  }

  return null; // no errors
};

/* ---------------- NUMERIC SANITIZATION ----------------
   Postgres cannot cast an empty string ('') to numeric, so any numeric
   field that arrives as "" must be converted to null before it's sent
   in a query. This keeps "" treated as "not provided" consistently
   across validation AND the actual DB write. */

const NUMERIC_FIELDS = [
  "labour_total",
  "material_total",
  "hr_total",
  "training_total",
  "other_total",
  "grand_total",
];

const sanitizeNumericFields = (row) => {
  const clean = { ...row };
  for (const field of NUMERIC_FIELDS) {
    if (clean[field] === "" || clean[field] === undefined) {
      clean[field] = null;
    }
  }
  return clean;
};

// Auto-generate a budget number like BUD-2026-0001, scoped per financial year
const generateBudgetNumber = async (financial_year) => {
  const yearPart = (financial_year || "").replace(/[^0-9]/g, "").slice(0, 4) || new Date().getFullYear();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM public.project_budget WHERE financial_year = $1`,
    [financial_year]
  );
  const seq = String(result.rows[0].count + 1).padStart(4, "0");
  return `BUD-${yearPart}-${seq}`;
};

const BUDGET_COLUMNS = [
  "budget_number",
  "project_code",
  "financial_year",
  "budget_name",
  "status",
  "created_by",
];

const insertBudgetRow = async (row) => {
  const cleanRow = sanitizeNumericFields(row);
  cleanRow.budget_number = cleanRow.budget_number || (await generateBudgetNumber(cleanRow.financial_year));
  cleanRow.status = cleanRow.status || "DRAFT";

  const values = BUDGET_COLUMNS.map((col) => cleanRow[col]);
  // budget_number ... created_by ($6), updated_by = created_by ($6 again)
  const result = await pool.query(
    `INSERT INTO public.project_budget (
        budget_number,
        project_code,
        financial_year,
        budget_name,
        status,
        created_by,
        updated_by
    )
    VALUES (
        $1,$2,$3,$4,$5,$6,$6
    )
    RETURNING *`,
    values
  );

  return result.rows[0];
};

/* ---------------- CREATE (single) ---------------- */
// POST /api/project-budgets
const createProjectBudget = async (req, res) => {
  let { project_code, financial_year, budget_name, status, created_by } = req.body;

  project_code = project_code?.trim();
  financial_year = financial_year?.trim();
  budget_name = budget_name?.trim();

  const validationError = validateBudgetRow({
    project_code,
    financial_year,
    budget_name,
    status,
  });

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
    });
  }

  try {
    const inserted = await insertBudgetRow({
      project_code,
      financial_year,
      budget_name,
      status,
      created_by,
    });

    res.status(201).json({
      success: true,
      message: "Project budget created successfully",
      data: inserted,
    });
  } catch (err) {
    console.error(err);

    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "budget_number already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create project budget",
    });
  }
};

/* ---------------- BULK CREATE ---------------- */
// POST /api/project-budgets/bulk
// Body: { budgets: [ {project_code, financial_year, budget_name, status, created_by}, ... ] }
// Each row is validated and inserted independently, so one bad row does not
// block the rest of the batch from being saved.
const createProjectBudgetsBulk = async (req, res) => {
  const { budgets } = req.body;

  if (!Array.isArray(budgets) || budgets.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Request body must include a non-empty 'budgets' array",
    });
  }

  const inserted = [];
  const failed = [];

  for (let i = 0; i < budgets.length; i++) {
    const raw = budgets[i];

    const row = {
      ...raw,
      project_code: raw.project_code?.trim(),
      financial_year: raw.financial_year?.trim(),
      budget_name: raw.budget_name?.trim(),
    };

    const validationError = validateBudgetRow(row);

    if (validationError) {
      failed.push({
        row: i,
        project_code: row.project_code || null,
        message: validationError,
      });
      continue;
    }

    try {
      const savedRow = await insertBudgetRow(row);
      inserted.push(savedRow);
    } catch (err) {
      console.error(err);

      const message =
        err.code === "23505"
          ? "budget_number already exists"
          : "Failed to create project budget";

      failed.push({
        row: i,
        project_code: row.project_code || null,
        message,
      });
    }
  }

  res.status(201).json({
    success: true,
    message: `${inserted.length} of ${budgets.length} item(s) created`,
    inserted,
    failed,
  });
};

/* ---------------- GET ALL ---------------- */
// GET /api/project-budgets?page=1&limit=20&project_code=PRJ-001&status=DRAFT&financial_year=2026-27
const getProjectBudgets = async (req, res) => {
  const { page = 1, limit = 20, project_code, status, financial_year } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `SELECT * FROM public.project_budget WHERE is_active = TRUE`;
    const conditions = [];
    const params = [];

    if (project_code) {
      params.push(project_code);
      conditions.push(`project_code = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (financial_year) {
      params.push(financial_year);
      conditions.push(`financial_year = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // grand_total_sum = SUM(grand_total) across ALL matching rows —
    // computed separately from the paginated LIMIT/OFFSET query above so
    // the total stays correct even on page 2, 3, etc.
    let grand_total_sum = 0;
    if (project_code) {
      const totalResult = await pool.query(
        `SELECT COALESCE(SUM(grand_total), 0) AS total
         FROM public.project_budget
         WHERE project_code = $1 AND is_active = TRUE`,
        [project_code]
      );
      grand_total_sum = Number(totalResult.rows[0].total);
    }

    res.json({
      success: true,
      data: result.rows,
      grand_total_sum,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch project budgets" });
  }
};

/* ---------------- GET ONE (by primary key `id`) ---------------- */
// GET /api/project-budgets/:id
const getProjectBudgetById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM public.project_budget WHERE id = $1 AND is_active = TRUE`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Project budget not found" });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch project budget" });
  }
};

/* ---------------- UPDATE (by primary key `id`) ---------------- */
// PUT /api/project-budgets/:id
const updateProjectBudget = async (req, res) => {
  const { id } = req.params;

  const updatableFields = [
    "project_code",
    "financial_year",
    "budget_name",
    "status",
    "updated_by",
  ];

  const body = { ...req.body };
  if (typeof body.project_code === "string") body.project_code = body.project_code.trim();
  if (typeof body.financial_year === "string") body.financial_year = body.financial_year.trim();
  if (typeof body.budget_name === "string") body.budget_name = body.budget_name.trim();

  if (body.status) {
    const allowedStatus = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"];
    if (!allowedStatus.includes(body.status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${allowedStatus.join(", ")}`,
      });
    }
  }

  // Get only allowed fields
  const fieldsToUpdate = Object.keys(body).filter((key) =>
    updatableFields.includes(key)
  );

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid fields provided to update.",
    });
  }

  // updated_at is stored as epoch seconds
  fieldsToUpdate.push("updated_at");
  const values = fieldsToUpdate.map((field) =>
    field === "updated_at" ? Math.floor(Date.now() / 1000) : body[field]
  );

  const setClause = fieldsToUpdate
    .map((field, index) => `${field} = $${index + 1}`)
    .join(", ");

  try {
    const result = await pool.query(
      `UPDATE public.project_budget
       SET
         ${setClause}
       WHERE id = $${fieldsToUpdate.length + 1} AND is_active = TRUE
       RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project budget not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Project budget updated successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to update project budget.",
    });
  }
};

/* ---------------- SOFT DELETE (by primary key `id`) ---------------- */
// DELETE /api/project-budgets/:id
const deleteProjectBudget = async (req, res) => {
  const { id } = req.params;
  const { updated_by } = req.body;

  try {
    const result = await pool.query(
      `UPDATE public.project_budget
       SET is_active = FALSE, updated_by = $1, updated_at = $2
       WHERE id = $3 AND is_active = TRUE
       RETURNING id`,
      [updated_by || null, Math.floor(Date.now() / 1000), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Project budget not found." });
    }

    res.status(200).json({ success: true, message: "Project budget deleted successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to delete project budget." });
  }
};

module.exports = {
  createProjectBudget,
  createProjectBudgetsBulk,
  getProjectBudgets,
  getProjectBudgetById,
  updateProjectBudget,
  deleteProjectBudget,
};