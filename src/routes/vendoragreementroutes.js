const express = require('express');
const router = express.Router();

const {
  createVendorAgreement,
  getAllVendorAgreements,
  getVendorAgreementById,
  updateVendorAgreement,
} = require('../controllers/ProjectModule/vendoragreementcontroller');

const { authMiddleware } = require('../middleware/authMiddleware');

// ------------------------------------------------------
// Vendor Agreement Routes (Auth Protected)
// ------------------------------------------------------

// Create new vendor agreement (SINGLE ya BULK - req.body ke shape par depend karta hai)
router.post('/', authMiddleware, createVendorAgreement);

// Get all vendor agreements (pagination + filters supported)
router.get('/', authMiddleware, getAllVendorAgreements);

// Get single vendor agreement by id
router.get('/:id', authMiddleware, getVendorAgreementById);

// Update vendor agreement by id
router.put('/:id', authMiddleware, updateVendorAgreement);

module.exports = router;