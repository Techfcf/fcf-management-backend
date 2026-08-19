// controllers/projectBudgetItems.controller.js
const pool = require("../../config/db");

/* ---------------- SHARED VALIDATION ---------------- */

const isValidNumber = (val) => {
  if (val === undefined || val === null || val === "") return true; // optional field
  return !isNaN(Number(val));
};

const VALID_SECTIONS = ["LABOUR", "MATERIAL", "HR", "TRAINING", "OTHER"];

// project_budget_id, section, particulars are NOT NULL in the DB, so they
// are required here. quantity/rate default to 0 if not sent.
const validateItemRow = (row) => {
  let { project_budget_id, section, particulars, quantity, rate, item_order } = row;

  particulars = typeof particulars === "string" ? particulars.trim() : particulars;

  if (!project_budget_id) return "project_budget_id is required";
  if (!isValidNumber(project_budget_id)) return "project_budget_id must be a valid number";

  if (!section) return "section is required";
  if (!VALID_SECTIONS.includes(section)) {
    return `section must be one of: ${VALID_SECTIONS.join(", ")}`;
  }

  if (!particulars) return "particulars is required";

  if (!isValidNumber(quantity)) return "quantity must be a valid number";
  if (quantity !== undefined && quantity !== null && quantity !== "" && Number(quantity) < 0) {
    return "quantity cannot be negative";
  }

  if (!isValidNumber(rate)) return "rate must be a valid number";
  if (rate !== undefined && rate !== null && rate !== "" && Number(rate) < 0) {
    return "rate cannot be negative";
  }

  if (!isValidNumber(item_order)) return "item_order must be a valid number";

  return null; // no errors
};

/* ---------------- NUMERIC SANITIZATION ----------------
   Postgres cannot cast an empty string ('') to numeric, so any numeric
   field that arrives as "" must be converted to null before it's sent
   in a query. This keeps "" treated as "not provided" consistently
   across validation AND the actual DB write. */

const NUMERIC_FIELDS = ["item_order", "quantity", "rate", "total_cost"];

const sanitizeNumericFields = (row) => {
  const clean = { ...row };
  for (const field of NUMERIC_FIELDS) {
    if (clean[field] === "" || clean[field] === undefined) {
      clean[field] = null;
    }
  }
  return clean;
};

// total_cost is always derived from quantity * rate server-side, so the DB
// value stays consistent even if a caller sends a different/missing value.
const deriveTotalCost = (row) => {
  const quantity = Number(row.quantity);
  const rate = Number(row.rate);
  if (isNaN(quantity) || isNaN(rate)) return row.total_cost ?? 0;
  return quantity * rate;
};

// Recomputes labour_total/material_total/hr_total/training_total/other_total
// and grand_total on the parent project_budget row from its active items.
// Called after any item insert/update/delete.
const recalcBudgetTotals = async (project_budget_id, updated_by = null) => {
  const SECTION_COLUMN_MAP = {
    LABOUR: "labour_total",
    MATERIAL: "material_total",
    HR: "hr_total",
    TRAINING: "training_total",
    OTHER: "other_total",
  };

  const result = await pool.query(
    `SELECT section, COALESCE(SUM(total_cost), 0)::numeric AS total
       FROM public.project_budget_items
      WHERE project_budget_id = $1 AND is_active = TRUE
      GROUP BY section`,
    [project_budget_id]
  );

  const totals = {
    labour_total: 0,
    material_total: 0,
    hr_total: 0,
    training_total: 0,
    other_total: 0,
  };

  result.rows.forEach((r) => {
    const col = SECTION_COLUMN_MAP[r.section];
    if (col) totals[col] = Number(r.total);
  });

  const grand_total =
    totals.labour_total +
    totals.material_total +
    totals.hr_total +
    totals.training_total +
    totals.other_total;

  await pool.query(
    `UPDATE public.project_budget
        SET labour_total = $1,
            material_total = $2,
            hr_total = $3,
            training_total = $4,
            other_total = $5,
            grand_total = $6,
            updated_by = $7,
            updated_at = $8
      WHERE id = $9`,
    [
      totals.labour_total,
      totals.material_total,
      totals.hr_total,
      totals.training_total,
      totals.other_total,
      grand_total,
      updated_by,
      Math.floor(Date.now() / 1000),
      project_budget_id,
    ]
  );

  return { ...totals, grand_total };
};

const ITEM_COLUMNS = [
  "project_budget_id",
  "section",
  "category",
  "sub_category",
  "particulars",
  "item_order",
  "unit",
  "quantity",
  "rate",
  "total_cost",
  "remarks",
  "created_by",
];

const insertItemRow = async (row) => {
  const cleanRow = sanitizeNumericFields(row);
  cleanRow.quantity = cleanRow.quantity ?? 0;
  cleanRow.rate = cleanRow.rate ?? 0;
  cleanRow.total_cost = deriveTotalCost(cleanRow);

  const values = ITEM_COLUMNS.map((col) => cleanRow[col]);
  // project_budget_id ... created_by ($12), updated_by = created_by ($12 again)
  const result = await pool.query(
    `INSERT INTO public.project_budget_items (
        project_budget_id,
        section,
        category,
        sub_category,
        particulars,
        item_order,
        unit,
        quantity,
        rate,
        total_cost,
        remarks,
        created_by,
        updated_by
    )
    VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12
    )
    RETURNING *`,
    values
  );

  return result.rows[0];
};

/* ---------------- CREATE (single) ---------------- */
// POST /api/project-budget-items
const createProjectBudgetItem = async (req, res) => {
  let {
    project_budget_id,
    section,
    category,
    sub_category,
    particulars,
    item_order,
    unit,
    quantity,
    rate,
    remarks,
    created_by,
  } = req.body;

  particulars = typeof particulars === "string" ? particulars.trim() : particulars;

  const validationError = validateItemRow({
    project_budget_id,
    section,
    particulars,
    quantity,
    rate,
    item_order,
  });

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
    });
  }

  try {
    const inserted = await insertItemRow({
      project_budget_id,
      section,
      category,
      sub_category,
      particulars,
      item_order,
      unit,
      quantity,
      rate,
      remarks,
      created_by,
    });

    const budget_totals = await recalcBudgetTotals(project_budget_id, created_by);

    res.status(201).json({
      success: true,
      message: "Project budget item created successfully",
      data: inserted,
      budget_totals,
    });
  } catch (err) {
    console.error(err);

    if (err.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "Invalid project_budget_id — parent budget does not exist",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create project budget item",
    });
  }
};

/* ---------------- BULK CREATE ---------------- */
// POST /api/project-budget-items/bulk
// Body: { items: [ {project_budget_id, section, particulars, quantity, rate, ...}, ... ] }
// Used when the frontend's "Add Item" form submits several line items at
// once (e.g. all Material sub-items). Each row is validated and inserted
// independently, so one bad row does not block the rest of the batch.
const createProjectBudgetItemsBulk = async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Request body must include a non-empty 'items' array",
    });
  }

  const inserted = [];
  const failed = [];
  const touchedBudgetIds = new Set();

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];

    const row = {
      ...raw,
      particulars: typeof raw.particulars === "string" ? raw.particulars.trim() : raw.particulars,
    };

    const validationError = validateItemRow(row);

    if (validationError) {
      failed.push({
        row: i,
        particulars: row.particulars || null,
        message: validationError,
      });
      continue;
    }

    try {
      const savedRow = await insertItemRow(row);
      inserted.push(savedRow);
      touchedBudgetIds.add(row.project_budget_id);
    } catch (err) {
      console.error(err);

      const message =
        err.code === "23503"
          ? "Invalid project_budget_id — parent budget does not exist"
          : "Failed to create project budget item";

      failed.push({
        row: i,
        particulars: row.particulars || null,
        message,
      });
    }
  }

  // Recalculate totals once per distinct budget touched by this batch.
  const budgetTotalsByBudgetId = {};
  for (const budgetId of touchedBudgetIds) {
    budgetTotalsByBudgetId[budgetId] = await recalcBudgetTotals(budgetId);
  }

  res.status(201).json({
    success: true,
    message: `${inserted.length} of ${items.length} item(s) created`,
    inserted,
    failed,
    budgetTotalsByBudgetId,
  });
};

/* ---------------- GET ALL (by project_budget_id, grouped by section) ---------------- */
// GET /api/project-budget-items/budget/:project_budget_id
const getProjectBudgetItems = async (req, res) => {
  const { project_budget_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM public.project_budget_items
        WHERE project_budget_id = $1 AND is_active = TRUE
        ORDER BY section, item_order NULLS LAST, id`,
      [project_budget_id]
    );

    const grouped = { LABOUR: [], MATERIAL: [], HR: [], TRAINING: [], OTHER: [] };
    result.rows.forEach((item) => {
      if (!grouped[item.section]) grouped[item.section] = [];
      grouped[item.section].push(item);
    });

    res.json({ success: true, data: grouped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch project budget items" });
  }
};

/* ---------------- GET ONE (by primary key `id`) ---------------- */
// GET /api/project-budget-items/:id
const getProjectBudgetItemById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM public.project_budget_items WHERE id = $1 AND is_active = TRUE`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Project budget item not found" });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch project budget item" });
  }
};

/* ---------------- UPDATE (by primary key `id`) ---------------- */
// PUT /api/project-budget-items/:id
const updateProjectBudgetItem = async (req, res) => {
  const { id } = req.params;

  const updatableFields = [
    "category",
    "sub_category",
    "particulars",
    "item_order",
    "unit",
    "quantity",
    "rate",
    "remarks",
    "updated_by",
  ];

  const body = sanitizeNumericFields({ ...req.body });
  if (typeof body.particulars === "string") body.particulars = body.particulars.trim();

  try {
    const existingResult = await pool.query(
      `SELECT * FROM public.project_budget_items WHERE id = $1 AND is_active = TRUE`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Project budget item not found." });
    }

    const current = existingResult.rows[0];

    // Keep total_cost consistent with quantity/rate whenever either changes.
    if (body.quantity !== undefined || body.rate !== undefined) {
      const quantity = body.quantity !== undefined ? Number(body.quantity) : Number(current.quantity);
      const rate = body.rate !== undefined ? Number(body.rate) : Number(current.rate);
      if (!isNaN(quantity) && !isNaN(rate)) {
        body.total_cost = quantity * rate;
      }
    }

    const fieldsToUpdate = Object.keys(body).filter(
      (key) => updatableFields.includes(key) || key === "total_cost"
    );

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided to update.",
      });
    }

    fieldsToUpdate.push("updated_at");
    const values = fieldsToUpdate.map((field) =>
      field === "updated_at" ? Math.floor(Date.now() / 1000) : body[field]
    );

    const setClause = fieldsToUpdate
      .map((field, index) => `${field} = $${index + 1}`)
      .join(", ");

    const result = await pool.query(
      `UPDATE public.project_budget_items
       SET
         ${setClause}
       WHERE id = $${fieldsToUpdate.length + 1}
       RETURNING *`,
      [...values, id]
    );

    const budget_totals = await recalcBudgetTotals(current.project_budget_id, body.updated_by);

    res.status(200).json({
      success: true,
      message: "Project budget item updated successfully.",
      data: result.rows[0],
      budget_totals,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to update project budget item.",
    });
  }
};

/* ---------------- SOFT DELETE (by primary key `id`) ---------------- */
// DELETE /api/project-budget-items/:id
const deleteProjectBudgetItem = async (req, res) => {
  const { id } = req.params;
  const { updated_by } = req.body;

  try {
    const result = await pool.query(
      `UPDATE public.project_budget_items
       SET is_active = FALSE, updated_by = $1, updated_at = $2
       WHERE id = $3 AND is_active = TRUE
       RETURNING project_budget_id`,
      [updated_by || null, Math.floor(Date.now() / 1000), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Project budget item not found." });
    }

    const budget_totals = await recalcBudgetTotals(result.rows[0].project_budget_id, updated_by);

    res.status(200).json({
      success: true,
      message: "Project budget item deleted successfully.",
      budget_totals,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to delete project budget item." });
  }
};

module.exports = {
  createProjectBudgetItem,
  createProjectBudgetItemsBulk,
  getProjectBudgetItems,
  getProjectBudgetItemById,
  updateProjectBudgetItem,
  deleteProjectBudgetItem,
};