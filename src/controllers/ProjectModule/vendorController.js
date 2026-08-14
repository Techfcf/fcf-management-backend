// controllers/projectController.js
const pool = require("../../config/db");

/* ---------------- SHARED VALIDATION ---------------- */
const allowedStatus = ["Verification Pending", "Verified Successfully"];
const allowedYesNo = ["Yes", "No"];

// NOTE: vendor_id is no longer accepted from the client — it is
// auto-generated on the server (see generateVendorId below), so it is
// intentionally NOT validated/required here anymore.
const validateVendorRow = (row) => {
  let {
    vendor_name,
    contact_person_mobile_no,
    email_id,
    ifsc_code,
    verification_status,
    project_code,
    gst_or_pan_certificate,
    msme_certificate,
    bank_details_proof,
  } = row;

  vendor_name = vendor_name?.trim();
  email_id = email_id?.trim();

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

  // gst_or_pan_certificate / msme_certificate / bank_details_proof are now
  // simple Yes/No flags (previously free-text URLs)
  if (gst_or_pan_certificate && !allowedYesNo.includes(gst_or_pan_certificate)) {
    return "GST / PAN Certificate must be Yes or No";
  }

  if (msme_certificate && !allowedYesNo.includes(msme_certificate)) {
    return "MSME Certificate must be Yes or No";
  }

  if (bank_details_proof && !allowedYesNo.includes(bank_details_proof)) {
    return "Bank Details Proof must be Yes or No";
  }

  // project_code is now a plain VARCHAR column, so it must be a simple string
  if (project_code !== undefined && project_code !== null && typeof project_code !== "string") {
    return "project_code must be a string";
  }

  return null; // no errors
};

/* ---------------- VENDOR ID AUTO-GENERATION ---------------- */
// Generates the next sequential vendor_id, e.g. VEN-0001, VEN-0002, ...
// based on the highest existing numeric suffix currently in the table.
const generateVendorId = async () => {
  const result = await pool.query(
    `SELECT vendor_id FROM public.vendor
     WHERE vendor_id ~ '^VEN-[0-9]+$'
     ORDER BY (regexp_replace(vendor_id, '\\D', '', 'g'))::bigint DESC
     LIMIT 1`
  );

  let nextNumber = 1;
  if (result.rows.length > 0) {
    const match = result.rows[0].vendor_id.match(/(\d+)$/);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }

  return `VEN-${String(nextNumber).padStart(4, "0")}`;
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

// Inserts a row with an auto-generated vendor_id, retrying a few times in
// case of a rare unique-constraint collision from concurrent requests.
const insertVendorRowWithGeneratedId = async (row, maxAttempts = 5) => {
  let lastErr;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const vendor_id = await generateVendorId();

    try {
      return await insertVendorRow({ ...row, vendor_id });
    } catch (err) {
      if (err.code === "23505") {
        // vendor_id collision (e.g. concurrent insert) — regenerate and retry
        lastErr = err;
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error("Failed to generate a unique vendor_id");
};

const createVendor = async (req, res) => {
  let {
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
    // NOTE: vendor_id and created_by are intentionally NOT read from
    // req.body — vendor_id is always auto-generated on the server, and
    // created_by always comes from the authenticated user (below), never
    // from client input.
  } = req.body;

  // Comes from the auth middleware (JWT/passport), not from the client.
  const created_by = req.user?.id;

  if (!created_by) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: missing logged-in user",
    });
  }

  // Remove extra spaces
  vendor_name = vendor_name?.trim();
  email_id = email_id?.trim();
  project_code = project_code?.trim();

  const validationError = validateVendorRow({
    vendor_name,
    contact_person_mobile_no,
    email_id,
    ifsc_code,
    verification_status,
    project_code,
    gst_or_pan_certificate,
    msme_certificate,
    bank_details_proof,
  });

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError
    });
  }

  try {
    const inserted = await insertVendorRowWithGeneratedId({
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
        message: "Could not generate a unique Vendor ID, please try again"
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
// Body: { vendors: [ {vendor_name, ...}, ... ] }
// Each row is validated and inserted independently, so one bad row does not
// block the rest of the batch from being saved. vendor_id is auto-generated
// per row on the server, the same as single-create.
const createVendorsBulk = async (req, res) => {
  const { vendors } = req.body;

  if (!Array.isArray(vendors) || vendors.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Request body must include a non-empty 'vendors' array"
    });
  }

  // Comes from the auth middleware (JWT/passport), not from the client.
  const created_by = req.user?.id;

  if (!created_by) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: missing logged-in user",
    });
  }

  const inserted = [];
  const failed = [];

  for (let i = 0; i < vendors.length; i++) {
    const raw = vendors[i];

    // vendor_id and created_by from the incoming payload (if any) are
    // ignored — vendor_id is always auto-generated, created_by always
    // comes from the authenticated user.
    const { vendor_id: _ignoredVendorId, created_by: _ignoredCreatedBy, ...rest } = raw;

    const row = {
      ...rest,
      vendor_name: raw.vendor_name?.trim(),
      email_id: raw.email_id?.trim(),
      project_code: raw.project_code?.trim(),
      created_by,
    };

    const validationError = validateVendorRow(row);

    if (validationError) {
      failed.push({
        row: i,
        message: validationError,
      });
      continue;
    }

    try {
      const savedRow = await insertVendorRowWithGeneratedId(row);
      inserted.push(savedRow);
    } catch (err) {
      console.error(err);

      const message =
        err.code === "23505"
          ? "Could not generate a unique Vendor ID, please try again"
          : "Failed to create vendor";

      failed.push({
        row: i,
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

// GET ONE (by vendor_id, not the internal primary key)
// Route should now be something like: GET /api/vendors/:vendor_id
const getvendorByvendorId = async (req, res) => {
  const { vendor_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM public.vendor WHERE vendor_id = $1`,
      [vendor_id]
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

// UPDATE VENDOR (by vendor_id, not the internal primary key)
// Route should now be something like: PUT /api/vendors/:vendor_id
// The vendor_id itself is NOT in updatableFields — it is immutable once generated.
const updatevendors = async (req, res) => {
  const { vendor_id } = req.params;

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

  // Comes from the auth middleware (JWT/passport), not from the client.
  const updated_by = req.user?.id;

  if (!updated_by) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: missing logged-in user",
    });
  }

  const body = { ...req.body, updated_by };
  if (typeof body.project_code === "string") {
    body.project_code = body.project_code.trim();
  }

  // Never allow vendor_id to be changed via update, even if sent
  delete body.vendor_id;

  if (body.gst_or_pan_certificate && !allowedYesNo.includes(body.gst_or_pan_certificate)) {
    return res.status(400).json({
      success: false,
      message: "GST / PAN Certificate must be Yes or No"
    });
  }

  if (body.msme_certificate && !allowedYesNo.includes(body.msme_certificate)) {
    return res.status(400).json({
      success: false,
      message: "MSME Certificate must be Yes or No"
    });
  }

  if (body.bank_details_proof && !allowedYesNo.includes(body.bank_details_proof)) {
    return res.status(400).json({
      success: false,
      message: "Bank Details Proof must be Yes or No"
    });
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
       WHERE vendor_id = $${fieldsToUpdate.length + 1}
       RETURNING *`,
      [...values, vendor_id]
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