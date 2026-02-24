import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import db from "./models/db.js";
import logger from "./utils/logger.js";

const MODULE_NAME = "SERVER";
const PORT = process.env.PORT || 5000;

// ============================
// ENVIRONMENT VALIDATION
// ============================
const requiredEnvVars = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET",
  "AWS_REGION",
  "S3_BUCKET_NAME"
];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error(MODULE_NAME, "Missing required environment variables", missingVars.join(", "));
  process.exit(1);
}

// ============================
// DATABASE CONNECTION TEST
// ============================
(async () => {
  try {
    await db.query("SELECT 1");
    logger.info(MODULE_NAME, "Database connected successfully");
  } catch (err) {
    logger.error(MODULE_NAME, "Database connection failed", err);
    process.exit(1);
  }
})();

// ============================
// START SERVER
// ============================
const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(MODULE_NAME, `Server running on port ${PORT}`, { environment: process.env.NODE_ENV || "development" });
});

// ============================
// GRACEFUL SHUTDOWN FOR PM2
// ============================
const gracefulShutdown = async (signal) => {
  logger.info(MODULE_NAME, `Shutdown signal received: ${signal}`);

  // Stop accepting new connections
  server.close(async () => {
    logger.info(MODULE_NAME, "HTTP server closed");

    try {
      await db.end();
      logger.info(MODULE_NAME, "Database connections closed");
      logger.info(MODULE_NAME, "Graceful shutdown completed");
      process.exit(0);
    } catch (err) {
      logger.error(MODULE_NAME, "Error during shutdown", err);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error(MODULE_NAME, "Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  logger.error(MODULE_NAME, "Uncaught Exception", err);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error(MODULE_NAME, "Unhandled Rejection", { reason });
  gracefulShutdown("UNHANDLED_REJECTION");
});
