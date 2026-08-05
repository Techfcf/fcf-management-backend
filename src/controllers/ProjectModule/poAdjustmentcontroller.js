// controllers/poAdjustmentController.js
const pool = require("../../config/db");

/* ---------------- SHARED VALIDATION ---------------- */

const validatePoAdjustmentRow = (row) => {
  let { project_code, purchase_order_id, po_reference, expenses_amount, po_date } = row;

  project_code = project_code?.trim();
  purchase_order_id = purchase_order_id?.trim();

  if (!project_code) return "Project Code is required";
  if (!purchase_order_id) return "Purchase Order ID is required";

  if (
    expenses_amount !== undefined &&
    expenses_amount !== null &&
    expenses_amount !== "" &&
    isNaN(Number(expenses_amount))
  ) {
    return "Expenses Amount must be a valid number";
  }

  if (po_date && isNaN(Date.parse(po_date))) {
    return "Invalid PO Date";
  }

  if (po_reference !== undefined && po_reference !== null && typeof po_reference !== "string") {
    return "po_reference must be a string";
  }

  return null; // no errors
};

const PO_ADJUSTMENT_COLUMNS = [
  "project_code",
  "purchase_order_id",
  "po_reference",
  "expenses_id",
  "vendor_id",
  "vendor_name",
  "expenses_amount",
  "po_date",
];

const insertPoAdjustmentRow = async (row) => {
  const values = PO_ADJUSTMENT_COLUMNS.map((col) => row[col] ?? null);

  const result = await pool.query(
    `INSERT INTO public.po_adjustment (
        project_code,
        purchase_order_id,
        po_reference,
        expenses_id,
        vendor_id,
        vendor_name,
        expenses_amount,
        po_date
    )
    VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8
    )
    RETURNING *`,
    values
  );

  return result.rows[0];
};

/* ---------------- CREATE (SINGLE) ---------------- */
const createPoAdjustment = async (req, res) => {
  let {
    project_code,
    purchase_order_id,
    po_reference,
    expenses_id,
    vendor_id,
    vendor_name,
    expenses_amount,
    po_date,
  } = req.body;

  // Remove extra spaces
  project_code = project_code?.trim();
  purchase_order_id = purchase_order_id?.trim();
  vendor_name = vendor_name?.trim();

  const validationError = validatePoAdjustmentRow({
    project_code,
    purchase_order_id,
    po_reference,
    expenses_amount,
    po_date,
  });

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
    });
  }

  try {
    const inserted = await insertPoAdjustmentRow({
      project_code,
      purchase_order_id,
      po_reference,
      expenses_id,
      vendor_id,
      vendor_name,
      expenses_amount,
      po_date,
    });

    res.status(201).json({
      success: true,
      message: "PO adjustment created successfully",
      data: inserted,
    });
  } catch (err) {
    console.error(err);

    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "PO adjustment record already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create PO adjustment",
    });
  }
};

/* ---------------- BULK CREATE ---------------- */
// POST /api/po-adjustment/bulk
// Body: { records: [ {project_code, purchase_order_id, ...}, ... ] }
// Each row is validated and inserted independently, so one bad/duplicate
// row does not block the rest of the batch from being saved.
const createPoAdjustmentBulk = async (req, res) => {
  const { records } = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Request body must include a non-empty 'records' array",
    });
  }

  const inserted = [];
  const failed = [];

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];

    const row = {
      ...raw,
      project_code: raw.project_code?.trim(),
      purchase_order_id: raw.purchase_order_id?.trim(),
      vendor_name: raw.vendor_name?.trim(),
    };

    const validationError = validatePoAdjustmentRow(row);

    if (validationError) {
      failed.push({
        row: i,
        purchase_order_id: row.purchase_order_id || null,
        message: validationError,
      });
      continue;
    }

    try {
      const savedRow = await insertPoAdjustmentRow(row);
      inserted.push(savedRow);
    } catch (err) {
      console.error(err);

      const message =
        err.code === "23505"
          ? "PO adjustment record already exists"
          : "Failed to create PO adjustment";

      failed.push({
        row: i,
        purchase_order_id: row.purchase_order_id || null,
        message,
      });
    }
  }

  res.status(201).json({
    success: true,
    message: `${inserted.length} of ${records.length} PO adjustment record(s) created`,
    inserted,
    failed,
  });
};

/* ---------------- GET ALL ---------------- */
// GET /api/po-adjustment
// Optional query params: page, limit, project_code, vendor_id, purchase_order_id
const getPoAdjustment = async (req, res) => {
  const { project_code, vendor_id, purchase_order_id } = req.query;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
  const offset = (page - 1) * limit;

  try {
    let query = `SELECT * FROM public.po_adjustment`;
    const conditions = [];
    const params = [];

    if (project_code) {
      params.push(project_code);
      conditions.push(`project_code = $${params.length}`);
    }

    if (vendor_id) {
      params.push(vendor_id);
      conditions.push(`vendor_id = $${params.length}`);
    }

    if (purchase_order_id) {
      params.push(purchase_order_id);
      conditions.push(`purchase_order_id = $${params.length}`);
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
    res.status(500).json({ error: "Failed to fetch PO adjustment records" });
  }
};

/* ---------------- GET BY VENDOR ID ---------------- */
// GET /api/po-adjustment/vendor/:vendorId
const getPoAdjustmentByVendorId = async (req, res) => {
  const { vendorId } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM public.po_adjustment WHERE vendor_id = $1 ORDER BY id DESC`,
      [vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No PO adjustment found for this vendor" });
    }

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch PO adjustment for vendor" });
  }
};

/* ---------------- UPDATE ---------------- */
// PUT /api/po-adjustment/:id
const updatePoAdjustment = async (req, res) => {
  const { id } = req.params;

  const updatableFields = [
    "project_code",
    "purchase_order_id",
    "po_reference",
    "expenses_id",
    "vendor_id",
    "vendor_name",
    "expenses_amount",
    "po_date",
  ];

  const body = { ...req.body };

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
      `UPDATE public.po_adjustment
       SET
         ${setClause},
         updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)
       WHERE id = $${fieldsToUpdate.length + 1}
       RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "PO adjustment record not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "PO adjustment updated successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to update PO adjustment.",
    });
  }
};

module.exports = {
  insertPoAdjustmentRow,
  createPoAdjustment,
  createPoAdjustmentBulk,
  getPoAdjustment,
  getPoAdjustmentByVendorId,
  updatePoAdjustment,
};