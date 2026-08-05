const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const {
  getAllModules,
  getModuleById,
  updateModule,
} = require("../controllers/Authentication/appModuleController");

router.get("/", authMiddleware, getAllModules);
router.get("/:module_id", authMiddleware, getModuleById);
router.put("/:module_id", authMiddleware, requireRole("admin"), updateModule);

module.exports = router;