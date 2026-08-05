const express = require("express");
const router = express.Router();

const { authMiddleware } = require("../middleware/authMiddleware");

const {
  createPoAdjustment,
  createPoAdjustmentBulk,
  getPoAdjustment,
  getPoAdjustmentByVendorId,
  updatePoAdjustment,
} = require("../controllers/ProjectModule/poAdjustmentcontroller");

/**
 * Create Single PO Adjustment
 * POST /api/po-adjustment
 */
router.post("/", authMiddleware, createPoAdjustment);

/**
 * Bulk Create PO Adjustments
 * POST /api/po-adjustment/bulk
 */
router.post("/bulk", authMiddleware, createPoAdjustmentBulk);

/**
 * Get All PO Adjustments
 * GET /api/po-adjustment
 * Optional Query Params:
 * ?page=1&limit=20
 * ?project_code=FCF001
 * ?vendor_id=VID001
 * ?purchase_order_id=PO001
 */
router.get("/", authMiddleware, getPoAdjustment);

/**
 * Get PO Adjustments By Vendor ID
 * GET /api/po-adjustment/vendor/:vendorId
 */
router.get("/vendor/:vendorId", authMiddleware, getPoAdjustmentByVendorId);

/**
 * Update PO Adjustment
 * PUT /api/po-adjustment/:id
 */
router.put("/:id", authMiddleware, updatePoAdjustment);

module.exports = router;