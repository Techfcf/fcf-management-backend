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
} = require("../controllers/ProjectModule/Projectbudget.controller");

// POST   /api/project-budgets        -> naya project budget banana
router.post("/", authMiddleware , createProjectBudget);

// POST   /api/project-budgets/bulk   -> multiple project budgets ek saath
router.post("/bulk", authMiddleware , createProjectBudgetsBulk);

// GET    /api/project-budgets        -> sab project budgets (pagination + project_code filter)
router.get("/", authMiddleware ,getProjectBudgets);

// GET    /api/project-budgets/:id    -> ek project budget ki details (by id)
router.get("/:id", authMiddleware ,getProjectBudgetById);

// PUT    /api/project-budgets/:id    -> project budget update karna (by id)
router.put("/:id",authMiddleware , updateProjectBudget);


module.exports = router;