// controllers/projectController.js
const pool = require("../../config/db");

/* ---------------- SHARED VALIDATION ---------------- */
const allowedStatus = ["Verification Pending", "Verified Successfully"];

const validateVendorRow = (row) => {
  let {
    vendor_id,
    vendor_name,
    contact_person_mobile_no,
    email_id,
    ifsc_code,
    verification_status,
    project_code,
  } = row;

  vendor_id = vendor_id?.trim();
  vendor_name = vendor_name?.trim();
  email_id = email_id?.trim();

  if (!vendor_id) return "Vendor ID is required";
  if (!vendor_name) return "Vendor Name is required";
  if (vendor_name.length < 3) return "Vendor Name must be at least 3 characters";

  if (contact_person_mobile_no && !/^[6-9]\d{9}$/.test(contact_person_mobile_no)) {
    return "Invalid Mobile Number";
  }

  if (email_id && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_id)) {
    return "Invalid Email";
  }

  if (ifsc_code && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc_code)) {
    return "Invalid IFSC Code";
  }

  if (verification_status && !allowedStatus.includes(verification_status)) {
    return "Verification Status must be Verification Pending or Verified Successfully";
  }

  // project_code is now a plain VARCHAR column, so it must be a simple string
  if (project_code !== undefined && project_code !== null && typeof project_code !== "string") {
    return "project_code must be a string";
  }

  return null; // no errors
};

const VENDOR_COLUMNS = [
  "vendor_id",
  "vendor_name",
  "address",
  "contact_person_name",
  "contact_person_mobile_no",
  "email_id",
  "gst_registration_or_pan_no",
  "gst_or_pan_certificate",
  "msme_registration_no",
  "msme_certificate",
  "bank_account_no",
  "ifsc_code",
  "bank_details_proof",
  "notes_or_remarks",
  "verification_status",
  "project_code",
  "created_by",
];

const insertVendorRow = async (row) => {
  const values = VENDOR_COLUMNS.map((col) => row[col]);
  // vendor_id, vendor_name, ... project_code ($16), created_by ($17), updated_by = created_by ($17 again)
  const result = await pool.query(
    `INSERT INTO public.vendor (
        vendor_id,
        vendor_name,
        address,
        contact_person_name,
        contact_person_mobile_no,
        email_id,
        gst_registration_or_pan_no,
        gst_or_pan_certificate,
        msme_registration_no,
        msme_certificate,
        bank_account_no,
        ifsc_code,
        bank_details_proof,
        notes_or_remarks,
        verification_status,
        project_code,
        created_by,
        updated_by
    )
    VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17
    )
    RETURNING *`,
    values
  );

  return result.rows[0];
};

const createVendor = async (req, res) => {
  let {
    vendor_id,
    vendor_name,
    address,
    contact_person_name,
    contact_person_mobile_no,
    email_id,
    gst_registration_or_pan_no,
    gst_or_pan_certificate,
    msme_registration_no,
    msme_certificate,
    bank_account_no,
    ifsc_code,
    bank_details_proof,
    notes_or_remarks,
    verification_status,
    project_code,
    created_by
  } = req.body;

  // Remove extra spaces
  vendor_id = vendor_id?.trim();
  vendor_name = vendor_name?.trim();
  email_id = email_id?.trim();
  project_code = project_code?.trim();

  const validationError = validateVendorRow({
    vendor_id,
    vendor_name,
    contact_person_mobile_no,
    email_id,
    ifsc_code,
    verification_status,
    project_code,
  });

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError
    });
  }

  try {
    const inserted = await insertVendorRow({
      vendor_id,
      vendor_name,
      address,
      contact_person_name,
      contact_person_mobile_no,
      email_id,
      gst_registration_or_pan_no,
      gst_or_pan_certificate,
      msme_registration_no,
      msme_certificate,
      bank_account_no,
      ifsc_code,
      bank_details_proof,
      notes_or_remarks,
      verification_status,
      project_code,
      created_by,
    });

    res.status(201).json({
      success: true,
      message: "Vendor created successfully",
      data: inserted
    });

  } catch (err) {
    console.error(err);

    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Vendor ID already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create vendor"
    });
  }
};

/* ---------------- BULK CREATE ---------------- */
// POST /api/vendors/bulk
// Body: { vendors: [ {vendor_id, vendor_name, ...}, ... ] }
// Each row is validated and inserted independently, so one bad/duplicate
// row does not block the rest of the batch from being saved.
const createVendorsBulk = async (req, res) => {
  const { vendors } = req.body;

  if (!Array.isArray(vendors) || vendors.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Request body must include a non-empty 'vendors' array"
    });
  }

  const inserted = [];
  const failed = [];

  for (let i = 0; i < vendors.length; i++) {
    const raw = vendors[i];

    const row = {
      ...raw,
      vendor_id: raw.vendor_id?.trim(),
      vendor_name: raw.vendor_name?.trim(),
      email_id: raw.email_id?.trim(),
      project_code: raw.project_code?.trim(),
    };

    const validationError = validateVendorRow(row);

    if (validationError) {
      failed.push({
        row: i,
        vendor_id: row.vendor_id || null,
        message: validationError,
      });
      continue;
    }

    try {
      const savedRow = await insertVendorRow(row);
      inserted.push(savedRow);
    } catch (err) {
      console.error(err);

      const message =
        err.code === "23505"
          ? "Vendor ID already exists"
          : "Failed to create vendor";

      failed.push({
        row: i,
        vendor_id: row.vendor_id || null,
        message,
      });
    }
  }

  res.status(201).json({
    success: true,
    message: `${inserted.length} of ${vendors.length} vendor(s) created`,
    inserted,
    failed,
  });
};

// GET ALL (with optional pagination, is_active filter, and project_code filter)
// Pass ?project_code=PRJ-001 to only get vendors linked to that project.
const getvendors = async (req, res) => {
  const { page = 1, limit = 20, is_active, project_code } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `SELECT * FROM public.vendor`;
    const conditions = [];
    const params = [];

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`is_active = $${params.length}`);
    }

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
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
};

// GET ONE (by primary key `id`)
// Route should now be something like: GET /api/vendors/:id
const getvendorByvendorId = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM public.vendor WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'vendor not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
};

// UPDATE VENDOR (by primary key `id`)
// Route should now be something like: PUT /api/vendors/:id
const updatevendors = async (req, res) => {
  const { id } = req.params;

  const updatableFields = [
    "vendor_name",
    "address",
    "contact_person_name",
    "contact_person_mobile_no",
    "email_id",
    "gst_registration_or_pan_no",
    "gst_or_pan_certificate",
    "msme_registration_no",
    "msme_certificate",
    "bank_account_no",
    "ifsc_code",
    "bank_details_proof",
    "notes_or_remarks",
    "verification_status",
    "project_code",
    "updated_by"
    // "is_active" // Uncomment if your table has this column
  ];

  const body = { ...req.body };
  if (typeof body.project_code === "string") {
    body.project_code = body.project_code.trim();
  }

  // Get only allowed fields
  const fieldsToUpdate = Object.keys(body).filter((key) =>
    updatableFields.includes(key)
  );

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid fields provided to update."
    });
  }

  // Create SET clause
  const setClause = fieldsToUpdate
    .map((field, index) => `${field} = $${index + 1}`)
    .join(", ");

  const values = fieldsToUpdate.map((field) => body[field]);

  try {
    const result = await pool.query(
      `UPDATE public.vendor
       SET
         ${setClause}
       WHERE id = $${fieldsToUpdate.length + 1}
       RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found."
      });
    }

    res.status(200).json({
      success: true,
      message: "Vendor updated successfully.",
      data: result.rows[0]
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to update vendor."
    });
  }
};

module.exports = {
  createVendor,
  createVendorsBulk,
  getvendors,
  getvendorByvendorId,
  updatevendors
};