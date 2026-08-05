const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");


const {
  createVendor,
  getvendors,
  getvendorByvendorId,
  createVendorsBulk,   // 👈 add this import
  updatevendors
} = require("../controllers/ProjectModule/vendorController");

// CREATE VENDOR
router.post("/", authMiddleware,createVendor);
router.post("/bulk", authMiddleware, createVendorsBulk);   // 👈 add this route


// GET ALL VENDORS
router.get("/", authMiddleware, getvendors);

// GET VENDOR BY ID
router.get("/:vendor_id",authMiddleware, getvendorByvendorId);

// UPDATE VENDOR
router.put("/:id", authMiddleware,updatevendors);

module.exports = router;