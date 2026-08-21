// routes/rfq.routes.js
const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");

const {
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
} = require("../controllers/ProjectModule/Rfq.controller");

/* ---- Step 1 & 2 helpers for the "create RFQ" UI ---- */
router.get("/meta/budgets", authMiddleware,getBudgetsForSelection);               // step 1: pick budget_number / budget_name
router.get("/meta/budgets/:budgetId/items", authMiddleware,getBudgetItemsForBudget); // step 2: pick items from that budget

/* ---- RFQ header CRUD ---- */
router.post("/", authMiddleware,createRFQ);          // create RFQ + items (transactional)
router.get("/", authMiddleware,getRFQs);             // list (paginated, filterable)
router.get("/:id", authMiddleware,getRFQById);       // get one (with items)
router.put("/:id", authMiddleware, updateRFQ);        // update header fields
router.delete("/:id", authMiddleware,deleteRFQ);     // soft delete (cascades to items)

/* ---- RFQ items (after RFQ already created) ---- */
router.post("/:id/items", authMiddleware,addRfqItem);
router.put("/:id/items/:itemId", authMiddleware, updateRfqItem);
router.delete("/:id/items/:itemId", authMiddleware,deleteRfqItem);

/* ---- Send RFQ (plain notification email, no PDF) ---- */
router.post("/:id/send", authMiddleware,sendRfq);

module.exports = router;