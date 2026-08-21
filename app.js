const express = require("express");
const cors = require("cors");

const authRoutes = require("./src/routes/authRoutes");
const projectRoutes = require("./src/routes/projectRoutes");
const vendorRoutes = require("./src/routes/vendorRoutes");
const vendorAgreementRoutes = require('./src/routes/vendoragreementroutes');
const poAdjustmentRoutes = require("./src/routes/poAdjustmentroutes");
const appModuleRoutes = require("./src/routes/appModuleRoutes");
const reimbursementsRoutes = require("./src/routes/reimbursementsRoutes");
const projectBudgetRoutes = require("./src/routes/Projectbudget.routes");
const rfqRoutes = require("./src/routes/rfq.routes");
const projectBudgetItemsRoutes = require("./src/routes/Projectbudgetitems.routes")









const app = express();

/**
 * Allowed Frontend Origins
 */
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://fcf-management-app.vercel.app",
  "https://fcf-management.fitclimate.com",
];

/**
 * CORS Configuration
 */
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman, curl, mobile apps (no Origin header)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS Error: ${origin} is not allowed.`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With"
    ]
  })
);

// Parse Request Body
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/vendors", vendorRoutes);
app.use('/api/vendor-agreements', vendorAgreementRoutes);
app.use("/api/po-adjustment", poAdjustmentRoutes);
app.use("/api/v1/app-module", appModuleRoutes);
app.use("/api/v1", reimbursementsRoutes);
app.use("/api/project-budgets", projectBudgetRoutes);
app.use("/api/rfq", rfqRoutes);
app.use("/api/project-budget-items",projectBudgetItemsRoutes);



// Health Check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "FCF Management Backend is Running"
  });
});

// 404 Route
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Error:", err.message);

  if (err.message.startsWith("CORS")) {
    return res.status(403).json({
      success: false,
      message: err.message
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request payload too large. Try uploading fewer rows at once."
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal Server Error"
  });
});

module.exports = app;