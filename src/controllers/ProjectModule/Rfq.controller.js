const pool = require("../../config/db"); // pg Pool
const nodemailer = require("nodemailer");
const { buildRfqEmailHtml } = require("../../templates/rfqEmailTemplate");

const RFQ_TABLE = "public.rfq";
const RFQ_ITEMS_TABLE = "public.rfq_items";

/* ---------------- HELPERS ---------------- */

// Postgres can't cast "" to numeric/date columns -> convert "" to null.
const sanitizeEmptyValues = (row) => {
  const clean = { ...row };
  for (const key of Object.keys(clean)) {
    if (clean[key] === "") clean[key] = null;
  }
  return clean;
};

const nowEpoch = () => Math.floor(Date.now() / 1000);

// rfq.rfq_number is NOT NULL + UNIQUE but has no DB default, so we
// generate it ourselves from the identity id right after insert:
// insert with a temp unique placeholder -> get id -> update to RFQ-00001.
const generateRfqNumberFromId = (id) => `RFQ-${String(id).padStart(5, "0")}`;

// Formats a date for the vendor email. Handles Date objects, ISO strings,
// AND epoch numbers (in case a column stores unix seconds, like created_at
// elsewhere in this file uses nowEpoch()).
const formatDate = (date) => {
  if (!date) return "-";
  const d = typeof date === "number" ? new Date(date * 1000) : new Date(date);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }); // e.g. "21 Aug 2026"
};

const validateRfqHeader = (row) => {
  if (!row.project_code?.trim()) return "project_code is required";
  if (!row.project_budget_id) return "project_budget_id is required";
  if (!row.section?.trim()) return "section is required";
  if (!row.vendor_id?.trim()) return "vendor_id is required";
  return null;
};

const validateRfqItem = (item) => {
  if (!item.budget_item_id) return "budget_item_id is required for each item";
  if (!item.section?.trim()) return "section is required for each item";
  if (!item.particulars?.trim()) return "particulars is required for each item";
  return null;
};

const translateDbError = (err, res) => {
  console.error(err);

  if (err.code === "23505") {
    return res.status(409).json({ success: false, message: "Duplicate value violates a unique constraint (e.g. rfq_number)." });
  }
  if (err.code === "23502") {
    return res.status(400).json({ success: false, message: `Column "${err.column}" is required (NOT NULL) but no value was sent.` });
  }
  if (err.code === "23503") {
    return res.status(400).json({ success: false, message: `Invalid reference: ${err.detail || err.message}` });
  }

  return res.status(500).json({ success: false, message: "Something went wrong." });
};

/* =========================================================
   STEP 1 / STEP 2 HELPERS — dropdowns for the "create RFQ" UI
   ========================================================= */

// GET /api/rfq/meta/budgets?project_code=PRJ-01
// Step 1: user picks budget_number + budget_name
// Returns budgets AND vendors in one response — no join, no matching needed.
const getBudgetsForSelection = async (req, res) => {
  const { project_code } = req.query;
  try {
    // Budgets
    let budgetQuery = `SELECT id, budget_number, budget_name, project_code
                        FROM public.project_budget
                        WHERE is_active = true`;
    const params = [];
    if (project_code) {
      params.push(project_code);
      budgetQuery += ` AND project_code = $${params.length}`;
    }
    budgetQuery += ` ORDER BY budget_number ASC`;

    // Vendors (plain list, no matching/join with budgets)
    const vendorQuery = `SELECT vendor_id, vendor_name, email_id
                          FROM public.vendor
                          WHERE is_active = true
                          ORDER BY vendor_name ASC`;

    const [budgetResult, vendorResult] = await Promise.all([
      pool.query(budgetQuery, params),
      pool.query(vendorQuery),
    ]);

    res.json({
      success: true,
      data: budgetResult.rows,
      vendors: vendorResult.rows,
    });
  } catch (err) {
    translateDbError(err, res);
  }
};

// GET /api/rfq/meta/budgets/:budgetId/items
// Step 2: after budget chosen, list its budget items to build rfq_items from
const getBudgetItemsForBudget = async (req, res) => {
  const { budgetId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, section, category, sub_category, particulars, unit, quantity
       FROM public.project_budget_items
       WHERE project_budget_id = $1 AND is_active = true
       ORDER BY id ASC`,
      [budgetId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    translateDbError(err, res);
  }
};

/* =========================================================
   CREATE — RFQ header + items in a single transaction
   Body:
   {
     project_code, project_budget_id, section, category, vendor_id,
     rfq_title, rfq_date, status, remarks, created_by,
     items: [
       { budget_item_id, section, category, sub_category, particulars, unit, quantity }
     ]
   }
   ========================================================= */
const createRFQ = async (req, res) => {
  const body = sanitizeEmptyValues({ ...req.body });
  const items = Array.isArray(body.items) ? body.items : [];
  delete body.items;

  const headerError = validateRfqHeader(body);
  if (headerError) {
    return res.status(400).json({ success: false, message: headerError });
  }

  for (const item of items) {
    const itemError = validateRfqItem(sanitizeEmptyValues(item));
    if (itemError) {
      return res.status(400).json({ success: false, message: itemError });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tempNumber = `TEMP-${Date.now()}`;
    const insertHeaderResult = await client.query(
      `INSERT INTO ${RFQ_TABLE}
        (rfq_number, project_code, project_budget_id, section, category,
         vendor_id, rfq_title, rfq_date, status, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,CURRENT_DATE),COALESCE($9,'DRAFT'),$10,$11)
       RETURNING *`,
      [
        tempNumber,
        body.project_code,
        body.project_budget_id,
        body.section,
        body.category ?? null,
        body.vendor_id,
        body.rfq_title ?? null,
        body.rfq_date ?? null,
        body.status ?? null,
        body.remarks ?? null,
        body.created_by ?? null,
      ]
    );

    let rfq = insertHeaderResult.rows[0];
    const rfqNumber = generateRfqNumberFromId(rfq.id);

    const updateNumberResult = await client.query(
      `UPDATE ${RFQ_TABLE} SET rfq_number = $1 WHERE id = $2 RETURNING *`,
      [rfqNumber, rfq.id]
    );
    rfq = updateNumberResult.rows[0];

    const insertedItems = [];
    for (const rawItem of items) {
      const item = sanitizeEmptyValues(rawItem);
      const itemResult = await client.query(
        `INSERT INTO ${RFQ_ITEMS_TABLE}
          (rfq_id, budget_item_id, section, category, sub_category, particulars, unit, quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          rfq.id,
          item.budget_item_id,
          item.section,
          item.category ?? null,
          item.sub_category ?? null,
          item.particulars,
          item.unit ?? null,
          item.quantity ?? null,
        ]
      );
      insertedItems.push(itemResult.rows[0]);
    }

    await client.query("COMMIT");

    // Notify the vendor by email that a new RFQ has been raised.
    // This runs AFTER commit and is wrapped separately so an email
    // failure never rolls back or fails the RFQ creation itself.
    try {
      const vendorResult = await pool.query(
        `SELECT vendor_name, email_id FROM public.vendor WHERE vendor_id = $1`,
        [rfq.vendor_id]
      );
      const vendor = vendorResult.rows[0];

      if (vendor?.email_id) {
        await sendRfqNotificationEmail(vendor.email_id, vendor.vendor_name, { ...rfq, items: insertedItems });
      } else {
        console.warn(`No email found for vendor_id=${rfq.vendor_id}, skipped RFQ notification email.`);
      }
    } catch (mailErr) {
      console.error("Failed to send RFQ notification email:", mailErr);
    }

    res.status(201).json({
      success: true,
      message: "RFQ created successfully",
      data: { ...rfq, items: insertedItems },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    translateDbError(err, res);
  } finally {
    client.release();
  }
};

/* ---------------- GET ALL (header only, paginated) ---------------- */
// GET /api/rfq?page=1&limit=20&project_code=PRJ-01&status=DRAFT&vendor_id=V1
const getRFQs = async (req, res) => {
  const { page = 1, limit = 20, project_code, status, vendor_id, include_inactive } = req.query;
  const offset = (page - 1) * limit;

  try {
    const conditions = [];
    const params = [];

    if (!include_inactive) conditions.push(`is_active = true`);
    if (project_code) {
      params.push(project_code);
      conditions.push(`project_code = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (vendor_id) {
      params.push(vendor_id);
      conditions.push(`vendor_id = $${params.length}`);
    }

    let query = `SELECT * FROM ${RFQ_TABLE}`;
    if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    translateDbError(err, res);
  }
};

/* ---------------- GET ONE (header + items) ---------------- */
// GET /api/rfq/:id  (":id" = rfq.id, numeric)
const getRFQById = async (req, res) => {
  const { id } = req.params;
  try {
    const headerResult = await pool.query(`SELECT * FROM ${RFQ_TABLE} WHERE id = $1`, [id]);
    if (headerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "RFQ not found" });
    }

    const itemsResult = await pool.query(
      `SELECT * FROM ${RFQ_ITEMS_TABLE} WHERE rfq_id = $1 AND is_active = true ORDER BY id ASC`,
      [id]
    );

    res.json({ success: true, data: { ...headerResult.rows[0], items: itemsResult.rows } });
  } catch (err) {
    translateDbError(err, res);
  }
};

/* ---------------- UPDATE HEADER ---------------- */
// PUT /api/rfq/:id
// rfq_number, id, created_at, created_by are never editable here.
const UPDATABLE_HEADER_FIELDS = [
  "project_code", "project_budget_id", "section", "category",
  "vendor_id", "rfq_title", "rfq_date", "status", "remarks", "sent_at",
];

const updateRFQ = async (req, res) => {
  const { id } = req.params;
  const body = sanitizeEmptyValues({ ...req.body });

  const fields = Object.keys(body).filter((f) => UPDATABLE_HEADER_FIELDS.includes(f));
  if (fields.length === 0) {
    return res.status(400).json({ success: false, message: "No valid fields provided to update." });
  }

  const setClause = fields
    .map((field, index) => `"${field}" = $${index + 1}`)
    .concat([`"updated_at" = $${fields.length + 1}`])
    .join(", ");
  const values = fields.map((f) => body[f] ?? null);

  try {
    const result = await pool.query(
      `UPDATE ${RFQ_TABLE} SET ${setClause} WHERE id = $${fields.length + 2} RETURNING *`,
      [...values, nowEpoch(), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "RFQ not found." });
    }
    res.json({ success: true, message: "RFQ updated successfully", data: result.rows[0] });
  } catch (err) {
    translateDbError(err, res);
  }
};

/* ---------------- SOFT DELETE HEADER (cascades soft-delete to items) ---------------- */
// DELETE /api/rfq/:id
const deleteRFQ = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE ${RFQ_TABLE} SET is_active = false, updated_at = $1 WHERE id = $2 RETURNING *`,
      [nowEpoch(), id]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "RFQ not found." });
    }

    await client.query(
      `UPDATE ${RFQ_ITEMS_TABLE} SET is_active = false, updated_at = $1 WHERE rfq_id = $2`,
      [nowEpoch(), id]
    );

    await client.query("COMMIT");
    res.json({ success: true, message: "RFQ deleted (soft) successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    translateDbError(err, res);
  } finally {
    client.release();
  }
};

/* =========================================================
   RFQ ITEMS — standalone add/update/delete (after RFQ already exists)
   ========================================================= */

// POST /api/rfq/:id/items
const addRfqItem = async (req, res) => {
  const { id } = req.params; // rfq_id
  const item = sanitizeEmptyValues({ ...req.body });

  const itemError = validateRfqItem(item);
  if (itemError) return res.status(400).json({ success: false, message: itemError });

  try {
    const result = await pool.query(
      `INSERT INTO ${RFQ_ITEMS_TABLE}
        (rfq_id, budget_item_id, section, category, sub_category, particulars, unit, quantity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [id, item.budget_item_id, item.section, item.category ?? null, item.sub_category ?? null, item.particulars, item.unit ?? null, item.quantity ?? null]
    );
    res.status(201).json({ success: true, message: "Item added", data: result.rows[0] });
  } catch (err) {
    translateDbError(err, res);
  }
};

const UPDATABLE_ITEM_FIELDS = ["budget_item_id", "section", "category", "sub_category", "particulars", "unit", "quantity"];

// PUT /api/rfq/:id/items/:itemId
const updateRfqItem = async (req, res) => {
  const { id, itemId } = req.params;
  const body = sanitizeEmptyValues({ ...req.body });

  const fields = Object.keys(body).filter((f) => UPDATABLE_ITEM_FIELDS.includes(f));
  if (fields.length === 0) {
    return res.status(400).json({ success: false, message: "No valid fields provided to update." });
  }

  const setClause = fields
    .map((field, index) => `"${field}" = $${index + 1}`)
    .concat([`"updated_at" = $${fields.length + 1}`])
    .join(", ");
  const values = fields.map((f) => body[f] ?? null);

  try {
    const result = await pool.query(
      `UPDATE ${RFQ_ITEMS_TABLE} SET ${setClause}
       WHERE id = $${fields.length + 2} AND rfq_id = $${fields.length + 3}
       RETURNING *`,
      [...values, nowEpoch(), itemId, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "RFQ item not found." });
    }
    res.json({ success: true, message: "Item updated", data: result.rows[0] });
  } catch (err) {
    translateDbError(err, res);
  }
};

// DELETE /api/rfq/:id/items/:itemId  (soft delete)
const deleteRfqItem = async (req, res) => {
  const { id, itemId } = req.params;
  try {
    const result = await pool.query(
      `UPDATE ${RFQ_ITEMS_TABLE} SET is_active = false, updated_at = $1
       WHERE id = $2 AND rfq_id = $3 RETURNING *`,
      [nowEpoch(), itemId, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "RFQ item not found." });
    }
    res.json({ success: true, message: "Item deleted (soft) successfully" });
  } catch (err) {
    translateDbError(err, res);
  }
};

/* =========================================================
   SEND RFQ — plain notification email to vendor (no PDF/attachment)
   ========================================================= */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// Sent automatically right after an RFQ is created — just a plain
// notification (no PDF), telling the vendor to go check it in the
// Quotation module and respond from there.
const sendRfqNotificationEmail = async (vendorEmail, vendorName, rfq) => {
  const html = buildRfqEmailHtml({
    rfqNumber: rfq.rfq_number,
    vendorName: vendorName || "Vendor",
    projectName: rfq.project_name || rfq.project?.project_name || "-",
    projectCode: rfq.project_code,
    section: rfq.section,
    rfqDate: formatDate(rfq.created_at || new Date()),
    submissionDeadline: rfq.deadline ? formatDate(rfq.deadline) : undefined,
    viewRfqUrl: `${process.env.APP_URL}/rfq/${rfq.id}`, // apna frontend RFQ view route yahan
    items: (rfq.items || []).map((it) => ({
      particulars: it.particulars,
      category: it.category,
      quantity: it.quantity,
      unit: it.unit,
    })),
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: vendorEmail,
    subject: `New RFQ Received — ${rfq.rfq_number}`,
    html, // ← styled template ab yahan use ho raha hai
    text: `Dear ${vendorName || "Vendor"},

Someone has sent you an RFQ on the FCF-Management (FitClimate) application, under the Quotation module.

RFQ Number: ${rfq.rfq_number}
Section: ${rfq.section}${rfq.category ? `\nCategory: ${rfq.category}` : ""}${rfq.rfq_title ? `\nTitle: ${rfq.rfq_title}` : ""}

Please log in, check the RFQ, and send your quotation using the Quotation module.

Regards,
FCF-Management Team`, // fallback for clients that can't render HTML
  });
};

const getRfqWithItemsAndVendor = async (rfqId) => {
  const headerResult = await pool.query(
    `SELECT r.*, v.vendor_name, v.email_id AS email
     FROM ${RFQ_TABLE} r
     JOIN public.vendor v ON v.vendor_id = r.vendor_id
     WHERE r.id = $1`,
    [rfqId]
  );
  if (headerResult.rows.length === 0) return null;

  const itemsResult = await pool.query(
    `SELECT * FROM ${RFQ_ITEMS_TABLE} WHERE rfq_id = $1 AND is_active = true ORDER BY id ASC`,
    [rfqId]
  );

  return { ...headerResult.rows[0], items: itemsResult.rows };
};

// POST /api/rfq/:id/send  Body: { email? } optional manual override
// Sends a plain text notification only (no PDF, no attachment) —
// same style of message as the auto-notification sent on create.
const sendRfq = async (req, res) => {
  const { id } = req.params;
  const manualEmail = req.body?.email?.trim();

  try {
    const rfq = await getRfqWithItemsAndVendor(id);
    if (!rfq) return res.status(404).json({ success: false, message: "RFQ not found" });

    const targetEmail = manualEmail || rfq.email;
    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        message: "No vendor email found. Pass 'email' in the request body or set it on the vendor record.",
      });
    }

    await sendRfqNotificationEmail(targetEmail, rfq.vendor_name, rfq);

    await pool.query(
      `UPDATE ${RFQ_TABLE} SET sent_at = $1, status = 'SENT', updated_at = $1 WHERE id = $2`,
      [nowEpoch(), id]
    );

    res.json({ success: true, message: `RFQ sent to ${targetEmail}` });
  } catch (err) {
    translateDbError(err, res);
  }
};

/* =========================================================
   VENDOR PORTAL — logged-in vendor ko sirf uske RFQs
   vendor_id JWT se aata hai (req.vendor.vendor_id), client se
   kabhi nahi liya jaata — isliye ek vendor doosre ka data
   nahi dekh sakta.
   ========================================================= */

// GET /api/vendor/rfq?page=1&limit=20&status=SENT
const getMyRFQs = async (req, res) => {
  const vendorId = req.vendor?.vendor_id;
  if (!vendorId) {
    return res.status(401).json({ success: false, message: "Vendor not authenticated" });
  }

  const { page = 1, limit = 20, status } = req.query;
  const offset = (page - 1) * limit;

  try {
    const conditions = [`vendor_id = $1`, `is_active = true`];
    const params = [vendorId];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    let query = `SELECT * FROM ${RFQ_TABLE} WHERE ${conditions.join(" AND ")}`;
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    translateDbError(err, res);
  }
};

// GET /api/vendor/rfq/:id  (header + items) — only if it belongs to this vendor
const getMyRFQById = async (req, res) => {
  const vendorId = req.vendor?.vendor_id;
  if (!vendorId) {
    return res.status(401).json({ success: false, message: "Vendor not authenticated" });
  }

  const { id } = req.params;
  try {
    // vendor_id check yahin query mein — 404 dega agar RFQ kisi aur vendor ka hai
    const headerResult = await pool.query(
      `SELECT * FROM ${RFQ_TABLE} WHERE id = $1 AND vendor_id = $2`,
      [id, vendorId]
    );
    if (headerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "RFQ not found" });
    }

    const itemsResult = await pool.query(
      `SELECT * FROM ${RFQ_ITEMS_TABLE} WHERE rfq_id = $1 AND is_active = true ORDER BY id ASC`,
      [id]
    );

    res.json({ success: true, data: { ...headerResult.rows[0], items: itemsResult.rows } });
  } catch (err) {
    translateDbError(err, res);
  }
};

module.exports = {
  getBudgetsForSelection,
  getBudgetItemsForBudget,
  createRFQ,
  getRFQs,
  getRFQById,
  updateRFQ,
  deleteRFQ,
  addRfqItem,
  updateRfqItem,
  deleteRfqItem,
  sendRfq,
  getMyRFQs,
  getMyRFQById,
};