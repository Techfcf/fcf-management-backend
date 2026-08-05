const pool = require('../../config/db'); // apna db pool path check kar lena

// ------------------------------------------------------
// Helper - Ek single agreement insert karne ke liye query + values banata hai
// ------------------------------------------------------
const buildInsertValues = (item, fallbackCreatedBy) => {
  const {
    project_code,
    vender_name,
    agreement_name_and_title,
    total_contract_or_po_amount,
    total_po_adjustment,
    balance_po_amount,
    agreement_start_date,
    agreement_end_date,
    po_no,
    status_of_agreement,
    vendor_id,
    merge_details,
    created_by
  } = item;

  return [
    project_code,
    vender_name,
    agreement_name_and_title,
    total_contract_or_po_amount,
    total_po_adjustment,
    balance_po_amount,
    agreement_start_date,
    agreement_end_date,
    po_no,
    status_of_agreement,
    vendor_id,
    merge_details,
    created_by || fallbackCreatedBy
  ];
};

const INSERT_QUERY = `
  INSERT INTO public.vendor_agreement (
    project_code,
    vender_name,
    agreement_name_and_title,
    total_contract_or_po_amount,
    total_po_adjustment,
    balance_po_amount,
    agreement_start_date,
    agreement_end_date,
    po_no,
    status_of_agreement,
    vendor_id,
    merge_details,
    created_by,
    updated_by
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
  RETURNING *;
`;

// ------------------------------------------------------
// CREATE - Naya vendor agreement add karna (SINGLE + BULK dono support)
//
// Single: req.body = { project_code, vender_name, ... }
// Bulk:   req.body = { agreements: [ {...}, {...}, ... ] }
//         ya seedha req.body = [ {...}, {...} ]  (array)
// ------------------------------------------------------
exports.createVendorAgreement = async (req, res) => {
  // Bulk detect karna - array root pe ya `agreements` key ke andar
  const isBulk = Array.isArray(req.body) || Array.isArray(req.body.agreements);
  const items = Array.isArray(req.body) ? req.body : req.body.agreements;

  if (isBulk) {
    return createBulkVendorAgreements(items, req, res);
  }

  // ---------------- SINGLE CREATE (jaisa pehle tha) ----------------
  try {
    const {
      project_code,
      agreement_start_date,
    } = req.body;

    if (!project_code || !agreement_start_date) {
      return res.status(400).json({
        success: false,
        message: 'project_code, agreement_start_date  required hain'
      });
    }

    const values = buildInsertValues(req.body, req.body.created_by);

    const result = await pool.query(INSERT_QUERY, values);

    return res.status(201).json({
      success: true,
      message: 'Vendor agreement create ho gaya',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error in createVendorAgreement:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating vendor agreement',
      error: error.message
    });
  }
};

// ------------------------------------------------------
// BULK CREATE - Internal helper (transaction ke andar sab insert)
// Agar ek bhi record invalid hua toh sab rollback ho jayega
// ------------------------------------------------------
const createBulkVendorAgreements = async (items, req, res) => {
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Bulk create ke liye "agreements" array required hai aur khali nahi hona chahiye'
    });
  }

  // Common created_by agar top level pe diya ho (bulk ke case me)
  const fallbackCreatedBy = req.body.created_by;

  // Pehle validate kar lo sabko, taki DB call se pehle hi pata chal jaye
  const errors = [];
  items.forEach((item, index) => {
    if (!item.project_code || !item.agreement_start_date) {
      errors.push({
        index,
        message: 'project_code aur agreement_start_date required hain'
      });
    }
  });

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Kuch records invalid hain, koi bhi record insert nahi hua',
      errors
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insertedRows = [];

    for (const item of items) {
      const values = buildInsertValues(item, fallbackCreatedBy);
      const result = await client.query(INSERT_QUERY, values);
      insertedRows.push(result.rows[0]);
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: `${insertedRows.length} vendor agreements create ho gaye`,
      count: insertedRows.length,
      data: insertedRows
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in createBulkVendorAgreements:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while bulk creating vendor agreements, sab rollback ho gaya',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// ------------------------------------------------------
// GET ALL - Saare vendor agreements (with pagination + filters)
// ------------------------------------------------------
exports.getAllVendorAgreements = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      project_code,
      vender_name,
      status_of_agreement,
      is_active
    } = req.query;

    const offset = (page - 1) * limit;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (project_code) {
      conditions.push(`project_code = $${idx++}`);
      values.push(project_code);
    }
    if (vender_name) {
      conditions.push(`vender_name ILIKE $${idx++}`);
      values.push(`%${vender_name}%`);
    }
    if (status_of_agreement) {
      conditions.push(`status_of_agreement = $${idx++}`);
      values.push(status_of_agreement);
    }
    if (is_active !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      values.push(is_active === 'true');
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*)::INT AS total FROM public.vendor_agreement ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = countResult.rows[0].total;

    const dataQuery = `
      SELECT * FROM public.vendor_agreement
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    values.push(limit, offset);

    const result = await pool.query(dataQuery, values);

    return res.status(200).json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: result.rows
    });
  } catch (error) {
    console.error('Error in getAllVendorAgreements:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching vendor agreements',
      error: error.message
    });
  }
};

// ------------------------------------------------------
// GET BY ID - Single vendor agreement
// ------------------------------------------------------
exports.getVendorAgreementById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM public.vendor_agreement WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor agreement nahi mila'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error in getVendorAgreementById:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching vendor agreement',
      error: error.message
    });
  }
};

// ------------------------------------------------------
// UPDATE - Vendor agreement update karna
// ------------------------------------------------------
exports.updateVendorAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      project_code,
      vender_name,
      agreement_name_and_title,
      total_contract_or_po_amount,
      total_po_adjustment,
      balance_po_amount,
      agreement_start_date,
      agreement_end_date,
      po_no,
      status_of_agreement,
      vendor_id,
      merge_details,
      updated_by,
      is_active
    } = req.body;

    const existing = await pool.query(
      'SELECT id FROM public.vendor_agreement WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor agreement nahi mila'
      });
    }

    const query = `
      UPDATE public.vendor_agreement SET
        project_code = COALESCE($1, project_code),
        vender_name = COALESCE($2, vender_name),
        agreement_name_and_title = COALESCE($3, agreement_name_and_title),
        total_contract_or_po_amount = COALESCE($4, total_contract_or_po_amount),
        total_po_adjustment = COALESCE($5, total_po_adjustment),
        balance_po_amount = COALESCE($6, balance_po_amount),
        agreement_start_date = COALESCE($7, agreement_start_date),
        agreement_end_date = COALESCE($8, agreement_end_date),
        po_no = COALESCE($9, po_no),
        status_of_agreement = COALESCE($10, status_of_agreement),
        vendor_id = COALESCE($11, vendor_id),
        merge_details = COALESCE($12, merge_details),
        updated_by = COALESCE($13, updated_by),
        is_active = COALESCE($14, is_active),
        updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE id = $15
      RETURNING *;
    `;

    const values = [
      project_code,
      vender_name,
      agreement_name_and_title,
      total_contract_or_po_amount,
      total_po_adjustment,
      balance_po_amount,
      agreement_start_date,
      agreement_end_date,
      po_no,
      status_of_agreement,
      vendor_id,
      merge_details,
      updated_by,
      is_active,
      id
    ];

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      message: 'Vendor agreement update ho gaya',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error in updateVendorAgreement:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating vendor agreement',
      error: error.message
    });
  }
};