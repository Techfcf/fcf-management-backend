const express = require("express");
const router = express.Router();

const {
  createReimbursement,
  getReimbursements,
  updateReimbursement,
} = require("../controllers/ProjectModule/reimbursementsController");

const { authMiddleware } = require("../middleware/authMiddleware");

// Create
router.post("/reimbursements", authMiddleware, createReimbursement);

// Get All
router.get("/reimbursements", authMiddleware, getReimbursements);

// Get By ID
router.get("/reimbursements/:id", authMiddleware, getReimbursements);

// Update
router.put("/reimbursements/:id", authMiddleware, updateReimbursement);

module.exports = router;