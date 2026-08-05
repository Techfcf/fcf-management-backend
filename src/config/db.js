const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,

  // Neon requires SSL
  ssl: {
    rejectUnauthorized: false,
  },

  // Pool Configuration
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test database connection on startup
(async () => {
  let client;

  try {
    client = await pool.connect();
    console.log("✅ PostgreSQL Connected Successfully");

    const result = await client.query("SELECT NOW()");
    console.log("🕒 Database Time:", result.rows[0].now);

  } catch (err) {
    console.error("❌ Database Connection Error");
    console.error(err);
  } finally {
    if (client) client.release();
  }
})();

// Handle unexpected idle client errors
pool.on("error", (err) => {
  console.error("❌ Unexpected PostgreSQL Pool Error:", err);
});

module.exports = pool;