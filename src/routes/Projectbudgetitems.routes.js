// routes/projectBudgetItems.routes.js
const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");

const {
  createProjectBudgetItem,
  createProjectBudgetItemsBulk,
  getProjectBudgetItems,
  getProjectBudgetItemById,
  updateProjectBudgetItem,
  deleteProjectBudgetItem,
} = require("../controllers/ProjectModule/Projectbudgetitems.controller");

// POST   /api/project-budget-items                       -> create single item
router.post("/", authMiddleware,createProjectBudgetItem);

// POST   /api/project-budget-items/bulk                  -> create multiple items at once
router.post("/bulk", authMiddleware,createProjectBudgetItemsBulk);

// GET    /api/project-budget-items/budget/:project_budget_id  -> items grouped by section
router.get("/budget/:project_budget_id", authMiddleware,getProjectBudgetItems);

// GET    /api/project-budget-items/:id                    -> single item
router.get("/:id", authMiddleware,getProjectBudgetItemById);

// PUT    /api/project-budget-items/:id                     -> update item
router.put("/:id",authMiddleware, updateProjectBudgetItem);

// DELETE /api/project-budget-items/:id                     -> soft delete item
router.delete("/:id",authMiddleware, deleteProjectBudgetItem);

module.exports = router;