// controllers/projectBudget.controller.js
const pool = require("../../config/db");

/* ---------------- SHARED VALIDATION ---------------- */

const isValidNumber = (val) => {
  if (val === undefined || val === null || val === "") return true; // optional field
  return !isNaN(Number(val));
};

const validateProjectRow = (row) => {
  let {
    project_code,
    project_name,
    project_budget,
    project_budget_year,
    ip_cost,
    material_vendor_po_amt,
    expenses,
    total_expenses_till_date,
    remaining_amount,
    hr_expenses,
    travel_expenses,
    overhead_expenses,
    total_cost_of_project,
  } = row;

  project_code = project_code?.trim();
  project_name = project_name?.trim();

  if (!project_code) return "project_code is required";
  if (!project_name) return "Project Name is required";
  if (project_name.length < 3) return "Project Name must be at least 3 characters";

  if (typeof project_code !== "string") return "project_code must be a string";

  const numericFields = {
    project_budget,
    project_budget_year,
    ip_cost,
    material_vendor_po_amt,
    expenses,
    total_expenses_till_date,
    remaining_amount,
    hr_expenses,
    travel_expenses,
    overhead_expenses,
    total_cost_of_project,
  };

  for (const [field, value] of Object.entries(numericFields)) {
    if (!isValidNumber(value)) {
      return `${field} must be a valid number`;
    }
    if (value !== undefined && value !== null && value !== "" && Number(value) < 0) {
      return `${field} cannot be negative`;
    }
  }

  return null; // no errors
};

/* ---------------- NUMERIC SANITIZATION ----------------
   Postgres cannot cast an empty string ('') to numeric, so any numeric
   field that arrives as "" must be converted to null before it's sent
   in a query. This keeps "" treated as "not provided" consistently
   across validation AND the actual DB write. */

const NUMERIC_FIELDS = [
  "project_budget",
  "project_budget_year",
  "ip_cost",
  "material_vendor_po_amt",
  "expenses",
  "total_expenses_till_date",
  "remaining_amount",
  "hr_expenses",
  "travel_expenses",
  "overhead_expenses",
  "total_cost_of_project",
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

const PROJECT_COLUMNS = [
  "project_code",
  "project_name",
  "project_budget",
  "project_budget_year",
  "ip_cost",
  "material_vendor_po_amt",
  "expenses",
  "total_expenses_till_date",
  "remaining_amount",
  "hr_expenses",
  "travel_expenses",
  "overhead_expenses",
  "total_cost_of_project",
  "created_by",
];

const insertProjectRow = async (row) => {
  const cleanRow = sanitizeNumericFields(row);
  const values = PROJECT_COLUMNS.map((col) => cleanRow[col]);
  // project_code ... created_by ($14), updated_by = created_by ($14 again)
  const result = await pool.query(
    `INSERT INTO public.project_budget (
        project_code,
        project_name,
        project_budget,
        project_budget_year,
        ip_cost,
        material_vendor_po_amt,
        expenses,
        total_expenses_till_date,
        remaining_amount,
        hr_expenses,
        travel_expenses,
        overhead_expenses,
        total_cost_of_project,
        created_by,
        updated_by
    )
    VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14
    )
    RETURNING *`,
    values
  );

  return result.rows[0];
};

/* ---------------- CREATE (single) ---------------- */
// POST /api/project-budgets
const createProjectBudget = async (req, res) => {
  let {
    project_code,
    project_name,
    project_budget,
    project_budget_year,
    ip_cost,
    material_vendor_po_amt,
    expenses,
    total_expenses_till_date,
    remaining_amount,
    hr_expenses,
    travel_expenses,
    overhead_expenses,
    total_cost_of_project,
    created_by,
  } = req.body;

  project_code = project_code?.trim();
  project_name = project_name?.trim();

  const validationError = validateProjectRow({
    project_code,
    project_name,
    project_budget,
    project_budget_year,
    ip_cost,
    material_vendor_po_amt,
    expenses,
    total_expenses_till_date,
    remaining_amount,
    hr_expenses,
    travel_expenses,
    overhead_expenses,
    total_cost_of_project,
  });

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
    });
  }

  try {
    const inserted = await insertProjectRow({
      project_code,
      project_name,
      project_budget,
      project_budget_year,
      ip_cost,
      material_vendor_po_amt,
      expenses,
      total_expenses_till_date,
      remaining_amount,
      hr_expenses,
      travel_expenses,
      overhead_expenses,
      total_cost_of_project,
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
        message: "project_code already exists",
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
// Body: { projects: [ {project_code, project_name, ...}, ... ] }
// Each row is validated and inserted independently, so one bad/duplicate
// row does not block the rest of the batch from being saved.
const createProjectBudgetsBulk = async (req, res) => {
  const { projects } = req.body;

  if (!Array.isArray(projects) || projects.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Request body must include a non-empty 'projects' array",
    });
  }

  const inserted = [];
  const failed = [];

  for (let i = 0; i < projects.length; i++) {
    const raw = projects[i];

    const row = {
      ...raw,
      project_code: raw.project_code?.trim(),
      project_name: raw.project_name?.trim(),
    };

    const validationError = validateProjectRow(row);

    if (validationError) {
      failed.push({
        row: i,
        project_code: row.project_code || null,
        message: validationError,
      });
      continue;
    }

    try {
      const savedRow = await insertProjectRow(row);
      inserted.push(savedRow);
    } catch (err) {
      console.error(err);

      const message =
        err.code === "23505"
          ? "project_code already exists"
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
    message: `${inserted.length} of ${projects.length} project(s) created`,
    inserted,
    failed,
  });
};

/* ---------------- GET ALL ---------------- */
// GET /api/project-budgets?page=1&limit=20&project_code=PRJ-001
const getProjectBudgets = async (req, res) => {
  const { page = 1, limit = 20, project_code } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `SELECT * FROM public.project_budget`;
    const conditions = [];
    const params = [];

    if (project_code) {
      params.push(project_code);
      conditions.push(`project_code = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch project budgets" });
  }
};

/* ---------------- GET ONE (by primary key `id`) ---------------- */
// GET /api/project-budgets/:id
const getProjectBudgetById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM public.project_budget WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project budget not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch project budget" });
  }
};

/* ---------------- UPDATE (by primary key `id`) ---------------- */
// PUT /api/project-budgets/:id
const updateProjectBudget = async (req, res) => {
  const { id } = req.params;

  const updatableFields = [
    "project_name",
    "project_budget",
    "project_budget_year",
    "ip_cost",
    "material_vendor_po_amt",
    "expenses",
    "total_expenses_till_date",
    "remaining_amount",
    "hr_expenses",
    "travel_expenses",
    "overhead_expenses",
    "total_cost_of_project",
    "updated_by",
  ];

  // Sanitize numeric fields ("" -> null) before filtering/updating,
  // so empty numeric inputs don't reach Postgres as ''.
  const body = sanitizeNumericFields({ ...req.body });
  if (typeof body.project_name === "string") {
    body.project_name = body.project_name.trim();
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

  // Create SET clause
  const setClause = fieldsToUpdate
    .map((field, index) => `${field} = $${index + 1}`)
    .join(", ");

  const values = fieldsToUpdate.map((field) => body[field]);

  try {
    const result = await pool.query(
      `UPDATE public.project_budget
       SET
         ${setClause}
       WHERE id = $${fieldsToUpdate.length + 1}
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

module.exports = {
  createProjectBudget,
  createProjectBudgetsBulk,
  getProjectBudgets,
  getProjectBudgetById,
  updateProjectBudget,
};