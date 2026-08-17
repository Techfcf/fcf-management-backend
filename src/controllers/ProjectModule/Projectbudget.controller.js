// controllers/projectBudget.controller.js
const pool = require("../../config/db");

/* ---------------- SHARED VALIDATION ---------------- */

const isValidNumber = (val) => {
  if (val === undefined || val === null || val === "") return true; // optional field
  return !isNaN(Number(val));
};

// project_budget_year is optional (nullable column). particulars/rate/hectares
// are NOT NULL in the DB, so they are required here.
const validateProjectRow = (row) => {
  let { project_code, project_name, project_budget_year, particulars, rate, hectares } = row;

  project_code = project_code?.trim();
  project_name = project_name?.trim();
  particulars = typeof particulars === "string" ? particulars.trim() : particulars;

  if (!project_code) return "project_code is required";
  if (typeof project_code !== "string") return "project_code must be a string";

  if (!project_name) return "Project Name is required";
  if (project_name.length < 3) return "Project Name must be at least 3 characters";

  if (!particulars) return "particulars is required";

  if (rate === undefined || rate === null || rate === "") return "rate is required";
  if (!isValidNumber(rate)) return "rate must be a valid number";
  if (Number(rate) < 0) return "rate cannot be negative";

  if (hectares === undefined || hectares === null || hectares === "") return "hectares is required";
  if (!isValidNumber(hectares)) return "hectares must be a valid number";
  if (Number(hectares) < 0) return "hectares cannot be negative";

  if (!isValidNumber(project_budget_year)) return "project_budget_year must be a valid number";
  if (project_budget_year !== undefined && project_budget_year !== null && project_budget_year !== "" && Number(project_budget_year) < 0) {
    return "project_budget_year cannot be negative";
  }

  return null; // no errors
};

/* ---------------- NUMERIC SANITIZATION ----------------
   Postgres cannot cast an empty string ('') to numeric, so any numeric
   field that arrives as "" must be converted to null before it's sent
   in a query. This keeps "" treated as "not provided" consistently
   across validation AND the actual DB write. */

const NUMERIC_FIELDS = ["project_budget_year", "rate", "hectares", "cost"];

const sanitizeNumericFields = (row) => {
  const clean = { ...row };
  for (const field of NUMERIC_FIELDS) {
    if (clean[field] === "" || clean[field] === undefined) {
      clean[field] = null;
    }
  }
  return clean;
};

// cost is always derived from rate * hectares server-side, so the DB value
// stays consistent even if a caller sends a different/missing cost.
const deriveCost = (row) => {
  const rate = Number(row.rate);
  const hectares = Number(row.hectares);
  if (isNaN(rate) || isNaN(hectares)) return row.cost ?? null;
  return rate * hectares;
};

const PROJECT_COLUMNS = [
  "project_code",
  "project_name",
  "project_budget_year",
  "particulars",
  "rate",
  "hectares",
  "cost",
  "created_by",
];

const insertProjectRow = async (row) => {
  const cleanRow = sanitizeNumericFields(row);
  cleanRow.cost = deriveCost(cleanRow);

  const values = PROJECT_COLUMNS.map((col) => cleanRow[col]);
  // project_code ... created_by ($8), updated_by = created_by ($8 again)
  const result = await pool.query(
    `INSERT INTO public.project_budget (
        project_code,
        project_name,
        project_budget_year,
        particulars,
        rate,
        hectares,
        cost,
        created_by,
        updated_by
    )
    VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$8
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
    project_budget_year,
    particulars,
    rate,
    hectares,
    cost,
    created_by,
  } = req.body;

  project_code = project_code?.trim();
  project_name = project_name?.trim();
  particulars = typeof particulars === "string" ? particulars.trim() : particulars;

  const validationError = validateProjectRow({
    project_code,
    project_name,
    project_budget_year,
    particulars,
    rate,
    hectares,
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
      project_budget_year,
      particulars,
      rate,
      hectares,
      cost,
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
// Body: { projects: [ {project_code, project_name, project_budget_year, particulars, rate, hectares, created_by}, ... ] }
// Used when the frontend's "Add Item" form submits several line items for the
// same project in one go. Each row is validated and inserted independently,
// so one bad row does not block the rest of the batch from being saved.
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
      particulars: typeof raw.particulars === "string" ? raw.particulars.trim() : raw.particulars,
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
    message: `${inserted.length} of ${projects.length} item(s) created`,
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

    // total_project_budget = SUM(cost) across ALL particulars for this
    // project_code — computed separately from the paginated LIMIT/OFFSET
    // query above so the total stays correct even on page 2, 3, etc.
    let total_project_budget = 0;
    if (project_code) {
      const totalResult = await pool.query(
        `SELECT COALESCE(SUM(cost), 0) AS total
         FROM public.project_budget
         WHERE project_code = $1`,
        [project_code]
      );
      total_project_budget = Number(totalResult.rows[0].total);
    }

    res.json({
      data: result.rows,
      total_project_budget,
    });
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
    "project_budget_year",
    "particulars",
    "rate",
    "hectares",
    "cost",
    "updated_by",
  ];

  // Sanitize numeric fields ("" -> null) before filtering/updating,
  // so empty numeric inputs don't reach Postgres as ''.
  const body = sanitizeNumericFields({ ...req.body });
  if (typeof body.project_name === "string") {
    body.project_name = body.project_name.trim();
  }
  if (typeof body.particulars === "string") {
    body.particulars = body.particulars.trim();
  }

  // Keep cost consistent with rate/hectares whenever either is part of this update.
  if (body.rate !== undefined || body.hectares !== undefined) {
    const rate = body.rate !== undefined ? Number(body.rate) : null;
    const hectares = body.hectares !== undefined ? Number(body.hectares) : null;
    if (rate !== null && hectares !== null && !isNaN(rate) && !isNaN(hectares)) {
      body.cost = rate * hectares;
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