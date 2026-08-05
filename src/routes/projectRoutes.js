const express = require("express");
const router = express.Router();

const { authMiddleware } = require("../middleware/authMiddleware");

const {
  createProject,
  getProjects,
  getProjectByCode,
  updateProject,
} = require("../controllers/ProjectModule/projectController");

router.post("/", authMiddleware, createProject);
router.get("/", authMiddleware, getProjects);
router.get("/:project_code", authMiddleware, getProjectByCode);
router.put("/:project_code", authMiddleware, updateProject);

module.exports = router;