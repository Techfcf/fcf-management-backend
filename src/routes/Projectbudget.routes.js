// routes/projectBudget.routes.js
const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");


const {
  createProjectBudget,
  createProjectBudgetsBulk,
  getProjectBudgets,
  getProjectBudgetById,
  updateProjectBudget,
  deleteProjectBudget,
} = require("../controllers/ProjectModule/Projectbudget.controller");

// POST   /api/project-budgets           -> create single budget header
router.post("/", authMiddleware,createProjectBudget);

// POST   /api/project-budgets/bulk      -> create multiple budget headers at once
router.post("/bulk", authMiddleware,createProjectBudgetsBulk);

// GET    /api/project-budgets           -> list (filters: project_code, status, financial_year, page, limit)
router.get("/", authMiddleware,getProjectBudgets);

// GET    /api/project-budgets/:id       -> single budget
router.get("/:id", authMiddleware,getProjectBudgetById);

// PUT    /api/project-budgets/:id       -> update budget (also handles status change)
router.put("/:id", authMiddleware,updateProjectBudget);

// DELETE /api/project-budgets/:id       -> soft delete
router.delete("/:id", authMiddleware,deleteProjectBudget);

module.exports = router;