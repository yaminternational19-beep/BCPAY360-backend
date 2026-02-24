import dotenv from "dotenv";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⬇️ FORCE load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import logger from "../utils/logger.js";

const MODULE_NAME = "DATABASE";

// ============================
// DATABASE CONNECTION POOL
// ============================
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // Production-optimized pool settings
  waitForConnections: true,
  connectionLimit: 20, // Increased for production traffic
  queueLimit: 0,
  connectTimeout: 10000, // 10 seconds
  acquireTimeout: 10000, // 10 seconds

  // Enable keep-alive for long-running connections
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// ============================
// CONNECTION TEST
// ============================
db.getConnection()
  .then((conn) => {
    logger.info(MODULE_NAME, "Database connection pool established");
    conn.release();
  })
  .catch((err) => {
    logger.error(MODULE_NAME, "Failed to establish database connection pool", err);
    process.exit(1);
  });

export default db;
