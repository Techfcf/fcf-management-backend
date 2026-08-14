const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");

const {
  createVendor,
  getvendors,
  getvendorByvendorId,
  createVendorsBulk,
  updatevendors
} = require("../controllers/ProjectModule/vendorController");

// CREATE VENDOR
router.post("/", authMiddleware, createVendor);
router.post("/bulk", authMiddleware, createVendorsBulk);

// GET ALL VENDORS
router.get("/", authMiddleware, getvendors);

// GET VENDOR BY vendor_id
router.get("/:vendor_id", authMiddleware, getvendorByvendorId);

// UPDATE VENDOR BY vendor_id
router.put("/:vendor_id", authMiddleware, updatevendors);

module.exports = router;